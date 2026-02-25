<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import * as monaco from 'monaco-editor'
import { X } from 'lucide-vue-next'

interface Props {
  visible?: boolean
  repoPath?: string
  filePath?: string
  baseRevision?: number
  targetRevision?: number
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  repoPath: '',
  filePath: '',
  baseRevision: 0,
  targetRevision: 0
})

const emit = defineEmits<{
  close: []
}>()

const api = window.api
const isLoading = ref(false)
const error = ref<string>('')
const editorKey = ref(0)
const showEditor = ref(false)

// Editor refs - stored outside Vue reactivity
let diffEditorInstance: monaco.editor.IStandaloneDiffEditor | null = null
let originalModelInstance: monaco.editor.ITextModel | null = null
let modifiedModelInstance: monaco.editor.ITextModel | null = null

// Get current theme
const isDarkMode = (): boolean => {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

const getMonacoTheme = (): string => {
  return isDarkMode() ? 'vs-dark' : 'vs'
}

const getLanguageFromPath = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    vue: 'html',
    json: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    xml: 'xml',
    md: 'markdown',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    sh: 'shell',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml'
  }
  return map[ext || ''] || 'plaintext'
}

const destroyEditor = (): void => {
  if (originalModelInstance) {
    originalModelInstance.dispose()
    originalModelInstance = null
  }
  if (modifiedModelInstance) {
    modifiedModelInstance.dispose()
    modifiedModelInstance = null
  }
  if (diffEditorInstance) {
    diffEditorInstance.dispose()
    diffEditorInstance = null
  }
}

const initEditor = (
  container: HTMLElement,
  originalContent: string,
  modifiedContent: string,
  language: string
): void => {
  // Create models first
  originalModelInstance = monaco.editor.createModel(originalContent, language)
  modifiedModelInstance = monaco.editor.createModel(modifiedContent, language)

  // Create diff editor - fully read-only
  diffEditorInstance = monaco.editor.createDiffEditor(container, {
    readOnly: true,
    enableSplitViewResizing: true,
    renderSideBySide: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    lineNumbers: 'on',
    automaticLayout: true,
    originalEditable: false,
    theme: getMonacoTheme()
  })

  // Set model
  diffEditorInstance.setModel({
    original: originalModelInstance,
    modified: modifiedModelInstance
  })
}

// Theme observer
let themeObserver: MutationObserver | null = null

const setupThemeObserver = (): void => {
  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'data-theme' && diffEditorInstance) {
        monaco.editor.setTheme(getMonacoTheme())
      }
    }
  })
  themeObserver.observe(document.documentElement, { attributes: true })
}

const cleanupThemeObserver = (): void => {
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
}

const loadDiff = async (): Promise<void> => {
  if (!props.repoPath || !props.filePath || !props.baseRevision || !props.targetRevision) return

  isLoading.value = true
  error.value = ''
  showEditor.value = false
  editorKey.value++

  try {
    // Fetch both revision contents
    const [baseResult, targetResult] = await Promise.all([
      api
        .getSvnFileContent(props.repoPath, props.filePath, String(props.baseRevision))
        .catch(() => ({
          success: false,
          content: '',
          message: '基准版本文件不存在'
        })),
      api
        .getSvnFileContent(props.repoPath, props.filePath, String(props.targetRevision))
        .catch(() => ({
          success: false,
          content: '',
          message: '目标版本文件不存在'
        }))
    ])

    // Use empty string if file doesn't exist in that revision
    const baseContent = baseResult.success ? baseResult.content : ''
    const targetContent = targetResult.success ? targetResult.content : ''

    // If both sides failed, show error
    if (!baseResult.success && !targetResult.success) {
      throw new Error('无法获取两个版本的文件内容')
    }

    const language = getLanguageFromPath(props.filePath)

    // Show editor container
    showEditor.value = true

    // Wait for DOM to render
    await new Promise((resolve) => setTimeout(resolve, 50))

    const container = document.getElementById(`diff-editor-readonly-${editorKey.value}`)
    if (container) {
      initEditor(container, baseContent, targetContent, language)
      setupThemeObserver()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载差异失败'
  } finally {
    isLoading.value = false
  }
}

const handleClose = (): void => {
  cleanupThemeObserver()
  destroyEditor()
  showEditor.value = false
  emit('close')
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      loadDiff()
    } else {
      cleanupThemeObserver()
      destroyEditor()
      showEditor.value = false
    }
  }
)

onBeforeUnmount(() => {
  cleanupThemeObserver()
  destroyEditor()
})
</script>

<template>
  <div v-if="visible" class="diff-viewer-overlay">
    <div class="diff-viewer-container">
      <div class="diff-header">
        <div class="diff-title">
          <span class="title-text">版本差异查看</span>
          <span class="file-path">{{ filePath }}</span>
        </div>
        <button class="close-btn" @click="handleClose">
          <X :size="20" />
        </button>
      </div>

      <div class="diff-toolbar">
        <div class="toolbar-left">
          <span class="label">提交前 (r{{ baseRevision }})</span>
          <span class="separator">vs</span>
          <span class="label">提交后 (r{{ targetRevision }})</span>
        </div>
      </div>

      <div class="editor-wrapper">
        <div v-if="isLoading" class="loading-overlay">
          <div class="loading-spinner">加载中...</div>
        </div>
        <div v-if="error" class="error-message">{{ error }}</div>
        <div
          v-if="showEditor"
          :id="`diff-editor-readonly-${editorKey}`"
          :key="editorKey"
          class="editor-container"
        ></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-viewer-overlay {
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
}

.diff-viewer-container {
  width: 95vw;
  height: 90vh;
  background: var(--bg-primary, #ffffff);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary, #f5f5f5);
  flex-shrink: 0;
}

.diff-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-text {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-primary, #333);
}

.file-path {
  font-size: 13px;
  color: var(--text-secondary, #666);
  font-family: monospace;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary, #666);
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--bg-hover, rgba(0, 0, 0, 0.1));
  color: var(--text-primary, #333);
}

.diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary, #f5f5f5);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-left .label {
  font-size: 13px;
  color: var(--text-secondary, #666);
  font-family: monospace;
  background: var(--bg-tertiary, #e8e8e8);
  padding: 2px 8px;
  border-radius: 4px;
}

.toolbar-left .separator {
  color: var(--text-tertiary, #999);
  font-weight: bold;
}

.editor-wrapper {
  flex: 1;
  position: relative;
  min-height: 0;
}

.editor-container {
  width: 100%;
  height: 100%;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary, #ffffff);
  z-index: 10;
}

.loading-spinner {
  color: var(--text-secondary, #666);
  font-size: 14px;
}

.error-message {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #e53935;
  font-size: 14px;
  background: var(--bg-primary, #ffffff);
}
</style>
