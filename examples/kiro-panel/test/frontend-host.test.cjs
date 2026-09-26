const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const { test } = require('node:test')

function harness({ trusted = true, supported = true, fail = false } = {}) {
  let listener, stopped = 0, workers = 0, starts = 0, mutations = 0
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
    vscode: { workspace: { isTrusted: trusted, onDidGrantWorkspaceTrust: () => ({ dispose() {} }) } },
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
    '../../kiro-native-host/native-installation-source.cjs': { attestWindowsKiroInstallation() {
      if (!supported) throw new Error('NATIVE_INSTALLATION_UNSUPPORTED')
      return { appVersion: '1.1.70', agentExtensionVersion: '1.1.158' }
    } },
  }
  const module = { exports: {} }
  runInNewContext(code, { module, require: name => modules[name] ?? {}, process })
  return { create: () => module.exports.createFrontendHost({ extensionPath: '/extension', globalStorageUri: { fsPath: '/private' } }),
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
for (const options of [{ trusted: false }, { supported: false }]) test(`unsupported native leaves History readable ${JSON.stringify(options)}`, async () => {
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
