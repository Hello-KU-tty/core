import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)
const execute = promisify(execFile)
const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-mac-package-')))
const installed = join(root, '설치 패키지')
await cp(resolve(process.argv[2] ?? 'dist/portable-core-darwin-arm64'), installed, {
  recursive: true,
})
const api = require(join(installed, 'bin/runtime.cjs'))
const sdk = require(join(installed, 'bin/client.cjs'))
const { createCoreLifecycle } = require(join(installed, 'bin/lifecycle.cjs'))
const storagePath = await api.ownedPrivateDirectory(join(root, '사용자 저장소'))
const resources = await api.loadCoreResources(installed)
const selected = await api.selectCoreRuntime({
  resourceRoot: installed,
  privateRoot: join(root, 'core-tools'),
  nodeExecutables: [],
  offline: true,
})
assert.equal(selected.runtime.executable, join(installed, 'bin/node'))
const managers = []
const create = () => {
  const manager = createCoreLifecycle({
    api,
    connect: sdk.connectLocalCore,
    readConnection: sdk.readLocalConnection,
    storagePath,
    selectRuntime: async () => selected,
  })
  managers.push(manager)
  return manager
}
const passed = []
function pass(name) {
  passed.push(name)
  console.log(JSON.stringify({ check: name, status: 'PASS' }))
}
const waitUntil = async (check) => {
  const until = Date.now() + 45000
  while (Date.now() < until) {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 250))
  }
  throw new Error('MAC_TEST_TIMEOUT')
}
try {
  const a = create(),
    b = create()
  const [first, second] = await Promise.all([a.start(), b.start()])
  assert.equal(first.health.backendInstanceId, second.health.backendInstanceId)
  pass('fresh_simultaneous_hosts_one_core')
  const client = await sdk.connectLocalCore(first.connectionFile)
  const projectId = `project_${randomUUID()}`
  await client.execute({
    schemaVersion: 1,
    actor: { kind: 'UI' },
    kind: 'UI_START_DISCOVERY',
    projectId,
    correlationId: `corr_${randomUUID()}`,
    idempotencyKey: `idem_${randomUUID()}`,
    input: { learningGoal: 'Synthetic Mac package persistence' },
  })
  const before = await client.restoreProject(projectId)
  await a.dispose()
  assert.deepEqual((await client.restoreProject(projectId)).project, before.project)
  const c = create()
  assert.equal((await c.start()).health.backendInstanceId, first.health.backendInstanceId)
  pass('host_reload_preserves_core_and_history')
  const workspace = await api.ownedPrivateDirectory(join(root, '생성 프로젝트'))
  const tc = await api.selectProjectToolchain({
    resources,
    privateRoot: join(root, 'project-tools'),
    nodeExecutables: [],
    pnpmExecutables: [],
  })
  await api.prepareProjectTools(workspace, tc, resources)
  const verified = await api.verifyProjectTools(workspace, resources)
  assert.equal(verified.toolchain.node.executable, join(installed, 'bin/node'))
  const reused = await api.selectProjectToolchain({
    resources,
    privateRoot: join(root, 'project-tools'),
    nodeExecutables: [join(root, 'unavailable-node')],
    pnpmExecutables: [join(root, 'unavailable-pnpm')],
    offline: true,
  })
  assert.deepEqual(reused, tc)
  pass('recorded_tools_reused_without_developer_path')
  await writeFile(
    join(workspace, 'package.json'),
    JSON.stringify({
      name: 'mac-package-probe',
      version: '1.0.0',
      private: true,
      scripts: { verify: 'node --test version.test.cjs' },
    }),
  )
  await writeFile(
    join(workspace, 'version.test.cjs'),
    "require('node:assert/strict').equal(process.version, 'v24.19.0'); console.log('MAC_NODE_OK')\n",
  )
  for (const args of [
    ['install', '--lockfile-only', '--ignore-scripts', '--ignore-pnpmfile'],
    ['install', '--frozen-lockfile'],
  ])
    await execute('/bin/sh', ['.kiro/vibe-tools.cmd', 'pnpm', ...args], {
      cwd: workspace,
      env: api.projectEnvironment(tc, {}),
      timeout: 30000,
    })
  for (const command of [
    ['node', '--test', 'version.test.cjs'],
    ['pnpm', 'run', 'verify'],
  ]) {
    const result = await execute('/bin/sh', ['.kiro/vibe-tools.cmd', ...command], {
      cwd: workspace,
      env: api.projectEnvironment(tc, {}),
      timeout: 30000,
    })
    assert.match(result.stdout, /MAC_NODE_OK/)
  }
  const direct = await execute('/bin/sh', ['-c', 'node --version && pnpm --version'], {
    cwd: workspace,
    env: api.projectEnvironment(tc, {}),
    timeout: 30000,
  })
  assert.equal(direct.stdout.trim(), 'v24.19.0\n11.13.1')
  pass('bundled_node_acquired_pnpm_korean_space_paths')
  const launcher = join(workspace, '.kiro/vibe-tools.cmd')
  const original = await readFile(launcher, 'utf8')
  await writeFile(launcher, original + '# tamper\n')
  await assert.rejects(api.verifyProjectTools(workspace, resources), /PROJECT_LAUNCHER_CHANGED/)
  await assert.rejects(
    api.selectProjectToolchain({
      resources,
      privateRoot: join(root, 'project-tools'),
      nodeExecutables: [],
      pnpmExecutables: [],
      offline: true,
    }),
    /PROJECT_RECORDED_TOOLCHAIN_INVALID/,
  )
  await writeFile(launcher, original)
  pass('project_launcher_tamper_denied')
  await b.dispose()
  await c.dispose()
  await waitUntil(async () => {
    try {
      await client.health()
      return false
    } catch {
      return true
    }
  })
  const d = create()
  const restarted = await d.start()
  const reconnected = await sdk.connectLocalCore(restarted.connectionFile)
  assert.deepEqual((await reconnected.restoreProject(projectId)).project, before.project)
  pass('final_lease_shutdown_restart_persistence')
  await writeFile(
    resolve('dist/macos-package-test.json'),
    JSON.stringify(
      { status: 'PASS', passed, modelCalls: 0, temporaryDataPreserved: true },
      null,
      2,
    ),
  )
} finally {
  for (const manager of managers) await manager.dispose()
}
