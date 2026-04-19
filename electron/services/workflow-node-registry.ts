// electron/services/workflow-node-registry.ts
import type { PluginWorkflowNode, PluginToolResult, PluginNodeContext } from './plugin-types'

type NodeHandler = (ctx: PluginNodeContext, args: Record<string, any>) => Promise<PluginToolResult>

/** 插件注册的节点条目 */
interface PluginNodeEntry {
  pluginId: string
  nodes: PluginWorkflowNode[]
  handlers: Map<string, NodeHandler>
}

class WorkflowNodeRegistry {
  private entries: Map<string, PluginNodeEntry> = new Map()

  /** 注册插件的工作流节点 */
  register(pluginId: string, workflowModule: { nodes: PluginWorkflowNode[] }): void {
    const nodes: PluginWorkflowNode[] = []
    const handlers = new Map<string, NodeHandler>()

    for (const node of workflowModule.nodes) {
      if (node.handler) {
        handlers.set(node.type, node.handler)
      }
      // handler 不序列化，只保留定义数据
      nodes.push({ ...node, handler: undefined })
    }

    this.entries.set(pluginId, { pluginId, nodes, handlers })
    console.log(`[WorkflowNodeRegistry] 插件 ${pluginId} 注册了 ${nodes.length} 个节点`)
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
