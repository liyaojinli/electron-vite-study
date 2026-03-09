import { app } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { Repository, type RepositoryData } from '../../shared/repository'

const remoteRepositoryFileName = 'repositories.json'
const localRepositoryFileName = 'local-repositories.json'

const getRepositoryFilePath = (): string => {
  return path.join(app.getPath('userData'), remoteRepositoryFileName)
}

const getLocalRepositoryFilePath = (): string => {
  return path.join(app.getPath('userData'), localRepositoryFileName)
}

const normalizeString = (value: unknown): string => {
  return typeof value === 'string' ? value : ''
}

const toRepository = (value: unknown, local: boolean = false): Repository | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const data = value as Partial<RepositoryData>
  return new Repository(
    normalizeString(data.url),
    normalizeString(data.username),
    normalizeString(data.password),
    normalizeString(data.alias),
    local
  )
}

// Remote Repository Operations
const readRepositories = async (): Promise<Repository[]> => {
  const filePath = getRepositoryFilePath()
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.map((item) => toRepository(item, false)).filter((repo): repo is Repository => repo !== null)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

const writeRepositories = async (repos: Repository[]): Promise<void> => {
  const filePath = getRepositoryFilePath()
  const data = repos.map((repo) => repo.toJSON())
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

const listRepositories = async (): Promise<RepositoryData[]> => {
  const repos = await readRepositories()
  return repos.map((repo) => repo.toJSON())
}

const createRepository = async (repo: RepositoryData): Promise<RepositoryData[]> => {
  const repos = await readRepositories()
  repos.push(Repository.fromJSON(repo))
  await writeRepositories(repos)
  return repos.map((item) => item.toJSON())
}

const insertRepository = async (index: number, repo: RepositoryData): Promise<RepositoryData[]> => {
  const repos = await readRepositories()
  if (index < 0 || index > repos.length) {
    throw new Error('Repository index out of range.')
  }
  repos.splice(index, 0, Repository.fromJSON(repo))
  await writeRepositories(repos)
  return repos.map((item) => item.toJSON())
}

const updateRepository = async (index: number, repo: RepositoryData): Promise<RepositoryData[]> => {
  const repos = await readRepositories()
  if (index < 0 || index >= repos.length) {
    throw new Error('Repository index out of range.')
  }
  repos[index] = Repository.fromJSON(repo)
  await writeRepositories(repos)
  return repos.map((item) => item.toJSON())
}

const deleteRepository = async (index: number): Promise<RepositoryData[]> => {
  const repos = await readRepositories()
  if (index < 0 || index >= repos.length) {
    throw new Error('Repository index out of range.')
  }
  repos.splice(index, 1)
  await writeRepositories(repos)
  return repos.map((item) => item.toJSON())
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
const readLocalRepositories = async (): Promise<Repository[]> => {
  const filePath = getLocalRepositoryFilePath()
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.map((item) => toRepository(item, true)).filter((repo): repo is Repository => repo !== null)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

const writeLocalRepositories = async (repos: Repository[]): Promise<void> => {
  const filePath = getLocalRepositoryFilePath()
  const data = repos.map((repo) => repo.toJSON())
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

const listLocalRepositories = async (): Promise<RepositoryData[]> => {
  const repos = await readLocalRepositories()
  return repos.map((repo) => repo.toJSON())
}

const createLocalRepository = async (repo: RepositoryData): Promise<RepositoryData[]> => {
  const repos = await readLocalRepositories()
  repos.push(Repository.fromJSON({ ...repo, local: true }))
  await writeLocalRepositories(repos)
  return repos.map((item) => item.toJSON())
}

const insertLocalRepository = async (index: number, repo: RepositoryData): Promise<RepositoryData[]> => {
  const repos = await readLocalRepositories()
  if (index < 0 || index > repos.length) {
    throw new Error('Local repository index out of range.')
  }
  repos.splice(index, 0, Repository.fromJSON({ ...repo, local: true }))
  await writeLocalRepositories(repos)
  return repos.map((item) => item.toJSON())
}

const updateLocalRepository = async (index: number, repo: RepositoryData): Promise<RepositoryData[]> => {
  const repos = await readLocalRepositories()
  if (index < 0 || index >= repos.length) {
    throw new Error('Local repository index out of range.')
  }
  repos[index] = Repository.fromJSON({ ...repo, local: true })
  await writeLocalRepositories(repos)
  return repos.map((item) => item.toJSON())
}

const deleteLocalRepository = async (index: number): Promise<RepositoryData[]> => {
  const repos = await readLocalRepositories()
  if (index < 0 || index >= repos.length) {
    throw new Error('Local repository index out of range.')
  }
  repos.splice(index, 1)
  await writeLocalRepositories(repos)
  return repos.map((item) => item.toJSON())
}

const verifyLocalRepository = async (repo: RepositoryData): Promise<{ ok: boolean; message?: string }> => {
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
  listRepositories,
  createRepository,
  insertRepository,
  updateRepository,
  deleteRepository,
  verifyRepository,
  listLocalRepositories,
  createLocalRepository,
  insertLocalRepository,
  updateLocalRepository,
  deleteLocalRepository,
  verifyLocalRepository
}
