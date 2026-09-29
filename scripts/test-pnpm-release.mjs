// Run after typecheck: node scripts/test-pnpm-release.mjs /path/to/official-pnpm.tgz
// Model-0; synthetic private fixtures are intentionally retained for inspection.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, realpath, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  acquireProjectPnpm,
  PROJECT_PNPM,
  unpackPnpm,
} from '../packages/runtime/dist/project-toolchain.js'

const archive = await readFile(process.argv[2])
const files = unpackPnpm(archive)
const mutated = Buffer.from(archive)
mutated[mutated.length - 1] ^= 1
assert.throws(() => unpackPnpm(mutated), /PNPM_DOWNLOAD_HASH_MISMATCH/)
const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-pnpm-release-')))
let downloads = 0
const executable = await acquireProjectPnpm(join(root, 'tools'), {
  download: async (url) => {
    assert.equal(url, PROJECT_PNPM.url)
    downloads++
    return new Response(archive)
  },
})
assert.equal(await acquireProjectPnpm(join(root, 'tools'), { offline: true }), executable)
assert.equal(downloads, 1)
const run = promisify(execFile)
assert.equal(
  (await run(process.execPath, [executable, '--version'], { cwd: root })).stdout.trim(),
  PROJECT_PNPM.version,
)
await writeFile(
  join(root, 'package.json'),
  JSON.stringify({
    name: 'synthetic-pnpm-release-fixture',
    private: true,
    packageManager: `pnpm@${PROJECT_PNPM.version}`,
    scripts: { preinstall: "node -e \"require('fs').writeFileSync('script-ran','unexpected')\"" },
  }),
)
await writeFile(
  join(root, '.pnpmfile.cjs'),
  'require("node:fs").writeFileSync("hook-ran", "unexpected"); module.exports = {}\n',
)
await run(
  process.execPath,
  [executable, 'install', '--lockfile-only', '--ignore-scripts', '--ignore-pnpmfile'],
  {
    cwd: root,
    timeout: 30000,
  },
)
for (const name of ['script-ran', 'hook-ran', 'node_modules'])
  await assert.rejects(stat(join(root, name)), { code: 'ENOENT' })
assert.equal((await stat(join(root, 'pnpm-lock.yaml'))).isFile(), true)
console.log(
  JSON.stringify({
    pnpm: PROJECT_PNPM.version,
    archiveFiles: files.size,
    managedAcquisition: 'PASS',
    offlineReuse: 'PASS',
    scriptFreeLockfile: 'PASS',
    root,
  }),
)
