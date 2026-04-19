import { ref } from 'vue'
import type { Ref } from 'vue'
import type { WorkflowStore } from '@/stores/workflow'
import { useNotification } from '@/composables/useNotification'

export function useWorkflowFileActions(
  store: WorkflowStore,
  listDialogOpen: Ref<boolean>,
) {
  const notify = useNotification()

  const isEditingName = ref(false)
  const editingName = ref('')

  function openWorkflow() {
    listDialogOpen.value = true
  }

  function startEditName() {
    if (!store.currentWorkflow) return
    editingName.value = store.currentWorkflow.name || ''
    isEditingName.value = true
  }

  function finishEditName() {
    if (!store.currentWorkflow || !isEditingName.value) return
    const trimmed = editingName.value.trim()
    if (trimmed) {
      store.currentWorkflow.name = trimmed
    }
    isEditingName.value = false
  }

  function cancelEditName() {
    isEditingName.value = false
  }

  async function saveWorkflow() {
    if (store.currentWorkflow) {
      await store.saveWorkflow(store.currentWorkflow)
    }
  }

  async function exportWorkflow() {
    const wf = store.currentWorkflow
    if (!wf) return
    const exportData = {
      name: wf.name,
      description: wf.description,
      nodes: wf.nodes,
      edges: wf.edges,
    }
    const result = await (window as any).api.workflow.exportSaveFile(JSON.stringify(exportData, null, 2))
    if (result?.success) {
      notify.success('工作流已导出')
    }
  }

  async function importWorkflow() {
    const result = await (window as any).api.workflow.importOpenFile()
    if (!result?.json) return
    try {
      const data = JSON.parse(result.json)
      if (!data.nodes || !data.edges) {
        notify.error('无效的工作流文件')
        return
      }
      store.newWorkflow()
      const wf = store.currentWorkflow!
      wf.name = data.name || '导入的工作流'
      wf.description = data.description
      wf.nodes = data.nodes
      wf.edges = data.edges
      notify.success('工作流已导入')
    } catch {
      notify.error('解析工作流文件失败')
    }
  }

  async function onListSelect(workflow: any) {
    if (workflow) {
      await store.loadData()
      store.currentWorkflow = store.workflows.find((w) => w.id === workflow.id) || workflow
      store.selectedNodeId = null
    }
  }

  return {
    isEditingName,
    editingName,
    openWorkflow,
    startEditName,
    finishEditName,
    cancelEditName,
    saveWorkflow,
    exportWorkflow,
    importWorkflow,
    onListSelect,
  }
}
