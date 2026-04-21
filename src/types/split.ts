export type SplitLayoutType = 'single' | 'horizontal' | 'vertical'
export type SplitDirection = 'horizontal' | 'vertical'
export type SplitDropPosition = 'left' | 'right' | 'top' | 'bottom' | 'center'
export type SplitPresetType = 'single' | 'two-columns' | 'two-rows' | 'grid'

export interface PaneBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface SplitPane {
  id: string
  tabIds: string[]
  activeTabId?: string | null
}

export interface SplitLeafNode {
  type: 'leaf'
  pane: SplitPane
}

export interface SplitBranchNode {
  type: 'branch'
  direction: SplitDirection
  ratio: number
  first: SplitNode
  second: SplitNode
}

export type SplitNode = SplitLeafNode | SplitBranchNode

export interface SplitLayout {
  id: string
  root: SplitNode
}

export interface SavedSplitScheme {
  id: string
  name: string
  layout: SplitLayout
  createdAt: number
  updatedAt: number
}
