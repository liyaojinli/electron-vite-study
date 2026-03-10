<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { File, Folder, Search, X, XCircle } from 'lucide-vue-next'
import { arraysEqual } from '../utils/util'

interface SvnLogEntry {
  revision: number
  author: string
  date: string
  message: string
}

interface AffectedFileGroup {
  revision: number
  files: Array<{ status: string; path: string }>
}

interface AffectedFilePathGroup {
  path: string
  files: Array<{ status: string; path: string }>
}

interface Props {
  visible: boolean
  repoUrl: string
  title?: string
  limit?: number
  embedded?: boolean
  allowFileDiff?: boolean
  selectedRevisions?: number[]
}

const props = withDefaults(defineProps<Props>(), {
  title: '远程 SVN 日志',
  limit: 100,
  embedded: false,
  allowFileDiff: false,
  selectedRevisions: () => []
})

const emit = defineEmits<{
  close: []
  'update:selectedRevisions': [revisions: number[]]
  'view-file-diff': [payload: { file: { status: string; path: string }; revision: number }]
}>()

const tableRef = ref()
const logs = ref<SvnLogEntry[]>([])
const affectedFiles = ref<AffectedFileGroup[]>([])
const selectedRevisions = ref<number[]>([...props.selectedRevisions])
const isLogLoading = ref(false)
const isFilesLoading = ref(false)
const searchKeyword = ref('')
const startDate = ref('')
const endDate = ref('')

const hasRepoUrl = computed(() => Boolean(props.repoUrl))

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
  if (tableRef.value) {
    tableRef.value.clearSelection()
    tableRef.value.setCurrentRow?.(undefined)
  }
}

const loadLogs = async (): Promise<void> => {
  if (!props.repoUrl) return

  isLogLoading.value = true
  try {
    logs.value = await window.api.getSvnLog(
      props.repoUrl,
      props.limit,
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
  console.log('[SvnRemoteLogViewer] loadAffectedFiles called with:', {
    repoUrl: props.repoUrl,
    selectedRevisions: selectedRevisions.value
  })
  if (!props.repoUrl || selectedRevisions.value.length === 0) {
    console.log('[SvnRemoteLogViewer] Early return: empty repo or revisions')
    affectedFiles.value = []
    return
  }

  isFilesLoading.value = true
  try {
    // Convert to plain array to avoid IPC serialization issues with Vue reactive proxies
    const plainRevisions = [...selectedRevisions.value]
    affectedFiles.value = await window.api.getSvnChangedFiles(props.repoUrl, plainRevisions)
    console.log('[SvnRemoteLogViewer] getSvnChangedFiles returned:', affectedFiles.value)
  } catch (error) {
    console.error('Failed to load affected files:', error)
    affectedFiles.value = []
  } finally {
    isFilesLoading.value = false
  }
}

const handleSelectionChange = (selection: SvnLogEntry[]): void => {
  const revisions = selection.map((item) => item.revision)
  console.log('[SvnRemoteLogViewer] handleSelectionChange called:', revisions)
  selectedRevisions.value = revisions
}

const handleRowClick = (row: SvnLogEntry): void => {
  tableRef.value?.toggleRowSelection?.(row)
}

const canShowAffectedFileDiff = (file: { status: string; path: string }): boolean => {
  return isFilePath(file.path)
}

const isFilePath = (path: string): boolean => {
  if (path.endsWith('/') || path.endsWith('\\')) return false
  const separator = path.includes('\\') ? '\\' : '/'
  const fileName = path.split(separator).pop() || ''
  return /\.[^./\\]+$/.test(fileName)
}

const getParentPath = (path: string): string => {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalized) return '/'
  const lastSlashIndex = normalized.lastIndexOf('/')
  if (lastSlashIndex <= 0) return '/'
  return normalized.slice(0, lastSlashIndex)
}

const getTopThreeLevelPath = (path: string): string => {
  const parentPath = getParentPath(path)
  const normalized = parentPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const hasLeadingSlash = normalized.startsWith('/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return '/'
  const topParts = parts.slice(0, 3)
  const groupedPath = topParts.join('/')
  return hasLeadingSlash ? `/${groupedPath}` : groupedPath
}

const groupAffectedFilesByPath = (
  files: Array<{ status: string; path: string }>
): AffectedFilePathGroup[] => {
  const grouped = new Map<string, Array<{ status: string; path: string }>>()

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

const getRelativePathForDisplay = (fullPath: string, groupPath: string): string => {
  const normalizedFullPath = fullPath.replace(/\\/g, '/')
  const normalizedGroupPath = groupPath.replace(/\\/g, '/').replace(/\/+$/, '')

  if (!normalizedGroupPath || normalizedGroupPath === '/') {
    return normalizedFullPath.replace(/^\/+/, '')
  }

  const prefix = `${normalizedGroupPath}/`
  if (normalizedFullPath.startsWith(prefix)) {
    return normalizedFullPath.slice(prefix.length)
  }

  return normalizedFullPath
}

const handleFileLineClick = (file: { status: string; path: string }, revision: number): void => {
  if (!props.allowFileDiff || !canShowAffectedFileDiff(file)) return
  emit('view-file-diff', { file, revision })
}

const clearSelections = (): void => {
  resetSelections()
}

watch(selectedRevisions, async () => {
  console.log('[SvnRemoteLogViewer] selectedRevisions watch triggered:', selectedRevisions.value)
  emit('update:selectedRevisions', [...selectedRevisions.value])
  await loadAffectedFiles()
})

watch(
  () => props.selectedRevisions,
  (value) => {
    const incoming = value || []
    if (!arraysEqual(incoming, selectedRevisions.value)) {
      selectedRevisions.value = [...incoming]
    }
  }
)

watch(
  () => [props.visible, props.repoUrl],
  async ([visible, repoUrl]) => {
    // 组件初始化或 repoUrl 变化时重新加载日志
    if (visible && repoUrl) {
      await loadLogs()
    }
  },
  { immediate: true }
)
</script>

<template>
  <div
    v-if="visible"
    :class="props.embedded ? 'remote-log-embedded' : 'remote-log-backdrop'"
    @click.self="!props.embedded && emit('close')"
  >
    <div class="remote-log-dialog" :class="{ 'is-embedded': props.embedded }">
      <div v-if="!props.embedded" class="remote-log-header">
        <div class="header-main">
          <div class="dialog-title">{{ title }}</div>
          <div class="dialog-subtitle">{{ repoUrl || '未提供远程仓库地址' }}</div>
        </div>
        <button type="button" class="dialog-close" aria-label="关闭" @click="emit('close')">
          <X :size="18" :stroke-width="2" />
        </button>
      </div>

      <div class="remote-log-content">
        <div class="remote-log-left">
          <div class="logs-toolbar">
            <button class="app-button btn-small" @click="clearSelections">
              <XCircle :size="14" />
            </button>
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="搜索(提交人/信息)"
              class="search-input"
              :disabled="!hasRepoUrl"
              @keyup.enter="loadLogs"
            />
            <input v-model="startDate" type="date" class="date-input" :disabled="!hasRepoUrl" />
            <span class="date-separator">至</span>
            <input v-model="endDate" type="date" class="date-input" :disabled="!hasRepoUrl" />
            <button
              class="app-button btn-small is-primary"
              :disabled="!hasRepoUrl"
              @click="loadLogs"
            >
              <Search :size="14" />
            </button>
          </div>

          <div class="logs-table-wrapper">
            <div v-if="!hasRepoUrl" class="empty-state">未提供可用远程仓库地址</div>
            <template v-else>
              <div v-if="isLogLoading" class="table-loading-overlay">
                <div class="loading-spinner">加载中...</div>
              </div>
              <el-table
                ref="tableRef"
                :data="logs"
                stripe
                border
                size="small"
                height="100%"
                style="width: 100%"
                class="compact-table"
                @selection-change="handleSelectionChange"
                @row-click="handleRowClick"
              >
                <el-table-column type="selection" width="40" align="center" />
                <el-table-column prop="revision" label="Revision" width="80" align="center">
                  <template #default="{ row }">
                    <span class="revision-tag">r{{ row.revision }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="message" label="提交信息" min-width="220">
                  <template #default="{ row }">
                    <el-tooltip
                      :content="row.message"
                      placement="right"
                      :show-after="300"
                      :disabled="!row.message"
                      :popper-style="{ zIndex: 4000 }"
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
            </template>
          </div>
        </div>

        <div class="remote-log-right">
          <div class="affected-title">影响文件</div>
          <div class="affected-content">
            <div v-if="selectedRevisions.length === 0" class="affected-empty">
              选择提交记录后显示
            </div>
            <div v-else-if="isFilesLoading" class="affected-empty">加载文件中...</div>
            <div v-else-if="affectedFiles.length === 0" class="affected-empty">无文件改动</div>
            <div v-else class="affected-list">
              <div v-for="group in affectedFiles" :key="group.revision" class="revision-group">
                <div class="revision-header">--- Revision {{ group.revision }} ---</div>
                <div
                  v-for="pathGroup in groupAffectedFilesByPath(group.files)"
                  :key="`${group.revision}-${pathGroup.path}`"
                  class="path-group"
                >
                  <div class="path-group-header">{{ pathGroup.path }}</div>
                  <div
                    v-for="file in pathGroup.files"
                    :key="`${group.revision}-${pathGroup.path}-${file.path}`"
                    class="file-line"
                    :class="{
                      'can-view-diff': props.allowFileDiff && canShowAffectedFileDiff(file),
                      'is-directory': !isFilePath(file.path)
                    }"
                    @click="handleFileLineClick(file, group.revision)"
                  >
                    <span class="file-kind-icon">
                      <File v-if="isFilePath(file.path)" :size="13" />
                      <Folder v-else :size="13" />
                    </span>
                    <span class="file-status">{{ file.status }}</span>
                    <el-tooltip
                      :content="file.path"
                      placement="right"
                      :show-after="300"
                      :disabled="!file.path"
                      :popper-style="{ zIndex: 4000 }"
                      popper-class="commit-message-tooltip"
                      effect="light"
                      :show-arrow="false"
                    >
                      <span class="file-path">
                        {{ getRelativePathForDisplay(file.path, pathGroup.path) }}
                      </span>
                    </el-tooltip>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.remote-log-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.35);
}

.remote-log-embedded {
  width: 100%;
}

.remote-log-dialog {
  width: min(1200px, 96vw);
  height: min(760px, 92vh);
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid var(--color-border);
  background: var(--color-background-primary);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.remote-log-dialog.is-embedded {
  width: 100%;
  height: min(620px, 70vh);
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.remote-log-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-secondary);
}

.header-main {
  min-width: 0;
}

.dialog-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.dialog-subtitle {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dialog-close {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-primary);
  color: var(--color-text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 120ms ease;
}

.dialog-close:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.remote-log-content {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(250px, 0.7fr);
}

.remote-log-left {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
}

.logs-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 54px;
  padding: 0 12px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-border);
}

.logs-table-wrapper {
  position: relative;
  min-height: 0;
  flex: 1;
  padding: 10px;
}

.table-loading-overlay {
  position: absolute;
  inset: 10px;
  background: rgba(255, 255, 255, 0.75);
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-spinner {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.revision-tag {
  color: var(--el-color-primary);
  font-weight: 600;
}

.message-cell {
  display: block;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-input,
.date-input {
  height: 30px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font-size: 12px;
}

.date-input {
  padding: 0 8px;
}
.date-separator {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.search-input {
  width: 220px;
  padding: 0 10px;
}
.app-button.btn-small {
  padding: 6px 12px;
  font-size: 13px;
}

.remote-log-right {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.affected-title {
  flex-shrink: 0;
  min-height: 54px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--color-border);
}

.affected-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
  font-size: 11px;
}

.affected-empty,
.empty-state {
  height: 100%;
  min-height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.affected-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: max-content;
}

.revision-group {
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  overflow: hidden;
  min-width: 100%;
  width: max-content;
}

.revision-header {
  padding: 8px 10px;
  font-family: inherit;
  font-size: 11px;
  color: var(--color-text-secondary);
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border-subtle);
}

.file-line {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text-primary);
}

.file-line.can-view-diff {
  cursor: pointer;
}

.file-line.can-view-diff:hover {
  background: var(--color-background-hover);
}

.file-line.is-directory {
  opacity: 0.9;
}

.file-line:not(:last-child) {
  border-bottom: 1px solid var(--color-border-subtle);
}

.path-group {
  padding: 6px 10px 8px 12px;
}

.path-group + .path-group {
  border-top: 1px dashed var(--color-border-subtle);
  margin-top: 4px;
  padding-top: 10px;
}

.path-group-header {
  padding: 2px 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.path-group .file-line {
  margin-left: 14px;
  padding-left: 8px;
  border-left: 1px solid var(--color-border-subtle);
}

.file-status {
  width: 16px;
  text-align: center;
  color: var(--el-color-primary);
  font-weight: 700;
}

.file-kind-icon {
  width: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
}

.file-line.is-directory .file-kind-icon {
  color: var(--el-color-warning);
}

.file-path {
  flex: 0 0 auto;
  min-width: max-content;
  white-space: nowrap;
}

@media (max-width: 980px) {
  .remote-log-dialog {
    width: 96vw;
    height: 94vh;
  }

  .remote-log-content {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 240px;
  }

  .remote-log-left {
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }

  .logs-toolbar {
    flex-wrap: wrap;
  }

  .search-input {
    width: 100%;
    min-width: 0;
  }
}
</style>

<style>
/* Tooltip popper is teleported to body; styles must be global (non-scoped). */
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
