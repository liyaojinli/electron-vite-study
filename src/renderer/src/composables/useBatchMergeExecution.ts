import { computed, ref, type Ref } from 'vue'
import type { MergeSessionResult } from '../../../shared/merge'
import type { RepositoryData } from '../../../shared/repository'
import { getTrackedFilePaths } from '../utils/mergeProgress'

interface UseBatchMergeExecutionOptions {
  selectedSourceRepo: Ref<string>
  selectedTargetRepos: Ref<Set<string>>
  selectedRevisions: Ref<number[]>
  sourceRepo: Readonly<Ref<RepositoryData | undefined>>
  targetRepos: Readonly<Ref<RepositoryData[]>>
  mergeResults: Ref<MergeSessionResult[]>
}

interface UseBatchMergeExecutionResult {
  isLoading: Ref<boolean>
  showMergeDialog: Ref<boolean>
  mergeDialogLogs: Ref<string[]>
  mergeDialogCurrentTarget: Ref<string>
  mergeDialogLoading: Ref<boolean>
  mergeDialogSuccess: Ref<boolean | null>
  hasPendingMerge: Ref<boolean>
  canMerge: Readonly<Ref<boolean>>
  getMergeResultForRepo: (repoUrl: string) => MergeSessionResult | undefined
  getRepoMergeStatus: (repoUrl: string) => 'success' | 'conflict' | 'error' | null
  handleResetMergeState: () => void
  performMerge: () => Promise<void>
  handleMergeDialogRefresh: () => Promise<void>
  handleMergeCommitSuccess: () => void
  handleUpdateResult: (updatedResult: MergeSessionResult) => void
}

const getLastPathSegment = (value: string): string => {
  if (!value) return ''
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
  const last = normalized.split('/').pop() || ''
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

const hasTreeConflict = (result?: MergeSessionResult): boolean => {
  if (result?.hasTreeConflict) return true
  if (!result?.files) return false
  return result.files.some((file) => {
    if (!file.startsWith('C')) return false
    const mergedPath = file.substring(1).trim()
    return mergedPath.endsWith('/') || mergedPath.endsWith('\\')
  })
}

const hasConflictFiles = (result?: MergeSessionResult): boolean => {
  if (result?.hasTreeConflict) return true
  return Boolean(result?.files?.some((file) => file.startsWith('C')))
}

export const useBatchMergeExecution = (
  options: UseBatchMergeExecutionOptions
): UseBatchMergeExecutionResult => {
  const api = window.api

  const isLoading = ref(false)
  const showMergeDialog = ref(false)
  const mergeDialogLogs = ref<string[]>([])
  const mergeDialogCurrentTarget = ref('')
  const mergeDialogLoading = ref(false)
  const mergeDialogSuccess = ref<boolean | null>(null)
  const hasPendingMerge = ref(false)

  const canMerge = computed(
    () =>
      Boolean(options.selectedSourceRepo.value) &&
      options.selectedTargetRepos.value.size > 0 &&
      options.selectedRevisions.value.length > 0
  )

  const resetMergeUiState = (): void => {
    hasPendingMerge.value = false
    showMergeDialog.value = false
    options.mergeResults.value = []
    options.selectedSourceRepo.value = ''
    options.selectedTargetRepos.value = new Set()
    options.selectedRevisions.value = []
    mergeDialogLogs.value = []
    mergeDialogCurrentTarget.value = ''
    mergeDialogLoading.value = false
    mergeDialogSuccess.value = null
  }

  const validateTargetRepoPathMatch = (): boolean => {
    const mismatchRepos: string[] = []
    const sourceRemoteTail = getLastPathSegment(options.sourceRepo.value?.url || '')

    if (!sourceRemoteTail) {
      return window.confirm('无法校验远程仓库和本地仓库路径是否匹配，是否继续合并？')
    }

    for (const repo of options.targetRepos.value) {
      const localTail = getLastPathSegment(repo.url)
      if (!localTail || localTail !== sourceRemoteTail) {
        mismatchRepos.push(repo.alias)
      }
    }

    if (mismatchRepos.length > 0) {
      return window.confirm(
        `远程仓库和本地仓库路径不匹配: ${mismatchRepos.join('、')}。是否继续合并？`
      )
    }

    return true
  }

  const getMergeResultForRepo = (repoUrl: string): MergeSessionResult | undefined => {
    return options.mergeResults.value.find((result) => result.targetRepoUrl === repoUrl)
  }

  const getRepoMergeStatus = (repoUrl: string): 'success' | 'conflict' | 'error' | null => {
    const result = getMergeResultForRepo(repoUrl)
    if (!result || result.isMerging) return null
    if (!result.success) return 'error'
    return hasConflictFiles(result) ? 'conflict' : 'success'
  }

  const handleUpdateResult = (updatedResult: MergeSessionResult): void => {
    options.mergeResults.value = options.mergeResults.value.map((item) => {
      if (item.targetRepoUrl === updatedResult.targetRepoUrl) {
        return updatedResult
      }
      return item
    })
  }

  const handleMergeDialogRefresh = async (): Promise<void> => {
    if (options.mergeResults.value.length === 0) return

    const refreshedResults = await Promise.all(
      options.mergeResults.value.map(async (result) => {
        const repoPath = result.targetRepoPath || result.targetRepoUrl
        if (!repoPath) return result

        try {
          const trackedPaths = getTrackedFilePaths(result)
          const statusResult = await api.getSvnStatus(repoPath, trackedPaths)
          const statusMap = new Map(statusResult.files.map((f) => [f.path, f.status]))

          // 只对本次 merge 会话已追踪的文件更新状态，不把全量工作区改动混入
          const trackedEntries = result.trackedFiles || result.onlyFiles || []
          const refreshedFiles = trackedEntries
            .map((entry) => {
              const match = entry.match(/^[A-Z?!X]\s+(.+)$/)
              const filePath = match ? match[1].trim() : entry.trim()
              const currentStatus = statusMap.get(filePath)
              return currentStatus ? `${currentStatus}  ${filePath}` : null
            })
            .filter((e): e is string => e !== null)

          return {
            ...result,
            files: refreshedFiles,
            onlyFiles: refreshedFiles,
            trackedFiles: result.trackedFiles || result.onlyFiles || result.files,
            message: refreshedFiles.some((f) => f.startsWith('C')) ? '合并冲突' : result.message
          }
        } catch (error) {
          console.warn('[handleMergeDialogRefresh] Failed to refresh status for', repoPath, error)
          return result
        }
      })
    )

    options.mergeResults.value = refreshedResults
  }

  const handleMergeCommitSuccess = (): void => {
    resetMergeUiState()
  }

  const performMerge = async (): Promise<void> => {
    if (!canMerge.value || !options.sourceRepo.value) return

    if (hasPendingMerge.value) {
      showMergeDialog.value = true
      return
    }

    if (!validateTargetRepoPathMatch()) {
      return
    }

    hasPendingMerge.value = true
    isLoading.value = true
    const source = { ...options.sourceRepo.value }
    const targets = options.targetRepos.value.map((r) => ({ ...r }))
    const revisions = [...options.selectedRevisions.value]

    options.mergeResults.value = targets.map((target) => ({
      targetRepoName: target.alias,
      targetRepoUrl: target.url,
      targetRepoPath: target.url,
      sourceRepoUrl: source.url,
      revisions: revisions.map((rev) => ({
        revision: rev,
        status: 'pending' as const,
        files: [],
        message: ''
      })),
      currentRevisionIndex: 0,
      allCompleted: false,
      success: false,
      message: '合并中',
      files: [],
      onlyFiles: [],
      trackedFiles: [],
      isMerging: true,
      hasTreeConflict: false
    }))

    mergeDialogLogs.value = []
    mergeDialogCurrentTarget.value = ''
    mergeDialogLoading.value = true
    mergeDialogSuccess.value = null
    showMergeDialog.value = true

    try {
      let anyFailure = false
      let anyTreeConflict = false

      const mergeTasks = targets.map(async (target) => {
        mergeDialogLogs.value.push(`开始合并到 ${target.alias}`)
        mergeDialogCurrentTarget.value = target.alias

        const res: MergeSessionResult = await api.performSingleMerge(source, target, revisions)
        const url = res.targetRepoUrl || target.url

        let updatedRes = res
        if (hasTreeConflict(res)) {
          anyTreeConflict = true
          const treeConflictMessage =
            '\n⚠️ 检测到目录冲突（Tree Conflict）！\n建议执行 Revert 后手动合并，因为目录冲突无法通过工具自动解决。'
          updatedRes = {
            ...res,
            hasTreeConflict: true,
            message: res.message + treeConflictMessage
          }
          mergeDialogLogs.value.push(`[${target.alias}] ⚠️ 检测到目录冲突，建议 Revert 后人工处理`)
        }

        options.mergeResults.value = options.mergeResults.value.map((item) => {
          if (item.targetRepoUrl !== target.url) return item
          return {
            ...updatedRes,
            targetRepoName: updatedRes.targetRepoName || target.alias,
            targetRepoUrl: url,
            isMerging: false
          }
        })

        mergeDialogLogs.value.push(
          `[${target.alias}] ${res.message} (${res.revisions.filter((r) => r.status === 'success' || r.status === 'conflict').length}/${res.revisions.length})`
        )

        if (res.success) {
          mergeDialogLogs.value.push(`合并操作完成: ${target.alias}`)
        } else {
          anyFailure = true
          const msg = res.message || '未知错误'
          mergeDialogLogs.value.push(`合并失败: ${target.alias} - ${msg}`)
        }
      })

      await Promise.all(mergeTasks)

      if (anyTreeConflict) {
        mergeDialogLogs.value.push(
          '检测到目录冲突（Tree Conflict），请处理后在主界面点击“重置”按钮清空状态，再开始下一次 merge。'
        )

        mergeDialogLoading.value = false
        mergeDialogSuccess.value = false

        alert('检测到目录冲突（Tree Conflict），请处理后在主界面点击“重置”按钮清空状态。')
        return
      }

      mergeDialogLoading.value = false
      mergeDialogSuccess.value = !anyFailure
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      mergeDialogLogs.value.push(`合并过程发生异常: ${errMsg}`)
      mergeDialogLoading.value = false
      mergeDialogSuccess.value = false
      console.error('Merge failed:', error)
    } finally {
      isLoading.value = false
    }
  }

  return {
    isLoading,
    showMergeDialog,
    mergeDialogLogs,
    mergeDialogCurrentTarget,
    mergeDialogLoading,
    mergeDialogSuccess,
    hasPendingMerge,
    canMerge,
    getMergeResultForRepo,
    getRepoMergeStatus,
    handleResetMergeState: resetMergeUiState,
    performMerge,
    handleMergeDialogRefresh,
    handleMergeCommitSuccess,
    handleUpdateResult
  }
}
