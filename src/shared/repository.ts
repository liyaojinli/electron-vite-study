class Repository {
  private url: string
  private username: string
  private password: string
  private alias: string

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
}

export { Repository }
