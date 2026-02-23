type RepositoryData = {
  url: string
  username: string
  password: string
  alias: string
}

class Repository {
  url: string
  username: string
  password: string
  alias: string

  constructor(url: string, username: string, password: string, alias: string) {
    this.url = url
    this.username = username
    this.password = password
    this.alias = alias
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

  toJSON(): RepositoryData {
    return {
      url: this.url,
      username: this.username,
      password: this.password,
      alias: this.alias
    }
  }

  static fromJSON(data: RepositoryData): Repository {
    return new Repository(data.url, data.username, data.password, data.alias)
  }
}

export { Repository }
export type { RepositoryData }
