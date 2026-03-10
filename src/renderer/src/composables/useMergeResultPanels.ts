import { ref, watch, type Ref } from 'vue'
import type { MergeSessionResult } from '../../../shared/merge'

interface UseMergeResultPanelsOptions {
  results: Ref<MergeSessionResult[]>
  hasUnresolvedConflicts: (result: MergeSessionResult) => boolean
}

interface UseMergeResultPanelsResult {
  getPanelKey: (result: MergeSessionResult) => string
  isPanelExpanded: (result: MergeSessionResult) => boolean
  togglePanel: (result: MergeSessionResult) => void
}

export const useMergeResultPanels = (
  options: UseMergeResultPanelsOptions
): UseMergeResultPanelsResult => {
  const panelExpandedState = ref<Record<string, boolean>>({})

  const getPanelKey = (result: MergeSessionResult): string => {
    return `${result.targetRepoName}::${result.targetRepoPath || ''}`
  }

  const isPanelExpanded = (result: MergeSessionResult): boolean => {
    const key = getPanelKey(result)
    return panelExpandedState.value[key] ?? false
  }

  const togglePanel = (result: MergeSessionResult): void => {
    const key = getPanelKey(result)
    panelExpandedState.value = {
      ...panelExpandedState.value,
      [key]: !isPanelExpanded(result)
    }
  }

  watch(
    options.results,
    (results) => {
      const nextState: Record<string, boolean> = {}
      for (const result of results) {
        const key = getPanelKey(result)
        const hasConflictOrError = !result.success || options.hasUnresolvedConflicts(result)
        const shouldExpand = hasConflictOrError && !result.isMerging
        nextState[key] = panelExpandedState.value[key] ?? shouldExpand
      }
      panelExpandedState.value = nextState
    },
    { immediate: true, deep: true }
  )

  return {
    getPanelKey,
    isPanelExpanded,
    togglePanel
  }
}
