export interface SuggestionItem {
  id: string
  label: string
  description?: string
}

export interface SuggestionState {
  active: boolean
  type: 'file' | 'skill' | 'mcp' | null
  items: SuggestionItem[]
  selectedIndex: number
  query: string
  clientRect: (() => DOMRect | undefined) | null
  command: ((props: Record<string, string>) => void) | null
}

/** Mention 节点在文档中的类型名称 */
export const MENTION_NODE_TYPES = {
  file: 'fileMention',
  skill: 'skillMention',
  mcp: 'mcpMention',
} as const

export type MentionNodeType = (typeof MENTION_NODE_TYPES)[keyof typeof MENTION_NODE_TYPES]
