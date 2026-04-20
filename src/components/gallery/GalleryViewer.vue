<template>
  <lightgallery :settings="lgSettings" :onInit="onInit">
    <a
      v-for="item in items"
      :key="item.id"
      :data-src="item.src"
      :data-lg-size="item.size"
      :data-poster="item.poster"
      :data-sub-html="item.caption"
      class="gallery-item"
    >
      <img v-if="item.thumb" :src="item.thumb" :alt="item.caption || ''" class="gallery-thumb" />
      <div v-else class="gallery-thumb-placeholder">
        <component :is="item.type === 'video' ? VideoIcon : ImageIcon" class="size-8 text-muted-foreground" />
      </div>
    </a>
  </lightgallery>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Lightgallery from 'lightgallery/vue'
import lgThumbnail from 'lightgallery/plugins/thumbnail'
import lgZoom from 'lightgallery/plugins/zoom'
import lgVideo from 'lightgallery/plugins/video'
import { ImageIcon, Video as VideoIcon } from 'lucide-vue-next'

import 'lightgallery/css/lightgallery.css'
import 'lightgallery/css/lg-thumbnail.css'
import 'lightgallery/css/lg-zoom.css'
import 'lightgallery/css/lg-video.css'

export interface GalleryItem {
  id: string | number
  src: string
  thumb?: string
  size?: string
  type?: 'image' | 'video'
  poster?: string
  caption?: string
}

const props = withDefaults(defineProps<{
  items: GalleryItem[]
  speed?: number
  plugins?: any[]
}>(), {
  speed: 500,
})

const emit = defineEmits<{
  init: [instance: any]
}>()

const defaultPlugins = [lgThumbnail, lgZoom, lgVideo]

const lgSettings = computed(() => ({
  speed: props.speed,
  plugins: props.plugins || defaultPlugins,
  youTubePlayerParams: {
    modestbranding: 1,
    showinfo: 0,
    rel: 0,
  },
}))

const onInit = (detail: any) => {
  emit('init', detail.instance)
}
</script>

<style scoped>
.gallery-item {
  display: inline-block;
  cursor: pointer;
  border-radius: 0.5rem;
  overflow: hidden;
  transition: opacity 0.2s;
}

.gallery-item:hover {
  opacity: 0.85;
}

.gallery-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0.5rem;
}

.gallery-thumb-placeholder {
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--muted));
  border-radius: 0.5rem;
}
</style>
