<template>
  <div v-if="visible" class="merge-dialog-backdrop">
    <div class="merge-dialog">
      <div class="merge-dialog-header">
        <div class="merge-title">合并进度</div>
        <button class="close-btn" @click="$emit('close')">✕</button>
      </div>
      <div class="merge-dialog-body">
        <div v-if="results && results.length">
          <div v-for="result in results" :key="result.targetRepoName" class="result-panel">
            <div class="result-panel-title">
              {{ result.targetRepoName }}
              <span
                :class="[
                  'result-status',
                  result.success
                    ? result.files && result.files.some((f) => f.startsWith('C'))
                      ? 'conflict'
                      : 'success'
                    : 'error'
                ]"
              >
                {{
                  result.success
                    ? result.files && result.files.some((f) => f.startsWith('C'))
                      ? '合并冲突'
                      : '合并成功'
                    : '合并失败'
                }}
              </span>
            </div>
            <div class="result-panel-body">
              <div v-if="result.files && result.files.length">
                <div
                  v-for="file in result.files"
                  :key="file"
                  :class="[
                    'result-file',
                    file.startsWith('A') ? 'file-added' : '',
                    file.startsWith('U') ? 'file-updated' : '',
                    file.startsWith('D') ? 'file-deleted' : '',
                    file.startsWith('C') ? 'file-conflict' : ''
                  ]"
                >
                  {{ file }}
                </div>
              </div>
              <div v-else class="result-file-empty">无文件</div>
            </div>
          </div>
        </div>
        <div v-else class="result-file-empty">暂无合并结果</div>
      </div>
      <div class="merge-dialog-footer">
        <div class="status">
          <span v-if="isLoading">进行中…</span>
          <span v-else>就绪</span>
        </div>
        <button class="close-action" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface MergeResultPanel {
  targetRepoName: string
  success: boolean
  files: string[]
}

defineProps<{
  visible: boolean
  results: MergeResultPanel[]
  isLoading: boolean
}>()

defineEmits(['close'])
</script>

<style scoped>
.result-panel {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
}
.result-panel-title {
  font-weight: 600;
  font-size: 15px;
  padding: 10px 16px;
  background: var(--color-background-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.result-status.success {
  color: var(--color-success);
}
.result-status.error {
  color: var(--color-error);
}
.result-status.conflict {
  color: #eab308;
  font-weight: bold;
}
.result-panel-body {
  padding: 10px 16px;
}
.result-file {
  font-size: 11px;
  color: var(--color-text-primary);
  margin-bottom: 4px;
  font-family: monospace;
  /* 默认样式 */
}
.file-added {
  color: var(--color-success);
}
.file-updated {
  color: #eab308;
}
.file-deleted {
  color: #222;
  text-decoration: line-through;
}
.file-conflict {
  color: var(--color-error);
  text-decoration: underline;
}
.result-file-empty {
  color: var(--color-text-secondary);
  font-size: 11px;
  padding: 8px 0;
}
.merge-dialog-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2000;
}
.merge-dialog {
  width: 640px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--color-background-primary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}
.merge-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
}
.merge-title {
  font-weight: 700;
}
.close-btn {
  background: transparent;
  border: none;
  font-size: 14px;
  cursor: pointer;
}
.merge-dialog-body {
  padding: 12px 16px;
  height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.current-target {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.logs {
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  padding: 8px;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: var(--color-text-primary);
  overflow-y: auto;
  max-height: 44vh;
}
.log-line {
  white-space: pre-wrap;
}
.merge-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--color-border);
}
.status .success {
  color: var(--color-success);
}
.status .error {
  color: var(--color-error);
}
.close-action {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: var(--color-background-primary);
  cursor: pointer;
}
</style>
