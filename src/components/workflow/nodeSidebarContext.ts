import type { InjectionKey } from 'vue'

export interface NodeSidebarContext {
  openPluginPicker: () => void
}

export const NODE_SIDEBAR_CONTEXT_KEY: InjectionKey<NodeSidebarContext> =
  Symbol('nodeSidebarContext')
