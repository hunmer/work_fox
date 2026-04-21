// electron/services/workflow-node-registry.ts
import type { PluginWorkflowNode, PluginToolResult, PluginNodeContext } from './plugin-types'

type NodeHandler = (ctx: PluginNodeContext, args: Record<string, any>) => Promise<PluginToolResult>

/** Agent 工具 schema（Anthropic function calling 格式） */
export interface AgentToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

type AgentToolHandler = (name: string, args: Record<string, any>, api: Record<string, any>) => Promise<any>

/** 插件注册的节点条目 */
interface PluginNodeEntry {
  pluginId: string
  nodes: PluginWorkflowNode[]
  handlers: Map<string, NodeHandler>
  api?: Record<string, any>
  agentTools?: AgentToolDefinition[]
  agentToolHandler?: AgentToolHandler
}

class WorkflowNodeRegistry {
  private entries: Map<string, PluginNodeEntry> = new Map()

  /** 注册内置基础节点 */
  registerBuiltinNodes(nodes: PluginWorkflowNode[]): void {
    const existing = this.entries.get('__builtin__')
    if (existing) {
      existing.nodes = nodes
    } else {
      this.entries.set('__builtin__', { pluginId: '__builtin__', nodes, handlers: new Map() })
    }
    console.log(`[WorkflowNodeRegistry] 内置节点注册完成: ${nodes.length} 个`)
  }

  /** 注册插件的工作流节点 */
  register(pluginId: string, workflowModule: { nodes: PluginWorkflowNode[] | Array<Record<string, unknown>> }): void {
    const nodes: PluginWorkflowNode[] = []
    const handlers = new Map<string, NodeHandler>()

    for (const node of workflowModule.nodes as PluginWorkflowNode[]) {
      if (node.handler) {
        handlers.set(node.type, node.handler)
      }
      nodes.push({ ...node, handler: undefined })
    }

    this.entries.set(pluginId, { pluginId, nodes, handlers })
    console.log(`[WorkflowNodeRegistry] 插件 ${pluginId} 注册了 ${nodes.length} 个节点`)
  }

  /** 注册插件的 API（由 api.js 提供） */
  registerApi(pluginId: string, api: Record<string, any>): void {
    const entry = this.entries.get(pluginId)
    if (entry) {
      entry.api = api
    }
  }

  /** 注册插件的 Agent 工具（由 tools.js 提供） */
  registerAgentTools(pluginId: string, toolsModule: { tools: AgentToolDefinition[]; handler: AgentToolHandler }): void {
    const entry = this.entries.get(pluginId)
    if (entry) {
      entry.agentTools = toolsModule.tools
      entry.agentToolHandler = toolsModule.handler
    }
    console.log(`[WorkflowNodeRegistry] 插件 ${pluginId} 注册了 ${toolsModule.tools.length} 个 Agent 工具`)
  }

  /** 卸载插件的工作流节点 */
  unregister(pluginId: string): void {
    this.entries.delete(pluginId)
  }

  /** 获取指定插件的节点定义（序列化安全，不含 handler） */
  getPluginNodes(pluginId: string): PluginWorkflowNode[] {
    return this.entries.get(pluginId)?.nodes || []
  }

  /** 获取所有已注册插件的节点定义 */
  getAllPluginNodes(): Array<{ pluginId: string; nodes: PluginWorkflowNode[] }> {
    return Array.from(this.entries.values()).map((e) => ({
      pluginId: e.pluginId,
      nodes: e.nodes,
    }))
  }

  /** 查找节点 handler */
  getHandler(nodeType: string): NodeHandler | undefined {
    for (const entry of this.entries.values()) {
      const handler = entry.handlers.get(nodeType)
      if (handler) return handler
    }
    return undefined
  }

  /** 查找节点所属插件的 API */
  getApiForNodeType(nodeType: string): Record<string, any> | undefined {
    for (const entry of this.entries.values()) {
      if (entry.handlers.has(nodeType)) {
        return entry.api
      }
    }
    return undefined
  }

  /** 获取指定插件列表的 Agent 工具 schema */
  getAgentTools(pluginIds: string[]): AgentToolDefinition[] {
    const result: AgentToolDefinition[] = []
    for (const pluginId of pluginIds) {
      const entry = this.entries.get(pluginId)
      if (entry?.agentTools) {
        result.push(...entry.agentTools)
      }
    }
    return result
  }

  /** 获取指定插件列表的 Agent 工具及来源插件 */
  getAgentToolsWithPluginIds(pluginIds: string[]): Array<AgentToolDefinition & { pluginId: string }> {
    const result: Array<AgentToolDefinition & { pluginId: string }> = []
    for (const pluginId of pluginIds) {
      const entry = this.entries.get(pluginId)
      if (!entry?.agentTools) {
        continue
      }
      for (const tool of entry.agentTools) {
        result.push({ ...tool, pluginId })
      }
    }
    return result
  }

  /** 查找 Agent 工具的 handler 和 api */
  getAgentToolHandler(toolName: string): { pluginId: string; handler: AgentToolHandler; api: Record<string, any> } | undefined {
    for (const entry of this.entries.values()) {
      if (entry.agentTools?.some(t => t.name === toolName) && entry.agentToolHandler) {
        return { pluginId: entry.pluginId, handler: entry.agentToolHandler, api: entry.api || {} }
      }
    }
    return undefined
  }

  /** 获取所有注册的节点类型列表（含插件 ID） */
  getRegisteredTypes(): Array<{ pluginId: string; type: string }> {
    const result: Array<{ pluginId: string; type: string }> = []
    for (const entry of this.entries.values()) {
      for (const node of entry.nodes) {
        result.push({ pluginId: entry.pluginId, type: node.type })
      }
    }
    return result
  }
}

export const workflowNodeRegistry = new WorkflowNodeRegistry()
