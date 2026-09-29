import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { inventory, sha256 } from '../examples/frontend-handoff/archive.mjs'

const run = promisify(execFile)
export async function archiveMacos(root, output) {
  if (process.platform !== 'darwin') throw new Error('MAC_ARCHIVER_REQUIRED')
  const files = await inventory(root)
  await run('/usr/bin/zip', ['-X', '-q', output, ...files.map((file) => file.name)], {
    cwd: root,
  })
  await run('/usr/bin/unzip', ['-tqq', output])
  const listing = await run('/usr/bin/unzip', ['-Z1', output])
  if (
    JSON.stringify(listing.stdout.trim().split('\n').sort()) !==
    JSON.stringify(files.map((file) => file.name).sort())
  )
    throw new Error('ARCHIVE_INVENTORY_MISMATCH')
  for (const file of files) {
    const { stdout } = await run(
      '/usr/bin/unzip',
      ['-p', output, file.name.replaceAll('[', '[[]')],
      {
        encoding: 'buffer',
        maxBuffer: 160 * 1024 * 1024,
      },
    )
    if (stdout.length !== file.bytes || sha256(stdout) !== file.sha256)
      throw new Error('ARCHIVE_HASH_MISMATCH')
  }
  const bytes = await readFile(output)
  return { bytes: bytes.length, sha256: sha256(bytes), files }
}
