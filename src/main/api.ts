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

// 单个版本的 merge 状态
export interface RevisionMergeState {
  revision: number
  status: 'pending' | 'merging' | 'success' | 'conflict' | 'failed'
  files?: string[] // 受影响的文件列表（格式：'C  path/to/file'）
  message?: string
}

// 单个仓库的 merge 会话状态
export interface MergeSessionResult {
  targetRepoName: string
  targetRepoUrl: string
  targetRepoPath: string
  sourceRepoUrl: string
  revisions: RevisionMergeState[]
  currentRevisionIndex: number // 当前正在处理的版本索引（-1表示全部完成）
  allCompleted: boolean // 所有版本是否都已完成
  success: boolean // 整体是否成功（无失败的版本）
  message: string
  files?: string[] // 当前所有受影响的文件（累积）
  isMerging?: boolean // 是否正在 merge 中
}

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

type SvnLogEntry = {
  revision: number
  author: string
  date: string
  message: string
}

const decodeXmlEntities = (input: string): string => {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

const parseSvnLogXml = (xml: string): SvnLogEntry[] => {
  const logs: SvnLogEntry[] = []
  const entryRegex = /<logentry\s+revision="(\d+)"[^>]*>([\s\S]*?)<\/logentry>/g

  let entryMatch: RegExpExecArray | null
  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const revision = parseInt(entryMatch[1], 10)
    const body = entryMatch[2]

    const authorMatch = body.match(/<author>([\s\S]*?)<\/author>/)
    const dateMatch = body.match(/<date>([\s\S]*?)<\/date>/)

    let message = ''
    const msgMatch = body.match(/<msg>([\s\S]*?)<\/msg>/)
    if (msgMatch) {
      message = decodeXmlEntities(msgMatch[1])
    }

    logs.push({
      revision,
      author: authorMatch ? decodeXmlEntities(authorMatch[1]) : '',
      date: dateMatch ? dateMatch[1] : '',
      message
    })
  }

  return logs
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
      return parseSvnLogXml(output)
    } catch (error) {
      console.error('Failed to fetch SVN logs:', error)
      return []
    }
  },

  getSvnLogByRevisions: async (
    repoPath: string,
    revisions: number[]
  ): Promise<Array<{ revision: number; author: string; date: string; message: string }>> => {
    const uniqueRevisions = Array.from(
      new Set(revisions.filter((r) => Number.isFinite(r) && r > 0))
    )
      .map((r) => Math.floor(r))
      .sort((a, b) => a - b)

    if (uniqueRevisions.length === 0) {
      return []
    }

    const logs: SvnLogEntry[] = []
    for (const revision of uniqueRevisions) {
      try {
        // 精确查询远程仓库指定 revision，避免被 --limit 截断。
        const cmd = `svn log "${repoPath}" -r ${revision}:${revision} --xml`
        const output = execSync(cmd, { encoding: 'utf-8' })
        const parsed = parseSvnLogXml(output)
        const matched = parsed.find((entry) => entry.revision === revision)
        if (matched) {
          logs.push(matched)
        }
      } catch (error) {
        console.warn(`Failed to fetch SVN log for revision r${revision}:`, error)
      }
    }

    return logs
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

  getSvnRemoteUrl: async (
    repoPath: string
  ): Promise<{ success: boolean; url: string; message: string }> => {
    try {
      const showItemCmd = 'svn info --show-item url'
      try {
        const output = execSync(showItemCmd, { encoding: 'utf-8', cwd: repoPath }).trim()
        return {
          success: true,
          url: output,
          message: '获取远程路径成功'
        }
      } catch {
        const infoOutput = execSync('svn info', { encoding: 'utf-8', cwd: repoPath })
        const match = infoOutput.match(/^URL:\s*(.+)$/m)
        if (match?.[1]) {
          return {
            success: true,
            url: match[1].trim(),
            message: '获取远程路径成功'
          }
        }
        return {
          success: false,
          url: '',
          message: '未在 svn info 输出中找到远程路径'
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '获取远程路径失败'
      return {
        success: false,
        url: '',
        message: `获取远程路径失败: ${errorMsg}`
      }
    }
  },

  svnRevert: async (
    repoPath: string,
    filePaths?: string[]
  ): Promise<{ success: boolean; logs: string[]; message: string }> => {
    try {
      let cmd: string
      let output: string

      if (filePaths && filePaths.length > 0) {
        // Revert only specified files
        const escapedPaths = filePaths.map((p) => `"${p}"`).join(' ')
        cmd = `svn revert ${escapedPaths}`
        console.log('[svnRevert] Executing:', cmd)
        output = execSync(cmd, { encoding: 'utf-8', cwd: repoPath })
      } else {
        // Revert entire repository
        cmd = `svn revert -R "."`
        console.log('[svnRevert] Executing:', cmd)
        output = execSync(cmd, { encoding: 'utf-8', cwd: repoPath })
      }

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
      const cmd = `svn diff "${relativePath}"`
      console.log('[getSvnDiff] Executing:', cmd)
      const output = execSync(cmd, { encoding: 'utf-8', cwd: repoPath })

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
      const cmd = `svn diff -r${baseRevision}:${targetRevision} "${relativePath}"`
      console.log('[getSvnRevisionDiff] Executing:', cmd)
      const output = execSync(cmd, { encoding: 'utf-8', cwd: repoPath })

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

      // For remote URLs, get the repository root URL
      let repoRootUrl = repoPath
      if (isUrl) {
        try {
          const infoCmd = `svn info --show-item repos-root-url "${repoPath}"`
          repoRootUrl = execSync(infoCmd, { encoding: 'utf-8' }).trim()
          console.log('[getSvnFileContent] Repository root URL:', repoRootUrl)
        } catch {
          console.warn('[getSvnFileContent] Failed to get repo root URL, using repoPath as-is')
          repoRootUrl = repoPath
        }
      }

      if (!revision) {
        if (isUrl) {
          // For remote URL without revision, get HEAD
          // Use repository root URL + file path (which starts with /)
          const fullUrl = filePath.startsWith('/')
            ? repoRootUrl + filePath
            : `${repoRootUrl}/${filePath}`
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
      let output: string
      if (isUrl) {
        // For remote URL, use repository root URL + file path
        const fullUrl = filePath.startsWith('/')
          ? repoRootUrl + filePath
          : `${repoRootUrl}/${filePath}`
        cmd = `svn cat -r ${revision} "${fullUrl}"`
        console.log('[getSvnFileContent] Executing:', cmd)
        output = execSync(cmd, { encoding: 'utf-8' })
      } else {
        // For local working copy, use cwd option
        const relativePath = path.isAbsolute(filePath)
          ? path.relative(repoPath, filePath)
          : filePath
        cmd = `svn cat -r ${revision} "${relativePath}"`
        console.log('[getSvnFileContent] Executing:', cmd)
        output = execSync(cmd, { encoding: 'utf-8', cwd: repoPath })
      }

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

      const cmd = `svn resolve --accept working "${tempPaths.relativePath}"`
      execSync(cmd, { encoding: 'utf-8', cwd: repoPath })

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
      const cmd = `svn resolve --accept working "${relativePath}"`
      console.log('[markSvnResolved] Executing:', cmd)
      execSync(cmd, { encoding: 'utf-8', cwd: repoPath })

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
    filePaths?: string[],
    username?: string,
    password?: string
  ): Promise<{ success: boolean; message: string; output?: string; command?: string }> => {
    try {
      // Escape shell special characters in message
      const escapedMessage = message.replace(/"/g, '\\"')

      const commitPaths = (filePaths || [])
        .map((filePath) => filePath.trim())
        .filter((filePath) => filePath !== '')

      if (commitPaths.length === 0) {
        return {
          success: false,
          message: '提交失败: 未找到可提交的 merge 文件',
          output: 'No merge files to commit',
          command: 'svn commit (no files)'
        }
      }

      const escapedPaths = commitPaths
        .map((filePath) => `"${filePath.replace(/"/g, '\\"')}"`)
        .join(' ')
      
      // Build svn commit command
      let cmd = `svn commit -m "${escapedMessage}" ${escapedPaths}`
      
      // Add authentication if provided
      if (username && password) {
        cmd += ` --username "${username}" --password "${password}" --non-interactive --no-auth-cache`
      }
      
      console.log('[svnCommit] Executing commit for:', repoPath)
      
      const output = execSync(cmd, { encoding: 'utf-8', cwd: repoPath })
      console.log('[svnCommit] Output:', output)

      return {
        success: true,
        message: '提交成功',
        output,
        command: cmd
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '提交失败'
      console.error('[svnCommit] Error:', errorMsg)
      
      // Build command for error case as well
      const escapedMessage = message.replace(/"/g, '\\"')
      const escapedPaths = (filePaths || [])
        .map((filePath) => `"${filePath.replace(/"/g, '\\"')}"`)
        .join(' ')
      let cmd = `svn commit -m "${escapedMessage}" ${escapedPaths}`
      if (username && password) {
        cmd += ` --username "${username}" --password "***" --non-interactive --no-auth-cache`
      }
      
      return {
        success: false,
        message: `提交失败: ${errorMsg}`,
        output: errorMsg,
        command: cmd
      }
    }
  },

  getSvnChangedFiles: async (
    repoPath: string,
    revisions: number[]
  ): Promise<Array<{ revision: number; files: Array<{ status: string; path: string }> }>> => {
    console.log('[getSvnChangedFiles] Called with:', { repoPath, revisions })
    if (revisions.length === 0) {
      console.log('[getSvnChangedFiles] Empty revisions, returning []')
      return []
    }

    const result: Array<{ revision: number; files: Array<{ status: string; path: string }> }> = []
    
    // Check if repoPath is a remote URL (svn://, http://, https://, file://) or local path
    const isRemoteUrl = /^(svn|https?|file):\/\//.test(repoPath)
    console.log('[getSvnChangedFiles] Detected as:', isRemoteUrl ? 'remote URL' : 'local path')

    try {
      for (const revision of revisions) {
        try {
          let output: string
          
          if (isRemoteUrl) {
            // For remote URLs, use svn log with verbose mode
            const cmd = `svn log -r ${revision} --verbose "${repoPath}"`
            console.log('[getSvnChangedFiles] Executing remote URL command:', cmd)
            output = execSync(cmd, { encoding: 'utf-8' })
          } else {
            // For local paths, use svn diff --summarize
            const cmd = `svn diff --summarize -r ${revision - 1}:${revision} "${repoPath}"`
            console.log('[getSvnChangedFiles] Executing local path command:', cmd)
            output = execSync(cmd, { encoding: 'utf-8' })
          }
          
          console.log(`[getSvnChangedFiles] Output for r${revision}:`, output)
          const files: Array<{ status: string; path: string }> = []
          
          if (isRemoteUrl) {
            // Parse verbose log output
            // Format: M /path/to/file (from /path/to/file:r123)
            const lines = output.split('\n')
            let inChanges = false
            
            for (const line of lines) {
              if (line.trim() === 'Changed paths:') {
                inChanges = true
                continue
              }
              
              if (!inChanges) continue
              
              // Stop at the message/log content
              if (line.trim() && !line.match(/^\s*[ADM]\s+/)) {
                if (line.trim().startsWith('-')) {
                  break
                }
              }
              
              const match = line.match(/^\s*([ADM])\s+(.+?)(?:\s*\(.*\))?$/)
              if (match) {
                const filePath = match[2].trim().replace(/\s*\(.*\)$/, '')
                files.push({
                  status: match[1],
                  path: filePath
                })
              }
            }
          } else {
            // Parse diff output
            // Format: "M   /path/to/file" or "M   path/to/file"
            const lines = output.split('\n').filter((line) => line.trim())
            
            for (const line of lines) {
              const match = line.match(/^([A-Z])\s+(.+)$/)
              if (match) {
                const status = match[1]
                const filePath = match[2].replace(repoPath, '').replace(/^\//, '')
                
                if (filePath) {
                  files.push({
                    status,
                    path: filePath
                  })
                }
              }
            }
          }
          
          if (files.length > 0) {
            result.push({ revision, files })
            console.log(
              `[getSvnChangedFiles] r${revision} has ${files.length} changed files:`,
              files
            )
          } else {
            console.log(`[getSvnChangedFiles] r${revision} - no files found`)
          }
        } catch (revError) {
          console.error(`[getSvnChangedFiles] Error processing r${revision}:`, revError)
          // Continue to next revision instead of failing completely
        }
      }
      
      console.log('[getSvnChangedFiles] Final result:', result)
      return result
    } catch (error) {
      console.error('[getSvnChangedFiles] Fatal error:', error)
      return []
    }
  },

  performBatchMerge: async (
    sourceRepo: RepositoryData,
    targetRepos: RepositoryData[],
    revisions: number[]
  ): Promise<MergeSessionResult[]> => {
    const sortedRevisions = Array.from(new Set(revisions)).sort((a, b) => a - b)
    if (sortedRevisions.length === 0) {
      throw new Error('未指定需要合并的版本')
    }

    // 对每个仓库执行 performSingleMerge（并行）
    return Promise.all(
      targetRepos.map((repo) => apiHandlers.performSingleMerge(sourceRepo, repo, sortedRevisions))
    )
  },

  performSingleMerge: async (
    sourceRepo: RepositoryData,
    targetRepo: RepositoryData,
    revisions: number[]
  ): Promise<MergeSessionResult> => {
    const sortedRevisions = Array.from(new Set(revisions)).sort((a, b) => a - b)
    if (sortedRevisions.length === 0) {
      throw new Error('未指定需要合并的版本')
    }

    // 初始化所有版本状态为 pending
    const revisionStates: RevisionMergeState[] = sortedRevisions.map((rev) => ({
      revision: rev,
      status: 'pending',
      files: [],
      message: ''
    }))

    // 循环处理版本，直到遇到冲突或失败才停止并返回
    let currentIndex = 0
    while (currentIndex < revisionStates.length) {
      const currentRevision = sortedRevisions[currentIndex]
      revisionStates[currentIndex].status = 'merging'

      try {
        const mergeCmd = `svn merge --accept=postpone -c ${currentRevision} "${sourceRepo.url}" "${targetRepo.url}"`
        await execAsync(mergeCmd, {
          cwd: targetRepo.url,
          maxBuffer: 10 * 1024 * 1024
        })

        // 获取受影响的文件列表
        const statusResult = await apiHandlers.getSvnStatus(targetRepo.url)
        const affectedFiles = statusResult.files
          .map((f) => `${f.status}  ${f.path}`)
          .filter((f) => ['C', 'M', 'A', 'D', 'R'].some((st) => f.startsWith(st)))

        const hasConflict = statusResult.files.some((f) => f.status === 'C')

        // 更新当前版本的状态
        revisionStates[currentIndex].status = hasConflict ? 'conflict' : 'success'
        revisionStates[currentIndex].files = affectedFiles
        revisionStates[currentIndex].message = hasConflict ? '合并冲突' : '合并成功'

        // 累积所有文件
        const allFiles = new Set<string>()
        revisionStates.forEach((rev) => {
          rev.files?.forEach((f) => allFiles.add(f))
        })

        // 如果有冲突，停止并返回
        if (hasConflict) {
          return {
            targetRepoName: targetRepo.alias,
            targetRepoUrl: targetRepo.url,
            targetRepoPath: targetRepo.url,
            sourceRepoUrl: sourceRepo.url,
            revisions: revisionStates,
            currentRevisionIndex: currentIndex,
            allCompleted: false,
            success: true,
            message: `版本 r${currentRevision} 合并冲突`,
            files: Array.from(allFiles),
            isMerging: false
          }
        }

        // 成功，继续处理下一个版本
        currentIndex++
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
          // 忽略 getSvnStatus 的错误
        }

        if (hasConflict) {
          revisionStates[currentIndex].status = 'conflict'
          revisionStates[currentIndex].files = affectedFiles
          revisionStates[currentIndex].message = '合并冲突'

          const allFiles = new Set<string>()
          revisionStates.forEach((rev) => {
            rev.files?.forEach((f) => allFiles.add(f))
          })

          return {
            targetRepoName: targetRepo.alias,
            targetRepoUrl: targetRepo.url,
            targetRepoPath: targetRepo.url,
            sourceRepoUrl: sourceRepo.url,
            revisions: revisionStates,
            currentRevisionIndex: currentIndex,
            allCompleted: false,
            success: true,
            message: `版本 r${currentRevision} 合并冲突`,
            files: Array.from(allFiles),
            isMerging: false
          }
        }

        // 真正的失败，停止处理
        revisionStates[currentIndex].status = 'failed'
        revisionStates[currentIndex].message = error instanceof Error ? error.message : '未知错误'

        const allFiles = new Set<string>()
        revisionStates.forEach((rev) => {
          rev.files?.forEach((f) => allFiles.add(f))
        })

        return {
          targetRepoName: targetRepo.alias,
          targetRepoUrl: targetRepo.url,
          targetRepoPath: targetRepo.url,
          sourceRepoUrl: sourceRepo.url,
          revisions: revisionStates,
          currentRevisionIndex: currentIndex,
          allCompleted: false,
          success: false,
          message: `版本 r${currentRevision} 合并失败: ${error instanceof Error ? error.message : '未知错误'}`,
          files: Array.from(allFiles),
          isMerging: false
        }
      }
    }

    // 所有版本都成功处理完了
    const allFiles = new Set<string>()
    revisionStates.forEach((rev) => {
      rev.files?.forEach((f) => allFiles.add(f))
    })

    return {
      targetRepoName: targetRepo.alias,
      targetRepoUrl: targetRepo.url,
      targetRepoPath: targetRepo.url,
      sourceRepoUrl: sourceRepo.url,
      revisions: revisionStates,
      currentRevisionIndex: -1,
      allCompleted: true,
      success: true,
      message: '全部合并成功',
      files: Array.from(allFiles),
      isMerging: false
    }
  },

  // 继续 merge 下一个版本（在冲突解决后调用）
  mergeNextRevision: async (
    sourceRepoUrl: string,
    targetRepoPath: string,
    currentSession: MergeSessionResult
  ): Promise<MergeSessionResult> => {
    // 验证是否还有待处理的版本
    if (currentSession.currentRevisionIndex < 0 || currentSession.allCompleted) {
      return {
        ...currentSession,
        message: '所有版本已完成'
      }
    }

    // 循环处理版本，直到遇到冲突或失败才停止并返回
    while (currentSession.currentRevisionIndex < currentSession.revisions.length) {
      // 找到下一个待处理的版本
      let nextIndex = currentSession.currentRevisionIndex
      while (nextIndex < currentSession.revisions.length) {
        const rev = currentSession.revisions[nextIndex]
        if (rev.status === 'pending') {
          break
        }
        nextIndex++
      }

      // 如果没有待处理的版本了
      if (nextIndex >= currentSession.revisions.length) {
        const hasAnyFailed = currentSession.revisions.some((r) => r.status === 'failed')
        const hasAnyConflict = currentSession.revisions.some((r) => r.status === 'conflict')

        currentSession.currentRevisionIndex = -1
        currentSession.allCompleted = true
        currentSession.success = !hasAnyFailed
        currentSession.message = hasAnyFailed
          ? '部分版本合并失败'
          : hasAnyConflict
            ? '所有冲突已解决'
            : '全部合并成功'
        return currentSession
      }

      // Merge 当前版本
      const nextRevision = currentSession.revisions[nextIndex].revision
      currentSession.revisions[nextIndex].status = 'merging'

      try {
        const mergeCmd = `svn merge --accept=postpone -c ${nextRevision} "${sourceRepoUrl}" "${targetRepoPath}"`
        await execAsync(mergeCmd, {
          cwd: targetRepoPath,
          maxBuffer: 10 * 1024 * 1024
        })

        // 获取受影响的文件列表
        const statusResult = await apiHandlers.getSvnStatus(targetRepoPath)
        const affectedFiles = statusResult.files
          .map((f) => `${f.status}  ${f.path}`)
          .filter((f) => ['C', 'M', 'A', 'D', 'R'].some((st) => f.startsWith(st)))

        const hasConflict = statusResult.files.some((f) => f.status === 'C')

        // 更新当前版本的状态
        currentSession.revisions[nextIndex].status = hasConflict ? 'conflict' : 'success'
        currentSession.revisions[nextIndex].files = affectedFiles
        currentSession.revisions[nextIndex].message = hasConflict ? '合并冲突' : '合并成功'

        // 更新累积的文件列表
        const allFiles = new Set(currentSession.files || [])
        affectedFiles.forEach((f) => allFiles.add(f))
        currentSession.files = Array.from(allFiles)

        // 如果有冲突，停止并返回，等待用户解决
        if (hasConflict) {
          currentSession.currentRevisionIndex = nextIndex
          currentSession.message = `版本 r${nextRevision} 合并冲突`
          return currentSession
        }

        // 成功了，继续循环处理下一个版本
        currentSession.currentRevisionIndex = nextIndex + 1
        currentSession.message = `版本 r${nextRevision} 合并成功，继续处理下一个版本...`
        // 继续循环，不返回
      } catch (error) {
        // 即使出错，也尝试获取文件列表
        let affectedFiles: string[] = []
        let hasConflict = false
        try {
          const statusResult = await apiHandlers.getSvnStatus(targetRepoPath)
          affectedFiles = statusResult.files
            .map((f) => `${f.status}  ${f.path}`)
            .filter((f) => ['C', 'M', 'A', 'D', 'R'].some((st) => f.startsWith(st)))
          hasConflict = statusResult.files.some((f) => f.status === 'C')
        } catch {
          // 忽略
        }

        if (hasConflict) {
          currentSession.revisions[nextIndex].status = 'conflict'
          currentSession.revisions[nextIndex].files = affectedFiles
          currentSession.revisions[nextIndex].message = '合并冲突'
          currentSession.currentRevisionIndex = nextIndex
          currentSession.message = `版本 r${nextRevision} 合并冲突`

          // 更新累积的文件列表
          const allFiles = new Set(currentSession.files || [])
          affectedFiles.forEach((f) => allFiles.add(f))
          currentSession.files = Array.from(allFiles)

          return currentSession
        }

        // 真正的失败，停止所有处理
        currentSession.revisions[nextIndex].status = 'failed'
        currentSession.revisions[nextIndex].message =
          error instanceof Error ? error.message : '未知错误'
        currentSession.currentRevisionIndex = nextIndex
        currentSession.success = false
        currentSession.message = `版本 r${nextRevision} 合并失败: ${error instanceof Error ? error.message : '未知错误'}`
        return currentSession
      }
    }

    // 循环结束，所有待处理版本都已完成
    const hasAnyFailed = currentSession.revisions.some((r) => r.status === 'failed')
    currentSession.currentRevisionIndex = -1
    currentSession.allCompleted = true
    currentSession.success = !hasAnyFailed
    currentSession.message = hasAnyFailed ? '部分版本合并失败' : '全部合并成功'
    return currentSession
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
