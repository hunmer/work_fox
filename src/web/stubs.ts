// src/web/stubs.ts

/** 同步 no-op（匹配 ipcRenderer.send 语义） */
export const syncNoop = (): void => {}

/** 异步 no-op，返回指定值 */
export const asyncNoop = <T>(value: T): (() => Promise<T>) => {
  return () => Promise.resolve(value)
}

/** 不可用操作，返回 Promise.reject 并提示 */
export const notAvailable = (feature: string) => (): Promise<never> => {
  return Promise.reject(new Error(`"${feature}" 仅在桌面版中可用`))
}
