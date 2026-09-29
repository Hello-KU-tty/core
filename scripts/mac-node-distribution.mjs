import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

// Official nodejs.org v24.19.0 SHASUMS256.txt; archive remains for reproducibility.
export async function macNodeDistribution() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.version !== 'v24.19.0')
    throw new Error('MAC_BUILD_TOOLCHAIN_REQUIRED')
  const name = 'node-v24.19.0-darwin-arm64'
  const expected = '8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d'
  const stage = await mkdtemp(join(tmpdir(), 'vibe-mac-node-'))
  const response = await fetch(`https://nodejs.org/dist/v24.19.0/${name}.tar.gz`, {
    redirect: 'error',
    signal: AbortSignal.timeout(120000),
  })
  if (!response.ok || !response.body) throw new Error('MAC_NODE_DOWNLOAD_FAILED')
  const chunks = []
  let bytes = 0
  for await (const chunk of response.body) {
    bytes += chunk.length
    if (bytes > 90 * 1024 * 1024) throw new Error('MAC_NODE_ARCHIVE_TOO_LARGE')
    chunks.push(chunk)
  }
  const data = Buffer.concat(chunks)
  if (createHash('sha256').update(data).digest('hex') !== expected)
    throw new Error('MAC_NODE_HASH_MISMATCH')
  const archive = join(stage, 'node.tar.gz')
  await writeFile(archive, data, { flag: 'wx' })
  await promisify(execFile)('/usr/bin/tar', [
    '-xzf',
    archive,
    '-C',
    stage,
    `${name}/bin/node`,
    `${name}/LICENSE`,
  ])
  const node = join(stage, name, 'bin/node')
  const license = join(stage, name, 'LICENSE')
  if (!(await readFile(license, 'utf8')).includes('Node.js'))
    throw new Error('MAC_NODE_LICENSE_INVALID')
  const result = await promisify(execFile)(node, ['--version'])
  if (result.stdout.trim() !== 'v24.19.0') throw new Error('MAC_NODE_VERSION_INVALID')
  return { node, license }
}
