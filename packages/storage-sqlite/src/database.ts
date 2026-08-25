import { chmod, mkdir, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, parse } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PersistenceError,
  type PersistenceRepository,
  type StorageUnitOfWork,
} from '@vibe-helper/application'
import Database from 'better-sqlite3'

import { hasPendingMigrations, runMigrations } from './migration.js'
import { SqlitePersistenceRepository } from './repository.js'

const DATABASE_FILENAME = 'vibe-helper.sqlite'
const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(new URL('../drizzle', import.meta.url))

export interface SqliteStorageOptions {
  readonly dataDirectory: string
  readonly now?: () => Date
}

export interface StorageIntegrityResult {
  readonly quickCheck: 'ok'
  readonly foreignKeyViolations: 0
}

const quickCheck = (sqlite: Database.Database): void => {
  try {
    const rows = sqlite.pragma('quick_check') as readonly Record<string, unknown>[]
    const values = rows.flatMap((row) => Object.values(row))
    if (values.length !== 1 || values[0] !== 'ok') {
      throw new PersistenceError('INTEGRITY_CHECK_FAILED', 'SQLite quick_check failed')
    }
  } catch (error) {
    if (error instanceof PersistenceError) {
      throw error
    }
    throw new PersistenceError('CORRUPT_DATABASE', 'SQLite database could not be read safely')
  }
}

const foreignKeyCheck = (sqlite: Database.Database): void => {
  const rows = sqlite.pragma('foreign_key_check') as readonly unknown[]
  if (rows.length > 0) {
    throw new PersistenceError('INTEGRITY_CHECK_FAILED', 'SQLite foreign key check failed')
  }
}

const configureConnection = (sqlite: Database.Database, fileBacked: boolean): void => {
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  if (fileBacked) {
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('synchronous = NORMAL')
  }
}

const verifiedBackup = async (
  sqlite: Database.Database,
  databasePath: string,
  now: () => Date,
): Promise<string> => {
  const backupDirectory = join(dirname(databasePath), 'backups')
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 })
  const timestamp = now().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const backupPath = join(backupDirectory, `before-migration-${timestamp}.sqlite`)
  try {
    await sqlite.backup(backupPath)
    await chmod(backupPath, 0o600)
    const backup = new Database(backupPath, { fileMustExist: true })
    try {
      quickCheck(backup)
      backup.pragma('wal_checkpoint(TRUNCATE)')
      backup.pragma('journal_mode = DELETE')
    } finally {
      backup.close()
    }
    return backupPath
  } catch {
    throw new PersistenceError('BACKUP_FAILED', 'Pre-migration SQLite backup failed verification')
  }
}

export class SqliteStorage implements StorageUnitOfWork {
  readonly databasePath: string | null
  readonly repository: PersistenceRepository
  #closed = false
  readonly #sqlite: Database.Database

  constructor(sqlite: Database.Database, databasePath: string | null) {
    this.#sqlite = sqlite
    this.databasePath = databasePath
    this.repository = new SqlitePersistenceRepository(sqlite)
  }

  transaction<T>(work: (repository: PersistenceRepository) => T): T {
    this.#assertOpen()
    const transaction = this.#sqlite.transaction(() => work(this.repository))
    try {
      return transaction()
    } catch (error) {
      if (error instanceof PersistenceError) {
        throw error
      }
      throw new PersistenceError(
        'TRANSACTION_FAILED',
        'SQLite transaction failed and was rolled back',
      )
    }
  }

  checkIntegrity(): StorageIntegrityResult {
    this.#assertOpen()
    quickCheck(this.#sqlite)
    foreignKeyCheck(this.#sqlite)
    return { quickCheck: 'ok', foreignKeyViolations: 0 }
  }

  close(): void {
    if (!this.#closed) {
      this.#sqlite.close()
      this.#closed = true
    }
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new PersistenceError('STORAGE_CLOSED', 'SQLite storage is closed')
    }
  }
}

const initialize = async (
  sqlite: Database.Database,
  databasePath: string | null,
  migrationsDirectory: string,
  shouldBackup: boolean,
  now: () => Date,
): Promise<SqliteStorage> => {
  configureConnection(sqlite, databasePath !== null)
  quickCheck(sqlite)
  if (await hasPendingMigrations(sqlite, migrationsDirectory)) {
    if (shouldBackup && databasePath !== null) {
      await verifiedBackup(sqlite, databasePath, now)
    }
    runMigrations(sqlite, migrationsDirectory)
  }
  quickCheck(sqlite)
  foreignKeyCheck(sqlite)
  sqlite.pragma('trusted_schema = OFF')
  return new SqliteStorage(sqlite, databasePath)
}

export const openSqliteStorage = async (options: SqliteStorageOptions): Promise<SqliteStorage> => {
  const normalizedDirectory = normalize(options.dataDirectory)
  if (
    !isAbsolute(options.dataDirectory) ||
    normalizedDirectory === parse(normalizedDirectory).root
  ) {
    throw new PersistenceError(
      'INVALID_STORAGE_PATH',
      'SQLite data directory must be an explicit absolute path',
    )
  }
  try {
    await mkdir(normalizedDirectory, { recursive: true, mode: 0o700 })
  } catch {
    throw new PersistenceError('STORAGE_OPEN_FAILED', 'SQLite data directory could not be created')
  }
  const databasePath = join(normalizedDirectory, DATABASE_FILENAME)
  let existedWithContent = false
  try {
    existedWithContent = (await stat(databasePath)).size > 0
  } catch {
    existedWithContent = false
  }

  let sqlite: Database.Database
  try {
    sqlite = new Database(databasePath)
  } catch {
    throw new PersistenceError(
      existedWithContent ? 'CORRUPT_DATABASE' : 'STORAGE_OPEN_FAILED',
      'SQLite database could not be opened',
    )
  }
  try {
    await chmod(databasePath, 0o600)
  } catch {
    sqlite.close()
    throw new PersistenceError(
      'STORAGE_OPEN_FAILED',
      'SQLite database permissions could not be set',
    )
  }

  try {
    return await initialize(
      sqlite,
      databasePath,
      DEFAULT_MIGRATIONS_DIRECTORY,
      existedWithContent,
      options.now ?? (() => new Date()),
    )
  } catch (error) {
    if (sqlite.open) {
      sqlite.close()
    }
    if (error instanceof PersistenceError) {
      throw error
    }
    throw new PersistenceError(
      existedWithContent ? 'CORRUPT_DATABASE' : 'STORAGE_OPEN_FAILED',
      'SQLite storage initialization failed',
    )
  }
}

export const openInMemorySqliteStorage = async (): Promise<SqliteStorage> => {
  const sqlite = new Database(':memory:')
  try {
    return await initialize(sqlite, null, DEFAULT_MIGRATIONS_DIRECTORY, false, () => new Date(0))
  } catch (error) {
    if (sqlite.open) {
      sqlite.close()
    }
    throw error
  }
}
