import type { GraphNode, NodePositionChange, XYPosition } from '@vue-flow/core'

export interface GetHelperLinesResult {
  horizontal?: number
  vertical?: number
  snapPosition: Partial<XYPosition>
}

export interface GetHelperLinesOptions {
  distance?: number
  shouldSnapToNode?: (node: GraphNode) => boolean
}

/**
 * 计算节点拖拽时的对齐辅助线位置和 snap 吸附坐标。
 *
 * 比较拖拽节点与画布上其他节点的 8 种边界对齐关系：
 * - 垂直方向：左-左、右-右、左-右、右-左
 * - 水平方向：顶-顶、底-底、底-顶、顶-底
 *
 * 在 distance 阈值内取最小距离的对齐线，返回 snap 后的位置供外部覆写 change.position。
 */
export function getHelperLines(
  change: NodePositionChange,
  nodes: GraphNode[],
  options: GetHelperLinesOptions | number = 5,
): GetHelperLinesResult {
  const distance = typeof options === 'number' ? options : (options.distance ?? 5)
  const shouldSnapToNode = typeof options === 'number' ? undefined : options.shouldSnapToNode
  const defaultResult: GetHelperLinesResult = {
    horizontal: undefined,
    vertical: undefined,
    snapPosition: { x: undefined, y: undefined },
  }

  const nodeA = nodes.find((node) => node.id === change.id)
  if (!nodeA || !change.position) {
    return defaultResult
  }

  const nodeABounds = {
    left: change.position.x,
    right: change.position.x + ((nodeA.dimensions.width as number) ?? 0),
    top: change.position.y,
    bottom: change.position.y + ((nodeA.dimensions.height as number) ?? 0),
    width: (nodeA.dimensions.width as number) ?? 0,
    height: (nodeA.dimensions.height as number) ?? 0,
  }

  let horizontalDistance = distance
  let verticalDistance = distance

  return nodes
    .filter((node) => node.id !== nodeA.id && (shouldSnapToNode?.(node) ?? true))
    .reduce<GetHelperLinesResult>((result, nodeB) => {
      const nodeBBounds = {
        left: nodeB.position.x,
        right: nodeB.position.x + ((nodeB.dimensions.width as number) ?? 0),
        top: nodeB.position.y,
        bottom: nodeB.position.y + ((nodeB.dimensions.height as number) ?? 0),
      }

      // ── 垂直对齐（left-left） ──
      const distLeftLeft = Math.abs(nodeABounds.left - nodeBBounds.left)
      if (distLeftLeft < verticalDistance) {
        result.snapPosition.x = nodeBBounds.left
        result.vertical = nodeBBounds.left
        verticalDistance = distLeftLeft
      }

      // ── 垂直对齐（right-right） ──
      const distRightRight = Math.abs(nodeABounds.right - nodeBBounds.right)
      if (distRightRight < verticalDistance) {
        result.snapPosition.x = nodeBBounds.right - nodeABounds.width
        result.vertical = nodeBBounds.right
        verticalDistance = distRightRight
      }

      // ── 垂直对齐（left-right，A 左边对齐 B 右边） ──
      const distLeftRight = Math.abs(nodeABounds.left - nodeBBounds.right)
      if (distLeftRight < verticalDistance) {
        result.snapPosition.x = nodeBBounds.right
        result.vertical = nodeBBounds.right
        verticalDistance = distLeftRight
      }

      // ── 垂直对齐（right-left，A 右边对齐 B 左边） ──
      const distRightLeft = Math.abs(nodeABounds.right - nodeBBounds.left)
      if (distRightLeft < verticalDistance) {
        result.snapPosition.x = nodeBBounds.left - nodeABounds.width
        result.vertical = nodeBBounds.left
        verticalDistance = distRightLeft
      }

      // ── 水平对齐（top-top） ──
      const distTopTop = Math.abs(nodeABounds.top - nodeBBounds.top)
      if (distTopTop < horizontalDistance) {
        result.snapPosition.y = nodeBBounds.top
        result.horizontal = nodeBBounds.top
        horizontalDistance = distTopTop
      }

      // ── 水平对齐（bottom-top，A 底边对齐 B 顶边） ──
      const distBottomTop = Math.abs(nodeABounds.bottom - nodeBBounds.top)
      if (distBottomTop < horizontalDistance) {
        result.snapPosition.y = nodeBBounds.top - nodeABounds.height
        result.horizontal = nodeBBounds.top
        horizontalDistance = distBottomTop
      }

      // ── 水平对齐（bottom-bottom） ──
      const distBottomBottom = Math.abs(nodeABounds.bottom - nodeBBounds.bottom)
      if (distBottomBottom < horizontalDistance) {
        result.snapPosition.y = nodeBBounds.bottom - nodeABounds.height
        result.horizontal = nodeBBounds.bottom
        horizontalDistance = distBottomBottom
      }

      // ── 水平对齐（top-bottom，A 顶边对齐 B 底边） ──
      const distTopBottom = Math.abs(nodeABounds.top - nodeBBounds.bottom)
      if (distTopBottom < horizontalDistance) {
        result.snapPosition.y = nodeBBounds.bottom
        result.horizontal = nodeBBounds.bottom
        horizontalDistance = distTopBottom
      }

      return result
    }, defaultResult)
}
