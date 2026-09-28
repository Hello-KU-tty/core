const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { createRequire } = require('node:module')
const { runInNewContext } = require('node:vm')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const sourcePath = resolve(__dirname, '../extension.cjs')
const requireFromHost = createRequire(sourcePath)
const CODE = 'NATIVE_CREDIT_OBSERVATION_REQUIRED'
const receipt = (changes = {}) => ({
  approved: true, cumulativeLimit: 900, newCallCutoff: 880, used: 100,
  overageEnabled: false, observedAt: new Date().toISOString(), ...changes,
})

async function setup() {
  // Synthetic metadata only. Test artifacts are retained, never deleted.
  const root = await fs.mkdtemp(join(tmpdir(), 'vibe-mac-admission-test-'))
  const config = { budgetFile: join(root, 'credit-observation.json'), admissionsFile: join(root, 'model-admissions.jsonl') }
  await fs.writeFile(join(root, 'dev-config.json'), JSON.stringify(config), { mode: 0o600 })
  const writeReceipt = (value) => fs.writeFile(config.budgetFile, JSON.stringify(value), { mode: 0o600 })
  const calls = []
  const core = Object.fromEntries(['health', 'listProjects', 'restoreProject', 'listRuns', 'cancelRun', 'execute', 'startDiscovery', 'startRun'].map(kind => [kind, async (...args) => {
    calls.push({ kind, args })
    return kind === 'health' ? { agent: 'KIRO_IDE_BUILTIN_AGENT' } : { accepted: true }
  }]))
  const host = async (filesystem = fs, trusted = true) => {
    const module = { exports: {} }
    const overrides = {
      vscode: { workspace: { isTrusted: trusted }, window: { registerWebviewViewProvider: () => ({ dispose() {} }) }, commands: { registerCommand: () => ({ dispose() {} }), executeCommand: async () => {} } },
      'node:fs/promises': filesystem,
      '@vibe-helper/frontend-client/node': { connectLocalCore() { throw new Error('UNEXPECTED_NETWORK') } },
      '@vibe-helper/program-panel': { AgentPanelViewProvider: class {}, AGENT_PANEL_VIEW_ID: 'synthetic' },
      '../kiro-panel/src/core-connection.cjs': { createCoreConnectionManager: () => ({ client: core, onDidRotate() {}, dispose() {} }) },
      '../kiro-panel/src/native-runtime.cjs': { resolvePackagedNativeRuntime() { throw new Error('UNEXPECTED_NATIVE') } },
      '../kiro-panel/src/native-worker.cjs': { startNativeWorker() { throw new Error('UNEXPECTED_NATIVE') } },
      '../kiro-panel/src/native-worker-handle.cjs': { createNativeWorkerHandle: () => ({}) },
    }
    runInNewContext(await fs.readFile(sourcePath, 'utf8'), {
      module, require: id => overrides[id] ?? requireFromHost(id), Date, process,
    }, { filename: sourcePath })
    const activated = await module.exports.activate({ extensionPath: root, extensionUri: {}, globalState: { get() {} }, subscriptions: [] })
    return activated.backend
  }
  return { root, config, calls, core, writeReceipt, host }
}

test('Analysis retry cannot dispatch without a fresh approved observation', async () => {
  const h = await setup()
  const host = await h.host()
  await assert.rejects(host.client.execute({ kind: 'UI_RETRY_ANALYSIS', analysisJobId: 'synthetic' }), error => error.code === CODE)
  assert.equal(h.calls.length, 0)
})

test('read-only, stop, and deterministic mutations do not require a model admission', async () => {
  const h = await setup()
  const host = await h.host(fs, false)
  await host.client.health()
  await host.client.listProjects()
  await host.client.restoreProject('synthetic')
  await host.client.cancelRun('synthetic')
  await host.client.execute({ kind: 'UI_CONFIRM_LEARNING_SPEC' })
  assert.equal(h.calls.length, 5)
})

test('an approved budget does not grant Workspace Trust or dispatch a model', async () => {
  const h = await setup()
  await h.writeReceipt(receipt())
  const host = await h.host(fs, false)
  for (const call of [
    () => host.client.startDiscovery({ learningGoal: 'synthetic' }),
    () => host.client.startRun({ kind: 'BUILDER' }),
    () => host.client.execute({ kind: 'UI_RETRY_ANALYSIS' }),
  ]) await assert.rejects(call(), error => error.code === 'NATIVE_WORKSPACE_TRUST_REQUIRED')
  assert.equal(h.calls.length, 0)
  await assert.rejects(fs.stat(h.config.admissionsFile), { code: 'ENOENT' })
  const prepared = await host.prepare()
  assert.ok(prepared.client)
  assert.equal(host.getStatus().nativeErrorCode, 'NATIVE_WORKSPACE_TRUST_REQUIRED')
})

test('concurrent hosts share an atomic two-admission limit', async () => {
  const h = await setup()
  await h.writeReceipt(receipt())
  // All old implementations observe the same pre-append ledger. Model a
  // filesystem read/write race, rather than relying on scheduler luck.
  const delayed = { ...fs, readFile: async (...args) => {
    if (args[0] !== h.config.admissionsFile) return fs.readFile(...args)
    const content = await fs.readFile(...args).catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error))
    await new Promise(done => setTimeout(done, 25))
    return content
  } }
  const hosts = await Promise.all(Array.from({ length: 6 }, () => h.host(delayed)))
  const results = await Promise.allSettled(hosts.map(host => host.client.startRun({ kind: 'BUILDER', message: 'synthetic prompt must not be logged' })))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2)
  assert.equal(h.calls.length, 2)
  const log = await fs.readFile(h.config.admissionsFile, 'utf8')
  assert.equal(log.trim().split('\n').length, 2)
  assert.equal(log.includes('synthetic prompt'), false)
})

for (const [name, changes] of [
  ['unapproved', { approved: false }], ['overage', { overageEnabled: true }],
  ['wrong cumulative cap', { cumulativeLimit: 1000 }], ['wrong cutoff', { newCallCutoff: 900 }],
  ['negative used', { used: -1 }], ['cutoff', { used: 880 }], ['cap', { used: 900 }],
  ['string used', { used: '100' }], ['null used', { used: null }],
  ['expired', { observedAt: new Date(Date.now() - 16 * 60_000).toISOString() }],
  ['future', { observedAt: new Date(Date.now() + 60_000).toISOString() }],
  ['invalid timestamp', { observedAt: 'invalid' }],
]) test(`rejects ${name} before model dispatch`, async () => {
  const h = await setup()
  await h.writeReceipt(receipt(changes))
  const host = await h.host()
  await assert.rejects(host.client.startDiscovery({ learningGoal: 'synthetic' }), error => error.code === CODE)
  assert.equal(h.calls.length, 0)
})

test('reload cannot reuse an exhausted observation; a new actual observation is needed', async () => {
  const h = await setup()
  const observed = receipt({ observedAt: new Date(Date.now() - 1000).toISOString() })
  await h.writeReceipt(observed)
  const first = await h.host()
  await first.client.startDiscovery({ learningGoal: 'synthetic' })
  await first.client.startRun({ kind: 'HELPER' })
  const reloaded = await h.host()
  await assert.rejects(reloaded.client.startRun({ kind: 'BUILDER' }), error => error.code === CODE)
  await h.writeReceipt(receipt())
  await reloaded.client.startRun({ kind: 'BUILDER' })
  assert.equal(h.calls.length, 3)
})

test('Analysis retry consumes the same allowance and does not log its request', async () => {
  const h = await setup()
  await h.writeReceipt(receipt())
  const host = await h.host()
  await host.client.execute({ kind: 'UI_RETRY_ANALYSIS', analysisJobId: 'private-synthetic-id' })
  await host.client.startRun({ kind: 'HELPER', message: 'private-synthetic-text' })
  await assert.rejects(host.client.execute({ kind: 'UI_RETRY_ANALYSIS' }), error => error.code === CODE)
  assert.equal(h.calls.length, 2)
  const log = await fs.readFile(h.config.admissionsFile, 'utf8')
  assert.equal(log.includes('private-synthetic'), false)
  assert.deepEqual(log.trim().split('\n').map(line => JSON.parse(line).kind), ['ANALYSIS_RETRY', 'HELPER'])
})

test('a failed underlying dispatch is not automatically replayed or refunded', async () => {
  const h = await setup()
  await h.writeReceipt(receipt())
  let attempts = 0
  h.core.startRun = async () => { attempts++; throw Object.assign(new Error('SYNTHETIC_FAILURE'), { code: 'SYNTHETIC_FAILURE' }) }
  const host = await h.host()
  for (let n = 0; n < 2; n++) await assert.rejects(host.client.startRun({ kind: 'BUILDER' }), { code: 'SYNTHETIC_FAILURE' })
  await assert.rejects(host.client.startRun({ kind: 'BUILDER' }), { code: CODE })
  assert.equal(attempts, 2)
})

test('equivalent timestamp spellings cannot refresh the same observation', async () => {
  const h = await setup()
  const observed = receipt()
  await h.writeReceipt(observed)
  const host = await h.host()
  await host.client.startRun({ kind: 'BUILDER' })
  await host.client.startRun({ kind: 'HELPER' })
  await h.writeReceipt({ ...observed, observedAt: observed.observedAt.replace('Z', '+00:00') })
  await assert.rejects((await h.host()).client.startRun({ kind: 'BUILDER' }), { code: CODE })
  assert.equal(h.calls.length, 2)
})

test('atomic claims remain consumed even if a synthetic audit file is reset', async () => {
  const h = await setup()
  await h.writeReceipt(receipt())
  const host = await h.host()
  await host.client.startRun({ kind: 'BUILDER' })
  await host.client.startRun({ kind: 'HELPER' })
  await fs.writeFile(h.config.admissionsFile, '')
  await assert.rejects((await h.host()).client.startRun({ kind: 'BUILDER' }), { code: CODE })
  assert.equal(h.calls.length, 2)
})

for (const [name, content] of [
  ['malformed JSON', '{'], ['null', 'null'], ['array', '[]'],
  ['oversized', JSON.stringify({ ...receipt(), unused: 'x'.repeat(9000) })],
]) test(`fails closed on ${name} observation`, async () => {
  const h = await setup()
  await fs.writeFile(h.config.budgetFile, content)
  const host = await h.host()
  await assert.rejects(host.client.startRun({ kind: 'BUILDER' }), { code: CODE })
  assert.equal(h.calls.length, 0)
})

for (const [name, content] of [
  ['malformed audit', '{'], ['invalid audit timestamp', '{"observedAt":"invalid"}\n'],
  ['oversized audit', 'x'.repeat(128 * 1024 + 1)],
]) test(`fails closed on ${name}`, async () => {
  const h = await setup()
  await h.writeReceipt(receipt())
  await fs.writeFile(h.config.admissionsFile, content)
  const host = await h.host()
  await assert.rejects(host.client.startRun({ kind: 'BUILDER' }), { code: CODE })
  assert.equal(h.calls.length, 0)
})

test('refuses a symlinked observation without altering its target', async () => {
  const h = await setup()
  const target = join(h.root, 'synthetic-target.json')
  const content = JSON.stringify(receipt())
  await fs.writeFile(target, content)
  await fs.symlink(target, h.config.budgetFile)
  await assert.rejects((await h.host()).client.startRun({ kind: 'BUILDER' }), { code: CODE })
  assert.equal(await fs.readFile(target, 'utf8'), content)
  assert.equal(h.calls.length, 0)
})

test('independent Node processes cannot exceed the shared allowance', async () => {
  const h = await setup()
  await h.writeReceipt(receipt())
  const script = `
    const { createBudgetedClient } = require(process.argv[1]);
    const client = createBudgetedClient({ startRun: async () => {} }, JSON.parse(process.argv[2]), () => true);
    client.startRun({ kind: 'BUILDER' }).then(() => console.log('ADMITTED'), error => console.log(error.code));
  `
  const results = await Promise.all(Array.from({ length: 6 }, () => promisify(execFile)(process.execPath,
    ['-e', script, resolve(__dirname, '../model-admission.cjs'), JSON.stringify(h.config)], { timeout: 5000 })))
  assert.equal(results.filter(result => result.stdout.trim() === 'ADMITTED').length, 2)
  assert.equal(results.filter(result => result.stdout.trim() === CODE).length, 4)
  const files = await fs.readdir(h.root)
  const claims = files.filter(file => file.endsWith('.claim'))
  assert.equal(claims.length, 2)
  for (const file of [h.config.admissionsFile, ...claims.map(file => join(h.root, file))]) {
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
  }
})

test('admissions from the previous log-only guard remain consumed', async () => {
  const h = await setup()
  const observed = receipt({ used: 879.9 })
  await h.writeReceipt(observed)
  await fs.writeFile(h.config.admissionsFile, JSON.stringify({ kind: 'DISCOVERY', observedAt: observed.observedAt, used: observed.used }) + '\n', { mode: 0o600 })
  const host = await h.host()
  await host.client.startRun({ kind: 'HELPER' })
  await assert.rejects(host.client.startRun({ kind: 'BUILDER' }), { code: CODE })
  assert.equal(h.calls.length, 1)
})

test('a missing observation does not poison a later explicit retry with a valid observation', async () => {
  const h = await setup()
  const host = await h.host()
  await assert.rejects(host.client.startRun({ kind: 'BUILDER' }), { code: CODE })
  await h.writeReceipt(receipt())
  await host.client.startRun({ kind: 'BUILDER' })
  assert.equal(h.calls.length, 1)
})

test('a symlinked audit target is neither read as a grant nor written', async () => {
  const h = await setup()
  await h.writeReceipt(receipt())
  const target = join(h.root, 'synthetic-audit-target.txt')
  await fs.writeFile(target, '')
  await fs.symlink(target, h.config.admissionsFile)
  await assert.rejects((await h.host()).client.startRun({ kind: 'BUILDER' }), { code: CODE })
  assert.equal(await fs.readFile(target, 'utf8'), '')
  assert.equal(h.calls.length, 0)
})

test('a non-file observation is rejected before dispatch', async () => {
  const h = await setup()
  await fs.mkdir(h.config.budgetFile)
  await assert.rejects((await h.host()).client.startRun({ kind: 'BUILDER' }), { code: CODE })
  assert.equal(h.calls.length, 0)
})
