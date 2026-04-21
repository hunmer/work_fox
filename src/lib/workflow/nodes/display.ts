import type { NodeTypeDefinition } from '../types'
import GalleryViewer from '@/components/gallery/GalleryViewer.vue'
import MusicPlayer from '@/components/gallery/MusicPlayer.vue'

export const displayNodes: NodeTypeDefinition[] = [
  {
    type: 'gallery_preview',
    label: '资源预览',
    category: '展示',
    icon: 'Image',
    description: '展示图片/视频资源画廊，支持添加多个资源',
    customView: GalleryViewer,
    customViewMinSize: { width: 240, height: 200 },
    properties: [
      {
        key: 'items',
        label: '资源列表',
        type: 'array',
        required: true,
        tooltip: '添加要展示的图片或视频资源',
        itemTemplate: { id: '', src: '', thumb: '', type: 'image', caption: '' },
        fields: [
          { key: 'src', label: '资源地址', type: 'text', required: true, placeholder: '图片/视频 URL' },
          { key: 'thumb', label: '缩略图', type: 'text', placeholder: '缩略图 URL（可选）' },
          {
            key: 'type', label: '类型', type: 'select', default: 'image',
            options: [
              { label: '图片', value: 'image' },
              { label: '视频', value: 'video' },
            ],
          },
          { key: 'caption', label: '标题', type: 'text', placeholder: '显示标题（可选）' },
        ],
      },
    ],
  },
  {
    type: 'music_player',
    label: '音乐播放',
    category: '展示',
    icon: 'Music',
    description: '播放音频文件列表，支持音量调节和循环播放',
    customView: MusicPlayer,
    customViewMinSize: { width: 280, height: 200 },
    properties: [
      {
        key: 'tracks',
        label: '播放列表',
        type: 'array',
        required: true,
        tooltip: '添加要播放的音频文件',
        itemTemplate: { id: '', src: '', title: '', cover: '', duration: 0 },
        fields: [
          { key: 'src', label: '音频地址', type: 'text', required: true, placeholder: '音频文件 URL 或路径' },
          { key: 'title', label: '标题', type: 'text', placeholder: '曲目标题（可选）' },
          { key: 'cover', label: '封面', type: 'text', placeholder: '封面图片 URL（可选）' },
          { key: 'duration', label: '时长(秒)', type: 'number', placeholder: '音频时长（可选）' },
        ],
      },
      {
        key: 'volume',
        label: '音量',
        type: 'number',
        default: 80,
        tooltip: '音量大小 (0-100)',
      },
      {
        key: 'loop',
        label: '循环播放',
        type: 'checkbox',
        default: false,
        tooltip: '播放结束后是否重新开始',
      },
    ],
  },
]
