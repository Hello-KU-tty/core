const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const { test } = require('node:test')

function harness({ trusted = true, supported = true, fail = false, platform = 'win32' } = {}) {
  let listener, trustListener, stopped = 0, workers = 0, starts = 0, mutations = 0
  const code = readFileSync(join(__dirname, '../src/frontend-host.cjs'), 'utf8')
  const rawClient = { health: async () => ({}), listProjects: async () => ({ projects: [] }),
    execute: async value => { mutations++; return value }, startRun: async () => { mutations++ },
    startDiscovery: async () => { mutations++ } }
  const lifecycle = { subscribe(fn) { listener = fn; return () => {} },
    async start() { starts++; if (fail) throw new Error('CORE_START_TIMEOUT');
      listener({ phase: 'CORE_CONNECTED' }); return { connectionFile: '/private/core-data/connection.json',
        resources: { promptDirectory: '/portable/prompts' }, runtime: {} } },
    retry() { return this.start() }, async dispose() { stopped++ } }
  const modules = {
    vscode: { workspace: { isTrusted: trusted, onDidGrantWorkspaceTrust(fn) {
      trustListener = fn; return { dispose() { trustListener = undefined } }
    } } },
    'node:fs/promises': { mkdir: async () => {}, realpath: async value => value, readFile: async () => 'prompt' },
    'node:path': require('node:path'),
    '@vibe-helper/frontend-client/node': {},
    './core-lifecycle.cjs': { createCoreLifecycle: () => lifecycle },
    './core-connection.cjs': { ...require('../src/core-connection.cjs'),
      createCoreConnectionManager: () => ({ client: rawClient, onDidRotate() {}, dispose() {} }) },
    './native-worker-handle.cjs': require('../src/native-worker-handle.cjs'),
    './native-worker.cjs': { startNativeWorker() { workers++; return { stop() {},
      getStatus: () => 'READY', subscribeStatus: () => () => {}, subscribeUserInputs: () => () => {} } } },
    './windows-terminal-environment.cjs': { prepareWindowsProjectTerminal: async () => {} },
    './mac-terminal-environment.cjs': { prepareMacProjectTerminal: async () => {} },
    '../../program-macos-dev/kiro-1170-source.cjs': { attestMacKiro1170Installation() {
      if (!supported) throw new Error('NATIVE_INSTALLATION_UNSUPPORTED')
      return { appVersion: '1.1.70', agentExtensionVersion: '1.1.158' }
    } },
    '../../kiro-native-host/native-installation-source.cjs': { attestWindowsKiroInstallation() {
      if (!supported) throw new Error('NATIVE_INSTALLATION_UNSUPPORTED')
      return { appVersion: '1.1.70', agentExtensionVersion: '1.1.158' }
    } },
  }
  const module = { exports: {} }
  runInNewContext(code, { module, require: name => modules[name] ?? {}, process: { ...process, platform } })
  return { create: () => module.exports.createFrontendHost({ extensionPath: '/extension', globalStorageUri: { fsPath: '/private' } }),
    grantTrust() { modules.vscode.workspace.isTrusted = true; trustListener?.() },
    counters: () => ({ stopped, workers, starts, mutations }) }
}
test('host deduplicates preparation, guards early mutation and disposes once', async () => {
  const h = harness(), host = await h.create()
  await assert.rejects(host.client.startRun({}), /CORE_NOT_CONNECTED/)
  const [one, two] = await Promise.all([host.prepare(), host.prepare()])
  assert.equal(one.client, two.client)
  assert.equal(h.counters().workers, 1)
  assert.equal(h.counters().starts, 1)
  await host.client.startRun({})
  assert.equal(h.counters().mutations, 1)
  await Promise.all([host.dispose(), host.dispose()])
  assert.equal(h.counters().stopped, 1)
  await assert.rejects(host.prepare(), /FRONTEND_HOST_STOPPED/)
  await assert.rejects(host.client.startRun({}), /FRONTEND_HOST_STOPPED/)
})
for (const options of [{ trusted: false }, { supported: false },
  { platform: 'darwin', trusted: false }, { platform: 'darwin', supported: false }]) test(`unsupported native leaves History readable ${JSON.stringify(options)}`, async () => {
  const h = harness(options), host = await h.create()
  await host.prepare()
  assert.equal(host.getStatus().native, 'UNAVAILABLE')
  assert.deepEqual(await host.client.listProjects(), { projects: [] })
  await assert.rejects(host.client.startDiscovery({}), /NATIVE_/)
  assert.equal(h.counters().workers, 0)
  assert.equal(h.counters().mutations, 0)
  await host.dispose()
})
test('Core failure rejects without a demo transport or path in status', async () => {
  const h = harness({ fail: true }), host = await h.create()
  await assert.rejects(host.prepare(), /CORE_START_TIMEOUT/)
  assert.equal(host.getStatus().phase, 'FAILED')
  assert.doesNotMatch(JSON.stringify(host.getStatus()), /private|token|connection.json/)
  assert.equal(h.counters().workers, 0)
  await host.dispose()
})
test('Trust gate has an exact cause, preserves History and recovers only after user grant', async () => {
  const h = harness({ trusted: false }), host = await h.create()
  await host.prepare()
  assert.equal(host.getStatus().nativeErrorCode, 'NATIVE_WORKSPACE_TRUST_REQUIRED')
  assert.deepEqual(await host.client.listProjects(), { projects: [] })
  await assert.rejects(host.client.startRun({}), /NATIVE_WORKSPACE_TRUST_REQUIRED/)
  await assert.rejects(host.client.execute({ kind: 'UI_START_DISCOVERY' }), /NATIVE_WORKSPACE_TRUST_REQUIRED/)
  assert.equal(h.counters().workers, 0)
  assert.equal(h.counters().mutations, 0)
  h.grantTrust()
  await host.prepare()
  assert.equal(host.getStatus().native, 'WORKER_READY')
  assert.equal(host.getStatus().nativeErrorCode, null)
  assert.equal(h.counters().workers, 1)
  await host.client.startRun({})
  assert.equal(h.counters().mutations, 1)
  await host.dispose()
  const starts = h.counters().starts
  h.grantTrust()
  assert.equal(h.counters().starts, starts)
})
