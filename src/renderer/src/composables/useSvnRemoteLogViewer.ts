import { computed, ref, watch, type Ref } from 'vue'
import { arraysEqual } from '@renderer/utils/util'
import { getRelativePathForDisplay, getTopThreeLevelPath, isFilePath } from '@renderer/utils/path'
import type {
  AffectedFileGroup,
  AffectedFilePathGroup,
  SvnChangedFile,
  SvnLogEntry
} from '@renderer/types/svn'

interface UseSvnRemoteLogViewerOptions {
  repoUrl: Ref<string>
  limit: Ref<number>
  visible: Ref<boolean>
  selectedRevisionsProp: Ref<number[]>
  onSelectedRevisionsChange: (revisions: number[]) => void
}

interface SelectableTableRef {
  clearSelection?: () => void
  setCurrentRow?: (row?: unknown) => void
  toggleRowSelection?: (row: SvnLogEntry) => void
}

interface UseSvnRemoteLogViewerResult {
  logs: Ref<SvnLogEntry[]>
  affectedFiles: Ref<AffectedFileGroup[]>
  selectedRevisions: Ref<number[]>
  isLogLoading: Ref<boolean>
  isFilesLoading: Ref<boolean>
  searchKeyword: Ref<string>
  startDate: Ref<string>
  endDate: Ref<string>
  hasRepoUrl: Readonly<Ref<boolean>>
  formatDate: (dateString: string) => string
  loadLogs: () => Promise<void>
  handleSelectionChange: (selection: SvnLogEntry[]) => void
  handleRowClick: (row: SvnLogEntry) => void
  canShowAffectedFileDiff: (file: SvnChangedFile) => boolean
  isFilePath: (path: string) => boolean
  groupAffectedFilesByPath: (files: SvnChangedFile[]) => AffectedFilePathGroup[]
  getRelativePathForDisplay: (fullPath: string, groupPath: string) => string
  clearSelections: () => void
}

export const useSvnRemoteLogViewer = (
  options: UseSvnRemoteLogViewerOptions,
  tableRef: Ref<SelectableTableRef | undefined>
): UseSvnRemoteLogViewerResult => {
  const logs = ref<SvnLogEntry[]>([])
  const affectedFiles = ref<AffectedFileGroup[]>([])
  const selectedRevisions = ref<number[]>([...options.selectedRevisionsProp.value])
  const isLogLoading = ref(false)
  const isFilesLoading = ref(false)
  const searchKeyword = ref('')
  const startDate = ref('')
  const endDate = ref('')

  const hasRepoUrl = computed(() => Boolean(options.repoUrl.value))

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString)
      return date.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    } catch {
      return dateString
    }
  }

  const resetSelections = (): void => {
    selectedRevisions.value = []
    affectedFiles.value = []
    tableRef.value?.clearSelection?.()
    tableRef.value?.setCurrentRow?.(undefined)
  }

  const loadLogs = async (): Promise<void> => {
    if (!options.repoUrl.value) return

    isLogLoading.value = true
    try {
      logs.value = await window.api.getSvnLog(
        options.repoUrl.value,
        options.limit.value,
        searchKeyword.value,
        startDate.value,
        endDate.value
      )
      resetSelections()
    } catch (error) {
      console.error('Failed to load remote SVN logs:', error)
      logs.value = []
      resetSelections()
    } finally {
      isLogLoading.value = false
    }
  }

  const loadAffectedFiles = async (): Promise<void> => {
    if (!options.repoUrl.value || selectedRevisions.value.length === 0) {
      affectedFiles.value = []
      return
    }

    isFilesLoading.value = true
    try {
      const plainRevisions = [...selectedRevisions.value]
      affectedFiles.value = await window.api.getSvnChangedFiles(
        options.repoUrl.value,
        plainRevisions
      )
    } catch (error) {
      console.error('Failed to load affected files:', error)
      affectedFiles.value = []
    } finally {
      isFilesLoading.value = false
    }
  }

  const handleSelectionChange = (selection: SvnLogEntry[]): void => {
    selectedRevisions.value = selection.map((item) => item.revision)
  }

  const handleRowClick = (row: SvnLogEntry): void => {
    tableRef.value?.toggleRowSelection?.(row)
  }

  const canShowAffectedFileDiff = (file: SvnChangedFile): boolean => isFilePath(file.path)

  const groupAffectedFilesByPath = (files: SvnChangedFile[]): AffectedFilePathGroup[] => {
    const grouped = new Map<string, SvnChangedFile[]>()

    for (const file of files) {
      const groupPath = getTopThreeLevelPath(file.path)
      if (!grouped.has(groupPath)) {
        grouped.set(groupPath, [])
      }
      grouped.get(groupPath)?.push(file)
    }

    for (const groupFiles of grouped.values()) {
      groupFiles.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'))
    }

    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
      .map(([path, pathFiles]) => ({ path, files: pathFiles }))
  }

  watch(selectedRevisions, async () => {
    options.onSelectedRevisionsChange([...selectedRevisions.value])
    await loadAffectedFiles()
  })

  watch(options.selectedRevisionsProp, (value) => {
    const incoming = value || []
    if (!arraysEqual(incoming, selectedRevisions.value)) {
      selectedRevisions.value = [...incoming]
    }
  })

  watch(
    () => [options.visible.value, options.repoUrl.value],
    async ([visible, repoUrl]) => {
      if (visible && repoUrl) {
        await loadLogs()
      }
    },
    { immediate: true }
  )

  return {
    logs,
    affectedFiles,
    selectedRevisions,
    isLogLoading,
    isFilesLoading,
    searchKeyword,
    startDate,
    endDate,
    hasRepoUrl,
    formatDate,
    loadLogs,
    handleSelectionChange,
    handleRowClick,
    canShowAffectedFileDiff,
    isFilePath,
    groupAffectedFilesByPath,
    getRelativePathForDisplay,
    clearSelections: resetSelections
  }
}
