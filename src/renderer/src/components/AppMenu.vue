<script setup lang="ts">
import { Cloud, HardDrive, GitMerge } from 'lucide-vue-next'

type MenuItem = {
  id: string
  label: string
  icon?: typeof Cloud
}

const props = defineProps<{ items: MenuItem[]; activeId?: string; isDark: boolean }>()
const emit = defineEmits<{
  (event: 'select', id: string): void
  (event: 'toggle-theme'): void
}>()

const handleSelect = (id: string): void => {
  emit('select', id)
}

const handleToggleTheme = (): void => {
  emit('toggle-theme')
}
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
  </aside>
</template>

<style scoped>
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

.app-menu-item-label {
  flex: 1;
  text-align: left;
}
</style>
