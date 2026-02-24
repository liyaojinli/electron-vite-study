import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { RepositoryData } from '../shared/repository'
import {
  createRepository,
  insertRepository,
  deleteRepository,
  listRepositories,
  updateRepository,
  verifyRepository,
  createLocalRepository,
  insertLocalRepository,
  deleteLocalRepository,
  listLocalRepositories,
  updateLocalRepository,
  verifyLocalRepository
} from './repository/repository'

// ========== API 定义区（只在这里添加新 API）==========
export const apiHandlers = {
  // Remote Repository APIs
  listRepositories: async () => {
    return listRepositories()
  },
  createRepository: async (repo: RepositoryData) => {
    return createRepository(repo)
  },
  insertRepository: async (index: number, repo: RepositoryData) => {
    return insertRepository(index, repo)
  },
  updateRepository: async (index: number, repo: RepositoryData) => {
    return updateRepository(index, repo)
  },
  deleteRepository: async (index: number) => {
    return deleteRepository(index)
  },
  verifyRepository: async (repo: RepositoryData) => {
    return verifyRepository(repo)
  },

  // Local Repository APIs
  listLocalRepositories: async () => {
    return listLocalRepositories()
  },
  createLocalRepository: async (repo: RepositoryData) => {
    return createLocalRepository(repo)
  },
  insertLocalRepository: async (index: number, repo: RepositoryData) => {
    return insertLocalRepository(index, repo)
  },
  updateLocalRepository: async (index: number, repo: RepositoryData) => {
    return updateLocalRepository(index, repo)
  },
  deleteLocalRepository: async (index: number) => {
    return deleteLocalRepository(index)
  },
  verifyLocalRepository: async (repo: RepositoryData) => {
    return verifyLocalRepository(repo)
  },

  // File Dialog APIs
  selectDirectory: async (): Promise<{ success: boolean; path?: string }> => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (!focusedWindow) {
      return { success: false }
    }
    const result = await dialog.showOpenDialog(focusedWindow, {
      properties: ['openDirectory'],
      message: '选择本地 SVN 仓库目录'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false }
    }
    return { success: true, path: result.filePaths[0] }
  }
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
