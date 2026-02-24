type RepositoryData = {
  url: string
  username: string
  password: string
  alias: string
  local?: boolean
}

class Repository {
  url: string
  username: string
  password: string
  alias: string
  local: boolean

  constructor(
    url: string,
    username: string,
    password: string,
    alias: string,
    local: boolean = false
  ) {
    this.url = url
    this.username = username
    this.password = password
    this.alias = alias
    this.local = local
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
      url: this.url,
      username: this.username,
      password: this.password,
      alias: this.alias,
      local: this.local
    }
  }

  static fromJSON(data: RepositoryData): Repository {
    return new Repository(data.url, data.username, data.password, data.alias, data.local || false)
  }
}

export { Repository }
export type { RepositoryData }
