import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { PersistenceError } from '@vibe-helper/application'
import type BetterSqlite3 from 'better-sqlite3'

const require = createRequire(import.meta.url)
const { drizzle } = require('drizzle-orm/better-sqlite3') as {
  drizzle(sqlite: BetterSqlite3.Database): unknown
}
const { migrate } = require('drizzle-orm/better-sqlite3/migrator') as {
  migrate(database: unknown, options: { readonly migrationsFolder: string }): void
}

interface MigrationJournal {
  readonly entries: readonly { readonly when: number }[]
}

const appliedMigrationTimestamp = (sqlite: BetterSqlite3.Database): number => {
  const migrationTable = sqlite
    .prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get()
  if (migrationTable === undefined) {
    return 0
  }
  const row = sqlite
    .prepare('SELECT max(created_at) AS createdAt FROM __drizzle_migrations')
    .get() as { readonly createdAt: number | null }
  return row.createdAt ?? 0
}

export const hasPendingMigrations = async (
  sqlite: BetterSqlite3.Database,
  migrationsDirectory: string,
): Promise<boolean> => {
  try {
    const journal = JSON.parse(
      await readFile(join(migrationsDirectory, 'meta', '_journal.json'), 'utf8'),
    ) as MigrationJournal
    const latestAvailable = Math.max(0, ...journal.entries.map((entry) => entry.when))
    const applied = appliedMigrationTimestamp(sqlite)
    if (applied > latestAvailable)
      throw new PersistenceError('DATABASE_NEWER_THAN_PACKAGE', 'Database requires a newer package')
    return applied < latestAvailable
  } catch (error) {
    if (error instanceof PersistenceError) throw error
    throw new PersistenceError('MIGRATION_FAILED', 'Migration metadata could not be read')
  }
}

export const runMigrations = (
  sqlite: BetterSqlite3.Database,
  migrationsDirectory: string,
): void => {
  try {
    migrate(drizzle(sqlite), { migrationsFolder: migrationsDirectory })
  } catch {
    throw new PersistenceError('MIGRATION_FAILED', 'SQLite migration failed and was rolled back')
  }
}
