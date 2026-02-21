import { ipcMain } from 'electron'
import os from 'os'
import { saveRepository } from './repository/repository'
import { Repository } from '../shared/repository'

// ========== API 定义区（只在这里添加新 API）==========
export const apiHandlers = {
  // 获取系统信息
  getSystemInfo: async () => {
    const cpus = os.cpus()
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpu: cpus[0]?.model || 'Unknown',
      memory: os.totalmem()
    }
  },

  saveRepository: async (repo: Repository) => {
    saveRepository(repo)
  }

  // 添加新 API 只需在这里添加方法即可，无需修改其他文件！
  // 例如：
  // readFile: async (path: string) => {
  //   return fs.readFileSync(path, 'utf-8')
  // }
}

// 自动提取所有 API 方法名
export const apiKeys = Object.keys(apiHandlers) as Array<keyof typeof apiHandlers>

// ========== 自动注册所有 API（不用改）==========
export function registerApiHandlers(): void {
  Object.keys(apiHandlers).forEach((key) => {
    ipcMain.handle(`api:${key}`, async (_event, ...args: unknown[]) => {
      const handler = apiHandlers[key as keyof typeof apiHandlers] as (
        ...args: unknown[]
      ) => Promise<unknown>
      return handler(...args)
    })
  })
}

// ========== 导出类型供 preload 使用 ==========
export type ApiHandlers = typeof apiHandlers
