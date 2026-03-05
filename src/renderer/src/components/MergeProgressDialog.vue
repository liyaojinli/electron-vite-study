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
          <input
            v-model="commitMessage"
            type="text"
            class="commit-input"
            placeholder="输入提交信息"
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
              <span :class="['result-status', getResultStatusClass(result)]">
                {{ getResultStatusText(result) }}
              </span>
            </div>
            <div v-if="isPanelExpanded(result)" class="result-panel-body">
              <div v-if="result.files && result.files.length" class="file-list">
                <a
                  v-for="file in result.files"
                  :key="file"
                  :class="[
                    'result-file-link',
                    getEffectiveFileStatus(file, result.targetRepoPath) === 'A' ? 'file-added' : '',
                    getEffectiveFileStatus(file, result.targetRepoPath) === 'U'
                      ? 'file-updated'
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
              <div v-else class="result-file-empty">无文件</div>
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

    <!-- SVN Diff Viewer ReadOnly for non-conflicts -->
    <SvnDiffViewerReadOnly
      :visible="diffViewerReadOnlyVisible"
      :repo-path="selectedRepoPath"
      :file-path="selectedFilePath"
      :base-revision="diffViewerBaseRevision"
      :target-revision="diffViewerTargetRevision"
      @close="diffViewerReadOnlyVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import { LoaderCircle } from 'lucide-vue-next'
import SvnConflictMerge from './SvnConflictMerge.vue'
import SvnDiffViewerReadOnly from './SvnDiffViewerReadOnly.vue'

interface MergeResultPanel {
  targetRepoName: string
  targetRepoPath?: string
  success: boolean
  files: string[]
  isMerging?: boolean
}

const getResultStatusClass = (result: MergeResultPanel): string => {
  if (result.isMerging) return 'merging'
  if (result.success) {
    return hasUnresolvedConflicts(result) ? 'conflict' : 'success'
  }
  return 'error'
}

const getResultStatusText = (result: MergeResultPanel): string => {
  if (result.isMerging) return '合并中'
  if (result.success) {
    return hasUnresolvedConflicts(result) ? '合并冲突' : '合并成功'
  }
  return '合并失败'
}

const props = defineProps<{
  visible: boolean
  results: MergeResultPanel[]
  isLoading: boolean
  sourceRepoUrl?: string
  selectedRevisions?: number[]
}>()

const emit = defineEmits(['close', 'refresh', 'commit-success'])

const api = window.api
const commitUsername = ref('')
const commitPassword = ref('')
const commitMessage = ref('')
const isCommitting = ref(false)

// 跟踪已解决的冲突文件 (key: repoPath::filePath)
const resolvedConflicts = ref<Set<string>>(new Set())

// 生成默认的 commit message
const generateDefaultCommitMessage = (): string => {
  if (!props.sourceRepoUrl || !props.selectedRevisions || props.selectedRevisions.length === 0) {
    return ''
  }
  const revisions = [...props.selectedRevisions].sort((a, b) => a - b)
  const revStr = revisions.map((r) => `r${r}`).join(',')
  return `merged ${revStr} from ${props.sourceRepoUrl}`
}

// 当对话框打开或数据变化时，生成默认 commit message
watch(
  () => [props.visible, props.sourceRepoUrl, props.selectedRevisions],
  ([visible]) => {
    if (visible) {
      commitMessage.value = generateDefaultCommitMessage()
    }
  },
  { immediate: true, deep: true }
)

const canCommit = computed(() => {
  const hasMessage = commitMessage.value.trim() !== ''
  const hasValidRepos = props.results.some((r) => r.success && r.targetRepoPath)
  return hasMessage && hasValidRepos
})

const conflictMergeVisible = ref(false)
const diffViewerReadOnlyVisible = ref(false)
const selectedRepoPath = ref('')
const selectedFilePath = ref('')
const diffViewerBaseRevision = ref(0)
const diffViewerTargetRevision = ref(0)
const panelExpandedState = ref<Record<string, boolean>>({})

const getPanelKey = (result: MergeResultPanel): string => {
  return `${result.targetRepoName}::${result.targetRepoPath || ''}`
}

const isPanelExpanded = (result: MergeResultPanel): boolean => {
  const key = getPanelKey(result)
  return panelExpandedState.value[key] ?? false
}

const togglePanel = (result: MergeResultPanel): void => {
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

const getEffectiveFileStatus = (fileEntry: string, repoPath?: string): string => {
  const rawStatus = fileEntry.substring(0, 1)
  if (rawStatus !== 'C' || !repoPath) return rawStatus

  const filePath = parseFilePath(fileEntry, repoPath)
  return isConflictResolved(repoPath, filePath) ? 'M' : 'C'
}

const hasUnresolvedConflicts = (result: MergeResultPanel): boolean => {
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

const handleFileClick = (result: MergeResultPanel, fileEntry: string): void => {
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
    // 对于非冲突文件，显示服务端两个版本之间的差异
    // 使用 sourceRepoUrl 和选中的 revisions
    if (!props.sourceRepoUrl || !props.selectedRevisions || props.selectedRevisions.length === 0) {
      alert('无法获取版本信息')
      return
    }
    
    // 显示整个合并范围的变更：从最小 revision 的前一个版本到最大 revision
    const minRevision = Math.min(...props.selectedRevisions)
    const maxRevision = Math.max(...props.selectedRevisions)
    const baseRevision = minRevision - 1
    const targetRevision = maxRevision
    
    console.log('[MergeProgressDialog] 查看文件差异:', {
      sourceRepoUrl: props.sourceRepoUrl,
      filePath,
      baseRevision,
      targetRevision,
      selectedRevisions: props.selectedRevisions
    })
    
    selectedRepoPath.value = props.sourceRepoUrl
    diffViewerBaseRevision.value = baseRevision
    diffViewerTargetRevision.value = targetRevision
    diffViewerReadOnlyVisible.value = true
  }
}

const handleConflictMergeClose = (): void => {
  conflictMergeVisible.value = false
  // Emit refresh to update the merge results after conflict resolution
  emit('refresh')
}

// 处理冲突解决
const handleConflictResolved = (): void => {
  if (selectedRepoPath.value && selectedFilePath.value) {
    const key = `${selectedRepoPath.value}::${selectedFilePath.value}`
    resolvedConflicts.value.add(key)
  }
}

// 检查文件是否已解决
const isConflictResolved = (repoPath: string, filePath: string): boolean => {
  const key = `${repoPath}::${filePath}`
  return resolvedConflicts.value.has(key)
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

  isCommitting.value = true
  const successRepos = props.results.filter((r) => r.success && r.targetRepoPath)
  const errors: string[] = []
  let successCount = 0

  for (const result of successRepos) {
    try {
      // 如果用户名和密码都为空，则不传递认证信息，使用缓存的凭据
      const hasAuth = commitUsername.value.trim() !== '' && commitPassword.value.trim() !== ''
      
      const commitResult = hasAuth
        ? await api.svnCommit(
            result.targetRepoPath!,
            commitMessage.value,
            commitUsername.value,
            commitPassword.value
          )
        : await api.svnCommit(result.targetRepoPath!, commitMessage.value)

      if (commitResult.success) {
        successCount++
      } else {
        errors.push(`${result.targetRepoName}: ${commitResult.message}`)
      }
    } catch (error) {
      errors.push(
        `${result.targetRepoName}: ${error instanceof Error ? error.message : '未知错误'}`
      )
    }
  }

  isCommitting.value = false

  if (errors.length === 0) {
    alert(`成功提交 ${successCount} 个仓库`)
    emit('commit-success')
    emit('close')
  } else {
    alert(
      `提交完成。成功: ${successCount}, 失败: ${errors.length}\n\n失败详情:\n${errors.join('\n')}`
    )
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
.result-file-link.file-updated {
  color: #eab308;
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
