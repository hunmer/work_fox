<template>
  <div ref="containerRef" :class="containerClass">
    <a
      v-for="item in items"
      :key="item.id"
      :data-src="item.src"
      :data-lg-size="item.size"
      :data-poster="item.poster"
      :data-sub-html="item.caption"
      class="gallery-item"
    >
      <img
        v-if="item.thumb"
        :src="item.thumb"
        :alt="item.caption || ''"
        class="gallery-thumb"
        loading="lazy"
        @load="onThumbLoad($event)"
      />
      <div v-else class="gallery-thumb-placeholder">
        <component :is="item.type === 'video' ? VideoIcon : ImageIcon" class="size-8 text-muted-foreground" />
      </div>
      <div class="gallery-loading">
        <div class="gallery-skeleton" />
      </div>
      <div v-if="item.caption" class="gallery-caption">{{ item.caption }}</div>
    </a>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import lightGallery from 'lightgallery'
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
}>(), {
  speed: 500,
  layout: 'grid',
})

const emit = defineEmits<{
  init: [instance: any]
}>()

const containerRef = ref<HTMLElement | null>(null)

const onThumbLoad = (e: Event) => {
  const img = e.target as HTMLImageElement
  img.classList.add('loaded')
  const loading = img.parentElement?.querySelector('.gallery-loading') as HTMLElement
  if (loading) loading.style.display = 'none'
}
const lgInstance = ref<any>(null)
const defaultPlugins = [lgThumbnail, lgZoom, lgVideo]

const containerClass = computed(() => {
  return props.layout === 'masonry'
    ? 'gallery-masonry columns-2 sm:columns-3 md:columns-4'
    : 'gallery-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'
})

const lgSettings = computed(() => ({
  speed: props.speed,
  plugins: props.plugins || defaultPlugins,
  youTubePlayerParams: {
    modestbranding: 1,
    showinfo: 0,
    rel: 0,
  },
}))

const initGallery = async () => {
  await nextTick()

  if (!containerRef.value || lgInstance.value) {
    return
  }

  lgInstance.value = lightGallery(containerRef.value, lgSettings.value)
  emit('init', lgInstance.value)
}

const destroyGallery = () => {
  lgInstance.value?.destroy?.()
  lgInstance.value = null
}

onMounted(() => {
  void initGallery()
})

watch(lgSettings, async () => {
  destroyGallery()
  await initGallery()
}, { deep: true })

watch(() => props.items, async () => {
  await nextTick()
  lgInstance.value?.refresh?.()
}, { deep: true })

onBeforeUnmount(() => {
  destroyGallery()
})
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
  opacity: 0;
  transition: opacity 0.3s;
}

.gallery-thumb.loaded {
  opacity: 1;
}

.gallery-loading {
  position: absolute;
  inset: 0;
  border-radius: 0.5rem;
  overflow: hidden;
  pointer-events: none;
}

.gallery-skeleton {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted) / 0.5) 50%, hsl(var(--muted)) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
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
