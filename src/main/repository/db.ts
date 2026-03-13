import { app } from 'electron'
import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js'

const repositoryTableName = 'repositories'
const repositoryMigrationTableName = 'repository_migration_state'
const repositoryGroupTableName = 'repository_groups'
const repositoryGroupMembershipTableName = 'repository_group_memberships'
const repositorySqliteFileName = 'repositories.sqljs.db'

type QueryParams = unknown[] | Record<string, unknown>

class SqlJsPreparedQuery {
  private readonly db: SqlJsDatabase

  private readonly sql: string

  constructor(db: SqlJsDatabase, sql: string) {
    this.db = db
    this.sql = sql
  }

  private bind(statement: { bind: (params?: unknown) => void }, args: unknown[]): void {
    if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      statement.bind(args[0] as QueryParams)
      return
    }

    statement.bind(args as QueryParams)
  }

  run(...args: unknown[]): { changes: number } {
    const before = this.db.getRowsModified()
    const stmt = this.db.prepare(this.sql)
    try {
      this.bind(stmt, args)
      stmt.step()
    } finally {
      stmt.free()
    }

    return { changes: this.db.getRowsModified() - before }
  }

  get(...args: unknown[]): Record<string, unknown> | undefined {
    const stmt = this.db.prepare(this.sql)
    try {
      this.bind(stmt, args)
      if (!stmt.step()) {
        return undefined
      }

      return stmt.getAsObject() as Record<string, unknown>
    } finally {
      stmt.free()
    }
  }

  all(...args: unknown[]): Array<Record<string, unknown>> {
    const stmt = this.db.prepare(this.sql)
    try {
      this.bind(stmt, args)
      const rows: Array<Record<string, unknown>> = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, unknown>)
      }
      return rows
    } finally {
      stmt.free()
    }
  }
}

class SqlJsDatabaseAdapter {
  private readonly db: SqlJsDatabase

  private readonly dbFilePath: string

  private transactionDepth = 0

  private dirty = false

  constructor(db: SqlJsDatabase, dbFilePath: string) {
    this.db = db
    this.dbFilePath = dbFilePath
  }

  private isMutatingSql(sql: string): boolean {
    return /^(\s)*(insert|update|delete|create|drop|alter|replace|pragma|vacuum|reindex)/i.test(sql)
  }

  private flushToDiskIfNeeded(): void {
    if (this.transactionDepth > 0 || !this.dirty) {
      return
    }

    const data = this.db.export()
    fs.writeFileSync(this.dbFilePath, Buffer.from(data))
    this.dirty = false
  }

  exec(sql: string): void {
    this.db.exec(sql)
    if (this.isMutatingSql(sql)) {
      this.dirty = true
      this.flushToDiskIfNeeded()
    }
  }

  prepare(sql: string): SqlJsPreparedQuery {
    const query = new SqlJsPreparedQuery(this.db, sql)
    const originalRun = query.run.bind(query)
    query.run = (...args: unknown[]) => {
      const result = originalRun(...args)
      if (this.isMutatingSql(sql)) {
        this.dirty = true
        this.flushToDiskIfNeeded()
      }
      return result
    }
    return query
  }

  transaction<TArgs extends unknown[]>(fn: (...args: TArgs) => void): (...args: TArgs) => void {
    return (...args: TArgs) => {
      this.db.exec('BEGIN')
      this.transactionDepth += 1

      try {
        fn(...args)
        this.db.exec('COMMIT')
        this.dirty = true
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      } finally {
        this.transactionDepth -= 1
        this.flushToDiskIfNeeded()
      }
    }
  }
}

let sqlJs: SqlJsStatic | null = null
let repositoryDb: SqlJsDatabaseAdapter | null = null

const getRepositoryDbFilePath = (): string => {
  return path.join(app.getPath('userData'), repositorySqliteFileName)
}

const initializeRepositoryDb = async (): Promise<void> => {
  if (repositoryDb) {
    return
  }

  if (!sqlJs) {
    const require = createRequire(import.meta.url)
    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    const wasmBinary = fs.readFileSync(wasmPath)
    sqlJs = await initSqlJs({ wasmBinary })
  }

  const dbPath = getRepositoryDbFilePath()
  const dbData = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined
  const rawDb = dbData ? new sqlJs.Database(dbData) : new sqlJs.Database()
  repositoryDb = new SqlJsDatabaseAdapter(rawDb, dbPath)
}

const getRepositoryDb = (): SqlJsDatabaseAdapter => {
  if (!repositoryDb) {
    throw new Error('Repository database is not initialized.')
  }

  return repositoryDb
}

const createRepositoryTables = (database: SqlJsDatabaseAdapter): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ${repositoryTableName} (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      alias TEXT NOT NULL,
      local INTEGER NOT NULL CHECK (local IN (0, 1)),
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_${repositoryTableName}_local_sort
      ON ${repositoryTableName}(local, sort_order);

    CREATE TABLE IF NOT EXISTS ${repositoryMigrationTableName} (
      scope TEXT PRIMARY KEY,
      migrated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ${repositoryGroupTableName} (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL CHECK (is_default IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(scope, name)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_${repositoryGroupTableName}_default
      ON ${repositoryGroupTableName}(scope, is_default)
      WHERE is_default = 1;

    CREATE TABLE IF NOT EXISTS ${repositoryGroupMembershipTableName} (
      group_id TEXT NOT NULL,
      repository_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(group_id, repository_id),
      FOREIGN KEY(group_id) REFERENCES ${repositoryGroupTableName}(id) ON DELETE CASCADE,
      FOREIGN KEY(repository_id) REFERENCES ${repositoryTableName}(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_${repositoryGroupMembershipTableName}_repo
      ON ${repositoryGroupMembershipTableName}(repository_id);
  `)
}

const ensureRepositoryDbSchema = (): void => {
  createRepositoryTables(getRepositoryDb())
}

export {
  ensureRepositoryDbSchema,
  initializeRepositoryDb,
  getRepositoryDb,
  repositoryGroupMembershipTableName,
  repositoryGroupTableName,
  repositoryMigrationTableName,
  repositoryTableName
}
