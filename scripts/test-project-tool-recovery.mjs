import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { appendFile, cp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { writeToolchainFixture } from './project-toolchain-fixture.mjs'

const api = createRequire(import.meta.url)(resolve('dist/portable-core-win32-x64/bin/runtime.cjs'))
const { root } = JSON.parse(await readFile('dist/project-tools-location.json', 'utf8'))
assert.match(root, /vibe-w4-tools-[A-Za-z0-9]+$/)
assert.equal(await api.isPrivateDirectory(root), true)
const installed = await api.ownedPrivateDirectory(join(root, '검증 설치물 ' + randomUUID()))
await cp(resolve('dist/portable-core-win32-x64'), installed, { recursive: true })
const resources = await api.loadCoreResources(installed)
const toolRoot = join(root, 'ABSENT 도구')
const tc = await api.selectProjectToolchain({
  resources,
  privateRoot: toolRoot,
  nodeExecutables: [],
  pnpmExecutables: [],
  offline: true,
})
const workspace = await api.ownedPrivateDirectory(join(root, 'recovery 생성 앱 ' + randomUUID()))
await writeToolchainFixture(workspace)
await api.prepareProjectTools(workspace, tc, resources)
const { descriptorFile } = await api.verifyProjectTools(workspace, resources)
const run = promisify(execFile)
const invoke = (args) =>
  run(
    tc.node.executable,
    [join(resources.root, 'bin/project-tools.mjs'), descriptorFile, ...args],
    {
      cwd: workspace,
      env: api.projectEnvironment(tc),
      windowsHide: true,
      timeout: 45000,
      maxBuffer: 16000,
    },
  )
await assert.rejects(invoke(['pnpm', 'run', 'build']), (error) =>
  /VERIFY_DEPS_BEFORE_RUN/.test(error.stdout + error.stderr),
)
await writeFile(
  join(workspace, 'pnpm-workspace.yaml'),
  'allowBuilds:\n  unexpected-package: true\n',
)
await assert.rejects(invoke(['pnpm', 'install', '--frozen-lockfile']), (error) =>
  error.stderr.includes('PROJECT_INSTALL_ALLOWLIST_DENIED'),
)
await writeFile(join(workspace, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: true\n')
await invoke(['pnpm', 'install', '--lockfile-only', '--ignore-scripts', '--ignore-pnpmfile'])
await invoke(['pnpm', 'install', '--frozen-lockfile'])
await writeFile(join(workspace, '.npmrc'), 'ignore-scripts=false\n')
await assert.rejects(invoke(['pnpm', 'install', '--frozen-lockfile']), (error) =>
  error.stderr.includes('PROJECT_PACKAGE_CONFIG_DENIED'),
)
const cacheRoot = join(toolRoot, 'pnpm-cache')
const cache = join(cacheRoot, 'pnpm-11.12.0')
const archive = await readFile(join(cache, 'package.tgz'))
await appendFile(join(cache, 'dist/pnpm.mjs'), '\n// synthetic corruption\n')
await assert.rejects(
  api.acquireProjectPnpm(cacheRoot, { offline: true }),
  /PNPM_OFFLINE_UNAVAILABLE/,
)
await api.acquireProjectPnpm(cacheRoot, { download: async () => new Response(archive) })
await api.acquireProjectPnpm(cacheRoot, { offline: true })
const failures = await api.ownedPrivateDirectory(join(root, 'interrupted-acquisition'))
await assert.rejects(
  api.acquireProjectPnpm(failures, {
    download: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]))
            controller.error(new Error('synthetic interrupt'))
          },
        }),
      ),
  }),
  /PNPM_DOWNLOAD_INTERRUPTED/,
)
const controller = new AbortController()
await assert.rejects(
  api.acquireProjectPnpm(failures, {
    signal: controller.signal,
    download: async () => {
      controller.abort()
      throw new Error('synthetic cancel')
    },
  }),
  /PNPM_DOWNLOAD_CANCELLED/,
)
const receipt = {
  status: 'PASS',
  cachedOffline: true,
  approvedConfigLockRefresh: true,
  frozenInstallAfterRefresh: true,
  noImplicitInstall: true,
  foreignLifecycleDenied: true,
  localNpmrcDenied: true,
  corruptCacheQuarantined: true,
  repairedCacheVerified: true,
  interrupted: true,
  cancelled: true,
}
await writeFile('dist/project-tool-recovery-receipt.json', JSON.stringify(receipt, null, 2))
console.log(JSON.stringify(receipt))
