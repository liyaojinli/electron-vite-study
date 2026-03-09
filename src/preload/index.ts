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

// 主题相关 API
const theme = {
  setTheme: (isDark: boolean): void => {
    ipcRenderer.send('theme:set', isDark)
  }
}

// 更新相关 API
const updater = {
  // 手动检查更新
  checkForUpdates: (): Promise<void> => {
    return ipcRenderer.invoke('update:check')
  },
  // 下载更新
  downloadUpdate: (): Promise<void> => {
    return ipcRenderer.invoke('update:download')
  },
  // 安装更新并重启
  installUpdate: (): void => {
    ipcRenderer.invoke('update:install')
  },
  // 监听更新状态
  onUpdateStatus: (
    callback: (info: {
      status: string
      version?: string
      progress?: number
      error?: string
      releaseNotes?: string
      releaseDate?: string
    }) => void
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, info: unknown): void => {
      callback(
        info as {
          status: string
          version?: string
          progress?: number
          error?: string
          releaseNotes?: string
          releaseDate?: string
        }
      )
    }
    ipcRenderer.on('update:status', listener)
    // 返回取消监听的函数
    return () => {
      ipcRenderer.removeListener('update:status', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
try {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
  contextBridge.exposeInMainWorld('theme', theme)
  contextBridge.exposeInMainWorld('updater', updater)
} catch (error) {
  console.error('Failed to expose API via contextBridge:', error)
}
