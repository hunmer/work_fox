import { ref } from 'vue'

export function createDirtyTracker() {
  const isDirty = ref(false)
  function markDirty(): void { isDirty.value = true }
  function markClean(): void { isDirty.value = false }
  return { isDirty, markDirty, markClean }
}
