const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { mkdir, mkdtemp, realpath } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const { runInNewContext } = require('node:vm')

async function routingHarness() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-worker-window-')))
  const generated = join(root, 'workspaces')
  const current = join(generated, 'projects', 'project_synthetic')
  await mkdir(current, { recursive: true })
  const sourcePath = join(__dirname, '../src/native-worker.cjs')
  const localRequire = createRequire(sourcePath)
  const module = { exports: {} }, intervals = [], opened = []
  let endpoints = [], lookups = 0
  const vscode = {
    workspace: { workspaceFolders: [{ uri: { fsPath: current } }] },
    Uri: { file: path => ({ fsPath: path }) },
    commands: { executeCommand: async (command, uri, options) => {
      if (command === 'kiro.agentRegistry.getAgentEndpoints') { lookups++; return endpoints }
      assert.equal(command, 'vscode.openFolder')
      opened.push({ path: uri.fsPath, options })
      vscode.workspace.workspaceFolders = [{ uri: { fsPath: uri.fsPath } }]
    } },
  }
  runInNewContext(readFileSync(sourcePath, 'utf8'), {
    module, AbortController, AbortSignal, URL, Buffer, process,
    setInterval(callback) { intervals.push(callback); return intervals.length }, clearInterval() {},
    setTimeout(callback, delay) { return setTimeout(callback, delay === 1500 ? 0 : delay) },
    clearTimeout,
    require(name) {
      if (name === 'vscode') return vscode
      if (name === '@vibe-helper/frontend-client/node') return {
        readLocalConnection: async () => ({ baseUrl: 'http://127.0.0.1:12345', token: 'synthetic' }),
      }
      if (name === '@vibe-helper/application/redaction') return { redactSensitiveText: value => value }
      if (name === './native-permission.cjs') return { chooseNativeBuilderPermission() {
        throw new Error('ROUTING_MUST_NOT_EXECUTE_TOOLS')
      } }
      if (name.endsWith('/native-client.cjs')) return { openNativeRole() {
        throw new Error('ROUTING_MUST_NOT_OPEN_NATIVE_SESSION')
      } }
      return localRequire(name)
    },
    fetch: async url => {
      const path = new URL(url).pathname
      const value = path === '/health' ? { agent: 'KIRO_IDE_BUILTIN_AGENT' }
        : { job: null, pendingWorkspace: generated }
      assert.ok(path === '/health' || path === '/api/native/next')
      return { ok: true, json: async () => value }
    },
  }, { filename: sourcePath })
  let worker
  const until = async predicate => {
    const deadline = Date.now() + 5000
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5))
    assert.ok(predicate(), 'Synthetic routing did not settle')
  }
  return {
    generated, current, opened,
    endpoint(windowId, path = generated) {
      return { windowId, port: 49000 + windowId, token: 'synthetic-endpoint-token', folders: [{ path }] }
    },
    setEndpoints(value) { endpoints = value },
    start() {
      worker = module.exports.startNativeWorker({ subscriptions: [] }, join(root, 'connection.json'), {
        windowsProduct: true, source: 'SYNTHETIC', nodePath: process.execPath, bridgeScriptPath: 'synthetic',
      })
    },
    async waitFor(status) { await until(() => worker.getStatus() === status) },
    async poll() {
      const before = lookups
      intervals[0]()
      await until(() => lookups > before)
      await new Promise(resolve => setTimeout(resolve, 10))
    },
    async waitForOpen() { await until(() => opened.length === 1) },
    stop() { worker?.stop() },
  }
}

for (const count of [1, 2]) test(`leaves the current folder intact when ${count} target window(s) already exist`, async () => {
  const h = await routingHarness()
  h.setEndpoints(Array.from({ length: count }, (_, index) => h.endpoint(index + 7)))
  try {
    h.start()
    await h.waitFor('WORKSPACE_WINDOW_AVAILABLE')
    await h.poll()
    assert.equal(h.opened.length, 0)
    // An existing window can disappear. A fresh registry read must allow the
    // still-pending job's normal route, rather than caching a dead window forever.
    h.setEndpoints([])
    await h.poll()
    await h.waitForOpen()
    assert.equal(h.opened[0].path, h.generated)
    assert.equal(h.opened[0].options.forceNewWindow, false)
  } finally { h.stop() }
})

test('a foreign workspace endpoint does not suppress the required folder switch', async () => {
  const h = await routingHarness()
  h.setEndpoints([h.endpoint(7, h.current)])
  try {
    h.start()
    await h.waitForOpen()
    assert.equal(h.opened[0].path, h.generated)
  } finally { h.stop() }
})

test('an unavailable registry cannot be mistaken for an empty list of windows', async () => {
  const h = await routingHarness()
  h.setEndpoints(null)
  try {
    h.start()
    await h.waitFor('WORKSPACE_ENDPOINTS_UNAVAILABLE')
    assert.equal(h.opened.length, 0)
    h.setEndpoints([h.endpoint(7)])
    await h.poll()
    await h.waitFor('WORKSPACE_WINDOW_AVAILABLE')
    assert.equal(h.opened.length, 0)
  } finally { h.stop() }
})
