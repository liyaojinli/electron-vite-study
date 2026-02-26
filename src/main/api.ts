import { ipcMain, dialog, BrowserWindow } from 'electron'
import { execSync } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
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
      // 直接使用 repoPath，无需判断本地路径
      let cmd = `svn log "${repoPath}" --limit ${limit} --xml`

      // Add search parameter if provided
      if (searchKeyword) {
        cmd += ` --search "${searchKeyword}"`
      }

      // When both dates are provided, extend endDate to next day to include the entire end date
      if (startDate && endDate) {
        let revisionRange = ''
        const endDateObj = new Date(endDate)
        endDateObj.setDate(endDateObj.getDate() + 1)
        const nextDay = endDateObj.toISOString().split('T')[0]
        revisionRange = `{${startDate}}:{${nextDay}}`
        if (revisionRange) {
          cmd += ` -r ${revisionRange}`
        }
      }

      const output = execSync(cmd, { encoding: 'utf-8' })

      // Parse XML output
      const logs: Array<{ revision: number; author: string; date: string; message: string }> = []

      const revisionRegex =
        /<logentry\s+revision="(\d+)"[^>]*>[\s\S]*?<author>([^<]*)<\/author>[\s\S]*?<date>([^<]*)<\/date>[\s\S]*?<msg>([^<]*)<\/msg>/g

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

  getSvnDiff: async (
    repoPath: string,
    filePath: string
  ): Promise<{ success: boolean; diff: string; message: string }> => {
    try {
      // Convert to relative path if absolute
      const relativePath = path.isAbsolute(filePath) ? path.relative(repoPath, filePath) : filePath
      const cmd = `cd "${repoPath}" && svn diff "${relativePath}"`
      console.log('[getSvnDiff] Executing:', cmd)
      const output = execSync(cmd, { encoding: 'utf-8' })

      return {
        success: true,
        diff: output,
        message: '获取差异成功'
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '获取差异失败'
      console.error('[getSvnDiff] Error:', errorMsg)
      return {
        success: false,
        diff: '',
        message: `获取差异失败: ${errorMsg}`
      }
    }
  },

  // Get diff between two revisions for a specific file
  getSvnRevisionDiff: async (
    repoPath: string,
    filePath: string,
    baseRevision: number,
    targetRevision: number
  ): Promise<{ success: boolean; diff: string; message: string }> => {
    try {
      // Convert to relative path if absolute
      const relativePath = path.isAbsolute(filePath) ? path.relative(repoPath, filePath) : filePath
      const cmd = `cd "${repoPath}" && svn diff -r${baseRevision}:${targetRevision} "${relativePath}"`
      console.log('[getSvnRevisionDiff] Executing:', cmd)
      const output = execSync(cmd, { encoding: 'utf-8' })

      return {
        success: true,
        diff: output,
        message: '获取版本差异成功'
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '获取版本差异失败'
      console.error('[getSvnRevisionDiff] Error:', errorMsg)
      return {
        success: false,
        diff: '',
        message: `获取版本差异失败: ${errorMsg}`
      }
    }
  },

  getSvnFileContent: async (
    repoPath: string,
    filePath: string,
    revision?: string
  ): Promise<{ success: boolean; content: string; message: string }> => {
    try {
      let cmd: string
      if (revision) {
        // Get file content from specific revision
        // Convert to relative path if absolute
        const relativePath = path.isAbsolute(filePath)
          ? path.relative(repoPath, filePath)
          : filePath

        // Get the base URL of the working copy
        // 判断repoPath是否为本地路径，如果是则直接使用，否则执行svn info获取URL
        let wcUrl = repoPath
        if (fs.existsSync(repoPath) && fs.lstatSync(repoPath).isDirectory()) {
          const infoCmd = `cd "${repoPath}" && svn info --show-item url`
          wcUrl = execSync(infoCmd, { encoding: 'utf-8' }).trim()
        }

        // Build the full file URL - ensure no double slashes
        const cleanRelativePath = relativePath.replace(/\\/g, '/').replace(/^\//, '')
        const fileUrl = `${wcUrl}/${cleanRelativePath}`

        // For deleted files, we need to use peg revision with the URL
        cmd = `svn cat "${fileUrl}"@${revision}`
      } else {
        // Get local file content
        // Check if filePath is already absolute, if not, join with repoPath
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath)
        const content = fs.readFileSync(fullPath, 'utf-8')
        return {
          success: true,
          content,
          message: '读取本地文件成功'
        }
      }

      const output = execSync(cmd, { encoding: 'utf-8' })

      return {
        success: true,
        content: output,
        message: '获取文件内容成功'
      }
    } catch {
      // Silently return empty content for deleted/non-existent files
      return {
        success: false,
        content: '',
        message: '文件不存在或已删除'
      }
    }
  },

  acceptSvnTheirs: async (
    repoPath: string,
    filePath: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      // Check if filePath is absolute
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath)
      // Convert to relative path for svn command
      const relativePath = path.isAbsolute(filePath) ? path.relative(repoPath, filePath) : filePath
      const cmd = `cd "${repoPath}" && svn cat "${relativePath}" > "${absolutePath}"`
      console.log('[acceptSvnTheirs] Executing:', cmd)
      execSync(cmd, { encoding: 'utf-8' })

      return {
        success: true,
        message: '已接受服务端版本'
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '接受服务端版本失败'
      console.error('[acceptSvnTheirs] Error:', errorMsg)
      return {
        success: false,
        message: `接受服务端版本失败: ${errorMsg}`
      }
    }
  },

  acceptSvnMine: async (
    repoPath: string,
    filePath: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      // Convert to relative path if absolute
      const relativePath = path.isAbsolute(filePath) ? path.relative(repoPath, filePath) : filePath
      // Mark the conflict as resolved, keeping local version
      const cmd = `cd "${repoPath}" && svn resolve --accept mine-full "${relativePath}"`
      console.log('[acceptSvnMine] Executing:', cmd)
      execSync(cmd, { encoding: 'utf-8' })

      return {
        success: true,
        message: '已保留本地版本'
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '保留本地版本失败'
      console.error('[acceptSvnMine] Error:', errorMsg)
      return {
        success: false,
        message: `保留本地版本失败: ${errorMsg}`
      }
    }
  },

  saveSvnFile: async (
    repoPath: string,
    filePath: string,
    content: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      // Check if filePath is already absolute, if not, join with repoPath
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath)
      fs.writeFileSync(fullPath, content, 'utf-8')

      return {
        success: true,
        message: '文件保存成功'
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '文件保存失败'
      console.error('[saveSvnFile] Error:', errorMsg)
      return {
        success: false,
        message: `文件保存失败: ${errorMsg}`
      }
    }
  },

  getSvnChangedFiles: async (
    repoPath: string,
    revisions: number[]
  ): Promise<Array<{ revision: number; files: Array<{ status: string; path: string }> }>> => {
    if (revisions.length === 0) return []
    try {
      // Get the SVN URL of the working copy to properly compute relative paths
      const wcUrl = repoPath

      const result: Array<{ revision: number; files: Array<{ status: string; path: string }> }> = []
      for (const revision of revisions) {
        const cmd = `svn diff --summarize -r${revision - 1}:${revision} "${repoPath}"`
        const output = execSync(cmd, { encoding: 'utf-8' })
        const lines = output.split('\n').filter((line) => line.trim())
        const files: Array<{ status: string; path: string }> = []
        for (const line of lines) {
          // Format: "M   /path/to/file" or "A   /path/to/file", or URL format
          const match = line.match(/^([A-Z])\s+(.+)$/)
          if (match) {
            const status = match[1]
            const filePath = match[2]
            // Remove either local path or URL prefix to get relative path
            const relativePath = filePath
              .replace(repoPath, '')
              .replace(wcUrl, '')
              .replace(/^\//, '')
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
    revisions: number[]
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
    for (const targetRepo of targetRepos) {
      try {
        // 先排序，去重
        const sortedRevisions = Array.from(new Set(revisions)).sort((a, b) => a - b)
        if (sortedRevisions.length === 0) throw new Error('未指定需要合并的版本')
        // 使用-c参数批量合并多个不连续的提交
        const revStr = sortedRevisions.join(',')
        const mergeCmd = `svn merge --accept=postpone -c ${revStr} "${sourceRepo.url}" "${targetRepo.url}"`
        const output = execSync(mergeCmd, {
          encoding: 'utf-8',
          cwd: targetRepo.url
        })
        // 检查是否有冲突文件（C开头的行）
        const hasConflict = output.split('\n').some((line) => line.trim().startsWith('C'))
        results.push({
          targetRepoName: targetRepo.alias,
          targetRepoUrl: targetRepo.url,
          success: !hasConflict,
          message: hasConflict ? '合并冲突' : '合并成功',
          output
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
