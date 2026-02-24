<script setup lang="ts">
import { onMounted, ref, shallowRef, type Component, watch } from 'vue'
import AppMenu from './components/AppMenu.vue'
import RepositorySettings from './components/RepositorySettings.vue'
import LocalRepositorySettings from './components/LocalRepositorySettings.vue'
import BatchMerge from './components/BatchMerge.vue'

const menuItems = [
  { id: 'remote-repository', label: '远程仓库设置' },
  { id: 'local-repository', label: '本地仓库设置' },
  { id: 'batch-merge', label: '批量合并' }
]
const activeMenuId = ref(menuItems[0].id)
const isDark = ref(false)

const applyTheme = (dark: boolean): void => {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

const toggleTheme = (): void => {
  isDark.value = !isDark.value
}

const handleMenuSelect = (id: string): void => {
  activeMenuId.value = id
}

onMounted(() => {
  const stored = localStorage.getItem('theme')
  if (stored === 'dark' || stored === 'light') {
    isDark.value = stored === 'dark'
  } else {
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  applyTheme(isDark.value)
  watch(isDark, (value) => {
    applyTheme(value)
    localStorage.setItem('theme', value ? 'dark' : 'light')
  })
})
</script>

<template>
  <div class="app-shell flex min-h-screen">
    <AppMenu
      :items="menuItems"
      :active-id="activeMenuId"
      :is-dark="isDark"
      @select="handleMenuSelect"
      @toggle-theme="toggleTheme"
    />
    <main class="app-content flex flex-1 p-6">
      <div class="app-main">
        <RepositorySettings v-show="activeMenuId === 'remote-repository'" />
        <LocalRepositorySettings v-show="activeMenuId === 'local-repository'" />
        <BatchMerge v-show="activeMenuId === 'batch-merge'" />
      </div>
    </main>
  </div>
</template>
