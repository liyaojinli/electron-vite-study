import { ipcMain, dialog, BrowserWindow } from 'electron'
import { execSync } from 'child_process'
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
  },

  // Batch Merge APIs
  getLocalRepositories: async (): Promise<RepositoryData[]> => {
    const repos = await listLocalRepositories()
    return repos.map((repo: RepositoryData) => ({
      ...repo,
      local: true
    }))
  },

  getSvnLog: async (
    repoPath: string,
    limit: number = 100,
    searchKeyword: string = '',
    startDate: string = '',
    endDate: string = ''
  ): Promise<Array<{ revision: number; author: string; date: string; message: string }>> => {
    try {
      let cmd = `svn log "${repoPath}" --limit ${limit} --xml`
      
      // Add search parameter if provided
      if (searchKeyword) {
        cmd += ` --search "${searchKeyword}"`
      }
      
      // Add date range if provided
      if (startDate || endDate) {
        let revisionRange = ''
        
        if (startDate && endDate) {
          // When both dates are provided, extend endDate to next day to include the entire end date
          const endDateObj = new Date(endDate)
          endDateObj.setDate(endDateObj.getDate() + 1)
          const nextDay = endDateObj.toISOString().split('T')[0]
          revisionRange = `{${startDate}}:{${nextDay}}`
        } else if (startDate) {
          // Only start date: from startDate to HEAD
          revisionRange = `{${startDate}}:HEAD`
        } else if (endDate) {
          // Only end date: from beginning to endDate (extended to next day)
          const endDateObj = new Date(endDate)
          endDateObj.setDate(endDateObj.getDate() + 1)
          const nextDay = endDateObj.toISOString().split('T')[0]
          revisionRange = `1:{${nextDay}}`
        }
        
        if (revisionRange) {
          cmd += ` -r ${revisionRange}`
        }
      }
      
      const output = execSync(cmd, { encoding: 'utf-8' })

      // Parse XML output
      const logs: Array<{ revision: number; author: string; date: string; message: string }> = []
      const revisionRegex = /<logentry\s+revision="(\d+)"[^>]*>[\s\S]*?<author>([^<]*)<\/author>[\s\S]*?<date>([^<]*)<\/date>[\s\S]*?<msg>([^<]*)<\/msg>/g

      let match
      while ((match = revisionRegex.exec(output)) !== null) {
        logs.push({
          revision: parseInt(match[1], 10),
          author: match[2],
          date: match[3],
          message: match[4]
        })
      }

      return logs
    } catch (error) {
      console.error('Failed to fetch SVN logs:', error)
      return []
    }
  },

  svnUpdate: async (
    repoPath: string
  ): Promise<{ success: boolean; logs: string[]; message: string }> => {
    try {
      const cmd = `svn update "${repoPath}"`
      const output = execSync(cmd, { encoding: 'utf-8' })
      const logs = output
        .trim()
        .split('\n')
        .filter((line) => line.trim())
      return {
        success: true,
        logs: logs.length > 0 ? logs : ['更新成功'],
        message: '更新成功'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '更新失败'
      return {
        success: false,
        logs: [errorMessage],
        message: errorMessage
      }
    }
  },

  getSvnStatus: async (
    repoPath: string
  ): Promise<{ files: Array<{ status: string; path: string }>; message: string }> => {
    try {
      const cmd = `svn status "${repoPath}"`
      console.log('[getSvnStatus] Executing:', cmd)
      const output = execSync(cmd, { encoding: 'utf-8' })
      console.log('[getSvnStatus] Output:', output)

      const lines = output.split('\n')
      const files: Array<{ status: string; path: string }> = []

      for (const line of lines) {
        // Skip empty lines
        if (!line || line.trim() === '') continue

        // SVN status format: "M       filename"
        // First character is the status code
        // Characters 1-8 are spaces (usually 7 spaces)
        // Starting from character 8 is the filename
        const status = line[0]
        const filePath = line.substring(8).trim()

        console.log(`[getSvnStatus] Parsed line: status='${status}' path='${filePath}'`)

        // Only include recognized status codes
        if (['M', 'A', 'D', 'R', 'C', 'X', '?', '!'].includes(status) && filePath) {
          files.push({
            status,
            path: filePath
          })
        }
      }

      console.log('[getSvnStatus] Found', files.length, 'files')
      return {
        files,
        message: `发现 ${files.length} 个修改的文件`
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '获取状态失败'
      console.error('[getSvnStatus] Error:', errorMsg)
      return {
        files: [],
        message: `获取状态失败: ${errorMsg}`
      }
    }
  },

  svnRevert: async (
    repoPath: string,
    filePaths?: string[]
  ): Promise<{ success: boolean; logs: string[]; message: string }> => {
    try {
      let cmd: string

      if (filePaths && filePaths.length > 0) {
        // Revert only specified files
        const escapedPaths = filePaths.map((p) => `"${p}"`).join(' ')
        cmd = `cd "${repoPath}" && svn revert ${escapedPaths}`
      } else {
        // Revert entire repository
        cmd = `svn revert -R "${repoPath}"`
      }

      console.log('[svnRevert] Executing:', cmd)
      const output = execSync(cmd, { encoding: 'utf-8' })
      const logs = output
        .trim()
        .split('\n')
        .filter((line) => line.trim())

      return {
        success: true,
        logs: logs.length > 0 ? logs : ['恢复成功'],
        message: '恢复成功'
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '恢复失败'
      return {
        success: false,
        logs: [errorMessage],
        message: errorMessage
      }
    }
  },

  getSvnChangedFiles: async (
    repoPath: string,
    revisions: number[]
  ): Promise<Array<{ revision: number; files: Array<{ status: string; path: string }> }>> => {
    if (revisions.length === 0) return []
    try {
      const result: Array<{ revision: number; files: Array<{ status: string; path: string }> }> =
        []
      for (const revision of revisions) {
        const cmd = `svn diff --summarize -r${revision - 1}:${revision} "${repoPath}"`
        const output = execSync(cmd, { encoding: 'utf-8' })
        const lines = output.split('\n').filter((line) => line.trim())
        const files: Array<{ status: string; path: string }> = []
        for (const line of lines) {
          // Format: "M   /path/to/file" or "A   /path/to/file", etc.
          const match = line.match(/^([A-Z])\s+(.+)$/)
          if (match) {
            const status = match[1]
            const filePath = match[2]
            // Remove the repo path prefix to show only relative path
            const relativePath = filePath.replace(repoPath, '').replace(/^\//, '')
            files.push({
              status,
              path: relativePath
            })
          }
        }
        if (files.length > 0) {
          result.push({ revision, files })
        }
      }
      return result
    } catch (error) {
      console.error('Failed to fetch changed files:', error)
      return []
    }
  },

  performBatchMerge: async (
    sourceRepo: RepositoryData,
    targetRepos: RepositoryData[],
    revisions: number[],
    sourceMessage: string
  ): Promise<
    Array<{
      targetRepoName: string
      targetRepoUrl: string
      success: boolean
      message: string
      output?: string
    }>
  > => {
    const results: Array<{
      targetRepoName: string
      targetRepoUrl: string
      success: boolean
      message: string
      output?: string
    }> = []
    const revisionList = revisions.join(', ')
    const mergeMessage = `Merged revision(s) ${revisionList} from ${sourceRepo.alias}: ${sourceMessage}`

    for (const targetRepo of targetRepos) {
      try {
        // Execute merge command
        const mergeCmd = `svn merge --accept=postpone -r0:${revisions[revisions.length - 1]} "${sourceRepo.url}" "${targetRepo.url}"`
        execSync(mergeCmd, { encoding: 'utf-8' })

        // Commit changes
        const commitCmd = `svn commit "${targetRepo.url}" -m "${mergeMessage}"`
        const commitOutput = execSync(commitCmd, { encoding: 'utf-8' })

        results.push({
          targetRepoName: targetRepo.alias,
          targetRepoUrl: targetRepo.url,
          success: true,
          message: '合并成功',
          output: commitOutput
        })
      } catch (error) {
        results.push({
          targetRepoName: targetRepo.alias,
          targetRepoUrl: targetRepo.url,
          success: false,
          message: `合并失败: ${error instanceof Error ? error.message : '未知错误'}`,
          output: error instanceof Error ? error.message : undefined
        })
      }
    }

    return results
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
