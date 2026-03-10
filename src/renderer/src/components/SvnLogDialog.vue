<script setup lang="ts">
import { ref, watch } from 'vue'
import { X, CheckCircle, AlertCircle } from 'lucide-vue-next'

interface Props {
  visible?: boolean
  title?: string
  isLoading?: boolean
  isSuccess?: boolean | null
  logs?: string[]
}

interface Emits {
  close: []
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  title: 'SVN 命令执行',
  isLoading: false,
  isSuccess: null,
  logs: () => []
})

defineEmits<Emits>()

const scrollContainer = ref<HTMLDivElement | null>(null)

// Auto-scroll to bottom when logs update
watch(
  () => props.logs?.length,
  () => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    }
  },
  { flush: 'post' }
)
</script>

<template>
  <div v-if="visible" class="svn-log-overlay" @click="$emit('close')">
    <div class="svn-log-dialog" @click.stop>
      <div class="dialog-header">
        <h2>{{ title }}</h2>
        <button type="button" class="close-btn" :disabled="isLoading" @click="$emit('close')">
          <X :size="20" />
        </button>
      </div>

      <div class="dialog-content">
        <div ref="scrollContainer" class="logs-container">
          <div v-if="logs.length === 0" class="logs-placeholder">
            {{ isLoading ? '等待命令执行...' : '暂无日志输出' }}
          </div>
          <div v-else class="logs-output">
            <div v-for="(log, index) in logs" :key="index" class="log-line">
              {{ log }}
            </div>
          </div>
        </div>

        <div class="dialog-status">
          <div v-if="isLoading" class="status status-loading">
            <div class="spinner"></div>
            <span>执行中...</span>
          </div>
          <div v-else-if="isSuccess === true" class="status status-success">
            <CheckCircle :size="16" />
            <span>执行成功</span>
          </div>
          <div v-else-if="isSuccess === false" class="status status-error">
            <AlertCircle :size="16" />
            <span>执行失败</span>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button
          type="button"
          class="app-button is-primary"
          :disabled="isLoading"
          @click="$emit('close')"
        >
          {{ isLoading ? '执行中...' : '关闭' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.svn-log-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.svn-log-dialog {
  background: var(--color-background-primary);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 700px;
  height: 500px;
  color: var(--color-text-primary);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-secondary);
  border-radius: 12px 12px 0 0;
}

.dialog-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 120ms ease;
}

.close-btn:hover:not(:disabled) {
  color: var(--color-text-primary);
  background: rgba(10, 132, 255, 0.1);
  border-radius: 4px;
}

.close-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dialog-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.logs-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 11px;
  background: var(--color-background-primary);
  border: 1px solid var(--color-border);
  margin: 12px;
  border-radius: 6px;
  line-height: 1.5;
  min-height: 0;
}

.logs-placeholder {
  color: var(--color-text-secondary);
  text-align: center;
  padding: 20px;
}

.logs-output {
  color: var(--color-text-primary);
}

.log-line {
  word-break: break-word;
  white-space: pre-wrap;
  margin: 0;
  padding: 0 4px;
}

.log-line:hover {
  background-color: rgba(10, 132, 255, 0.05);
}

.dialog-status {
  padding: 0 12px 12px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  padding: 8px 12px;
  border-radius: 6px;
}

.status-loading {
  color: var(--el-color-primary);
  background: rgba(10, 132, 255, 0.1);
}

.status-success {
  color: var(--el-color-success);
  background: rgba(52, 199, 89, 0.1);
}

.status-error {
  color: var(--el-color-danger);
  background: rgba(255, 59, 48, 0.1);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(10, 132, 255, 0.3);
  border-top-color: var(--el-color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.dialog-footer {
  padding: 16px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  background: var(--color-background-secondary);
  border-radius: 0 0 12px 12px;
}

.dialog-footer .app-button {
  padding: 8px 16px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
}

.dialog-footer .app-button:hover:not(:disabled) {
  background: var(--color-background-secondary);
}

.dialog-footer .app-button.is-primary {
  background: var(--el-color-primary);
  color: #ffffff;
  border-color: var(--el-color-primary);
}

.dialog-footer .app-button.is-primary:hover:not(:disabled) {
  opacity: 0.9;
}
</style>
