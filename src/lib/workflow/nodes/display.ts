import type { NodeTypeDefinition } from '../types'
import GalleryViewer from '@/components/gallery/GalleryViewer.vue'

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
]
