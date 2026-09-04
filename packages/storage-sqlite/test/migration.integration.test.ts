import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { PersistenceError } from '@vibe-helper/application'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

import { openSqliteStorage } from '../src/index.js'
import { runMigrations } from '../src/migration.js'
import { SqlitePersistenceRepository } from '../src/repository.js'
import { projectFixture } from '../../contracts/test/fixtures.js'

const journal = (
  entries: readonly { readonly idx: number; readonly when: number; readonly tag: string }[],
) =>
  JSON.stringify({
    version: '7',
    dialect: 'sqlite',
    entries: entries.map((entry) => ({ ...entry, version: '6', breakpoints: true })),
  })

describe('SQLite initialization and migrations', () => {
  it('requires an explicit absolute data directory and creates the fixed database file', async () => {
    await expect(openSqliteStorage({ dataDirectory: 'relative/data' })).rejects.toMatchObject({
      code: 'INVALID_STORAGE_PATH',
    })
    const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-helper-init-'))
    const storage = await openSqliteStorage({ dataDirectory })
    expect(storage.databasePath).toBe(join(dataDirectory, 'vibe-helper.sqlite'))
    expect(storage.checkIntegrity()).toEqual({ quickCheck: 'ok', foreignKeyViolations: 0 })
    storage.close()
  })

  it('preserves a corrupt file and reports a typed failure instead of replacing it', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-helper-corrupt-'))
    const databasePath = join(dataDirectory, 'vibe-helper.sqlite')
    const original = Buffer.from('not a sqlite database\n', 'utf8')
    await writeFile(databasePath, original)

    await expect(openSqliteStorage({ dataDirectory })).rejects.toMatchObject({
      code: expect.stringMatching(/CORRUPT_DATABASE|STORAGE_OPEN_FAILED/u),
    })
    expect(await readFile(databasePath)).toEqual(original)
  })

  it('detects valid JSON tampering through the canonical payload hash', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-helper-hash-'))
    const storage = await openSqliteStorage({ dataDirectory })
    storage.repository.appendProject(projectFixture)
    const databasePath = storage.databasePath
    storage.close()
    expect(databasePath).not.toBeNull()
    if (databasePath === null) return

    const raw = new Database(databasePath)
    raw
      .prepare(
        "UPDATE project_revisions SET payload_json = json_set(payload_json, '$.title', 'Tampered') WHERE project_id = ? AND revision = 1",
      )
      .run(projectFixture.id)
    raw.close()

    const reopened = await openSqliteStorage({ dataDirectory })
    expect(() => reopened.repository.recoverProject(projectFixture.id)).toThrowError(
      expect.objectContaining({ code: 'CORRUPT_DATABASE' }),
    )
    reopened.close()
  })

  it('backs up an existing healthy database before attempting a pending migration', async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'vibe-helper-backup-'))
    const databasePath = join(dataDirectory, 'vibe-helper.sqlite')
    const oldMigrations = join(dataDirectory, 'old-migrations')
    await mkdir(join(oldMigrations, 'meta'), { recursive: true })
    await copyFile(
      fileURLToPath(new URL('../drizzle/0000_daily_moira_mactaggert.sql', import.meta.url)),
      join(oldMigrations, '0000_daily_moira_mactaggert.sql'),
    )
    await writeFile(
      join(oldMigrations, 'meta', '_journal.json'),
      journal([{ idx: 0, when: 1_787_653_782_008, tag: '0000_daily_moira_mactaggert' }]),
    )
    const raw = new Database(databasePath)
    raw.pragma('foreign_keys = ON')
    runMigrations(raw, oldMigrations)
    new SqlitePersistenceRepository(raw).appendProject(projectFixture)
    raw.close()

    const migrated = await openSqliteStorage({
      dataDirectory,
      now: () => new Date('2026-08-25T12:34:56.789Z'),
    })
    expect(migrated.repository.recoverProject(projectFixture.id)?.project).toEqual(projectFixture)
    expect(migrated.repository.readDiscoveryAggregate(projectFixture.id)).toBeNull()
    migrated.close()

    const backupDirectory = join(dataDirectory, 'backups')
    const backups = await readdir(backupDirectory)
    expect(backups).toEqual(['before-migration-2026-08-25T12-34-56-789Z.sqlite'])
    const backup = new Database(join(backupDirectory, backups[0] as string), {
      fileMustExist: true,
      readonly: true,
    })
    expect(backup.pragma('quick_check')).toEqual([{ quick_check: 'ok' }])
    expect(backup.prepare('SELECT count(*) AS count FROM projects').get()).toEqual({ count: 1 })
    backup.close()

    const original = new Database(databasePath, { fileMustExist: true, readonly: true })
    expect(original.pragma('quick_check')).toEqual([{ quick_check: 'ok' }])
    expect(original.prepare('SELECT count(*) AS count FROM projects').get()).toEqual({ count: 1 })
    expect(
      original
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('candidate_preview_rounds', 'candidate_enrichments') ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: 'candidate_enrichments' }, { name: 'candidate_preview_rounds' }])
    original.close()
  })

  it('rolls back a migration that fails after an earlier statement', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-migration-'))
    const migrationsDirectory = join(temporaryRoot, 'drizzle')
    const metadataDirectory = join(migrationsDirectory, 'meta')
    await mkdir(metadataDirectory, { recursive: true })
    await writeFile(
      join(metadataDirectory, '_journal.json'),
      journal([{ idx: 0, when: 1, tag: '0000_base' }]),
    )
    await writeFile(
      join(migrationsDirectory, '0000_base.sql'),
      'CREATE TABLE durable (id INTEGER PRIMARY KEY, value TEXT NOT NULL);',
    )

    const sqlite = new Database(join(temporaryRoot, 'migration.sqlite'))
    runMigrations(sqlite, migrationsDirectory)
    sqlite.prepare("INSERT INTO durable (value) VALUES ('kept')").run()

    await writeFile(
      join(metadataDirectory, '_journal.json'),
      journal([
        { idx: 0, when: 1, tag: '0000_base' },
        { idx: 1, when: 2, tag: '0001_fails' },
      ]),
    )
    await writeFile(
      join(migrationsDirectory, '0001_fails.sql'),
      'ALTER TABLE durable ADD COLUMN leaked TEXT;--> statement-breakpoint\nINSERT INTO missing_table (value) VALUES (1);',
    )

    expect(() => runMigrations(sqlite, migrationsDirectory)).toThrowError(
      expect.objectContaining<Partial<PersistenceError>>({ code: 'MIGRATION_FAILED' }),
    )
    const columns = sqlite.pragma('table_info(durable)') as readonly { readonly name: string }[]
    expect(columns.map((column) => column.name)).toEqual(['id', 'value'])
    expect(sqlite.prepare('SELECT value FROM durable').all()).toEqual([{ value: 'kept' }])
    expect(sqlite.prepare('SELECT count(*) AS count FROM __drizzle_migrations').get()).toEqual({
      count: 1,
    })
    sqlite.close()
  })
})
