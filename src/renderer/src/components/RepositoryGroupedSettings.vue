<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  PackagePlus,
  Check,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  Pencil,
  Plus,
  Minus,
  Scissors,
  Share2,
  ScrollText,
  Trash2,
  Unlink,
  X
} from 'lucide-vue-next'
import SvnRemoteLogViewer from './SvnRemoteLogViewer.vue'
import type {
  RepositoryData,
  RepositoryGroupData,
  RepositoryGroupMembershipData
} from '../../../shared/repository'

type Mode = 'remote' | 'local'
type DragMode = 'copy' | 'move'
const UNGROUPED_GROUP_ID = '__ungrouped__'

type UiRepository = RepositoryData & { id: string }
type DraftRepository = UiRepository & { targetGroupId: string }

type GroupRow = {
  rowId: string
  kind: 'group'
  isUngrouped: boolean
  group: RepositoryGroupData
  children: RepoRow[]
}

type RepoRow = {
  rowId: string
  kind: 'repo'
  groupId: string
  isUngroupedGroup: boolean
  repo: UiRepository
  isDraft: boolean
}

type RendererApi = {
  listRepositories(): Promise<RepositoryData[]>
  createRepository(repo: RepositoryData): Promise<RepositoryData[]>
  updateRepositoryByIdentity(repo: RepositoryData): Promise<RepositoryData[]>
  deleteRepositoryByIdentity(
    identity: Pick<RepositoryData, 'id' | 'url'>
  ): Promise<RepositoryData[]>
  verifyRepository(repo: RepositoryData): Promise<{ ok: boolean; message?: string }>

  listLocalRepositories(): Promise<RepositoryData[]>
  createLocalRepository(repo: RepositoryData): Promise<RepositoryData[]>
  updateLocalRepositoryByIdentity(repo: RepositoryData): Promise<RepositoryData[]>
  deleteLocalRepositoryByIdentity(
    identity: Pick<RepositoryData, 'id' | 'url'>
  ): Promise<RepositoryData[]>
  verifyLocalRepository(repo: RepositoryData): Promise<{ ok: boolean; message?: string }>
  selectDirectory(): Promise<{ success: boolean; path?: string }>
  getSvnRemoteUrl(repoPath: string): Promise<{ success: boolean; url: string; message: string }>

  listRemoteRepositoryGroups(): Promise<RepositoryGroupData[]>
  listLocalRepositoryGroups(): Promise<RepositoryGroupData[]>
  createRemoteRepositoryGroup(name: string): Promise<RepositoryGroupData[]>
  createLocalRepositoryGroup(name: string): Promise<RepositoryGroupData[]>
  updateRemoteRepositoryGroup(groupId: string, name: string): Promise<RepositoryGroupData[]>
  updateLocalRepositoryGroup(groupId: string, name: string): Promise<RepositoryGroupData[]>
  deleteRemoteRepositoryGroup(groupId: string): Promise<RepositoryGroupData[]>
  deleteLocalRepositoryGroup(groupId: string): Promise<RepositoryGroupData[]>
  listRemoteRepositoryGroupMemberships(): Promise<RepositoryGroupMembershipData[]>
  listLocalRepositoryGroupMemberships(): Promise<RepositoryGroupMembershipData[]>
  assignRemoteRepositoriesToGroup(
    groupId: string,
    repositoryIds: string[]
  ): Promise<RepositoryGroupMembershipData[]>
  assignLocalRepositoriesToGroup(
    groupId: string,
    repositoryIds: string[]
  ): Promise<RepositoryGroupMembershipData[]>
  removeRemoteRepositoryFromGroup(
    groupId: string,
    repositoryId: string
  ): Promise<RepositoryGroupMembershipData[]>
  removeLocalRepositoryFromGroup(
    groupId: string,
    repositoryId: string
  ): Promise<RepositoryGroupMembershipData[]>
}

const props = defineProps<{
  mode: Mode
}>()

const api = window.api as unknown as RendererApi

const repositories = ref<UiRepository[]>([])
const groups = ref<RepositoryGroupData[]>([])
const memberships = ref<RepositoryGroupMembershipData[]>([])
const groupedTableRef = ref<{
  toggleRowExpansion: (row: GroupRow, expanded?: boolean) => void
} | null>(null)
const drafts = ref<DraftRepository[]>([])
const expandedGroupRowIds = ref(new Set<string>())
const baselineByRepoId = ref<Record<string, string>>({})
const selectedRowIds = ref(new Set<string>())
const draggedRepoIds = ref<string[]>([])
const draggedRepoSourceGroups = ref<Array<{ repoId: string; groupId: string }>>([])
const draggedMode = ref<DragMode>('copy')
const dragOverGroupId = ref('')
const editingGroupId = ref('')
const editingGroupName = ref('')
const showRemoteLogViewer = ref(false)
const remoteLogRepoUrl = ref('')
const remoteLogTitle = ref('远程 SVN 日志')
const hasInitializedExpandedGroups = ref(false)
let draftSeed = 0
let dragPreviewElement: HTMLDivElement | null = null

const isLocalMode = computed(() => props.mode === 'local')

const scopeLabel = computed(() => (isLocalMode.value ? '本地仓库' : '远程仓库'))
const groupColumnMinWidth = computed(() => (isLocalMode.value ? 250 : 220))
const pathColumnMinWidth = computed(() => (isLocalMode.value ? 260 : 220))
const actionColumnMinWidth = computed(() => (isLocalMode.value ? 250 : 280))

const repositoryMap = computed(() => {
  return repositories.value.reduce<Record<string, UiRepository>>((acc, repo) => {
    acc[repo.id] = repo
    return acc
  }, {})
})

const membershipsByGroupId = computed(() => {
  const map = new Map<string, Set<string>>()
  for (const membership of memberships.value) {
    const set = map.get(membership.groupId) || new Set<string>()
    set.add(membership.repositoryId)
    map.set(membership.groupId, set)
  }
  return map
})

const ungroupedVirtualGroup = computed<RepositoryGroupData>(() => {
  return {
    id: UNGROUPED_GROUP_ID,
    scope: isLocalMode.value ? 'local' : 'remote',
    name: '未分组',
    isDefault: true
  }
})

const treeRows = computed<GroupRow[]>(() => {
  const rows: GroupRow[] = []

  const assignedRepoIds = new Set<string>()
  memberships.value.forEach((item) => {
    assignedRepoIds.add(item.repositoryId)
  })

  const ungroupedChildren: RepoRow[] = repositories.value
    .filter((repo) => !assignedRepoIds.has(repo.id))
    .sort((a, b) => (a.alias || '').localeCompare(b.alias || '', 'zh-CN'))
    .map((repo) => {
      return {
        rowId: `repo-${UNGROUPED_GROUP_ID}-${repo.id}`,
        kind: 'repo',
        groupId: UNGROUPED_GROUP_ID,
        isUngroupedGroup: true,
        repo,
        isDraft: false
      }
    })

  drafts.value
    .filter((repo) => repo.targetGroupId === UNGROUPED_GROUP_ID)
    .forEach((repo) => {
      ungroupedChildren.push({
        rowId: `repo-${UNGROUPED_GROUP_ID}-${repo.id}`,
        kind: 'repo',
        groupId: UNGROUPED_GROUP_ID,
        isUngroupedGroup: true,
        repo,
        isDraft: true
      })
    })

  rows.push({
    rowId: `group-${UNGROUPED_GROUP_ID}`,
    kind: 'group',
    isUngrouped: true,
    group: ungroupedVirtualGroup.value,
    children: ungroupedChildren
  })

  for (const group of groups.value) {
    const repoIds = membershipsByGroupId.value.get(group.id) || new Set<string>()
    const children: RepoRow[] = []

    Array.from(repoIds)
      .map((repoId) => repositoryMap.value[repoId])
      .filter((repo): repo is UiRepository => Boolean(repo))
      .sort((a, b) => (a.alias || '').localeCompare(b.alias || '', 'zh-CN'))
      .forEach((repo) => {
        children.push({
          rowId: `repo-${group.id}-${repo.id}`,
          kind: 'repo',
          groupId: group.id,
          isUngroupedGroup: false,
          repo,
          isDraft: false
        })
      })

    drafts.value
      .filter((repo) => repo.targetGroupId === group.id)
      .forEach((repo) => {
        children.push({
          rowId: `repo-${group.id}-${repo.id}`,
          kind: 'repo',
          groupId: group.id,
          isUngroupedGroup: false,
          repo,
          isDraft: true
        })
      })

    rows.push({
      rowId: `group-${group.id}`,
      kind: 'group',
      isUngrouped: false,
      group,
      children
    })
  }

  return rows
})

watch(
  treeRows,
  (rows) => {
    const nextRowIds = rows.map((row) => row.rowId)
    if (!hasInitializedExpandedGroups.value) {
      expandedGroupRowIds.value = new Set()
      hasInitializedExpandedGroups.value = true
      return
    }

    const nextExpanded = new Set<string>()
    nextRowIds.forEach((rowId) => {
      if (expandedGroupRowIds.value.has(rowId)) {
        nextExpanded.add(rowId)
      }
    })
    expandedGroupRowIds.value = nextExpanded
  },
  { immediate: true }
)

const expandRowKeys = computed(() => Array.from(expandedGroupRowIds.value))
const allGroupsExpanded = computed(() => {
  if (treeRows.value.length === 0) {
    return false
  }

  return treeRows.value.every((row) => expandedGroupRowIds.value.has(row.rowId))
})

const expandAllGroups = (): void => {
  expandedGroupRowIds.value = new Set(treeRows.value.map((row) => row.rowId))
}

const collapseAllGroups = (): void => {
  expandedGroupRowIds.value.clear()
}

const toggleAllGroups = (): void => {
  if (allGroupsExpanded.value) {
    collapseAllGroups()
    return
  }

  expandAllGroups()
}

const isGroupExpanded = (rowId: string): boolean => {
  return expandedGroupRowIds.value.has(rowId)
}

const normalizePathOrUrl = (value: string): string => {
  const normalized = value.trim().replace(/[\\/]+$/, '')
  return isLocalMode.value ? normalized.toLowerCase() : normalized
}

const toSerializableRepository = (repo: UiRepository): RepositoryData => {
  return {
    id: repo.id,
    url: `${repo.url || ''}`,
    username: `${repo.username || ''}`,
    password: `${repo.password || ''}`,
    alias: `${repo.alias || ''}`,
    local: isLocalMode.value
  }
}

const isRepoDirty = (repo: UiRepository, isDraft: boolean): boolean => {
  if (isDraft) {
    return true
  }
  const baseline = baselineByRepoId.value[repo.id]
  if (!baseline) {
    return true
  }
  return baseline !== JSON.stringify(repo)
}

const loadAll = async (): Promise<void> => {
  try {
    const [repoList, groupList, membershipList] = await Promise.all([
      isLocalMode.value ? api.listLocalRepositories() : api.listRepositories(),
      isLocalMode.value ? api.listLocalRepositoryGroups() : api.listRemoteRepositoryGroups(),
      isLocalMode.value
        ? api.listLocalRepositoryGroupMemberships()
        : api.listRemoteRepositoryGroupMemberships()
    ])

    repositories.value = repoList.map((repo) => ({
      id: repo.id || '',
      url: repo.url,
      username: repo.username,
      password: repo.password,
      alias: repo.alias,
      local: isLocalMode.value
    }))
    groups.value = groupList
    memberships.value = membershipList
    baselineByRepoId.value = repositories.value.reduce<Record<string, string>>((acc, repo) => {
      acc[repo.id] = JSON.stringify(repo)
      return acc
    }, {})
  } catch (error) {
    console.error('Failed to load grouped repositories:', error)
    ElMessage.error(`加载${scopeLabel.value}失败`)
  }
}

const addDraftRepository = (
  targetGroupId: string = UNGROUPED_GROUP_ID,
  sourceRepo?: UiRepository
): void => {
  drafts.value.push({
    id: `tmp-${draftSeed++}`,
    url: sourceRepo?.url || '',
    username: sourceRepo?.username || '',
    password: sourceRepo?.password || '',
    alias: sourceRepo?.alias || '',
    local: isLocalMode.value,
    targetGroupId
  })
}

const getLastRepositoryInGroup = (targetGroupId: string): UiRepository | undefined => {
  const groupRow = treeRows.value.find((row) => row.group.id === targetGroupId)
  if (!groupRow || groupRow.children.length === 0) {
    return undefined
  }

  const lastRepoRow = groupRow.children[groupRow.children.length - 1]
  return lastRepoRow?.repo
}

const addDraftRepositoryForGroup = (targetGroupId: string = UNGROUPED_GROUP_ID): void => {
  addDraftRepository(targetGroupId, getLastRepositoryInGroup(targetGroupId))
}

const removeDraftRepository = (repoId: string): void => {
  drafts.value = drafts.value.filter((repo) => repo.id !== repoId)
}

const createGroup = async (): Promise<void> => {
  try {
    const promptValue = await ElMessageBox.prompt(
      '请输入分组名称（唯一）',
      `新增${scopeLabel.value}分组`,
      {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPlaceholder: '例如：项目A'
      }
    ).then((result) => {
      return typeof result === 'string' ? result : result.value
    })

    const groupName = promptValue.trim()
    if (!groupName) {
      ElMessage.warning('分组名不能为空')
      return
    }

    if (isLocalMode.value) {
      await api.createLocalRepositoryGroup(groupName)
    } else {
      await api.createRemoteRepositoryGroup(groupName)
    }

    await loadAll()
    ElMessage.success('分组创建成功')
  } catch {
    // user cancelled
  }
}

const startEditGroup = (group: RepositoryGroupData): void => {
  if (group.isDefault) {
    return
  }
  editingGroupId.value = group.id
  editingGroupName.value = group.name
}

const cancelEditGroup = (): void => {
  editingGroupId.value = ''
  editingGroupName.value = ''
}

const saveGroup = async (group: RepositoryGroupData): Promise<void> => {
  const name = editingGroupName.value.trim()
  if (!name) {
    ElMessage.warning('分组名不能为空')
    return
  }

  try {
    if (isLocalMode.value) {
      await api.updateLocalRepositoryGroup(group.id, name)
    } else {
      await api.updateRemoteRepositoryGroup(group.id, name)
    }
    cancelEditGroup()
    await loadAll()
    ElMessage.success('分组更新成功')
  } catch (error) {
    const message = error instanceof Error ? error.message : '分组更新失败'
    ElMessage.error(message)
  }
}

const deleteGroup = async (group: RepositoryGroupData): Promise<void> => {
  if (group.isDefault) {
    ElMessage.warning('未分组不能删除')
    return
  }

  try {
    await ElMessageBox.confirm(
      `删除分组「${group.name}」后，该分组内仓库会自动回到「未分组」。是否继续？`,
      '确认删除分组',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      }
    )

    if (isLocalMode.value) {
      await api.deleteLocalRepositoryGroup(group.id)
    } else {
      await api.deleteRemoteRepositoryGroup(group.id)
    }

    await loadAll()
    ElMessage.success('分组删除成功')
  } catch {
    // user cancelled
  }
}

const toggleRepoSelection = (rowId: string): void => {
  if (selectedRowIds.value.has(rowId)) {
    selectedRowIds.value.delete(rowId)
  } else {
    selectedRowIds.value.add(rowId)
  }
}

const getAssociatedGroupNames = (repoId: string): string[] => {
  const names = memberships.value
    .filter((item) => item.repositoryId === repoId)
    .map((item) => groups.value.find((group) => group.id === item.groupId)?.name)
    .filter((name): name is string => Boolean(name))

  const uniqueNames = Array.from(new Set(names))
  return uniqueNames.length > 0 ? uniqueNames : ['未分组']
}

const hasMultipleGroupAssociations = (repoId: string): boolean => {
  return getAssociatedGroupNames(repoId).length > 1
}

const getAssociationTooltip = (repoId: string): string => {
  const names = getAssociatedGroupNames(repoId)
  return `已关联分组：${names.join('、')}`
}

const confirmRepositoryImpact = async (
  action: '修改' | '删除',
  repo: UiRepository
): Promise<boolean> => {
  const names = getAssociatedGroupNames(repo.id)
  if (names.length <= 1) {
    return true
  }

  const groupLines = names.map((name, index) => `${index + 1}. ${name}`).join('\n')
  const label = repo.alias || repo.url || '该仓库'
  const message = `仓库「${label}」当前关联分组：\n${groupLines}\n\n${action}该仓库将同步影响以上分组，是否继续？`

  try {
    await ElMessageBox.confirm(message, `确认${action}`, {
      type: 'warning',
      confirmButtonText: '继续',
      cancelButtonText: '取消'
    })
    return true
  } catch {
    return false
  }
}

const confirmDeleteRepository = async (repo: UiRepository): Promise<boolean> => {
  const names = getAssociatedGroupNames(repo.id)
  const label = repo.alias || repo.url || '该仓库'

  try {
    if (names.length <= 1) {
      await ElMessageBox.confirm(`确定要删除「${label}」吗？`, `确认删除${scopeLabel.value}`, {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      })
      return true
    }

    const groupLines = names.map((name, index) => `${index + 1}. ${name}`).join('\n')
    const message = `仓库「${label}」当前关联分组：\n${groupLines}\n\n删除该仓库将同步影响以上分组，是否继续删除？`
    await ElMessageBox.confirm(message, `确认删除${scopeLabel.value}`, {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger'
    })
    return true
  } catch {
    return false
  }
}

const isInteractiveTarget = (target: HTMLElement | null): boolean => {
  if (!target) {
    return false
  }

  return Boolean(
    target.closest(
      'input,button,select,textarea,label,.repo-button,.row-actions,.app-input-action,.drag-handle'
    )
  )
}

const onTableRowClick = (row: GroupRow | RepoRow, _column: unknown, event: Event): void => {
  const target = event.target as HTMLElement | null
  if (isInteractiveTarget(target)) {
    return
  }

  if (row.kind === 'repo') {
    toggleRepoSelection(row.rowId)
    return
  }

  if (editingGroupId.value === row.group.id) {
    return
  }

  groupedTableRef.value?.toggleRowExpansion(row)
}

const onExpandChange = (row: GroupRow | RepoRow, expanded: boolean | GroupRow[]): void => {
  if (row.kind !== 'group') {
    return
  }

  const isExpanded = Array.isArray(expanded)
    ? expanded.some((item) => item.rowId === row.rowId)
    : expanded

  if (isExpanded) {
    expandedGroupRowIds.value.add(row.rowId)
  } else {
    expandedGroupRowIds.value.delete(row.rowId)
  }
}

const setDraggingCursor = (dragging: boolean): void => {
  if (dragging) {
    document.body.classList.add('repo-dragging')
  } else {
    document.body.classList.remove('repo-dragging')
  }
}

const clearDragPreview = (): void => {
  if (dragPreviewElement && dragPreviewElement.parentNode) {
    dragPreviewElement.parentNode.removeChild(dragPreviewElement)
  }
  dragPreviewElement = null
}

const onRepoDragStart = (event: DragEvent, row: RepoRow, mode: DragMode): void => {
  if (!selectedRowIds.value.has(row.rowId)) {
    event.preventDefault()
    ElMessage.warning('请先勾选需要拖拽的仓库行')
    return
  }

  const selectedRows = treeRows.value
    .flatMap((group) => group.children)
    .filter((child) => selectedRowIds.value.has(child.rowId) && !child.isDraft)

  if (selectedRows.length === 0) {
    event.preventDefault()
    ElMessage.warning('草稿仓库请先保存后再拖拽')
    return
  }

  draggedMode.value = mode
  draggedRepoIds.value = Array.from(new Set(selectedRows.map((item) => item.repo.id)))
  draggedRepoSourceGroups.value = selectedRows
    .filter((item) => item.groupId !== UNGROUPED_GROUP_ID)
    .map((item) => ({ repoId: item.repo.id, groupId: item.groupId }))

  if (event.dataTransfer) {
    setDraggingCursor(true)
    event.dataTransfer.effectAllowed = mode === 'copy' ? 'copy' : 'move'
    event.dataTransfer.setData('text/plain', draggedRepoIds.value.join(','))

    clearDragPreview()
    const preview = document.createElement('div')
    const icon = mode === 'copy' ? '⧉' : '✂'
    const names = draggedRepoIds.value.map((id) => {
      const repo =
        repositories.value.find((item) => item.id === id) ||
        drafts.value.find((item) => item.id === id)
      return repo?.alias || repo?.url || '未命名仓库'
    })

    const header = document.createElement('div')
    header.textContent = `${icon} ${mode === 'copy' ? '复制' : '剪切'} ${names.length} 项`
    header.style.fontWeight = '600'
    header.style.marginBottom = '4px'
    preview.appendChild(header)

    names.forEach((name) => {
      const line = document.createElement('div')
      line.textContent = name
      line.style.whiteSpace = 'nowrap'
      line.style.lineHeight = '18px'
      preview.appendChild(line)
    })

    preview.style.position = 'fixed'
    preview.style.top = '-1000px'
    preview.style.left = '-1000px'
    preview.style.zIndex = '99999'
    preview.style.pointerEvents = 'none'
    preview.style.padding = '6px 10px'
    preview.style.borderRadius = '8px'
    preview.style.fontSize = '12px'
    preview.style.color = mode === 'copy' ? '#1d5fb8' : '#9a4a00'
    preview.style.border = mode === 'copy' ? '1px solid #7ab2ff' : '1px solid #f1bb7d'
    preview.style.background = mode === 'copy' ? '#eaf4ff' : '#fff3e6'
    preview.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
    document.body.appendChild(preview)
    dragPreviewElement = preview
    event.dataTransfer.setDragImage(preview, 10, 10)
  }
}

const onRepoDragEnd = (): void => {
  clearDragPreview()
  setDraggingCursor(false)
}

const onCopyDragStart = (event: DragEvent, row: RepoRow): void => {
  if (row.isUngroupedGroup) {
    event.preventDefault()
    ElMessage.warning('未分组中的仓库不支持关联拖拽，请使用剪切拖拽。')
    return
  }
  onRepoDragStart(event, row, 'copy')
}

const onMoveDragStart = (event: DragEvent, row: RepoRow): void => {
  onRepoDragStart(event, row, 'move')
}

const assignRepositoriesToGroup = async (groupId: string, ids: string[]): Promise<void> => {
  const cleanIds = Array.from(new Set(ids.filter(Boolean)))
  if (cleanIds.length === 0) {
    return
  }

  if (isLocalMode.value) {
    await api.assignLocalRepositoriesToGroup(groupId, cleanIds)
  } else {
    await api.assignRemoteRepositoriesToGroup(groupId, cleanIds)
  }
}

const removeMembershipPairs = async (
  pairs: Array<{ repoId: string; groupId: string }>
): Promise<void> => {
  if (pairs.length === 0) {
    return
  }

  const tasks = pairs.map((pair) => {
    if (isLocalMode.value) {
      return api.removeLocalRepositoryFromGroup(pair.groupId, pair.repoId)
    }
    return api.removeRemoteRepositoryFromGroup(pair.groupId, pair.repoId)
  })

  await Promise.all(tasks)
}

const onGroupDrop = async (groupId: string): Promise<void> => {
  if (groupId === UNGROUPED_GROUP_ID) {
    ElMessage.warning('未分组不接受拖拽。')
    return
  }

  dragOverGroupId.value = ''
  const dropIds = Array.from(draggedRepoIds.value)

  if (dropIds.length === 0) {
    return
  }

  try {
    await assignRepositoriesToGroup(groupId, dropIds)

    if (draggedMode.value === 'move') {
      const removePairs = draggedRepoSourceGroups.value.filter(
        (item) => item.groupId !== groupId && dropIds.includes(item.repoId)
      )
      await removeMembershipPairs(removePairs)
      ElMessage.success('已剪切到目标分组')
    } else {
      ElMessage.success('已关联到目标分组')
    }

    await loadAll()
    selectedRowIds.value.clear()
  } catch (error) {
    const message = error instanceof Error ? error.message : '拖拽分组失败'
    ElMessage.error(message)
  } finally {
    draggedRepoIds.value = []
    draggedRepoSourceGroups.value = []
    draggedMode.value = 'copy'
    clearDragPreview()
    setDraggingCursor(false)
  }
}

const onGroupDragOver = (event: DragEvent, groupId: string): void => {
  if (groupId === UNGROUPED_GROUP_ID) {
    return
  }

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = draggedMode.value === 'copy' ? 'copy' : 'move'
  }
  dragOverGroupId.value = groupId
}

const onGroupDragLeave = (groupId: string): void => {
  if (dragOverGroupId.value === groupId) {
    dragOverGroupId.value = ''
  }
}

const saveRepository = async (
  repo: UiRepository,
  isDraft: boolean,
  targetGroupId: string = UNGROUPED_GROUP_ID
): Promise<void> => {
  const normalized = normalizePathOrUrl(repo.url)
  if (!normalized) {
    ElMessage.warning(isLocalMode.value ? '本地路径不能为空' : '远程地址不能为空')
    return
  }

  const duplicate = repositories.value.find(
    (item) => item.id !== repo.id && normalizePathOrUrl(item.url) === normalized
  )
  if (duplicate) {
    ElMessage.warning(`仓库地址重复：${duplicate.alias || duplicate.url}`)
    return
  }

  try {
    if (!isDraft) {
      const confirmed = await confirmRepositoryImpact('修改', repo)
      if (!confirmed) {
        return
      }
    }

    const repoPayload = toSerializableRepository(repo)

    const verifyResult = isLocalMode.value
      ? await api.verifyLocalRepository(repoPayload)
      : await api.verifyRepository(repoPayload)

    if (!verifyResult.ok) {
      ElMessage.error(verifyResult.message || '仓库校验失败')
      return
    }

    if (isDraft) {
      if (isLocalMode.value) {
        await api.createLocalRepository({ ...repoPayload, id: undefined, local: true })
      } else {
        await api.createRepository({ ...repoPayload, id: undefined, local: false })
      }

      removeDraftRepository(repo.id)

      await loadAll()

      if (targetGroupId !== UNGROUPED_GROUP_ID) {
        const createdRepo = repositories.value.find(
          (item) => normalizePathOrUrl(item.url) === normalized
        )

        if (createdRepo) {
          await assignRepositoriesToGroup(targetGroupId, [createdRepo.id])
          await loadAll()
        }
      }
    } else if (isLocalMode.value) {
      await api.updateLocalRepositoryByIdentity(repoPayload)
    } else {
      await api.updateRepositoryByIdentity(repoPayload)
    }

    if (!isDraft) {
      await loadAll()
    }
    ElMessage.success('仓库保存成功')
  } catch (error) {
    const message = error instanceof Error ? error.message : '仓库保存失败'
    ElMessage.error(message)
  }
}

const deleteRepository = async (row: RepoRow): Promise<void> => {
  const { repo, isDraft } = row
  if (isDraft) {
    removeDraftRepository(repo.id)
    return
  }

  try {
    const confirmed = await confirmDeleteRepository(repo)
    if (!confirmed) {
      return
    }

    if (isLocalMode.value) {
      await api.deleteLocalRepositoryByIdentity({ id: repo.id, url: repo.url })
    } else {
      await api.deleteRepositoryByIdentity({ id: repo.id, url: repo.url })
    }

    await loadAll()
    ElMessage.success('仓库删除成功')
  } catch {
    // user cancelled
  }
}

const removeFromCurrentGroup = async (row: RepoRow): Promise<void> => {
  if (row.isUngroupedGroup || row.isDraft) {
    ElMessage.warning('未分组中的仓库无需移除')
    return
  }

  try {
    if (isLocalMode.value) {
      await api.removeLocalRepositoryFromGroup(row.groupId, row.repo.id)
    } else {
      await api.removeRemoteRepositoryFromGroup(row.groupId, row.repo.id)
    }
    await loadAll()
    ElMessage.success('已从分组移除')
  } catch (error) {
    const message = error instanceof Error ? error.message : '移除失败'
    ElMessage.error(message)
  }
}

const viewRemoteLogs = async (repo: UiRepository): Promise<void> => {
  if (!repo.url) {
    ElMessage.warning(isLocalMode.value ? '请先填写本地仓库路径。' : '请先填写远程仓库地址。')
    return
  }

  try {
    if (isLocalMode.value) {
      const result = await api.getSvnRemoteUrl(repo.url)
      if (!result.success || !result.url) {
        ElMessage.error(result.message || '无法获取远程仓库地址。')
        return
      }
      remoteLogRepoUrl.value = result.url
    } else {
      remoteLogRepoUrl.value = repo.url
    }

    remoteLogTitle.value = `${repo.alias || repo.url} - 远程日志`
    showRemoteLogViewer.value = true
  } catch (error) {
    const message = error instanceof Error ? error.message : '无法获取远程仓库地址。'
    ElMessage.error(message)
  }
}

const pickDirectory = async (repo: UiRepository): Promise<void> => {
  if (!isLocalMode.value) {
    return
  }

  try {
    const result = await api.selectDirectory()
    if (result.success && result.path) {
      repo.url = result.path
    }
  } catch (error) {
    console.error('Failed to pick directory:', error)
  }
}

onMounted(async () => {
  await loadAll()
})
</script>

<template>
  <section class="app-panel">
    <div class="app-panel-header app-panel-header-row">
      <span class="app-panel-title">
        {{
          isLocalMode ? '本地仓库分组管理（树形可编辑表格）' : '远程仓库分组管理（树形可编辑表格）'
        }}
      </span>
    </div>

    <div class="app-panel-body grouped-body">
      <el-table
        ref="groupedTableRef"
        :data="treeRows"
        row-key="rowId"
        :tree-props="{ children: 'children' }"
        :expand-row-keys="expandRowKeys"
        class="grouped-table"
        @row-click="onTableRowClick"
        @expand-change="onExpandChange"
      >
        <el-table-column :min-width="groupColumnMinWidth">
          <template #header>
            <div class="group-column-header">
              <span>分组 / 仓库</span>
              <div class="group-column-header-actions">
                <button
                  type="button"
                  class="repo-button is-neutral icon-only"
                  :aria-label="allGroupsExpanded ? '折叠全部' : '展开全部'"
                  :title="allGroupsExpanded ? '折叠全部' : '展开全部'"
                  @click="toggleAllGroups"
                >
                  <Minus v-if="allGroupsExpanded" :size="8" />
                  <Plus v-else :size="8" />
                </button>
              </div>
            </div>
          </template>
          <template #default="{ row }">
            <div
              v-if="row.kind === 'group'"
              class="group-cell"
              :class="{
                'is-drop-target': !row.isUngrouped && dragOverGroupId === row.group.id
              }"
              @dragover.prevent="onGroupDragOver($event, row.group.id)"
              @dragenter.prevent="onGroupDragOver($event, row.group.id)"
              @dragleave="onGroupDragLeave(row.group.id)"
              @drop.prevent="onGroupDrop(row.group.id)"
            >
              <div v-if="editingGroupId !== row.group.id" class="group-title">
                <component
                  :is="isGroupExpanded(row.rowId) ? FolderOpen : Folder"
                  :size="15"
                  class="group-prefix-icon"
                />
                <strong>{{ row.group.name }}</strong>
              </div>
              <input
                v-else
                v-model="editingGroupName"
                class="app-input group-input"
                type="text"
                placeholder="分组名"
              />
            </div>
            <div v-else class="repo-cell-name">
              <span
                v-if="!row.isUngroupedGroup"
                class="drag-handle drag-handle-associate"
                :class="{ 'is-disabled': !selectedRowIds.has(row.rowId) }"
                :draggable="selectedRowIds.has(row.rowId)"
                title="关联拖拽（先勾选）"
                @dragstart="onCopyDragStart($event, row)"
                @dragend="onRepoDragEnd"
              >
                <Link2 :size="16" />
              </span>
              <span
                class="drag-handle drag-handle-move"
                :class="{ 'is-disabled': !selectedRowIds.has(row.rowId) }"
                :draggable="selectedRowIds.has(row.rowId)"
                title="剪切拖拽（先勾选）"
                @dragstart="onMoveDragStart($event, row)"
                @dragend="onRepoDragEnd"
              >
                <Scissors :size="16" />
              </span>
              <input
                class="repo-select-checkbox"
                type="checkbox"
                :checked="selectedRowIds.has(row.rowId)"
                @change="toggleRepoSelection(row.rowId)"
              />
              <el-tooltip
                v-if="hasMultipleGroupAssociations(row.repo.id)"
                :content="getAssociationTooltip(row.repo.id)"
                placement="top"
                effect="dark"
                :show-after="120"
              >
                <span class="repo-association-indicator">
                  <Share2 :size="15" />
                </span>
              </el-tooltip>
              <span
                v-else
                class="repo-association-indicator repo-association-indicator--placeholder"
              ></span>
              <input
                v-model="row.repo.alias"
                class="app-input alias-input"
                type="text"
                placeholder="仓库别名"
              />
            </div>
          </template>
        </el-table-column>

        <el-table-column label="地址 / 路径" :min-width="pathColumnMinWidth">
          <template #default="{ row }">
            <template v-if="row.kind === 'repo'">
              <div class="repo-url-cell">
                <input
                  v-model="row.repo.url"
                  class="app-input"
                  type="text"
                  :placeholder="isLocalMode ? '/path/to/svn/repo' : 'https://svn.example.com'"
                />
                <button
                  v-if="isLocalMode"
                  type="button"
                  class="app-input-action icon-only"
                  aria-label="选择目录"
                  @click="pickDirectory(row.repo)"
                >
                  <FolderOpen :size="16" :stroke-width="2" />
                </button>
              </div>
            </template>
            <span v-else class="group-drop-tip"></span>
          </template>
        </el-table-column>

        <el-table-column v-if="!isLocalMode" label="用户名" min-width="96">
          <template #default="{ row }">
            <input
              v-if="row.kind === 'repo'"
              v-model="row.repo.username"
              class="app-input"
              type="text"
            />
          </template>
        </el-table-column>

        <el-table-column v-if="!isLocalMode" label="密码" min-width="96">
          <template #default="{ row }">
            <input
              v-if="row.kind === 'repo'"
              v-model="row.repo.password"
              class="app-input"
              type="password"
            />
          </template>
        </el-table-column>

        <el-table-column
          label="操作"
          :min-width="actionColumnMinWidth"
          align="left"
          header-align="left"
        >
          <template #default="{ row }">
            <div v-if="row.kind === 'group'" class="row-actions">
              <template v-if="editingGroupId !== row.group.id">
                <button
                  type="button"
                  class="repo-button is-primary icon-only"
                  aria-label="新增分组"
                  title="新增分组"
                  @click="createGroup"
                >
                  <FolderPlus :size="14" />
                </button>
                <button
                  type="button"
                  class="repo-button is-neutral icon-only"
                  aria-label="新增仓库"
                  title="新增仓库"
                  @click="addDraftRepositoryForGroup(row.group.id)"
                >
                  <PackagePlus :size="14" />
                </button>
                <button
                  v-if="!row.isUngrouped"
                  type="button"
                  class="repo-button is-neutral icon-only"
                  aria-label="编辑分组"
                  title="编辑分组"
                  @click="startEditGroup(row.group)"
                >
                  <Pencil :size="14" />
                </button>
                <button
                  v-if="!row.isUngrouped"
                  type="button"
                  class="repo-button is-danger icon-only"
                  aria-label="删除分组"
                  title="删除分组"
                  @click="deleteGroup(row.group)"
                >
                  <Trash2 :size="14" />
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="repo-button is-primary icon-only"
                  aria-label="保存分组"
                  title="保存分组"
                  @click="saveGroup(row.group)"
                >
                  <Check :size="14" />
                </button>
                <button
                  type="button"
                  class="repo-button is-neutral icon-only"
                  aria-label="取消编辑"
                  title="取消编辑"
                  @click="cancelEditGroup"
                >
                  <X :size="14" />
                </button>
              </template>
            </div>

            <div v-else class="row-actions">
              <button
                type="button"
                class="repo-button is-primary icon-only"
                :disabled="!isRepoDirty(row.repo, row.isDraft)"
                aria-label="保存仓库"
                title="保存仓库"
                @click="saveRepository(row.repo, row.isDraft, row.groupId)"
              >
                <Check :size="14" />
              </button>
              <button
                type="button"
                class="repo-button is-neutral icon-only"
                :disabled="!row.repo.url"
                aria-label="查看远程日志"
                title="查看远程日志"
                @click="viewRemoteLogs(row.repo)"
              >
                <ScrollText :size="14" />
              </button>
              <button
                v-if="!row.isUngroupedGroup"
                type="button"
                class="repo-button is-neutral icon-only remove-group-button"
                aria-label="移出当前分组"
                title="移出当前分组"
                @click="removeFromCurrentGroup(row)"
              >
                <Unlink :size="14" />
              </button>
              <button
                type="button"
                class="repo-button is-danger icon-only"
                aria-label="删除仓库"
                title="删除仓库"
                @click="deleteRepository(row)"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <SvnRemoteLogViewer
      :visible="showRemoteLogViewer"
      :repo-url="remoteLogRepoUrl"
      :title="remoteLogTitle"
      :allow-file-diff="true"
      @close="showRemoteLogViewer = false"
    />
  </section>
</template>

<style scoped>
.group-column-header {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

.group-column-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 0;
}

.group-column-header-actions :deep(.repo-button) {
  min-height: 8px;
  min-width: 8px;
  padding: 0;
  border-radius: 4px;
}

.grouped-body {
  padding-top: 6px;
}

.grouped-table :deep(.el-table__body-wrapper) {
  max-height: calc(100vh - 250px);
  overflow-y: auto;
}

.grouped-table :deep(.el-table__cell) {
  padding-top: 4px;
  padding-bottom: 4px;
}

.grouped-table :deep(.app-input) {
  height: 30px;
  padding: 4px 8px;
}

.grouped-table :deep(.repo-button) {
  min-height: 28px;
  padding: 4px 8px;
}

.grouped-table :deep(.el-table__row .el-table__cell:first-child .cell) {
  display: flex;
  align-items: center;
}

.group-cell {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  width: calc(100% - 4px);
  padding: 1px 6px;
  border-radius: 8px;
  transition: background-color 120ms ease;
}

.group-cell.is-drop-target {
  background: var(--color-primary-transparent);
}

.group-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.group-title strong {
  font-size: 15px;
  font-weight: 700;
}

.group-prefix-icon {
  color: var(--text-muted);
}

.group-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--menu-active);
  color: var(--text-secondary);
}

.group-input {
  max-width: 240px;
}

.repo-cell-name {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.alias-input {
  flex: 1;
  width: 100%;
  min-width: 0;
}

.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  cursor: grab;
  user-select: none;
  border-radius: 6px;
}

.drag-handle-associate {
  color: #2d8cf0;
  background: rgba(45, 140, 240, 0.12);
}

.drag-handle-move {
  color: #f08c2d;
  background: rgba(240, 140, 45, 0.14);
}

.drag-handle.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.repo-select-checkbox {
  margin: 0;
  width: 14px;
  height: 14px;
}

.repo-association-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: #2d8cf0;
  opacity: 0.9;
}

.repo-association-indicator--placeholder {
  color: transparent;
}

.repo-url-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-drop-tip {
  color: var(--text-muted);
  font-size: 12px;
}

.row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}

.remove-group-button {
  background: #ffd84d !important;
  border-color: #e6c13d !important;
  color: #6b4e00 !important;
}

.remove-group-button:hover {
  background: #ffcf33 !important;
}

:global(body.repo-dragging),
:global(body.repo-dragging *) {
  cursor: move !important;
}
</style>
