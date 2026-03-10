<template>
  <div v-if="visible" class="merge-dialog-backdrop">
    <div class="merge-dialog">
      <div class="merge-dialog-header">
        <div class="merge-title">合并进度</div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>
      <!-- Commit Info Section -->
      <div class="commit-info-section">
        <div class="commit-field">
          <label class="commit-label">提交人:</label>
          <input
            v-model="commitUsername"
            type="text"
            class="commit-input"
            placeholder="输入提交人用户名"
          />
        </div>
        <div class="commit-field">
          <label class="commit-label">密码:</label>
          <input
            v-model="commitPassword"
            type="password"
            class="commit-input"
            placeholder="输入密码"
          />
        </div>
        <div class="commit-field commit-field-message">
          <label class="commit-label">提交信息:</label>
          <textarea
            v-model="commitMessage"
            class="commit-input commit-input-textarea"
            placeholder="输入提交信息"
            rows="4"
          />
        </div>
      </div>

      <div class="merge-dialog-body">
        <div v-if="results && results.length">
          <div v-for="result in results" :key="getPanelKey(result)" class="result-panel">
            <button
              type="button"
              class="panel-toggle-btn"
              :title="isPanelExpanded(result) ? '收起' : '展开'"
              @click="togglePanel(result)"
            >
              <ChevronDown v-if="isPanelExpanded(result)" :size="16" />
              <ChevronRight v-else :size="16" />
            </button>
            <div class="result-panel-title">
              <div class="result-panel-title-left">
                <LoaderCircle
                  v-if="result.isMerging"
                  :size="16"
                  class="is-spinning merging-icon-title"
                />
                <span>{{ result.targetRepoName }}</span>
              </div>
              <div class="result-panel-title-right">
                <button
                  v-if="canRetryRepository(result)"
                  type="button"
                  class="retry-repo-btn"
                  :disabled="isRetryingRepository(result) || result.isMerging"
                  @click.stop="handleRetryRepository(result)"
                >
                  <LoaderCircle
                    v-if="isRetryingRepository(result)"
                    :size="14"
                    class="is-spinning"
                  />
                  <span>{{ isRetryingRepository(result) ? '重试中...' : '重试此仓库' }}</span>
                </button>
                <span :class="['result-status', getResultStatusClass(result)]">
                  {{ getResultStatusText(result) }}
                </span>
              </div>
            </div>
            <div v-if="isPanelExpanded(result)" class="result-panel-body">
              <!-- 版本进度信息 -->
              <div
                v-if="result.revisions && result.revisions.length > 1"
                class="revisions-progress"
              >
                <div class="revisions-title">版本进度:</div>
                <div class="revisions-list">
                  <div
                    v-for="(rev, index) in result.revisions"
                    :key="rev.revision"
                    :class="[
                      'revision-item',
                      `revision-${rev.status}`,
                      {
                        'is-current': index === result.currentRevisionIndex,
                        'is-resolved':
                          rev.status === 'conflict' &&
                          isRevisionConflictResolved(rev, result.targetRepoPath)
                      }
                    ]"
                  >
                    <span class="revision-number">r{{ rev.revision }}</span>
                    <span class="revision-status">
                      {{
                        getEffectiveRevisionStatus(
                          rev,
                          result.targetRepoPath,
                          index,
                          result.revisions
                        )
                      }}
                    </span>
                    <span v-if="index === result.currentRevisionIndex" class="current-indicator">
                      ← 当前
                    </span>
                  </div>
                </div>
              </div>
              
              <!-- 错误或消息提示（只在没有 revision 详细消息时显示） -->
              <div
                v-if="
                  (!result.success || result.message) &&
                  (!result.revisions ||
                    !result.revisions.some((r) => r.message && r.status !== 'pending'))
                "
                :class="['result-message', result.success ? 'message-info' : 'message-error']"
              >
                {{ result.message }}
              </div>

              <!-- 版本详细信息（显示每个版本的消息） -->
              <div
                v-if="
                  result.revisions &&
                  result.revisions.some((r) => r.message && r.status !== 'pending')
                "
                class="revisions-messages"
              >
                <div
                  v-for="rev in result.revisions.filter((r) => r.message && r.status !== 'pending')"
                  :key="rev.revision"
                  :class="[
                    'revision-message',
                    `status-${rev.status}`,
                    { 'is-error': rev.status === 'failed' }
                  ]"
                >
                  <span class="revision-label">r{{ rev.revision }}:</span>
                  <span class="revision-text">{{ rev.message }}</span>
                </div>
              </div>

              <div v-if="result.files && result.files.length" class="file-list">
                <a
                  v-for="file in result.files"
                  :key="file"
                  :class="[
                    'result-file-link',
                    getEffectiveFileStatus(file, result.targetRepoPath) === 'A' ? 'file-added' : '',
                      getEffectiveFileStatus(file, result.targetRepoPath) === 'M'
                        ? 'file-modified'
                      : '',
                    getEffectiveFileStatus(file, result.targetRepoPath) === 'D'
                      ? 'file-deleted'
                      : '',
                    getEffectiveFileStatus(file, result.targetRepoPath) === 'C'
                      ? 'file-conflict'
                      : ''
                  ]"
                  :title="file"
                  @click="handleFileClick(result, file)"
                >
                  {{ getDisplayFileName(file, result.targetRepoPath) }}
                  <span
                    v-if="
                      getEffectiveFileStatus(file, result.targetRepoPath) === 'C' &&
                      result.targetRepoPath &&
                      isConflictResolved(
                        result.targetRepoPath,
                        parseFilePath(file, result.targetRepoPath)
                      )
                    "
                    class="conflict-resolved-badge"
                  >
                    [冲突已解决]
                  </span>
                </a>
              </div>
              <div
                v-else-if="
                  !result.message && (!result.revisions || !result.revisions.some((r) => r.message))
                "
                class="result-file-empty"
              >
                无文件
              </div>
            </div>
          </div>
        </div>
        <div v-else class="result-file-empty">暂无合并结果</div>
      </div>
      <div class="merge-dialog-footer">
        <div class="status">
          <span v-if="isLoading">进行中…</span>
          <span v-else-if="isCommitting">提交中…</span>
          <span v-else>就绪</span>
        </div>
        <div class="footer-actions">
          <button
            class="commit-action"
            :disabled="isLoading || isCommitting || !canCommit"
            @click="handleCommit"
          >
            提交
          </button>
          <button class="close-action" @click="$emit('close')">关闭</button>
        </div>
      </div>
    </div>

    <!-- SVN Conflict Merge for conflicts -->
    <SvnConflictMerge
      :visible="conflictMergeVisible"
      :repo-path="selectedRepoPath"
      :file-path="selectedFilePath"
      @close="handleConflictMergeClose"
      @resolved="handleConflictResolved"
    />

    <!-- SVN Diff Viewer for non-conflicts (Working Copy vs HEAD) -->
    <SvnDiffViewer
      :visible="diffViewerVisible"
      :repo-path="selectedRepoPath"
      :file-path="selectedFilePath"
      @close="diffViewerVisible = false"
    />

    <!-- SVN Before Commit Confirm Dialog -->
    <SvnBeforeCommitConfirm
      :visible="beforeCommitConfirmVisible"
      :repositories="repositoriesToConfirm"
      @confirm="handleConfirmCommit"
      @cancel="beforeCommitConfirmVisible = false"
    />

    <!-- SVN Log Viewer -->
    <SvnLogViewer :visible="logViewerVisible" :logs="commitLogs" @close="handleLogViewerClose" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import { LoaderCircle } from 'lucide-vue-next'
import SvnConflictMerge from './SvnConflictMerge.vue'
import SvnDiffViewer from './SvnDiffViewer.vue'
import SvnBeforeCommitConfirm from './SvnBeforeCommitConfirm.vue'
import SvnLogViewer, { type SvnCommitLog } from './SvnLogViewer.vue'

// 单个版本的 merge 状态
interface RevisionMergeState {
  revision: number
  status: 'pending' | 'merging' | 'success' | 'conflict' | 'failed'
  files?: string[]
  message?: string
}

// 单个仓库的 merge 会话状态
interface MergeSessionResult {
  targetRepoName: string
  targetRepoUrl: string
  targetRepoPath: string
  sourceRepoUrl: string
  revisions: RevisionMergeState[]
  currentRevisionIndex: number
  allCompleted: boolean
  success: boolean
  message: string
  files?: string[]
  isMerging?: boolean
}

const getResultStatusClass = (result: MergeSessionResult): string => {
  if (result.isMerging) return 'merging'
  if (result.success) {
    return hasUnresolvedConflicts(result) ? 'conflict' : 'success'
  }
  return 'error'
}

const getResultStatusText = (result: MergeSessionResult): string => {
  if (result.isMerging) return '合并中'
  // 如果 success 为 false 且没有完成，表示合并失败
  if (!result.success && !result.allCompleted) return '合并失败'
  // 检查是否有冲突状态的版本（包括未完成的情况）
  const hasConflict = result.revisions && result.revisions.some((r) => r.status === 'conflict')
  if (hasConflict) return '部分冲突'
  if (result.allCompleted) {
    // 检查是否有未解决的冲突
    const hasUnresolved = result.revisions.some(
      (r) => r.status === 'conflict' && !isRevisionConflictResolved(r, result.targetRepoPath)
    )
    return hasUnresolved ? '部分冲突' : '合并成功'
  }
  // 显示进度
  const completedCount = result.revisions.filter(
    (r) => r.status === 'success' || r.status === 'conflict' || r.status === 'failed'
  ).length
  return `进行中 (${completedCount}/${result.revisions.length})`
}

const props = defineProps<{
  visible: boolean
  results: MergeSessionResult[]
  isLoading: boolean
  sourceRepoUrl?: string
  selectedRevisions?: number[]
}>()

const emit = defineEmits(['close', 'refresh', 'commit-success', 'update-result'])

const api = window.api
const commitUsername = ref('')
const commitPassword = ref('')
const commitMessage = ref('')
const isCommitting = ref(false)

// SVN 日志查看器相关状态
const logViewerVisible = ref(false)
const commitLogs = ref<SvnCommitLog[]>([])

// 提交前确认对话框相关状态
const beforeCommitConfirmVisible = ref(false)
interface FileWithStatus {
  path: string
  status: string // M, A, D, R
}
interface RepositoryToConfirm {
  targetRepoName: string
  targetRepoPath: string
  files: FileWithStatus[]
}
const repositoriesToConfirm = ref<RepositoryToConfirm[]>([])
const confirmedReposForCommit = ref<Set<string>>(new Set())

// 跟踪已解决的冲突文件 (key: repoPath::filePath)
const resolvedConflicts = ref<Set<string>>(new Set())

const normalizeSourceRepoForCommitMessage = (sourceRepoUrl: string): string => {
  try {
    const parsed = new URL(sourceRepoUrl)
    const normalizedPath = (parsed.pathname || '').replace(/\/+$/, '')
    return normalizedPath || '/'
  } catch {
    // Fallback for non-standard URL strings.
    const normalized = sourceRepoUrl.replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '')
    return normalized || sourceRepoUrl
  }
}

const normalizeRevisionMessage = (message: string): string => {
  const singleLine = message.replace(/\r?\n/g, ' ').trim()
  return singleLine || '(no message)'
}

// 生成默认的 commit message
const generateDefaultCommitMessage = async (): Promise<string> => {
  if (!props.sourceRepoUrl || !props.selectedRevisions || props.selectedRevisions.length === 0) {
    return ''
  }

  const revisions = [...props.selectedRevisions].sort((a, b) => a - b)
  const sourceRepoPath = normalizeSourceRepoForCommitMessage(props.sourceRepoUrl)

  let revisionMessageMap = new Map<number, string>()
  try {
    // 优先按指定 revision 精确从远程源仓库抓取提交信息，避免被最近 N 条日志截断。
    const exactLogs = await api.getSvnLogByRevisions(props.sourceRepoUrl, revisions)
    revisionMessageMap = new Map(exactLogs.map((log) => [log.revision, log.message]))

    // 兼容兜底：若仍有缺失，再尝试一次批量日志。
    const missingRevisions = revisions.filter((revision) => !revisionMessageMap.has(revision))
    if (missingRevisions.length > 0) {
      const logs = await api.getSvnLog(props.sourceRepoUrl, 5000)
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

// 当对话框打开或数据变化时，生成默认 commit message
watch(
  () => [props.visible, props.sourceRepoUrl, props.selectedRevisions],
  async ([visible], _oldValue, onCleanup) => {
    let canceled = false
    onCleanup(() => {
      canceled = true
    })

    if (visible) {
      const message = await generateDefaultCommitMessage()
      if (!canceled && props.visible) {
        commitMessage.value = message
      }
    }
  },
  { immediate: true, deep: true }
)

const canCommit = computed(() => {
  const hasMessage = commitMessage.value.trim() !== ''
  const hasValidRepos = props.results.some((r) => r.success && r.targetRepoPath)
  const hasNoConflicts = props.results.every((r) => !hasUnresolvedConflicts(r))
  return hasMessage && hasValidRepos && hasNoConflicts
})

const conflictMergeVisible = ref(false)
const diffViewerVisible = ref(false)
const selectedRepoPath = ref('')
const selectedFilePath = ref('')
const panelExpandedState = ref<Record<string, boolean>>({})
const retryingState = ref<Record<string, boolean>>({})

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
  () => props.results,
  (results) => {
    const nextState: Record<string, boolean> = {}
    for (const result of results) {
      const key = getPanelKey(result)
      // 检测冲突或错误时自动展开，否则保持当前状态或默认折叠
      const hasConflictOrError = !result.success || hasUnresolvedConflicts(result)
      const shouldExpand = hasConflictOrError && !result.isMerging
      nextState[key] = panelExpandedState.value[key] ?? (shouldExpand ? true : false)
    }
    panelExpandedState.value = nextState
  },
  { immediate: true, deep: true }
)

const parseFilePath = (fileEntry: string, repoPath?: string): string => {
  // File entries are in format like "C  path/to/file.txt" or "U  file.txt"
  // Remove the status prefix (first character and spaces)
  let filePath = fileEntry.substring(3).trim()
  
  // Remove repo path prefix if provided
  if (repoPath && filePath.startsWith(repoPath)) {
    filePath = filePath.substring(repoPath.length)
    // Remove leading slash
    filePath = filePath.replace(/^[\\/]+/, '')
  }
  
  return filePath
}

const isCommitableRelativePath = (filePath: string): boolean => {
  const normalized = filePath.trim().replace(/\\/g, '/')
  return normalized !== '' && normalized !== '.' && normalized !== './'
}

const getEffectiveFileStatus = (fileEntry: string, repoPath?: string): string => {
  const rawStatus = fileEntry.substring(0, 1)
  if (rawStatus !== 'C' || !repoPath) return rawStatus

  const filePath = parseFilePath(fileEntry, repoPath)
  return isConflictResolved(repoPath, filePath) ? 'M' : 'C'
}

const hasUnresolvedConflicts = (result: MergeSessionResult): boolean => {
  if (!result.files || !result.targetRepoPath) return false
  return result.files.some(
    (fileEntry) => getEffectiveFileStatus(fileEntry, result.targetRepoPath) === 'C'
  )
}

const getDisplayFileName = (fileEntry: string, repoPath?: string): string => {
  // Get status prefix and relative path for display.
  // Resolved conflicts are shown as M to reflect current state in this dialog.
  const effectiveStatus = getEffectiveFileStatus(fileEntry, repoPath)
  const statusPrefix = `${effectiveStatus}  `
  const relativePath = parseFilePath(fileEntry, repoPath)
  return statusPrefix + relativePath
}

const isConflict = (fileEntry: string, repoPath?: string): boolean => {
  return getEffectiveFileStatus(fileEntry, repoPath) === 'C'
}

const getCommitFilePaths = (result: MergeSessionResult): string[] => {
  if (!result.files || !result.targetRepoPath) return []

  const commitableStatuses = new Set(['A', 'M', 'D', 'R'])
  const filePaths = result.files
    .filter((fileEntry) =>
      commitableStatuses.has(getEffectiveFileStatus(fileEntry, result.targetRepoPath))
    )
    .map((fileEntry) => parseFilePath(fileEntry, result.targetRepoPath))
    .filter((filePath) => isCommitableRelativePath(filePath))

  return Array.from(new Set(filePaths))
}

const handleFileClick = (result: MergeSessionResult, fileEntry: string): void => {
  const filePath = parseFilePath(fileEntry, result.targetRepoPath)
  // We need the repo path. It might be stored in result.targetRepoPath
  // If not available, we'll need to find it from the repository list
  if (!result.targetRepoPath) {
    console.warn('Repository path not available for:', result.targetRepoName)
    // For now, we'll skip if repo path is not available
    alert('无法获取仓库路径，请确保仓库信息完整')
    return
  }

  selectedFilePath.value = filePath

  if (isConflict(fileEntry, result.targetRepoPath)) {
    selectedRepoPath.value = result.targetRepoPath
    conflictMergeVisible.value = true
  } else {
    // 对于非冲突文件，显示本地工作副本与服务端最新版本(HEAD)的差异。
    selectedRepoPath.value = result.targetRepoPath
    diffViewerVisible.value = true
  }
}

const handleConflictMergeClose = (): void => {
  conflictMergeVisible.value = false
  // Emit refresh to update the merge results after conflict resolution
  emit('refresh')
}

// 处理冲突解决
const handleConflictResolved = async (): Promise<void> => {
  if (selectedRepoPath.value && selectedFilePath.value) {
    const key = `${selectedRepoPath.value}::${selectedFilePath.value}`
    resolvedConflicts.value.add(key)

    // 查找当前仓库的 merge session
    const currentResult = props.results.find((r) => r.targetRepoPath === selectedRepoPath.value)

    if (currentResult) {
      // 检查该仓库是否还有未解决的冲突
      const hasRemainingConflicts = currentResult.files?.some((fileEntry) => {
        const filePath = parseFilePath(fileEntry, currentResult.targetRepoPath)
        const effectiveStatus = getEffectiveFileStatus(fileEntry, currentResult.targetRepoPath)
        return (
          effectiveStatus === 'C' && !isConflictResolved(currentResult.targetRepoPath, filePath)
        )
      })

      // 如果当前版本的所有冲突都已解决，且还有待处理的版本，自动继续 merge
      if (
        !hasRemainingConflicts &&
        !currentResult.allCompleted &&
        currentResult.currentRevisionIndex >= 0
      ) {
        console.log('[MergeProgressDialog] 所有冲突已解决，自动继续下一个版本的 merge')
        try {
          // 将 Vue 响应式对象转换为纯对象，避免 IPC 克隆错误
          const plainSession = JSON.parse(JSON.stringify(currentResult))
          
          const updatedResult = await api.mergeNextRevision(
            currentResult.sourceRepoUrl,
            currentResult.targetRepoPath,
            plainSession
          )
          
          // 通知父组件更新结果
          emit('update-result', updatedResult)
          
          // 刷新显示
          emit('refresh')
        } catch (error) {
          console.error('[MergeProgressDialog] 继续 merge 失败:', error)
          alert(`继续合并失败: ${error instanceof Error ? error.message : '未知错误'}`)
        }
      }
    }
  }
}

const canRetryRepository = (result: MergeSessionResult): boolean => {
  const hasFailedRevision = result.revisions?.some((rev) => rev.status === 'failed')
  return Boolean(
    hasFailedRevision && result.targetRepoPath && result.sourceRepoUrl && !result.isMerging
  )
}

const isRetryingRepository = (result: MergeSessionResult): boolean => {
  const key = getPanelKey(result)
  return Boolean(retryingState.value[key])
}

const handleRetryRepository = async (result: MergeSessionResult): Promise<void> => {
  if (!canRetryRepository(result)) return

  const key = getPanelKey(result)
  retryingState.value = {
    ...retryingState.value,
    [key]: true
  }

  try {
    // 将 Vue 响应式对象转换为纯对象，避免 IPC 克隆错误
    const plainSession = JSON.parse(JSON.stringify(result))
    const updatedResult = await api.retryMergeSession(
      result.sourceRepoUrl,
      result.targetRepoPath,
      plainSession
    )

    emit('update-result', updatedResult)
    emit('refresh')
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

// 检查文件是否已解决
const isConflictResolved = (repoPath: string, filePath: string): boolean => {
  const key = `${repoPath}::${filePath}`
  return resolvedConflicts.value.has(key)
}

// 检查某个版本的所有冲突是否都已解决
const isRevisionConflictResolved = (revision: RevisionMergeState, repoPath: string): boolean => {
  if (revision.status !== 'conflict') return false
  if (!revision.files || revision.files.length === 0) return false
  
  // 检查该版本的所有冲突文件是否都已解决
  const conflictFiles = revision.files.filter((f) => f.startsWith('C'))
  if (conflictFiles.length === 0) return false
  
  return conflictFiles.every((fileEntry) => {
    const filePath = parseFilePath(fileEntry, repoPath)
    return isConflictResolved(repoPath, filePath)
  })
}

// 获取版本的有效状态（考虑已解决的冲突）
const getEffectiveRevisionStatus = (
  revision: RevisionMergeState,
  repoPath: string,
  index: number,
  revisions: RevisionMergeState[]
): string => {
  if (revision.status === 'conflict' && isRevisionConflictResolved(revision, repoPath)) {
    return '冲突已解决'
  }
  
  // 非 pending 状态直接返回对应文本
  if (revision.status !== 'pending') {
    return revision.status === 'merging'
      ? '合并中...'
      : revision.status === 'success'
        ? '成功'
        : revision.status === 'conflict'
          ? '冲突'
          : '失败'
  }
  
  // pending 状态：检查上一个版本是否有冲突
  if (index > 0) {
    const prevRevision = revisions[index - 1]
    if (prevRevision.status === 'conflict') {
      // 上一个版本有冲突，提示待解决
      return '待解决上一条提交记录的冲突'
    }
  }
  
  // 其他情况（第一条或上一条是成功/失败），显示待处理
  return '待处理'
}

const handleCommit = async (): Promise<void> => {
  if (!canCommit.value) return

  // 检查所有冲突文件是否都已解决
  const unresolvedConflicts: string[] = []
  for (const result of props.results) {
    if (result.success && result.files && result.targetRepoPath) {
      const conflictFiles = result.files.filter((f) => isConflict(f, result.targetRepoPath))
      for (const fileEntry of conflictFiles) {
        const filePath = parseFilePath(fileEntry, result.targetRepoPath)
        if (!isConflictResolved(result.targetRepoPath, filePath)) {
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

  // 构建要确认的仓库列表，包含文件状态信息
  const successRepos = props.results.filter((r) => r.success && r.targetRepoPath)
  const repositories: RepositoryToConfirm[] = []

  for (const result of successRepos) {
    const commitFilePaths = getCommitFilePaths(result)
    if (commitFilePaths.length > 0) {
      // 获取仓库的 svn status 来确定文件状态
      try {
        const statusResult = await api.getSvnStatus(result.targetRepoPath!)
        const statusMap = new Map(statusResult.files.map((f) => [f.path, f.status]))
        
        const filesWithStatus: FileWithStatus[] = commitFilePaths.map((filePath) => ({
          path: filePath,
          status: statusMap.get(filePath) || 'M' // 默认为 M
        }))
        
        repositories.push({
          targetRepoName: result.targetRepoName,
          targetRepoPath: result.targetRepoPath!,
          files: filesWithStatus
        })
      } catch (error) {
        console.error('Failed to get SVN status for', result.targetRepoName, error)
        // 失败时用默认状态
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
  }

  if (repositories.length === 0) {
    alert('未找到可提交的文件')
    return
  }

  // 显示确认对话框
  repositoriesToConfirm.value = repositories
  confirmedReposForCommit.value.clear()
  // 默认全选
  for (const repo of repositories) {
    confirmedReposForCommit.value.add(repo.targetRepoPath)
  }
  beforeCommitConfirmVisible.value = true
}

// 在用户确认要提交的仓库后执行实际提交
const handleConfirmCommit = async (confirmedRepoPaths: string[]): Promise<void> => {
  beforeCommitConfirmVisible.value = false

  isCommitting.value = true
  const successRepos = props.results.filter((r) => r.success && r.targetRepoPath)
  const errors: string[] = []
  
  // 清空日志并准备收集新的日志
  commitLogs.value = []

  // 创建一个快速查找 Set
  const confirmedSet = new Set(confirmedRepoPaths)

  for (const result of successRepos) {
    // 只对确认的仓库进行提交
    if (!confirmedSet.has(result.targetRepoPath!)) {
      continue
    }

    try {
      const commitFilePaths = getCommitFilePaths(result)
      if (commitFilePaths.length === 0) {
        const errorMessage = '未找到本次 merge 的可提交文件'
        errors.push(`${result.targetRepoName}: ${errorMessage}`)
        commitLogs.value.push({
          repoName: result.targetRepoName,
          command: 'svn commit (no files to commit)',
          output: errorMessage,
          success: false
        })
        continue
      }

      // 如果用户名和密码都为空，则不传递认证信息，使用缓存的凭据
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

      // 收集日志
      commitLogs.value.push({
        repoName: result.targetRepoName,
        command: commitResult.command || 'svn commit (command not available)',
        output: commitResult.output || commitResult.message,
        success: commitResult.success
      })

      if (!commitResult.success) {
        errors.push(`${result.targetRepoName}: ${commitResult.message}`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      errors.push(`${result.targetRepoName}: ${errorMessage}`)
      commitLogs.value.push({
        repoName: result.targetRepoName,
        command: 'svn commit (exception occurred)',
        output: errorMessage,
        success: false
      })
    }
  }

  isCommitting.value = false

  // 显示日志查看器而不是 alert
  logViewerVisible.value = true
}

// 关闭日志查看器
const handleLogViewerClose = (): void => {
  logViewerVisible.value = false
  
  // 如果有成功的提交，触发成功事件并关闭对话框
  const hasSuccess = commitLogs.value.some((log) => log.success)
  if (hasSuccess) {
    emit('commit-success')
    emit('close')
  }
}
</script>

<style scoped>
.result-panel {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
  position: relative;
}
.result-panel-title {
  font-weight: 600;
  font-size: 15px;
  padding: 10px 56px 10px 16px;
  background: var(--color-background-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.result-panel-title-right {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.result-panel-title-left {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.merging-icon-title {
  color: var(--color-primary);
  flex-shrink: 0;
}
.panel-toggle-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.panel-toggle-btn:hover {
  color: var(--color-text-primary);
  border-color: var(--color-primary);
}

.panel-toggle-btn:focus-visible {
  outline: 2px solid var(--color-primary-transparent);
  outline-offset: 1px;
}
.result-status.success {
  color: var(--color-success);
}
.result-status.error {
  color: var(--color-error);
}
.result-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.result-status.merging {
  color: var(--color-primary);
}
.result-status.conflict {
  color: #eab308;
  font-weight: bold;
}
.retry-repo-btn {
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-primary);
  color: var(--color-text-secondary);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.retry-repo-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.retry-repo-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.result-panel-body {
  padding: 8px 12px;
}

.revisions-progress {
  margin-bottom: 12px;
  padding: 8px;
  background: var(--color-background-secondary);
  border-radius: 4px;
}

.revisions-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.revisions-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.revision-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-family: monospace;
}

.revision-item.is-current {
  background: var(--color-background-hover);
  font-weight: 600;
}

.revision-number {
  min-width: 60px;
  color: var(--color-text-primary);
}

.revision-status {
  min-width: 70px;
}

.revision-pending {
  color: var(--color-primary);
}

.revision-merging {
  color: var(--color-primary);
}

.revision-success {
  color: var(--color-success);
}

.revision-conflict {
  color: #eab308;
}

.revision-item.is-resolved .revision-status {
  color: var(--color-success);
}

.revision-failed {
  color: var(--color-error);
}

.current-indicator {
  margin-left: auto;
  color: var(--color-primary);
  font-weight: 600;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.result-file-link {
  font-size: 11px;
  color: var(--color-primary);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
  padding: 2px 4px;
  border-radius: 2px;
  transition: all 0.15s ease;
  display: block;
}
.result-file-link:hover {
  text-decoration: underline;
  background-color: var(--color-background-hover);
}
.result-file-link.file-added {
  color: var(--color-success);
}
.result-file-link.file-modified {
  color: #3b82f6;
}
.result-file-link.file-deleted {
  color: #888;
  text-decoration: line-through;
}
.result-file-link.file-deleted:hover {
  text-decoration: line-through;
}
.result-file-link.file-conflict {
  color: #eab308;
  font-weight: 600;
}
.conflict-resolved-badge {
  margin-left: 8px;
  padding: 1px 6px;
  background-color: #10b981;
  color: white;
  font-size: 10px;
  font-weight: 600;
  border-radius: 3px;
  white-space: nowrap;
}
.result-file-empty {
  color: var(--color-text-secondary);
  font-size: 11px;
  padding: 8px 0;
}

.result-message {
  padding: 10px 12px;
  margin-bottom: 10px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.result-message.message-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.result-message.message-info {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #3b82f6;
}

.revisions-messages {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.revision-message {
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.4;
  display: flex;
  gap: 8px;
  background: var(--color-background-secondary);
  border-left: 3px solid var(--color-border);
}

.revision-message.status-failed,
.revision-message.is-error {
  background: rgba(239, 68, 68, 0.05);
  border-left-color: #ef4444;
}

.revision-message.status-conflict {
  background: rgba(234, 179, 8, 0.05);
  border-left-color: #eab308;
}

.revision-message.status-success {
  background: rgba(34, 197, 94, 0.05);
  border-left-color: #22c55e;
}

.revision-label {
  font-weight: 600;
  font-family: monospace;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.revision-text {
  color: var(--color-text-primary);
  word-break: break-word;
}
.merge-dialog-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2000;
}
.merge-dialog {
  width: 60vw;
  height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}
.merge-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.merge-title {
  font-weight: 700;
}
.close-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  cursor: pointer;
}
.commit-info-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-secondary);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.commit-field {
  display: flex;
  align-items: center;
  gap: 12px;
}
.commit-field-message {
  flex: 1;
}
.commit-label {
  min-width: 70px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
.commit-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font-size: 13px;
}

.commit-input-textarea {
  resize: vertical;
  min-height: 72px;
  line-height: 1.4;
}
.commit-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-transparent);
}
.merge-dialog-body {
  padding: 12px 16px;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.current-target {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.logs {
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  padding: 8px;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: var(--color-text-primary);
  overflow-y: auto;
  max-height: 44vh;
}
.log-line {
  white-space: pre-wrap;
}
.merge-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}
.footer-actions {
  display: flex;
  gap: 8px;
}
.status .success {
  color: var(--color-success);
}
.status .error {
  color: var(--color-error);
}
.commit-action {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: white;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}
.commit-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.close-action {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-primary);
  cursor: pointer;
}
</style>
