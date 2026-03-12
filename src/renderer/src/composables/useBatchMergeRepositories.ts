import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
import type {
  RepositoryData,
  RepositoryGroupData,
  RepositoryGroupMembershipData
} from '../../../shared/repository'
import { onRepositoriesChanged } from '../utils/repositoryEvents'

const UNGROUPED_GROUP_FILTER_ID = '__ungrouped__'

type LocalGroupFilterOption = {
  id: string
  name: string
}

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
  selectedRemoteGroupIds: Ref<string[]>
  remoteGroupFilterOptions: Readonly<Ref<LocalGroupFilterOption[]>>
  searchRemoteRepoKeyword: Ref<string>
  searchRemoteRepoInputValue: Ref<string>
  selectedLocalGroupIds: Ref<string[]>
  localGroupFilterOptions: Readonly<Ref<LocalGroupFilterOption[]>>
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
  const localRepositoryGroups = ref<RepositoryGroupData[]>([])
  const localGroupMemberships = ref<RepositoryGroupMembershipData[]>([])
  const remoteRepositoryGroups = ref<RepositoryGroupData[]>([])
  const remoteGroupMemberships = ref<RepositoryGroupMembershipData[]>([])
  const remoteUrlByLocalPath = ref<Record<string, string>>({})
  const selectedSourceRepo = ref<string>('')
  const selectedTargetRepos = ref<Set<string>>(new Set())

  const searchLocalRepoKeyword = ref<string>('')
  const searchLocalRepoInputValue = ref<string>('')
  const selectedRemoteGroupIds = ref<string[]>([])
  const searchRemoteRepoKeyword = ref<string>('')
  const searchRemoteRepoInputValue = ref<string>('')
  const selectedLocalGroupIds = ref<string[]>([])
  let stopRepositoryChangeListener: (() => void) | null = null

  const loadRepositories = async (): Promise<void> => {
    try {
      const [localRepos, remoteRepos, localGroups, localMemberships, remoteGroups, remoteMemberships] =
        await Promise.all([
        api.getLocalRepositories(),
        api.listRepositories(),
        api.listLocalRepositoryGroups(),
          api.listLocalRepositoryGroupMemberships(),
          api.listRemoteRepositoryGroups(),
          api.listRemoteRepositoryGroupMemberships()
        ])

      localRepositories.value = [...localRepos].sort((a, b) =>
        a.alias.localeCompare(b.alias, 'zh-CN')
      )
      remoteRepositories.value = [...remoteRepos].sort((a, b) =>
        a.alias.localeCompare(b.alias, 'zh-CN')
      )
      localRepositoryGroups.value = [...localGroups]
      localGroupMemberships.value = [...localMemberships]
      remoteRepositoryGroups.value = [...remoteGroups]
      remoteGroupMemberships.value = [...remoteMemberships]

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
    stopRepositoryChangeListener = onRepositoriesChanged(async () => {
      await loadRepositories()
    })
    await loadRepositories()
  })

  onUnmounted(() => {
    if (stopRepositoryChangeListener) {
      stopRepositoryChangeListener()
      stopRepositoryChangeListener = null
    }
  })

  watch(isActive, async (active, wasActive) => {
    if (active && !wasActive) {
      await loadRepositories()
    }
  })

  const sourceRepo = computed(() =>
    remoteRepositories.value.find((r) => r.url === selectedSourceRepo.value)
  )

  const repoGroupIdsByRepoId = computed(() => {
    const map = new Map<string, Set<string>>()
    localGroupMemberships.value.forEach((membership) => {
      const set = map.get(membership.repositoryId) || new Set<string>()
      set.add(membership.groupId)
      map.set(membership.repositoryId, set)
    })
    return map
  })

  const remoteRepoGroupIdsByRepoId = computed(() => {
    const map = new Map<string, Set<string>>()
    remoteGroupMemberships.value.forEach((membership) => {
      const set = map.get(membership.repositoryId) || new Set<string>()
      set.add(membership.groupId)
      map.set(membership.repositoryId, set)
    })
    return map
  })

  const localGroupFilterOptions = computed<LocalGroupFilterOption[]>(() => {
    return [
      { id: UNGROUPED_GROUP_FILTER_ID, name: '未分组' },
      ...localRepositoryGroups.value.map((group) => ({ id: group.id, name: group.name }))
    ]
  })

  const remoteGroupFilterOptions = computed<LocalGroupFilterOption[]>(() => {
    return [
      { id: UNGROUPED_GROUP_FILTER_ID, name: '未分组' },
      ...remoteRepositoryGroups.value.map((group) => ({ id: group.id, name: group.name }))
    ]
  })

  const matchesSelectedLocalGroups = (repo: RepositoryData): boolean => {
    if (selectedLocalGroupIds.value.length === 0) {
      return true
    }

    const repoId = repo.id || ''
    const groupIds = repoGroupIdsByRepoId.value.get(repoId) || new Set<string>()
    const selectedSet = new Set(selectedLocalGroupIds.value)

    const matchesUngrouped = selectedSet.has(UNGROUPED_GROUP_FILTER_ID) && groupIds.size === 0
    if (matchesUngrouped) {
      return true
    }

    return Array.from(groupIds).some((groupId) => selectedSet.has(groupId))
  }

  const matchesSelectedRemoteGroups = (repo: RepositoryData): boolean => {
    if (selectedRemoteGroupIds.value.length === 0) {
      return true
    }

    const repoId = repo.id || ''
    const groupIds = remoteRepoGroupIdsByRepoId.value.get(repoId) || new Set<string>()
    const selectedSet = new Set(selectedRemoteGroupIds.value)

    const matchesUngrouped = selectedSet.has(UNGROUPED_GROUP_FILTER_ID) && groupIds.size === 0
    if (matchesUngrouped) {
      return true
    }

    return Array.from(groupIds).some((groupId) => selectedSet.has(groupId))
  }

  const targetRepos = computed(() =>
    localRepositories.value.filter((r) => selectedTargetRepos.value.has(r.url))
  )

  const filteredRemoteRepositories = computed(() =>
    remoteRepositories.value.filter((repo) =>
      matchesSearchKeywords(repo.alias, searchRemoteRepoKeyword.value) &&
      matchesSelectedRemoteGroups(repo)
    )
  )

  const filteredLocalRepositories = computed(() =>
    localRepositories.value.filter(
      (repo) =>
        repo.url !== selectedSourceRepo.value &&
        matchesSearchKeywords(repo.alias, searchLocalRepoKeyword.value) &&
        matchesSelectedLocalGroups(repo)
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
    selectedRemoteGroupIds,
    remoteGroupFilterOptions,
    searchRemoteRepoKeyword,
    searchRemoteRepoInputValue,
    selectedLocalGroupIds,
    localGroupFilterOptions,
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
