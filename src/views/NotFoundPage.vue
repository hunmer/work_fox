<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Home } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const router = useRouter()
</script>

<template>
  <div class="flex flex-col items-center justify-center h-full gap-4">
    <h1 class="text-6xl font-bold text-muted-foreground">404</h1>
    <p class="text-sm text-muted-foreground">页面不存在</p>
    <Button variant="outline" size="sm" @click="router.push('/home')">
      <Home class="w-4 h-4 mr-1" />
      返回主页
    </Button>
  </div>
</template>
