<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-2xl font-bold">Gallery Demo</h1>
      <p class="text-muted-foreground mt-1">Image and video gallery viewer</p>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <GalleryViewer :items="galleryItems" @init="onGalleryInit" />
    </div>
  </div>
</template>

<script setup lang="ts">
import GalleryViewer from '@/components/gallery/GalleryViewer.vue'
import type { GalleryItem } from '@/components/gallery/GalleryViewer.vue'

const galleryItems: GalleryItem[] = [
  {
    id: 1,
    src: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1400',
    thumb: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=300',
    size: '1400-800',
    caption: 'Mountain Lake',
  },
  {
    id: 2,
    src: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1400',
    thumb: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=300',
    size: '1400-800',
    caption: 'Sunlight Through Trees',
  },
  {
    id: 3,
    src: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=1400',
    thumb: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=300',
    size: '1400-800',
    caption: 'Forest Path',
  },
  {
    id: 4,
    type: 'video',
    src: 'https://www.youtube.com/watch?v=IUN664s7N-c',
    poster: 'https://img.youtube.com/vi/IUN664s7N-c/hqdefault.jpg',
    caption: 'Sample Video',
  },
]

const onGalleryInit = (instance: any) => {
  console.log('Gallery initialized', instance)
}
</script>
