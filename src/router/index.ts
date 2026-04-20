import { createRouter, createWebHashHistory, START_LOCATION } from 'vue-router'

const REOPEN_EDITOR_KEY = 'workfox_reopen_editor'

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

router.beforeEach((to, from) => {
  if (to.path === '/editor') {
    localStorage.setItem(REOPEN_EDITOR_KEY, '1')
    return
  }

  const isInitialLoad = from === START_LOCATION
  const isHome = to.path === '/' || to.path === '/home'

  if (isHome && isInitialLoad && localStorage.getItem(REOPEN_EDITOR_KEY) === '1') {
    return '/editor'
  }

  if (isHome && !isInitialLoad) {
    localStorage.removeItem(REOPEN_EDITOR_KEY)
  }
})

export default router
