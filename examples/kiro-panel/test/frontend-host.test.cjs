const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const { test } = require('node:test')

const projectId = 'project_00000000-0000-4000-8000-000000000001'
const workspace = '/private/core-data/workspaces/campus-drop'

function harness({ trusted = true, installed = true, loggedIn = true, fail = false, platform = 'darwin',
  bind = { status: 200, body: { success: true, data: { projectId, taskId: 'task_1', workspace } } },
  openFolders = [] } = {}) {
  let listener, trustListener, stopped = 0, starts = 0, mutations = 0, terminals = 0
  const commands = new Map(), opened = [], messages = [], fetches = [], whoami = []
  let lifecycleOptions
  const code = readFileSync(join(__dirname, '../src/frontend-host.cjs'), 'utf8')
  const rawClient = { health: async () => ({}),
    listProjects: async () => ({ projects: [{ project: { id: projectId, title: 'Campus Drop', learningGoal: 'goal' },
      activeTask: { title: 'Task' } }] }),
    execute: async value => { mutations++; return value }, startRun: async () => { mutations++ },
    startDiscovery: async () => { mutations++ } }
  const lifecycle = { subscribe(fn) { listener = fn; return () => {} },
    async start() { starts++; if (fail) throw new Error('CORE_START_TIMEOUT');
      listener({ phase: 'CORE_CONNECTED' }); return { connectionFile: '/private/core-data/connection.json',
        resources: { promptDirectory: '/portable/prompts' }, runtime: {} } },
    retry() { return this.start() }, async dispose() { stopped++ } }
  const modules = {
    vscode: {
      workspace: { isTrusted: trusted, workspaceFolders: openFolders.map(fsPath => ({ uri: { fsPath } })),
        onDidGrantWorkspaceTrust(fn) { trustListener = fn; return { dispose() { trustListener = undefined } } } },
      commands: {
        registerCommand(name, fn) { commands.set(name, fn); return { dispose() { commands.delete(name) } } },
        async executeCommand(name, uri, options) { opened.push({ name, path: uri.fsPath, options }) },
      },
      window: {
        showQuickPick: async items => items[0],
        showInformationMessage: async text => { messages.push(['info', text]) },
        showErrorMessage: async text => { messages.push(['error', text]) },
      },
      Uri: { file: fsPath => ({ fsPath }) },
    },
    'node:child_process': { execFile(file, args, options, done) { whoami.push([file, ...args]); done(loggedIn ? null : new Error('1')) } },
    'node:fs/promises': { mkdir: async () => {}, realpath: async value => value,
      access: async () => { if (!installed) throw new Error('ENOENT') }, constants: { X_OK: 1 } },
    'node:os': { homedir: () => '/Users/synthetic' },
    'node:path': require('node:path'),
    '@vibe-helper/frontend-client/node': {
      readLocalConnection: async () => ({ baseUrl: 'http://127.0.0.1:1', token: 'synthetic-secret' }) },
    './core-lifecycle.cjs': { createCoreLifecycle: options => { lifecycleOptions = options; return lifecycle } },
    './core-connection.cjs': { ...require('../src/core-connection.cjs'),
      createCoreConnectionManager: () => ({ client: rawClient, onDidRotate() {}, dispose() {} }) },
    './native-worker-handle.cjs': require('../src/native-worker-handle.cjs'),
    './mac-terminal-environment.cjs': { prepareMacProjectTerminal: async () => { terminals++ } },
  }
  const module = { exports: {} }
  runInNewContext(code, { module, require: name => modules[name] ?? {}, process: { ...process, platform },
    AbortSignal, fetch: async (url, init) => {
      fetches.push({ url, init })
      return { ok: bind.status === 200, json: async () => bind.body }
    } })
  return { create: () => module.exports.createFrontendHost({ extensionPath: '/extension', globalStorageUri: { fsPath: '/private' } }),
    grantTrust() { modules.vscode.workspace.isTrusted = true; trustListener?.() },
    lifecycleOptions: () => lifecycleOptions, commands, opened, messages, fetches, whoami,
    counters: () => ({ stopped, starts, mutations, terminals }) }
}

test('host runs Core as managed-kiro with the installed kiro-cli and becomes ready after login', async () => {
  const h = harness(), host = await h.create()
  await assert.rejects(host.client.startRun({}), /CORE_NOT_CONNECTED/)
  const [one, two] = await Promise.all([host.prepare(), host.prepare()])
  assert.equal(one.client, two.client)
  assert.equal(h.counters().starts, 1)
  assert.equal(h.lifecycleOptions().command, 'managed-kiro')
  assert.equal(JSON.stringify(h.lifecycleOptions().launchArgs()),
    JSON.stringify(['--kiro-cli', '/Users/synthetic/.local/bin/kiro-cli']))
  assert.equal(JSON.stringify(h.whoami), JSON.stringify([['/Users/synthetic/.local/bin/kiro-cli', 'whoami']]))
  assert.equal(host.getStatus().native, 'WORKER_READY')
  assert.equal(host.getStatus().helperMode, 'KIRO_CLI')
  assert.equal(h.counters().terminals, 1)
  await host.client.startRun({})
  assert.equal(h.counters().mutations, 1)
  await Promise.all([host.dispose(), host.dispose()])
  assert.equal(h.counters().stopped, 1)
  assert.equal(h.commands.has('vibeHelper.openInKiro'), false)
  await assert.rejects(host.prepare(), /FRONTEND_HOST_STOPPED/)
  await assert.rejects(host.client.startRun({}), /FRONTEND_HOST_STOPPED/)
})

test('missing kiro-cli fails before any Core launch without a mock transport', async () => {
  const h = harness({ installed: false }), host = await h.create()
  await assert.rejects(host.prepare(), /KIRO_CLI_NOT_INSTALLED/)
  assert.equal(host.getStatus().phase, 'FAILED')
  assert.equal(host.getStatus().errorCode, 'KIRO_CLI_NOT_INSTALLED')
  assert.equal(h.counters().starts, 0)
  assert.throws(() => h.lifecycleOptions().launchArgs(), /KIRO_CLI_NOT_INSTALLED/)
  await host.dispose()
})

test('kiro-cli without login keeps History readable and blocks Agent mutations', async () => {
  const h = harness({ loggedIn: false }), host = await h.create()
  await host.prepare()
  assert.equal(host.getStatus().native, 'UNAVAILABLE')
  assert.equal(host.getStatus().nativeErrorCode, 'KIRO_CLI_LOGIN_REQUIRED')
  assert.equal((await host.client.listProjects()).projects.length, 1)
  await assert.rejects(host.client.startDiscovery({}), /KIRO_CLI_LOGIN_REQUIRED/)
  await assert.rejects(host.client.execute({ kind: 'UI_START_DISCOVERY' }), /KIRO_CLI_LOGIN_REQUIRED/)
  assert.equal(h.counters().mutations, 0)
  await host.dispose()
})

test('Core failure rejects without a path or credential in status', async () => {
  const h = harness({ fail: true }), host = await h.create()
  await assert.rejects(host.prepare(), /CORE_START_TIMEOUT/)
  assert.equal(host.getStatus().phase, 'FAILED')
  assert.doesNotMatch(JSON.stringify(host.getStatus()), /private|token|connection.json|synthetic/)
  await host.dispose()
})

test('untrusted window skips terminal tools until the user grants trust', async () => {
  const h = harness({ trusted: false }), host = await h.create()
  await host.prepare()
  assert.equal(host.getStatus().native, 'WORKER_READY')
  assert.equal(h.counters().terminals, 0)
  h.grantTrust()
  await host.prepare()
  assert.equal(h.counters().terminals, 1)
  await host.prepare()
  assert.equal(h.counters().terminals, 1)
  await host.dispose()
})

test('Open in Kiro binds through Core with the global token and opens the generated folder', async () => {
  const h = harness(), host = await h.create()
  await h.commands.get('vibeHelper.openInKiro')()
  assert.equal(h.fetches.length, 1)
  assert.equal(h.fetches[0].url, 'http://127.0.0.1:1/api/kiro/bind')
  assert.equal(h.fetches[0].init.headers.authorization, 'Bearer synthetic-secret')
  assert.equal(h.fetches[0].init.body, JSON.stringify({ protocolVersion: 1, projectId }))
  assert.equal(h.opened.length, 1)
  assert.equal(h.opened[0].name, 'vscode.openFolder')
  assert.equal(h.opened[0].path, workspace)
  assert.equal(h.opened[0].options.forceNewWindow, true)
  assert.equal(h.messages.length, 0)
  await host.dispose()
})

test('Open in Kiro in the already-open Project folder refreshes without a new window', async () => {
  const h = harness({ openFolders: [workspace] }), host = await h.create()
  await host.prepare()
  const result = await host.openProjectInKiro(projectId)
  assert.equal(result.openedNewWindow, false)
  assert.equal(h.opened.length, 0)
  await host.dispose()
})

test('bind refusals surface an exact code and never open a folder outside generated workspaces', async () => {
  const notReady = harness({ bind: { status: 409, body: { success: false, error: 'KIRO_BIND_TASK_NOT_READY' } } })
  let host = await notReady.create()
  await notReady.commands.get('vibeHelper.openInKiro')()
  assert.equal(notReady.opened.length, 0)
  assert.equal(notReady.messages[0][0], 'error')
  assert.match(notReady.messages[0][1], /Learning Spec/)
  await host.dispose()
  const escaped = harness({ bind: { status: 200,
    body: { success: true, data: { projectId, taskId: 'task_1', workspace: '/Users/synthetic/elsewhere' } } } })
  host = await escaped.create()
  await host.prepare()
  await assert.rejects(host.openProjectInKiro(projectId), /KIRO_BIND_WORKSPACE_UNSAFE/)
  assert.equal(escaped.opened.length, 0)
  await host.dispose()
})
