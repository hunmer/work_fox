import type { Component, InjectionKey } from 'vue'
import type { LayoutConfig } from 'golden-layout'

/**
 * 组件注册表：面板名 -> Vue 组件
 * key 必须与布局 JSON 中的 componentType 一致
 */
export type ComponentRegistry = Record<string, Component>

/**
 * provide 传递映射
 * 用于将父组件的 provide/inject 传递到 golden-layout 子面板
 * （createApp 创建的子应用不继承父应用的 provide 链）
 */
export type ProvideMap = Array<{ key: InjectionKey<any> | string | symbol; value: unknown }>

/**
 * 布局持久化数据结构
 */
export interface LayoutPersistData {
  version: number
  layout: LayoutConfig
}

/**
 * 工作流编辑器面板类型
 */
export type EditorPanelType = 'node-sidebar' | 'flow-canvas' | 'right-panel' | 'exec-bar'
