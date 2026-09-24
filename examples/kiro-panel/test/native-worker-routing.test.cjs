const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { mkdir, mkdtemp, realpath } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const { runInNewContext } = require('node:vm')

test('a busy Windows Builder host still opens one pending Helper window without claiming another role', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-worker-routing-')))
  const generated = join(root, 'workspaces')
  const workspace = join(generated, 'projects', 'project_synthetic')
  const helper = join(generated, '__vibe-native-helper-synthetic')
  await mkdir(workspace, { recursive: true }); await mkdir(helper)
  const intervals = [], opened = [], claims = []
  let nativeOpens = 0, nextCount = 0
  const sourcePath = join(__dirname, '../src/native-worker.cjs')
  const localRequire = createRequire(sourcePath)
  const vscode = {
    workspace: { workspaceFolders: [{ uri: { fsPath: workspace } }] },
    Uri: { file: path => ({ fsPath: path }) },
    commands: { executeCommand: async (command, uri, options) => {
      if (command === 'kiro.agentRegistry.getAgentEndpoints') return []
      assert.equal(command, 'vscode.openFolder')
      opened.push({ path: uri.fsPath, forceNewWindow: options.forceNewWindow })
    } },
  }
  const module = { exports: {} }
  runInNewContext(readFileSync(sourcePath, 'utf8'), {
    module, AbortController, AbortSignal, URL, Buffer, process,
    setInterval: callback => { intervals.push(callback); return intervals.length },
    clearInterval() {}, setTimeout, clearTimeout,
    require: name => {
      if (name === 'vscode') return vscode
      if (name === '@vibe-helper/frontend-client/node') return {
        readLocalConnection: async () => ({ baseUrl: 'http://127.0.0.1:12345', token: 'synthetic' }),
      }
      if (name === '@vibe-helper/application/redaction') return { redactSensitiveText: value => value }
      if (name === './native-permission.cjs') return { chooseNativeBuilderPermission() {
        throw new Error('ROUTING_TEST_MUST_NOT_EXECUTE_TOOLS')
      } }
      if (name.endsWith('/native-client.cjs')) return { openNativeRole: () => {
        nativeOpens++; return new Promise(() => {}) // A busy session; no model or tool executes.
      } }
      return localRequire(name)
    },
    fetch: async url => {
      const parsed = new URL(url)
      let value
      if (parsed.pathname === '/health') value = { agent: 'KIRO_IDE_BUILTIN_AGENT' }
      else if (parsed.pathname === '/api/native/next') {
        claims.push(parsed.searchParams.get('activeRoles'))
        value = nextCount++ === 0 ? { job: { id: 'native_synthetic', role: 'BUILDER',
          projectId: 'project_synthetic', workspace, bindingFile: null } }
          : { job: null, pendingHelperWorkspace: helper }
      } else value = { status: 'CLAIMED' }
      return { ok: true, json: async () => value }
    },
  }, { filename: sourcePath })
  const worker = module.exports.startNativeWorker({ subscriptions: [] }, join(root, 'connection.json'), {
    windowsProduct: true, source: 'SYNTHETIC', nodePath: process.execPath, bridgeScriptPath: 'synthetic',
  })
  try {
    const until = Date.now() + 5000
    while (!nativeOpens && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10))
    assert.equal(nativeOpens, 1)
    while (claims.length < 3 && Date.now() < until) {
      intervals[0]()
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    assert.equal(claims.length, 3)
    assert.deepEqual(opened, [{ path: helper, forceNewWindow: true }])
    assert.equal(nativeOpens, 1)
    assert.equal(claims[1], 'DISCOVERY,BUILDER,HELPER,EVIDENCE_ANALYST')
  } finally { worker.stop() }
})
