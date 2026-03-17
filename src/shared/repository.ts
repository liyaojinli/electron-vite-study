type RepositoryData = {
  id?: string
  url: string
  username: string
  password: string
  alias: string
  pipeLineId?: string | null
  local?: boolean
}

type RepositoryScope = 'remote' | 'local'

type RepositoryGroupData = {
  id: string
  scope: RepositoryScope
  name: string
  isDefault: boolean
}

type RepositoryGroupMembershipData = {
  groupId: string
  repositoryId: string
}

class Repository {
  id: string
  url: string
  username: string
  password: string
  alias: string
  pipeLineId: string | null
  local: boolean

  constructor(
    id: string,
    url: string,
    username: string,
    password: string,
    alias: string,
    pipeLineId: string | null = null,
    local: boolean = false
  ) {
    this.id = id
    this.url = url
    this.username = username
    this.password = password
    this.alias = alias
    this.pipeLineId = pipeLineId
    this.local = local
  }

  getId(): string {
    return this.id
  }

  getUrl(): string {
    return this.url
  }

  getUsername(): string {
    return this.username
  }

  getPassword(): string {
    return this.password
  }

  getAlias(): string {
    return this.alias
  }

  getPipeLineId(): string | null {
    return this.pipeLineId
  }

  isLocal(): boolean {
    return this.local
  }

  toJSON(): RepositoryData {
    return {
      id: this.id,
      url: this.url,
      username: this.username,
      password: this.password,
      alias: this.alias,
      pipeLineId: this.pipeLineId,
      local: this.local
    }
  }

  static fromJSON(data: RepositoryData): Repository {
    return new Repository(
      data.id || '',
      data.url,
      data.username,
      data.password,
      data.alias,
      data.pipeLineId ?? null,
      data.local || false
    )
  }
}

export { Repository }
export type { RepositoryData, RepositoryGroupData, RepositoryGroupMembershipData, RepositoryScope }
