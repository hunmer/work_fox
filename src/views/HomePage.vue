<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useTabStore } from '@/stores/tab'
import WelcomePage from '@/components/workflow/WelcomePage.vue'

const router = useRouter()
const tabStore = useTabStore()

function handleNew() {
  tabStore.addTab()
  router.push('/editor')
}

function handleOpen() {
  router.push('/editor')
}

function handleImport() {
  router.push('/editor')
}
</script>

<template>
  <WelcomePage
    @new="handleNew"
    @open="handleOpen"
    @import="handleImport"
  />
</template>
