import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 将字符串哈希为 HSL 色相值，生成稳定的柔和颜色。
 * 相同输入始终返回相同颜色，适合用作标签/badge 的背景色。
 */
export function stringToHsl(text: string, saturation = 55, lightness = 48): string {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = ((hash % 360) + 360) % 360
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}
