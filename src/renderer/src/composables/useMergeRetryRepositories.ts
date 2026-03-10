import { ref } from 'vue'
import type { MergeSessionResult } from '../../../shared/merge'

interface UseMergeRetryRepositoriesOptions {
  getPanelKey: (result: MergeSessionResult) => string
  onUpdateResult: (updatedResult: MergeSessionResult) => void
  onRefresh: () => void
}

interface UseMergeRetryRepositoriesResult {
  canRetryRepository: (result: MergeSessionResult) => boolean
  isRetryingRepository: (result: MergeSessionResult) => boolean
  handleRetryRepository: (result: MergeSessionResult) => Promise<void>
}

export const useMergeRetryRepositories = (
  options: UseMergeRetryRepositoriesOptions
): UseMergeRetryRepositoriesResult => {
  const api = window.api
  const retryingState = ref<Record<string, boolean>>({})

  const canRetryRepository = (result: MergeSessionResult): boolean => {
    const hasFailedRevision = result.revisions?.some((rev) => rev.status === 'failed')
    return Boolean(
      hasFailedRevision && result.targetRepoPath && result.sourceRepoUrl && !result.isMerging
    )
  }

  const isRetryingRepository = (result: MergeSessionResult): boolean => {
    const key = options.getPanelKey(result)
    return Boolean(retryingState.value[key])
  }

  const handleRetryRepository = async (result: MergeSessionResult): Promise<void> => {
    if (!canRetryRepository(result)) return

    const key = options.getPanelKey(result)
    retryingState.value = {
      ...retryingState.value,
      [key]: true
    }

    try {
      const plainSession = JSON.parse(JSON.stringify(result))
      const updatedResult = await api.retryMergeSession(
        result.sourceRepoUrl,
        result.targetRepoPath,
        plainSession
      )

      options.onUpdateResult(updatedResult)
      options.onRefresh()
    } catch (error) {
      console.error('[MergeProgressDialog] 重试仓库 merge 失败:', error)
      alert(`重试失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      retryingState.value = {
        ...retryingState.value,
        [key]: false
      }
    }
  }

  return {
    canRetryRepository,
    isRetryingRepository,
    handleRetryRepository
  }
}
