import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { execSync } from 'child_process'
import { exec } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { promisify } from 'util'
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

const execAsync = promisify(exec)

type ConflictSide = 'left' | 'right'

const getAbsoluteFilePath = (repoPath: string, filePath: string): string => {
  return path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath)
}

const findLatestFileByPrefix = (dirPath: string, prefix: string): string | null => {
  if (!fs.existsSync(dirPath)) return null
  const matches = fs
    .readdirSync(dirPath)
    .filter((name) => name.startsWith(prefix))
    .sort()
  return matches.length > 0 ? matches[matches.length - 1] : null
}

const resolveConflictTempPaths = (
  repoPath: string,
  filePath: string
): {
  fullPath: string
  relativePath: string
  fileDir: string
  fileName: string
  leftPath: string | null
  rightPath: string | null
  workingPath: string
  workingExists: boolean
} => {
  const fullPath = getAbsoluteFilePath(repoPath, filePath)
  const relativePath = path.isAbsolute(filePath) ? path.relative(repoPath, filePath) : filePath
  const fileDir = path.dirname(fullPath)
  const fileName = path.basename(fullPath)

  const leftFile = findLatestFileByPrefix(fileDir, `${fileName}.merge-left.r`)
  const rightFile = findLatestFileByPrefix(fileDir, `${fileName}.merge-right.r`)
  const exactWorkingPath = path.join(fileDir, `${fileName}.working`)
  const fallbackWorkingFile = findLatestFileByPrefix(fileDir, `${fileName}.working`)
  const workingPath = fs.existsSync(exactWorkingPath)
    ? exactWorkingPath
    : fallbackWorkingFile
      ? path.join(fileDir, fallbackWorkingFile)
      : exactWorkingPath

  return {
    fullPath,
    relativePath,
    fileDir,
    fileName,
    leftPath: leftFile ? path.join(fileDir, leftFile) : null,
    rightPath: rightFile ? path.join(fileDir, rightFile) : null,
    workingPath,
    workingExists: fs.existsSync(workingPath)
  }
}

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

  openLocalDirectory: async (dirPath: string): Promise<{ success: boolean; message: string }> => {
    try {
      if (!dirPath || !fs.existsSync(dirPath)) {
        return { success: false, message: '目录不存在' }
      }

      const stat = fs.statSync(dirPath)
      if (!stat.isDirectory()) {
        return { success: false, message: '目标路径不是目录' }
      }

      const openResult = await shell.openPath(dirPath)
      if (openResult) {
        return { success: false, message: openResult }
      }

      return { success: true, message: '已打开目录' }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '打开目录失败'
      return { success: false, message: errorMsg }
    }
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
      // Check if repoPath is a URL (remote) or local path
      const isUrl = /^(https?|svn):\/\//i.test(repoPath)

      if (!revision) {
        if (isUrl) {
          // For remote URL without revision, get HEAD
          const fullUrl = repoPath.endsWith('/') ? repoPath + filePath : `${repoPath}/${filePath}`
          const cmd = `svn cat "${fullUrl}"`
          console.log('[getSvnFileContent] Executing:', cmd)
          const content = execSync(cmd, { encoding: 'utf-8' })
          return {
            success: true,
            content,
            message: '读取远程文件成功'
          }
        } else {
          // Get local file content
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath)
          const content = fs.readFileSync(fullPath, 'utf-8')
          return {
            success: true,
            content,
            message: '读取本地文件成功'
          }
        }
      }

      // For conflict resolution, support special version keywords (only for local paths)
      if (!isUrl && (revision === 'WORKING' || revision === 'MINE')) {
        // Get the working copy version (same as no revision)
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath)
        const content = fs.readFileSync(fullPath, 'utf-8')
        return {
          success: true,
          content,
          message: '读取本地工作副本成功'
        }
      }
      
      if (!isUrl && revision === 'THEIRS') {
        // For conflicts, try to find the merge-right file (theirs version)
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(repoPath, filePath)
        const fileName = path.basename(fullPath)
        const fileDir = path.dirname(fullPath)
        
        // Look for conflict files
        if (fs.existsSync(fileDir)) {
          const files = fs.readdirSync(fileDir)
          const mergeRightFile = files.find((f) => f.startsWith(fileName + '.merge-right.r'))
          
          if (mergeRightFile) {
            const mergeRightPath = path.join(fileDir, mergeRightFile)
            const content = fs.readFileSync(mergeRightPath, 'utf-8')
            return {
              success: true,
              content,
              message: '读取服务端版本成功'
            }
          }
        }
        
        // Fallback: use HEAD revision
        revision = 'HEAD'
      }

      // For BASE, HEAD or numeric revisions
      let cmd: string
      if (isUrl) {
        // For remote URL, use full URL with file path
        const fullUrl = repoPath.endsWith('/') ? repoPath + filePath : `${repoPath}/${filePath}`
        cmd = `svn cat -r ${revision} "${fullUrl}"`
      } else {
        // For local working copy, use cd + relative path
        const relativePath = path.isAbsolute(filePath)
          ? path.relative(repoPath, filePath)
          : filePath
        cmd = `cd "${repoPath}" && svn cat -r ${revision} "${relativePath}"`
      }
      
      console.log('[getSvnFileContent] Executing:', cmd)
      const output = execSync(cmd, { encoding: 'utf-8' })

      return {
        success: true,
        content: output,
        message: '获取文件内容成功'
      }
    } catch (error) {
      // Return error with details
      const errorMsg = error instanceof Error ? error.message : '未知错误'
      console.error('[getSvnFileContent] Error:', errorMsg, 'revision:', revision)
      return {
        success: false,
        content: '',
        message: `获取文件内容失败: ${errorMsg}`
      }
    }
  },

  acceptSvnTheirs: async (
    repoPath: string,
    filePath: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const tempPaths = resolveConflictTempPaths(repoPath, filePath)
      if (!tempPaths.rightPath) {
        return {
          success: false,
          message: '未找到服务端临时文件(.merge-right.r*)'
        }
      }

      const content = fs.readFileSync(tempPaths.rightPath, 'utf-8')
      fs.writeFileSync(tempPaths.fullPath, content, 'utf-8')

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
      const tempPaths = resolveConflictTempPaths(repoPath, filePath)
      if (!tempPaths.leftPath) {
        return {
          success: false,
          message: '未找到本地临时文件(.merge-left.r*)'
        }
      }

      const content = fs.readFileSync(tempPaths.leftPath, 'utf-8')
      fs.writeFileSync(tempPaths.fullPath, content, 'utf-8')

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

  getSvnConflictTempContents: async (
    repoPath: string,
    filePath: string
  ): Promise<{
    success: boolean
    message: string
    localContent: string
    serverContent: string
    workingContent: string
  }> => {
    try {
      const tempPaths = resolveConflictTempPaths(repoPath, filePath)
      if (!tempPaths.leftPath || !tempPaths.rightPath) {
        return {
          success: false,
          message: '未找到冲突临时文件，请确认当前文件处于冲突状态',
          localContent: '',
          serverContent: '',
          workingContent: ''
        }
      }

      const localContent = fs.readFileSync(tempPaths.leftPath, 'utf-8')
      const serverContent = fs.readFileSync(tempPaths.rightPath, 'utf-8')
      const workingContent = tempPaths.workingExists
        ? fs.readFileSync(tempPaths.workingPath, 'utf-8')
        : fs.readFileSync(tempPaths.fullPath, 'utf-8')

      return {
        success: true,
        message: '读取冲突临时文件成功',
        localContent,
        serverContent,
        workingContent
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '读取冲突临时文件失败'
      return {
        success: false,
        message: `读取冲突临时文件失败: ${errorMsg}`,
        localContent: '',
        serverContent: '',
        workingContent: ''
      }
    }
  },

  saveSvnConflictWorkingFile: async (
    repoPath: string,
    filePath: string,
    content: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const tempPaths = resolveConflictTempPaths(repoPath, filePath)
      fs.writeFileSync(tempPaths.workingPath, content, 'utf-8')
      return {
        success: true,
        message: 'working 文件保存成功'
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'working 文件保存失败'
      return {
        success: false,
        message: `working 文件保存失败: ${errorMsg}`
      }
    }
  },

  setSvnConflictWorkingFromSide: async (
    repoPath: string,
    filePath: string,
    side: ConflictSide
  ): Promise<{ success: boolean; message: string; workingContent: string }> => {
    try {
      const tempPaths = resolveConflictTempPaths(repoPath, filePath)
      const sourcePath = side === 'right' ? tempPaths.rightPath : tempPaths.leftPath
      if (!sourcePath) {
        return {
          success: false,
          message:
            side === 'right'
              ? '未找到服务端临时文件(.merge-right.r*)'
              : '未找到本地临时文件(.merge-left.r*)',
          workingContent: ''
        }
      }

      const sourceContent = fs.readFileSync(sourcePath, 'utf-8')
      fs.writeFileSync(tempPaths.workingPath, sourceContent, 'utf-8')

      return {
        success: true,
        message: side === 'right' ? '已将服务端版本写入 working' : '已将本地版本写入 working',
        workingContent: sourceContent
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '写入 working 失败'
      return {
        success: false,
        message: `写入 working 失败: ${errorMsg}`,
        workingContent: ''
      }
    }
  },

  resolveSvnConflictUsingWorking: async (
    repoPath: string,
    filePath: string,
    workingContent: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      const tempPaths = resolveConflictTempPaths(repoPath, filePath)

      // Persist editor result into working temp file and real file.
      fs.writeFileSync(tempPaths.workingPath, workingContent, 'utf-8')
      fs.writeFileSync(tempPaths.fullPath, workingContent, 'utf-8')

      const cmd = `cd "${repoPath}" && svn resolve --accept working "${tempPaths.relativePath}"`
      execSync(cmd, { encoding: 'utf-8' })

      const cleanupTargets = [
        tempPaths.workingPath,
        tempPaths.leftPath,
        tempPaths.rightPath
      ].filter((p): p is string => Boolean(p))
      for (const tempFile of cleanupTargets) {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile)
        }
      }

      return {
        success: true,
        message: '冲突已解决并清理临时文件'
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '解决冲突失败'
      return {
        success: false,
        message: `解决冲突失败: ${errorMsg}`
      }
    }
  },

  markSvnResolved: async (
    repoPath: string,
    filePath: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      // Convert to relative path if absolute
      const relativePath = path.isAbsolute(filePath) ? path.relative(repoPath, filePath) : filePath
      // Mark the conflict as resolved with the working copy version
      const cmd = `cd "${repoPath}" && svn resolve --accept working "${relativePath}"`
      console.log('[markSvnResolved] Executing:', cmd)
      execSync(cmd, { encoding: 'utf-8' })

      return {
        success: true,
        message: '已标记为已解决冲突'
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '标记为已解决失败'
      console.error('[markSvnResolved] Error:', errorMsg)
      return {
        success: false,
        message: `标记为已解决失败: ${errorMsg}`
      }
    }
  },

  svnCommit: async (
    repoPath: string,
    message: string,
    username?: string,
    password?: string
  ): Promise<{ success: boolean; message: string; output?: string }> => {
    try {
      // Escape shell special characters in message
      const escapedMessage = message.replace(/"/g, '\\"')
      
      // Build svn commit command
      let cmd = `cd "${repoPath}" && svn commit -m "${escapedMessage}"`
      
      // Add authentication if provided
      if (username && password) {
        cmd += ` --username "${username}" --password "${password}" --non-interactive --no-auth-cache`
      }
      
      console.log('[svnCommit] Executing commit for:', repoPath)
      
      const output = execSync(cmd, { encoding: 'utf-8' })
      console.log('[svnCommit] Output:', output)

      return {
        success: true,
        message: '提交成功',
        output
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '提交失败'
      console.error('[svnCommit] Error:', errorMsg)
      return {
        success: false,
        message: `提交失败: ${errorMsg}`,
        output: errorMsg
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
    const sortedRevisions = Array.from(new Set(revisions)).sort((a, b) => a - b)
    if (sortedRevisions.length === 0) {
      throw new Error('未指定需要合并的版本')
    }

    const mergeOneRepo = async (
      targetRepo: RepositoryData
    ): Promise<{
      targetRepoName: string
      targetRepoUrl: string
      success: boolean
      message: string
      output?: string
    }> => {
      try {
        const revStr = sortedRevisions.join(',')
        const mergeCmd = `svn merge --accept=postpone -c ${revStr} "${sourceRepo.url}" "${targetRepo.url}"`
        const { stdout, stderr } = await execAsync(mergeCmd, {
          cwd: targetRepo.url,
          maxBuffer: 10 * 1024 * 1024
        })

        const output = `${stdout || ''}${stderr || ''}`.trim()
        const hasConflict = output
          .split('\n')
          .some((line) => line.trim().startsWith('C') || line.toLowerCase().includes('conflict'))

        // 成功执行merge命令，无论是否有冲突都返回success=true
        return {
          targetRepoName: targetRepo.alias,
          targetRepoUrl: targetRepo.url,
          success: true,
          message: hasConflict ? '合并冲突' : '合并成功',
          output
        }
      } catch (error) {
        let hasConflict = false
        try {
          const statusResult = await apiHandlers.getSvnStatus(targetRepo.url)
          hasConflict = statusResult.files.some((f) => f.status === 'C')
        } catch {
          // Ignore status read failure and fallback to merge error.
        }

        if (hasConflict) {
          return {
            targetRepoName: targetRepo.alias,
            targetRepoUrl: targetRepo.url,
            success: true,
            message: '合并冲突',
            output: error instanceof Error ? error.message : String(error)
          }
        }

        return {
          targetRepoName: targetRepo.alias,
          targetRepoUrl: targetRepo.url,
          success: false,
          message: `合并失败: ${error instanceof Error ? error.message : '未知错误'}`,
          output: error instanceof Error ? error.message : undefined
        }
      }
    }

    return Promise.all(targetRepos.map((repo) => mergeOneRepo(repo)))
  },

  performSingleMerge: async (
    sourceRepo: RepositoryData,
    targetRepo: RepositoryData,
    revisions: number[]
  ): Promise<{
    targetRepoName: string
    targetRepoUrl: string
    targetRepoPath?: string
    success: boolean
    message: string
    files?: string[]
    output?: string
  }> => {
    const sortedRevisions = Array.from(new Set(revisions)).sort((a, b) => a - b)
    if (sortedRevisions.length === 0) {
      throw new Error('未指定需要合并的版本')
    }

    try {
      const revStr = sortedRevisions.join(',')
      const mergeCmd = `svn merge --accept=postpone -c ${revStr} "${sourceRepo.url}" "${targetRepo.url}"`
      const { stdout, stderr } = await execAsync(mergeCmd, {
        cwd: targetRepo.url,
        maxBuffer: 10 * 1024 * 1024
      })

      const output = `${stdout || ''}${stderr || ''}`.trim()
      const hasConflict = output
        .split('\n')
        .some((line) => line.trim().startsWith('C') || line.toLowerCase().includes('conflict'))

      // 获取受影响的文件列表
      const statusResult = await apiHandlers.getSvnStatus(targetRepo.url)
      const affectedFiles = statusResult.files
        .map((f) => `${f.status}  ${f.path}`)
        .filter((f) => ['C', 'M', 'A', 'D', 'R'].some((st) => f.startsWith(st)))

      // 成功执行merge命令，无论是否有冲突都返回success=true
      // 前端通过files中是否有'C'开头的文件来判断是否有冲突
      return {
        targetRepoName: targetRepo.alias,
        targetRepoUrl: targetRepo.url,
        targetRepoPath: targetRepo.url,
        success: true,
        message: hasConflict ? '合并冲突' : '合并成功',
        files: affectedFiles,
        output
      }
    } catch (error) {
      // 即使出错，也尝试获取文件列表
      let affectedFiles: string[] = []
      let hasConflict = false
      try {
        const statusResult = await apiHandlers.getSvnStatus(targetRepo.url)
        affectedFiles = statusResult.files
          .map((f) => `${f.status}  ${f.path}`)
          .filter((f) => ['C', 'M', 'A', 'D', 'R'].some((st) => f.startsWith(st)))
        hasConflict = statusResult.files.some((f) => f.status === 'C')
      } catch {
        // 忽略 getSvnStatus 的错误，继续返回merge错误
      }

      if (hasConflict) {
        return {
          targetRepoName: targetRepo.alias,
          targetRepoUrl: targetRepo.url,
          targetRepoPath: targetRepo.url,
          success: true,
          message: '合并冲突',
          files: affectedFiles,
          output: error instanceof Error ? error.message : String(error)
        }
      }

      return {
        targetRepoName: targetRepo.alias,
        targetRepoUrl: targetRepo.url,
        targetRepoPath: targetRepo.url,
        success: false,
        message: `合并失败: ${error instanceof Error ? error.message : '未知错误'}`,
        files: affectedFiles,
        output: error instanceof Error ? error.message : undefined
      }
    }
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
