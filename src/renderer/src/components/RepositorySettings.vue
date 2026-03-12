<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Repository, type RepositoryData } from '../../../shared/repository'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Eye, EyeOff, Check, Trash2, ScrollText } from 'lucide-vue-next'
import SvnRemoteLogViewer from './SvnRemoteLogViewer.vue'
import SvnDiffViewerReadOnly from './SvnDiffViewerReadOnly.vue'
import { useRepositoryChangeNotifier } from '../composables/useRepositoryChangeNotifier'
import { useRepositoryRowKey } from '../composables/useStableRowKey'

const passwordVisibleIndices = ref(new Set<number>())
const repositories = ref<Repository[]>([])
const baselineData = ref<Array<RepositoryData | null>>([])
const newRows = ref(new Set<Repository>())
const getRowKey = useRepositoryRowKey<Repository>()
const notifyRepositoryChanged = useRepositoryChangeNotifier('remote')
const showRemoteLogViewer = ref(false)
const remoteLogRepoUrl = ref('')
const remoteLogTitle = ref('远程 SVN 日志')

// SVN Diff Viewer ReadOnly states (for revision diff)
const showDiffViewerReadOnly = ref(false)
const diffViewerReadOnlyRepoPath = ref<string>('')
const diffViewerReadOnlyFilePath = ref<string>('')
const diffViewerReadOnlyBaseRevision = ref<number>(0)
const diffViewerReadOnlyTargetRevision = ref<number>(0)

const resetPasswordVisibility = (): void => {
  passwordVisibleIndices.value = new Set()
}

const updateRepositories = (data: RepositoryData[]): void => {
  // 按照别名排序
  const sortedData = [...data].sort((a, b) => {
    return a.alias.localeCompare(b.alias, 'zh-CN')
  })
  repositories.value = sortedData.map((repo) => Repository.fromJSON(repo))
  baselineData.value = sortedData
  newRows.value = new Set()
  resetPasswordVisibility()
}

const loadRepositories = async (): Promise<void> => {
  try {
    const result = await window.api.listRepositories()
    updateRepositories(result)
  } catch (error) {
    console.error('Failed to load repositories:', error)
  }
}

const addRepositoryAfter = (index: number): void => {
  const repo = new Repository('', '', '', '', '')
  repositories.value.splice(index + 1, 0, repo)
  baselineData.value.splice(index + 1, 0, null)
  newRows.value.add(repo)
  resetPasswordVisibility()
}

const addFirstRepository = (): void => {
  const repo = new Repository('', '', '', '', '')
  repositories.value.splice(0, 0, repo)
  baselineData.value.splice(0, 0, null)
  newRows.value.add(repo)
  resetPasswordVisibility()
}

const saveRepository = async (index: number): Promise<void> => {
  try {
    const repo = repositories.value[index]
    const payload = repo.toJSON()

    // 检查远程地址是否重复
    const normalizedUrl = payload.url.trim().replace(/\/+$/, '') // 去除尾部斜杠
    const duplicateIndex = repositories.value.findIndex((r, i) => {
      if (i === index) return false // 排除当前行
      const existingUrl = r.url.trim().replace(/\/+$/, '')
      return existingUrl === normalizedUrl
    })

    if (duplicateIndex !== -1) {
      ElMessage.warning(
        `远程地址已存在于「${repositories.value[duplicateIndex].alias || '未命名'}」仓库中，不允许重复添加。`
      )
      return
    }

    const verifyResult = await window.api.verifyRepository(payload)
    if (!verifyResult.ok) {
      ElMessage.error(verifyResult.message || 'SVN 连接验证失败。')
      return
    }
    // 调用 API 保存，但不使用返回结果刷新整个列表
    if (newRows.value.has(repo)) {
      // 计算正确的插入位置：该行之前有多少条已保存的行
      const savedRowsBeforeIndex = repositories.value
        .slice(0, index)
        .filter((r) => !newRows.value.has(r)).length
      await window.api.insertRepository(savedRowsBeforeIndex, payload)
    } else {
      await window.api.updateRepositoryByIdentity(payload)
    }

    // 不要刷新整个列表，只更新当前行的 baseline 数据
    // 这样可以保留其他行正在编辑的数据
    baselineData.value[index] = payload
    if (newRows.value.has(repo)) {
      newRows.value.delete(repo)
    }
    notifyRepositoryChanged()
  } catch (error) {
    console.error('Failed to save repository:', error)
  }
}

const removeRepository = async (index: number): Promise<void> => {
  try {
    const repo = repositories.value[index]
    if (newRows.value.has(repo)) {
      // 新行，直接从列表中删除
      repositories.value.splice(index, 1)
      baselineData.value.splice(index, 1)
      newRows.value.delete(repo)
      resetPasswordVisibility()
      notifyRepositoryChanged()
    } else {
      // 已保存的行，按唯一身份删除（id 优先，url 兜底）
      await window.api.deleteRepositoryByIdentity({ id: repo.id, url: repo.url })
      // 不要刷新整个列表，只从当前列表中移除这一行
      repositories.value.splice(index, 1)
      baselineData.value.splice(index, 1)
      resetPasswordVisibility()
      notifyRepositoryChanged()
    }
  } catch (error) {
    console.error('Failed to remove repository:', error)
  }
}

const requestRemoveRepository = async (index: number): Promise<void> => {
  const repo = repositories.value[index]
  if (!repo) {
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除「${repo.alias || repo.url || '该仓库'}」吗？`,
      '确认删除远程仓库',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )

    const currentIndex = repositories.value.indexOf(repo)
    if (currentIndex === -1) {
      return
    }

    await removeRepository(currentIndex)
  } catch {
    // User cancelled.
  }
}

const togglePasswordVisibility = (index: number): void => {
  if (passwordVisibleIndices.value.has(index)) {
    passwordVisibleIndices.value.delete(index)
  } else {
    passwordVisibleIndices.value.add(index)
  }
}

const isDirty = (index: number): boolean => {
  const current = repositories.value[index]?.toJSON()
  const baseline = baselineData.value[index]
  if (!current || !baseline) {
    return true
  }
  return JSON.stringify(current) !== JSON.stringify(baseline)
}

const viewRemoteLogs = (repo: Repository): void => {
  if (!repo.url) {
    ElMessage.warning('请先填写远程仓库地址。')
    return
  }
  remoteLogRepoUrl.value = repo.url
  remoteLogTitle.value = `${repo.alias || repo.url} - 远程日志`
  showRemoteLogViewer.value = true
}

const handleViewFileDiff = (payload: {
  file: { status: string; path: string }
  revision: number
}): void => {
  diffViewerReadOnlyRepoPath.value = remoteLogRepoUrl.value
  diffViewerReadOnlyFilePath.value = payload.file.path
  diffViewerReadOnlyBaseRevision.value = payload.revision - 1
  diffViewerReadOnlyTargetRevision.value = payload.revision
  showDiffViewerReadOnly.value = true
}

const handleCloseDiffViewerReadOnly = (): void => {
  showDiffViewerReadOnly.value = false
  setTimeout(() => {
    diffViewerReadOnlyRepoPath.value = ''
    diffViewerReadOnlyFilePath.value = ''
    diffViewerReadOnlyBaseRevision.value = 0
    diffViewerReadOnlyTargetRevision.value = 0
  }, 300)
}

onMounted(() => {
  loadRepositories()
})
</script>

<template>
  <section class="app-panel">
    <div class="app-panel-header app-panel-header-row">
      <span class="app-panel-title">管理 SVN 远程仓库，支持添加、编辑和删除。</span>
    </div>
    <div class="app-panel-body">
      <div class="repo-table">
        <div class="repo-row repo-header">
          <div class="repo-cell">别名</div>
          <div class="repo-cell">地址</div>
          <div class="repo-cell">用户名</div>
          <div class="repo-cell">密码</div>
          <div class="repo-cell repo-cell-center">操作</div>
        </div>
        <div class="repo-rows">
          <div v-if="repositories.length === 0" class="repo-row repo-empty">
            <div class="repo-cell repo-empty-text">
              暂无仓库配置
              <button
                type="button"
                class="repo-button icon-only is-primary"
                aria-label="新增仓库"
                @click="addFirstRepository"
              >
                <Plus :size="18" :stroke-width="2" />
              </button>
            </div>
          </div>
          <div v-for="(repo, index) in repositories" :key="getRowKey(repo)" class="repo-row">
            <div class="repo-cell">
              <input v-model="repo.alias" class="app-input" type="text" placeholder="仓库别名" />
            </div>
            <div class="repo-cell">
              <input
                v-model="repo.url"
                class="app-input"
                type="text"
                placeholder="https://svn.example.com"
              />
            </div>
            <div class="repo-cell">
              <input v-model="repo.username" class="app-input" type="text" placeholder="username" />
            </div>
            <div class="repo-cell">
              <div class="app-input-group">
                <input
                  v-model="repo.password"
                  class="app-input"
                  :type="passwordVisibleIndices.has(index) ? 'text' : 'password'"
                  placeholder="••••••"
                />
                <button
                  type="button"
                  class="app-input-action icon-only"
                  :aria-label="passwordVisibleIndices.has(index) ? '隐藏密码' : '显示密码'"
                  @click="togglePasswordVisibility(index)"
                >
                  <Eye v-if="passwordVisibleIndices.has(index)" :size="18" :stroke-width="2" />
                  <EyeOff v-else :size="18" :stroke-width="2" />
                </button>
              </div>
            </div>
            <div class="repo-cell repo-cell-center">
              <div class="repo-actions">
                <button
                  type="button"
                  class="repo-button is-neutral icon-only"
                  aria-label="在下方新增"
                  @click="addRepositoryAfter(index)"
                >
                  <Plus :size="18" :stroke-width="2" />
                </button>
                <button
                  type="button"
                  class="repo-button is-primary icon-only"
                  aria-label="保存"
                  :disabled="!isDirty(index)"
                  @click="saveRepository(index)"
                >
                  <Check :size="18" :stroke-width="2" />
                </button>
                <button
                  type="button"
                  class="repo-button is-neutral icon-only"
                  aria-label="查看远程日志"
                  :disabled="!repo.url"
                  @click="viewRemoteLogs(repo)"
                >
                  <ScrollText :size="18" :stroke-width="2" />
                </button>
                <button
                  type="button"
                  class="repo-button is-danger icon-only"
                  aria-label="删除"
                  @click="requestRemoveRepository(index)"
                >
                  <Trash2 :size="18" :stroke-width="2" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SvnRemoteLogViewer
      :visible="showRemoteLogViewer"
      :repo-url="remoteLogRepoUrl"
      :title="remoteLogTitle"
      :allow-file-diff="true"
      @close="showRemoteLogViewer = false"
      @view-file-diff="handleViewFileDiff"
    />

    <SvnDiffViewerReadOnly
      :visible="showDiffViewerReadOnly"
      :repo-path="diffViewerReadOnlyRepoPath"
      :file-path="diffViewerReadOnlyFilePath"
      :base-revision="diffViewerReadOnlyBaseRevision"
      :target-revision="diffViewerReadOnlyTargetRevision"
      @close="handleCloseDiffViewerReadOnly"
    />

  </section>
</template>
