import type { Request, Response } from 'express'
import type { WorkflowTriggerService } from './trigger-service'
import type { BackendConfig } from '../app/config'
import type { Logger } from '../app/logger'

const SSE_HOOK_TIMEOUT_MS = 5 * 60_000

interface HookRequestBody {
  workflowId?: string
  input?: Record<string, unknown>
}

export function handleHookRequest(
  req: Request,
  res: Response,
  triggerService: WorkflowTriggerService,
  config: BackendConfig,
  logger: Logger
): void {
  const hookName = req.params.hookName as string

  // 1. Auth
  if (config.hookSecret) {
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (token !== config.hookSecret) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
  }

  // 2. 查找绑定的工作流
  const bindings = triggerService.getHookBindings(hookName)
  if (bindings.length === 0) {
    res.status(404).json({ error: `No workflows bound to hook "${hookName}"` })
    return
  }

  const body: HookRequestBody = req.body || {}
  let targetBindings = bindings
  if (body.workflowId) {
    targetBindings = bindings.filter(b => b.workflowId === body.workflowId)
    if (targetBindings.length === 0) {
      res.status(404).json({ error: `Workflow ${body.workflowId} not bound to hook "${hookName}"` })
      return
    }
  }

  // 3. 设置 SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  let completedCount = 0
  let closed = false

  const sseSink = (channel: string, payload: unknown) => {
    if (closed) return
    res.write(`event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n`)
  }

  // SSE 超时 — 5分钟后关闭连接（工作流继续执行）
  const timeoutId = setTimeout(() => {
    if (!closed) {
      sseSink('timeout', { message: 'Execution timeout, SSE closing' })
      res.write('event: done\ndata: {}\n\n')
      closed = true
      res.end()
    }
  }, SSE_HOOK_TIMEOUT_MS)

  // 客户端断开 — 仅清理 SSE，不停止执行
  res.on('close', () => {
    closed = true
    clearTimeout(timeoutId)
    logger.info(`[HookHandler] SSE client disconnected for hook "${hookName}"`)
  })

  // 4. 并行执行所有目标工作流
  const total = targetBindings.length
  for (const binding of targetBindings) {
    triggerService.executeForHook(binding.workflowId, body.input || {}, sseSink)
      .then(() => { onExecutionDone() })
      .catch((err: any) => {
        logger.error(`[HookHandler] Execution error: ${err.message}`)
        sseSink('workflow:error', { workflowId: binding.workflowId, error: err.message })
        onExecutionDone()
      })
  }

  function onExecutionDone() {
    completedCount++
    if (completedCount === total && !closed) {
      clearTimeout(timeoutId)
      res.write('event: done\ndata: {}\n\n')
      closed = true
      res.end()
    }
  }
}
