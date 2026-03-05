<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import * as monaco from 'monaco-editor'
import { X } from 'lucide-vue-next'

interface Props {
  visible?: boolean
  repoPath?: string
  filePath?: string
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  repoPath: '',
  filePath: ''
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

  // Create diff editor with theme
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
  if (!props.repoPath || !props.filePath) return

  isLoading.value = true
  error.value = ''
  showEditor.value = false
  editorKey.value++

  try {
    // Try to fetch both local and remote content
    // If one side doesn't exist (added/deleted file), use empty string
    const [localResult, remoteResult] = await Promise.all([
      api.getSvnFileContent(props.repoPath, props.filePath).catch(() => ({
        success: false,
        content: '',
        message: '本地文件不存在'
      })),
      api.getSvnFileContent(props.repoPath, props.filePath, 'HEAD').catch(() => ({
        success: false,
        content: '',
        message: '服务端文件不存在'
      }))
    ])

    // Use empty string if file doesn't exist on either side
    const localContent = localResult.success ? localResult.content : ''
    const remoteContent = remoteResult.success ? remoteResult.content : ''

    // If both sides failed, show error
    if (!localResult.success && !remoteResult.success) {
      throw new Error('无法获取本地和服务端文件内容')
    }

    const language = getLanguageFromPath(props.filePath)

    // Show editor container
    showEditor.value = true

    // Wait for DOM to render
    await new Promise((resolve) => setTimeout(resolve, 50))

    const container = document.getElementById(`diff-editor-${editorKey.value}`)
    if (container) {
      initEditor(container, remoteContent, localContent, language)
      setupThemeObserver()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载文件失败'
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
          <span class="title-text">文件差异对比</span>
          <span class="file-path">{{ filePath }}</span>
        </div>
        <button class="close-btn" @click="handleClose">
          <X :size="20" />
        </button>
      </div>

      <div class="diff-toolbar">
        <div class="toolbar-left">
          <span class="label">服务端版本 (HEAD)</span>
          <span class="separator">vs</span>
          <span class="label">本地版本 (Working Copy)</span>
        </div>
      </div>

      <div class="editor-wrapper">
        <div v-if="isLoading" class="loading-overlay">
          <div class="loading-spinner">加载中...</div>
        </div>
        <div v-if="error" class="error-message">{{ error }}</div>
        <div
          v-if="showEditor"
          :id="`diff-editor-${editorKey}`"
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
  z-index: 10000;
}

.diff-viewer-container {
  background: var(--color-background-primary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  width: 95%;
  height: 90%;
  display: flex;
  flex-direction: column;
}

.diff-header {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.diff-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.file-path {
  font-size: 12px;
  color: var(--color-text-secondary);
  font-family: monospace;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-secondary);
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 120ms ease;
}

.close-btn:hover {
  background: var(--color-background-hover);
  color: var(--color-text-primary);
}

.diff-toolbar {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-background-secondary);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.label {
  color: var(--color-text-primary);
  font-weight: 500;
}

.separator {
  color: var(--color-text-secondary);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn {
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 120ms ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.btn-secondary {
  background: var(--color-background-primary);
  color: var(--color-text-primary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-background-hover);
}

.btn-success {
  background: var(--color-success);
  color: white;
  border-color: var(--color-success);
}

.btn-success:hover:not(:disabled) {
  background: #16a34a;
  border-color: #16a34a;
}

.editor-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-background-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.loading-spinner {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.error-message {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-error-transparent);
  color: var(--color-error);
  padding: 16px 24px;
  border-radius: 4px;
  font-size: 13px;
  z-index: 10;
}

.editor-container {
  width: 100%;
  height: 100%;
}
</style>
