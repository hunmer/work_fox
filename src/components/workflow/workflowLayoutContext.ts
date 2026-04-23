import type { InjectionKey } from 'vue'

export interface WorkflowExecBarLayout {
  getExpanded: () => boolean
  setExpanded: (expanded: boolean) => void
}

export const WORKFLOW_EXEC_BAR_LAYOUT_KEY: InjectionKey<WorkflowExecBarLayout> =
  Symbol('WORKFLOW_EXEC_BAR_LAYOUT')
