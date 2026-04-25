import { createRouter, createWebHashHistory, START_LOCATION } from 'vue-router'

const REOPEN_EDITOR_KEY = 'workfox_reopen_editor'
const REOPEN_WORKFLOW_ID_KEY = 'workfox_reopen_workflow_id'

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
      props: (route) => ({ workflowId: (route.query.workflow_id as string) || undefined }),
    },
    {
      path: '/gallery',
      component: () => import('@/views/GalleryPage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      component: () => import('@/views/NotFoundPage.vue'),
    },
  ],
})

router.beforeEach((to, from) => {
  if (to.path === '/editor') {
    localStorage.setItem(REOPEN_EDITOR_KEY, '1')
    const workflowId = to.query.workflow_id as string | undefined
    if (workflowId) {
      localStorage.setItem(REOPEN_WORKFLOW_ID_KEY, workflowId)
    } else {
      localStorage.removeItem(REOPEN_WORKFLOW_ID_KEY)
    }
    return
  }

  const isInitialLoad = from === START_LOCATION
  const isHome = to.path === '/' || to.path === '/home'

  const savedWorkflowId = localStorage.getItem(REOPEN_WORKFLOW_ID_KEY)
  if (isHome && isInitialLoad && localStorage.getItem(REOPEN_EDITOR_KEY) === '1' && savedWorkflowId) {
    const target = { path: '/editor', query: { workflow_id: savedWorkflowId } }
    localStorage.removeItem(REOPEN_WORKFLOW_ID_KEY)
    return target
  }

  if (isHome && !isInitialLoad) {
    localStorage.removeItem(REOPEN_EDITOR_KEY)
    localStorage.removeItem(REOPEN_WORKFLOW_ID_KEY)
  }
})

export default router
