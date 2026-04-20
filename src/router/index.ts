import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/home',
    },
    {
      path: '/home',
      component: () => import('@/views/HomePage.vue'),
    },
    {
      path: '/editor',
      component: () => import('@/views/EditorPage.vue'),
    },
    {
      path: '/gallery',
      component: () => import('@/views/GalleryPage.vue'),
    },
  ],
})

export default router
