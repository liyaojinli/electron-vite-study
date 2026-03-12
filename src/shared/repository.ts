type RepositoryData = {
  id?: string
  url: string
  username: string
  password: string
  alias: string
  local?: boolean
}

class Repository {
  id: string
  url: string
  username: string
  password: string
  alias: string
  local: boolean

  constructor(
    id: string,
    url: string,
    username: string,
    password: string,
    alias: string,
    local: boolean = false
  ) {
    this.id = id
    this.url = url
    this.username = username
    this.password = password
    this.alias = alias
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
      data.local || false
    )
  }
}

export { Repository }
export type { RepositoryData }
