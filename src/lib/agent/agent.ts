import { createToolDiscoveryTools } from './tools'
import { listenToChatStream, type StreamCallbacks } from './stream'
import { BROWSER_AGENT_SYSTEM_PROMPT } from './system-prompt'
import { useAIProviderStore } from '@/stores/ai-provider'
import { WORKFLOW_TOOL_DEFINITIONS } from './workflow-tools'
import { buildWorkflowSystemPrompt } from './workflow-prompt'
import { WORKFLOW_AGENT_SYSTEM_PROMPT, WORKFLOW_AGENT_TOOL_DEFINITIONS } from './workflow-agent-tools'
import type { ChatCompletionParams } from '@/types'
import { wsBridge } from '@/lib/ws-bridge'

type ChatCompletionPayload = ChatCompletionParams

function toIpcPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export interface AgentStreamOptions {
  mode?: 'browser' | 'workflow' | 'workflow-agent'
  workflowId?: string
  workflowSummary?: {
    id: string
    name: string
    description?: string
    nodes: Array<{ id: string; type: string; label: string }>
    edges: Array<{ id: string; source: string; target: string }>
  }
  enabledPlugins?: string[]
  workflowEditMode?: boolean
  runtime?: ChatCompletionParams['runtime']
  selectedNodes?: Array<{ id: string; type: string; label: string; data: Record<string, any> }> | null
}

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
    callbacks.onError(new Error('请先配置 AI 提供商和模型'))
    return { requestId: '', cleanup: () => {} }
  }

  const isWorkflow = options?.mode === 'workflow'
  const isWorkflowAgent = options?.mode === 'workflow-agent'

  const userContent = images?.length
    ? [
        ...images.map((img) => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: 'image/png' as const, data: img },
        })),
        { type: 'text' as const, text: input },
      ]
    : input

  const workflowEditMode = isWorkflow ? (options?.workflowEditMode !== false) : false
  const tools = isWorkflow
    ? [...WORKFLOW_TOOL_DEFINITIONS]
    : isWorkflowAgent
      ? [...WORKFLOW_AGENT_TOOL_DEFINITIONS]
      : createToolDiscoveryTools()

  const systemPrompt = isWorkflow
    ? buildWorkflowSystemPrompt(options!.workflowSummary!, options?.selectedNodes)
    : isWorkflowAgent
      ? WORKFLOW_AGENT_SYSTEM_PROMPT
      : BROWSER_AGENT_SYSTEM_PROMPT

  const requestId = crypto.randomUUID()
  const toolNames = tools.map((t: any) => t.name)
  console.log(`[Agent] 模式: ${options?.mode || 'browser'}, 工作流编辑: ${workflowEditMode}, 工具数量: ${toolNames.length}`)
  console.log('[Agent] 工具列表:', toolNames)
  console.log('[Agent] 系统提示词前200字:', systemPrompt.slice(0, 200))

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
    ...(isWorkflow || isWorkflowAgent
      ? {
          _mode: isWorkflowAgent ? 'workflow-agent' : 'workflow',
          _workflowId: options?.workflowId,
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
