import { app } from 'electron'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import {
  Repository,
  type RepositoryData,
  type RepositoryGroupData,
  type RepositoryGroupMembershipData,
  type RepositoryScope
} from '../../shared/repository'
import {
  ensureRepositoryDbSchema,
  getRepositoryDb,
  initializeRepositoryDb,
  repositoryGroupMembershipTableName,
  repositoryGroupTableName,
  repositoryMigrationTableName,
  repositoryTableName
} from './db'

const remoteRepositoryFileName = 'repositories.json'
const localRepositoryFileName = 'local-repositories.json'
type RepositoryRow = {
  id: string
  url: string
  username: string
  password: string
  alias: string
  pipeline_id: string | null
  local: number
  sort_order: number
}

type RepositoryGroupRow = {
  id: string
  scope: RepositoryScope
  name: string
  is_default: number
}

type RepositoryGroupMembershipRow = {
  group_id: string
  repository_id: string
}

type MigrationScope = 'remote' | 'local'

const ungroupedName = '未分组'

let initializePromise: Promise<void> | null = null

const getRepositoryFilePath = (): string => {
  return path.join(app.getPath('userData'), remoteRepositoryFileName)
}

const getLocalRepositoryFilePath = (): string => {
  return path.join(app.getPath('userData'), localRepositoryFileName)
}

const normalizeString = (value: unknown): string => {
  return typeof value === 'string' ? value : ''
}

const normalizePipelineId = (value: unknown): string | null => {
  const normalized = normalizeString(value).trim()
  return normalized ? normalized : null
}

const normalizeRepositoryPath = (value: string, local: boolean): string => {
  const normalized = normalizeString(value)
    .trim()
    .replace(/[\\/]+$/, '')
  return local ? normalized.toLowerCase() : normalized
}

const createRepositoryId = (): string => {
  return randomUUID()
}

const nowIso = (): string => {
  return new Date().toISOString()
}

const toLocalFlag = (local: boolean): number => {
  return local ? 1 : 0
}

const toScope = (local: boolean): RepositoryScope => {
  return local ? 'local' : 'remote'
}

const rowToRepository = (row: RepositoryRow): Repository => {
  return Repository.fromJSON({
    id: row.id,
    url: row.url,
    username: row.username,
    password: row.password,
    alias: row.alias,
    pipeLineId: row.pipeline_id,
    local: row.local === 1
  })
}

const groupRowToData = (row: RepositoryGroupRow): RepositoryGroupData => {
  return {
    id: row.id,
    scope: row.scope,
    name: row.name,
    isDefault: row.is_default === 1
  }
}

const resolveIdentityIndex = (
  repos: Repository[],
  identity: Pick<RepositoryData, 'id' | 'url'>,
  local: boolean
): number => {
  const id = normalizeString(identity.id).trim()
  if (id) {
    const byIdIndex = repos.findIndex((item) => item.id === id)
    if (byIdIndex !== -1) {
      return byIdIndex
    }
  }

  const normalizedUrl = normalizeRepositoryPath(identity.url, local)
  if (!normalizedUrl) {
    return -1
  }

  return repos.findIndex((item) => normalizeRepositoryPath(item.url, local) === normalizedUrl)
}

const toRepository = (value: unknown, local: boolean = false): Repository | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const data = value as Partial<RepositoryData>
  return new Repository(
    normalizeString(data.id) || createRepositoryId(),
    normalizeString(data.url),
    normalizeString(data.username),
    normalizeString(data.password),
    normalizeString(data.alias),
    normalizePipelineId(data.pipeLineId),
    local
  )
}

const hasMigrationMarker = (scope: MigrationScope): boolean => {
  const database = getRepositoryDb()
  const row = database
    .prepare(`SELECT scope FROM ${repositoryMigrationTableName} WHERE scope = ?`)
    .get(scope) as { scope: string } | undefined
  return Boolean(row)
}

const setMigrationMarker = (scope: MigrationScope): void => {
  const database = getRepositoryDb()
  database
    .prepare(
      `INSERT INTO ${repositoryMigrationTableName}(scope, migrated_at)
       VALUES (?, ?)
       ON CONFLICT(scope) DO UPDATE SET migrated_at = excluded.migrated_at`
    )
    .run(scope, nowIso())
}

const countByScope = (local: boolean): number => {
  const database = getRepositoryDb()
  const row = database
    .prepare(`SELECT COUNT(1) AS total FROM ${repositoryTableName} WHERE local = ?`)
    .get(toLocalFlag(local)) as { total: number }
  return row.total
}

const readRepositoriesFromLegacyJson = async (local: boolean): Promise<Repository[]> => {
  const filePath = local ? getLocalRepositoryFilePath() : getRepositoryFilePath()
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((item) => toRepository(item, local))
      .filter((repo): repo is Repository => repo !== null)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

const migrateScopeFromJson = async (scope: MigrationScope, local: boolean): Promise<void> => {
  if (hasMigrationMarker(scope)) {
    return
  }

  if (countByScope(local) === 0) {
    const legacyRepos = await readRepositoriesFromLegacyJson(local)
    if (legacyRepos.length > 0) {
      const database = getRepositoryDb()
      const existingIds = new Set(
        (
          database.prepare(`SELECT id FROM ${repositoryTableName}`).all() as Array<{ id: string }>
        ).map((row) => row.id)
      )
      const insertStmt = database.prepare(
        `INSERT INTO ${repositoryTableName}
        (id, url, username, password, alias, pipeline_id, local, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )

      const executeInsert = database.transaction((repos: Repository[]) => {
        repos.forEach((repo, index) => {
          let nextId = normalizeString(repo.id).trim()
          if (!nextId || existingIds.has(nextId)) {
            do {
              nextId = createRepositoryId()
            } while (existingIds.has(nextId))
          }
          existingIds.add(nextId)

          const url = normalizeString(repo.url).trim()
          if (!url) {
            return
          }

          insertStmt.run(
            nextId,
            url,
            normalizeString(repo.username),
            normalizeString(repo.password),
            normalizeString(repo.alias),
            normalizePipelineId(repo.pipeLineId),
            toLocalFlag(local),
            index,
            nowIso(),
            nowIso()
          )
        })
      })

      executeInsert(legacyRepos)
    }
  }

  setMigrationMarker(scope)
}

const initializePersistence = async (): Promise<void> => {
  await initializeRepositoryDb()
  ensureRepositoryDbSchema()
  await migrateScopeFromJson('remote', false)
  await migrateScopeFromJson('local', true)
}

const ensureInitialized = async (): Promise<void> => {
  if (!initializePromise) {
    initializePromise = initializePersistence()
  }

  try {
    await initializePromise
  } catch (error) {
    initializePromise = null
    throw error
  }
}

const listRowsByScope = (local: boolean): RepositoryRow[] => {
  const database = getRepositoryDb()
  return database
    .prepare(
      `SELECT id, url, username, password, alias, pipeline_id, local, sort_order
       FROM ${repositoryTableName}
       WHERE local = ?
       ORDER BY sort_order ASC, rowid ASC`
    )
    .all(toLocalFlag(local)) as RepositoryRow[]
}

const listDataByScope = async (local: boolean): Promise<RepositoryData[]> => {
  await ensureInitialized()
  return listRowsByScope(local).map((row) => rowToRepository(row).toJSON())
}

const getRowByIndex = (local: boolean, index: number): RepositoryRow | null => {
  if (index < 0) {
    return null
  }

  const database = getRepositoryDb()
  const row = database
    .prepare(
      `SELECT id, url, username, password, alias, pipeline_id, local, sort_order
       FROM ${repositoryTableName}
       WHERE local = ?
       ORDER BY sort_order ASC, rowid ASC
       LIMIT 1 OFFSET ?`
    )
    .get(toLocalFlag(local), index) as RepositoryRow | undefined
  return row || null
}

const findRowByIdentity = (
  local: boolean,
  identity: Pick<RepositoryData, 'id' | 'url'>
): RepositoryRow | null => {
  const database = getRepositoryDb()
  const id = normalizeString(identity.id).trim()
  if (id) {
    const byId = database
      .prepare(
        `SELECT id, url, username, password, alias, pipeline_id, local, sort_order
        FROM ${repositoryTableName}
         WHERE id = ? AND local = ?`
      )
      .get(id, toLocalFlag(local)) as RepositoryRow | undefined
    if (byId) {
      return byId
    }
  }

  const normalizedUrl = normalizeRepositoryPath(identity.url, local)
  if (!normalizedUrl) {
    return null
  }

  const rows = listRowsByScope(local)
  const targetIndex = resolveIdentityIndex(
    rows.map((row) => rowToRepository(row)),
    identity,
    local
  )
  return targetIndex >= 0 ? rows[targetIndex] : null
}

const insertByScopeAndIndex = async (
  local: boolean,
  index: number,
  repo: RepositoryData
): Promise<RepositoryData[]> => {
  await ensureInitialized()

  const database = getRepositoryDb()
  const total = countByScope(local)
  if (index < 0 || index > total) {
    throw new Error(`${local ? 'Local ' : ''}repository index out of range.`)
  }

  const id = normalizeString(repo.id).trim() || createRepositoryId()
  const executeInsert = database.transaction(() => {
    database
      .prepare(
        `UPDATE ${repositoryTableName}
         SET sort_order = sort_order + 1, updated_at = ?
         WHERE local = ? AND sort_order >= ?`
      )
      .run(nowIso(), toLocalFlag(local), index)

    database
      .prepare(
        `INSERT INTO ${repositoryTableName}
         (id, url, username, password, alias, pipeline_id, local, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        normalizeString(repo.url),
        normalizeString(repo.username),
        normalizeString(repo.password),
        normalizeString(repo.alias),
        normalizePipelineId(repo.pipeLineId),
        toLocalFlag(local),
        index,
        nowIso(),
        nowIso()
      )
  })

  executeInsert()
  return listDataByScope(local)
}

const updateByScopeAndId = async (
  local: boolean,
  id: string,
  repo: RepositoryData
): Promise<RepositoryData[]> => {
  await ensureInitialized()
  const database = getRepositoryDb()

  database
    .prepare(
      `UPDATE ${repositoryTableName}
       SET url = ?, username = ?, password = ?, alias = ?, pipeline_id = ?, updated_at = ?
       WHERE id = ? AND local = ?`
    )
    .run(
      normalizeString(repo.url),
      normalizeString(repo.username),
      normalizeString(repo.password),
      normalizeString(repo.alias),
      normalizePipelineId(repo.pipeLineId),
      nowIso(),
      id,
      toLocalFlag(local)
    )

  return listDataByScope(local)
}

const deleteByScopeAndId = async (local: boolean, id: string): Promise<RepositoryData[]> => {
  await ensureInitialized()
  const database = getRepositoryDb()

  const row = database
    .prepare(`SELECT sort_order FROM ${repositoryTableName} WHERE id = ? AND local = ?`)
    .get(id, toLocalFlag(local)) as { sort_order: number } | undefined
  if (!row) {
    throw new Error(`${local ? 'Local ' : ''}repository not found by identity.`)
  }

  const executeDelete = database.transaction(() => {
    database
      .prepare(`DELETE FROM ${repositoryTableName} WHERE id = ? AND local = ?`)
      .run(id, toLocalFlag(local))

    database
      .prepare(
        `UPDATE ${repositoryTableName}
         SET sort_order = sort_order - 1, updated_at = ?
         WHERE local = ? AND sort_order > ?`
      )
      .run(nowIso(), toLocalFlag(local), row.sort_order)
  })

  executeDelete()
  return listDataByScope(local)
}

const listRepositoryGroupsByScope = async (local: boolean): Promise<RepositoryGroupData[]> => {
  await ensureInitialized()
  const database = getRepositoryDb()
  const rows = database
    .prepare(
      `SELECT id, scope, name, is_default
       FROM ${repositoryGroupTableName}
       WHERE scope = ? AND is_default = 0
       ORDER BY name ASC`
    )
    .all(toScope(local)) as RepositoryGroupRow[]
  return rows.map(groupRowToData)
}

const createRepositoryGroupByScope = async (
  local: boolean,
  name: string
): Promise<RepositoryGroupData[]> => {
  await ensureInitialized()
  const groupName = normalizeString(name).trim()
  if (!groupName) {
    throw new Error('分组名不能为空。')
  }
  if (groupName === ungroupedName) {
    throw new Error('未分组为系统保留名称。')
  }

  const database = getRepositoryDb()
  database
    .prepare(
      `INSERT INTO ${repositoryGroupTableName}
       (id, scope, name, is_default, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    )
    .run(createRepositoryId(), toScope(local), groupName, nowIso(), nowIso())

  return listRepositoryGroupsByScope(local)
}

const updateRepositoryGroupByScope = async (
  local: boolean,
  groupId: string,
  name: string
): Promise<RepositoryGroupData[]> => {
  await ensureInitialized()
  const groupName = normalizeString(name).trim()
  if (!groupName) {
    throw new Error('分组名不能为空。')
  }
  if (groupName === ungroupedName) {
    throw new Error('未分组为系统保留名称。')
  }

  const database = getRepositoryDb()
  const target = database
    .prepare(
      `SELECT id, is_default
       FROM ${repositoryGroupTableName}
       WHERE id = ? AND scope = ?`
    )
    .get(groupId, toScope(local)) as { id: string; is_default: number } | undefined

  if (!target) {
    throw new Error('分组不存在。')
  }
  if (target.is_default === 1) {
    throw new Error('系统分组不允许重命名。')
  }

  database
    .prepare(
      `UPDATE ${repositoryGroupTableName}
       SET name = ?, updated_at = ?
       WHERE id = ? AND scope = ?`
    )
    .run(groupName, nowIso(), groupId, toScope(local))

  return listRepositoryGroupsByScope(local)
}

const deleteRepositoryGroupByScope = async (
  local: boolean,
  groupId: string
): Promise<RepositoryGroupData[]> => {
  await ensureInitialized()
  const database = getRepositoryDb()

  const target = database
    .prepare(
      `SELECT id, is_default
       FROM ${repositoryGroupTableName}
       WHERE id = ? AND scope = ?`
    )
    .get(groupId, toScope(local)) as { id: string; is_default: number } | undefined

  if (!target) {
    throw new Error('分组不存在。')
  }
  if (target.is_default === 1) {
    throw new Error('系统分组不允许删除。')
  }

  const execute = database.transaction(() => {
    database
      .prepare(`DELETE FROM ${repositoryGroupTableName} WHERE id = ? AND scope = ?`)
      .run(groupId, toScope(local))
  })

  execute()
  return listRepositoryGroupsByScope(local)
}

const listRepositoryGroupMembershipsByScope = async (
  local: boolean
): Promise<RepositoryGroupMembershipData[]> => {
  await ensureInitialized()
  const database = getRepositoryDb()
  const rows = database
    .prepare(
      `SELECT m.group_id, m.repository_id
       FROM ${repositoryGroupMembershipTableName} m
       INNER JOIN ${repositoryGroupTableName} g ON g.id = m.group_id
       INNER JOIN ${repositoryTableName} r ON r.id = m.repository_id
       WHERE g.scope = ? AND g.is_default = 0 AND r.local = ?`
    )
    .all(toScope(local), toLocalFlag(local)) as RepositoryGroupMembershipRow[]

  return rows.map((row) => ({
    groupId: row.group_id,
    repositoryId: row.repository_id
  }))
}

const assignRepositoriesToGroupByScope = async (
  local: boolean,
  groupId: string,
  repositoryIds: string[]
): Promise<RepositoryGroupMembershipData[]> => {
  await ensureInitialized()
  const database = getRepositoryDb()

  const group = database
    .prepare(
      `SELECT id
       FROM ${repositoryGroupTableName}
       WHERE id = ? AND scope = ?`
    )
    .get(groupId, toScope(local)) as { id: string } | undefined

  if (!group) {
    throw new Error('目标分组不存在。')
  }

  const cleanedIds = Array.from(
    new Set(repositoryIds.map((id) => normalizeString(id).trim()).filter(Boolean))
  )
  if (cleanedIds.length === 0) {
    return listRepositoryGroupMembershipsByScope(local)
  }

  const execute = database.transaction((ids: string[]) => {
    const insert = database.prepare(
      `INSERT OR IGNORE INTO ${repositoryGroupMembershipTableName}
       (group_id, repository_id, created_at)
       VALUES (?, ?, ?)`
    )

    const verifyRepo = database.prepare(
      `SELECT id FROM ${repositoryTableName} WHERE id = ? AND local = ?`
    )

    ids.forEach((repositoryId) => {
      const exists = verifyRepo.get(repositoryId, toLocalFlag(local)) as { id: string } | undefined
      if (exists) {
        insert.run(groupId, repositoryId, nowIso())
      }
    })
  })

  execute(cleanedIds)
  return listRepositoryGroupMembershipsByScope(local)
}

const removeRepositoryFromGroupByScope = async (
  local: boolean,
  groupId: string,
  repositoryId: string
): Promise<RepositoryGroupMembershipData[]> => {
  await ensureInitialized()
  const database = getRepositoryDb()
  const group = database
    .prepare(
      `SELECT id
       FROM ${repositoryGroupTableName}
       WHERE id = ? AND scope = ?`
    )
    .get(groupId, toScope(local)) as { id: string } | undefined

  if (!group) {
    throw new Error('分组不存在。')
  }

  database
    .prepare(
      `DELETE FROM ${repositoryGroupMembershipTableName}
       WHERE group_id = ? AND repository_id = ?`
    )
    .run(groupId, repositoryId)

  return listRepositoryGroupMembershipsByScope(local)
}

const listRemoteRepositoryGroups = async (): Promise<RepositoryGroupData[]> => {
  return listRepositoryGroupsByScope(false)
}

const listLocalRepositoryGroups = async (): Promise<RepositoryGroupData[]> => {
  return listRepositoryGroupsByScope(true)
}

const createRemoteRepositoryGroup = async (name: string): Promise<RepositoryGroupData[]> => {
  return createRepositoryGroupByScope(false, name)
}

const createLocalRepositoryGroup = async (name: string): Promise<RepositoryGroupData[]> => {
  return createRepositoryGroupByScope(true, name)
}

const updateRemoteRepositoryGroup = async (
  groupId: string,
  name: string
): Promise<RepositoryGroupData[]> => {
  return updateRepositoryGroupByScope(false, groupId, name)
}

const updateLocalRepositoryGroup = async (
  groupId: string,
  name: string
): Promise<RepositoryGroupData[]> => {
  return updateRepositoryGroupByScope(true, groupId, name)
}

const deleteRemoteRepositoryGroup = async (groupId: string): Promise<RepositoryGroupData[]> => {
  return deleteRepositoryGroupByScope(false, groupId)
}

const deleteLocalRepositoryGroup = async (groupId: string): Promise<RepositoryGroupData[]> => {
  return deleteRepositoryGroupByScope(true, groupId)
}

const listRemoteRepositoryGroupMemberships = async (): Promise<RepositoryGroupMembershipData[]> => {
  return listRepositoryGroupMembershipsByScope(false)
}

const listLocalRepositoryGroupMemberships = async (): Promise<RepositoryGroupMembershipData[]> => {
  return listRepositoryGroupMembershipsByScope(true)
}

const assignRemoteRepositoriesToGroup = async (
  groupId: string,
  repositoryIds: string[]
): Promise<RepositoryGroupMembershipData[]> => {
  return assignRepositoriesToGroupByScope(false, groupId, repositoryIds)
}

const assignLocalRepositoriesToGroup = async (
  groupId: string,
  repositoryIds: string[]
): Promise<RepositoryGroupMembershipData[]> => {
  return assignRepositoriesToGroupByScope(true, groupId, repositoryIds)
}

const removeRemoteRepositoryFromGroup = async (
  groupId: string,
  repositoryId: string
): Promise<RepositoryGroupMembershipData[]> => {
  return removeRepositoryFromGroupByScope(false, groupId, repositoryId)
}

const removeLocalRepositoryFromGroup = async (
  groupId: string,
  repositoryId: string
): Promise<RepositoryGroupMembershipData[]> => {
  return removeRepositoryFromGroupByScope(true, groupId, repositoryId)
}

// Remote Repository Operations
const listRepositories = async (): Promise<RepositoryData[]> => {
  return listDataByScope(false)
}

const createRepository = async (repo: RepositoryData): Promise<RepositoryData[]> => {
  await ensureInitialized()
  return insertByScopeAndIndex(false, countByScope(false), repo)
}

const insertRepository = async (index: number, repo: RepositoryData): Promise<RepositoryData[]> => {
  return insertByScopeAndIndex(false, index, repo)
}

const updateRepository = async (index: number, repo: RepositoryData): Promise<RepositoryData[]> => {
  await ensureInitialized()

  const row = getRowByIndex(false, index)
  if (!row) {
    throw new Error('Repository index out of range.')
  }

  return updateByScopeAndId(false, row.id, { ...repo, id: repo.id || row.id })
}

const deleteRepository = async (index: number): Promise<RepositoryData[]> => {
  await ensureInitialized()

  const row = getRowByIndex(false, index)
  if (!row) {
    throw new Error('Repository index out of range.')
  }

  return deleteByScopeAndId(false, row.id)
}

const updateRepositoryByIdentity = async (repo: RepositoryData): Promise<RepositoryData[]> => {
  await ensureInitialized()

  const targetRow = findRowByIdentity(false, repo)
  if (!targetRow) {
    throw new Error('Repository not found by identity.')
  }

  return updateByScopeAndId(false, targetRow.id, { ...repo, id: repo.id || targetRow.id })
}

const deleteRepositoryByIdentity = async (
  identity: Pick<RepositoryData, 'id' | 'url'>
): Promise<RepositoryData[]> => {
  await ensureInitialized()

  const targetRow = findRowByIdentity(false, identity)
  if (!targetRow) {
    throw new Error('Repository not found by identity.')
  }

  return deleteByScopeAndId(false, targetRow.id)
}

const verifyRepository = async (
  repo: RepositoryData
): Promise<{ ok: boolean; message?: string }> => {
  return new Promise((resolve) => {
    execFile(
      'svn',
      [
        'info',
        repo.url,
        '--non-interactive',
        '--trust-server-cert',
        // 支持各种 SSL 证书失败情况（SVN 1.9+）
        '--trust-server-cert-failures=unknown-ca,cn-mismatch,expired,not-yet-valid,other',
        '--username',
        repo.username,
        '--password',
        repo.password,
        '--no-auth-cache'
      ],
      { timeout: 10000, maxBuffer: 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (!error) {
          resolve({ ok: true })
          return
        }

        if (error.code === 'ENOENT') {
          resolve({ ok: false, message: '未找到 svn 命令，请先安装 SVN 客户端。' })
          return
        }

        const message = stderr?.trim() || error.message || 'SVN 连接验证失败。'
        resolve({ ok: false, message })
      }
    )
  })
}

// Local Repository Operations
const listLocalRepositories = async (): Promise<RepositoryData[]> => {
  return listDataByScope(true)
}

const createLocalRepository = async (repo: RepositoryData): Promise<RepositoryData[]> => {
  await ensureInitialized()
  return insertByScopeAndIndex(true, countByScope(true), { ...repo, local: true })
}

const insertLocalRepository = async (
  index: number,
  repo: RepositoryData
): Promise<RepositoryData[]> => {
  return insertByScopeAndIndex(true, index, { ...repo, local: true })
}

const updateLocalRepository = async (
  index: number,
  repo: RepositoryData
): Promise<RepositoryData[]> => {
  await ensureInitialized()

  const row = getRowByIndex(true, index)
  if (!row) {
    throw new Error('Local repository index out of range.')
  }

  return updateByScopeAndId(true, row.id, {
    ...repo,
    id: repo.id || row.id,
    local: true
  })
}

const deleteLocalRepository = async (index: number): Promise<RepositoryData[]> => {
  await ensureInitialized()

  const row = getRowByIndex(true, index)
  if (!row) {
    throw new Error('Local repository index out of range.')
  }

  return deleteByScopeAndId(true, row.id)
}

const updateLocalRepositoryByIdentity = async (repo: RepositoryData): Promise<RepositoryData[]> => {
  await ensureInitialized()

  const targetRow = findRowByIdentity(true, repo)
  if (!targetRow) {
    throw new Error('Local repository not found by identity.')
  }

  return updateByScopeAndId(true, targetRow.id, {
    ...repo,
    id: repo.id || targetRow.id,
    local: true
  })
}

const deleteLocalRepositoryByIdentity = async (
  identity: Pick<RepositoryData, 'id' | 'url'>
): Promise<RepositoryData[]> => {
  await ensureInitialized()

  const targetRow = findRowByIdentity(true, identity)
  if (!targetRow) {
    throw new Error('Local repository not found by identity.')
  }

  return deleteByScopeAndId(true, targetRow.id)
}

const verifyLocalRepository = async (
  repo: RepositoryData
): Promise<{ ok: boolean; message?: string }> => {
  try {
    await fs.stat(repo.url)
    return { ok: true }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { ok: false, message: '本地路径不存在' }
    }
    return { ok: false, message: error instanceof Error ? error.message : '路径验证失败' }
  }
}

export {
  listRemoteRepositoryGroups,
  listLocalRepositoryGroups,
  createRemoteRepositoryGroup,
  createLocalRepositoryGroup,
  updateRemoteRepositoryGroup,
  updateLocalRepositoryGroup,
  deleteRemoteRepositoryGroup,
  deleteLocalRepositoryGroup,
  listRemoteRepositoryGroupMemberships,
  listLocalRepositoryGroupMemberships,
  assignRemoteRepositoriesToGroup,
  assignLocalRepositoriesToGroup,
  removeRemoteRepositoryFromGroup,
  removeLocalRepositoryFromGroup,
  listRepositories,
  createRepository,
  insertRepository,
  updateRepository,
  deleteRepository,
  updateRepositoryByIdentity,
  deleteRepositoryByIdentity,
  verifyRepository,
  listLocalRepositories,
  createLocalRepository,
  insertLocalRepository,
  updateLocalRepository,
  deleteLocalRepository,
  updateLocalRepositoryByIdentity,
  deleteLocalRepositoryByIdentity,
  verifyLocalRepository
}
