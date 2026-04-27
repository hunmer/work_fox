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
  OutputField,
} from '../../shared/workflow-types'
import type {
  ExecutionBacklogEvent,
  ExecutionEventChannel,
  ExecutionEventMap,
  ExecutionRecoveryRequest,
  ExecutionRecoveryResponse,
  WorkflowDebugNodeRequest,
  WorkflowDebugNodeResponse,
  WorkflowExecuteRequest,
  WorkflowExecuteResponse,
} from '../../shared/execution-events'
import { createErrorShape } from '../../shared/errors'
import { normalizeEmbeddedWorkflow } from '../../shared/embedded-workflow'
import type { AgentChatInteractionSchema, NodeExecutionInteractionSchema, TableConfirmInteractionSchema } from '../../shared/ws-protocol'
import {
  findCompositeChildByRole,
  findWorkflowNode,
  getCompositeParentId,
  getNodesForExecutionScope,
  isGeneratedWorkflowNode,
  LOOP_BREAK_NODE_TYPE,
  LOOP_BODY_ROLE,
  LOOP_BODY_NODE_TYPE,
  LOOP_NEXT_SOURCE_HANDLE,
  LOOP_NODE_TYPE,
} from '../../shared/workflow-composite'
import { isLocalBridgeWorkflowNode } from '../../shared/workflow-local-bridge'
import type { BackendWorkflowStore } from '../storage/workflow-store'
import type { BackendExecutionLogStore } from '../storage/execution-log-store'
import type { BackendPluginRegistry } from '../plugins/plugin-registry'
import type { ClientNodeCache } from '../chat/client-node-cache'
import type { Logger } from '../app/logger'
import type { BackendInteractionManager } from './interaction-manager'

interface ExecutionManagerDeps {
  workflowStore: BackendWorkflowStore
  executionLogStore: BackendExecutionLogStore
  pluginRegistry: BackendPluginRegistry
  clientNodeCache: ClientNodeCache
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
  pauseReason?: 'manual' | 'breakpoint-start' | 'breakpoint-end'
  pauseNodeId?: string
  pauseBreakpoint?: 'start' | 'end'
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
  loopStack: LoopExecutionFrame[]
  breakpointBypassKeys: Set<string>
}

interface JsonPreset {
  id: string
  name: string
  data: Record<string, any>
  inputs: Record<string, any>
  outputs?: Record<string, any>
}

const JSON_PRESETS_KEY = '__jsonPresets'
const SELECTED_JSON_PRESET_KEY = '__selectedJsonPresetId'

interface FinishedExecutionRecovery {
  ownerClientId: string
  workflowId: string
  recovery: NonNullable<ExecutionRecoveryResponse['execution']>
  expiresAt: number
}

interface LoopExecutionFrame {
  loopNodeId: string
  parentData?: Record<string, unknown>
  bodyAnchorId: string
  variables: Record<string, unknown>
  breakRequested?: boolean
  metadata: {
    index: number
    count: number | null
    item: unknown
    isFirst: boolean
    isLast: boolean
  }
}

interface LoopIterations {
  count: number | null
  items: unknown[]
  infinite: boolean
}

const MAX_RECENT_EVENTS = 100
const FINISHED_RECOVERY_TTL_MS = 2 * 60_000

export class BackendWorkflowExecutionManager {
  private sessions = new Map<string, ExecutionSession>()
  private finishedRecoveries = new Map<string, FinishedExecutionRecovery>()

  constructor(private deps: ExecutionManagerDeps) {}

  getRunningSessionCount(): number {
    let count = 0
    for (const session of this.sessions.values()) {
      if (session.status === 'running' || session.status === 'paused') count++
    }
    return count
  }

  async execute(request: WorkflowExecuteRequest, ownerClientId: string): Promise<WorkflowExecuteResponse> {
    const workflow = this.deps.workflowStore.getWorkflow(request.workflowId)
    if (!workflow) {
      throw createErrorShape('NOT_FOUND', `工作流不存在: ${request.workflowId}`)
    }

    const executionId = randomUUID()
    const session = this.createSession(executionId, workflow, ownerClientId, request.input || {}, request.snapshot)

    this.sessions.set(executionId, session)
    void this.run(session)
    return { executionId, status: 'running' }
  }

  async debugNode(request: WorkflowDebugNodeRequest, ownerClientId: string): Promise<WorkflowDebugNodeResponse> {
    const startedAt = Date.now()
    const workflow = this.deps.workflowStore.getWorkflow(request.workflowId)
    if (!workflow) {
      throw createErrorShape('NOT_FOUND', `宸ヤ綔娴佷笉瀛樺湪: ${request.workflowId}`)
    }

    const snapshotNodes = request.snapshot?.nodes ? clone(request.snapshot.nodes) : clone(workflow.nodes)
    const snapshotEdges = request.snapshot?.edges ? clone(request.snapshot.edges) : clone(workflow.edges)
    const embeddedNode = request.embeddedNode ? clone(request.embeddedNode) : null
    const nodes = embeddedNode
      ? snapshotNodes.some((node) => node.id === request.nodeId)
        ? snapshotNodes.map((node) => node.id === request.nodeId ? embeddedNode : node)
        : [...snapshotNodes, embeddedNode]
      : snapshotNodes
    const targetNode = nodes.find((node) => node.id === request.nodeId)

    if (!targetNode) {
      return {
        status: 'error',
        error: `Debug node not found: ${request.nodeId}`,
        duration: Date.now() - startedAt,
      }
    }

    const session = this.createSession(
      `debug-${randomUUID()}`,
      workflow,
      ownerClientId,
      request.input || {},
      { nodes, edges: snapshotEdges },
      request.context,
    )

    try {
      session.context.__config__ = await this.loadPluginConfigs(workflow)
      session.status = 'running'
      await this.executeNode(session, targetNode)
      const step = [...session.steps].reverse().find((item) => item.nodeId === targetNode.id)

      if (step?.status === 'error') {
        return {
          status: 'error',
          error: step.error || session.lastErrorMessage || 'Debug node execution failed',
          duration: Date.now() - startedAt,
        }
      }

      return {
        status: 'completed',
        output: step?.output,
        duration: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startedAt,
      }
    }
  }

  private createSession(
    executionId: string,
    workflow: Workflow,
    ownerClientId: string,
    input: Record<string, unknown>,
    snapshot?: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    context?: Record<string, unknown>,
  ): ExecutionSession {
    return {
      id: executionId,
      workflow,
      ownerClientId,
      nodes: snapshot?.nodes ? clone(snapshot.nodes) : clone(workflow.nodes),
      edges: snapshot?.edges ? clone(snapshot.edges) : clone(workflow.edges),
      context: {
        ...(context ? clone(context) : {}),
        __data__: context?.__data__ && typeof context.__data__ === 'object' ? clone(context.__data__) : {},
        __input__: input,
      },
      status: 'idle',
      executionOrder: [],
      currentIndex: 0,
      pauseRequested: false,
      pauseReason: undefined,
      pauseNodeId: undefined,
      pauseBreakpoint: undefined,
      stopRequested: false,
      startedAt: Date.now(),
      steps: [],
      activeBranches: new Map(),
      persisted: false,
      lastUpdatedAt: Date.now(),
      eventSequence: 0,
      recentEvents: [],
      loopStack: [],
      breakpointBypassKeys: new Set(),
    }
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

    const previousPauseReason = session.pauseReason
    session.pauseRequested = false
    session.pauseReason = undefined
    session.pauseNodeId = undefined
    session.pauseBreakpoint = undefined
    session.status = 'running'
    const currentNode = session.executionOrder[session.currentIndex]
    if (previousPauseReason === 'breakpoint-start' && currentNode?.breakpoint === 'start') {
      session.breakpointBypassKeys.add(this.getBreakpointKey(currentNode.id, 'start'))
    }
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
        session.pauseReason = 'manual'
        session.pauseNodeId = session.executionOrder[i]?.id
        this.emitLog(session)
        this.emitEvent(session, 'workflow:paused', {
          executionId: session.id,
          workflowId: session.workflow.id,
          timestamp: Date.now(),
          status: 'paused',
          currentNodeId: session.executionOrder[i]?.id,
          reason: 'manual',
        })
        return
      }

      session.currentIndex = i
      const node = session.executionOrder[i]
      const nodeState = node.nodeState || 'normal'

      if (node.type === LOOP_BODY_NODE_TYPE && isGeneratedWorkflowNode(node)) {
        continue
      }

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

      if (this.shouldPauseAtBreakpoint(session, node, 'start')) {
        this.pauseAtBreakpoint(session, i, node, 'start')
        return
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

      if (this.shouldPauseAtBreakpoint(session, node, 'end')) {
        this.pauseAtBreakpoint(session, i + 1, node, 'end')
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

    const resolvedData = this.resolveContextVariables(session, this.applySelectedJsonPreset(node.data))
    if (!session.context.__inputs__) session.context.__inputs__ = {}
    session.context.__inputs__[node.id] = this.buildOutputObject(resolvedData.inputFields) ?? {}
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
      const presetOutput = this.getPresetOutput(resolvedData)
      if (presetOutput) {
        appendNodeLog('info', '使用 JSON 预设 outputs，跳过节点实际执行')
      }
      const result = presetOutput ?? await this.dispatchNode(session, node, resolvedData, appendNodeLog)
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
      this.emitLog(session)
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
      this.emitLog(session)
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
      case LOOP_BODY_NODE_TYPE:
      case 'sticky_note':
        return null
      case LOOP_BREAK_NODE_TYPE:
        return this.executeLoopBreak(session, appendNodeLog)
      case 'end':
        return this.buildOutputObject(resolvedData.outputs)
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
        return this.executeCode(
          session.context,
          String(resolvedData.code || ''),
          this.buildOutputObject(resolvedData.inputFields) ?? {},
        )
      case 'toast':
        return {
          message: String(resolvedData.message || ''),
          type: String(resolvedData.type || 'info'),
        }
      case 'switch':
        return this.executeSwitch(session, resolvedData.conditions || [])
      case 'variable_aggregate':
        return this.executeVariableAggregate(resolvedData.groups || [])
      case 'sub_workflow':
        return this.executeSubWorkflow(session, resolvedData, appendNodeLog)
      case LOOP_NODE_TYPE:
        return this.executeLoopNode(session, node, resolvedData, appendNodeLog)
      case 'agent_run':
        return this.executeAgentRun(session, node, resolvedData, appendNodeLog)
      default:
        if (isLocalBridgeWorkflowNode(node.type)) {
          return this.executeMainProcessNode(session, node, resolvedData, appendNodeLog)
        }
        if (this.deps.pluginRegistry.requiresMainProcessBridge(node.type)) {
          return this.executeMainProcessNode(session, node, resolvedData, appendNodeLog)
        }
        if (this.deps.clientNodeCache.hasClientNode(session.ownerClientId, node.type)) {
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

  private executeVariableAggregate(groups: any[]): Record<string, any> {
    if (!Array.isArray(groups)) return {}

    return groups.reduce<Record<string, any>>((result, group) => {
      const key = typeof group?.key === 'string' ? group.key.trim() : ''
      if (!key) return result
      const variables = Array.isArray(group.variables) ? group.variables : []
      result[key] = this.findFirstNonEmptyVariableValue(variables)
      return result
    }, {})
  }

  private findFirstNonEmptyVariableValue(variables: any[]): any {
    for (const variable of variables) {
      const value = variable?.value
      if (!this.isEmptyAggregateValue(value)) return value
    }
    return ''
  }

  private isEmptyAggregateValue(value: any): boolean {
    if (value === null || value === undefined || value === '') return true
    if (Array.isArray(value)) return value.length === 0
    if (typeof value === 'object') return Object.keys(value).length === 0
    return false
  }

  private executeLoopBreak(
    session: ExecutionSession,
    appendNodeLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Record<string, boolean> {
    const frame = this.getLoopFrame(session)
    if (!frame) {
      throw new Error('loop_break node can only execute inside a loop body')
    }

    frame.breakRequested = true
    appendNodeLog('info', 'Loop break requested')
    return { break: true }
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

  private executeCode(context: Record<string, any>, code: string, params: Record<string, any>): any {
    const normalizedCode = this.normalizeRunCode(code)
    const fn = new Function('context', 'params', `${normalizedCode}
if (typeof main === 'function') return main({ params, context })`)
    return fn(context, params)
  }

  private normalizeRunCode(code: string): string {
    return code
      .replace(/\basync\s+function\s+main\s*\(\s*\{\s*params\s*\}\s*:\s*Args\s*\)\s*:\s*Promise\s*<\s*Output\s*>/g, 'async function main({ params })')
      .replace(/\bfunction\s+main\s*\(\s*\{\s*params\s*\}\s*:\s*Args\s*\)\s*:\s*Output/g, 'function main({ params })')
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

  private async executeLoopNode(
    session: ExecutionSession,
    node: WorkflowNode,
    resolvedData: Record<string, any>,
    appendNodeLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<any> {
    const bodyNode = findCompositeChildByRole(session.nodes, node.id, LOOP_BODY_ROLE)
    if (!bodyNode) {
      throw new Error('循环节点缺少循环体节点')
    }

    const loopType = typeof resolvedData.loopType === 'string' ? resolvedData.loopType : 'count'
    const iterations = this.resolveLoopIterations(loopType, resolvedData)
    const sharedVariables = this.initializeLoopSharedVariables(resolvedData.sharedVariables)
    const items: unknown[] = []

    appendNodeLog('info', iterations.infinite ? '开始执行无限循环' : `开始执行循环，共 ${iterations.count} 次`)
    for (let index = 0; iterations.infinite || index < (iterations.count ?? 0); index++) {
      if (session.stopRequested) {
        throw new Error('执行已停止')
      }
      if (iterations.infinite && index > 0) {
        await sleep(0)
      }

      session.loopStack.push({
        loopNodeId: node.id,
        parentData: session.context.__data__,
        bodyAnchorId: bodyNode.id,
        variables: sharedVariables,
        metadata: {
          index,
          count: iterations.count,
          item: iterations.items[index],
          isFirst: index === 0,
          isLast: iterations.count !== null && index === iterations.count - 1,
        },
      })

      try {
        this.syncLoopContext(session)
        appendNodeLog('info', iterations.infinite ? `循环第 ${index + 1} 次` : `循环第 ${index + 1}/${iterations.count} 次`)
        const result = await this.executeLoopBody(session, bodyNode)
        items.push(this.normalizeLoopIterationResult(result))
        if (session.status === 'error') {
          break
        }
        if (this.getLoopFrame(session)?.breakRequested) {
          appendNodeLog('info', 'Loop break requested; stop after current loop body')
          break
        }
      } finally {
        session.loopStack.pop()
        this.syncLoopContext(session)
      }
    }

    appendNodeLog('info', '循环执行完成')
    const output = this.buildOutputObject(resolvedData.outputs) ?? {}
    return { ...output, items }
  }

  private async executeSubWorkflow(
    session: ExecutionSession,
    resolvedData: Record<string, any>,
    appendNodeLog: (level: ExecutionLogEntry['level'], message: string) => void,
  ): Promise<unknown> {
    const workflowId = typeof resolvedData.workflowId === 'string' ? resolvedData.workflowId : ''
    if (!workflowId) {
      throw new Error('sub_workflow node is missing workflowId')
    }
    if (workflowId === session.workflow.id) {
      throw new Error('sub_workflow cannot call the current workflow')
    }

    const workflow = this.deps.workflowStore.getWorkflow(workflowId)
    if (!workflow) {
      throw new Error(`sub_workflow target not found: ${workflowId}`)
    }

    appendNodeLog('info', `Start sub_workflow: ${workflow.name}`)
    const result = await this.executeEmbeddedWorkflow(
      session,
      {
        nodes: clone(workflow.nodes),
        edges: clone(workflow.edges),
      },
      this.buildOutputObject(resolvedData.inputFields) ?? {},
    )
    appendNodeLog('info', `Completed sub_workflow: ${workflow.name}`)
    return result
  }

  private resolveLoopIterations(loopType: string, resolvedData: Record<string, any>): LoopIterations {
    if (loopType === 'array') {
      const items = Array.isArray(resolvedData.arrayPath) ? resolvedData.arrayPath : []
      return { count: items.length, items, infinite: false }
    }

    if (loopType === 'infinite') {
      return { count: null, items: [], infinite: true }
    }

    const count = Math.max(0, Math.floor(Number(resolvedData.count) || 0))
    return {
      count,
      items: Array.from({ length: count }, () => undefined),
      infinite: false,
    }
  }

  private initializeLoopSharedVariables(sharedVariables: unknown): Record<string, unknown> {
    if (!Array.isArray(sharedVariables)) return {}

    const build = (fields: Array<Record<string, any>>): Record<string, unknown> => {
      const result: Record<string, unknown> = {}
      for (const field of fields) {
        if (!field?.key) continue
        if (field.type === 'object') {
          result[field.key] = build(Array.isArray(field.children) ? field.children : [])
          continue
        }
        result[field.key] = field.value ?? ''
      }
      return result
    }

    return build(sharedVariables as Array<Record<string, any>>)
  }

  private async executeLoopBody(session: ExecutionSession, bodyNode: WorkflowNode): Promise<unknown> {
    const bodyWorkflowData = bodyNode.data?.bodyWorkflow
    if (bodyWorkflowData && typeof bodyWorkflowData === 'object') {
      return this.executeEmbeddedWorkflow(
        session,
        normalizeEmbeddedWorkflow(bodyWorkflowData, () => randomUUID()),
      )
    }

    return this.executeScopedLoopBody(session, bodyNode)
  }

  private normalizeLoopIterationResult(result: unknown): Record<string, any> {
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, any>
    }
    return { result }
  }

  private async executeScopedLoopBody(session: ExecutionSession, bodyNode: WorkflowNode): Promise<unknown> {
    const scopeNodes = getNodesForExecutionScope(session.nodes, bodyNode.id)
    const scopeNodeIds = new Set(scopeNodes.map((node) => node.id))
    const bodyEdges = session.edges.filter((edge) => {
      if (edge.sourceHandle === LOOP_NEXT_SOURCE_HANDLE) return false
      const sourceIsEntry = edge.source === bodyNode.id && scopeNodeIds.has(edge.target)
      const scopedEdge = scopeNodeIds.has(edge.source) && scopeNodeIds.has(edge.target)
      return sourceIsEntry || scopedEdge
    })

    const adjacency = new Map<string, WorkflowEdge[]>()
    for (const edge of bodyEdges) {
      const edges = adjacency.get(edge.source) || []
      edges.push(edge)
      adjacency.set(edge.source, edges)
    }

    const visited = new Set<string>()
    const executeFrom = async (nodeId: string): Promise<unknown> => {
      const outgoing = adjacency.get(nodeId) || []
      let lastResult: unknown
      for (const edge of outgoing) {
        const activeHandle = session.activeBranches.get(edge.source)
        if (activeHandle !== undefined && edge.sourceHandle !== activeHandle) continue
        const nextNode = findWorkflowNode(scopeNodes, edge.target)
        if (!nextNode || visited.has(nextNode.id)) continue
        visited.add(nextNode.id)
        await this.executeNode(session, nextNode)
        lastResult = session.context.__data__?.[nextNode.id]
        const downstream = await executeFrom(nextNode.id)
        if (downstream !== undefined) {
          lastResult = downstream
        }
      }
      return lastResult
    }

    return executeFrom(bodyNode.id)
  }

  private async executeEmbeddedWorkflow(
    session: ExecutionSession,
    workflow: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
    input?: Record<string, any>,
  ): Promise<unknown> {
    const nodeMap = new Map(workflow.nodes.map((node) => [node.id, node]))
    const adjacency = new Map<string, WorkflowEdge[]>()

    for (const edge of workflow.edges) {
      const edges = adjacency.get(edge.source) || []
      edges.push(edge)
      adjacency.set(edge.source, edges)
    }

    const startNode = workflow.nodes.find((node) => node.type === 'start')
    if (!startNode) {
      throw new Error('循环体子工作流缺少开始节点')
    }

    if (input && Object.keys(input).length > 0) {
      if (!session.context.__data__) session.context.__data__ = {}
      session.context.__data__[startNode.id] = input
      if (!session.context.__inputs__) session.context.__inputs__ = {}
      session.context.__inputs__[startNode.id] = input
    }

    const visited = new Set<string>([startNode.id])

    const executeFrom = async (nodeId: string): Promise<unknown> => {
      const outgoing = adjacency.get(nodeId) || []
      let lastResult: unknown

      for (const edge of outgoing) {
        const activeHandle = session.activeBranches.get(edge.source)
        if (activeHandle !== undefined && edge.sourceHandle !== activeHandle) continue

        const nextNode = nodeMap.get(edge.target)
        if (!nextNode || visited.has(nextNode.id)) continue

        visited.add(nextNode.id)
        await this.executeNode(session, nextNode)

        if (nextNode.type !== 'start') {
          lastResult = session.context.__data__?.[nextNode.id]
        }

        const downstream = await executeFrom(nextNode.id)
        if (downstream !== undefined) {
          lastResult = downstream
        }
      }

      return lastResult
    }

    return executeFrom(startNode.id)
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

  private shouldPauseAtBreakpoint(session: ExecutionSession, node: WorkflowNode, breakpoint: 'start' | 'end'): boolean {
    if (node.breakpoint !== breakpoint) return false
    return !session.breakpointBypassKeys.has(this.getBreakpointKey(node.id, breakpoint))
  }

  private pauseAtBreakpoint(session: ExecutionSession, nextIndex: number, node: WorkflowNode, breakpoint: 'start' | 'end'): void {
    session.currentIndex = nextIndex
    session.status = 'paused'
    session.pauseReason = breakpoint === 'start' ? 'breakpoint-start' : 'breakpoint-end'
    session.pauseNodeId = node.id
    session.pauseBreakpoint = breakpoint
    this.emitLog(session)
    this.emitEvent(session, 'workflow:paused', {
      executionId: session.id,
      workflowId: session.workflow.id,
      timestamp: Date.now(),
      status: 'paused',
      currentNodeId: node.id,
      reason: session.pauseReason,
    })
  }

  private getBreakpointKey(nodeId: string, breakpoint: 'start' | 'end'): string {
    return `${nodeId}:${breakpoint}`
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

  private applySelectedJsonPreset(data: Record<string, any>): Record<string, any> {
    const selectedId = typeof data?.[SELECTED_JSON_PRESET_KEY] === 'string'
      ? data[SELECTED_JSON_PRESET_KEY]
      : ''
    if (!selectedId) return data

    const presets = Array.isArray(data?.[JSON_PRESETS_KEY]) ? data[JSON_PRESETS_KEY] as JsonPreset[] : []
    const preset = presets.find((item) => item?.id === selectedId)
    if (!preset || !this.isPlainObject(preset.data) || !this.isPlainObject(preset.inputs)) return data

    return {
      ...data,
      ...preset.data,
      inputFields: this.objectToOutputFields(preset.inputs),
      ...(this.isPlainObject(preset.outputs) && Object.keys(preset.outputs).length > 0
        ? { outputs: this.objectToOutputFields(preset.outputs) }
        : {}),
    }
  }

  private getPresetOutput(resolvedData: Record<string, any>): Record<string, any> | null {
    const selectedId = typeof resolvedData?.[SELECTED_JSON_PRESET_KEY] === 'string'
      ? resolvedData[SELECTED_JSON_PRESET_KEY]
      : ''
    if (!selectedId) return null

    const presets = Array.isArray(resolvedData?.[JSON_PRESETS_KEY])
      ? resolvedData[JSON_PRESETS_KEY] as JsonPreset[]
      : []
    const preset = presets.find((item) => item?.id === selectedId)
    if (!preset || !this.isPlainObject(preset.outputs) || Object.keys(preset.outputs).length === 0) {
      return null
    }

    return this.buildOutputObject(resolvedData.outputs) ?? {}
  }

  private objectToOutputFields(value: Record<string, any>): OutputField[] {
    return Object.entries(value).map(([key, fieldValue]) => {
      const type = this.inferOutputFieldType(fieldValue)
      const field: OutputField = { key, type }
      if (type === 'object' && this.isPlainObject(fieldValue)) {
        field.children = this.objectToOutputFields(fieldValue)
      } else {
        const fieldWithValue = field as OutputField & { value: any }
        fieldWithValue.value = fieldValue === undefined ? '' : fieldValue
      }
      return field
    })
  }

  private inferOutputFieldType(value: unknown): OutputField['type'] {
    if (typeof value === 'string') return 'string'
    if (typeof value === 'number') return 'number'
    if (typeof value === 'boolean') return 'boolean'
    if (this.isPlainObject(value)) return 'object'
    return 'any'
  }

  private isPlainObject(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
  }

  private buildOutputObject(outputs: OutputField[] | undefined): Record<string, any> | null {
    if (!Array.isArray(outputs) || outputs.length === 0) return null

    const result: Record<string, any> = {}
    for (const field of outputs) {
      if (!field.key) continue
      result[field.key] = field.type === 'object'
        ? this.buildOutputObject(field.children) ?? {}
        : field.value ?? ''
    }
    return result
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
    const loopVarMatch = value.match(/^\s*\{\{\s*__loop__\.vars\.([^}]+?)\s*\}\}\s*$/)
    if (loopVarMatch) {
      const result = this.getLoopVariableValue(session, loopVarMatch[1])
      return result ?? ''
    }

    const loopMetaMatch = value.match(/^\s*\{\{\s*__loop__\.(index|count|item|isFirst|isLast)\s*\}\}\s*$/)
    if (loopMetaMatch) {
      const result = this.getLoopMetaValue(session, loopMetaMatch[1])
      return result ?? ''
    }

    const dataMatch = value.match(/^\s*\{\{\s*__data__\[(["'])([^"']+)\1\]\.([^}]+?)\s*\}\}\s*$/)
    if (dataMatch) {
      const data = this.getNodeExecutionData(session, dataMatch[2])
      if (data != null) {
        const result = this.getNestedValue(data, dataMatch[3])
        if (result !== undefined) return result
      }
      return ''
    }

    const inputMatch = value.match(/^\s*\{\{\s*__inputs__\[(["'])([^"']+)\1\]\.([^}]+?)\s*\}\}\s*$/)
    if (inputMatch) {
      const inputData = session.context.__inputs__?.[inputMatch[2]]
      if (inputData != null) {
        const result = this.getNestedValue(inputData, inputMatch[3])
        if (result !== undefined) return result
      }
      return ''
    }

    const configMatch = value.match(/^\s*\{\{\s*__config__\[(["'])([^"']+)\1\]\[(["'])([^"']+)\3\](?:\.(\w+(?:\.\w+)*))?\s*\}\}\s*$/)
    if (configMatch) {
      const pluginConfig = session.context.__config__?.[configMatch[2]]
      if (pluginConfig != null) {
        let raw: any = pluginConfig[configMatch[4]]
        if (configMatch[5] && typeof raw === 'string') {
          try { raw = JSON.parse(raw) } catch { /* ignore */ }
        }
        const result = configMatch[5] ? this.getNestedValue(raw, configMatch[5]) : raw
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
      /\{\{\s*__loop__\.vars\.([^}]+?)\s*\}\}/g,
      (_match, path) => String(this.getLoopVariableValue(session, path) ?? ''),
    )

    text = text.replace(
      /\{\{\s*__loop__\.(index|count|item|isFirst|isLast)\s*\}\}/g,
      (_match, key) => String(this.getLoopMetaValue(session, key) ?? ''),
    )

    text = text.replace(
      /\{\{\s*__data__\[(["'])([^"']+)\1\]\.([^}]+?)\s*\}\}/g,
      (_match, _quote, nodeId, fieldPath) => {
        const data = this.getNodeExecutionData(session, nodeId)
        if (data == null) return ''
        return String(this.getNestedValue(data, fieldPath) ?? '')
      },
    )

    text = text.replace(
      /\{\{\s*__inputs__\[(["'])([^"']+)\1\]\.([^}]+?)\s*\}\}/g,
      (_match, _quote, nodeId, fieldPath) => {
        const inputData = session.context.__inputs__?.[nodeId]
        if (inputData == null) return ''
        return String(this.getNestedValue(inputData, fieldPath) ?? '')
      },
    )

    text = text.replace(
      /\{\{\s*__config__\[(["'])([^"']+)\1\]\[(["'])([^"']+)\3\](?:\.(\w+(?:\.\w+)*))?\s*\}\}/g,
      (_match, _pluginQuote, pluginId, _keyQuote, key, dotPath) => {
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

  private getLoopFrame(session: ExecutionSession): LoopExecutionFrame | null {
    return session.loopStack[session.loopStack.length - 1] || null
  }

  private syncLoopContext(session: ExecutionSession): void {
    const frame = this.getLoopFrame(session)
    if (!frame) {
      delete session.context.__loop__
      return
    }
    session.context.__loop__ = {
      vars: frame.variables,
      index: frame.metadata.index,
      count: frame.metadata.count,
      item: frame.metadata.item,
      isFirst: frame.metadata.isFirst,
      isLast: frame.metadata.isLast,
    }
  }

  private getLoopVariableValue(session: ExecutionSession, path: string): unknown {
    const frame = this.getLoopFrame(session)
    if (!frame) return undefined
    return this.getNestedValue(frame.variables, path)
  }

  private getLoopMetaValue(session: ExecutionSession, key: string): unknown {
    const frame = this.getLoopFrame(session)
    if (!frame) return undefined
    return frame.metadata[key as keyof LoopExecutionFrame['metadata']]
  }

  private getNodeExecutionData(session: ExecutionSession, nodeId: string): any {
    const frame = this.getLoopFrame(session)
    if (!frame) {
      return session.context.__data__?.[nodeId]
    }

    if (nodeId === frame.bodyAnchorId || nodeId === frame.loopNodeId) {
      return {
        $index: frame.metadata.index,
        $count: frame.metadata.count,
        $item: frame.metadata.item,
        $isFirst: frame.metadata.isFirst,
        $isLast: frame.metadata.isLast,
        ...frame.variables,
      }
    }

    return session.context.__data__?.[nodeId] ?? frame.parentData?.[nodeId]
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
      currentNodeId: session.pauseNodeId || session.executionOrder[session.currentIndex]?.id,
      pauseReason: session.pauseReason,
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
