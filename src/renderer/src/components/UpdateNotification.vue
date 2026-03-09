<template>
  <Transition name="slide-fade">
    <div
      v-if="showNotification"
      class="fixed bottom-4 right-4 max-w-sm bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
    >
      <!-- 进度条 -->
      <div
        v-if="updateInfo.status === 'downloading' && updateInfo.progress !== undefined"
        class="h-1 bg-blue-500 transition-all duration-300"
        :style="{ width: `${updateInfo.progress}%` }"
      />

      <div class="p-4">
        <!-- 头部 -->
        <div class="flex items-start justify-between mb-2">
          <div class="flex items-center gap-2">
            <div
              v-if="updateInfo.status === 'checking'"
              class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
            />
            <component :is="statusIcon" v-else :class="iconColorClass" :size="20" />
            <h3 class="font-semibold text-gray-900 dark:text-gray-100">
              {{ statusTitle }}
            </h3>
          </div>
          <button
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            @click="closeNotification"
          >
            <XIcon :size="18" />
          </button>
        </div>

        <!-- 内容 -->
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {{ statusMessage }}
        </p>

        <!-- 操作按钮 -->
        <div v-if="showActions" class="flex gap-2">
          <button
            v-if="updateInfo.status === 'available'"
            class="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded transition-colors"
            @click="handleDownload"
          >
            立即下载
          </button>
          <button
            v-if="updateInfo.status === 'downloaded'"
            class="flex-1 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded transition-colors"
            @click="handleInstall"
          >
            重启安装
          </button>
          <button
            v-if="updateInfo.status === 'available' || updateInfo.status === 'not-available'"
            class="px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded transition-colors"
            @click="closeNotification"
          >
            稍后提醒
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Download, CheckCircle, AlertCircle, Info, X as XIcon } from 'lucide-vue-next'

interface UpdateInfo {
  status: string
  version?: string
  progress?: number
  error?: string
}

const updateInfo = ref<UpdateInfo>({
  status: 'idle'
})

const showNotification = ref(false)
let unsubscribe: (() => void) | null = null

// 状态图标
const statusIcon = computed(() => {
  switch (updateInfo.value.status) {
    case 'available':
      return Download
    case 'downloaded':
      return CheckCircle
    case 'error':
      return AlertCircle
    case 'not-available':
      return Info
    default:
      return Info
  }
})

// 图标颜色
const iconColorClass = computed(() => {
  switch (updateInfo.value.status) {
    case 'available':
      return 'text-blue-500'
    case 'downloading':
      return 'text-blue-500'
    case 'downloaded':
      return 'text-green-500'
    case 'error':
      return 'text-red-500'
    case 'not-available':
      return 'text-gray-500'
    default:
      return 'text-gray-500'
  }
})

// 状态标题
const statusTitle = computed(() => {
  switch (updateInfo.value.status) {
    case 'checking':
      return '检查更新中'
    case 'available':
      return '发现新版本'
    case 'downloading':
      return '下载更新中'
    case 'downloaded':
      return '更新已就绪'
    case 'not-available':
      return '已是最新版本'
    case 'error':
      return '更新失败'
    default:
      return ''
  }
})

// 状态消息
const statusMessage = computed(() => {
  switch (updateInfo.value.status) {
    case 'checking':
      return '正在检查是否有新版本...'
    case 'available':
      return updateInfo.value.version
        ? `发现新版本 v${updateInfo.value.version}，点击下载更新`
        : '发现新版本可用'
    case 'downloading':
      return updateInfo.value.progress !== undefined
        ? `下载进度: ${updateInfo.value.progress}%`
        : '正在下载更新...'
    case 'downloaded':
      return '更新已下载完成，点击重启安装'
    case 'not-available':
      return '当前已是最新版本'
    case 'error':
      return updateInfo.value.error || '检查更新时发生错误'
    default:
      return ''
  }
})

// 是否显示操作按钮
const showActions = computed(() => {
  return ['available', 'downloaded', 'not-available'].includes(updateInfo.value.status)
})

// 关闭通知
const closeNotification = (): void => {
  showNotification.value = false
}

// 下载更新
const handleDownload = async (): Promise<void> => {
  try {
    await window.updater.downloadUpdate()
  } catch (error) {
    console.error('下载更新失败:', error)
  }
}

// 安装更新
const handleInstall = (): void => {
  window.updater.installUpdate()
}

// 处理更新状态变化
const handleUpdateStatus = (info: UpdateInfo): void => {
  updateInfo.value = info

  // 只在需要用户交互的状态下显示通知
  if (['available', 'downloading', 'downloaded', 'error', 'not-available'].includes(info.status)) {
    showNotification.value = true
  } else if (info.status === 'checking') {
    // 检查更新时不显示通知（静默检查）
    showNotification.value = false
  }

  // 自动隐藏某些状态的通知
  if (info.status === 'not-available') {
    setTimeout(() => {
      showNotification.value = false
    }, 3000)
  }
}

// 组件挂载时注册监听
onMounted(() => {
  if (window.updater) {
    unsubscribe = window.updater.onUpdateStatus(handleUpdateStatus)
  }
})

// 组件卸载时取消监听
onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})

// 暴露手动检查更新的方法
defineExpose({
  checkForUpdates: async () => {
    if (window.updater) {
      await window.updater.checkForUpdates()
    }
  }
})
</script>

<style scoped>
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
