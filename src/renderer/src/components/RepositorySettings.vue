<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Repository, type RepositoryData } from '../../../shared/repository'
import { Plus, Eye, EyeOff, Check, Trash2 } from 'lucide-vue-next'

const passwordVisibleIndices = ref(new Set<number>())
const repositories = ref<Repository[]>([])
const baselineData = ref<Array<RepositoryData | null>>([])
const newRows = ref(new Set<Repository>())

const resetPasswordVisibility = (): void => {
  passwordVisibleIndices.value = new Set()
}

const updateRepositories = (data: RepositoryData[]): void => {
  repositories.value = data.map((repo) => Repository.fromJSON(repo))
  baselineData.value = data
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
  const repo = new Repository('', '', '', '')
  repositories.value.splice(index + 1, 0, repo)
  baselineData.value.splice(index + 1, 0, null)
  newRows.value.add(repo)
  resetPasswordVisibility()
}

const addFirstRepository = (): void => {
  const repo = new Repository('', '', '', '')
  repositories.value.splice(0, 0, repo)
  baselineData.value.splice(0, 0, null)
  newRows.value.add(repo)
  resetPasswordVisibility()
}

const saveRepository = async (index: number): Promise<void> => {
  try {
    const repo = repositories.value[index]
    const payload = repo.toJSON()
    const verifyResult = await window.api.verifyRepository(payload)
    if (!verifyResult.ok) {
      alert(verifyResult.message || 'SVN 连接验证失败。')
      return
    }
    // 调用 API 保存，但不使用返回结果刷新整个列表
    if (newRows.value.has(repo)) {
      await window.api.insertRepository(index, payload)
    } else {
      await window.api.updateRepository(index, payload)
    }
    
    // 不要刷新整个列表，只更新当前行的 baseline 数据
    // 这样可以保留其他行正在编辑的数据
    baselineData.value[index] = payload
    if (newRows.value.has(repo)) {
      newRows.value.delete(repo)
    }
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
    } else {
      // 已保存的行，调用 API 删除
      await window.api.deleteRepository(index)
      // 不要刷新整个列表，只从当前列表中移除这一行
      repositories.value.splice(index, 1)
      baselineData.value.splice(index, 1)
      resetPasswordVisibility()
    }
  } catch (error) {
    console.error('Failed to remove repository:', error)
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
          <div v-for="(repo, index) in repositories" :key="index" class="repo-row">
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
  </section>
</template>
