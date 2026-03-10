<template>
  <div v-if="visible" class="merge-dialog-backdrop app-dialog-backdrop">
    <div class="merge-dialog app-dialog-shell">
      <div class="merge-dialog-header app-dialog-header">
        <div class="merge-title">合并进度</div>
        <button class="close-btn app-dialog-close" @click="$emit('close')">✕</button>
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
        <div class="results-section">
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
                    v-for="rev in result.revisions.filter(
                      (r) => r.message && r.status !== 'pending'
                    )"
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

                <div v-if="getDisplayEntries(result).length" class="file-list">
                  <a
                    v-for="file in getDisplayEntries(result)"
                    :key="file"
                    :class="[
                      'result-file-link',
                      getEffectiveFileStatus(file, result.targetRepoPath) === 'A'
                        ? 'file-added'
                        : '',
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
                    !result.message &&
                    (!result.revisions || !result.revisions.some((r) => r.message))
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

        <div class="execution-log-section">
          <div class="execution-log-title">执行日志</div>
          <div v-if="logs && logs.length" class="execution-log-list">
            <div v-for="(line, index) in logs" :key="`${index}-${line}`" class="execution-log-line">
              {{ line }}
            </div>
          </div>
          <div v-else class="execution-log-empty">暂无执行日志</div>
        </div>
      </div>
      <div class="merge-dialog-footer app-dialog-footer">
        <div class="status">
          <span v-if="isLoading">进行中…</span>
          <span v-else-if="isCommitting">提交中…</span>
          <span v-else>就绪</span>
        </div>
        <div class="footer-actions">
          <button
            class="app-action-primary"
            :disabled="isLoading || isCommitting || !canCommit"
            @click="handleCommit"
          >
            提交
          </button>
          <button class="app-action-secondary" @click="$emit('close')">关闭</button>
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
import { ref, computed } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import { LoaderCircle } from 'lucide-vue-next'
import SvnConflictMerge from './SvnConflictMerge.vue'
import SvnDiffViewer from './SvnDiffViewer.vue'
import SvnBeforeCommitConfirm from './SvnBeforeCommitConfirm.vue'
import SvnLogViewer from './SvnLogViewer.vue'
import {
  getCommitFilePaths as collectCommitFilePaths,
  getDisplayEntries as collectDisplayEntries,
  getDisplayFileName as formatDisplayFileName,
  getEffectiveFileStatus as resolveEffectiveFileStatus,
  hasUnresolvedConflicts as detectUnresolvedConflicts,
  isConflictEntry,
  isRevisionConflictResolved as checkRevisionConflictResolved,
  parseMergeFilePath
} from '../utils/mergeProgress'
import { useMergeResultPanels } from '../composables/useMergeResultPanels'
import { useMergeCommitFlow } from '../composables/useMergeCommitFlow'
import { useMergeRetryRepositories } from '../composables/useMergeRetryRepositories'
import type { MergeSessionResult, RevisionMergeState } from '../../../shared/merge'

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
  logs?: string[]
  isLoading: boolean
  sourceRepoUrl?: string
  selectedRevisions?: number[]
}>()

const emit = defineEmits(['close', 'refresh', 'commit-success', 'update-result'])

const api = window.api

// 跟踪已解决的冲突文件 (key: repoPath::filePath)
const resolvedConflicts = ref<Set<string>>(new Set())

const conflictMergeVisible = ref(false)
const diffViewerVisible = ref(false)
const selectedRepoPath = ref('')
const selectedFilePath = ref('')

const parseFilePath = (fileEntry: string, repoPath?: string): string => {
  return parseMergeFilePath(fileEntry, repoPath)
}

const getEffectiveFileStatus = (fileEntry: string, repoPath?: string): string => {
  return resolveEffectiveFileStatus(fileEntry, repoPath, isConflictResolved)
}

const hasUnresolvedConflicts = (result: MergeSessionResult): boolean => {
  return detectUnresolvedConflicts(result, isConflictResolved)
}

const { getPanelKey, isPanelExpanded, togglePanel } = useMergeResultPanels({
  results: computed(() => props.results),
  hasUnresolvedConflicts
})

const getDisplayFileName = (fileEntry: string, repoPath?: string): string => {
  return formatDisplayFileName(fileEntry, repoPath, isConflictResolved)
}

const getDisplayEntries = (result: MergeSessionResult): string[] => {
  return collectDisplayEntries(result)
}

const isConflict = (fileEntry: string, repoPath?: string): boolean => {
  return isConflictEntry(fileEntry, repoPath, isConflictResolved)
}

const getCommitFilePaths = (result: MergeSessionResult): string[] => {
  return collectCommitFilePaths(result, isConflictResolved)
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

  // 检查是否为目录，目录不可点击查看
  if (filePath.endsWith('/') || filePath.endsWith('\\')) {
    console.log('[MergeProgressDialog] 点击了目录，暂不支持查看目录内容:', filePath)
    return
  }

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

const { canRetryRepository, isRetryingRepository, handleRetryRepository } =
  useMergeRetryRepositories({
    getPanelKey,
    onUpdateResult: (updatedResult) => emit('update-result', updatedResult),
    onRefresh: () => emit('refresh')
  })

// 检查文件是否已解决
const isConflictResolved = (repoPath: string, filePath: string): boolean => {
  const key = `${repoPath}::${filePath}`
  return resolvedConflicts.value.has(key)
}

// 检查某个版本的所有冲突是否都已解决
const isRevisionConflictResolved = (revision: RevisionMergeState, repoPath: string): boolean => {
  return checkRevisionConflictResolved(revision, repoPath, isConflictResolved)
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

const {
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
} = useMergeCommitFlow({
  visible: computed(() => props.visible),
  sourceRepoUrl: computed(() => props.sourceRepoUrl),
  selectedRevisions: computed(() => props.selectedRevisions),
  results: computed(() => props.results),
  hasUnresolvedConflicts,
  isConflict,
  parseFilePath,
  isConflictResolved,
  getCommitFilePaths,
  onCommitSuccess: () => emit('commit-success'),
  onRequestClose: () => emit('close')
})
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
.execution-log-section {
  width: 320px;
  min-width: 280px;
  max-width: 40%;
  height: 100%;
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background-primary);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.execution-log-title {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
}

.execution-log-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 12px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.8;
}

.execution-log-line {
  white-space: pre-wrap;
  word-break: break-word;
}

.execution-log-empty {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

@media (max-width: 1200px) {
  .merge-dialog-body {
    flex-direction: column;
  }

  .execution-log-section {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    height: 180px;
  }
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
  z-index: 2000;
}
.merge-dialog {
  width: 80vw;
  height: 80vh;
  border-radius: 8px;
}
.merge-dialog-header {
  flex-shrink: 0;
}
.merge-title {
  font-weight: 700;
}

.close-btn {
  font-size: 14px;
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
  overflow: hidden;
  display: flex;
  flex-direction: row;
  gap: 8px;
}

.results-section {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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
  align-items: center;
  justify-content: space-between;
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
</style>
