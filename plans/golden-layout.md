下面给你一个**把 Golden Layout 封装成 Vue 3 组件**的完整起步方案，包括：

1. 安装
2. Vue 3 最小可运行 Demo
3. 组件封装思路
4. 后续建议

> 说明：Golden Layout 本身是一个偏“原生 DOM”的布局库，和 Vue 的组件机制并不天然绑定，所以最稳妥的做法是：**Vue 负责生命周期和数据，Golden Layout 负责面板布局，面板内部内容由 Vue 组件渲染**。

---

# 1. 安装

先创建一个 Vue 3 项目（如果你已经有项目可跳过）：

```bash
npm create vite@latest golden-layout-vue3-demo -- --template vue
cd golden-layout-vue3-demo
npm install
```

安装 Golden Layout：

```bash
npm install golden-layout
```

如果你想使用 TypeScript，也可以直接在 Vue3+TS 项目里使用，原理相同。

---

# 2. 最小 Demo 思路

我们先实现一个最小可用版本：

- 页面中有一个容器 `div`
- Golden Layout 初始化在这个容器上
- 配置两个面板
- 每个面板显示一个简单的 Vue 内容

由于 Golden Layout 的 item 容器是它自己管理的，所以更推荐在 Golden Layout 的组件注册回调里，使用 Vue 3 的 `createApp()` 动态挂载。

---

# 3. Vue 3 最小 Demo

## 3.1 目录结构建议

```bash
src/
  components/
    GoldenLayoutDemo.vue
    HelloPanel.vue
  App.vue
  main.js
```

---

## 3.2 先写一个面板组件

`src/components/HelloPanel.vue`

```vue
<template>
  <div style="padding: 12px;">
    <h3>Hello Panel</h3>
    <p>这是一个由 Vue 渲染的 Golden Layout 面板。</p>
  </div>
</template>
```

---

## 3.3 Golden Layout 封装组件

`src/components/GoldenLayoutDemo.vue`

```vue
<template>
  <div ref="layoutEl" class="layout-root"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, createApp } from 'vue'
import { GoldenLayout } from 'golden-layout'
import HelloPanel from './HelloPanel.vue'

const layoutEl = ref(null)
let layout = null
let mountedApps = []

onMounted(() => {
  layout = new GoldenLayout(layoutEl.value)

  // 注册一个 Vue 面板
  layout.registerComponent('hello-panel', (container) => {
    const mountEl = document.createElement('div')
    container.element.appendChild(mountEl)

    const app = createApp(HelloPanel)
    app.mount(mountEl)
    mountedApps.push(app)

    // 当面板销毁时，卸载 Vue app
    container.on('destroy', () => {
      app.unmount()
    })
  })

  layout.loadLayout({
    root: {
      type: 'row',
      content: [
        {
          type: 'component',
          componentName: 'hello-panel',
          title: '面板 A'
        },
        {
          type: 'component',
          componentName: 'hello-panel',
          title: '面板 B'
        }
      ]
    }
  })
})

onBeforeUnmount(() => {
  if (layout) {
    layout.destroy()
    layout = null
  }
})
</script>

<style scoped>
.layout-root {
  width: 100%;
  height: 600px;
  border: 1px solid #ddd;
}
</style>
```

---

## 3.4 在 App.vue 中使用

`src/App.vue`

```vue
<template>
  <GoldenLayoutDemo />
</template>

<script setup>
import GoldenLayoutDemo from './components/GoldenLayoutDemo.vue'
</script>
```

---

## 3.5 main.js

`src/main.js`

```js
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

---

# 4. 运行项目

```bash
npm run dev
```

如果一切正常，你会看到一个 Golden Layout 容器，里面有两个 Vue 面板。

---

# 5. 进一步封装成“可复用 Vue 3 组件”的建议

上面的 Demo 是“最小可跑通”，但还不是一个很优雅的组件封装。后续建议你朝下面方向优化。

---

## 5.1 不要在每个面板里重复 createApp 太多次

如果你的面板很多，直接 `createApp` 逐个挂载会比较重。更推荐：

- 让 Golden Layout 只负责布局容器
- 面板内容使用统一的渲染策略
- 通过 `props` 传递数据
- 需要动态内容时，用一个“面板渲染器”统一管理

如果你的应用复杂，建议考虑：

- **用 Vue Teleport**
- 或者把 Golden Layout 面板当成“壳”，内容由 Vue 统一分发
- 或者对不同面板类型建立一个 registry（注册表）

---

## 5.2 封装一个通用的 `GoldenLayout.vue`

建议设计成这样：

```vue
<GoldenLayout
  :config="layoutConfig"
  :components="componentMap"
/>
```

其中：

- `config`：Golden Layout 配置
- `components`：组件名到 Vue 组件的映射

例如：

```js
const componentMap = {
  'hello-panel': HelloPanel,
  'user-list': UserListPanel,
  'chart-panel': ChartPanel
}
```

这样以后扩展面板非常方便。

---

## 5.3 支持 props / 状态同步

常见需求包括：

- 点击某个按钮，新增一个面板
- 修改某个面板的数据
- 从父组件向某个面板推送状态

建议方式：

- 用 `pinia` 或 Vue 的响应式状态做全局状态
- 面板内部只负责读取/修改对应状态
- Golden Layout 只管 layout，不管业务数据

---

## 5.4 处理销毁和内存泄漏

这是很重要的一点。

每个通过 `createApp()` 挂载的 Vue 子应用，在面板销毁时必须：

```js
app.unmount()
```

否则拖拽关闭面板后，内存会泄漏。

如果面板内有：

- event listener
- timer
- websocket
- chart 实例

也要在组件 `onBeforeUnmount` 中释放。

---

## 5.5 保存和恢复布局

Golden Layout 通常支持保存布局 JSON。

你可以做：

- 页面退出前保存布局到 localStorage / 后端
- 页面打开时恢复布局

建议：

```js
const saved = localStorage.getItem('golden-layout')
if (saved) {
  layout.loadLayout(JSON.parse(saved))
} else {
  layout.loadLayout(defaultConfig)
}
```

并在布局变化时持久化。

---

## 5.6 给布局外层加自适应

建议容器高度使用：

```css
height: calc(100vh - 60px);
```

或者由父容器控制。  
Golden Layout 对容器尺寸变化比较敏感，所以如果你用了：

- header
- sidebar
- tabs

需要确保布局容器在它们下面且有明确高度。

---

# 6. 一个更实用的封装方向

如果你后面要做成真正项目级组件，建议实现一个类似下面的 API：

```vue
<GoldenLayout
  :layout="layoutConfig"
  :registry="panelRegistry"
  @layout-change="handleLayoutChange"
/>
```

其中：

- `layout`：JSON 配置
- `registry`：组件注册表
- `layout-change`：布局变化事件

这样可维护性更强。

---

# 7. 常见坑提醒

## 7.1 容器没有高度

最常见问题：页面空白。

解决：确保容器有明确高度。

```css
html, body, #app {
  height: 100%;
  margin: 0;
}
```

---

## 7.2 组件没有正确注册

如果 `componentName` 和 `registerComponent` 名字不一致，面板不会渲染。

---

## 7.3 Vue app 没有 unmount

拖动关闭后可能内存越来越大。

---

## 7.4 Golden Layout 版本差异

你参考的官方教程可能对应的是某个版本，API 可能和你当前安装的版本略有不同。  
如果你发现：

- `new GoldenLayout(...)` 不可用
- `registerComponent` 方法名不同
- `loadLayout` 参数结构不同

那就要根据你安装的版本文档微调。

---

# 8. 推荐的项目化落地方案

如果你要做成一个稳定的 Vue3 组件库风格，推荐这样的拆分：

```bash
src/
  components/
    GoldenLayout.vue        # 通用容器组件
    panels/
      TextPanel.vue
      ChartPanel.vue
      TablePanel.vue
  layout/
    registry.js             # 组件注册表
    defaultLayout.js        # 默认布局配置
  utils/
    layoutStorage.js        # 保存/读取布局
```

---

# 9. 后续建议

如果你愿意继续做，我建议下一步按这个顺序推进：

1. **先跑通最小 Demo**
2. **封装通用 GoldenLayout 组件**
3. **支持组件注册表**
4. **支持布局保存/恢复**
5. **支持动态新增/删除面板**
6. **接入 Pinia 管理业务状态**
7. **最后再做成可复用组件库**
