import type { ComputedRef, InjectionKey, Raw, Ref } from 'vue'
import type { ConnectionMode, NodeDragEvent } from '@vue-flow/core'
import type CustomNodeWrapper from './CustomNodeWrapper.vue'
import type GroupNode from './GroupNode.vue'
import type CustomEdge from './CustomEdge.vue'

export interface WorkflowCanvasContext {
  flowId: string
  nodes: ComputedRef<any[]>
  edges: ComputedRef<any[]>
  nodeTypes: Record<string, Raw<typeof CustomNodeWrapper> | Raw<typeof GroupNode>>
  edgeTypes: Record<string, Raw<typeof CustomEdge>>
  connectionMode: ConnectionMode
  nodesDraggable: ComputedRef<boolean>
  nodesConnectable: ComputedRef<boolean>
  edgesUpdatable: ComputedRef<boolean>
  minimapVisible: ComputedRef<boolean>
  helperLineHorizontal: Ref<number | undefined>
  helperLineVertical: Ref<number | undefined>
  onConnect: (params: any) => void
  onConnectStart: (params: { nodeId?: string; handleId?: string | null }) => void
  onConnectEnd: (event?: MouseEvent) => void
  onDragOver: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
  onNodeClick: (payload: any) => void
  onNodeDrag: (event: NodeDragEvent) => void
  onNodeDragStop: (event: NodeDragEvent) => void
  onPaneClick: () => void
  onNodesInitialized: (nodes: any[]) => void
  onEdgeInsertNode: (edgeId: string, sourceId: string, targetId: string, sourceHandle: string | null) => void
  syncScopeBoundaryLayout: (scopeNodeId: string) => void
  fitView: () => void
  getViewport: () => { x: number; y: number; zoom: number }
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void
  openNodeSelectAtPosition: (event: MouseEvent) => void
  openNodeInfoDialog: (nodeId: string, options?: { hostNodeId?: string }) => void
  openGroupPickerDialog: (nodeId: string) => void
}

export const WORKFLOW_CANVAS_CONTEXT_KEY: InjectionKey<WorkflowCanvasContext> =
  Symbol('workflowCanvasContext')
