import { isLocalBridgeWorkflowNode } from '../../shared/workflow-local-bridge'

export async function executeWorkflowBrowserNode(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!isLocalBridgeWorkflowNode(name)) {
    throw new Error(`Tool not available: ${name}`)
  }

  switch (name) {
    case 'delay': {
      const milliseconds = typeof args.milliseconds === 'number'
        ? args.milliseconds
        : typeof args.ms === 'number'
          ? args.ms
          : 1000
      const clamped = Math.max(100, Math.min(30_000, milliseconds))
      await new Promise((resolve) => setTimeout(resolve, clamped))
      return {
        success: true,
        message: `已等待 ${clamped}ms`,
        data: {
          milliseconds: clamped,
          reason: typeof args.reason === 'string' ? args.reason : undefined,
        },
      }
    }
    default:
      throw new Error(`Tool not implemented: ${name}`)
  }
}
