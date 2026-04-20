<template>
  <div class="p-6 space-y-6 max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Gallery</h1>
        <p class="text-sm text-muted-foreground mt-1">共 {{ filteredItems.length }} 项{{ activeFilter !== 'all' ? `（筛选：${filterLabel}）` : '' }}</p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Filter -->
        <div class="flex rounded-lg border overflow-hidden">
          <button
            v-for="f in filters"
            :key="f.value"
            @click="activeFilter = f.value"
            :class="[
              'px-3 py-1.5 text-xs font-medium transition-colors',
              activeFilter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            ]"
          >
            {{ f.label }}
          </button>
        </div>
        <!-- Layout toggle -->
        <div class="flex rounded-lg border overflow-hidden">
          <button
            v-for="l in layouts"
            :key="l.value"
            @click="layout = l.value"
            :class="[
              'p-1.5 transition-colors',
              layout === l.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-background hover:bg-muted'
            ]"
          >
            <component :is="l.icon" class="size-4" />
          </button>
        </div>
      </div>
    </div>

    <GalleryViewer :items="filteredItems" :layout="layout" @init="onGalleryInit" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { LayoutGrid, Columns3 } from 'lucide-vue-next'
import GalleryViewer from '@/components/gallery/GalleryViewer.vue'
import type { GalleryItem } from '@/components/gallery/GalleryViewer.vue'

const activeFilter = ref<'all' | 'image' | 'video'>('all')
const layout = ref<'grid' | 'masonry'>('grid')

const filters = [
  { label: '全部', value: 'all' as const },
  { label: '图片', value: 'image' as const },
  { label: '视频', value: 'video' as const },
]

const layouts = [
  { value: 'grid' as const, icon: LayoutGrid },
  { value: 'masonry' as const, icon: Columns3 },
]

const filterLabel = computed(() => filters.find(f => f.value === activeFilter.value)?.label)

const galleryItems: GalleryItem[] = [
  // Nature
  {
    id: 1,
    src: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1400',
    thumb: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=300',
    size: '1400-800',
    caption: '山间湖泊',
  },
  {
    id: 2,
    src: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1400',
    thumb: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=300',
    size: '1400-800',
    caption: '林间晨光',
  },
  {
    id: 3,
    src: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=1400',
    thumb: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=300',
    size: '1400-800',
    caption: '森林小径',
  },
  {
    id: 4,
    src: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=1400',
    thumb: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=300',
    size: '1400-800',
    caption: '瀑布溪流',
  },
  // Architecture
  {
    id: 5,
    src: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1400',
    thumb: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=300',
    size: '1400-800',
    caption: '现代建筑',
  },
  {
    id: 6,
    src: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a7?w=1400',
    thumb: 'https://images.unsplash.com/photo-1511818966892-d7d671e672a7?w=300',
    size: '1400-800',
    caption: '城市天际线',
  },
  {
    id: 7,
    src: 'https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?w=1400',
    thumb: 'https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?w=300',
    size: '1400-800',
    caption: '古典穹顶',
  },
  // Animals
  {
    id: 8,
    src: 'https://images.unsplash.com/photo-1474511320723-9a56873571b7?w=1400',
    thumb: 'https://images.unsplash.com/photo-1474511320723-9a56873571b7?w=300',
    size: '1400-800',
    caption: '狮子',
  },
  {
    id: 9,
    src: 'https://images.unsplash.com/photo-1437622368342-7a3d73a34c8f?w=1400',
    thumb: 'https://images.unsplash.com/photo-1437622368342-7a3d73a34c8f?w=300',
    size: '1400-800',
    caption: '海洋生物',
  },
  // Videos
  {
    id: 10,
    type: 'video',
    src: 'https://www.youtube.com/watch?v=IUN664s7N-c',
    poster: 'https://img.youtube.com/vi/IUN664s7N-c/hqdefault.jpg',
    caption: '自然纪录片',
  },
  {
    id: 11,
    type: 'video',
    src: 'https://www.youtube.com/watch?v=LXb3EKWsInQ',
    poster: 'https://img.youtube.com/vi/LXb3EKWsInQ/hqdefault.jpg',
    caption: '城市延时摄影',
  },
  {
    id: 12,
    type: 'video',
    src: 'https://www.youtube.com/watch?v=ChOhcHD8fBA',
    poster: 'https://img.youtube.com/vi/ChOhcHD8fBA/hqdefault.jpg',
    caption: '海洋世界',
  },
]

const filteredItems = computed(() => {
  if (activeFilter.value === 'all') return galleryItems
  return galleryItems.filter(item => (item.type || 'image') === activeFilter.value)
})

const onGalleryInit = (instance: any) => {
  console.log('Gallery initialized', instance)
}
</script>
