<script setup lang="ts">
import Versions from './components/Versions.vue'

const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

const getSystemInfo = (): void => {
  window.electron.ipcRenderer.invoke('get-system-info').then((info) => {
    alert(`System Info:\n${JSON.stringify(info, null, 2)}`)
  })
}
</script>

<template>
  <img alt="logo" class="logo" src="./assets/electron.svg" />
  <div class="creator">Powered by electron-vite</div>
  <div class="text">
    Build an Electron app with
    <span class="vue">Vue</span>
    and
    <span class="ts">TypeScript</span>
  </div>
  <p class="tip">Please try pressing <code>F12</code> to open the devTool</p>
  <div class="actions">
    <div class="action">
      <a href="https://electron-vite.org/" target="_blank" rel="noreferrer">Documentation</a>
    </div>
    <div class="action">
      <a target="_blank" rel="noreferrer" @click="ipcHandle">Send IPC</a>
    </div>
    <div class="action">
      <a target="_blank" rel="noreferrer" @click="getSystemInfo">Get System Info</a>
    </div>
  </div>
  <Versions />
</template>
