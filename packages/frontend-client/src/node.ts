import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { localConnectionSchema, type LocalConnection } from '@vibe-helper/contracts'
import { LocalClientError, LocalCoreClient } from './index.js'

export async function readLocalConnection(file: string): Promise<LocalConnection> {
  if (!isAbsolute(file)) throw new LocalClientError('ABSOLUTE_CONNECTION_FILE_REQUIRED')
  const stats = await lstat(file)
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 16_384)
    throw new LocalClientError('CONNECTION_FILE_INVALID')
  if (process.platform !== 'win32' && (stats.mode & 0o077) !== 0)
    throw new LocalClientError('CONNECTION_FILE_NOT_PRIVATE')
  try {
    return localConnectionSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  } catch {
    throw new LocalClientError('CONNECTION_FILE_INVALID')
  }
}
export async function connectLocalCore(file: string): Promise<LocalCoreClient> {
  const client = new LocalCoreClient(await readLocalConnection(file))
  await client.health()
  return client
}
