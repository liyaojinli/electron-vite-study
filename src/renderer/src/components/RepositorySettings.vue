<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Repository, type RepositoryData } from '../../../shared/repository'

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
    const result = newRows.value.has(repo)
      ? await window.api.insertRepository(index, payload)
      : await window.api.updateRepository(index, payload)
    updateRepositories(result)
  } catch (error) {
    console.error('Failed to save repository:', error)
  }
}

const removeRepository = async (index: number): Promise<void> => {
  try {
    const repo = repositories.value[index]
    if (newRows.value.has(repo)) {
      repositories.value.splice(index, 1)
      baselineData.value.splice(index, 1)
      newRows.value.delete(repo)
      resetPasswordVisibility()
    } else {
      const result = await window.api.deleteRepository(index)
      updateRepositories(result)
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
        <div v-if="repositories.length === 0" class="repo-row repo-empty">
          <div class="repo-cell repo-empty-text">
            暂无仓库配置
            <button
              type="button"
              class="repo-button icon-only is-primary"
              aria-label="新增仓库"
              @click="addFirstRepository"
            >
              <svg class="icon-svg" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M10 4.5v11M4.5 10h11"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.6"
                />
              </svg>
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
                <svg
                  v-if="passwordVisibleIndices.has(index)"
                  class="icon-svg"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    d="M2.5 10s3.2-5 7.5-5 7.5 5 7.5 5-3.2 5-7.5 5-7.5-5-7.5-5z"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="2.6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                  />
                </svg>
                <svg v-else class="icon-svg" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M3 3l14 14"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.4"
                  />
                  <path
                    d="M3.8 7.8C2.9 8.7 2.5 10 2.5 10s3.2 5 7.5 5c1.2 0 2.4-.2 3.4-.7"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                  />
                  <path
                    d="M6.2 5.1C7.2 4.6 8.6 4.5 10 4.5c4.3 0 7.5 5.5 7.5 5.5s-.6 1.2-1.9 2.4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.4"
                  />
                </svg>
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
                <svg class="icon-svg" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M10 5.5v9M5.5 10h9"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.6"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="repo-button is-primary icon-only"
                aria-label="保存"
                :disabled="!isDirty(index)"
                @click="saveRepository(index)"
              >
                <svg class="icon-svg" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M4.5 10.5l3.2 3.2 7.8-7.8"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.6"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="repo-button is-danger icon-only"
                aria-label="删除"
                @click="removeRepository(index)"
              >
                <svg class="icon-svg" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    d="M4 7h12"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.6"
                  />
                  <path
                    d="M7.2 7V5.2a1.2 1.2 0 0 1 1.2-1.2h3.2a1.2 1.2 0 0 1 1.2 1.2V7"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.4"
                  />
                  <path
                    d="M6.2 7l.5 8h6.6l.5-8"
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-width="1.4"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
