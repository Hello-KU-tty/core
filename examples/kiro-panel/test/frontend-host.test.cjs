const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const { test } = require('node:test')

const projectId = 'project_00000000-0000-4000-8000-000000000001'
const generatedRoot = '/private/core-data/workspaces'
const workspace = `${generatedRoot}/projects/campus-drop`
const ok = data => ({ status: 200, body: { success: true, data: { projectId, taskId: 'task_1', registered: false, permissions: 'NOT_REQUESTED', ...data } } })
const refuse = error => ({ status: 409, body: { success: false, error } })

function harness({ trusted = true, installed = true, loggedIn = true, fail: failing = false, platform = 'darwin',
  binds = [ok({ workspace })], openFolders = [], answers = {}, bound = false, boundTo = projectId, hookSep = '/', consent, env = process.env,
  installedAt = () => true } = {}) {
  let listener, trustListener, stopped = 0, starts = 0, mutations = 0, terminals = 0
  // `fail: true` fails every start, a number fails that many starts first.
  let failures = failing === true ? Infinity : Number(failing)
  const commands = new Map(), executed = [], messages = [], fetches = [], whoami = [], dialogs = []
  const globalState = new Map(consent ? [['vibeHelper.commandApproval', consent]] : [])
  const settings = new Map([['kiroAgent.agentAutonomy', 'Supervised']])
  let lifecycleOptions
  const runtimeCalls = []
  const code = readFileSync(join(__dirname, '../src/frontend-host.cjs'), 'utf8')
  const rawClient = { health: async () => ({}),
    listProjects: async () => ({ projects: [{ project: { id: projectId, title: 'Campus Drop', learningGoal: 'goal' },
      activeTask: { title: 'Task' } }] }),
    execute: async value => { mutations++; return value }, startRun: async () => { mutations++ },
    startDiscovery: async () => { mutations++ } }
  const lifecycle = { subscribe(fn) { listener = fn; return () => {} },
    async start() { starts++
      if (failures > 0) {
        failures--; listener({ phase: 'FAILED', errorCode: 'CORE_START_TIMEOUT' }); throw new Error('CORE_START_TIMEOUT')
      }
      listener({ phase: 'CORE_CONNECTED' }); return { connectionFile: '/private/core-data/connection.json',
        resources: { promptDirectory: '/portable/prompts' }, runtime: {} } },
    retry() { return this.start() }, async dispose() { stopped++ } }
  // Dialogs answer by their buttons; unanswered ones resolve to undefined (dismissed).
  const dialog = kind => async (text, ...rest) => {
    const items = rest.filter(item => typeof item === 'string')
    dialogs.push({ kind, text, items, modal: rest.some(item => item?.modal === true), detail: rest.find(item => item?.detail)?.detail })
    for (const item of items) if (answers[item]) return item
    if (!items.length) messages.push([kind, text])
    return undefined
  }
  const modules = {
    vscode: {
      workspace: { isTrusted: trusted, workspaceFolders: openFolders.map(fsPath => ({ uri: { fsPath } })),
        onDidGrantWorkspaceTrust(fn) { trustListener = fn; return { dispose() { trustListener = undefined } } },
        getConfiguration: section => ({
          inspect: key => (settings.has(`${section}.${key}`) ? { key } : undefined),
          get: key => settings.get(`${section}.${key}`),
          update: async (key, value, target) => { settings.set(`${section}.${key}`, value); settings.set('target', target) },
        }) },
      ConfigurationTarget: { Global: 1 },
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
      // The hook Core writes into a connected folder names that Project's binding (K23).
      readFile: async path => {
        if (!path.endsWith('.kiro/hooks/vibe-helper.json') || !bound) throw new Error('ENOENT')
        const binding = ['', 'data', 'kiro-bindings', boundTo, 'hook.json'].join(hookSep)
        return JSON.stringify({ hooks: [{ action: { command: `"/core" "/hook.mjs" "${binding}"` } }] })
      },
      access: async path => {
        if (path.endsWith('.kiro/hooks/vibe-helper.json')) { if (!bound) throw new Error('ENOENT'); return }
        if (!installed || !installedAt(path)) throw new Error('ENOENT')
      }, constants: { X_OK: 1 } },
    'node:os': { homedir: () => '/Users/synthetic' },
    'node:path': require('node:path')[platform === 'win32' ? 'win32' : 'posix'],
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
  runInNewContext(code, { module, require: name => modules[name] ?? {}, process: { ...process, platform, env },
    AbortSignal, fetch: async (url, init) => {
      fetches.push({ url, init, body: JSON.parse(init.body) })
      const next = queue.shift() ?? refuse('NO_MORE_BINDS')
      return { ok: next.status === 200, json: async () => next.body }
    } })
  const context = { extensionPath: '/extension', globalStorageUri: { fsPath: '/private' },
    globalState: { get: key => globalState.get(key), update: async (key, value) => { globalState.set(key, value) } } }
  return { create: () => module.exports.createFrontendHost(context),
    grantTrust() { modules.vscode.workspace.isTrusted = true; trustListener?.() },
    lifecycleOptions: () => lifecycleOptions, lifecycleStatus: value => listener(value), runtimeCalls, commands, executed, messages, fetches, whoami, dialogs, globalState, settings,
    opened: () => executed.filter(item => item.name === 'vscode.openFolder'),
    recover() { failures = 0 },
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
  // K18: never a `node` on PATH; Core runs the managed Node under its own name.
  assert.equal(JSON.stringify(h.runtimeCalls[0].nodeExecutables), '[]')
  await host.dispose()
})

test('Windows host finds the per-user kiro-cli install even when Kiro started with an older PATH', async () => {
  const localAppData = 'C:\\Users\\learner\\AppData\\Local'
  const h = harness({ platform: 'win32', env: { ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: localAppData, PATH: 'C:\\Windows' },
    installedAt: path => path.startsWith(localAppData) })
  const host = await h.create()
  await host.prepare()
  assert.equal(h.lifecycleOptions().launchArgs()[1], `${localAppData}\\Kiro-Cli\\kiro-cli.exe`)
  assert.equal(host.getStatus().native, 'WORKER_READY')
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
  const h = harness({ answers: { '개발 명령 미리 승인': true } }), host = await h.create()
  await h.commands.get('vibeHelper.openInKiro')()
  assert.equal(h.fetches.length, 1)
  assert.equal(h.fetches[0].url, 'http://127.0.0.1:1/api/kiro/bind')
  assert.equal(h.fetches[0].init.headers.authorization, 'Bearer synthetic-secret')
  assert.equal(JSON.stringify(h.fetches[0].body), JSON.stringify({ protocolVersion: 1, projectId, approval: 'PREAPPROVED' }))
  const asked = h.dialogs.find(item => item.items.includes('개발 명령 미리 승인'))
  assert.equal(JSON.stringify(asked.items), JSON.stringify(['개발 명령 미리 승인', '수동으로 승인']))
  assert.equal(asked.modal, true)
  assert.equal(h.opened().length, 1)
  assert.equal(h.opened()[0].path, workspace)
  assert.equal(h.opened()[0].options.forceNewWindow, true)
  assert.equal(h.globalState.get('vibeHelper.commandApproval'), 'PREAPPROVED')
  // K17: pre-approval also starts Kiro chat sessions in Autopilot, as a user setting.
  assert.equal(h.settings.get('kiroAgent.agentAutonomy'), 'Autopilot')
  assert.equal(h.settings.get('target'), 1)
  // The new window starts its own chat session once it is trusted; this one does not.
  assert.equal(JSON.stringify(h.globalState.get('vibeHelper.freshChatSessionFolders')), JSON.stringify([workspace]))
  assert.equal(h.executed.some(item => item.name === 'kiroAgent.newSession'), false)
  await host.dispose()
})

test('Open in Kiro uses the empty open folder as the Project folder in this window', async () => {
  const folder = '/Users/synthetic/memo'
  const h = harness({ openFolders: [folder], consent: 'MANUAL',
    binds: [ok({ workspace: folder, registered: true })] }), host = await h.create()
  await h.commands.get('vibeHelper.openInKiro')()
  assert.equal(JSON.stringify(h.fetches[0].body), JSON.stringify({ protocolVersion: 1, projectId, workspace: folder, approval: 'MANUAL' }))
  assert.equal(h.opened().length, 0)
  assert.equal(h.dialogs.some(item => item.items.includes('개발 명령 미리 승인')), false)
  // K17: this trusted window reads the hooks already, so the new chat session opens now.
  assert.ok(h.executed.some(item => item.name === 'kiroAgent.newSession'))
  assert.match(h.messages.at(-1)[1], /새 세션을 열었어요/)
  assert.equal(JSON.stringify(h.globalState.get('vibeHelper.freshChatSessionFolders')), '[]')
  // Manual approval leaves Kiro's chat mode alone.
  assert.equal(h.settings.get('kiroAgent.agentAutonomy'), 'Supervised')
  await host.dispose()
})

test('connecting an untrusted open folder asks for trust instead of saying chat is ready', async () => {
  const folder = '/Users/synthetic/memo'
  const h = harness({ trusted: false, openFolders: [folder], consent: 'PREAPPROVED',
    binds: [ok({ workspace: folder, registered: true })] }), host = await h.create()
  await h.commands.get('vibeHelper.openInKiro')()
  await settle()
  const asked = h.dialogs.find(item => item.items.includes('신뢰 설정 열기'))
  assert.equal(asked.text, '이 폴더를 Vibe Helper Project로 연결했어요. 이 폴더를 신뢰해야 Vibe Helper가 Kiro 채팅에 연결돼요.')
  assert.equal(h.messages.some(([, text]) => /새 세션\(\+\)/.test(text)), false)
  assert.equal(h.opened().length, 0)
  await host.dispose()
})

test('a window opened untrusted offers a reload after binding, since Kiro turned its hooks off at open', async () => {
  const folder = '/Users/synthetic/memo'
  const h = harness({ trusted: false, openFolders: [folder], consent: 'PREAPPROVED', answers: { '다시 로드': true },
    binds: [ok({ workspace: folder, registered: true })] }), host = await h.create()
  // Trusting an unbound folder asks nothing yet.
  h.grantTrust()
  await settle(); await settle()
  assert.equal(h.dialogs.length, 0)
  const opened = await host.openProjectInKiro(projectId)
  await settle()
  assert.equal(opened.reloadRequired, true)
  const asked = h.dialogs.find(item => item.items.includes('다시 로드'))
  assert.match(asked.text, /신뢰하기 전에 열려서 Kiro가 아직 Vibe Helper hook과 도구를 읽지 않았어요/)
  assert.ok(h.executed.some(item => item.name === 'workbench.action.reloadWindow'))
  await host.dispose()

  // The command path shows the reload prompt instead of saying chat is ready.
  const viaCommand = harness({ trusted: false, openFolders: [folder], consent: 'PREAPPROVED',
    binds: [ok({ workspace: folder, registered: true })] })
  const other = await viaCommand.create()
  viaCommand.grantTrust()
  await viaCommand.commands.get('vibeHelper.openInKiro')()
  await settle()
  assert.equal(viaCommand.messages.some(([, text]) => /새 세션\(\+\)/.test(text)), false)
  assert.ok(viaCommand.dialogs.some(item => item.items.includes('다시 로드')))
  assert.equal(viaCommand.executed.some(item => item.name === 'workbench.action.reloadWindow'), false)
  await other.dispose()

  // A window that opened trusted needs no reload: Kiro picks the new hooks and MCP up.
  const trusted = harness({ openFolders: [folder], consent: 'PREAPPROVED', binds: [ok({ workspace: folder, registered: true })] })
  const third = await trusted.create()
  await third.prepare()
  assert.equal((await third.openProjectInKiro(projectId)).reloadRequired, false)
  await settle()
  assert.equal(trusted.dialogs.some(item => item.items.includes('다시 로드')), false)
  await third.dispose()
})

test('a dismissed approval question decides nothing and leaves Kiro rules alone', async () => {
  const h = harness({ consent: undefined }), host = await h.create()
  h.globalState.set('vibeHelper.coreToolsConsent', 'ALLOW')
  await h.commands.get('vibeHelper.openInKiro')()
  assert.equal(JSON.stringify(h.fetches[0].body), JSON.stringify({ protocolVersion: 1, projectId }))
  assert.equal(h.globalState.has('vibeHelper.commandApproval'), false)
  assert.ok(h.dialogs.some(item => item.items.includes('수동으로 승인')))
  await host.dispose()
})

test('changing the approval asks again and applies it to every connected Project folder', async () => {
  const counts = written => ({ status: 200, body: { success: true, data: { WRITTEN: written, UNCHANGED: 0, UNRECOGNIZED: 1 } } })
  const h = harness({ consent: 'PREAPPROVED', answers: { '수동으로 승인': true }, binds: [counts(2)] }), host = await h.create()
  await h.commands.get('vibeHelper.changeCommandApproval')()
  assert.equal(h.fetches[0].url, 'http://127.0.0.1:1/api/kiro/approval')
  assert.equal(JSON.stringify(h.fetches[0].body), JSON.stringify({ protocolVersion: 1, approval: 'MANUAL' }))
  assert.equal(h.globalState.get('vibeHelper.commandApproval'), 'MANUAL')
  assert.match(h.messages.at(-1)[1], /명령과 도구마다 확인을 받아요\. Project 폴더 1곳은/)
  await host.dispose()
  const dismissed = harness({ consent: 'MANUAL' }), other = await dismissed.create()
  await dismissed.commands.get('vibeHelper.changeCommandApproval')()
  assert.equal(dismissed.fetches.length, 0)
  assert.equal(dismissed.globalState.get('vibeHelper.commandApproval'), 'MANUAL')
  await other.dispose()
  assert.equal(dismissed.commands.has('vibeHelper.changeCommandApproval'), false)
  const failing = harness({ answers: { '개발 명령 미리 승인': true }, binds: [refuse('KIRO_NATIVE_NOT_ENABLED')] })
  const third = await failing.create()
  await failing.commands.get('vibeHelper.changeCommandApproval')()
  assert.match(failing.messages.at(-1)[1], /Kiro 채팅 연결을 지원하지 않습니다/)
  await third.dispose()
})

test('a folder with other files leads to a generated folder in a new window only after the learner agrees', async () => {
  const folder = '/Users/synthetic/busy'
  const agreed = harness({ openFolders: [folder], consent: 'PREAPPROVED', answers: { '새 창에서 열기': true },
    binds: [refuse('WORKSPACE_FOLDER_NOT_EMPTY'), ok({ workspace })] })
  let host = await agreed.create(); await host.prepare()
  const result = await host.openProjectInKiro(projectId)
  assert.equal(result.folder, 'GENERATED')
  assert.equal(agreed.fetches[1].body.workspace, undefined)
  assert.equal(agreed.opened()[0].path, workspace)
  assert.ok(agreed.dialogs.some(item => item.modal && /이미 다른 파일이 있어요/.test(item.text)))
  // K23: the wait in the new window is said before it opens; this window's panel cannot follow it.
  assert.ok(agreed.dialogs.some(item => item.modal && /10~30초/.test(item.detail ?? '')))
  await host.dispose()
  const declined = harness({ openFolders: [folder], consent: 'PREAPPROVED',
    binds: [refuse('WORKSPACE_FOLDER_NOT_EMPTY'), ok({ workspace })] })
  host = await declined.create(); await host.prepare()
  assert.equal((await host.openProjectInKiro(projectId)).folder, 'CANCELLED')
  assert.equal(declined.fetches.length, 1)
  // K23: a folder another Project uses is said so, without the raw code.
  const inUse = harness({ openFolders: [folder], consent: 'PREAPPROVED', binds: [refuse('WORKSPACE_FOLDER_IN_USE')] })
  const inUseHost = await inUse.create(); await inUseHost.prepare()
  assert.equal((await inUseHost.openProjectInKiro(projectId)).folder, 'CANCELLED')
  assert.ok(inUse.dialogs.some(item => item.modal && /다른 Project가 쓰고 있어요/.test(item.text) && !/WORKSPACE_FOLDER/.test(item.text)))
  await inUseHost.dispose()
  assert.equal(declined.opened().length, 0)
  await host.dispose()
})

test('a Project already built in another folder opens that folder instead of splitting the work', async () => {
  const elsewhere = '/Users/synthetic/memo-first'
  const h = harness({ openFolders: ['/Users/synthetic/empty'], consent: 'PREAPPROVED',
    binds: [refuse('PROJECT_REGISTERED_ELSEWHERE'), ok({ workspace: elsewhere, registered: true })] })
  const host = await h.create(); await host.prepare()
  const result = await host.openProjectInKiro(projectId)
  assert.equal(result.folder, 'REGISTERED')
  assert.equal(h.opened()[0].path, elsewhere)
  await host.dispose()
})

test('the generated folder window rebinds in place, and an unconfirmed outside folder never opens', async () => {
  const inPlace = harness({ openFolders: [workspace], consent: 'PREAPPROVED' })
  let host = await inPlace.create(); await host.prepare()
  assert.equal((await host.openProjectInKiro(projectId)).openedNewWindow, false)
  assert.equal(inPlace.fetches[0].body.workspace, undefined)
  assert.equal(inPlace.opened().length, 0)
  await host.dispose()
  const escaped = harness({ consent: 'PREAPPROVED', binds: [ok({ workspace: '/Users/synthetic/elsewhere', registered: false })] })
  host = await escaped.create(); await host.prepare()
  await assert.rejects(host.openProjectInKiro(projectId), /KIRO_BIND_WORKSPACE_UNSAFE/)
  assert.equal(escaped.opened().length, 0)
  await host.dispose()
  const notReady = harness({ consent: 'PREAPPROVED', binds: [refuse('KIRO_BIND_TASK_NOT_READY')] })
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
  // The reloaded window starts a new session; this one, still holding the old session, does not.
  assert.equal(JSON.stringify(h.globalState.get('vibeHelper.freshChatSessionFolders')), JSON.stringify([workspace]))
  assert.equal(h.executed.some(item => item.name === 'kiroAgent.newSession'), false)
  await host.dispose()
  const plain = harness({ trusted: false, bound: false })
  const other = await plain.create()
  await settle(); await settle()
  assert.equal(plain.dialogs.length, 0)
  await other.dispose()
})

test('the panel can tell whether Kiro chat in this window reaches the Project (K23)', async () => {
  const cases = [
    [{ bound: false, openFolders: ['/Users/synthetic/other'] }, 'NOT_BOUND'],
    [{ bound: true, openFolders: [] }, 'NOT_BOUND'],
    [{ bound: true, trusted: false, openFolders: [workspace] }, 'UNTRUSTED'],
    [{ bound: true, openFolders: [workspace] }, 'READY'],
  ]
  for (const [options, expected] of cases) {
    const h = harness(options)
    const host = await h.create()
    assert.equal(await host.kiroWindow(projectId), expected)
    await host.dispose()
  }
  // A folder connected to another Project is not this one's, whatever its trust.
  const other = harness({ bound: true, boundTo: 'project_00000000-0000-4000-8000-000000000000', openFolders: [workspace] })
  const otherHost = await other.create()
  assert.equal(await otherHost.kiroWindow(projectId), 'NOT_BOUND')
  assert.equal(await otherHost.kiroWindow(), 'READY')
  await otherHost.dispose()
  // Windows writes the binding path with backslashes (escaped in the hook JSON).
  for (const [boundTo, expected] of [[projectId, 'READY'], ['project_00000000-0000-4000-8000-000000000000', 'NOT_BOUND']]) {
    const windows = harness({ bound: true, boundTo, hookSep: '\\', openFolders: [workspace] })
    const windowsHost = await windows.create()
    assert.equal(await windowsHost.kiroWindow(projectId), expected)
    await windowsHost.dispose()
  }
  // Trusted after the window opened: Kiro reads hooks and MCP again only after a reload.
  const late = harness({ bound: true, trusted: false, openFolders: [workspace] })
  const host = await late.create()
  late.grantTrust()
  assert.equal(await host.kiroWindow(projectId), 'RELOAD')
  await host.dispose()
})

test('the panel learns which Project this window belongs to, if any (K23)', async () => {
  for (const [options, expected] of [
    [{ bound: true, openFolders: [workspace] }, projectId],
    [{ bound: true, trusted: false, openFolders: [workspace] }, projectId],
    [{ bound: true, hookSep: '\\', openFolders: [workspace] }, projectId],
    [{ bound: false, openFolders: [workspace] }, null],
    [{ bound: true, openFolders: [] }, null],
    [{ bound: true, boundTo: 'not-a-project', openFolders: [workspace] }, null],
  ]) {
    const h = harness(options)
    const host = await h.create()
    assert.equal(await host.windowProject(), expected)
    await host.dispose()
  }
})

test('a trusted Project folder window starts Core without the panel, for Kiro chat tools (K18)', async () => {
  const h = harness({ bound: true, openFolders: [workspace] })
  const host = await h.create()
  await settle(); await settle()
  assert.equal(h.counters().starts, 1)
  assert.equal(host.getStatus().phase, 'CORE_CONNECTED')
  assert.equal(host.getStatus().native, 'WORKER_READY')
  await host.dispose()
  // Another window without a Project folder still waits for the panel.
  const plain = harness({ openFolders: ['/Users/synthetic/other'] })
  const other = await plain.create()
  await settle(); await settle()
  assert.equal(plain.counters().starts, 0)
  await other.dispose()
})

test('in a Project folder a Core failure is shown once until Core is back (K18)', async () => {
  const h = harness({ bound: true, openFolders: [workspace], fail: true })
  const host = await h.create()
  await settle(); await settle()
  assert.equal(host.getStatus().phase, 'FAILED')
  const notices = () => h.dialogs.filter(item => /Vibe Helper Core에 연결하지 못했어요/.test(item.text))
  assert.equal(notices().length, 1)
  assert.match(notices()[0].text, /CORE_START_TIMEOUT/)
  assert.doesNotMatch(notices()[0].text, /private|synthetic-secret/)
  assert.deepEqual(notices()[0].items, ['다시 연결'])
  // The periodic retries keep failing without repeating the notice.
  h.lifecycleStatus({ phase: 'CONNECTING_CORE' })
  h.lifecycleStatus({ phase: 'FAILED', errorCode: 'CORE_START_TIMEOUT' })
  await settle()
  assert.equal(notices().length, 1)
  // A periodic retry reconnects on its own: preparation finishes for the panel without a click.
  h.recover()
  h.lifecycleStatus({ phase: 'CORE_CONNECTED' })
  await settle(); await settle()
  assert.equal(host.getStatus().phase, 'CORE_CONNECTED')
  assert.equal(host.getStatus().native, 'WORKER_READY')
  h.lifecycleStatus({ phase: 'FAILED', errorCode: 'CORE_START_TIMEOUT' })
  await settle()
  assert.equal(notices().length, 2, 'a new failure after reconnecting is shown again')
  await host.dispose()
})

test('the reconnect button retries Core and the panel side gets ready', async () => {
  const h = harness({ bound: true, openFolders: [workspace], fail: 1, answers: { '다시 연결': true } })
  const host = await h.create()
  await settle(); await settle(); await settle()
  assert.equal(h.counters().starts >= 2, true)
  assert.equal(host.getStatus().phase, 'CORE_CONNECTED')
  assert.equal(host.getStatus().native, 'WORKER_READY')
  assert.equal(h.dialogs.filter(item => /Vibe Helper Core에 연결하지 못했어요/.test(item.text)).length, 1)
  await host.dispose()
})

test('a Core failure outside a Project folder is left to the panel', async () => {
  const h = harness({ fail: true })
  const host = await h.create()
  await assert.rejects(host.prepare(), /CORE_START_TIMEOUT/)
  h.lifecycleStatus({ phase: 'FAILED', errorCode: 'CORE_START_TIMEOUT' })
  await settle()
  assert.equal(h.dialogs.length, 0)
  await host.dispose()
})
