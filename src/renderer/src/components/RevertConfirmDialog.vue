<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

interface FileItem {
  status: string
  path: string
}

const props = withDefaults(
  defineProps<{
    visible?: boolean
    repoUrl?: string
    files?: FileItem[]
  }>(),
  {
    visible: false,
    repoUrl: '',
    files: () => []
  }
)

const emit = defineEmits<{
  confirm: [selectedFiles: FileItem[]]
  cancel: []
  viewDiff: [file: FileItem]
}>()

const selectedFileKeys = ref<Set<string>>(new Set())

const statusLabels: { [key: string]: string } = {
  M: '已修改',
  A: '已添加',
  D: '已删除',
  R: '已替换',
  C: '冲突',
  X: '外部',
  '?': '未跟踪',
  '!': '丢失'
}

const statusColors: { [key: string]: string } = {
  M: '#ff9500',
  A: '#52c41a',
  D: '#ff4d4f',
  R: '#1890ff',
  C: '#faad14',
  X: '#722ed1',
  '?': '#999999',
  '!': '#999999'
}

// Watch files prop changes to reinitialize selection
watch(
  () => [props.visible, props.files.length],
  () => {
    if (props.visible && props.files.length > 0) {
      // Initialize all files as selected
      selectedFileKeys.value.clear()
      for (const file of props.files) {
        selectedFileKeys.value.add(`${file.status}:${file.path}`)
      }
    }
  },
  { immediate: true }
)

const filesByStatus = computed(() => {
  const grouped: { [key: string]: FileItem[] } = {}
  for (const file of props.files) {
    if (!grouped[file.status]) {
      grouped[file.status] = []
    }
    grouped[file.status].push(file)
  }
  return grouped
})

const statusSummary = computed(() => {
  const counts: { [key: string]: number } = {}
  for (const file of props.files) {
    counts[file.status] = (counts[file.status] || 0) + 1
  }
  return Object.entries(counts)
    .map(([status, count]) => `${status} (${statusLabels[status] || status}): ${count}`)
    .join(' | ')
})

const selectedCount = computed(() => selectedFileKeys.value.size)
const allSelected = computed(() => selectedFileKeys.value.size === props.files.length)
const someSelected = computed(
  () => selectedFileKeys.value.size > 0 && selectedFileKeys.value.size < props.files.length
)

const getFileKey = (file: FileItem): string => `${file.status}:${file.path}`

const isFileSelected = (file: FileItem): boolean => selectedFileKeys.value.has(getFileKey(file))

const getRelativePath = (filePath: string): string => {
  // Extract path after the repo URL
  const repoPath = props.repoUrl
  if (filePath.startsWith(repoPath)) {
    const relative = filePath.substring(repoPath.length)
    return relative.startsWith('/') ? relative.substring(1) : relative
  }
  return filePath
}

const toggleFileSelection = (file: FileItem): void => {
  const key = getFileKey(file)
  if (selectedFileKeys.value.has(key)) {
    selectedFileKeys.value.delete(key)
  } else {
    selectedFileKeys.value.add(key)
  }
}

const toggleAllSelection = (): void => {
  if (allSelected.value) {
    selectedFileKeys.value.clear()
  } else {
    selectedFileKeys.value.clear()
    for (const file of props.files) {
      selectedFileKeys.value.add(getFileKey(file))
    }
  }
}

const handleConfirm = (): void => {
  const selected = props.files.filter((file) => isFileSelected(file))
  emit('confirm', selected)
}

const handleCancel = (): void => {
  emit('cancel')
}

// Check if path is a directory (ends with / or has no extension)
const isDirectory = (filePath: string): boolean => {
  if (filePath.endsWith('/')) return true
  const fileName = filePath.split('/').pop() || ''
  return !fileName.includes('.')
}

// Check if file status is viewable (M: modified files only)
const canViewDiff = (file: FileItem): boolean => {
  // Directories cannot be viewed
  if (isDirectory(file.path)) return false
  // Only modified files can show meaningful diff
  // A (added), D (deleted) need special handling in diff viewer
  return ['M', 'A', 'D'].includes(file.status)
}

const getDiffTooltip = (file: FileItem): string => {
  if (isDirectory(file.path)) {
    return file.path + ' (目录不支持查看差异)'
  }
  if (!['M', 'A', 'D'].includes(file.status)) {
    return file.path + ' (此状态不支持查看差异)'
  }
  return file.path + ' (点击查看差异)'
}

const handleViewDiff = (file: FileItem, event: MouseEvent): void => {
  // Prevent checkbox toggle when clicking on file name
  event.stopPropagation()

  // Check if can view diff
  if (!canViewDiff(file)) {
    return
  }

  emit('viewDiff', file)
}
</script>

<template>
  <div v-if="visible" class="revert-dialog-overlay app-dialog-backdrop">
    <div class="revert-dialog-container app-dialog-shell">
      <div class="dialog-header app-dialog-header">
        <h3 class="dialog-title">确认恢复仓库</h3>
        <button class="dialog-close-btn app-dialog-close" @click="handleCancel">
          <X :size="18" />
        </button>
      </div>

      <div class="dialog-content">
        <div class="warning-box">
          <div class="warning-text">
            ⚠️ 此操作将恢复仓库中的所有更改，<span class="text-red">此操作不可撤销</span>。
          </div>
          <div class="repo-path">仓库: {{ repoUrl }}</div>
        </div>

        <div v-if="files.length > 0" class="files-section">
          <div class="section-header">
            <span class="section-title">将恢复的文件 ({{ files.length }} 个)</span>
            <span class="status-summary">{{ statusSummary }}</span>
          </div>

          <div class="toolbar">
            <button
              type="button"
              class="toggle-all-btn"
              :class="{ 'all-selected': allSelected, 'some-selected': someSelected }"
              @click="toggleAllSelection"
            >
              <input
                type="checkbox"
                :checked="allSelected"
                :indeterminate="someSelected"
                class="checkbox-input"
                readonly
              />
              <span>{{ allSelected ? '取消全选' : '全选' }}</span>
            </button>
            <span class="selected-count">已选: {{ selectedCount }} / {{ files.length }}</span>
          </div>

          <div class="files-container">
            <div v-for="(fileList, status) in filesByStatus" :key="status" class="status-group">
              <div class="status-header">
                <span
                  class="status-badge"
                  :style="{ backgroundColor: statusColors[status] || '#999' }"
                >
                  {{ status }}
                </span>
                <span class="status-label">{{ statusLabels[status] || status }}</span>
                <span class="status-count">({{ fileList.length }})</span>
              </div>
              <div class="file-list">
                <div
                  v-for="(file, index) in fileList"
                  :key="`${status}-${index}`"
                  class="file-item"
                  :class="{ 'is-selected': isFileSelected(file) }"
                  @click="toggleFileSelection(file)"
                >
                  <input
                    type="checkbox"
                    class="file-checkbox"
                    :checked="isFileSelected(file)"
                    @change.stop="toggleFileSelection(file)"
                  />
                  <span
                    class="file-path"
                    :class="{ 'can-view-diff': canViewDiff(file) }"
                    :title="getDiffTooltip(file)"
                    @click="handleViewDiff(file, $event)"
                    >{{ getRelativePath(file.path) }}</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="no-files-box">仓库中没有检测到任何修改。</div>
      </div>

      <div class="dialog-footer app-dialog-footer">
        <button class="btn-cancel app-action-secondary" type="button" @click="handleCancel">
          取消
        </button>
        <button
          class="btn-confirm app-action-primary"
          type="button"
          :disabled="selectedCount === 0"
          @click="handleConfirm"
        >
          确认恢复 ({{ selectedCount }})
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="css">
.revert-dialog-overlay {
  z-index: 9999;
}

.revert-dialog-container {
  border-radius: 8px;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15);
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
}

.dialog-header {
  padding: 16px;
}

.dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.dialog-close-btn {
  padding: 4px;
  border-radius: 4px;
}

.dialog-close-btn:hover {
  background: var(--color-background-hover);
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.warning-box {
  background: var(--color-warning-transparent);
  border: 1px solid var(--color-warning);
  border-radius: 6px;
  padding: 12px;
}

.warning-text {
  font-size: 13px;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.text-red {
  color: var(--color-error);
  font-weight: 500;
}

.repo-path {
  font-size: 12px;
  color: var(--color-text-secondary);
  word-break: break-all;
  font-family: monospace;
}

.files-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.section-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.status-summary {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: var(--color-background-secondary);
  border-radius: 4px;
}

.toggle-all-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--color-background-primary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--color-text-primary);
  transition: all 120ms ease;
}

.toggle-all-btn:hover {
  background: var(--color-background-hover);
  border-color: var(--color-text-secondary);
}

.toggle-all-btn.all-selected,
.toggle-all-btn.some-selected {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.checkbox-input {
  cursor: pointer;
  width: 14px;
  height: 14px;
  accent-color: var(--color-primary);
}

.selected-count {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-left: auto;
}

.files-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--color-background-secondary);
  border-radius: 6px;
  padding: 8px;
}

.status-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: var(--color-background-primary);
  border-radius: 4px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.status-label {
  font-size: 12px;
  color: var(--color-text-primary);
  font-weight: 500;
}

.status-count {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-left: auto;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.file-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);
  padding: 4px 6px;
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
  transition: all 80ms ease;
}

.file-item:hover {
  background: var(--color-background-hover);
  color: var(--color-text-primary);
}

.file-item.is-selected {
  background: var(--color-primary-transparent);
}

.file-checkbox {
  cursor: pointer;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  accent-color: var(--color-primary);
}

.file-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
  transition: color 80ms ease;
}

.file-path.can-view-diff {
  cursor: pointer;
}

.file-path.can-view-diff:hover {
  color: var(--color-primary);
  text-decoration: underline;
}

.no-files-box {
  text-align: center;
  padding: 20px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.dialog-footer {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel,
.btn-confirm {
  padding: 8px 16px;
  font-size: 13px;
}

.btn-cancel {
  border-radius: 4px;
}

.btn-cancel:hover {
  background: var(--color-background-hover);
}

.btn-confirm {
  background: var(--color-error);
  color: white;
  border-color: var(--color-error);
  border-radius: 4px;
}

.btn-confirm:hover:not(:disabled) {
  background: #f5222d;
  border-color: #f5222d;
}

.btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Scrollbar styling */
.dialog-content::-webkit-scrollbar {
  width: 6px;
}

.dialog-content::-webkit-scrollbar-track {
  background: var(--color-background-secondary);
  border-radius: 3px;
}

.dialog-content::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.dialog-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-secondary);
}
</style>
