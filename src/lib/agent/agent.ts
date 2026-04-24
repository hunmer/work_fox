import { createToolDiscoveryTools } from './tools'
import { listenToChatStream, type StreamCallbacks } from './stream'
import { BROWSER_AGENT_SYSTEM_PROMPT } from './system-prompt'
import { useAIProviderStore } from '@/stores/ai-provider'
import { WORKFLOW_TOOL_DEFINITIONS } from './workflow-tools'
import { buildWorkflowSystemPrompt } from './workflow-prompt'
import type { ChatCompletionParams } from '@/types'
import { wsBridge } from '@/lib/ws-bridge'

type ChatCompletionPayload = ChatCompletionParams

function toIpcPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

/** Agent 流式请求的可选配置 */
export interface AgentStreamOptions {
  /** 运行模式：浏览器模式（默认）或工作流模式 */
  mode?: 'browser' | 'workflow'
  /** 工作流 ID（仅 workflow 模式） */
  workflowId?: string
  /** 工作流摘要信息（仅 workflow 模式） */
  workflowSummary?: {
    id: string
    name: string
    description?: string
    nodes: Array<{ id: string; type: string; label: string }>
    edges: Array<{ id: string; source: string; target: string }>
  }
  /** 当前工作流启用的插件 ID 列表（仅 workflow 模式） */
  enabledPlugins?: string[]
  /** 工作流编辑模式：true=用 workflow-tools 创建节点，false=用插件工具直接运行（默认 true） */
  workflowEditMode?: boolean
  /** 工作流专属 runtime 参数 */
  runtime?: ChatCompletionParams['runtime']
  /** 当前选中的节点（用于聚焦上下文） */
  selectedNodes?: Array<{ id: string; type: string; label: string; data: Record<string, any> }> | null
}

/**
 * 通过 backend WS 代理运行 Agent 流式请求，必要时 fallback 到 Electron IPC。
 * 返回 requestId（用于 abort）和 cleanup（用于清理 IPC 监听器）。
 */
export async function runAgentStream(
  history: Array<{ role: string; content: string }>,
  input: string,
  images: string[] | undefined,
  callbacks: StreamCallbacks,
  targetTabId: string | null,
  enabledToolNames?: Set<string>,
  options?: AgentStreamOptions,
): Promise<{ requestId: string; cleanup: () => void }> {
  const providerStore = useAIProviderStore()
  const provider = providerStore.currentProvider
  const model = providerStore.currentModel

  if (!provider || !model) {
    callbacks.onError(new Error('请先配置 AI 供应商和模型'))
    return { requestId: '', cleanup: () => {} }
  }

  const isWorkflow = options?.mode === 'workflow'

  // 构造消息（含图片支持）
  const userContent = images?.length
    ? [
        ...images.map((img) => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: 'image/png' as const, data: img },
        })),
        { type: 'text' as const, text: input },
      ]
    : input

  // 工作流模式使用专用工具定义，浏览器模式使用工具发现系统
  const workflowEditMode = isWorkflow ? (options?.workflowEditMode !== false) : false
  const tools = isWorkflow
    ? [...WORKFLOW_TOOL_DEFINITIONS]
    : createToolDiscoveryTools()

  // 系统提示词
  const systemPrompt = isWorkflow
    ? buildWorkflowSystemPrompt(options!.workflowSummary!, options?.selectedNodes)
    : BROWSER_AGENT_SYSTEM_PROMPT

  const requestId = crypto.randomUUID()

  // 调试：输出发送给 AI 的工具列表
  const toolNames = tools.map((t: any) => t.name)
  console.log(`[Agent] 模式: ${isWorkflow ? 'workflow' : 'browser'}, 工作流编辑: ${workflowEditMode}, 工具数量: ${toolNames.length}`)
  console.log(`[Agent] 工具列表:`, toolNames)
  console.log(`[Agent] 系统提示词前200字:`, systemPrompt.slice(0, 200))

  // 监听流式回调
  const cleanup = listenToChatStream(requestId, callbacks)

  const normalizedHistory = history.filter((item, index, list) => {
    if (index !== list.length - 1) return true
    return item.role !== 'user' || item.content !== input
  })

  const payload: ChatCompletionPayload = toIpcPayload({
    _requestId: requestId,
    providerId: provider.id,
    modelId: model.id,
    system: systemPrompt,
    messages: [
      ...normalizedHistory.map((h) => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: userContent },
    ],
    tools: tools as unknown as Array<Record<string, unknown>>,
    stream: true,
    maxTokens: model.maxTokens || 4096,
    ...(isWorkflow
      ? {
          _mode: 'workflow' as const,
          _workflowId: options!.workflowId,
          runtime: {
            ...options?.runtime,
            enabledPlugins: options?.enabledPlugins,
          },
        }
      : {
          targetTabId: targetTabId ?? undefined,
          enabledToolNames: enabledToolNames ? Array.from(enabledToolNames) : undefined,
        }),
    ...(model.supportsThinking ? { thinking: { type: 'enabled' as const, budgetTokens: 2000 } } : {}),
  })

  try {
    await wsBridge.invoke('chat:completions', payload as any)
  } catch (error) {
    cleanup()
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }

  return { requestId, cleanup }
}
