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

test('a Core-cancelled Helper occupies its native slot until owned terminal confirmation', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-worker-cancel-queue-')))
  const generated = join(root, 'workspaces')
  const workspace = join(generated, 'projects', 'project_synthetic')
  const helper = join(generated, '__vibe-native-helper-synthetic')
  await mkdir(workspace, { recursive: true }); await mkdir(helper)
  const sourcePath = join(__dirname, '../src/native-worker.cjs')
  const localRequire = createRequire(sourcePath)
  const { HAIKU_ID } = localRequire('./native-analyst-model-variant.cjs')
  const intervals = [], masks = [], completed = []
  let served = 0, nativePrompts = 0, opens = 0, coreCancelled = false, abortObserved = false
  let confirmFirstTerminal
  const helperSession = {
    windowId: 7, attest: async () => {}, attestAfterBarrier: async () => {}, close() {},
    prompt: async (_message, _onEvent, signal) => {
      nativePrompts++
      if (nativePrompts === 1) return new Promise((_resolve, reject) => {
        confirmFirstTerminal = () => reject(Object.assign(new Error('NATIVE_H_CANCELLED_CONFIRMED'),
          { code: 'NATIVE_H_CANCELLED_CONFIRMED' }))
        signal.addEventListener('abort', () => { abortObserved = true }, { once: true })
      })
      return { text: 'Synthetic follow-up.', stopReason: 'end_turn' }
    },
  }
  const vscode = {
    workspace: { workspaceFolders: [{ uri: { fsPath: workspace } }] },
    Uri: { file: path => ({ fsPath: path }) },
    commands: { executeCommand: async () => { throw new Error('NO_WORKSPACE_SWITCH_EXPECTED') } },
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
        throw new Error('CANCEL_TEST_MUST_NOT_EXECUTE_TOOLS')
      } }
      if (name.endsWith('/native-client.cjs')) return {
        openProtectedBuiltinH: async (_vscode, options) => {
          opens++
          assert.equal(options.expectedWindowId, 7)
          return options.analystHaiku ? { ...helperSession, modelId: HAIKU_ID } : helperSession
        },
        openProtectedHLogBarrier: async (_vscode, options) => {
          assert.equal(options.expectedWindowId, 7)
          return { windowId: 7, sessionIdForBarrier: 'synthetic-barrier' }
        },
      }
      return localRequire(name)
    },
    fetch: async (url, options) => {
      const parsed = new URL(url)
      let value = {}
      if (parsed.pathname === '/health') value = { agent: 'KIRO_IDE_BUILTIN_AGENT' }
      else if (parsed.pathname === '/api/native/next') {
        const activeRoles = parsed.searchParams.get('activeRoles')
        masks.push(activeRoles)
        const shouldClaim = served === 0 || (served === 1 && !activeRoles.includes('HELPER'))
        value = shouldClaim ? { job: { id: `native_synthetic_${++served}`, role: 'HELPER',
          projectId: 'project_synthetic', workspace: helper, projectWorkspace: workspace,
          helperHostWorkspace: helper, protectedBuiltin: true, bindingFile: null } } : { job: null }
      } else if (parsed.pathname.endsWith('/status')) {
        value = { status: coreCancelled ? 'CANCELLED' : 'CLAIMED' }
      } else if (parsed.pathname.endsWith('/prompt')) value = { message: 'Synthetic context.' }
      else if (parsed.pathname.endsWith('/complete')) completed.push(JSON.parse(options.body))
      return { ok: true, json: async () => value }
    },
  }, { filename: sourcePath })
  const worker = module.exports.startNativeWorker({ subscriptions: [],
    extension: { id: 'vibe-helper.synthetic-panel' },
    logUri: { scheme: 'file', path: '/logs/window7/exthost/vibe-helper.synthetic-panel' },
  }, join(root, 'connection.json'), {
    source: 'SYNTHETIC', nodePath: process.execPath, bridgeScriptPath: 'synthetic',
  })
  const until = async predicate => {
    const deadline = Date.now() + 5000
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5))
    assert.ok(predicate(), 'Synthetic native phase did not settle')
  }
  try {
    await until(() => nativePrompts === 1)
    coreCancelled = true
    intervals[1]()
    await until(() => abortObserved)
    for (let n = 0; n < 3; n++) {
      const before = masks.length
      intervals[0]()
      await until(() => masks.length > before)
      assert.equal(masks.at(-1), 'HELPER')
      assert.equal(nativePrompts, 1)
      assert.equal(served, 1)
    }
    confirmFirstTerminal()
    await until(() => worker.getStatus() === 'AGENT_FAILED_NATIVE_H_CANCELLED_CONFIRMED')
    coreCancelled = false
    for (let n = 0; n < 20 && nativePrompts !== 2; n++) {
      intervals[0]()
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    await until(() => completed.some(item => item.text === 'Synthetic follow-up.'))
    assert.equal(nativePrompts, 2)
    assert.equal(opens, 2, 'Reuse the attested Helper/Analyst pair after confirmed cancellation')
    assert.equal(completed.filter(item => item.errorCode === 'NATIVE_H_CANCELLED_CONFIRMED').length, 1)
  } finally {
    confirmFirstTerminal?.()
    worker.stop()
  }
})
