import type { AgentToolDefinition } from '../../shared/plugin-types'
import type { NodeTypeDefinition } from '../../shared/workflow-types'

interface ClientRegistration {
  nodes: NodeTypeDefinition[]
  tools: AgentToolDefinition[]
}

export class ClientNodeCache {
  private registrations = new Map<string, ClientRegistration>()

  registerNodes(clientId: string, nodes: Array<Record<string, unknown>>): void {
    const current = this.registrations.get(clientId) ?? { nodes: [], tools: [] }
    current.nodes = nodes as unknown as NodeTypeDefinition[]
    this.registrations.set(clientId, current)
  }

  registerTools(clientId: string, tools: AgentToolDefinition[]): void {
    const current = this.registrations.get(clientId) ?? { nodes: [], tools: [] }
    current.tools = tools
    this.registrations.set(clientId, current)
  }

  unregisterClient(clientId: string): void {
    this.registrations.delete(clientId)
  }

  getAllNodes(): NodeTypeDefinition[] {
    return Array.from(this.registrations.values()).flatMap((entry) => entry.nodes)
  }

  getAllTools(): AgentToolDefinition[] {
    return Array.from(this.registrations.values()).flatMap((entry) => entry.tools)
  }

  hasClientTool(toolName: string): boolean {
    return this.getAllTools().some((tool) => tool.name === toolName)
  }
}
