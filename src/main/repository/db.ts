import { app } from 'electron'
import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import path from 'path'

const repositoryTableName = 'repositories'
const repositoryMigrationTableName = 'repository_migration_state'
const repositorySqliteFileName = 'repositories.db'

let repositoryDb: BetterSqlite3.Database | null = null

const getRepositoryDbFilePath = (): string => {
  return path.join(app.getPath('userData'), repositorySqliteFileName)
}

const getRepositoryDb = (): BetterSqlite3.Database => {
  if (!repositoryDb) {
    repositoryDb = new Database(getRepositoryDbFilePath())
    repositoryDb.pragma('journal_mode = WAL')
    repositoryDb.pragma('foreign_keys = ON')
  }

  return repositoryDb
}

const createRepositoryTables = (database: BetterSqlite3.Database): void => {
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
  `)
}

const ensureRepositoryDbSchema = (): void => {
  createRepositoryTables(getRepositoryDb())
}

export {
  ensureRepositoryDbSchema,
  getRepositoryDb,
  repositoryMigrationTableName,
  repositoryTableName
}
