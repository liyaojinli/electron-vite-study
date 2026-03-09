import { ElectronAPI } from '@electron-toolkit/preload'
import type { ApiHandlers } from '../main/api'

// 自动从 ApiHandlers 生成 API 类型
type API = {
  [K in keyof ApiHandlers]: ApiHandlers[K] extends (...args: infer P) => infer R
    ? (...args: P) => R extends Promise<unknown> ? R : Promise<R>
    : never
}

// 主题 API 类型
interface ThemeAPI {
  setTheme: (isDark: boolean) => void
}

// 更新 API 类型
interface UpdaterAPI {
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => void
  onUpdateStatus: (
    callback: (info: {
      status: string
      version?: string
      progress?: number
      error?: string
      releaseNotes?: string
      releaseDate?: string
    }) => void
  ) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
    theme: ThemeAPI
    updater: UpdaterAPI
  }
}

export {}
