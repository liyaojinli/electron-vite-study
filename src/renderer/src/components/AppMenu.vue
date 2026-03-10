<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Cloud, HardDrive, GitMerge, RefreshCw } from 'lucide-vue-next'
import type { UpdateInfo } from '../../../shared/update'

type MenuItem = {
  id: string
  label: string
  icon?: typeof Cloud
}

const props = defineProps<{ items: MenuItem[]; activeId?: string; isDark: boolean }>()
const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'toggle-theme'): void
  (event: 'check-update'): void
}>()

const appVersion = ref<string>('')
const showReleaseDialog = ref(false)
const updateInfo = ref<UpdateInfo | null>(null)
let unsubscribe: (() => void) | null = null

const handleSelect = (id: string): void => {
  emit('select', id)
}

const handleToggleTheme = (): void => {
  emit('toggle-theme')
}

const handleCheckUpdate = (): void => {
  emit('check-update')
}

const handleVersionClick = (): void => {
  if (updateInfo.value && updateInfo.value.releaseNotes) {
    showReleaseDialog.value = true
  }
}

const formatReleaseNotes = (notes: string): string => {
  if (!notes) return '暂无更新说明'
  
  return notes
    .replace(/^### (.+)$/gm, '<h3 class="font-semibold text-sm mb-1 mt-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="font-bold text-base mb-2 mt-3">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    .replace(/\n/g, '<br>')
    .replace(/(<li.*<\/li>)/g, '<ul class="list-disc space-y-1 my-2">$1</ul>')
}

onMounted(async () => {
  if (window.appApi) {
    appVersion.value = await window.appApi.getVersion()
  }
  
  // 监听更新状态
  if (window.updater) {
    unsubscribe = window.updater.onUpdateStatus((info: UpdateInfo) => {
      updateInfo.value = info
    })
  }
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>

<template>
  <aside class="app-menu w-56 shrink-0">
    <div class="app-menu-header">
      <el-switch
        :model-value="props.isDark"
        active-text="深色"
        inactive-text="浅色"
        @change="handleToggleTheme"
      />
    </div>
    <nav class="app-menu-list">
      <button
        v-for="item in props.items"
        :key="item.id"
        type="button"
        class="app-menu-item"
        :class="props.activeId === item.id ? 'is-active' : ''"
        @click="handleSelect(item.id)"
      >
        <Cloud v-if="item.id === 'remote-repository'" :size="16" :stroke-width="2" />
        <HardDrive v-else-if="item.id === 'local-repository'" :size="16" :stroke-width="2" />
        <GitMerge v-else-if="item.id === 'batch-merge'" :size="16" :stroke-width="2" />
        <span class="app-menu-item-label">{{ item.label }}</span>
      </button>
    </nav>
    <div class="app-menu-footer">
      <button
        type="button"
        class="app-menu-item app-menu-action"
        @click="handleCheckUpdate"
        title="检查应用更新"
      >
        <RefreshCw :size="16" :stroke-width="2" />
        <span class="app-menu-item-label">检查更新</span>
        <span 
          v-if="appVersion" 
          class="version-badge"
          :class="{ 'version-badge-clickable': updateInfo?.releaseNotes }"
          @click.stop="handleVersionClick"
          :title="updateInfo?.releaseNotes ? '点击查看更新说明' : ''"
        >
          v{{ appVersion }}
        </span>
      </button>
    </div>
    
    <!-- 更新说明对话框 -->
    <el-dialog
      v-model="showReleaseDialog"
      title="更新说明"
      width="500px"
      :append-to-body="true"
    >
      <div class="release-notes-content">
        <div v-if="updateInfo?.version" class="mb-3">
          <span class="text-sm text-gray-600 dark:text-gray-400">版本: </span>
          <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">v{{ updateInfo.version }}</span>
        </div>
        <div v-if="updateInfo?.releaseDate" class="mb-3">
          <span class="text-sm text-gray-600 dark:text-gray-400">发布日期: </span>
          <span class="text-sm text-gray-900 dark:text-gray-100">{{ updateInfo.releaseDate }}</span>
        </div>
        <!-- eslint-disable vue/no-v-html -->
        <div 
          class="release-notes text-sm text-gray-700 dark:text-gray-300"
          v-html="formatReleaseNotes(updateInfo?.releaseNotes || '')"
        />
        <!-- eslint-enable vue/no-v-html -->
      </div>
    </el-dialog>
  </aside>
</template>

<style scoped>
.app-menu {
  display: flex;
  flex-direction: column;
}

.app-menu-header {
  display: flex;
  justify-content: flex-start;
  padding: 12px;
  border-bottom: 1px solid var(--color-border);
}

.app-menu-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
}

.app-menu-footer {
  margin-top: auto;
  border-top: 1px solid var(--color-border);
}

.version-badge {
  font-size: 11px;
  color: var(--color-text-secondary);
  opacity: 0.6;
  margin-left: auto;
  padding-left: 8px;
  transition: opacity 0.2s;
}

.version-badge-clickable {
  cursor: pointer;
  opacity: 0.8;
}

.version-badge-clickable:hover {
  opacity: 1;
  color: var(--color-primary);
}

.release-notes-content {
  max-height: 60vh;
  overflow-y: auto;
}

.release-notes :deep(h2) {
  font-size: 0.9rem;
  font-weight: 600;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
}

.release-notes :deep(h3) {
  font-size: 0.8rem;
  font-weight: 500;
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
}

.release-notes :deep(ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin: 0.5rem 0;
}

.release-notes :deep(li) {
  margin: 0.25rem 0;
  line-height: 1.4;
}

.app-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  text-align: left;
  font-size: 13px;
  outline: none;
  transition: all 0.15s;
  border-left: 3px solid transparent;
}

.app-menu-item:hover {
  background: var(--color-background-hover);
}

.app-menu-item.is-active {
  background: var(--color-primary-transparent);
  color: var(--color-primary);
  border-left-color: var(--color-primary);
}

.app-menu-action {
  opacity: 0.8;
}

.app-menu-action:hover {
  opacity: 1;
}

.app-menu-item-label {
  flex: 1;
  text-align: left;
}
</style>
