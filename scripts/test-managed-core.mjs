import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, readdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { privateDirectory } from '../packages/runtime/dist/private-directory.js'

const require = createRequire(import.meta.url)
const root = await privateDirectory(await mkdtemp(join(tmpdir(), 'vibe-w3-managed-')))
const installed = join(root, '설치 패키지')
await cp(resolve('dist/portable-core-win32-x64'), installed, { recursive: true })
const api = require(join(installed, 'bin/runtime.cjs'))
const sdk = require(join(installed, 'bin/client.cjs'))
const { createCoreLifecycle } = require(join(installed, 'bin/lifecycle.cjs'))
const storagePath = await api.ownedPrivateDirectory(join(root, '사용자 저장소'))
const resources = await api.loadCoreResources(installed)
const toolRoot = await api.ownedPrivateDirectory(join(root, '도구'))
const runtime = await api.probeCoreRuntime(
  { source: 'EXISTING_NODE', executable: process.execPath },
  resources,
  toolRoot,
)
const managers = []
const statuses = []
const phases = []
const observedAt = Date.now()
const create = (selectedResources = resources) => {
  const manager = createCoreLifecycle({
    api,
    connect: sdk.connectLocalCore,
    readConnection: sdk.readLocalConnection,
    storagePath,
    selectRuntime: async () => ({ resources: selectedResources, runtime }),
  })
  const managerIndex = managers.length
  manager.subscribe((value) => {
    statuses.push(value)
    const observation = {
      managerIndex,
      phase: value.phase,
      errorCode: value.errorCode ?? null,
      elapsedMs: Date.now() - observedAt,
    }
    phases.push(observation)
    console.log(JSON.stringify({ check: 'lifecyclePhase', ...observation }))
  })
  managers.push(manager)
  return manager
}
const cases = {}
const record = (name) => {
  cases[name] = 'PASS'
  console.log(JSON.stringify({ check: name, status: 'PASS' }))
}
const waitUntil = async (check, timeout = 45000) => {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 250))
  }
  throw new Error('W3_WAIT_TIMEOUT')
}
const connectionFile = join(storagePath, 'core-data/connection.json')
const ownerFile = join(storagePath, 'core-data/backend.lock/owner.json')
try {
  // Simulate a PID reused by a live unrelated process, without killing that process.
  const staleData = await api.ownedPrivateDirectory(join(storagePath, 'core-data'))
  await api.ownedPrivateDirectory(join(staleData, 'backend.lock'))
  await writeFile(
    ownerFile,
    JSON.stringify({ pid: process.pid, instanceId: randomUUID(), packageHash: '0'.repeat(64) }),
    { mode: 0o600 },
  )
  await utimes(ownerFile, 0, 0)
  const a = create(),
    b = create()
  const [first, second] = await Promise.all([a.start(), b.start()])
  assert.equal(first.health.backendInstanceId, second.health.backendInstanceId)
  assert.deepEqual(
    new Set([a.getStatus().ownership, b.getStatus().ownership]),
    new Set(['OWNED', 'SHARED']),
  )
  assert.equal(process.kill(process.pid, 0), true)
  record('reused_pid_stale_lock_recovered_without_killing_process')
  record('simultaneous_initialization_one_core')
  const client = await sdk.connectLocalCore(connectionFile)
  const projectId = `project_${randomUUID()}`,
    correlationId = `corr_${randomUUID()}`
  await client.execute({
    schemaVersion: 1,
    actor: { kind: 'UI' },
    kind: 'UI_START_DISCOVERY',
    projectId,
    correlationId,
    idempotencyKey: `idem_${randomUUID()}`,
    input: { learningGoal: 'Synthetic W3 lifecycle persistence' },
  })
  const before = await client.restoreProject(projectId)
  const oldDescriptor = await sdk.readLocalConnection(connectionFile)
  const owned = a.getStatus().ownership === 'OWNED' ? a : b
  const shared = owned === a ? b : a
  await owned.dispose()
  assert.equal((await client.health()).backendInstanceId, first.health.backendInstanceId)
  const reloaded = create()
  assert.equal((await reloaded.start()).health.backendInstanceId, first.health.backendInstanceId)
  record('owner_reload_keeps_shared_core')
  const lock = JSON.parse(await readFile(ownerFile, 'utf8'))
  process.kill(lock.pid)
  await waitUntil(
    () =>
      shared.getStatus().phase === 'CORE_CONNECTED' &&
      shared.getStatus().backendInstanceId !== first.health.backendInstanceId,
  )
  const restoredClient = await sdk.connectLocalCore(connectionFile)
  const after = await restoredClient.restoreProject(projectId)
  assert.deepEqual(after.project, before.project)
  assert.equal(after.discoverySession.id, before.discoverySession.id)
  const newDescriptor = await sdk.readLocalConnection(connectionFile)
  assert.notEqual(oldDescriptor.token, newDescriptor.token)
  assert.equal(
    (
      await fetch(`${newDescriptor.baseUrl}/health`, {
        headers: { authorization: `Bearer ${oldDescriptor.token}` },
      })
    ).status,
    401,
  )
  record('crash_rotation_history_preserved')
  const updatedRoot = join(root, '업데이트 패키지')
  await cp(installed, updatedRoot, { recursive: true })
  const journalPath = join(updatedRoot, 'drizzle/meta/_journal.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf8'))
  const previous = journal.entries.at(-1)
  journal.entries.push({
    ...previous,
    idx: previous.idx + 1,
    when: previous.when + 1,
    tag: '9999_w3_synthetic',
  })
  await writeFile(journalPath, JSON.stringify(journal))
  await writeFile(
    join(updatedRoot, 'drizzle/9999_w3_synthetic.sql'),
    'CREATE TABLE w3_update_receipt (id INTEGER PRIMARY KEY);',
  )
  const manifest = JSON.parse(await readFile(join(updatedRoot, 'manifest.json'), 'utf8'))
  for (const name of ['drizzle/meta/_journal.json', 'drizzle/9999_w3_synthetic.sql']) {
    const bytes = await readFile(join(updatedRoot, name))
    manifest.files[name] = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    }
  }
  await writeFile(join(updatedRoot, 'manifest.json'), JSON.stringify(manifest))
  const updatedResources = await api.loadCoreResources(updatedRoot)
  const updater = create(updatedResources)
  await assert.rejects(updater.start(), /CORE_UPDATE_WAITING_FOR_OWNER_EXIT/)
  record('update_does_not_kill_active_owner')
  await shared.dispose()
  await reloaded.dispose()
  await waitUntil(async () => {
    try {
      await readFile(ownerFile)
      return false
    } catch (e) {
      return e.code === 'ENOENT'
    }
  })
  await updater.retry()
  const updatedClient = await sdk.connectLocalCore(connectionFile)
  assert.deepEqual((await updatedClient.restoreProject(projectId)).project, before.project)
  const backups = await readdir(join(storagePath, 'core-data/data/backups'))
  assert.equal(backups.filter((name) => name.endsWith('.sqlite')).length, 1)
  record('update_migration_backup_history')
  await updater.dispose()
  await waitUntil(async () => {
    try {
      await readFile(ownerFile)
      return false
    } catch (e) {
      return e.code === 'ENOENT'
    }
  })
  const downgrade = create()
  await assert.rejects(downgrade.start(), /DATABASE_NEWER_THAN_PACKAGE/)
  record('downgrade_refused_without_data_loss')
  assert.ok(
    !JSON.stringify(statuses).includes(root) &&
      !JSON.stringify(statuses).includes(oldDescriptor.token),
  )
  record('status_has_no_paths_or_credentials')
  await mkdir(resolve('dist'), { recursive: true })
  await writeFile(
    resolve('dist/managed-w3-receipt.json'),
    JSON.stringify({ schemaVersion: 1, target: 'win32-x64', modelCalls: 0, cases }, null, 2),
  )
} catch (error) {
  const code = error?.code ?? error?.message
  const errorCode = /^[A-Z][A-Z0-9_]{0,99}$/.test(code ?? '') ? code : 'MANAGED_CHECK_FAILED'
  await writeFile(
    'dist/managed-w3-failure-receipt.json',
    JSON.stringify({ status: 'FAIL', errorCode, cases, phases }, null, 2),
  )
  throw error
} finally {
  await Promise.allSettled(managers.map((manager) => manager.dispose()))
}
