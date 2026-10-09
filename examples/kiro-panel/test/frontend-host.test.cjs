const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const { test } = require('node:test')

const projectId = 'project_00000000-0000-4000-8000-000000000001'
const generatedRoot = '/private/core-data/workspaces'
const workspace = `${generatedRoot}/projects/campus-drop`
const ok = data => ({ status: 200, body: { success: true, data: { projectId, taskId: 'task_1', registered: false, coreTools: 'NOT_REQUESTED', ...data } } })
const refuse = error => ({ status: 409, body: { success: false, error } })

function harness({ trusted = true, installed = true, loggedIn = true, fail = false, platform = 'darwin',
  binds = [ok({ workspace })], openFolders = [], answers = {}, bound = false, consent } = {}) {
  let listener, trustListener, stopped = 0, starts = 0, mutations = 0, terminals = 0
  const commands = new Map(), executed = [], messages = [], fetches = [], whoami = [], dialogs = []
  const globalState = new Map(consent ? [['vibeHelper.coreToolsConsent', consent]] : [])
  let lifecycleOptions
  const runtimeCalls = []
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
  // Dialogs answer by their buttons; unanswered ones resolve to undefined (dismissed).
  const dialog = kind => async (text, ...rest) => {
    const items = rest.filter(item => typeof item === 'string')
    dialogs.push({ kind, text, items, modal: rest.some(item => item?.modal === true) })
    for (const item of items) if (answers[item]) return item
    if (!items.length) messages.push([kind, text])
    return undefined
  }
  const modules = {
    vscode: {
      workspace: { isTrusted: trusted, workspaceFolders: openFolders.map(fsPath => ({ uri: { fsPath } })),
        onDidGrantWorkspaceTrust(fn) { trustListener = fn; return { dispose() { trustListener = undefined } } } },
      commands: {
        registerCommand(name, fn) { commands.set(name, fn); return { dispose() { commands.delete(name) } } },
        async executeCommand(name, uri, options) { executed.push({ name, path: uri?.fsPath, options }) },
      },
      window: {
        showQuickPick: async items => items[0],
        showInformationMessage: dialog('info'),
        showWarningMessage: dialog('warning'),
        showErrorMessage: async text => { messages.push(['error', text]) },
      },
      Uri: { file: fsPath => ({ fsPath }) },
    },
    'node:child_process': { execFile(file, args, options, done) { whoami.push([file, ...args]); done(loggedIn ? null : new Error('1')) } },
    'node:fs/promises': { mkdir: async () => {}, realpath: async value => value,
      access: async path => {
        if (path.endsWith('.kiro/hooks/vibe-helper.json')) { if (!bound) throw new Error('ENOENT'); return }
        if (!installed) throw new Error('ENOENT')
      }, constants: { X_OK: 1 } },
    'node:os': { homedir: () => '/Users/synthetic' },
    'node:path': platform === 'win32' ? require('node:path').win32 : require('node:path'),
    [require('node:path')[platform === 'win32' ? 'win32' : 'posix'].join('/extension', 'portable/bin/runtime.cjs')]: {
      selectCoreRuntime: async options => { runtimeCalls.push(options); return {} } },
    '@vibe-helper/frontend-client/node': {
      readLocalConnection: async () => ({ baseUrl: 'http://127.0.0.1:1', token: 'synthetic-secret' }) },
    './core-lifecycle.cjs': { createCoreLifecycle: options => { lifecycleOptions = options; return lifecycle } },
    './core-connection.cjs': { ...require('../src/core-connection.cjs'),
      createCoreConnectionManager: () => ({ client: rawClient, onDidRotate() {}, dispose() {} }) },
    './native-worker-handle.cjs': require('../src/native-worker-handle.cjs'),
    './project-terminal-environment.cjs': { prepareProjectTerminal: async () => { terminals++ } },
  }
  const module = { exports: {} }
  const queue = [...binds]
  runInNewContext(code, { module, require: name => modules[name] ?? {}, process: { ...process, platform },
    AbortSignal, fetch: async (url, init) => {
      fetches.push({ url, init, body: JSON.parse(init.body) })
      const next = queue.shift() ?? refuse('NO_MORE_BINDS')
      return { ok: next.status === 200, json: async () => next.body }
    } })
  const context = { extensionPath: '/extension', globalStorageUri: { fsPath: '/private' },
    globalState: { get: key => globalState.get(key), update: async (key, value) => { globalState.set(key, value) } } }
  return { create: () => module.exports.createFrontendHost(context),
    grantTrust() { modules.vscode.workspace.isTrusted = true; trustListener?.() },
    lifecycleOptions: () => lifecycleOptions, runtimeCalls, commands, executed, messages, fetches, whoami, dialogs, globalState,
    opened: () => executed.filter(item => item.name === 'vscode.openFolder'),
    counters: () => ({ stopped, starts, mutations, terminals }) }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

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

test('Windows host finds kiro-cli in Program Files and runs Core on a real Node, not Kiro', async () => {
  const h = harness({ platform: 'win32' }), host = await h.create()
  await host.prepare()
  assert.equal(h.lifecycleOptions().launchArgs()[1], 'C:\\Program Files\\Kiro-Cli\\kiro-cli.exe')
  assert.equal(host.getStatus().native, 'WORKER_READY')
  await h.lifecycleOptions().selectRuntime(undefined)
  assert.equal(h.runtimeCalls.length, 1)
  assert.equal('kiroExecutable' in h.runtimeCalls[0], false)
  await host.dispose()
})

test('host refuses platforms other than Mac and Windows before starting anything', async () => {
  const h = harness({ platform: 'linux' })
  await assert.rejects(h.create(), /KIRO_NATIVE_HOST_PLATFORM_UNSUPPORTED/)
  assert.equal(h.counters().starts, 0)
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

test('Open in Kiro without an open folder binds the generated folder and opens it in a new window', async () => {
  const h = harness({ answers: { '허용': true } }), host = await h.create()
  await h.commands.get('vibeHelper.openInKiro')()
  assert.equal(h.fetches.length, 1)
  assert.equal(h.fetches[0].url, 'http://127.0.0.1:1/api/kiro/bind')
  assert.equal(h.fetches[0].init.headers.authorization, 'Bearer synthetic-secret')
  assert.equal(JSON.stringify(h.fetches[0].body), JSON.stringify({ protocolVersion: 1, projectId, allowCoreTools: true }))
  assert.equal(h.opened().length, 1)
  assert.equal(h.opened()[0].path, workspace)
  assert.equal(h.opened()[0].options.forceNewWindow, true)
  assert.equal(h.globalState.get('vibeHelper.coreToolsConsent'), 'ALLOW')
  await host.dispose()
})

test('Open in Kiro uses the empty open folder as the Project folder in this window', async () => {
  const folder = '/Users/synthetic/memo'
  const h = harness({ openFolders: [folder], consent: 'ASK',
    binds: [ok({ workspace: folder, registered: true })] }), host = await h.create()
  await h.commands.get('vibeHelper.openInKiro')()
  assert.equal(JSON.stringify(h.fetches[0].body), JSON.stringify({ protocolVersion: 1, projectId, workspace: folder, allowCoreTools: false }))
  assert.equal(h.opened().length, 0)
  assert.equal(h.dialogs.some(item => item.items.includes('허용')), false)
  assert.match(h.messages.at(-1)[1], /이 폴더를 Vibe Helper Project로 연결했어요/)
  await host.dispose()
})

test('a folder with other files leads to a generated folder in a new window only after the learner agrees', async () => {
  const folder = '/Users/synthetic/busy'
  const agreed = harness({ openFolders: [folder], consent: 'ALLOW', answers: { '새 창에서 열기': true },
    binds: [refuse('WORKSPACE_FOLDER_NOT_EMPTY'), ok({ workspace })] })
  let host = await agreed.create(); await host.prepare()
  const result = await host.openProjectInKiro(projectId)
  assert.equal(result.folder, 'GENERATED')
  assert.equal(agreed.fetches[1].body.workspace, undefined)
  assert.equal(agreed.opened()[0].path, workspace)
  assert.ok(agreed.dialogs.some(item => item.modal && /이미 다른 파일이 있어요/.test(item.text)))
  await host.dispose()
  const declined = harness({ openFolders: [folder], consent: 'ALLOW',
    binds: [refuse('WORKSPACE_FOLDER_NOT_EMPTY'), ok({ workspace })] })
  host = await declined.create(); await host.prepare()
  assert.equal((await host.openProjectInKiro(projectId)).folder, 'CANCELLED')
  assert.equal(declined.fetches.length, 1)
  assert.equal(declined.opened().length, 0)
  await host.dispose()
})

test('a Project already built in another folder opens that folder instead of splitting the work', async () => {
  const elsewhere = '/Users/synthetic/memo-first'
  const h = harness({ openFolders: ['/Users/synthetic/empty'], consent: 'ALLOW',
    binds: [refuse('PROJECT_REGISTERED_ELSEWHERE'), ok({ workspace: elsewhere, registered: true })] })
  const host = await h.create(); await host.prepare()
  const result = await host.openProjectInKiro(projectId)
  assert.equal(result.folder, 'REGISTERED')
  assert.equal(h.opened()[0].path, elsewhere)
  await host.dispose()
})

test('the generated folder window rebinds in place, and an unconfirmed outside folder never opens', async () => {
  const inPlace = harness({ openFolders: [workspace], consent: 'ALLOW' })
  let host = await inPlace.create(); await host.prepare()
  assert.equal((await host.openProjectInKiro(projectId)).openedNewWindow, false)
  assert.equal(inPlace.fetches[0].body.workspace, undefined)
  assert.equal(inPlace.opened().length, 0)
  await host.dispose()
  const escaped = harness({ consent: 'ALLOW', binds: [ok({ workspace: '/Users/synthetic/elsewhere', registered: false })] })
  host = await escaped.create(); await host.prepare()
  await assert.rejects(host.openProjectInKiro(projectId), /KIRO_BIND_WORKSPACE_UNSAFE/)
  assert.equal(escaped.opened().length, 0)
  await host.dispose()
  const notReady = harness({ consent: 'ALLOW', binds: [refuse('KIRO_BIND_TASK_NOT_READY')] })
  host = await notReady.create()
  await notReady.commands.get('vibeHelper.openInKiro')()
  assert.match(notReady.messages.at(-1)[1], /Learning Spec/)
  await host.dispose()
})

test('a bound folder asks for trust, then offers a reload once trust is granted', async () => {
  const h = harness({ trusted: false, bound: true, openFolders: [workspace], answers: { '신뢰 설정 열기': true, '다시 로드': true } })
  const host = await h.create()
  await settle(); await settle()
  assert.ok(h.dialogs.some(item => /신뢰해야 Vibe Helper가 Kiro 채팅에 연결돼요/.test(item.text)))
  assert.ok(h.executed.some(item => item.name === 'workbench.trust.manage'))
  h.grantTrust()
  await settle(); await settle()
  assert.ok(h.executed.some(item => item.name === 'workbench.action.reloadWindow'))
  await host.dispose()
  const plain = harness({ trusted: false, bound: false })
  const other = await plain.create()
  await settle(); await settle()
  assert.equal(plain.dialogs.length, 0)
  await other.dispose()
})
