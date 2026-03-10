<template>
  <div v-if="visible" class="log-viewer-backdrop app-dialog-backdrop">
    <div class="log-viewer app-dialog-shell">
      <div class="log-viewer-header app-dialog-header">
        <div class="log-title">SVN 提交日志</div>
        <button class="close-btn app-dialog-close" @click="$emit('close')">✕</button>
      </div>

      <div class="log-viewer-body">
        <div v-if="logs.length === 0" class="empty-state">暂无日志</div>
        <div v-else class="logs-list">
          <div v-for="(log, index) in logs" :key="index" class="log-entry">
            <div class="log-header">
              <span class="repo-name">{{ log.repoName }}</span>
              <span :class="['status-badge', log.success ? 'success' : 'error']">
                {{ log.success ? '成功' : '失败' }}
              </span>
            </div>
            <div class="log-section">
              <div class="section-title">执行命令:</div>
              <pre class="command-text">{{ log.command }}</pre>
            </div>
            <div class="log-section">
              <div class="section-title">输出:</div>
              <pre class="output-text">{{ log.output }}</pre>
            </div>
          </div>
        </div>
      </div>

      <div class="log-viewer-footer app-dialog-footer">
        <button class="app-action-secondary" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface SvnCommitLog {
  repoName: string
  command: string
  output: string
  success: boolean
}

interface Props {
  visible: boolean
  logs: SvnCommitLog[]
}

defineProps<Props>()

defineEmits<{
  close: []
}>()
</script>

<style scoped>
.log-viewer-backdrop {
  z-index: 3000;
}

.log-viewer {
  width: 70vw;
  max-height: 80vh;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.log-viewer-header {
  padding: 14px 18px;
  flex-shrink: 0;
  background: var(--color-background-secondary);
}

.log-title {
  font-weight: 700;
  font-size: 16px;
  color: var(--color-text-primary);
}

.close-btn {
  font-size: 18px;
  width: 28px;
  height: 28px;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--color-background-hover);
}

.log-viewer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.log-entry {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--color-background-secondary);
  border-bottom: 1px solid var(--color-border);
}

.repo-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-primary);
}

.status-badge {
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.success {
  background: var(--color-success-transparent);
  color: var(--color-success);
}

.status-badge.error {
  background: var(--color-error-transparent);
  color: var(--color-error);
}

.log-section {
  padding: 12px 14px;
}

.log-section:not(:last-child) {
  border-bottom: 1px solid var(--color-border-subtle);
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.command-text,
.output-text {
  margin: 0;
  padding: 10px;
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-primary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-viewer-footer {
  flex-shrink: 0;
}
</style>
