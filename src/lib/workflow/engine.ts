// src/lib/workflow/engine.ts
import { toRaw } from 'vue'
import type { WorkflowNode, WorkflowEdge, ExecutionLog, ExecutionStep, ExecutionLogEntry, ConditionItem } from './types'
import { getNodeDefinition } from './nodeRegistry'
import { executeAgentRunTask } from './agent-run'
import { pluginBackendApi } from '../backend-api/plugin'
import { workflowBackendApi } from '../backend-api/workflow'
import type { ExecutionEventChannel, ExecutionEventMap } from '@shared/execution-events'
import { createErrorShape } from '@shared/errors'
import { isLocalBridgeWorkflowNode } from '@shared/workflow-local-bridge'

export type EngineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error'

export class WorkflowEngine {
  private nodes: WorkflowNode[]
  private edges: WorkflowEdge[]
  private context: Record<string, any>
  private _status: EngineStatus = 'idle'
  private executionOrder: WorkflowNode[] = []
  private currentIndex = 0
  private pauseRequested = false
  private stopRequested = false
  private startTime = 0
  private steps: ExecutionStep[] = []
  private onLogUpdate?: (log: ExecutionLog) => void
  private onNodeStatusChange?: (nodeId: string, status: ExecutionStep['status']) => void
  private onEvent?: <Channel extends ExecutionEventChannel>(channel: Channel, payload: ExecutionEventMap[Channel]) => void
  private activeBranches: Map<string, string> = new Map() // switchNodeId -> selectedHandle
  private executionId = ''
  private lastErrorMessage?: string
  private runtimeConfig?: {
    workflowId?: string
    workflowName?: string
    workflowDescription?: string
    enabledPlugins?: string[]
    pluginConfigSchemes?: Record<string, string>
  }

  constructor(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    callbacks?: {
      onLogUpdate?: (log: ExecutionLog) => void
      onNodeStatusChange?: (nodeId: string, status: ExecutionStep['status']) => void
      onEvent?: <Channel extends ExecutionEventChannel>(channel: Channel, payload: ExecutionEventMap[Channel]) => void
    },
    runtimeConfig?: {
      workflowId?: string
      workflowName?: string
      workflowDescription?: string
      enabledPlugins?: string[]
      pluginConfigSchemes?: Record<string, string>
    },
  ) {
    this.nodes = nodes
    this.edges = edges
    this.context = {}
    this.onLogUpdate = callbacks?.onLogUpdate
    this.onNodeStatusChange = callbacks?.onNodeStatusChange
    this.onEvent = callbacks?.onEvent
    this.runtimeConfig = runtimeConfig
  }

  get status(): EngineStatus {
    return this._status
  }

  get currentContext(): Record<string, any> {
    return { ...this.context }
  }

  get currentLog(): ExecutionLog {
    return {
      id: this.executionId,
      workflowId: this.runtimeConfig?.workflowId || '',
      startedAt: this.startTime,
      status:
        this._status === 'running'
          ? 'running'
          : this._status === 'paused'
            ? 'paused'
            : this._status === 'completed'
              ? 'completed'
              : 'error',
      steps: [...this.steps],
      finishedAt:
        this._status !== 'running' && this._status !== 'paused' ? Date.now() : undefined,
    }
  }

  async start(): Promise<ExecutionLog> {
    this.reset()
    this.executionId = crypto.randomUUID()
    this.context.__config__ = await this.loadPluginConfigs()
    this.executionOrder = this.buildExecutionOrder()
    if (this.executionOrder.length === 0) {
      this._status = 'error'
      this.lastErrorMessage = '工作流为空或无法建立执行顺序'
      this.emitExecutionError()
      return this.currentLog
    }
    this._status = 'running'
    this.startTime = Date.now()
    this.emitEvent('workflow:started', {
      executionId: this.executionId,
      workflowId: this.runtimeConfig?.workflowId || '',
      timestamp: this.startTime,
      status: 'running',
      workflowName: this.runtimeConfig?.workflowName,
    })
    this.emitLogUpdate()
    this.emitContextUpdate()
    await this.runFromIndex(0)
    return this.currentLog
  }

  pause(): void {
    if (this._status === 'running') {
      this.pauseRequested = true
    }
  }

  async resume(): Promise<ExecutionLog> {
    if (this._status !== 'paused') return this.currentLog
    this._status = 'running'
    this.pauseRequested = false
    this.emitEvent('workflow:resumed', {
      executionId: this.executionId,
      workflowId: this.runtimeConfig?.workflowId || '',
      timestamp: Date.now(),
      status: 'running',
      currentNodeId: this.executionOrder[this.currentIndex]?.id,
    })
    this.emitLogUpdate()
    await this.runFromIndex(this.currentIndex)
    return this.currentLog
  }

  stop(): void {
    this.stopRequested = true
  }

  /** 调试单个节点 —— 不重置状态，复用已有 context 做变量解析 */
  async debugSingleNode(
    node: WorkflowNode,
    existingContext: Record<string, any> = {},
  ): Promise<{ status: 'completed' | 'error'; output?: any; error?: string; duration: number }> {
    this.context = { ...existingContext }
    if (!this.context.__data__) this.context.__data__ = {}
    this.context.__config__ = await this.loadPluginConfigs()
    const startTime = Date.now()
    try {
      const resolvedData = this.resolveContextVariables(node.data)
      const result = await this.dispatchNode(node, resolvedData)
      return { status: 'completed', output: result, duration: Date.now() - startTime }
    } catch (err: any) {
      return { status: 'error', error: err?.message || String(err), duration: Date.now() - startTime }
    }
  }

  private reset(): void {
    this.context = { __data__: {}, __config__: {} }
    this.steps = []
    this.currentIndex = 0
    this.pauseRequested = false
    this.stopRequested = false
    this._status = 'idle'
    this.startTime = 0
    this.executionId = ''
    this.lastErrorMessage = undefined
    this.activeBranches.clear()
  }

  /** 加载已启用插件的配置到 __config__ */
  private async loadPluginConfigs(): Promise<Record<string, Record<string, string>>> {
    const plugins = this.getReferencedPluginIds()
    const schemes = this.runtimeConfig?.pluginConfigSchemes
    if (!plugins.length) return {}

    const config: Record<string, Record<string, string>> = {}
    for (const pluginId of plugins) {
      try {
        const schemeName = schemes?.[pluginId]
        if (schemeName) {
          config[pluginId] = await workflowBackendApi.readPluginScheme(
            this.runtimeConfig!.workflowId!, pluginId, schemeName,
          )
        } else {
          config[pluginId] = await pluginBackendApi.getConfig(pluginId)
        }
      } catch (e) {
        console.warn(`[Engine] 加载插件 ${pluginId} 配置失败，使用默认值:`, e)
        try {
          config[pluginId] = await pluginBackendApi.getConfig(pluginId)
        } catch {
          config[pluginId] = {}
        }
      }
    }
    return config
  }

  private getReferencedPluginIds(): string[] {
    const pluginIds = new Set(this.runtimeConfig?.enabledPlugins || [])
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
    this.nodes.forEach((node) => collect(node.data))
    return [...pluginIds]
  }

  private async runFromIndex(startIndex: number): Promise<void> {
    for (let i = startIndex; i < this.executionOrder.length; i++) {
      if (this.stopRequested) {
        this._status = 'error'
        this.lastErrorMessage = '执行已停止'
        this.emitLogUpdate()
        this.emitExecutionError()
        return
      }

      if (this.pauseRequested) {
        this.currentIndex = i
        this._status = 'paused'
        this.pauseRequested = false
        this.emitLogUpdate()
        this.emitEvent('workflow:paused', {
          executionId: this.executionId,
          workflowId: this.runtimeConfig?.workflowId || '',
          timestamp: Date.now(),
          status: 'paused',
          currentNodeId: this.executionOrder[i]?.id,
        })
        return
      }

      this.currentIndex = i
      const node = this.executionOrder[i]
      const nodeState = node.nodeState || 'normal'

      // 检查节点是否在活跃分支路径上
      if (this.activeBranches.size > 0 && !this.isNodeReachable(node.id)) {
        this.recordSkippedStep(node, '非活跃分支')
        continue
      }

      // 禁用状态：中止执行
      if (nodeState === 'disabled') {
        this.recordSkippedStep(node, '节点已禁用，工作流中止')
        this._status = 'error'
        this.lastErrorMessage = '节点已禁用，工作流中止'
        this.emitLogUpdate()
        this.emitExecutionError()
        return
      }

      // 跳过状态：跳过该节点，继续执行下一个
      if (nodeState === 'skipped') {
        this.recordSkippedStep(node, '节点已跳过')
        continue
      }

      await this.executeNode(node)
    }

    this._status = this.stopRequested ? 'error' : 'completed'
    this.emitLogUpdate()
    this.emitContextUpdate()
    if (this._status === 'completed') {
      this.emitEvent('workflow:completed', {
        executionId: this.executionId,
        workflowId: this.runtimeConfig?.workflowId || '',
        timestamp: Date.now(),
        status: 'completed',
        log: this.currentLog,
        context: this.currentContext,
      })
    } else {
      this.lastErrorMessage = this.lastErrorMessage || '工作流执行失败'
      this.emitExecutionError()
    }
  }

  /** 记录被跳过/禁用的节点步骤 */
  private recordSkippedStep(node: WorkflowNode, reason: string): void {
    const step: ExecutionStep = {
      nodeId: node.id,
      nodeLabel: node.label,
      startedAt: Date.now(),
      finishedAt: Date.now(),
      status: 'skipped',
      error: reason,
    }
    this.steps.push(step)
    this.onNodeStatusChange?.(node.id, 'skipped')
    this.emitLogUpdate()
  }

  private async executeNode(node: WorkflowNode): Promise<void> {
    // 执行前延迟
    const delay = typeof node.data?._delay === 'number' ? node.data._delay : 0
    if (delay > 0) {
      await this.sleep(delay)
      // 延迟期间可能收到 stop/pause 请求
      if (this.stopRequested || this.pauseRequested) return
    }

    const resolvedData = this.resolveContextVariables(node.data)
    const step: ExecutionStep = {
      nodeId: node.id,
      nodeLabel: node.label,
      startedAt: Date.now(),
      status: 'running',
      input: resolvedData,
    }
    this.steps.push(step)
    this.onNodeStatusChange?.(node.id, 'running')
    this.emitEvent('node:start', {
      executionId: this.executionId,
      workflowId: this.runtimeConfig?.workflowId || '',
      timestamp: Date.now(),
      nodeId: node.id,
      nodeLabel: node.label,
      input: resolvedData,
    })
    this.emitLogUpdate()

    try {
      const result = await this.dispatchNode(node, resolvedData)
      step.finishedAt = Date.now()
      step.status = 'completed'
      // 提取 handler 日志
      if (result && Array.isArray(result._logs)) {
        step.logs = result._logs as ExecutionLogEntry[]
        const { _logs, ...rest } = result
        step.output = rest
      } else {
        step.output = result
      }
      this.context[node.id] = step.output
      if (!this.context.__data__) this.context.__data__ = {}
      this.context.__data__[node.id] = result
      this.emitContextUpdate()
      // switch 节点记录活跃分支
      if (node.type === 'switch' && result?.__branch__) {
        this.activeBranches.set(node.id, result.__branch__)
      }
      this.onNodeStatusChange?.(node.id, 'completed')
      this.emitEvent('node:complete', {
        executionId: this.executionId,
        workflowId: this.runtimeConfig?.workflowId || '',
        timestamp: Date.now(),
        nodeId: node.id,
        step: { ...step },
      })
    } catch (err: any) {
      step.finishedAt = Date.now()
      step.status = 'error'
      step.error = err?.message || String(err)
      this._status = 'error'
      this.lastErrorMessage = step.error
      this.onNodeStatusChange?.(node.id, 'error')
      this.emitEvent('node:error', {
        executionId: this.executionId,
        workflowId: this.runtimeConfig?.workflowId || '',
        timestamp: Date.now(),
        nodeId: node.id,
        step: { ...step },
        error: createErrorShape('WORKFLOW_ERROR', step.error || '节点执行失败'),
      })
    }

    this.emitLogUpdate()
  }

  private async dispatchNode(node: WorkflowNode, resolvedData: Record<string, any>): Promise<any> {
    const def = getNodeDefinition(node.type)
    if (!def) throw new Error(`未知节点类型: ${node.type}`)

    switch (node.type) {
      case 'start':
        return null
      case 'end':
        return null
      case 'gallery_preview':
        // 展示节点仅消费已解析的数据供画布渲染，不调用外部工具。
        return { items: Array.isArray(resolvedData.items) ? resolvedData.items : [] }
      case 'music_player':
        // 音乐播放节点：将解析后的数据传递给画布渲染。
        return {
          tracks: Array.isArray(resolvedData.tracks) ? resolvedData.tracks : [],
          volume: typeof resolvedData.volume === 'number' ? resolvedData.volume : 80,
          loop: !!resolvedData.loop,
        }
      case 'run_code':
        return this.executeCode(resolvedData.code || '')
      case 'toast':
        return this.executeToast(resolvedData.message || '', resolvedData.type || 'info')
      case 'switch':
        return this.executeSwitch(resolvedData.conditions || [])
      case 'agent_run':
        return this.executeAgentRun(resolvedData)
      default:
        return this.executeCustomNode(node.type, resolvedData)
    }
  }

  private executeCode(code: string): any {
    const fn = new Function('context', code)
    return fn(this.context)
  }

  private executeToast(message: string, type: string): any {
    try {
      // vue-sonner 动态导入
      const { toast } = require('vue-sonner') as { toast: Record<string, (msg: string) => void> }
      const toastFn = toast[type] || toast.info
      toastFn(message)
    } catch {
      console.log(`[Toast ${type}] ${message}`)
    }
    return { message, type }
  }

  private async executeAgentRun(data: Record<string, any>): Promise<any> {
    return executeAgentRunTask(data, this.runtimeConfig)
  }

  private executeSwitch(conditions: ConditionItem[]): any {
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i]
      const variable = this.resolveStringValue(cond.variable)
      const value = this.resolveStringValue(cond.value)
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

  private isNodeReachable(nodeId: string, visited?: Set<string>): boolean {
    const v = visited || new Set<string>()
    if (v.has(nodeId)) return false
    v.add(nodeId)

    const incoming = this.edges.filter((e) => e.target === nodeId)
    if (incoming.length === 0) return true

    for (const edge of incoming) {
      const activeHandle = this.activeBranches.get(edge.source)
      if (activeHandle !== undefined) {
        if (edge.sourceHandle !== activeHandle) continue
      }
      if (this.isNodeReachable(edge.source, v)) return true
    }
    return false
  }

  private async executeCustomNode(toolType: string, params: Record<string, any>): Promise<any> {
    if (!isLocalBridgeWorkflowNode(toolType)) {
      return pluginBackendApi.executeTool(toolType, params)
    }
    return this.executeBrowserTool(toolType, params)
  }

  private async executeBrowserTool(toolType: string, params: Record<string, any>): Promise<any> {
    const api = (window as any).api
    if (!api?.agent?.execTool) {
      throw new Error(`agent.execTool IPC 通道不可用，无法执行工具: ${toolType}`)
    }
    // Vue reactive Proxy 无法通过 IPC 结构化克隆，需先转为纯对象
    const rawParams = JSON.parse(JSON.stringify(params, (_, v) => toRaw(v)))
    return api.agent.execTool(toolType, rawParams)
  }

  private resolveContextVariables(data: Record<string, any>): Record<string, any> {
    return this.resolveValue(data)
  }

  private resolveValue(value: any): any {
    if (typeof value === 'string') {
      return this.resolveStringValue(value)
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.resolveValue(item))
    }
    if (value && typeof value === 'object') {
      const resolved: Record<string, any> = {}
      for (const [key, nested] of Object.entries(value)) {
        resolved[key] = this.resolveValue(nested)
      }
      return resolved
    }
    return value
  }

  /**
   * 解析字符串中的变量引用。
   * - 纯变量引用（整个值只有一个 {{ }}）→ 保留原始类型（number/boolean/object 等）
   * - 混合文本（变量和文字混排）→ 字符串插值
   */
  private resolveStringValue(value: string): any {
    // 纯 __data__ 变量 → 保留原始类型
    const dataMatch = value.match(/^\s*\{\{\s*__data__\["([^"]+)"\]\.([^}]+?)\s*\}\}\s*$/)
    if (dataMatch) {
      const data = this.context.__data__?.[dataMatch[1]]
      if (data != null) {
        const result = this.getNestedValue(data, dataMatch[2])
        if (result !== undefined) return result
      }
      return ''
    }

    // Pure __config__ variable → preserve original type
    const configMatch = value.match(/^\s*\{\{\s*__config__\["([^"]+)"\]\["([^"]+)"\](?:\.(\w+(?:\.\w+)*))?\s*\}\}\s*$/)
    if (configMatch) {
      const pluginConfig = this.context.__config__?.[configMatch[1]]
      if (pluginConfig != null) {
        let raw: any = pluginConfig[configMatch[2]]
        if (configMatch[3] && typeof raw === 'string') {
          try { raw = JSON.parse(raw) } catch { /* not JSON, use as-is */ }
        }
        const result = configMatch[3] ? this.getNestedValue(raw, configMatch[3]) : raw
        if (result !== undefined) return result
      }
      return ''
    }

    // 纯 context 变量 → 保留原始类型
    const ctxMatch = value.match(/^\s*\{\{\s*context\.([^}]+?)\s*\}\}\s*$/)
    if (ctxMatch) {
      const result = this.getContextValue(ctxMatch[1])
      return result ?? ''
    }

    // 混合文本 → 字符串插值
    let str = value.replace(
      /\{\{\s*__data__\["([^"]+)"\]\.([^}]+?)\s*\}\}/g,
      (_, nodeId, fieldPath) => {
        const data = this.context.__data__?.[nodeId]
        if (data == null) return ''
        return String(this.getNestedValue(data, fieldPath) ?? '')
      },
    )
    str = str.replace(
      /__config__\["([^"]+)"\]\["([^"]+)"\](?:\.(\w+(?:\.\w+)*))?/g,
      (_, pluginId, key, dotPath) => {
        const pluginConfig = this.context.__config__?.[pluginId]
        if (pluginConfig == null) return ''
        let raw: any = pluginConfig[key]
        if (dotPath && typeof raw === 'string') {
          try { raw = JSON.parse(raw) } catch { /* not JSON */ }
        }
        return String((dotPath ? this.getNestedValue(raw, dotPath) : raw) ?? '')
      },
    )
    str = str.replace(/\{\{\s*context\.([^}]+?)\s*\}\}/g, (_, path) => {
      return String(this.getContextValue(path) ?? '')
    })
    return str
  }

  /** 按点号路径获取嵌套值 */
  private getNestedValue(obj: any, path: string): any {
    const parts = path.split('.')
    let current = obj
    for (const part of parts) {
      if (current == null) return undefined
      current = current[part]
    }
    return current
  }

  private getContextValue(path: string): any {
    const parts = path.split('.')
    let current: any = this.context
    for (const part of parts) {
      if (current == null) return undefined
      current = current[part]
    }
    return current
  }

  private buildExecutionOrder(): WorkflowNode[] {
    const nodeMap = new Map(this.nodes.map((n) => [n.id, n]))
    const inDegree = new Map(this.nodes.map((n) => [n.id, 0]))

    for (const edge of this.edges) {
      const deg = inDegree.get(edge.target) ?? 0
      inDegree.set(edge.target, deg + 1)
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }

    const order: WorkflowNode[] = []
    while (queue.length > 0) {
      const id = queue.shift()!
      const node = nodeMap.get(id)
      if (node) order.push(node)

      for (const edge of this.edges) {
        if (edge.source === id) {
          const deg = (inDegree.get(edge.target) ?? 1) - 1
          inDegree.set(edge.target, deg)
          if (deg === 0) queue.push(edge.target)
        }
      }
    }

    return order
  }

  private emitLogUpdate(): void {
    const log = this.currentLog
    this.onLogUpdate?.(log)
    this.emitEvent('execution:log', {
      executionId: this.executionId,
      workflowId: this.runtimeConfig?.workflowId || '',
      timestamp: Date.now(),
      log,
    })
  }

  private emitContextUpdate(): void {
    this.emitEvent('execution:context', {
      executionId: this.executionId,
      workflowId: this.runtimeConfig?.workflowId || '',
      timestamp: Date.now(),
      context: this.currentContext,
    })
  }

  private emitExecutionError(): void {
    this.emitEvent('workflow:error', {
      executionId: this.executionId,
      workflowId: this.runtimeConfig?.workflowId || '',
      timestamp: Date.now(),
      status: 'error',
      error: createErrorShape('WORKFLOW_ERROR', this.lastErrorMessage || '工作流执行失败'),
      log: this.currentLog,
    })
  }

  private emitEvent<Channel extends ExecutionEventChannel>(channel: Channel, payload: ExecutionEventMap[Channel]): void {
    this.onEvent?.(channel, payload)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
