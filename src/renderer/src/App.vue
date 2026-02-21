<script setup lang="ts">
import renderutil from './renderutil'
import { Repository } from '../../shared/repository'

const getSystemInfo = async (): Promise<void> => {
  try {
    const info = await window.api.getSystemInfo()
    const message = `Platform: ${info.platform}\nArchitecture: ${info.arch}\nCPU: ${info.cpu}\nMemory: ${renderutil.formatBytes(info.memory)}`
    alert(message)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load system info.'
    alert(message)
  }
}

const saveRepository = async (): Promise<void> => {
  try {
    const repo = new Repository('https://example.com', 'username', 'password', 'alias')
    const result = await window.api.saveRepository(repo)
    alert(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save repository.'
    alert(message)
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-6">
    <button
      type="button"
      class="rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
      @click="getSystemInfo"
    >
      Get System Info
    </button>
    <button
      type="button"
      class="ml-4 rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
      @click="saveRepository"
    >
      Save Repository
    </button>
  </div>
</template>
