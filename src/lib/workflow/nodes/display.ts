import type { NodeTypeDefinition } from '../types'
import GalleryViewer from '@/components/gallery/GalleryViewer.vue'
import MusicPlayer from '@/components/gallery/MusicPlayer.vue'
import TableViewComponent from '@/components/workflow/TableViewComponent.vue'
import StickyNoteView from '@/components/workflow/StickyNoteView.vue'

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
  {
    type: 'table_display',
    label: '表格展示',
    category: '展示',
    icon: 'Table',
    description: '展示数据表格，支持单选/多选确认',
    customView: TableViewComponent,
    customViewMinSize: { width: 400, height: 200 },
    properties: [
      {
        key: 'headers',
        label: '表头',
        type: 'array',
        required: true,
        tooltip: '定义表格列',
        itemTemplate: { id: '', title: '', type: 'string' },
        fields: [
          { key: 'id', label: '字段ID', type: 'text', required: true, placeholder: 'header1' },
          { key: 'title', label: '显示名称', type: 'text', required: true, placeholder: '列名' },
          {
            key: 'type', label: '数据类型', type: 'select', default: 'string',
            options: [
              { label: '字符串', value: 'string' },
              { label: '数字', value: 'number' },
              { label: '布尔', value: 'boolean' },
            ],
          },
        ],
      },
      {
        key: 'cells',
        label: '数据行',
        type: 'array',
        required: true,
        tooltip: '表格数据行',
        itemTemplate: { id: '', data: '{}' },
        fields: [
          { key: 'id', label: '行ID', type: 'text', required: true, placeholder: 'row1' },
          { key: 'data', label: '行数据 (JSON)', type: 'text', required: true, placeholder: '{"header1": "value"}' },
        ],
      },
      {
        key: 'selectionMode',
        label: '选择模式',
        type: 'select',
        default: 'none',
        required: true,
        options: [
          { label: '无选择', value: 'none' },
          { label: '单选', value: 'single' },
          { label: '多选', value: 'multi' },
        ],
      },
    ],
    outputs: [
      { key: 'selectedRows', type: 'any' },
      { key: 'selectedCount', type: 'number' },
    ],
  },
  {
    type: 'sticky_note',
    label: '便签',
    category: '展示',
    icon: 'StickyNote',
    description: '画布注释节点，不影响工作流执行',
    customView: StickyNoteView,
    customViewMinSize: { width: 180, height: 120 },
    properties: [
      { key: 'content', label: '内容', type: 'textarea', tooltip: '便签文本内容' },
      {
        key: 'color',
        label: '颜色',
        type: 'select',
        default: 'yellow',
        options: [
          { label: '黄色', value: 'yellow' },
          { label: '蓝色', value: 'blue' },
          { label: '绿色', value: 'green' },
          { label: '粉色', value: 'pink' },
          { label: '紫色', value: 'purple' },
        ],
      },
    ],
    handles: { source: false, target: false },
    debuggable: false,
  },
]
