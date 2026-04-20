import { defineStore } from 'pinia'
import { ref, computed, toRaw, type Ref } from 'vue'
import type { ChatSession, ChatMessage, ToolCall, ChatThinkingBlock } from '@/types'
import {
  createSession as dbCreateSession,
  listSessionsByScope as dbListSessionsByScope,
  deleteSession as dbDeleteSession,
  updateSessionTitle as dbUpdateSessionTitle,
  addMessage as dbAddMessage,
  listMessages as dbListMessages,
  updateMessage as dbUpdateMessage,
  deleteMessage as dbDeleteMessage,
  deleteMessages as dbDeleteMessages,
  clearMessages as dbClearMessages,
} from '@/lib/chat-db'
import { useAIProviderStore } from './ai-provider'
import { useChatUIStore } from './chat-ui'
import { useTabStore } from './tab'
import { runAgentStream } from '@/lib/agent/agent'
import { useAgentSettingsStore } from './agent-settings'

// ====== 辅助函数 ======

/** 将消息更新持久化到 DB 和本地数组 */
async function persistMessageUpdate(
  messageId: string,
  messages: { value: ChatMessage[] },
  updates: Partial<ChatMessage>,
) {
  await dbUpdateMessage(messageId, updates)
  const idx = messages.value.findIndex((m) => m.id === messageId)
  if (idx !== -1) messages.value[idx] = { ...messages.value[idx], ...updates }
}

/** 构建流式输出的最终消息内容 */
function buildStreamUpdates(
  streamingToken: { value: string },
  streamingToolCalls: { value: ToolCall[] },
  streamingThinkingBlocks: { value: ChatThinkingBlock[] },
  streamingUsage: { value: { inputTokens: number; outputTokens: number } | null },
): Partial<ChatMessage> {
  return {
    content: streamingToken.value,
    thinkingBlocks: streamingThinkingBlocks.value.length > 0
      ? JSON.parse(JSON.stringify(streamingThinkingBlocks.value))
      : undefined,
    toolCalls: streamingToolCalls.value.length > 0
      ? JSON.parse(JSON.stringify(toRaw(streamingToolCalls.value)))
      : undefined,
    usage: streamingUsage.value ? { ...toRaw(streamingUsage.value) } : undefined,
  }
}

function isAskUserQuestionToolName(name: string): boolean {
  return name
    .replace(/^mcp__.*?__/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .includes('askuserquestion')
}

function hasAskUserQuestionPayload(args: Record<string, unknown> | undefined): boolean {
  return Array.isArray(args?.questions) && args.questions.length > 0
}

/** 构建工作流模式选项 */
function buildWorkflowOptions(
  sessions: { value: ChatSession[] },
  currentSessionId: { value: string | null },
  workflowEditMode: boolean,
) {
  const workflowStore = useTabStore().activeStore
  const agentSettingsStore = useAgentSettingsStore()
  const sessionData = sessions.value.find((s) => s.id === currentSessionId.value)
  if (!sessionData?.workflowId || !workflowStore?.currentWorkflow) return undefined
  const agentConfig = workflowStore.currentWorkflow.agentConfig
  return {
    mode: 'workflow' as const,
    workflowId: workflowStore.currentWorkflow.id,
    workflowSummary: {
      id: workflowStore.currentWorkflow.id,
      name: workflowStore.currentWorkflow.name,
      description: workflowStore.currentWorkflow.description,
      nodes: workflowStore.currentWorkflow.nodes.map(n => ({ id: n.id, type: n.type, label: n.label })),
      edges: workflowStore.currentWorkflow.edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    },
    enabledPlugins: workflowStore.currentWorkflow.enabledPlugins || [],
    workflowEditMode,
    runtime: {
      cwd: agentConfig?.workspaceDir || agentSettingsStore.globalSettings.workspaceDir || undefined,
      additionalDirectories: agentConfig?.dataDir ? [agentConfig.dataDir] : undefined,
    },
  }
}

// ====== 会话管理 ======

function createSessionActions(scope: string, sessions: Ref<ChatSession[]>, currentSessionId: Ref<string | null>, messages: Ref<ChatMessage[]>) {
  async function loadSessions() {
    if (scope === 'workflow') {
      // workflow scope: 按当前 workflowId 从文件加载
      const workflowStore = useTabStore().activeStore
      const workflowId = workflowStore?.currentWorkflow?.id
      if (workflowId) {
        sessions.value = await window.api.chatHistory.listSessions(workflowId)
      } else {
        sessions.value = []
      }
    } else {
      sessions.value = await dbListSessionsByScope(scope)
    }
  }

  async function createSession() {
    const providerStore = useAIProviderStore()
    const uiStore = useChatUIStore()
    if (!providerStore.currentProvider || !providerStore.currentModel) {
      throw new Error('请先选择 AI 模型')
    }
    let workflowId: string | null = null
    if (scope === 'workflow') {
      const workflowStore = useTabStore().activeStore
      workflowId = workflowStore?.currentWorkflow?.id ?? null
    }
    const session = await dbCreateSession(
      scope, providerStore.currentModel.id, providerStore.currentProvider.id, uiStore.targetTabId,
      workflowId,
    )
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    messages.value = []
    return session
  }

  async function deleteSessionById(id: string) {
    await dbDeleteSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (currentSessionId.value === id) { currentSessionId.value = null; messages.value = [] }
  }

  async function switchSession(id: string) {
    currentSessionId.value = id
    messages.value = await dbListMessages(id)
  }

  async function clearSessionMessages(id: string) {
    await dbClearMessages(id)
    if (currentSessionId.value === id) messages.value = []
    const session = sessions.value.find((s) => s.id === id)
    if (session) session.messageCount = 0
  }

  async function switchToWorkflowSession(workflowId: string | undefined) {
    if (!workflowId) return
    // 先加载该 workflow 的会话列表
    const fileSessions = await window.api.chatHistory.listSessions(workflowId)
    sessions.value = fileSessions

    const existing = sessions.value.find((s) => s.workflowId === workflowId)
    if (existing) {
      if (currentSessionId.value === existing.id) return
      currentSessionId.value = existing.id
      messages.value = await dbListMessages(existing.id)
      return
    }
    const providerStore = useAIProviderStore()
    if (!providerStore.currentProvider || !providerStore.currentModel) {
      throw new Error('请先选择 AI 模型')
    }
    const session = await dbCreateSession(
      scope, providerStore.currentModel.id, providerStore.currentProvider.id, null, workflowId,
    )
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    messages.value = []
  }

  return { loadSessions, createSession, deleteSessionById, switchSession, clearSessionMessages, switchToWorkflowSession }
}

// ====== 流式回调 ======

function createStreamCallbacks(
  assistantMsg: ChatMessage,
  messages: Ref<ChatMessage[]>,
  streamingToken: Ref<string>,
  streamingToolCalls: Ref<ToolCall[]>,
  streamingThinkingBlocks: Ref<ChatThinkingBlock[]>,
  streamingUsage: Ref<{ inputTokens: number; outputTokens: number } | null>,
  retryStatus: Ref<{ attempt: number; maxRetries: number; delayMs: number; status: number } | null>,
  resetStreamState: () => void,
  pauseForUserQuestion: () => void,
) {
  let streamingRenderOrder = 0
  let pausedForUserQuestion = false
  const pendingToolArgs = new Map<string, Record<string, unknown>>()
  const pendingToolResults = new Map<string, { name: string; result: unknown }>()

  function applyToolResult(call: ToolCall, result: unknown) {
    if (call.completedAt && call.status === 'completed') {
      return
    }
    call.status = 'completed'
    call.result = result
    call.completedAt = Date.now()
  }

  function applyPendingToolEvents(call: ToolCall) {
    const args = pendingToolArgs.get(call.id)
    if (args) {
      call.args = args
      pendingToolArgs.delete(call.id)
    }

    const result = pendingToolResults.get(call.id)
    if (result) {
      applyToolResult(call, result.result)
      pendingToolResults.delete(call.id)
    }

    maybePauseForUserQuestion(call)
  }

  function maybePauseForUserQuestion(call: ToolCall | undefined) {
    if (call && (isAskUserQuestionToolName(call.name) || call.name.toLowerCase().includes('question'))) {
      console.debug('[chat-store] askUserQuestion candidate:', {
        id: call.id,
        name: call.name,
        status: call.status,
        argsKeys: Object.keys(call.args ?? {}),
        hasQuestions: hasAskUserQuestionPayload(call.args),
        args: call.args,
      })
    }
    if (pausedForUserQuestion || !call || !isAskUserQuestionToolName(call.name) || !hasAskUserQuestionPayload(call.args)) {
      return
    }
    pausedForUserQuestion = true
    console.debug('[chat-store] pause for askUserQuestion:', {
      id: call.id,
      name: call.name,
      args: call.args,
    })
    pauseForUserQuestion()
  }

  return {
    onToken: (token: string) => { streamingToken.value += token },
    onToolCall: (call: ToolCall) => {
      console.debug('[chat-store] onToolCall:', {
        id: call.id,
        name: call.name,
        status: call.status,
        argsKeys: Object.keys(call.args ?? {}),
        isAskUserQuestion: isAskUserQuestionToolName(call.name),
        args: call.args,
      })
      call.textPosition = streamingToken.value.length
      call.renderOrder = streamingRenderOrder++
      streamingToolCalls.value.push(call)
      applyPendingToolEvents(call)
    },
    onToolCallArgs: (event: { toolUseId: string; args: Record<string, unknown> }) => {
      const tc = streamingToolCalls.value.find((t) => t.id === event.toolUseId)
      console.debug('[chat-store] onToolCallArgs:', {
        toolUseId: event.toolUseId,
        found: !!tc,
        name: tc?.name,
        argsKeys: Object.keys(event.args ?? {}),
        hasQuestions: hasAskUserQuestionPayload(event.args),
        args: event.args,
      })
      if (tc) {
        tc.args = event.args
        maybePauseForUserQuestion(tc)
      } else {
        pendingToolArgs.set(event.toolUseId, event.args)
      }
    },
    onToolResult: (event: { toolUseId: string; name: string; result: unknown }) => {
      const tc = streamingToolCalls.value.find((t) => t.id === event.toolUseId)
      console.debug('[chat-store] onToolResult:', {
        toolUseId: event.toolUseId,
        name: event.name,
        found: !!tc,
        toolName: tc?.name,
        isAskUserQuestion: isAskUserQuestionToolName(event.name) || (tc ? isAskUserQuestionToolName(tc.name) : false),
        result: event.result,
      })
      if (tc) {
        applyToolResult(tc, event.result)
      } else {
        pendingToolResults.set(event.toolUseId, { name: event.name, result: event.result })
      }
    },
    onThinking: (thinkContent: string, blockIndex: number) => {
      const existing = streamingThinkingBlocks.value.find(s => s.index === blockIndex)
      if (existing) { existing.content += thinkContent }
      else {
        streamingThinkingBlocks.value.push({
          index: blockIndex, content: thinkContent,
          textPosition: streamingToken.value.length, renderOrder: streamingRenderOrder++,
        })
      }
    },
    onUsage: (usage: any) => { streamingUsage.value = usage },
    onRetry: (event: any) => {
      retryStatus.value = { attempt: event.attempt, maxRetries: event.maxRetries, delayMs: event.delayMs, status: event.status }
    },
    onDone: async () => {
      try {
        const updates = buildStreamUpdates(streamingToken, streamingToolCalls, streamingThinkingBlocks, streamingUsage)
        await persistMessageUpdate(assistantMsg.id, messages, updates)
      } finally { resetStreamState() }
    },
    onError: async (error: Error) => {
      try {
        await persistMessageUpdate(assistantMsg.id, messages, { content: streamingToken.value || `[错误] ${error.message}` })
      } finally { resetStreamState() }
    },
  }
}

// ====== 消息操作 ======

function createMessageActions(
  messages: Ref<ChatMessage[]>,
  isStreaming: Ref<boolean>,
  currentSessionId: Ref<string | null>,
  currentSession: Ref<ChatSession | null>,
) {
  async function deleteMessageById(messageId: string) {
    await dbDeleteMessage(messageId)
    messages.value = messages.value.filter((m) => m.id !== messageId)
  }

  async function deleteMessageAndAfter(messageId: string) {
    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index === -1) return
    await dbDeleteMessages(messages.value.slice(index).map((m) => m.id))
    messages.value = messages.value.slice(0, index)
  }

  async function retryMessage(messageId: string, streamAssistantReply: (content: string, images?: string[]) => Promise<void>) {
    if (isStreaming.value) return
    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index === -1) return
    let userMsgIndex = -1
    for (let i = index - 1; i >= 0; i--) {
      if (messages.value[i].role === 'user') { userMsgIndex = i; break }
    }
    if (userMsgIndex === -1) return
    const userMsg = messages.value[userMsgIndex]
    await dbDeleteMessages(messages.value.slice(index).map((m) => m.id))
    messages.value = messages.value.slice(0, index)
    await streamAssistantReply(userMsg.content, userMsg.images)
  }

  async function editMessage(messageId: string, newContent: string, streamAssistantReply: (content: string, images?: string[]) => Promise<void>) {
    if (isStreaming.value) return
    const index = messages.value.findIndex((m) => m.id === messageId)
    if (index === -1) return
    await dbUpdateMessage(messageId, { content: newContent })
    messages.value[index] = { ...messages.value[index], content: newContent }
    if (index < messages.value.length - 1) {
      await dbDeleteMessages(messages.value.slice(index + 1).map((m) => m.id))
      messages.value = messages.value.slice(0, index + 1)
    }
    await streamAssistantReply(newContent, messages.value[index].images)
  }

  async function rerunTool(messageId: string, toolCallId: string) {
    if (isStreaming.value) return
    const msgIndex = messages.value.findIndex((m) => m.id === messageId)
    if (msgIndex === -1) return
    const msg = messages.value[msgIndex]
    if (!msg.toolCalls) return
    const tcIndex = msg.toolCalls.findIndex((tc) => tc.id === toolCallId)
    if (tcIndex === -1) return

    const tc = msg.toolCalls[tcIndex]
    const uiStore = useChatUIStore()
    const targetTabId = uiStore.targetTabId || currentSession.value?.browserViewId || undefined
    const rerunArgs = JSON.parse(JSON.stringify(toRaw(tc.args ?? {})))

    const updatedCalls = [...msg.toolCalls]
    updatedCalls[tcIndex] = { ...tc, status: 'running' as const, result: undefined, error: undefined, startedAt: Date.now(), completedAt: undefined }
    messages.value[msgIndex] = { ...msg, toolCalls: updatedCalls }

    try {
      const rawResult = await window.api.agent.execTool(tc.name, rerunArgs, targetTabId)
      const result = JSON.parse(JSON.stringify(rawResult))
      const hasError = result && typeof result === 'object' && 'error' in result
      const finalCalls = [...updatedCalls]
      finalCalls[tcIndex] = {
        ...updatedCalls[tcIndex],
        status: hasError ? 'error' : ('completed' as const),
        result: hasError ? undefined : result,
        error: hasError ? (result as { error: string }).error : undefined,
        completedAt: Date.now(),
      }
      await persistMessageUpdate(messageId, messages, { toolCalls: JSON.parse(JSON.stringify(toRaw(finalCalls))) })
    } catch (err) {
      const finalCalls = [...updatedCalls]
      finalCalls[tcIndex] = {
        ...updatedCalls[tcIndex],
        status: 'error' as const,
        error: err instanceof Error ? err.message : String(err),
        completedAt: Date.now(),
      }
      await persistMessageUpdate(messageId, messages, { toolCalls: JSON.parse(JSON.stringify(toRaw(finalCalls))) })
    }
  }

  return { deleteMessageById, deleteMessageAndAfter, retryMessage, editMessage, rerunTool }
}

// ====== Store 工厂 ======

export function createChatStore(scope: string) {
  const storeId = `chat-${scope}`
  return defineStore(storeId, () => {
    const sessions = ref<ChatSession[]>([])
    const currentSessionId = ref<string | null>(null)
    const messages = ref<ChatMessage[]>([])
    const isStreaming = ref(false)

    const streamingToken = ref('')
    const streamingToolCalls = ref<ToolCall[]>([])
    const streamingThinkingBlocks = ref<ChatThinkingBlock[]>([])
    const streamingUsage = ref<{ inputTokens: number; outputTokens: number } | null>(null)
    const retryStatus = ref<{ attempt: number; maxRetries: number; delayMs: number; status: number } | null>(null)
    const abortController = ref<AbortController | null>(null)
    const streamingMessageId = ref<string | null>(null)
    let streamCleanup: (() => void) | null = null
    let currentRequestId: string | null = null

    const currentSession = computed(() =>
      sessions.value.find((s) => s.id === currentSessionId.value) ?? null,
    )

    // ===== 重置流式状态 =====
    function resetStreamState() {
      retryStatus.value = null
      isStreaming.value = false
      abortController.value = null
      streamingMessageId.value = null
      streamCleanup = null
      currentRequestId = null
    }

    // ===== 组合子 =====
    const sessionActions = createSessionActions(scope, sessions, currentSessionId, messages)
    const messageActions = createMessageActions(messages, isStreaming, currentSessionId, currentSession)

    // ===== 消息发送 =====

    async function pauseGenerationForUserQuestion() {
      if (!abortController.value) return
      if (currentRequestId) {
        window.api.chat.abort(currentRequestId).catch(() => {})
        currentRequestId = null
      }
      abortController.value = null
      streamCleanup?.()
      streamCleanup = null

      const msgId = streamingMessageId.value
      if (msgId) {
        const updates = buildStreamUpdates(streamingToken, streamingToolCalls, streamingThinkingBlocks, streamingUsage)
        delete updates.usage
        await persistMessageUpdate(msgId, messages, updates)
      }

      isStreaming.value = false
      streamingMessageId.value = null
      retryStatus.value = null
    }

    async function streamAssistantReply(content: string, images?: string[]) {
      const sessionId = currentSessionId.value!
      const providerStore = useAIProviderStore()
      const uiStore = useChatUIStore()

      const assistantMsg = await dbAddMessage({
        sessionId, role: 'assistant', content: '', createdAt: Date.now(),
        modelId: providerStore.currentModel?.id,
      })
      messages.value.push(assistantMsg)
      streamingMessageId.value = assistantMsg.id

      isStreaming.value = true
      streamingToken.value = ''
      streamingToolCalls.value = []
      streamingThinkingBlocks.value = []
      streamingUsage.value = null
      retryStatus.value = null

      try {
        const controller = new AbortController()
        abortController.value = controller

        const history = messages.value
          .filter((m) => m.id !== assistantMsg.id && m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content }))

        const callbacks = createStreamCallbacks(
          assistantMsg, messages, streamingToken, streamingToolCalls,
          streamingThinkingBlocks, streamingUsage, retryStatus, resetStreamState,
          () => { pauseGenerationForUserQuestion().catch(() => {}) },
        )
        const result = await runAgentStream(
          history, content, images, callbacks,
          uiStore.targetTabId, uiStore.enabledToolNames,
          buildWorkflowOptions(sessions, currentSessionId, uiStore.workflowEditMode),
        )
        if (result) { currentRequestId = result.requestId; streamCleanup = result.cleanup }
      } catch (error) {
        resetStreamState()
        const idx = messages.value.findIndex((m) => m.id === assistantMsg.id)
        if (idx !== -1) {
          const errorContent = error instanceof Error ? error.message : String(error)
          messages.value[idx] = { ...messages.value[idx], content: `[错误] ${errorContent}` }
          await dbUpdateMessage(assistantMsg.id, { content: `[错误] ${errorContent}` })
        }
      }
    }

    async function sendMessage(content: string, images?: string[]) {
      if (isStreaming.value) return
      if (!currentSessionId.value) await sessionActions.createSession()
      const sessionId = currentSessionId.value!

      const userMsg = await dbAddMessage({ sessionId, role: 'user', content, images, createdAt: Date.now() })
      messages.value.push(userMsg)

      const session = sessions.value.find((s) => s.id === sessionId)
      if (session && session.messageCount <= 1) {
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '')
        await dbUpdateSessionTitle(sessionId, title)
        session.title = title
      }
      await streamAssistantReply(content, images)
    }

    async function stopGeneration() {
      if (!abortController.value) return
      if (currentRequestId) { window.api.chat.abort(currentRequestId).catch(() => {}); currentRequestId = null }
      abortController.value = null
      streamCleanup?.()
      streamCleanup = null

      const msgId = streamingMessageId.value
      if (msgId) {
        const updates = buildStreamUpdates(streamingToken, streamingToolCalls, streamingThinkingBlocks, streamingUsage)
        delete updates.usage
        await persistMessageUpdate(msgId, messages, updates)
      }

      if (currentSessionId.value) {
        messages.value.push(await dbAddMessage({
          sessionId: currentSessionId.value, role: 'system', content: '用户已中断操作', createdAt: Date.now(),
        }))
      }
      isStreaming.value = false
      streamingMessageId.value = null
      retryStatus.value = null
    }

    // ===== 初始化 =====
    async function init() {
      await sessionActions.loadSessions()
      if (sessions.value.length > 0 && !currentSessionId.value) {
        await sessionActions.switchSession(sessions.value[0].id)
      }
    }

    return {
      scope, sessions, currentSessionId, messages, isStreaming,
      streamingToken, streamingToolCalls, streamingThinkingBlocks, streamingUsage, retryStatus,
      currentSession,
      loadSessions: sessionActions.loadSessions,
      createSession: sessionActions.createSession,
      deleteSessionById: sessionActions.deleteSessionById,
      switchSession: sessionActions.switchSession,
      clearSessionMessages: sessionActions.clearSessionMessages,
      sendMessage, streamAssistantReply, stopGeneration,
      deleteMessageById: messageActions.deleteMessageById,
      deleteMessageAndAfter: messageActions.deleteMessageAndAfter,
      retryMessage: (messageId: string) => messageActions.retryMessage(messageId, streamAssistantReply),
      editMessage: (messageId: string, newContent: string) => messageActions.editMessage(messageId, newContent, streamAssistantReply),
      rerunTool: messageActions.rerunTool,
      switchToWorkflowSession: sessionActions.switchToWorkflowSession,
      init,
    }
  })()
}

export type ChatStoreInstance = ReturnType<typeof createChatStore>
