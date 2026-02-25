<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { AlertCircle, CheckCircle, Play, X, Search, RefreshCw, RotateCcw } from 'lucide-vue-next'
import type { RepositoryData } from '../../../shared/repository'
import SvnLogDialog from './SvnLogDialog.vue'
import RevertConfirmDialog from './RevertConfirmDialog.vue'
import SvnDiffViewer from './SvnDiffViewer.vue'
import SvnDiffViewerReadOnly from './SvnDiffViewerReadOnly.vue'

const props = defineProps<{
  isActive: boolean
}>()

interface SvnLogEntry {
  revision: number
  author: string
  date: string
  message: string
  selected?: boolean
}

interface MergeResult {
  targetRepoName: string
  targetRepoUrl: string
  success: boolean
  message: string
  output?: string
}

interface AffectedFile {
  revision: number
  files: Array<{ status: string; path: string }>
}

const api = window.api

const localRepositories = ref<RepositoryData[]>([])
const svnLogs = ref<SvnLogEntry[]>([])
const selectedSourceRepo = ref<string>('')
const selectedTargetRepos = ref<Set<string>>(new Set())
const mergeResults = ref<MergeResult[]>([])
// 状态集合：哪些仓库可以提交 / 存在冲突
const canCommitRepos = ref<Set<string>>(new Set())
const conflictRepos = ref<Set<string>>(new Set())
const isLoading = ref(false)
const isLogLoading = ref(false)
// (removed expandedResults used by removed Merge Results panel)
const affectedFiles = ref<AffectedFile[]>([])
const isLoadingFiles = ref(false)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tableRef = ref<any>(null)

// Repository update states
const updatingRepos = ref<Set<string>>(new Set())

// SVN Log Dialog states
const showSvnLogDialog = ref(false)
const svnLogTitle = ref('SVN 命令执行')
const svnCommandLogs = ref<string[]>([])
const svnLogLoading = ref(false)
const svnLogSuccess = ref<boolean | null>(null)

// Revert Confirm Dialog states
const showRevertDialog = ref(false)
const revertDialogRepoUrl = ref<string>('')
const revertDialogFiles = ref<Array<{ status: string; path: string }>>([])
const pendingRevertRepoUrl = ref<string>('')

// SVN Diff Viewer states
const showDiffViewer = ref(false)
const diffViewerRepoPath = ref<string>('')
const diffViewerFilePath = ref<string>('')

// SVN Diff Viewer ReadOnly states (for revision diff)
const showDiffViewerReadOnly = ref(false)
const diffViewerReadOnlyRepoPath = ref<string>('')
const diffViewerReadOnlyFilePath = ref<string>('')
const diffViewerReadOnlyBaseRevision = ref<number>(0)
const diffViewerReadOnlyTargetRevision = ref<number>(0)

// Search related states
const searchKeyword = ref<string>('')
const startDate = ref<string>('')
const endDate = ref<string>('')

const loadRepositories = async (): Promise<void> => {
  try {
    localRepositories.value = await api.getLocalRepositories()
  } catch (error) {
    console.error('Failed to load local repositories:', error)
  }
}

onMounted(async () => {
  await loadRepositories()
})

// Reload repositories when component becomes active
watch(
  () => props.isActive,
  async (isActive, wasActive) => {
    if (isActive && !wasActive) {
      await loadRepositories()
    }
  }
)

// Auto-load logs when source repo is selected (only initial load)

// Auto-load logs whenever source repo changes
watch(selectedSourceRepo, async (newValue) => {
  if (newValue) {
    await loadLogs()
  } else {
    svnLogs.value = []
    affectedFiles.value = []
  }
})

const sourceRepo = computed(() =>
  localRepositories.value.find((r) => r.url === selectedSourceRepo.value)
)

const targetRepos = computed(() =>
  localRepositories.value.filter((r) => selectedTargetRepos.value.has(r.url))
)

const selectedRevisions = computed(() =>
  svnLogs.value.filter((log) => log.selected).map((log) => log.revision)
)

// Auto-load changed files when revisions are selected
watch(selectedRevisions, async (newValue) => {
  if (newValue.length > 0 && selectedSourceRepo.value) {
    isLoadingFiles.value = true
    try {
      const repo = localRepositories.value.find((r) => r.url === selectedSourceRepo.value)
      if (repo) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        affectedFiles.value = await (api as any).getSvnChangedFiles(repo.url, newValue)
      }
    } catch (error) {
      console.error('Failed to load changed files:', error)
      affectedFiles.value = []
    } finally {
      isLoadingFiles.value = false
    }
  } else {
    affectedFiles.value = []
  }
})

const canMerge = computed(
  () =>
    selectedSourceRepo.value &&
    selectedTargetRepos.value.size > 0 &&
    selectedRevisions.value.length > 0
)

const formatDate = (dateString: string): string => {
  try {
    const date = new Date(dateString)
    // 转换为中国上海时区 (UTC+8)
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
  } catch (error) {
    console.error('Failed to format date:', error)
    return dateString
  }
}

const handleSelectionChange = (selection: SvnLogEntry[]): void => {
  // Clear all selections first
  svnLogs.value.forEach((log) => {
    log.selected = false
  })
  // Set selected items
  selection.forEach((selectedLog) => {
    const log = svnLogs.value.find((l) => l.revision === selectedLog.revision)
    if (log) {
      log.selected = true
    }
  })
}

const toggleAllSelections = (): void => {
  if (!tableRef.value) return
  // Clear all selections
  tableRef.value.clearSelection()
  svnLogs.value.forEach((log) => {
    log.selected = false
  })
}

const loadLogs = async (): Promise<void> => {
  if (!selectedSourceRepo.value) return

  isLogLoading.value = true
  try {
    const repo = localRepositories.value.find((r) => r.url === selectedSourceRepo.value)
    if (repo) {
      svnLogs.value = await api.getSvnLog(repo.url, 100)
    }
  } catch (error) {
    console.error('Failed to load SVN logs:', error)
    svnLogs.value = []
  } finally {
    isLogLoading.value = false
  }
}

const performSearch = async (): Promise<void> => {
  if (!selectedSourceRepo.value) return

  isLogLoading.value = true
  try {
    const repo = localRepositories.value.find((r) => r.url === selectedSourceRepo.value)
    if (repo) {
      svnLogs.value = await api.getSvnLog(
        repo.url,
        100,
        searchKeyword.value,
        startDate.value,
        endDate.value
      )
      // Clear selections and affected files when new search is performed
      svnLogs.value.forEach((log) => {
        log.selected = false
      })
      affectedFiles.value = []
    }
  } catch (error) {
    console.error('Failed to search SVN logs:', error)
    svnLogs.value = []
  } finally {
    isLogLoading.value = false
  }
}

const toggleTargetRepo = (repoUrl: string): void => {
  if (selectedTargetRepos.value.has(repoUrl)) {
    selectedTargetRepos.value.delete(repoUrl)
  } else {
    selectedTargetRepos.value.add(repoUrl)
  }
}

// (toggleResultExpanded removed — no merge results panel now)

const performSvnUpdate = async (repoUrl: string): Promise<void> => {
  svnLogTitle.value = `更新仓库: ${repoUrl}`
  svnCommandLogs.value = []
  svnLogLoading.value = true
  svnLogSuccess.value = null
  showSvnLogDialog.value = true
  updatingRepos.value.add(repoUrl)

  try {
    const result = await api.svnUpdate(repoUrl)
    svnCommandLogs.value = result.logs || []
    svnLogSuccess.value = result.success

    if (!result.success) {
      console.error('SVN update failed:', result.message)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '更新失败，请检查控制台日志'
    svnCommandLogs.value = [errorMsg]
    svnLogSuccess.value = false
    console.error('SVN update failed:', error)
  } finally {
    svnLogLoading.value = false
    updatingRepos.value.delete(repoUrl)
  }
}

const performSvnRevert = async (repoUrl: string): Promise<void> => {
  try {
    console.log('[performSvnRevert] Getting status for repo:', repoUrl)
    // Get the status of modified files first
    const statusResult = await window.api.getSvnStatus(repoUrl)
    console.log('[performSvnRevert] Status result:', statusResult)
    const { files } = statusResult

    // Show dialog
    revertDialogRepoUrl.value = repoUrl
    revertDialogFiles.value = files || []
    pendingRevertRepoUrl.value = repoUrl
    showRevertDialog.value = true
  } catch (error) {
    console.error('[performSvnRevert] Failed to get SVN status:', error)
    // Still show dialog even if status fetch failed
    revertDialogRepoUrl.value = repoUrl
    revertDialogFiles.value = []
    pendingRevertRepoUrl.value = repoUrl
    showRevertDialog.value = true
  }
}

// 占位空函数：待实现提交与冲突处理逻辑
const onCommitClick = (repoUrl: string): void => {
  console.log('[onCommitClick] placeholder for', repoUrl)
}

const onConflictClick = (repoUrl: string): void => {
  console.log('[onConflictClick] placeholder for', repoUrl)
}

const handleConfirmRevert = async (
  selectedFiles: Array<{ status: string; path: string }>
): Promise<void> => {
  const repoUrl = pendingRevertRepoUrl.value
  showRevertDialog.value = false

  svnLogTitle.value = `恢复仓库: ${repoUrl} (${selectedFiles.length} 个文件)`
  svnCommandLogs.value = []
  svnLogLoading.value = true
  svnLogSuccess.value = null
  showSvnLogDialog.value = true

  try {
    // Extract file paths from selected files
    const filePaths = selectedFiles.map((f) => f.path)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (api as any).svnRevert(repoUrl, filePaths)
    svnCommandLogs.value = result.logs || []
    svnLogSuccess.value = result.success

    if (!result.success) {
      console.error('SVN revert failed:', result.message)
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '恢复失败，请检查控制台日志'
    svnCommandLogs.value = [errorMsg]
    svnLogSuccess.value = false
    console.error('SVN revert failed:', error)
  } finally {
    svnLogLoading.value = false
    pendingRevertRepoUrl.value = ''
  }
}

const handleViewDiff = (file: { status: string; path: string }): void => {
  diffViewerRepoPath.value = revertDialogRepoUrl.value
  diffViewerFilePath.value = file.path
  showDiffViewer.value = true
}

const handleCloseDiffViewer = (): void => {
  showDiffViewer.value = false
  // Reset paths to ensure clean state for next open
  setTimeout(() => {
    diffViewerRepoPath.value = ''
    diffViewerFilePath.value = ''
  }, 300)
}

// Handle clicking on affected file to view revision diff
const handleViewAffectedFileDiff = (
  file: { status: string; path: string },
  revision: number
): void => {
  // Don't allow viewing diff for directories
  if (file.path.endsWith('/')) return

  diffViewerReadOnlyRepoPath.value = sourceRepo.value?.url || ''
  diffViewerReadOnlyFilePath.value = file.path
  diffViewerReadOnlyBaseRevision.value = revision - 1
  diffViewerReadOnlyTargetRevision.value = revision
  showDiffViewerReadOnly.value = true
}

const handleCloseDiffViewerReadOnly = (): void => {
  showDiffViewerReadOnly.value = false
  setTimeout(() => {
    diffViewerReadOnlyRepoPath.value = ''
    diffViewerReadOnlyFilePath.value = ''
    diffViewerReadOnlyBaseRevision.value = 0
    diffViewerReadOnlyTargetRevision.value = 0
  }, 300)
}

// Check if affected file can show diff (not a directory)
// Files have extensions (contain .), directories don't
const canShowAffectedFileDiff = (file: { status: string; path: string }): boolean => {
  // 以 / 结尾的是目录
  if (file.path.endsWith('/')) return false
  // 获取文件名，检查是否包含扩展名
  const fileName = file.path.split('/').pop() || ''
  return fileName.includes('.')
}

const handleCancelRevert = (): void => {
  showRevertDialog.value = false
  pendingRevertRepoUrl.value = ''
}

const performMerge = async (): Promise<void> => {
  if (!canMerge.value || !sourceRepo.value) return

  isLoading.value = true
  mergeResults.value = []
  // reset status sets
  canCommitRepos.value.clear()
  conflictRepos.value.clear()

  try {
    const selectedLog = svnLogs.value.filter((l) => l.selected)[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mergeResults.value = await (api as any).performBatchMerge(
      sourceRepo.value,
      targetRepos.value,
      selectedRevisions.value,
      selectedLog?.message || ''
    )

    // 根据 mergeResults 更新按钮状态：成功 -> 可提交；包含 conflict 字样 -> 有冲突
    mergeResults.value.forEach((res) => {
      const url = res.targetRepoUrl || res.targetRepoName
      if (res.success) {
        canCommitRepos.value.add(url)
        conflictRepos.value.delete(url)
      } else {
        const msg = (res.message || '').toLowerCase()
        if (msg.includes('conflict') || msg.includes('冲突')) {
          conflictRepos.value.add(url)
          canCommitRepos.value.delete(url)
        }
      }
    })
  } catch (error) {
    console.error('Merge failed:', error)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <section v-show="isActive" class="batch-merge">
    <div class="batch-merge-container">
      <h2 class="section-title">批量合并</h2>

      <!-- Source Repository Selection -->
      <div class="merge-section">
        <h3 class="section-subtitle">步骤 1: 选择源仓库</h3>
        <div class="control-group">
          <label class="control-label">源仓库:</label>
          <select v-model="selectedSourceRepo" class="app-select">
            <option value="">-- 选择一个本地仓库 --</option>
            <option v-for="repo in localRepositories" :key="repo.url" :value="repo.url">
              {{ repo.alias }} ({{ repo.url }})
            </option>
          </select>
        </div>
      </div>

      <!-- SVN Logs Section -->
      <div v-if="selectedSourceRepo" class="merge-section">
        <h3 class="section-subtitle">步骤 2: 选择要合并的提交</h3>
        <div class="logs-wrapper">
          <div class="logs-table-container">
            <div class="logs-toolbar">
              <div class="toolbar-left">
                <button class="app-button btn-small" @click="toggleAllSelections">
                  <X :size="14" />
                  清空
                </button>
              </div>
              <div class="toolbar-right">
                <input
                  v-model="searchKeyword"
                  type="text"
                  placeholder="搜索(提交人/信息)"
                  class="search-input"
                  @keyup.enter="performSearch"
                />
                <input v-model="startDate" type="date" class="date-input" @change="performSearch" />
                <span class="date-separator">至</span>
                <input v-model="endDate" type="date" class="date-input" @change="performSearch" />
                <button class="app-button btn-small is-primary" @click="performSearch">
                  <Search :size="14" />
                  搜索
                </button>
              </div>
            </div>
            <div class="logs-table-wrapper">
              <!-- Loading overlay -->
              <div v-if="isLogLoading" class="table-loading-overlay">
                <div class="loading-spinner">加载中...</div>
              </div>
              <el-table
                ref="tableRef"
                :data="svnLogs"
                stripe
                border
                size="small"
                height="100%"
                style="width: 100%"
                class="compact-table"
                @selection-change="handleSelectionChange"
              >
                <el-table-column type="selection" width="40" align="center" />
                <el-table-column prop="revision" label="Revision" width="80" align="center">
                  <template #default="{ row }">
                    <span style="color: var(--el-color-primary); font-weight: 600">
                      r{{ row.revision }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="message" label="提交信息" min-width="200">
                  <template #default="{ row }">
                    <el-tooltip
                      :content="row.message"
                      placement="right"
                      :show-after="300"
                      :disabled="!row.message"
                      popper-class="commit-message-tooltip"
                      effect="light"
                      :show-arrow="false"
                    >
                      <span class="message-cell">{{ row.message }}</span>
                    </el-tooltip>
                  </template>
                </el-table-column>
                <el-table-column prop="author" label="提交人" width="100" show-overflow-tooltip />
                <el-table-column prop="date" label="提交时间" width="160">
                  <template #default="{ row }">
                    {{ formatDate(row.date) }}
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
          <div class="logs-affected-files">
            <div class="affected-files-header">影响文件</div>
            <div class="affected-files-content">
              <div v-if="selectedRevisions.length === 0" class="affected-files-empty">
                选择提交记录后显示
              </div>
              <div v-else-if="isLoadingFiles" class="affected-files-empty">加载文件中...</div>
              <div v-else-if="affectedFiles.length === 0" class="affected-files-empty">
                无文件改动
              </div>
              <div v-else class="affected-files-list">
                <div
                  v-for="revisionGroup in affectedFiles"
                  :key="revisionGroup.revision"
                  class="revision-group"
                >
                  <div class="revision-header">--- Revision {{ revisionGroup.revision }} ---</div>
                  <div
                    v-for="file in revisionGroup.files"
                    :key="file.path"
                    class="file-line"
                    :class="[
                      `status-${file.status}`,
                      { 'can-view-diff': canShowAffectedFileDiff(file) },
                      { 'is-directory': !canShowAffectedFileDiff(file) }
                    ]"
                    @click="
                      canShowAffectedFileDiff(file) &&
                      handleViewAffectedFileDiff(file, revisionGroup.revision)
                    "
                  >
                    <span class="file-status">{{ file.status }}</span>
                    <span class="file-path">{{ file.path }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Target Repositories Selection -->
      <div v-if="selectedSourceRepo" class="merge-section">
        <h3 class="section-subtitle">
          <span>步骤 3: 选择目标仓库</span>
          <div class="subtitle-actions">
            <div class="panel-action-group">
              <button
                type="button"
                class="update-btn"
                :title="isLoading ? '合并中...' : '执行合并'"
                :disabled="!canMerge || isLoading"
                @click="performMerge"
              >
                <Play :size="16" :class="{ 'is-spinning': isLoading }" />
              </button>
              <div class="panel-action-label">{{ isLoading ? '合并中...' : '合并' }}</div>
            </div>
          </div>
        </h3>
        <div class="target-repos-grid">
          <div
            v-for="repo in localRepositories.filter((r) => r.url !== selectedSourceRepo)"
            :key="repo.url"
            class="target-repo-panel"
          >
            <div class="panel-header">
              <div class="panel-left">
                <input
                  type="checkbox"
                  class="repo-checkbox"
                  :checked="selectedTargetRepos.has(repo.url)"
                  @change="toggleTargetRepo(repo.url)"
                />
                <span class="repo-alias">{{ repo.alias }}</span>
              </div>
              <div class="panel-right">
                <div class="panel-action-group">
                  <button
                    type="button"
                    class="update-btn"
                    :title="`更新 ${repo.alias}`"
                    :disabled="updatingRepos.has(repo.url)"
                    @click="performSvnUpdate(repo.url)"
                  >
                    <RefreshCw :size="16" :class="{ 'is-spinning': updatingRepos.has(repo.url) }" />
                  </button>
                  <div class="panel-action-label">更新</div>
                </div>
                <div class="panel-action-group">
                  <button
                    type="button"
                    class="revert-btn"
                    :title="`恢复 ${repo.alias}`"
                    @click="performSvnRevert(repo.url)"
                  >
                    <RotateCcw :size="16" />
                  </button>
                  <div class="panel-action-label">还原</div>
                </div>
                <div class="panel-action-group">
                  <button
                    type="button"
                    class="update-btn"
                    :title="`提交 ${repo.alias}`"
                    :class="{ 'commit-active': canCommitRepos.has(repo.url) }"
                    :disabled="!canCommitRepos.has(repo.url)"
                    @click="onCommitClick(repo.url)"
                  >
                    <CheckCircle :size="16" />
                  </button>
                  <div class="panel-action-label">提交</div>
                </div>
                <div class="panel-action-group">
                  <button
                    type="button"
                    class="revert-btn"
                    :title="`检查冲突 ${repo.alias}`"
                    :class="{ 'conflict-active': conflictRepos.has(repo.url) }"
                    :disabled="!conflictRepos.has(repo.url)"
                    @click="onConflictClick(repo.url)"
                  >
                    <AlertCircle :size="16" />
                  </button>
                  <div class="panel-action-label">冲突</div>
                </div>
              </div>
            </div>
            <div class="panel-body">
              <div class="repo-url">{{ repo.url }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- (合并结果面板已移除) -->
    </div>
  </section>

  <!-- SVN Log Dialog -->
  <SvnLogDialog
    :visible="showSvnLogDialog"
    :title="svnLogTitle"
    :logs="svnCommandLogs"
    :is-loading="svnLogLoading"
    :is-success="svnLogSuccess"
    @close="showSvnLogDialog = false"
  />

  <!-- Revert Confirm Dialog -->
  <RevertConfirmDialog
    :visible="showRevertDialog"
    :repo-url="revertDialogRepoUrl"
    :files="revertDialogFiles"
    @confirm="handleConfirmRevert"
    @cancel="handleCancelRevert"
    @view-diff="handleViewDiff"
  />

  <!-- SVN Diff Viewer -->
  <SvnDiffViewer
    :visible="showDiffViewer"
    :repo-path="diffViewerRepoPath"
    :file-path="diffViewerFilePath"
    @close="handleCloseDiffViewer"
  />

  <!-- SVN Diff Viewer ReadOnly (for revision diff) -->
  <SvnDiffViewerReadOnly
    :visible="showDiffViewerReadOnly"
    :repo-path="diffViewerReadOnlyRepoPath"
    :file-path="diffViewerReadOnlyFilePath"
    :base-revision="diffViewerReadOnlyBaseRevision"
    :target-revision="diffViewerReadOnlyTargetRevision"
    @close="handleCloseDiffViewerReadOnly"
  />
</template>

<style scoped>
.batch-merge {
  width: 100%;
}

.batch-merge-container {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.section-title {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 24px;
  color: var(--color-text-primary);
}

.section-subtitle {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 0;
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.merge-section {
  margin-bottom: 24px;
  background: var(--color-background-secondary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.merge-section .section-subtitle {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  margin: 0;
  background: linear-gradient(
    135deg,
    var(--color-background-secondary) 0%,
    var(--color-background-hover) 100%
  );
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.subtitle-actions {
  display: flex;
  align-items: center;
}

/* 使用现有的 .update-btn / .panel-action-label 样式来匹配更新/还原按钮 */

.merge-section > div:not(.section-subtitle):nth-of-type(n + 2) {
  padding: 16px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.control-label {
  min-width: 100px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.app-select {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font-size: 14px;
}

.app-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-transparent);
}

.app-button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: var(--color-background-hover);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.app-button:hover:not(:disabled) {
  background: var(--color-primary);
  color: white;
}

.app-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.app-button.is-primary {
  background: var(--color-primary);
  color: white;
}

.app-button.is-large {
  padding: 12px 24px;
  font-size: 16px;
}

.logs-container {
  margin-top: 0;
  padding: 16px;
}

.logs-loading {
  padding: 16px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.logs-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}

.logs-wrapper {
  display: flex;
  gap: 16px;
  padding: 16px;
  height: 500px;
  overflow: hidden;
}

.logs-table-container {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.logs-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font-size: 12px;
  width: 160px;
}

.search-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.date-input {
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font-size: 12px;
  width: 120px;
}

.date-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.date-separator {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.btn-small {
  padding: 4px 12px;
  font-size: 12px;
}

.logs-table-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.message-cell {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(var(--color-background-primary-rgb), 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  backdrop-filter: blur(3px);
}

.loading-spinner {
  padding: 16px 24px;
  background: var(--color-background-secondary);
  border-radius: 6px;
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.table-empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  font-size: 14px;
  padding: 48px 16px;
}

.compact-table {
  font-size: 11px;
}

.compact-table .el-table__header-wrapper,
.compact-table .el-table__body-wrapper {
  font-size: 11px;
}

.logs-affected-files {
  width: 320px;
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--color-background-primary);
}

.affected-files-header {
  padding: 8px 12px;
  background: var(--color-background-secondary);
  font-weight: 600;
  font-size: 12px;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.affected-files-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  font-size: 11px;
  color: var(--color-text-primary);
}

.affected-files-empty {
  color: var(--color-text-secondary);
  text-align: center;
  padding: 12px;
}

.affected-files-list {
  font-family: 'Courier New', monospace;
  line-height: 1.4;
}

.revision-group {
  margin-bottom: 4px;
}

.revision-header {
  color: var(--color-text-secondary);
  padding: 4px 0;
  font-size: 10px;
  font-weight: 600;
}

.file-line {
  padding: 2px 0;
  display: flex;
  gap: 4px;
  word-break: break-all;
}

.file-status {
  display: inline-block;
  width: 12px;
  flex-shrink: 0;
  font-weight: 600;
}

.file-path {
  flex: 1;
  overflow-wrap: break-word;
}

/* 根据操作类型着色 */
.file-line.status-D {
  color: #ef4444;
}

.file-line.status-D .file-status {
  color: #dc2626;
}

.file-line.status-U {
  color: #eab308;
}

.file-line.status-U .file-status {
  color: #ca8a04;
}

.file-line.status-A {
  color: #22c55e;
}

.file-line.status-A .file-status {
  color: #16a34a;
}

.file-line.status-M {
  color: #3b82f6;
}

.file-line.status-M .file-status {
  color: #1d4ed8;
}

/* Clickable file diff */
.file-line.can-view-diff {
  cursor: pointer;
  border-radius: 2px;
  padding: 2px 4px;
  margin: 0 -4px;
}

.file-line.can-view-diff:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
}

/* Directory style - not clickable */
.file-line.is-directory {
  cursor: default;
  opacity: 0.7;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.checkbox-label input[type='checkbox'] {
  cursor: pointer;
}

.target-repos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
  padding: 16px;
}

.target-repos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  padding: 16px;
}

.target-repo-panel {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-primary);
  overflow: hidden;
  transition: all 150ms ease;
}

.target-repo-panel:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(10, 132, 255, 0.1);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
  gap: 8px;
}

.panel-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.repo-checkbox {
  flex-shrink: 0;
  cursor: pointer;
  width: 18px;
  height: 18px;
}

.repo-alias {
  flex: 1;
  font-weight: 600;
  color: var(--color-text-primary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.update-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--color-border);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 120ms ease;
  font-size: 0;
}

.update-btn:hover:not(:disabled) {
  background: var(--el-color-primary);
  color: #ffffff;
  border-color: var(--el-color-primary);
}

.update-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.revert-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.update-btn svg {
  width: 16px;
  height: 16px;
}

.update-btn .is-spinning {
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

.panel-right {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 16px;
}

.panel-action-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.panel-action-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 2px;
  user-select: none;
}

/* 提交/冲突 激活样式 */
.update-btn.commit-active {
  background: var(--color-success);
  color: #ffffff;
  border-color: var(--color-success);
}

.revert-btn.conflict-active {
  background: #facc15; /* 黄色 */
  color: #1f2937;
  border-color: #f59e0b;
}

.revert-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--color-border);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 120ms ease;
  font-size: 0;
}

.revert-btn:hover {
  background: #ff9500;
  color: #ffffff;
  border-color: #ff9500;
}

.revert-btn svg {
  width: 16px;
  height: 16px;
}

.panel-body {
  padding: 12px 16px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.repo-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}

.merge-action {
  text-align: center;
  padding: 16px;
}

.results-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.result-item {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.result-item.is-success {
  border-color: var(--color-success);
  background: var(--color-success-transparent);
}

.result-item.is-error {
  border-color: var(--color-error);
  background: var(--color-error-transparent);
}

.result-header {
  width: 100%;
  padding: 12px;
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 500;
}

.result-header:hover {
  background: var(--color-background-hover);
}

.result-title {
  flex: 1;
  text-align: left;
}

.result-status {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--color-background-hover);
}

.result-item.is-success .result-status {
  color: var(--color-success);
}

.result-item.is-error .result-status {
  color: var(--color-error);
}

.result-details {
  padding: 12px;
  border-top: 1px solid var(--color-border);
  background: var(--color-background-primary);
}

.result-message {
  font-size: 13px;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.result-output {
  max-height: 200px;
  overflow-y: auto;
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 8px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
}

.result-output pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.is-success {
  color: var(--color-success);
}

.is-error {
  color: var(--color-error);
}
</style>

<style>
/* Global styles for tooltip - not scoped */
.commit-message-tooltip.el-popper.is-light {
  max-width: 400px !important;
  background-color: var(--color-background-secondary) !important;
  color: var(--color-text-primary) !important;
  border: 1px solid var(--color-border) !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
  white-space: pre-wrap !important;
  word-break: break-word !important;
  line-height: 1.5 !important;
}
</style>
