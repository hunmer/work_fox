// src/components/command-palette/providers/workflowProvider.ts
// 工作流搜索 Provider：通过 prefix "workflow" / "wf" 搜索工作流列表

import { Workflow } from 'lucide-vue-next'
import type { CommandProvider, CommandItem } from '@/types/command'
import { workflowBackendApi } from '@/lib/backend-api/workflow'
import type { Workflow as WorkflowType } from '@shared/workflow-types'

export interface WorkflowSelectHandler {
  (workflow: WorkflowType): void
}

export function createWorkflowProvider(
  onSelect: WorkflowSelectHandler,
): CommandProvider {
  return {
    id: 'workflow',
    prefix: 'workflow',
    prefixShort: 'wf',
    label: '工作流',
    icon: Workflow,
    async search(query: string): Promise<CommandItem[]> {
      let workflows: WorkflowType[]
      try {
        workflows = (await workflowBackendApi.list()) as WorkflowType[]
      } catch {
        return []
      }

      if (!workflows || workflows.length === 0) {
        return []
      }

      // 按关键词过滤
      const q = query.trim().toLowerCase()
      const filtered = q
        ? workflows.filter(
            (wf) =>
              wf.name.toLowerCase().includes(q) ||
              (wf.description && wf.description.toLowerCase().includes(q)),
          )
        : workflows

      // 按更新时间排序（最新在前）
      filtered.sort((a, b) => {
        const ta = typeof a.updatedAt === 'number' ? a.updatedAt : new Date(a.updatedAt).getTime()
        const tb = typeof b.updatedAt === 'number' ? b.updatedAt : new Date(b.updatedAt).getTime()
        return tb - ta
      })

      return filtered.map((wf) => ({
        id: `workflow-${wf.id}`,
        label: wf.name,
        description: wf.description || `${wf.nodes?.length ?? 0} 个节点`,
        icon: Workflow,
        keywords: [wf.name, wf.description ?? ''],
        run: () => onSelect(wf),
      }))
    },
  }
}
