<template>
  <div :class="containerClass">
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
      <div v-if="item.caption" class="gallery-caption">{{ item.caption }}</div>
    </a>
    <Lightgallery :settings="lgSettings" :onInit="onInit" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
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
  layout?: 'grid' | 'masonry'
  cols?: number
}>(), {
  speed: 500,
  layout: 'grid',
  cols: 5,
})

const emit = defineEmits<{
  init: [instance: any]
}>()

const lgInstance = ref<any>(null)
const defaultPlugins = [lgThumbnail, lgZoom, lgVideo]

const containerClass = computed(() => {
  if (props.layout === 'masonry') {
    return `gallery-masonry columns-2 sm:columns-3 md:columns-4`
  }
  return `gallery-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-${props.cols} gap-3`
})

const lgSettings = computed(() => ({
  speed: props.speed,
  plugins: props.plugins || defaultPlugins,
  selector: '.gallery-item',
  youTubePlayerParams: {
    modestbranding: 1,
    showinfo: 0,
    rel: 0,
  },
}))

const onInit = (detail: any) => {
  lgInstance.value = detail.instance
  emit('init', detail.instance)
}
</script>

<style scoped>
.gallery-item {
  display: block;
  cursor: pointer;
  border-radius: 0.5rem;
  overflow: hidden;
  transition: opacity 0.2s;
  position: relative;
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
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--muted));
  border-radius: 0.5rem;
}

.gallery-caption {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.5rem;
  background: linear-gradient(transparent, rgba(0,0,0,0.6));
  color: white;
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.gallery-item:hover .gallery-caption {
  opacity: 1;
}

.gallery-grid .gallery-item {
  aspect-ratio: 1;
}

.gallery-masonry .gallery-item {
  break-inside: avoid;
  margin-bottom: 0.75rem;
}
</style>
