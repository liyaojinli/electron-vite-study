<script setup lang="ts">
type MenuItem = {
  id: string
  label: string
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
      <div class="app-menu-title">菜单</div>
      <button
        type="button"
        class="theme-toggle is-compact"
        :class="props.isDark ? 'is-dark' : ''"
        :aria-pressed="props.isDark"
        @click="handleToggleTheme"
      >
        <span class="theme-toggle-label">{{ props.isDark ? '深色' : '浅色' }}</span>
        <span class="theme-toggle-track">
          <span class="theme-toggle-thumb"></span>
        </span>
      </button>
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
        {{ item.label }}
      </button>
    </nav>
  </aside>
</template>
