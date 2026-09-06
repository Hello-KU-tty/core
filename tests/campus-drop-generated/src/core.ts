import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const MAX_FILE_BYTES = 1_048_576

export type DownloadFailure = 'NOT_FOUND' | 'EXPIRED' | 'CONSUMED'

interface TransferRow {
  readonly id: string
  readonly original_name: string
  readonly blob_name: string
  readonly expires_at: number
  readonly consumed_at: number | null
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function validFilename(filename: string): boolean {
  const trimmed = filename.trim()
  return (
    trimmed.length > 0 &&
    trimmed.length <= 120 &&
    !trimmed.includes('/') &&
    !trimmed.includes('\\') &&
    !trimmed.includes('\0')
  )
}

export class CampusDropStore {
  readonly #database: DatabaseSync
  readonly #blobDirectory: string

  private constructor(database: DatabaseSync, blobDirectory: string) {
    this.#database = database
    this.#blobDirectory = blobDirectory
  }

  static async open(dataDirectory: string): Promise<CampusDropStore> {
    await mkdir(dataDirectory, { recursive: true, mode: 0o700 })
    const blobDirectory = join(dataDirectory, 'blobs')
    await mkdir(blobDirectory, { recursive: true, mode: 0o700 })
    const database = new DatabaseSync(join(dataDirectory, 'metadata.sqlite'))
    database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS transfers (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        blob_name TEXT NOT NULL UNIQUE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      ) STRICT;
    `)
    return new CampusDropStore(database, blobDirectory)
  }

  async create(input: {
    readonly filename: string
    readonly bytes: Uint8Array
    readonly ttlSeconds: number
    readonly now: number
  }): Promise<{ readonly id: string; readonly token: string; readonly expiresAt: number }> {
    if (!validFilename(input.filename)) throw new TypeError('INVALID_FILENAME')
    if (input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_FILE_BYTES) {
      throw new RangeError('INVALID_FILE_SIZE')
    }
    if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 30 || input.ttlSeconds > 3_600) {
      throw new RangeError('INVALID_TTL')
    }
    const id = randomUUID()
    const token = randomBytes(24).toString('base64url')
    const blobName = `${id}.bin`
    const expiresAt = input.now + input.ttlSeconds * 1_000
    await writeFile(join(this.#blobDirectory, blobName), input.bytes, { flag: 'wx', mode: 0o600 })
    this.#database
      .prepare(
        'INSERT INTO transfers (id, original_name, blob_name, token_hash, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, NULL)',
      )
      .run(id, input.filename.trim(), blobName, tokenHash(token), expiresAt)
    return { id, token, expiresAt }
  }

  async consume(
    token: string,
    now: number,
  ): Promise<
    | { readonly ok: true; readonly filename: string; readonly bytes: Uint8Array }
    | { readonly ok: false; readonly reason: DownloadFailure }
  > {
    if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return { ok: false, reason: 'NOT_FOUND' }
    const row = this.#database
      .prepare(
        'SELECT id, original_name, blob_name, expires_at, consumed_at FROM transfers WHERE token_hash = ?',
      )
      .get(tokenHash(token)) as TransferRow | undefined
    if (row === undefined) return { ok: false, reason: 'NOT_FOUND' }
    if (row.consumed_at !== null) return { ok: false, reason: 'CONSUMED' }
    if (now >= row.expires_at) return { ok: false, reason: 'EXPIRED' }
    const bytes = await readFile(join(this.#blobDirectory, row.blob_name))
    const updated = this.#database
      .prepare('UPDATE transfers SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
      .run(now, row.id)
    if (updated.changes !== 1) return { ok: false, reason: 'CONSUMED' }
    return {
      ok: true,
      filename: row.original_name,
      bytes,
    }
  }

  close(): void {
    this.#database.close()
  }
}
