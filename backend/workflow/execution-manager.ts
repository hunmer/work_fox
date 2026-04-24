import { randomUUID } from 'node:crypto'
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  ExecutionLog,
  ExecutionStep,
  ExecutionLogEntry,
  EngineStatus,
  ConditionItem,
} from '../../shared/workflow-types'
import type {
  ExecutionBacklogEvent,
  ExecutionEventChannel,
  ExecutionEventMap,
  ExecutionRecoveryRequest,
  ExecutionRecoveryResponse,
  WorkflowExecuteRequest,
  WorkflowExecuteResponse,
} from '../../shared/execution-events'
import { createErrorShape } from '../../shared/errors'
import type { AgentChatInteractionSchema, NodeExecutionInteractionSchema, TableConfirmInteractionSchema } from '../../shared/ws-protocol'
import { isLocalBridgeWorkflowNode } from '../../shared/workflow-local-bridge'
import type { BackendWorkflowStore } from '../storage/workflow-store'
import type { BackendExecutionLogStore } from '../storage/execution-log-store'
import type { BackendPluginRegistry } from '../plugins/plugin-registry'
import type { Logger } from '../app/logger'
import type { BackendInteractionManager } from './interaction-manager'

interface ExecutionManagerDeps {
  workflowStore: BackendWorkflowStore
  executionLogStore: BackendExecutionLogStore
  pluginRegistry: BackendPluginRegistry
  interactionManager: BackendInteractionManager
  emit<Channel extends ExecutionEventChannel>(channel: Channel, payload: ExecutionEventMap[Channel]): void
  logger: Logger
}

interface ExecutionSession {
  id: string
  workflow: Workflow
  ownerClientId: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  context: Record<string, any>
  status: EngineStatus
  executionOrder: WorkflowNode[]
  currentIndex: number
  pauseRequested: boolean
  stopRequested: boolean
  startedAt: number
  finishedAt?: number
  steps: ExecutionStep[]
  activeBranches: Map<string, string>
  lastErrorMessage?: string
  persisted: boolean
  lastUpdatedAt: number
  eventSequence: number
  recentEvents: ExecutionBacklogEvent[]
}

interface FinishedExecutionRecovery {
  ownerClientId: string
  workflowId: string
  recovery: NonNullable<ExecutionRecoveryResponse['execution']>
  expiresAt: number
}

const MAX_RECENT_EVENTS = 100
const FINISHED_RECOVERY_TTL_MS = 2 * 60_000

export class BackendWorkflowExecutionManager {
  private sessions = new Map<string, ExecutionSession>()
  private finishedRecoveries = new Map<string, FinishedExecutionRecovery>()

  constructor(private deps: ExecutionManagerDeps) {}

  async execute(request: WorkflowExecuteRequest, ownerClientId: string): Promise<WorkflowExecuteResponse> {
    const workflow = this.deps.workflowStore.getWorkflow(request.workflowId)
    if (!workflow) {
      throw createErrorShape('NOT_FOUND', `工作流不存在: ${request.workflowId}`)
    }

    const executionId = randomUUID()
    const session: ExecutionSession = {
      id: executionId,
      workflow,
      ownerClientId,
      nodes: request.snapshot?.nodes ? clone(request.snapshot.nodes) : clone(workflow.nodes),
      edges: request.snapshot?.edges ? clone(request.snapshot.edges) : clone(workflow.edges),
      context: {
        __data__: {},
        __input__: request.input || {},
      },
      status: 'idle',
      executionOrder: [],
      currentIndex: 0,
      pauseRequested: false,
      stopRequested: false,
      startedAt: Date.now(),
      steps: [],
      activeBranches: new Map(),
      persisted: false,
      lastUpdatedAt: Date.now(),
      eventSequence: 0,
      recentEvents: [],
    }

    this.sessions.set(executionId, session)
    void this.run(session)
    return { executionId, status: 'running' }
  }

  getExecutionRecovery(request: ExecutionRecoveryRequest, ownerClientId: string): ExecutionRecoveryResponse {
    this.pruneFinishedRecoveries()

    const activeSession = this.findSession(ownerClientId, request.workflowId, request.executionId)
    if (activeSession) {
      return {
        found: true,
        execution: this.createRecoveryState(activeSession, true),
      }
    }

    const finishedRecovery = this.findFinishedRecovery(ownerClientId, request.workflowId, request.executionId)
    if (finishedRecovery) {
      return {
        found: true,
        execution: clone(finishedRecovery.recovery),
      }
    }

    return { found: false }
  }

  pause(executionId: string): WorkflowExecuteResponse {
    const session = this.getSession(executionId)
    if (session.status === 'running') {
      session.pauseRequested = true
    }
    return { executionId, status: session.status }
  }

  async resume(executionId: string): Promise<WorkflowExecuteResponse> {
    const session = this.getSession(executionId)
    if (session.status !== 'paused') {
      return { executionId, status: session.status }
    }

    session.pauseRequested = false
    session.status = 'running'
    this.emitEvent(session, 'workflow:resumed', {
      executionId: session.id,
      workflowId: session.workflow.id,
      timestamp: Date.now(),
      status: 'running',
      currentNodeId: session.executionOrder[session.currentIndex]?.id,
    })
    this.emitLog(session)
    void this.runSafe(session, session.currentIndex)
    return { executionId, status: session.status }
  }

  stop(executionId: string): WorkflowExecuteResponse {
    const session = this.getSession(executionId)
    session.stopRequested = true

    if (session.status === 'paused') {
      session.status = 'error'
      session.lastErrorMessage = '执行已停止'
      session.finishedAt = Date.now()
      this.emitLog(session)
      this.emitWorkflowError(session)
      this.persistAndCleanup(session)
    }

    return { executionId, status: session.status }
  }

  private getSession(executionId: string): ExecutionSession {
    const session = this.sessions.get(executionId)
    if (!session) {
      throw createErrorShape('NOT_FOUND', `执行会话不存在: ${executionId}`)
    }
    return session
  }

  private async run(session: ExecutionSession): Promise<void> {
    try {
      session.context.__config__ = await this.loadPluginConfigs(session.workflow)
      session.executionOrder = this.buildExecutionOrder(session.nodes, session.edges)
      if (session.executionOrder.length === 0) {
        session.status = 'error'
        session.lastErrorMessage = '工作流为空或无法建立执行顺序'
        session.finishedAt = Date.now()
        this.emitWorkflowError(session)
        this.persistAndCleanup(session)
        return
      }

      session.status = 'running'
      session.startedAt = Date.now()
      this.emitEvent(session, 'workflow:started', {
        executionId: session.id,
        workflowId: session.workflow.id,
        timestamp: session.startedAt,
        status: 'running',
        workflowName: session.workflow.name,
      })
      this.emitLog(session)
      this.emitContext(session)

      await this.runSafe(session, 0)
    } catch (error) {
      this.handleExecutionError(session, error)
    }
  }

  private async runSafe(session: ExecutionSession, startIndex: number): Promise<void> {
    try {
      await this.runFromIndex(session, startIndex)
    } catch (error) {
      this.handleExecutionError(session, error)
    }
  }

  private handleExecutionError(session: ExecutionSession, error: unknown): void {
    if (session.status === 'completed' || session.status === 'error') return
    session.status = 'error'
    session.lastErrorMessage = error instanceof Error ? error.message : String(error)
    session.finishedAt = Date.now()
    this.emitWorkflowError(session)
    this.persistAndCleanup(session)
  }

  private async runFromIndex(session: ExecutionSession, startIndex: number): Promise<void> {
    for (let i = startIndex; i < session.executionOrder.length; i++) {
      if (session.stopRequested) {
        session.status = 'error'
        session.lastErrorMessage = '执行已停止'
        session.finishedAt = Date.now()
        this.emitLog(session)
        this.emitWorkflowError(session)
        this.persistAndCleanup(session)
        return
      }

      if (session.pauseRequested) {
        session.currentIndex = i
        session.status = 'paused'
        this.emitLog(session)
        this.emitEvent(session, 'workflow:paused', {
          executionId: session.id,
          workflowId: session.workflow.id,
          timestamp: Date.now(),
          status: 'paused',
          currentNodeId: session.executionOrder[i]?.id,
        })
        return
      }

      session.currentIndex = i
      const node = session.executionOrder[i]
      const nodeState = node.nodeState || 'normal'

      if (session.activeBranches.size > 0 && !this.isNodeReachable(session, node.id)) {
        this.recordSkippedStep(session, node, '非活跃分支')
        continue
      }

      if (nodeState === 'disabled') {
        this.recordSkippedStep(session, node, '节点已禁用，工作流中止')
        session.status = 'error'
        session.lastErrorMessage = '节点已禁用，工作流中止'
        session.finishedAt = Date.now()
        this.emitLog(session)
        this.emitWorkflowError(session)
        this.persistAndCleanup(session)
        return
      }

      if (nodeState === 'skipped') {
        this.recordSkippedStep(session, node, '节点已跳过')
        continue
      }

      const result = await this.executeNode(session, node)
      if (result === 'interrupted') {
        i -= 1
        continue
      }

      if (session.status === 'error') {
        session.finishedAt = Date.now()
        this.emitLog(session)
        this.emitWorkflowError(session)
        this.persistAndCleanup(session)
        return
      }
    }

    session.status = 'completed'
    session.finishedAt = Date.now()
    this.emitLog(session)
    this.emitContext(session)
    this.emitEvent(session, 'workflow:completed', {
      executionId: session.id,
      workflowId: session.workflow.id,
      timestamp: Date.now(),
      status: 'completed',
      log: this.currentLog(session),
      context: this.currentContext(session),
    })
    this.persistAndCleanup(session)
  }

  private async executeNode(session: ExecutionSession, node: WorkflowNode): Promise<'completed' | 'interrupted'> {
    const delay = typeof node.data?._delay === 'number' ? node.data._delay : 0
    if (delay > 0) {
      await sleep(delay)
      if (session.stopRequested || session.pauseRequested) return 'interrupted'
    }

    const resolvedData = this.resolveContextVariables(session, node.data)
    const step: ExecutionStep = {
      nodeId: node.id,
      nodeLabel: node.label,
      startedAt: Date.now(),
      status: 'running',
      input: resolvedData,
    }
    session.steps.push(step)

    this.emitEvent(session, 'node:start', {
      executionId: session.id,
      workflowId: session.workflow.id,
      timestamp: Date.now(),
      nodeId: node.id,
      nodeLabel: node.label,
      input: resolvedData,
    })
    this.emitLog(session)

    const stepLogs: ExecutionLogEntry[] = []
    const appendNodeLog = (level: ExecutionLogEntry['level'], message: string) => {
      const entry: ExecutionLogEntry = {
        level,
        message,
        timestamp: Date.now(),
      }
      stepLogs.push(entry)
      step.logs = [...stepLogs]
      this.emitEvent(session, 'node:progress', {
        executionId: session.id,
        workflowId: session.workflow.id,
        timestamp: entry.timestamp,
        nodeId: node.id,
        message,
        data: { level },
      })
      this.emitLog(session)
    }

    try {
      const result = await this.dispatchNode(session, node, resolvedData, appendNodeLog)
      step.finishedAt = Date.now()
      step.status = 'completed'
      step.output = result && Array.isArray(result._logs)
        ? (() => {
            step.logs = result._logs as ExecutionLogEntry[]
            const { _logs, ...rest } = result
            return rest
          })()
        : result

      session.context[node.id] = step.output
      if (!session.context.__data__) session.context.__data__ = {}
      session.context.__data__[node.id] = result

      if (node.type === 'switch' && result?.__branch__) {
        session.activeBranches.set(node.id, result.__branch__)
      }

      this.emitContext(session)
      this.emitEvent(session, 'node:complete', {
        executionId: session.id,
        workflowId: session.workflow.id,
        timestamp: Date.now(),
        nodeId: node.id,
        step: { ...step },
      })
    } catch (error) {
      step.finishedAt = Date.now()
      step.status = 'error'
      step.error = error instanceof Error ? error.message : String(error)
      step.logs = stepLogs.length ? [...stepLogs] : undefined
      session.status = 'error'
      session.lastErrorMessage = step.error
      this.emitEvent(session, 'node:error', {
        executionId: session.id,
        workflowId: session.workflow.id,
        timestamp: Date.now(),
        nodeId: node.id,
        step: { ...step },
        error: createErrorShape('WORKFLOW_ERROR', step.error),
      })
    }

    return 'completed'
  }

  private async dispatchNode(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendNodeLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    switch (node.type) {
      case 'start':
      case 'end':
        return null
      case 'gallery_preview':
        return { items: Array.isArray(resolvedData.items) ? resolvedData.items : [] }
      case 'music_player':
        return {
          tracks: Array.isArray(resolvedData.tracks) ? resolvedData.tracks : [],
          volume: typeof resolvedData.volume === 'number' ? resolvedData.volume : 80,
          loop: !!resolvedData.loop,
        }
      case 'table_display':
        return this.executeTableDisplay(session, node, resolvedData)
      case 'run_code':
        return this.executeCode(session.context, String(resolvedData.code || ''))
      case 'toast':
        return {
          message: String(resolvedData.message || ''),
          type: String(resolvedData.type || 'info'),
        }
      case 'switch':
        return this.executeSwitch(session, resolvedData.conditions || [])
      case 'agent_run':
        return this.executeAgentRun(session, node, resolvedData, appendNodeLog)
      default:
        if (isLocalBridgeWorkflowNode(node.type)) {
          return this.executeMainProcessNode(session, node, resolvedData, appendNodeLog)
        }
        if (this.deps.pluginRegistry.requiresMainProcessBridge(node.type)) {
          return this.executeMainProcessNode(session, node, resolvedData, appendNodeLog)
        }
        if (this.deps.pluginRegistry.canExecuteNode(node.type)) {
          return this.deps.pluginRegistry.executeWorkflowNode(node.type, resolvedData, {
            logger: {
              info: (message) => appendNodeLog('info', message),
              warning: (message) => appendNodeLog('warning', message),
              error: (message) => appendNodeLog('error', message),
            },
          })
        }
        throw new Error(`节点类型 ${node.type} 当前 backend 不支持`)
    }
  }

  private async executeAgentRun(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendNodeLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    const prompt = typeof resolvedData.prompt === 'string' ? resolvedData.prompt : ''
    if (!prompt.trim()) {
      throw new Error('agent_run 节点缺少 prompt')
    }

    appendNodeLog('info', '等待 Electron 本地 Agent 执行')
    const schema: AgentChatInteractionSchema = {
      prompt,
      systemPrompt: typeof resolvedData.systemPrompt === 'string' ? resolvedData.systemPrompt : undefined,
      cwd: typeof resolvedData.cwd === 'string' ? resolvedData.cwd : undefined,
      additionalDirectories: normalizeDirectories(resolvedData.additionalDirectories),
      permissionMode: typeof resolvedData.permissionMode === 'string' ? resolvedData.permissionMode : undefined,
      extraInstructions: typeof resolvedData.extraInstructions === 'string' ? resolvedData.extraInstructions : undefined,
      loadProjectClaudeMd: resolvedData.loadProjectClaudeMd !== false,
      loadRuleMd: resolvedData.loadRuleMd !== false,
      workflowId: session.workflow.id,
      workflowName: session.workflow.name,
      workflowDescription: session.workflow.description,
      enabledPlugins: session.workflow.enabledPlugins || [],
    }

    const result = await this.deps.interactionManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      interactionType: 'agent_chat',
      schema,
    })
    appendNodeLog('info', 'Electron 本地 Agent 已返回结果')
    return result
  }

  private async executeMainProcessNode(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendNodeLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    appendNodeLog('info', `等待 Electron 本地节点执行: ${node.type}`)
    const schema: NodeExecutionInteractionSchema = {
      toolType: node.type,
      params: {
        ...resolvedData,
        nodeId: node.id,
        nodeLabel: node.label,
      },
    }

    const result = await this.deps.interactionManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      interactionType: 'node_execution',
      schema,
    })
    appendNodeLog('info', `Electron 本地节点执行完成: ${node.type}`)
    return result
  }

  private async executeTableDisplay(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
  ): Promise<any> {
    const headers = Array.isArray(resolvedData.headers) ? resolvedData.headers : []
    const cells = Array.isArray(resolvedData.cells) ? resolvedData.cells : []
    const selectionMode = ['none', 'single', 'multi'].includes(resolvedData.selectionMode)
      ? resolvedData.selectionMode
      : 'none'

    if (selectionMode === 'none') {
      return { selectedRows: cells, selectedCount: cells.length }
    }

    const schema: TableConfirmInteractionSchema = { headers, cells, selectionMode }

    const result = await this.deps.interactionManager.request({
      clientId: session.ownerClientId,
      executionId: session.id,
      workflowId: session.workflow.id,
      nodeId: node.id,
      interactionType: 'table_confirm',
      schema,
    })

    return result
  }

  private executeCode(context: Record<string, any>, code: string): any {
    const fn = new Function('context', code)
    return fn(context)
  }

  private executeSwitch(session: ExecutionSession, conditions: ConditionItem[]): any {
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i]
      const variable = this.resolveStringValue(session, cond.variable)
      const value = this.resolveStringValue(session, cond.value)
      if (this.evaluateCondition(variable, value, cond.operator)) {
        return { __branch__: `case-${i}`, matchedIndex: i }
      }
    }
    return { __branch__: 'default', matchedIndex: -1 }
  }

  private evaluateCondition(variable: any, value: any, operator: string): boolean {
    switch (operator) {
      case 'equals': return variable == value
      case 'not_equals': return variable != value
      case 'greater_than': return Number(variable) > Number(value)
      case 'less_than': return Number(variable) < Number(value)
      case 'greater_than_or_equal': return Number(variable) >= Number(value)
      case 'less_than_or_equal': return Number(variable) <= Number(value)
      case 'contains': return String(variable).includes(String(value))
      case 'not_contains': return !String(variable).includes(String(value))
      case 'starts_with': return String(variable).startsWith(String(value))
      case 'ends_with': return String(variable).endsWith(String(value))
      case 'is_empty': return variable === '' || variable === null || variable === undefined
      case 'is_not_empty': return variable !== '' && variable !== null && variable !== undefined
      default: return false
    }
  }

  private async loadPluginConfigs(workflow: Workflow): Promise<Record<string, Record<string, string>>> {
    const plugins = this.getReferencedPluginIds(workflow)
    const schemes = workflow.pluginConfigSchemes || {}
    const config: Record<string, Record<string, string>> = {}

    for (const pluginId of plugins) {
      try {
        const schemeName = schemes[pluginId]
        config[pluginId] = schemeName
          ? this.deps.workflowStore.readPluginScheme(workflow.id, pluginId, schemeName)
          : this.deps.pluginRegistry.getConfig(pluginId)
      } catch (error) {
        this.deps.logger.warn(`加载插件配置失败: ${pluginId}`, error)
        config[pluginId] = this.deps.pluginRegistry.getConfig(pluginId)
      }
    }

    return config
  }

  private getReferencedPluginIds(workflow: Workflow): string[] {
    const pluginIds = new Set(workflow.enabledPlugins || [])
    const collect = (value: any) => {
      if (typeof value === 'string') {
        const matches = value.matchAll(/__config__\["([^"]+)"\]/g)
        for (const match of matches) pluginIds.add(match[1])
        return
      }
      if (Array.isArray(value)) {
        value.forEach(collect)
        return
      }
      if (value && typeof value === 'object') {
        Object.values(value).forEach(collect)
      }
    }
    workflow.nodes.forEach((node) => collect(node.data))
    return [...pluginIds]
  }

  private buildExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]))
    const inDegree = new Map(nodes.map((node) => [node.id, 0]))

    for (const edge of edges) {
      const degree = inDegree.get(edge.target) ?? 0
      inDegree.set(edge.target, degree + 1)
    }

    const queue: string[] = []
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id)
    }

    const order: WorkflowNode[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      const node = nodeMap.get(id)
      if (node) order.push(node)

      for (const edge of edges) {
        if (edge.source !== id) continue
        const degree = (inDegree.get(edge.target) ?? 1) - 1
        inDegree.set(edge.target, degree)
        if (degree === 0) queue.push(edge.target)
      }
    }

    return order
  }

  private recordSkippedStep(session: ExecutionSession, node: WorkflowNode, reason: string): void {
    const step: ExecutionStep = {
      nodeId: node.id,
      nodeLabel: node.label,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      status: 'skipped',
      error: reason,
    }
    session.steps.push(step)
    this.emitLog(session)
  }

  private isNodeReachable(session: ExecutionSession, nodeId: string, visited?: Set<string>): boolean {
    const seen = visited || new Set<string>()
    if (seen.has(nodeId)) return false
    seen.add(nodeId)

    const incoming = session.edges.filter((edge) => edge.target === nodeId)
    if (incoming.length === 0) return true

    for (const edge of incoming) {
      const activeHandle = session.activeBranches.get(edge.source)
      if (activeHandle !== undefined && edge.sourceHandle !== activeHandle) continue
      if (this.isNodeReachable(session, edge.source, seen)) return true
    }
    return false
  }

  private resolveContextVariables(session: ExecutionSession, data: Record<string, any>): Record<string, any> {
    return this.resolveValue(session, data)
  }

  private resolveValue(session: ExecutionSession, value: any): any {
    if (typeof value === 'string') return this.resolveStringValue(session, value)
    if (Array.isArray(value)) return value.map((item) => this.resolveValue(session, item))
    if (value && typeof value === 'object') {
      const resolved: Record<string, any> = {}
      for (const [key, nested] of Object.entries(value)) {
        resolved[key] = this.resolveValue(session, nested)
      }
      return resolved
    }
    return value
  }

  private resolveStringValue(session: ExecutionSession, value: string): any {
    const dataMatch = value.match(/^\s*\{\{\s*__data__\["([^"]+)"\]\.([^}]+?)\s*\}\}\s*$/)
    if (dataMatch) {
      const data = session.context.__data__?.[dataMatch[1]]
      if (data != null) {
        const result = this.getNestedValue(data, dataMatch[2])
        if (result !== undefined) return result
      }
      return ''
    }

    const configMatch = value.match(/^\s*\{\{\s*__config__\["([^"]+)"\]\["([^"]+)"\](?:\.(\w+(?:\.\w+)*))?\s*\}\}\s*$/)
    if (configMatch) {
      const pluginConfig = session.context.__config__?.[configMatch[1]]
      if (pluginConfig != null) {
        let raw: any = pluginConfig[configMatch[2]]
        if (configMatch[3] && typeof raw === 'string') {
          try { raw = JSON.parse(raw) } catch { /* ignore */ }
        }
        const result = configMatch[3] ? this.getNestedValue(raw, configMatch[3]) : raw
        if (result !== undefined) return result
      }
      return ''
    }

    const ctxMatch = value.match(/^\s*\{\{\s*context\.([^}]+?)\s*\}\}\s*$/)
    if (ctxMatch) {
      const result = this.getContextValue(session.context, ctxMatch[1])
      return result ?? ''
    }

    let text = value.replace(
      /\{\{\s*__data__\["([^"]+)"\]\.([^}]+?)\s*\}\}/g,
      (_match, nodeId, fieldPath) => {
        const data = session.context.__data__?.[nodeId]
        if (data == null) return ''
        return String(this.getNestedValue(data, fieldPath) ?? '')
      },
    )

    text = text.replace(
      /\{\{\s*__config__\["([^"]+)"\]\["([^"]+)"\](?:\.(\w+(?:\.\w+)*))?\s*\}\}/g,
      (_match, pluginId, key, dotPath) => {
        const pluginConfig = session.context.__config__?.[pluginId]
        if (pluginConfig == null) return ''
        let raw: any = pluginConfig[key]
        if (dotPath && typeof raw === 'string') {
          try { raw = JSON.parse(raw) } catch { /* ignore */ }
        }
        return String((dotPath ? this.getNestedValue(raw, dotPath) : raw) ?? '')
      },
    )

    text = text.replace(/\{\{\s*context\.([^}]+?)\s*\}\}/g, (_match, path) => {
      return String(this.getContextValue(session.context, path) ?? '')
    })
    return text
  }

  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.')
    let current = obj
    for (const part of parts) {
      if (current == null) return undefined
      current = current[part]
    }
    return current
  }

  private getContextValue(context: Record<string, any>, path: string): any {
    const parts = path.split('.')
    let current: any = context
    for (const part of parts) {
      if (current == null) return undefined
      current = current[part]
    }
    return current
  }

  private currentContext(session: ExecutionSession): Record<string, unknown> {
    return clone(session.context)
  }

  private currentLog(session: ExecutionSession): ExecutionLog {
    return {
      id: session.id,
      workflowId: session.workflow.id,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      status: session.status === 'running' ? 'running' : session.status === 'paused' ? 'paused' : session.status === 'completed' ? 'completed' : 'error',
      steps: clone(session.steps),
      snapshot: {
        nodes: clone(session.nodes),
        edges: clone(session.edges),
      },
    }
  }

  private emit<Channel extends ExecutionEventChannel>(channel: Channel, payload: ExecutionEventMap[Channel]): void {
    this.deps.emit(channel, payload)
  }

  private emitEvent<Channel extends ExecutionEventChannel>(
    session: ExecutionSession,
    channel: Channel,
    payload: ExecutionEventMap[Channel],
  ): void {
    session.lastUpdatedAt = Date.now()
    session.eventSequence += 1
    session.recentEvents.push({
      sequence: session.eventSequence,
      channel,
      payload: clone(payload) as ExecutionEventMap[ExecutionEventChannel],
    })
    if (session.recentEvents.length > MAX_RECENT_EVENTS) {
      session.recentEvents.splice(0, session.recentEvents.length - MAX_RECENT_EVENTS)
    }
    this.emit(channel, payload)
  }

  private emitLog(session: ExecutionSession): void {
    this.emitEvent(session, 'execution:log', {
      executionId: session.id,
      workflowId: session.workflow.id,
      timestamp: Date.now(),
      log: this.currentLog(session),
    })
  }

  private emitContext(session: ExecutionSession): void {
    this.emitEvent(session, 'execution:context', {
      executionId: session.id,
      workflowId: session.workflow.id,
      timestamp: Date.now(),
      context: this.currentContext(session),
    })
  }

  private emitWorkflowError(session: ExecutionSession): void {
    this.emitEvent(session, 'workflow:error', {
      executionId: session.id,
      workflowId: session.workflow.id,
      timestamp: Date.now(),
      status: 'error',
      error: createErrorShape('WORKFLOW_ERROR', session.lastErrorMessage || '工作流执行失败'),
      log: this.currentLog(session),
    })
  }

  private persistAndCleanup(session: ExecutionSession): void {
    if (!session.persisted) {
      this.deps.executionLogStore.add(session.workflow.id, this.currentLog(session))
      session.persisted = true
    }
    this.finishedRecoveries.set(session.id, {
      ownerClientId: session.ownerClientId,
      workflowId: session.workflow.id,
      recovery: this.createRecoveryState(session, false),
      expiresAt: Date.now() + FINISHED_RECOVERY_TTL_MS,
    })
    this.sessions.delete(session.id)
    this.pruneFinishedRecoveries()
  }

  private createRecoveryState(session: ExecutionSession, active: boolean): NonNullable<ExecutionRecoveryResponse['execution']> {
    return {
      executionId: session.id,
      workflowId: session.workflow.id,
      status: session.status,
      currentNodeId: session.executionOrder[session.currentIndex]?.id,
      updatedAt: session.lastUpdatedAt,
      active,
      log: this.currentLog(session),
      context: this.currentContext(session),
      recentEvents: clone(session.recentEvents),
    }
  }

  private findSession(ownerClientId: string, workflowId: string, executionId?: string | null): ExecutionSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.ownerClientId !== ownerClientId) continue
      if (session.workflow.id !== workflowId) continue
      if (executionId && session.id !== executionId) continue
      return session
    }
    return undefined
  }

  private findFinishedRecovery(
    ownerClientId: string,
    workflowId: string,
    executionId?: string | null,
  ): FinishedExecutionRecovery | undefined {
    for (const recovery of this.finishedRecoveries.values()) {
      if (recovery.ownerClientId !== ownerClientId) continue
      if (recovery.workflowId !== workflowId) continue
      if (executionId && recovery.recovery.executionId !== executionId) continue
      return recovery
    }
    return undefined
  }

  private pruneFinishedRecoveries(): void {
    const now = Date.now()
    for (const [executionId, recovery] of this.finishedRecoveries.entries()) {
      if (recovery.expiresAt <= now) {
        this.finishedRecoveries.delete(executionId)
      }
    }
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeDirectories(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
    return items.length ? items : undefined
  }

  if (typeof value === 'string') {
    const items = value.split('\n').map((item) => item.trim()).filter(Boolean)
    return items.length ? items : undefined
  }

  return undefined
}
