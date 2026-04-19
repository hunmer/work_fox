<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ExternalLink, RefreshCw, Check, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const currentVersion = ref('')
const isChecking = ref(false)
const checkResult = ref<{ type: 'success' | 'error' | 'available'; message: string } | null>(null)

function openExternal(url: string) {
  window.api.openExternal(url)
}

async function loadVersion() {
  try {
    currentVersion.value = await window.api.getAppVersion()
  } catch {
    currentVersion.value = '0.0.1'
  }
}

async function checkForUpdates() {
  if (isChecking.value) return
  isChecking.value = true
  checkResult.value = null

  try {
    const resp = await fetch('https://api.github.com/repos/hunmer/work-fox/releases/latest')
    if (!resp.ok) throw new Error('网络错误')
    const data = await resp.json()
    const latest = data.tag_name?.replace(/^v/, '') || ''
    if (latest && latest !== currentVersion.value) {
      checkResult.value = { type: 'available', message: `发现新版本 v${latest}` }
    } else {
      checkResult.value = { type: 'success', message: '当前已是最新版本' }
    }
  } catch (e: unknown) {
    checkResult.value = { type: 'error', message: (e as Error).message || '检查更新失败' }
  } finally {
    isChecking.value = false
  }
}

onMounted(() => {
  loadVersion()
})
</script>

<template>
  <div class="relative flex flex-col items-center py-8 gap-6">
    <!-- 应用图标与版本 -->
    <div class="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center">
      <span class="text-3xl">🦊</span>
    </div>
    <div class="text-center">
      <h3 class="text-lg font-semibold">
        WorkFox
      </h3>
      <p class="text-xs text-muted-foreground mt-1">
        版本 v{{ currentVersion || '...' }}
      </p>
    </div>

    <!-- GitHub 链接 -->
    <button
      class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
      @click="openExternal('https://github.com/hunmer/work-fox')"
    >
      <ExternalLink class="w-3.5 h-3.5" />
      GitHub
    </button>

    <!-- 分割线 -->
    <div class="w-full max-w-sm border-t" />

    <!-- 检查更新按钮 -->
    <div class="flex flex-col items-center gap-3 w-full max-w-sm">
      <Button
        variant="outline"
        class="w-full gap-2"
        :disabled="isChecking"
        @click="checkForUpdates"
      >
        <Loader2
          v-if="isChecking"
          class="w-4 h-4 animate-spin"
        />
        <RefreshCw
          v-else
          class="w-4 h-4"
        />
        {{ isChecking ? '正在检查...' : '检查更新' }}
      </Button>

      <div
        v-if="checkResult"
        class="w-full text-center"
      >
        <Badge
          :variant="checkResult.type === 'error' ? 'destructive' : 'default'"
          class="gap-1"
        >
          <Check
            v-if="checkResult.type === 'success'"
            class="w-3 h-3"
          />
          {{ checkResult.message }}
        </Badge>
      </div>
    </div>
  </div>
</template>
