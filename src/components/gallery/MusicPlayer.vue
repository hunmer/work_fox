<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Repeat1, Music, Loader } from 'lucide-vue-next'

export interface TrackItem {
  id: string | number
  src: string
  title?: string
  cover?: string
  duration?: number
}

const props = withDefaults(defineProps<{
  tracks: TrackItem[]
  volume?: number
  loop?: boolean
}>(), {
  volume: 80,
  loop: false,
})

// ── 播放状态 ──
const audioRef = ref<HTMLAudioElement | null>(null)
const currentIndex = ref(0)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const localVolume = ref(props.volume)
const localLoop = ref(props.loop)
const isLoading = ref(false)

// ── 计算属性 ──
const currentTrack = computed(() => props.tracks[currentIndex.value] ?? null)

const hasTracks = computed(() => props.tracks.length > 0)

const progressPercent = computed(() => {
  if (duration.value <= 0) return 0
  return (currentTime.value / duration.value) * 100
})

const displayTime = computed(() => formatTime(currentTime.value))
const displayDuration = computed(() => formatTime(duration.value))

const isMuted = computed(() => localVolume.value === 0)

// ── 格式化时间 mm:ss ──
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── 播放控制 ──
function initAudio() {
  if (!audioRef.value) {
    audioRef.value = new Audio()
    audioRef.value.addEventListener('timeupdate', onTimeUpdate)
    audioRef.value.addEventListener('loadedmetadata', onLoadedMetadata)
    audioRef.value.addEventListener('ended', onEnded)
    audioRef.value.addEventListener('error', onError)
    audioRef.value.addEventListener('waiting', () => { isLoading.value = true })
    audioRef.value.addEventListener('canplay', () => { isLoading.value = false })
  }
}

function loadTrack(index: number) {
  if (!audioRef.value || !hasTracks.value) return
  const track = props.tracks[index]
  if (!track?.src) return

  isLoading.value = true
  audioRef.value.src = track.src
  audioRef.value.volume = localVolume.value / 100
  audioRef.value.loop = false // 单曲循环通过 ended 事件处理
  currentIndex.value = index
}

async function playTrack(index: number) {
  initAudio()
  loadTrack(index)
  try {
    await audioRef.value!.play()
    isPlaying.value = true
  } catch {
    isPlaying.value = false
  }
}

async function togglePlay() {
  if (!hasTracks.value) return
  initAudio()

  if (!audioRef.value!.src || audioRef.value!.src === window.location.href) {
    await playTrack(0)
    return
  }

  if (isPlaying.value) {
    audioRef.value!.pause()
    isPlaying.value = false
  } else {
    try {
      await audioRef.value!.play()
      isPlaying.value = true
    } catch {
      isPlaying.value = false
    }
  }
}

function playNext() {
  if (!hasTracks.value) return
  const next = (currentIndex.value + 1) % props.tracks.length
  if (next === 0 && !localLoop.value) {
    stopPlayback()
    return
  }
  playTrack(next)
}

function playPrev() {
  if (!hasTracks.value) return
  const prev = currentIndex.value - 1
  playTrack(prev < 0 ? props.tracks.length - 1 : prev)
}

function stopPlayback() {
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.currentTime = 0
  }
  isPlaying.value = false
  currentTime.value = 0
}

// ── 进度条拖拽 ──
function seekTo(event: MouseEvent, trackIndex?: number) {
  if (!audioRef.value || !duration.value) return
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))

  // 如果指定了 trackIndex 且不是当前播放的，先切换
  if (trackIndex !== undefined && trackIndex !== currentIndex.value) {
    initAudio()
    loadTrack(trackIndex)
    audioRef.value!.addEventListener('loadedmetadata', () => {
      audioRef.value!.currentTime = ratio * audioRef.value!.duration
      audioRef.value!.play().then(() => { isPlaying.value = true }).catch(() => {})
    }, { once: true })
    return
  }

  audioRef.value.currentTime = ratio * duration.value
}

// ── 音量控制 ──
function setVolume(event: MouseEvent) {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  localVolume.value = Math.round(ratio * 100)
  if (audioRef.value) {
    audioRef.value.volume = localVolume.value / 100
  }
}

function toggleMute() {
  localVolume.value = localVolume.value > 0 ? 0 : 80
  if (audioRef.value) {
    audioRef.value.volume = localVolume.value / 100
  }
}

// ── 循环模式 ──
function toggleLoop() {
  localLoop.value = !localLoop.value
}

// ── 事件处理 ──
function onTimeUpdate() {
  if (audioRef.value) {
    currentTime.value = audioRef.value.currentTime
  }
}

function onLoadedMetadata() {
  if (audioRef.value) {
    duration.value = audioRef.value.duration
  }
}

function onEnded() {
  if (localLoop.value) {
    // 列表循环：播放下一首
    playNext()
  } else if (currentIndex.value < props.tracks.length - 1) {
    // 非循环但还有下一首
    playNext()
  } else {
    isPlaying.value = false
  }
}

function onError() {
  isLoading.value = false
  console.warn(`[MusicPlayer] 音频加载失败: ${audioRef.value?.src}`)
}

// ── 监听外部属性变化 ──
watch(() => props.tracks, () => {
  if (hasTracks.value && currentIndex.value >= props.tracks.length) {
    currentIndex.value = 0
  }
  if (!hasTracks.value) {
    stopPlayback()
  }
})

watch(() => props.volume, (val) => {
  localVolume.value = val
  if (audioRef.value) {
    audioRef.value.volume = val / 100
  }
})

watch(() => props.loop, (val) => {
  localLoop.value = val
})

// ── 清理 ──
onBeforeUnmount(() => {
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.removeEventListener('timeupdate', onTimeUpdate)
    audioRef.value.removeEventListener('loadedmetadata', onLoadedMetadata)
    audioRef.value.removeEventListener('ended', onEnded)
    audioRef.value.removeEventListener('error', onError)
    audioRef.value.src = ''
    audioRef.value = null
  }
})
</script>

<template>
  <div class="music-player">
    <!-- 播放列表 -->
    <div class="music-track-list">
      <div
        v-for="(track, idx) in tracks"
        :key="track.id || idx"
        class="music-track-item"
        :class="{
          'music-track-active': idx === currentIndex && isPlaying,
          'music-track-selected': idx === currentIndex,
        }"
      >
        <!-- 封面 -->
        <div class="music-track-cover" @click="playTrack(idx)">
          <img
            v-if="track.cover"
            :src="track.cover"
            :alt="track.title || ''"
            class="music-cover-img"
          />
          <Music v-else class="music-cover-icon" />
          <div class="music-cover-overlay">
            <Play v-if="idx !== currentIndex || !isPlaying" class="music-play-icon" />
            <Pause v-else class="music-play-icon" />
          </div>
        </div>

        <!-- 信息 + 进度 -->
        <div class="music-track-info">
          <div class="music-track-title">
            {{ track.title || `曲目 ${idx + 1}` }}
          </div>
          <!-- 单曲进度条 -->
          <div
            v-if="idx === currentIndex"
            class="music-progress-wrapper"
            @click="seekTo($event)"
          >
            <div class="music-progress-bar">
              <div
                class="music-progress-fill"
                :style="{ width: progressPercent + '%' }"
              />
            </div>
            <div class="music-progress-time">
              <span>{{ displayTime }}</span>
              <span>{{ displayDuration }}</span>
            </div>
          </div>
          <div v-else class="music-progress-wrapper">
            <div class="music-progress-bar">
              <div
                class="music-progress-fill"
                :style="{ width: '0%' }"
              />
            </div>
            <div class="music-progress-time">
              <span>{{ track.duration ? formatTime(track.duration) : '--:--' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!hasTracks" class="music-empty">
        <Music class="music-empty-icon" />
        <span>暂无播放内容</span>
      </div>
    </div>

    <!-- 底部控制栏 -->
    <div v-if="hasTracks" class="music-controls">
      <!-- 播放控制 -->
      <div class="music-controls-playback">
        <button class="music-btn" title="上一首" @click="playPrev">
          <SkipBack class="music-btn-icon" />
        </button>
        <button class="music-btn music-btn-play" :title="isPlaying ? '暂停' : '播放'" @click="togglePlay">
          <Loader v-if="isLoading" class="music-btn-icon animate-spin" />
          <Pause v-else-if="isPlaying" class="music-btn-icon" />
          <Play v-else class="music-btn-icon" />
        </button>
        <button class="music-btn" title="下一首" @click="playNext">
          <SkipForward class="music-btn-icon" />
        </button>
      </div>

      <!-- 音量 + 循环 -->
      <div class="music-controls-extra">
        <button class="music-btn-sm" :title="isMuted ? '取消静音' : '静音'" @click="toggleMute">
          <VolumeX v-if="isMuted" class="music-btn-icon-sm" />
          <Volume2 v-else class="music-btn-icon-sm" />
        </button>
        <div class="music-volume-bar" @click="setVolume">
          <div class="music-volume-fill" :style="{ width: localVolume + '%' }" />
        </div>
        <button
          class="music-btn-sm"
          :class="{ 'music-btn-active': localLoop }"
          :title="localLoop ? '关闭循环' : '开启循环'"
          @click="toggleLoop"
        >
          <Repeat v-if="!localLoop" class="music-btn-icon-sm" />
          <Repeat1 v-else class="music-btn-icon-sm" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.music-player {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: hsl(var(--card));
  border-radius: 6px;
  overflow: hidden;
  font-size: 11px;
  color: hsl(var(--foreground));
}

/* ── 播放列表 ── */
.music-track-list {
  flex: 1;
  overflow-y: auto;
  max-height: 160px;
}

.music-track-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid hsl(var(--border) / 0.4);
}

.music-track-item:last-child {
  border-bottom: none;
}

.music-track-item:hover {
  background: hsl(var(--muted) / 0.5);
}

.music-track-selected {
  background: hsl(var(--accent) / 0.3);
}

.music-track-active .music-track-title {
  color: hsl(var(--primary));
  font-weight: 500;
}

/* ── 封面 ── */
.music-track-cover {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
  background: hsl(var(--muted));
  display: flex;
  align-items: center;
  justify-content: center;
}

.music-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.music-cover-icon {
  width: 14px;
  height: 14px;
  color: hsl(var(--muted-foreground));
}

.music-cover-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.music-track-cover:hover .music-cover-overlay {
  opacity: 1;
}

.music-play-icon {
  width: 14px;
  height: 14px;
  color: white;
}

/* ── 曲目信息 ── */
.music-track-info {
  flex: 1;
  min-width: 0;
}

.music-track-title {
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

/* ── 进度条 ── */
.music-progress-wrapper {
  cursor: pointer;
  padding-top: 4px;
}

.music-progress-bar {
  height: 3px;
  border-radius: 1.5px;
  background: hsl(var(--muted));
  overflow: hidden;
}

.music-progress-fill {
  height: 100%;
  border-radius: 1.5px;
  background: hsl(var(--primary));
  transition: width 0.2s linear;
}

.music-progress-time {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: hsl(var(--muted-foreground));
  margin-top: 1px;
  line-height: 1;
}

/* ── 底部控制栏 ── */
.music-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-top: 1px solid hsl(var(--border) / 0.5);
  background: hsl(var(--card));
  flex-shrink: 0;
}

.music-controls-playback {
  display: flex;
  align-items: center;
  gap: 4px;
}

.music-controls-extra {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ── 按钮 ── */
.music-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.music-btn:hover {
  background: hsl(var(--muted));
}

.music-btn-play {
  width: 28px;
  height: 28px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

.music-btn-play:hover {
  background: hsl(var(--primary) / 0.85);
}

.music-btn-icon {
  width: 12px;
  height: 12px;
}

.music-btn-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.music-btn-sm:hover {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.music-btn-active {
  color: hsl(var(--primary));
}

.music-btn-icon-sm {
  width: 11px;
  height: 11px;
}

/* ── 音量条 ── */
.music-volume-bar {
  width: 60px;
  height: 3px;
  border-radius: 1.5px;
  background: hsl(var(--muted));
  cursor: pointer;
  overflow: hidden;
}

.music-volume-fill {
  height: 100%;
  border-radius: 1.5px;
  background: hsl(var(--primary));
  transition: width 0.1s;
}

/* ── 空状态 ── */
.music-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 8px;
  color: hsl(var(--muted-foreground));
  gap: 4px;
}

.music-empty-icon {
  width: 20px;
  height: 20px;
  opacity: 0.5;
}
</style>
