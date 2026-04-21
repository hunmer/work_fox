import { listenToChatStream } from '@/lib/agent/stream'
import { useAIProviderStore } from '@/stores/ai-provider'

type AgentPermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'

export interface AgentRunWorkflowContext {
  workflowId?: string
  workflowName?: string
  workflowDescription?: string
  enabledPlugins?: string[]
}

export async function executeAgentRunTask(
  data: Record<string, any>,
  runtimeConfig?: AgentRunWorkflowContext,
): Promise<any> {
  const prompt = typeof data.prompt === 'string' ? data.prompt : ''
  if (!prompt.trim()) {
    throw new Error('agent_run 节点缺少 prompt')
  }

  const providerStore = useAIProviderStore()
  if (!providerStore.currentProvider || !providerStore.currentModel) {
    throw new Error('请先在聊天面板中选择 AI Provider 和模型')
  }

  let assistantText = ''
  const toolCalls: Array<Record<string, unknown>> = []
  let usage: { inputTokens: number; outputTokens: number } | null = null

  const additionalDirectories = normalizeDirectories(data.additionalDirectories)
  const requestId = crypto.randomUUID()
  const permissionMode = normalizePermissionMode(data.permissionMode)
  const systemSections = [
    '你是 WorkFox 工作流中的 Claude 执行型节点。',
    '回复使用中文。',
    '优先直接完成当前节点任务，并输出可供下游节点消费的结果。',
    runtimeConfig?.workflowName
      ? `当前工作流: ${runtimeConfig.workflowName}${runtimeConfig.workflowId ? ` (${runtimeConfig.workflowId})` : ''}`
      : '',
    typeof runtimeConfig?.workflowDescription === 'string' && runtimeConfig.workflowDescription.trim()
      ? `工作流描述:\n${runtimeConfig.workflowDescription.trim()}`
      : '',
    typeof data.systemPrompt === 'string' && data.systemPrompt.trim()
      ? `节点附加说明:\n${data.systemPrompt.trim()}`
      : '',
  ].filter(Boolean)

  const completionFinished = new Promise<void>((resolve, reject) => {
    const cleanup = listenToChatStream(requestId, {
      onToken: (token) => { assistantText += token },
      onToolCall: (call) => {
        toolCalls.push({
          id: call.id,
          name: call.name,
          args: JSON.parse(JSON.stringify(call.args ?? {})),
        })
      },
      onToolCallArgs: (event) => {
        const toolCall = toolCalls.find((item) => item.id === event.toolUseId)
        if (toolCall) {
          toolCall.args = JSON.parse(JSON.stringify(event.args ?? {}))
        }
      },
      onToolResult: (event) => {
        const toolCall = toolCalls.find((item) => item.id === event.toolUseId)
        if (toolCall) {
          toolCall.result = JSON.parse(JSON.stringify(event.result ?? null))
          toolCall.status = 'completed'
        }
      },
      onThinking: () => {},
      onUsage: (nextUsage) => { usage = nextUsage },
      onDone: () => {
        cleanup()
        resolve()
      },
      onError: (error) => {
        cleanup()
        reject(error)
      },
    })
  })

  await window.api.chat.completions({
    _requestId: requestId,
    providerId: providerStore.currentProvider.id,
    modelId: providerStore.currentModel.id,
    system: systemSections.join('\n\n'),
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    maxTokens: providerStore.currentModel.maxTokens || 4096,
    ...(providerStore.currentModel.supportsThinking ? { thinking: { type: 'enabled' as const, budgetTokens: 2000 } } : {}),
    runtime: {
      cwd: typeof data.cwd === 'string' && data.cwd.trim() ? data.cwd.trim() : undefined,
      additionalDirectories,
      permissionMode,
      extraInstructions: typeof data.extraInstructions === 'string' ? data.extraInstructions : undefined,
      loadProjectClaudeMd: data.loadProjectClaudeMd !== false,
      loadRuleMd: data.loadRuleMd !== false,
      enabledPlugins: runtimeConfig?.enabledPlugins,
    },
  })

  await completionFinished

  return {
    content: assistantText.trim(),
    toolCalls,
    usage,
    prompt,
    systemPrompt: typeof data.systemPrompt === 'string' ? data.systemPrompt : '',
    runtime: {
      cwd: typeof data.cwd === 'string' ? data.cwd : undefined,
      additionalDirectories,
      permissionMode: typeof data.permissionMode === 'string' ? data.permissionMode : undefined,
      loadProjectClaudeMd: data.loadProjectClaudeMd !== false,
      loadRuleMd: data.loadRuleMd !== false,
      extraInstructions: typeof data.extraInstructions === 'string' ? data.extraInstructions : undefined,
    },
  }
}

function normalizeDirectories(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function normalizePermissionMode(value: unknown): AgentPermissionMode {
  switch (value) {
    case 'default':
    case 'acceptEdits':
    case 'bypassPermissions':
    case 'plan':
    case 'auto':
      return value
    case 'dontAsk':
    default:
      return 'dontAsk'
  }
}
