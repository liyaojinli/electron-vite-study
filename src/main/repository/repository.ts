import { app } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { Repository, type RepositoryData } from '../../shared/repository'

const repositoryFileName = 'repositories.json'

const getRepositoryFilePath = (): string => {
  return path.join(app.getPath('userData'), repositoryFileName)
}

const normalizeString = (value: unknown): string => {
  return typeof value === 'string' ? value : ''
}

const toRepository = (value: unknown): Repository | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const data = value as Partial<RepositoryData>
  return new Repository(
    normalizeString(data.url),
    normalizeString(data.username),
    normalizeString(data.password),
    normalizeString(data.alias)
  )
}

const readRepositories = async (): Promise<Repository[]> => {
  const filePath = getRepositoryFilePath()
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.map(toRepository).filter((repo): repo is Repository => repo !== null)
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

export {
  listRepositories,
  createRepository,
  insertRepository,
  updateRepository,
  deleteRepository,
  verifyRepository
}
