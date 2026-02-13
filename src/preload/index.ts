import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { apiKeys, type ApiHandlers } from '../main/api'

// 辅助函数：根据 API 名称列表自动生成绑定
function createApiBindings<T extends readonly string[]>(
  apiNames: T
): Record<T[number], (...args: unknown[]) => Promise<unknown>> {
  const bindings = {} as Record<string, (...args: unknown[]) => Promise<unknown>>
  apiNames.forEach((name) => {
    bindings[name] = (...args: unknown[]) => ipcRenderer.invoke(`api:${name}`, ...args)
  })
  return bindings
}

// 自动从 api.ts 获取所有 API 方法名并生成绑定
const api = createApiBindings(apiKeys) as {
  [K in keyof ApiHandlers]: ApiHandlers[K] extends (...args: infer P) => infer R
    ? (...args: P) => R extends Promise<unknown> ? R : Promise<R>
    : never
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('Failed to expose API via contextBridge:', error)
}
