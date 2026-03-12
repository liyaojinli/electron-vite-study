<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Repository, type RepositoryData } from '../../../shared/repository'
import { Plus, Check, Trash2, FolderOpen, ScrollText } from 'lucide-vue-next'
import SvnRemoteLogViewer from './SvnRemoteLogViewer.vue'
import SvnDiffViewerReadOnly from './SvnDiffViewerReadOnly.vue'
import { useRepositoryChangeNotifier } from '../composables/useRepositoryChangeNotifier'
import { useRepositoryRowKey } from '../composables/useStableRowKey'

interface LocalAPI {
  listLocalRepositories(): Promise<RepositoryData[]>
  insertLocalRepository(index: number, repo: RepositoryData): Promise<RepositoryData[]>
  updateLocalRepositoryByIdentity(repo: RepositoryData): Promise<RepositoryData[]>
  deleteLocalRepositoryByIdentity(
    identity: Pick<RepositoryData, 'id' | 'url'>
  ): Promise<RepositoryData[]>
  verifyLocalRepository(repo: RepositoryData): Promise<{ ok: boolean; message?: string }>
  selectDirectory(): Promise<{ success: boolean; path?: string }>
  getSvnRemoteUrl(repoPath: string): Promise<{ success: boolean; url: string; message: string }>
}

const api = (window as unknown as { api: LocalAPI }).api
const repositories = ref<Repository[]>([])
const baselineData = ref<Array<RepositoryData | null>>([])
const newRows = ref(new Set<Repository>())
const getRowKey = useRepositoryRowKey<Repository>()
const notifyRepositoryChanged = useRepositoryChangeNotifier('local')
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
  // No password field for local repositories
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
    const result = await api.listLocalRepositories()
    updateRepositories(result)
  } catch (error) {
    console.error('Failed to load local repositories:', error)
  }
}

const addRepositoryAfter = (index: number): void => {
  const repo = new Repository('', '', '', '', '', true)
  repositories.value.splice(index + 1, 0, repo)
  baselineData.value.splice(index + 1, 0, null)
  newRows.value.add(repo)
  resetPasswordVisibility()
}

const addFirstRepository = (): void => {
  const repo = new Repository('', '', '', '', '', true)
  repositories.value.splice(0, 0, repo)
  baselineData.value.splice(0, 0, null)
  newRows.value.add(repo)
  resetPasswordVisibility()
}

const saveRepository = async (index: number): Promise<void> => {
  try {
    const repo = repositories.value[index]
    const payload = repo.toJSON()

    // 检查本地路径是否重复
    const normalizedPath = payload.url.trim().replace(/[\\/]+$/, '') // 去除尾部斜杠
    const duplicateIndex = repositories.value.findIndex((r, i) => {
      if (i === index) return false // 排除当前行
      const existingPath = r.url.trim().replace(/[\\/]+$/, '')
      return existingPath === normalizedPath
    })

    if (duplicateIndex !== -1) {
      alert(
        `本地路径已存在于「${repositories.value[duplicateIndex].alias || '未命名'}」仓库中，不允许重复添加。`
      )
      return
    }

    const verifyResult = await api.verifyLocalRepository(payload)
    if (!verifyResult.ok) {
      alert(verifyResult.message || '本地路径验证失败。')
      return
    }
    // 调用 API 保存，但不使用返回结果刷新整个列表
    if (newRows.value.has(repo)) {
      // 计算正确的插入位置：该行之前有多少条已保存的行
      const savedRowsBeforeIndex = repositories.value
        .slice(0, index)
        .filter((r) => !newRows.value.has(r)).length
      await api.insertLocalRepository(savedRowsBeforeIndex, payload)
    } else {
      await api.updateLocalRepositoryByIdentity(payload)
    }

    // 不要刷新整个列表，只更新当前行的 baseline 数据
    // 这样可以保留其他行正在编辑的数据
    baselineData.value[index] = payload
    if (newRows.value.has(repo)) {
      newRows.value.delete(repo)
    }
    notifyRepositoryChanged()
  } catch (error) {
    console.error('Failed to save local repository:', error)
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
      await api.deleteLocalRepositoryByIdentity({ id: repo.id, url: repo.url })
      // 不要刷新整个列表，只从当前列表中移除这一行
      repositories.value.splice(index, 1)
      baselineData.value.splice(index, 1)
      resetPasswordVisibility()
      notifyRepositoryChanged()
    }
  } catch (error) {
    console.error('Failed to remove local repository:', error)
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

const selectDirectoryForRepo = async (index: number): Promise<void> => {
  try {
    const result = await api.selectDirectory()
    if (result.success && result.path) {
      repositories.value[index].url = result.path
    }
  } catch (error) {
    console.error('Failed to select directory:', error)
  }
}

const viewRemoteLogsByLocalRepo = async (repo: Repository): Promise<void> => {
  if (!repo.url) {
    alert('请先填写本地仓库路径。')
    return
  }

  try {
    const remoteResult = await api.getSvnRemoteUrl(repo.url)
    if (!remoteResult.success || !remoteResult.url) {
      alert(remoteResult.message || '无法获取远程仓库地址。')
      return
    }

    remoteLogRepoUrl.value = remoteResult.url
    remoteLogTitle.value = `${repo.alias || repo.url} - 远程日志`
    showRemoteLogViewer.value = true
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '无法获取远程仓库地址'
    alert(errorMsg)
  }
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
      <span class="app-panel-title">管理本地 SVN 仓库，支持添加、编辑和删除。</span>
    </div>
    <div class="app-panel-body">
      <div class="repo-table local-repo-table">
        <div class="repo-row repo-header">
          <div class="repo-cell">别名</div>
          <div class="repo-cell">本地路径</div>
          <div class="repo-cell repo-cell-center">操作</div>
        </div>
        <div class="repo-rows">
          <div v-if="repositories.length === 0" class="repo-row repo-empty">
            <div class="repo-cell repo-empty-text">
              暂无本地仓库配置
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
              <div class="app-input-group">
                <input
                  v-model="repo.url"
                  class="app-input"
                  type="text"
                  placeholder="/path/to/svn/repo"
                />
                <button
                  type="button"
                  class="app-input-action icon-only"
                  aria-label="选择目录"
                  @click="selectDirectoryForRepo(index)"
                >
                  <FolderOpen :size="18" :stroke-width="2" />
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
                  @click="viewRemoteLogsByLocalRepo(repo)"
                >
                  <ScrollText :size="18" :stroke-width="2" />
                </button>
                <button
                  type="button"
                  class="repo-button is-danger icon-only"
                  aria-label="删除"
                  @click="removeRepository(index)"
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
<style scoped>
.local-repo-table :deep(.repo-row) {
  grid-template-columns: 1.1fr 2fr 146px;
}
</style>
