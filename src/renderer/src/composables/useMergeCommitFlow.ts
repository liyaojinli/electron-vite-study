import { computed, ref, watch, type Ref } from 'vue'
import type { FileWithStatus, MergeSessionResult, RepositoryToCommit } from '../../../shared/merge'
import type { SvnCommitLog } from '../components/SvnLogViewer.vue'
import { getTrackedFilePaths } from '../utils/mergeProgress'

interface UseMergeCommitFlowOptions {
  visible: Ref<boolean>
  sourceRepoUrl: Ref<string | undefined>
  selectedRevisions: Ref<number[] | undefined>
  results: Ref<MergeSessionResult[]>
  hasUnresolvedConflicts: (result: MergeSessionResult) => boolean
  isConflict: (fileEntry: string, repoPath?: string) => boolean
  parseFilePath: (fileEntry: string, repoPath?: string) => string
  isConflictResolved: (repoPath: string, filePath: string) => boolean
  getCommitFilePaths: (result: MergeSessionResult) => string[]
  onCommitSuccess: () => void
  onRequestClose: () => void
}

interface UseMergeCommitFlowResult {
  commitUsername: Ref<string>
  commitPassword: Ref<string>
  commitMessage: Ref<string>
  isCommitting: Ref<boolean>
  logViewerVisible: Ref<boolean>
  commitLogs: Ref<SvnCommitLog[]>
  beforeCommitConfirmVisible: Ref<boolean>
  repositoriesToConfirm: Ref<RepositoryToCommit[]>
  canCommit: Readonly<Ref<boolean>>
  handleCommit: () => Promise<void>
  handleConfirmCommit: (confirmedRepoPaths: string[]) => Promise<void>
  handleLogViewerClose: () => void
}

const normalizeSourceRepoForCommitMessage = (sourceRepoUrl: string): string => {
  try {
    const parsed = new URL(sourceRepoUrl)
    const normalizedPath = (parsed.pathname || '').replace(/\/+$/, '')
    return normalizedPath || '/'
  } catch {
    const normalized = sourceRepoUrl.replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '')
    return normalized || sourceRepoUrl
  }
}

const normalizeRevisionMessage = (message: string): string => {
  const singleLine = message.replace(/\r?\n/g, ' ').trim()
  return singleLine || '(no message)'
}

export const useMergeCommitFlow = (
  options: UseMergeCommitFlowOptions
): UseMergeCommitFlowResult => {
  const api = window.api

  const commitUsername = ref('')
  const commitPassword = ref('')
  const commitMessage = ref('')
  const isCommitting = ref(false)

  const logViewerVisible = ref(false)
  const commitLogs = ref<SvnCommitLog[]>([])

  const beforeCommitConfirmVisible = ref(false)
  const repositoriesToConfirm = ref<RepositoryToCommit[]>([])

  const generateDefaultCommitMessage = async (): Promise<string> => {
    if (
      !options.sourceRepoUrl.value ||
      !options.selectedRevisions.value ||
      options.selectedRevisions.value.length === 0
    ) {
      return ''
    }

    const revisions = [...options.selectedRevisions.value].sort((a, b) => a - b)
    const sourceRepoPath = normalizeSourceRepoForCommitMessage(options.sourceRepoUrl.value)

    let revisionMessageMap = new Map<number, string>()
    try {
      const exactLogs = await api.getSvnLogByRevisions(options.sourceRepoUrl.value, revisions)
      revisionMessageMap = new Map(exactLogs.map((log) => [log.revision, log.message]))

      const missingRevisions = revisions.filter((revision) => !revisionMessageMap.has(revision))
      if (missingRevisions.length > 0) {
        const logs = await api.getSvnLog(options.sourceRepoUrl.value, 5000)
        for (const log of logs) {
          if (!revisionMessageMap.has(log.revision)) {
            revisionMessageMap.set(log.revision, log.message)
          }
        }
      }
    } catch (error) {
      console.warn('[MergeProgressDialog] 获取源仓库提交信息失败:', error)
    }

    const revisionLines = revisions.map((revision) => {
      const sourceMessage = normalizeRevisionMessage(revisionMessageMap.get(revision) || '')
      return `r${revision} ${sourceMessage}`
    })

    return [`Merged from ${sourceRepoPath}`, ...revisionLines].join('\n')
  }

  watch(
    () => [options.visible.value, options.sourceRepoUrl.value, options.selectedRevisions.value],
    async ([visible], _oldValue, onCleanup) => {
      let canceled = false
      onCleanup(() => {
        canceled = true
      })

      if (visible) {
        const message = await generateDefaultCommitMessage()
        if (!canceled && options.visible.value) {
          commitMessage.value = message
        }
      }
    },
    { immediate: true, deep: true }
  )

  const canCommit = computed(() => {
    const hasMessage = commitMessage.value.trim() !== ''
    const hasValidRepos = options.results.value.some((r) => r.success && r.targetRepoPath)
    const hasNoConflicts = options.results.value.every((r) => !options.hasUnresolvedConflicts(r))
    return hasMessage && hasValidRepos && hasNoConflicts
  })

  const handleCommit = async (): Promise<void> => {
    if (!canCommit.value) return

    const unresolvedConflicts: string[] = []
    for (const result of options.results.value) {
      if (result.hasTreeConflict) {
        unresolvedConflicts.push(`${result.targetRepoName}: 检测到目录冲突（Tree Conflict）`)
        continue
      }

      const hasRevisionConflict = result.revisions?.some(
        (revision) => revision.status === 'conflict'
      )
      if (hasRevisionConflict && result.targetRepoPath && options.hasUnresolvedConflicts(result)) {
        unresolvedConflicts.push(`${result.targetRepoName}: 存在未解决的冲突版本`)
        continue
      }

      if (result.success && result.files && result.targetRepoPath) {
        const conflictFiles = result.files.filter((f) =>
          options.isConflict(f, result.targetRepoPath)
        )
        for (const fileEntry of conflictFiles) {
          const filePath = options.parseFilePath(fileEntry, result.targetRepoPath)
          if (!options.isConflictResolved(result.targetRepoPath, filePath)) {
            unresolvedConflicts.push(`${result.targetRepoName}: ${filePath}`)
          }
        }
      }
    }

    if (unresolvedConflicts.length > 0) {
      alert(
        `无法提交：以下冲突文件尚未解决\n\n${unresolvedConflicts.join('\n')}\n\n请先解决所有冲突文件后再提交。`
      )
      return
    }

    const successRepos = options.results.value.filter((r) => r.success && r.targetRepoPath)
    const repositories: RepositoryToCommit[] = []

    for (const result of successRepos) {
      const commitFilePaths = options.getCommitFilePaths(result)
      if (commitFilePaths.length === 0) continue

      try {
        const trackedPaths = getTrackedFilePaths(result)
        const statusResult = await api.getSvnStatus(result.targetRepoPath!, trackedPaths)
        const statusMap = new Map(statusResult.files.map((f) => [f.path, f.status]))

        const filesWithStatus: FileWithStatus[] = commitFilePaths.map((filePath) => ({
          path: filePath,
          status: statusMap.get(filePath) || 'M'
        }))

        repositories.push({
          targetRepoName: result.targetRepoName,
          targetRepoPath: result.targetRepoPath!,
          files: filesWithStatus
        })
      } catch (error) {
        console.error('Failed to get SVN status for', result.targetRepoName, error)
        const filesWithStatus: FileWithStatus[] = commitFilePaths.map((filePath) => ({
          path: filePath,
          status: 'M'
        }))
        repositories.push({
          targetRepoName: result.targetRepoName,
          targetRepoPath: result.targetRepoPath!,
          files: filesWithStatus
        })
      }
    }

    if (repositories.length === 0) {
      alert('未找到可提交的文件')
      return
    }

    repositoriesToConfirm.value = repositories
    beforeCommitConfirmVisible.value = true
  }

  const handleConfirmCommit = async (confirmedRepoPaths: string[]): Promise<void> => {
    beforeCommitConfirmVisible.value = false

    isCommitting.value = true
    const successRepos = options.results.value.filter((r) => r.success && r.targetRepoPath)
    commitLogs.value = []

    const confirmedSet = new Set(confirmedRepoPaths)

    for (const result of successRepos) {
      if (!confirmedSet.has(result.targetRepoPath!)) continue

      try {
        const commitFilePaths = options.getCommitFilePaths(result)
        if (commitFilePaths.length === 0) {
          const errorMessage = '未找到本次 merge 的可提交文件'
          commitLogs.value.push({
            repoName: result.targetRepoName,
            command: 'svn commit (no files to commit)',
            output: errorMessage,
            success: false
          })
          continue
        }

        const hasAuth = commitUsername.value.trim() !== '' && commitPassword.value.trim() !== ''

        const commitResult = hasAuth
          ? await api.svnCommit(
              result.targetRepoPath!,
              commitMessage.value,
              commitFilePaths,
              commitUsername.value,
              commitPassword.value
            )
          : await api.svnCommit(result.targetRepoPath!, commitMessage.value, commitFilePaths)

        commitLogs.value.push({
          repoName: result.targetRepoName,
          command: commitResult.command || 'svn commit (command not available)',
          output: commitResult.output || commitResult.message,
          success: commitResult.success
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误'
        commitLogs.value.push({
          repoName: result.targetRepoName,
          command: 'svn commit (exception occurred)',
          output: errorMessage,
          success: false
        })
      }
    }

    isCommitting.value = false
    logViewerVisible.value = true
  }

  const handleLogViewerClose = (): void => {
    logViewerVisible.value = false

    const hasSuccess = commitLogs.value.some((log) => log.success)
    if (hasSuccess) {
      options.onCommitSuccess()
      options.onRequestClose()
    }
  }

  return {
    commitUsername,
    commitPassword,
    commitMessage,
    isCommitting,
    logViewerVisible,
    commitLogs,
    beforeCommitConfirmVisible,
    repositoriesToConfirm,
    canCommit,
    handleCommit,
    handleConfirmCommit,
    handleLogViewerClose
  }
}
