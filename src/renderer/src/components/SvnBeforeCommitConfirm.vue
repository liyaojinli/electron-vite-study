<template>
  <div v-if="visible" class="confirm-dialog-backdrop">
    <div class="confirm-dialog">
      <div class="confirm-dialog-header">
        <div class="confirm-title">提交前确认</div>
        <button class="close-btn" @click="$emit('cancel')">✕</button>
      </div>

      <div class="confirm-dialog-body">
        <div v-if="repositoriesToCommit.length === 0" class="empty-state">没有可提交的仓库</div>
        <div v-else class="repos-list">
          <div v-for="repo in repositoriesToCommit" :key="repo.targetRepoPath" class="repo-section">
            <div class="repo-header">
              <input
                type="checkbox"
                class="repo-checkbox"
                :checked="confirmedRepos.has(repo.targetRepoPath)"
                :disabled="!canConfirmRepo(repo.targetRepoPath)"
                @change="toggleRepoConfirm(repo.targetRepoPath)"
              />
              <span class="repo-name">{{ repo.targetRepoName }}</span>
              <span class="file-count">({{ repo.files.length }} 文件)</span>
              <span v-if="!canConfirmRepo(repo.targetRepoPath)" class="warning-hint">
                请查看所有文件
              </span>
            </div>
            <div class="files-list">
              <a
                v-for="(file, idx) in repo.files"
                :key="idx"
                :class="['file-item', { viewed: isFileViewed(repo.targetRepoPath, file.path) }]"
                :title="file.path"
                @click.prevent="handleViewFileDiff(repo, file.path)"
              >
                <span :class="['file-status', `status-${file.status}`]">{{ file.status }}</span>
                <span class="file-path" :title="file.path">{{ file.path }}</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div class="confirm-dialog-footer">
        <div class="footer-info">
          已确认: {{ confirmedRepos.size }} / {{ repositoriesToCommit.length }}
        </div>
        <div class="footer-actions">
          <button
            class="confirm-btn"
            :disabled="confirmedRepos.size === 0"
            @click="handleConfirmCommit"
          >
            提交 ({{ confirmedRepos.size }})
          </button>
          <button class="cancel-btn" @click="$emit('cancel')">取消</button>
        </div>
      </div>
    </div>

    <!-- SVN Diff Viewer for reviewing changes -->
    <SvnDiffViewer
      :visible="diffViewerVisible"
      :repo-path="diffViewerRepoPath"
      :file-path="diffViewerFilePath"
      @close="handleDiffViewerClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import SvnDiffViewer from './SvnDiffViewer.vue'

interface FileWithStatus {
  path: string
  status: string
}

interface RepositoryToCommit {
  targetRepoName: string
  targetRepoPath: string
  files: FileWithStatus[]
}

interface Props {
  visible: boolean
  repositories: RepositoryToCommit[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  confirm: [confirmedRepoPaths: string[]]
  cancel: []
}>()

const confirmedRepos = ref<Set<string>>(new Set())
const viewedFiles = ref<Set<string>>(new Set()) // key: repoPath::filePath
const diffViewerVisible = ref(false)
const diffViewerRepoPath = ref('')
const diffViewerFilePath = ref('')

const repositoriesToCommit = computed(() => props.repositories)

const getFileKey = (repoPath: string, filePath: string): string => {
  return `${repoPath}::${filePath}`
}

const isFileViewed = (repoPath: string, filePath: string): boolean => {
  return viewedFiles.value.has(getFileKey(repoPath, filePath))
}

const canConfirmRepo = (repoPath: string): boolean => {
  const repo = repositoriesToCommit.value.find((r) => r.targetRepoPath === repoPath)
  if (!repo) return false
  
  // 检查该仓库的所有文件是否都被查看过
  return repo.files.every((file) => isFileViewed(repoPath, file.path))
}

const toggleRepoConfirm = (repoPath: string): void => {
  if (!canConfirmRepo(repoPath)) {
    return // 不允许确认未查看完的仓库
  }
  
  if (confirmedRepos.value.has(repoPath)) {
    confirmedRepos.value.delete(repoPath)
  } else {
    confirmedRepos.value.add(repoPath)
  }
}

const handleViewFileDiff = (repo: RepositoryToCommit, filePath: string): void => {
  diffViewerRepoPath.value = repo.targetRepoPath
  diffViewerFilePath.value = filePath
  diffViewerVisible.value = true
}

const handleDiffViewerClose = (): void => {
  // 记录该文件已被查看
  if (diffViewerRepoPath.value && diffViewerFilePath.value) {
    const key = getFileKey(diffViewerRepoPath.value, diffViewerFilePath.value)
    viewedFiles.value.add(key)
    
    // 如果该仓库所有文件都已查看，自动勾选
    if (canConfirmRepo(diffViewerRepoPath.value)) {
      confirmedRepos.value.add(diffViewerRepoPath.value)
    }
  }
  
  diffViewerVisible.value = false
}

const handleConfirmCommit = (): void => {
  const confirmedList = Array.from(confirmedRepos.value)
  emit('confirm', confirmedList)
}
</script>

<style scoped>
.confirm-dialog-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2500;
}

.confirm-dialog {
  width: 50vw;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.confirm-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.confirm-title {
  font-weight: 700;
  font-size: 15px;
}

.close-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  cursor: pointer;
}

.confirm-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.repos-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.repo-section {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.repo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
  user-select: none;
}

.repo-checkbox {
  cursor: pointer;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.repo-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.repo-name {
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
}

.file-count {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.warning-hint {
  font-size: 11px;
  color: var(--color-error);
  font-weight: 500;
}

.files-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--color-border-subtle);
  cursor: pointer;
  transition: background 0.15s ease;
  text-decoration: none;
  color: var(--color-text-primary);
  font-size: 11px;
  line-height: 1.3;
}

.file-item:hover {
  background: var(--color-background-hover);
  text-decoration: underline;
}

.file-item:last-child {
  border-bottom: none;
}

.file-item.viewed {
  opacity: 0.6;
}

.file-status {
  flex-shrink: 0;
  width: 14px;
  font-family: monospace;
  font-weight: 700;
  font-size: 11px;
  text-align: center;
}

.file-status.status-M {
  color: #0a84ff; /* 修改 - 蓝色 */
}

.file-status.status-A {
  color: #34c759; /* 新增 - 绿色 */
}

.file-status.status-D {
  color: #ff3b30; /* 删除 - 红色 */
}

.file-status.status-R {
  color: #ff9500; /* 替换 - 橙色 */
}

.file-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  min-width: 0;
}

.confirm-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.footer-info {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.confirm-btn {
  padding: 6px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: white;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.confirm-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}

.cancel-btn {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-primary);
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn:hover {
  background: var(--color-background-hover);
}
</style>
