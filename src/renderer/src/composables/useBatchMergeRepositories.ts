import { computed, onMounted, ref, watch, type Ref } from 'vue'
import type { RepositoryData } from '../../../shared/repository'

const matchesSearchKeywords = (alias: string, keywords: string): boolean => {
  if (!keywords.trim()) return true
  const keywordList = keywords
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0)
  if (keywordList.length === 0) return true
  return keywordList.some((keyword) => alias.toLowerCase().includes(keyword))
}

interface UseBatchMergeRepositoriesResult {
  localRepositories: Ref<RepositoryData[]>
  remoteRepositories: Ref<RepositoryData[]>
  remoteUrlByLocalPath: Ref<Record<string, string>>
  selectedSourceRepo: Ref<string>
  selectedTargetRepos: Ref<Set<string>>
  searchLocalRepoKeyword: Ref<string>
  searchLocalRepoInputValue: Ref<string>
  searchRemoteRepoKeyword: Ref<string>
  searchRemoteRepoInputValue: Ref<string>
  loadRepositories: () => Promise<void>
  sourceRepo: Readonly<Ref<RepositoryData | undefined>>
  targetRepos: Readonly<Ref<RepositoryData[]>>
  filteredRemoteRepositories: Readonly<Ref<RepositoryData[]>>
  filteredLocalRepositories: Readonly<Ref<RepositoryData[]>>
  toggleTargetRepo: (repoUrl: string) => void
  matchesSearchKeywords: (alias: string, keywords: string) => boolean
  getRemoteRepoUrlByLocalPath: (localPath: string) => string
  setRemoteRepoUrlByLocalPath: (localPath: string, remoteUrl: string) => void
}

export const useBatchMergeRepositories = (
  isActive: Ref<boolean>
): UseBatchMergeRepositoriesResult => {
  const api = window.api

  const localRepositories = ref<RepositoryData[]>([])
  const remoteRepositories = ref<RepositoryData[]>([])
  const remoteUrlByLocalPath = ref<Record<string, string>>({})
  const selectedSourceRepo = ref<string>('')
  const selectedTargetRepos = ref<Set<string>>(new Set())

  const searchLocalRepoKeyword = ref<string>('')
  const searchLocalRepoInputValue = ref<string>('')
  const searchRemoteRepoKeyword = ref<string>('')
  const searchRemoteRepoInputValue = ref<string>('')

  const loadRepositories = async (): Promise<void> => {
    try {
      const localRepos = await api.getLocalRepositories()
      const remoteRepos = await api.listRepositories()

      localRepositories.value = [...localRepos].sort((a, b) =>
        a.alias.localeCompare(b.alias, 'zh-CN')
      )
      remoteRepositories.value = [...remoteRepos].sort((a, b) =>
        a.alias.localeCompare(b.alias, 'zh-CN')
      )

      const urlEntries = await Promise.all(
        localRepositories.value.map(async (repo) => {
          try {
            const result = await api.getSvnRemoteUrl(repo.url)
            return [repo.url, result.success ? result.url : ''] as const
          } catch {
            return [repo.url, ''] as const
          }
        })
      )
      remoteUrlByLocalPath.value = Object.fromEntries(urlEntries)
    } catch (error) {
      console.error('Failed to load repositories:', error)
    }
  }

  onMounted(async () => {
    await loadRepositories()
  })

  watch(isActive, async (active, wasActive) => {
    if (active && !wasActive) {
      await loadRepositories()
    }
  })

  const sourceRepo = computed(() =>
    remoteRepositories.value.find((r) => r.url === selectedSourceRepo.value)
  )

  const targetRepos = computed(() =>
    localRepositories.value.filter((r) => selectedTargetRepos.value.has(r.url))
  )

  const filteredRemoteRepositories = computed(() =>
    remoteRepositories.value.filter((repo) =>
      matchesSearchKeywords(repo.alias, searchRemoteRepoKeyword.value)
    )
  )

  const filteredLocalRepositories = computed(() =>
    localRepositories.value.filter(
      (repo) =>
        repo.url !== selectedSourceRepo.value &&
        matchesSearchKeywords(repo.alias, searchLocalRepoKeyword.value)
    )
  )

  const toggleTargetRepo = (repoUrl: string): void => {
    if (selectedTargetRepos.value.has(repoUrl)) {
      selectedTargetRepos.value.delete(repoUrl)
      return
    }
    selectedTargetRepos.value.add(repoUrl)
  }

  const getRemoteRepoUrlByLocalPath = (localPath: string): string => {
    return remoteUrlByLocalPath.value[localPath] || ''
  }

  const setRemoteRepoUrlByLocalPath = (localPath: string, remoteUrl: string): void => {
    remoteUrlByLocalPath.value = {
      ...remoteUrlByLocalPath.value,
      [localPath]: remoteUrl
    }
  }

  return {
    localRepositories,
    remoteRepositories,
    remoteUrlByLocalPath,
    selectedSourceRepo,
    selectedTargetRepos,
    searchLocalRepoKeyword,
    searchLocalRepoInputValue,
    searchRemoteRepoKeyword,
    searchRemoteRepoInputValue,
    loadRepositories,
    sourceRepo,
    targetRepos,
    filteredRemoteRepositories,
    filteredLocalRepositories,
    toggleTargetRepo,
    matchesSearchKeywords,
    getRemoteRepoUrlByLocalPath,
    setRemoteRepoUrlByLocalPath
  }
}
