<script setup lang="ts">
import { ref, watch, onBeforeUnmount, computed } from 'vue'
import * as monaco from 'monaco-editor'
import { X, Download, HardDrive, RotateCcw, CheckCircle } from 'lucide-vue-next'

interface ConflictBlock {
  startLine: number
  localStartLine: number
  localEndLine: number
  baseStartLine: number | null
  baseEndLine: number | null
  serverStartLine: number
  serverEndLine: number
  endLine: number
}

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
  resolved: []
}>()

const api = window.api
const isLoading = ref(false)
const error = ref('')
const editorKey = ref(0)
const showEditors = ref(false)
const originalWorkingContent = ref('')
const conflictBlocks = ref<ConflictBlock[]>([])
const activeConflictIndex = ref(0)
const conflictDecorations = ref<string[]>([])

const actionsDisabled = computed(() => isLoading.value || !props.repoPath || !props.filePath)
const conflictCount = computed(() => conflictBlocks.value.length)
const hasConflictBlocks = computed(() => conflictCount.value > 0)
const resolveDisabled = computed(() => actionsDisabled.value || hasConflictBlocks.value)

let diffEditorInstance: monaco.editor.IStandaloneDiffEditor | null = null
let leftModelInstance: monaco.editor.ITextModel | null = null
let rightModelInstance: monaco.editor.ITextModel | null = null
let workingEditorInstance: monaco.editor.IStandaloneCodeEditor | null = null
let workingModelInstance: monaco.editor.ITextModel | null = null
let workingModelSubscription: monaco.IDisposable | null = null

let themeObserver: MutationObserver | null = null

const isDarkMode = (): boolean => {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

const getMonacoTheme = (): string => {
  return isDarkMode() ? 'vs-dark' : 'vs'
}

const getLanguageFromPath = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase()
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

const destroyEditors = (): void => {
  if (leftModelInstance) {
    leftModelInstance.dispose()
    leftModelInstance = null
  }
  if (rightModelInstance) {
    rightModelInstance.dispose()
    rightModelInstance = null
  }
  if (workingModelInstance) {
    workingModelInstance.dispose()
    workingModelInstance = null
  }
  if (diffEditorInstance) {
    diffEditorInstance.dispose()
    diffEditorInstance = null
  }
  if (workingEditorInstance) {
    workingEditorInstance.dispose()
    workingEditorInstance = null
  }
  if (workingModelSubscription) {
    workingModelSubscription.dispose()
    workingModelSubscription = null
  }
  conflictDecorations.value = []
  conflictBlocks.value = []
  activeConflictIndex.value = 0
}

const parseConflictBlocks = (content: string): ConflictBlock[] => {
  const lines = content.split('\n')
  const blocks: ConflictBlock[] = []

  let i = 0
  while (i < lines.length) {
    if (!lines[i].startsWith('<<<<<<<')) {
      i++
      continue
    }

    const startMarker = i + 1
    let baseMarker: number | null = null
    let separator = -1
    let endMarker = -1

    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].startsWith('|||||||') && separator === -1) {
        baseMarker = j + 1
      } else if (lines[j].startsWith('=======') && separator === -1) {
        separator = j + 1
      } else if (lines[j].startsWith('>>>>>>>')) {
        endMarker = j + 1
        break
      }
    }

    if (separator === -1 || endMarker === -1) {
      i++
      continue
    }

    const localEnd = (baseMarker ?? separator) - 1
    const localStart = startMarker + 1
    const baseStart = baseMarker ? baseMarker + 1 : null
    const baseEnd = baseMarker ? separator - 1 : null
    const serverStart = separator + 1
    const serverEnd = endMarker - 1

    blocks.push({
      startLine: startMarker,
      localStartLine: localStart,
      localEndLine: localEnd,
      baseStartLine: baseStart,
      baseEndLine: baseEnd,
      serverStartLine: serverStart,
      serverEndLine: serverEnd,
      endLine: endMarker
    })

    i = endMarker
  }

  return blocks
}

const syncConflictBlocksFromModel = (): void => {
  if (!workingModelInstance) return
  const blocks = parseConflictBlocks(workingModelInstance.getValue())
  conflictBlocks.value = blocks

  if (blocks.length === 0) {
    activeConflictIndex.value = 0
  } else if (activeConflictIndex.value >= blocks.length) {
    activeConflictIndex.value = blocks.length - 1
  }

  const decorations: monaco.editor.IModelDeltaDecoration[] = blocks.map((block, index) => ({
    range: new monaco.Range(block.startLine, 1, block.endLine, 1),
    options: {
      isWholeLine: true,
      linesDecorationsClassName:
        index === activeConflictIndex.value ? 'conflict-glyph-active' : 'conflict-glyph',
      className: index === activeConflictIndex.value ? 'conflict-block-active' : 'conflict-block'
    }
  }))

  conflictDecorations.value = workingModelInstance.deltaDecorations(
    conflictDecorations.value,
    decorations
  )
}

const focusActiveConflict = (): void => {
  if (!workingEditorInstance || !hasConflictBlocks.value) return
  const block = conflictBlocks.value[activeConflictIndex.value]
  workingEditorInstance.revealLineInCenter(block.startLine)
  workingEditorInstance.setSelection(new monaco.Range(block.startLine, 1, block.endLine, 1))
  syncConflictBlocksFromModel()
}

const gotoPrevConflict = (): void => {
  if (!hasConflictBlocks.value) return
  activeConflictIndex.value =
    activeConflictIndex.value === 0
      ? conflictBlocks.value.length - 1
      : activeConflictIndex.value - 1
  focusActiveConflict()
}

const gotoNextConflict = (): void => {
  if (!hasConflictBlocks.value) return
  activeConflictIndex.value = (activeConflictIndex.value + 1) % conflictBlocks.value.length
  focusActiveConflict()
}

const setupThemeObserver = (): void => {
  themeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.attributeName === 'data-theme') {
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

const initEditors = (
  diffContainer: HTMLElement,
  workingContainer: HTMLElement,
  localContent: string,
  serverContent: string,
  workingContent: string,
  language: string
): void => {
  leftModelInstance = monaco.editor.createModel(localContent, language)
  rightModelInstance = monaco.editor.createModel(serverContent, language)

  diffEditorInstance = monaco.editor.createDiffEditor(diffContainer, {
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

  diffEditorInstance.setModel({
    original: leftModelInstance,
    modified: rightModelInstance
  })

  workingModelInstance = monaco.editor.createModel(workingContent, language)
  workingEditorInstance = monaco.editor.create(workingContainer, {
    model: workingModelInstance,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 13,
    lineNumbers: 'on',
    automaticLayout: true,
    theme: getMonacoTheme()
  })

  workingModelSubscription = workingModelInstance.onDidChangeContent(() => {
    syncConflictBlocksFromModel()
  })

  syncConflictBlocksFromModel()
}

const loadConflictData = async (): Promise<void> => {
  if (!props.repoPath || !props.filePath) return

  isLoading.value = true
  error.value = ''
  showEditors.value = false
  editorKey.value++

  try {
    const result = await api.getSvnConflictTempContents(props.repoPath, props.filePath)
    if (!result.success) {
      error.value = result.message
      return
    }

    // 保存 working 内容用于重置
    originalWorkingContent.value = result.workingContent

    // 读取当前实际文件内容用于底部编辑器
    const currentFileResult = await api.getSvnFileContent(props.repoPath, props.filePath)
    if (!currentFileResult.success) {
      error.value = `读取当前文件失败: ${currentFileResult.message}`
      return
    }

    const language = getLanguageFromPath(props.filePath)
    showEditors.value = true

    await new Promise((resolve) => setTimeout(resolve, 50))

    const diffContainer = document.getElementById(`conflict-diff-editor-${editorKey.value}`)
    const workingContainer = document.getElementById(`conflict-working-editor-${editorKey.value}`)

    if (diffContainer && workingContainer) {
      initEditors(
        diffContainer,
        workingContainer,
        result.localContent,
        result.serverContent,
        currentFileResult.content,
        language
      )
      setupThemeObserver()
      focusActiveConflict()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载冲突数据失败'
  } finally {
    isLoading.value = false
  }
}

const applyServer = (): void => {
  if (!workingModelInstance || !rightModelInstance) return
  // 只更新编辑器显示，不保存到文件（保存延迟到"标记为解决"时）
  const serverContent = rightModelInstance.getValue()
  workingModelInstance.setValue(serverContent)
}

const applyLocal = async (): Promise<void> => {
  if (!props.repoPath || !props.filePath || !workingModelInstance) return
  isLoading.value = true
  error.value = ''
  try {
    // 读取 working 文件内容并写入编辑器
    const result = await api.getSvnConflictTempContents(props.repoPath, props.filePath)
    if (!result.success) {
      error.value = result.message
      return
    }
    workingModelInstance.setValue(result.workingContent)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取本地版本失败'
  } finally {
    isLoading.value = false
  }
}

const resetWorking = async (): Promise<void> => {
  if (!props.repoPath || !props.filePath || !workingModelInstance) return
  isLoading.value = true
  error.value = ''
  try {
    // 读取当前文件的实际内容
    const fileResult = await api.getSvnFileContent(props.repoPath, props.filePath)
    if (!fileResult.success) {
      error.value = fileResult.message
      return
    }
    // 更新编辑器显示为当前文件的内容
    workingModelInstance.setValue(fileResult.content)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '重置失败'
  } finally {
    isLoading.value = false
  }
}

const resolveConflict = async (): Promise<void> => {
  if (!props.repoPath || !props.filePath || !workingModelInstance) return
  isLoading.value = true
  error.value = ''
  try {
    const workingContent = workingModelInstance.getValue()
    const result = await api.resolveSvnConflictUsingWorking(
      props.repoPath,
      props.filePath,
      workingContent
    )

    if (!result.success) {
      error.value = result.message
      return
    }

    emit('resolved')
    emit('close')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '标记冲突解决失败'
  } finally {
    isLoading.value = false
  }
}

const handleClose = (): void => {
  cleanupThemeObserver()
  destroyEditors()
  showEditors.value = false
  emit('close')
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      loadConflictData()
    } else {
      cleanupThemeObserver()
      destroyEditors()
      showEditors.value = false
    }
  }
)

onBeforeUnmount(() => {
  cleanupThemeObserver()
  destroyEditors()
})
</script>

<template>
  <div v-if="visible" class="conflict-overlay">
    <div class="conflict-container">
      <div class="conflict-header">
        <div class="conflict-title">
          <span class="title-text">冲突合并</span>
          <span class="file-path" :title="filePath">{{ filePath }}</span>
        </div>
        <button class="close-btn" @click="handleClose">
          <X :size="20" />
        </button>
      </div>

      <div class="toolbar">
        <div class="toolbar-left">
          <span class="label">服务端修改前版本 (merge-left)</span>
          <span class="separator">vs</span>
          <span class="label">服务端修改后版本 (merge-right)</span>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-secondary" :disabled="actionsDisabled" @click="applyServer">
            <Download :size="14" />
            接受服务端版本
          </button>
          <button class="btn btn-secondary" :disabled="actionsDisabled" @click="applyLocal">
            <HardDrive :size="14" />
            接受本地版本
          </button>
          <button class="btn btn-secondary" :disabled="actionsDisabled" @click="resetWorking">
            <RotateCcw :size="14" />
            重置
          </button>
          <button class="btn btn-success" :disabled="resolveDisabled" @click="resolveConflict">
            <CheckCircle :size="14" />
            标记为解决
          </button>
        </div>
      </div>

      <div class="merge-assist-bar">
        <div class="assist-left">
          <span v-if="hasConflictBlocks" class="assist-count">
            冲突 {{ activeConflictIndex + 1 }} / {{ conflictCount }}
          </span>
          <span v-else class="assist-count">未检测到冲突标记</span>
        </div>
        <div class="assist-right">
          <button
            class="btn btn-secondary"
            :disabled="!hasConflictBlocks"
            @click="gotoPrevConflict"
          >
            上一处
          </button>
          <button
            class="btn btn-secondary"
            :disabled="!hasConflictBlocks"
            @click="gotoNextConflict"
          >
            下一处
          </button>
        </div>
      </div>

      <div class="content-wrapper">
        <div v-if="isLoading" class="loading-overlay">
          <div class="loading-spinner">加载中...</div>
        </div>
        <div v-if="error" class="error-message">{{ error }}</div>

        <template v-if="showEditors">
          <div
            :id="`conflict-diff-editor-${editorKey}`"
            :key="`diff-${editorKey}`"
            class="diff-pane"
          ></div>

          <div class="working-title">最终合并结果 (当前文件)</div>
          <div
            :id="`conflict-working-editor-${editorKey}`"
            :key="`working-${editorKey}`"
            class="working-pane"
          ></div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conflict-overlay {
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

.conflict-container {
  background: var(--color-background-primary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  width: 96%;
  height: 92%;
  display: flex;
  flex-direction: column;
}

.conflict-header {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.conflict-title {
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

.toolbar {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--color-background-secondary);
}

.merge-assist-bar {
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--color-background-primary);
}

.assist-left {
  display: inline-flex;
  align-items: center;
}

.assist-count {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.assist-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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

.content-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-rows: 1fr auto 1fr;
}

.diff-pane {
  min-height: 0;
}

.working-title {
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  font-size: 12px;
  font-weight: 500;
  padding: 8px 12px;
}

.working-pane {
  min-height: 0;
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
  z-index: 12;
}

:deep(.conflict-block) {
  background-color: rgba(245, 158, 11, 0.08);
}

:deep(.conflict-block-active) {
  background-color: rgba(245, 158, 11, 0.16);
}

:deep(.conflict-glyph) {
  border-left: 3px solid #f59e0b;
}

:deep(.conflict-glyph-active) {
  border-left: 3px solid #ef4444;
}
</style>
