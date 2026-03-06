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

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
    theme: ThemeAPI
  }
}

export {}
