// Extension-host API, independent of any panel. Never send this object to a webview.
//
// Kiro-native host: Discovery, Helper and the Evidence Analyst run in Core through kiro-cli.
// The Builder is the learner's own Kiro chat in the generated Project folder, connected by
// POST /api/kiro/bind (Steering, hooks, MCP and Spec written into that folder).
const vscode = require('vscode')
const { execFile } = require('node:child_process')
const { access, constants, mkdir, realpath } = require('node:fs/promises')
const { homedir } = require('node:os')
const { join, relative, isAbsolute, sep } = require('node:path')
const { connectLocalCore, readLocalConnection } = require('@vibe-helper/frontend-client/node')
const { createCoreLifecycle } = require('./core-lifecycle.cjs')
const { createCoreConnectionManager, READ_ONLY_UI_KINDS } = require('./core-connection.cjs')
const { createNativeWorkerHandle } = require('./native-worker-handle.cjs')
const { prepareMacProjectTerminal } = require('./mac-terminal-environment.cjs')

const safeCode = error => /^[A-Z][A-Z0-9_]{0,99}$/.test(error?.code ?? error?.message ?? '')
  ? error.code ?? error.message : 'FRONTEND_HOST_FAILED'
const KIRO_CLI_CANDIDATES = [
  join(homedir(), '.local/bin/kiro-cli'),
  '/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli',
]
const BIND_MESSAGES = {
  KIRO_BIND_TASK_NOT_READY: 'Learning Spec을 확정하고 Task가 생긴 뒤에 Kiro에서 열 수 있습니다.',
  KIRO_NATIVE_NOT_ENABLED: '이 Core는 Kiro 채팅 연결을 지원하지 않습니다. 확장을 다시 설치하세요.',
}

async function findKiroCli() {
  for (const candidate of KIRO_CLI_CANDIDATES) {
    try { await access(candidate, constants.X_OK); return await realpath(candidate) } catch {}
  }
  throw new Error('KIRO_CLI_NOT_INSTALLED')
}
// Exit status only. The account line is never read, stored or emitted.
const kiroCliLoggedIn = executable => new Promise(resolve => {
  execFile(executable, ['whoami'], { timeout: 10000, windowsHide: true, maxBuffer: 16384 },
    error => resolve(!error))
})

async function createFrontendHost(context) {
  if (process.platform !== 'darwin') throw new Error('KIRO_NATIVE_HOST_MAC_ONLY')
  const api = require(join(context.extensionPath, 'portable/bin/runtime.cjs'))
  await mkdir(context.globalStorageUri.fsPath, { recursive: true })
  const storagePath = await realpath(context.globalStorageUri.fsPath)
  const resourceRoot = await realpath(join(context.extensionPath, 'portable'))
  let kiroCli
  const lifecycle = createCoreLifecycle({ api, connect: connectLocalCore, readConnection: readLocalConnection,
    storagePath, command: 'managed-kiro', launchArgs: () => {
      if (!kiroCli) throw new Error('KIRO_CLI_NOT_INSTALLED')
      return ['--kiro-cli', kiroCli]
    },
    selectRuntime: signal => api.selectCoreRuntime({ resourceRoot,
      privateRoot: join(storagePath, 'core-tools'), kiroExecutable: process.execPath, signal }),
  })
  const connectionFile = join(storagePath, 'core-data/connection.json')
  const workspacesRoot = join(storagePath, 'core-data/workspaces')
  const connection = createCoreConnectionManager({ connectionFile, connect: connectLocalCore })
  // Kiro-native mode has no IDE-internal worker; the handle reports no status and no questions.
  const worker = createNativeWorkerHandle()
  let preparation, disposal, terminalPrepared = false, stopped = false
  let status = Object.freeze({ phase: 'IDLE', native: 'NOT_READY' })
  const listeners = new Set()
  const emit = value => {
    status = Object.freeze({ ...status, ...value })
    for (const listener of listeners) { try { listener(status) } catch {} }
  }
  function assertAgentReady() {
    if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
    if (status.phase !== 'CORE_CONNECTED') throw new Error(status.errorCode ?? 'CORE_NOT_CONNECTED')
    if (status.native !== 'WORKER_READY') throw new Error(status.nativeErrorCode ?? 'NATIVE_NOT_READY')
  }
  // Read-only History remains available without a kiro-cli login.
  // No mutation may silently enter a mock transport or bypass readiness.
  const client = Object.freeze({ ...connection.client,
    async startDiscovery(...args) { assertAgentReady(); return connection.client.startDiscovery(...args) },
    async startRun(...args) { assertAgentReady(); return connection.client.startRun(...args) },
    async execute(request) {
      if (!READ_ONLY_UI_KINDS.has(request?.kind)) assertAgentReady()
      return connection.client.execute(request)
    },
  })
  const unsubscribeLifecycle = lifecycle.subscribe(value => {
    emit(value)
    if (value.phase === 'CORE_CONNECTED' && value.restoreRequired)
      void client.health().catch(() => {})
  })
  async function prepareOnce() {
    try {
      kiroCli = await findKiroCli()
      const ready = await lifecycle.start()
      if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
      try {
        // Generated Project folders get the packaged Node/pnpm in their terminals,
        // which Kiro chat also uses for shell commands.
        if (!terminalPrepared && vscode.workspace.isTrusted) {
          await prepareMacProjectTerminal(vscode, context, ready, api)
          terminalPrepared = true
        }
        if (!await kiroCliLoggedIn(kiroCli)) throw new Error('KIRO_CLI_LOGIN_REQUIRED')
        if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
        emit({ native: 'WORKER_READY', helperMode: 'KIRO_CLI', nativeErrorCode: null })
      } catch (error) {
        emit({ native: 'UNAVAILABLE', nativeErrorCode: safeCode(error) })
      }
      return { client, connection, connectionFile: ready.connectionFile, worker }
    } catch (error) {
      emit({ phase: stopped ? 'STOPPED' : 'FAILED', errorCode: safeCode(error) })
      throw error
    }
  }
  function prepare() {
    if (stopped) return Promise.reject(new Error('FRONTEND_HOST_STOPPED'))
    if (!preparation) preparation = prepareOnce().finally(() => { preparation = null })
    return preparation
  }
  /**
   * Writes Steering, hooks, MCP and the Spec into the Project's generated folder and opens it.
   * The Builder then runs in that window's Kiro chat. Rebinding revokes the previous binding.
   */
  async function openProjectInKiro(projectId) {
    if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
    if (status.phase !== 'CORE_CONNECTED') throw new Error(status.errorCode ?? 'CORE_NOT_CONNECTED')
    const descriptor = await readLocalConnection(connectionFile)
    const response = await fetch(`${descriptor.baseUrl}/api/kiro/bind`, {
      method: 'POST', headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, projectId }), signal: AbortSignal.timeout(15000),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body?.success !== true)
      throw new Error(safeCode({ message: body?.error ?? 'KIRO_BIND_FAILED' }))
    const workspace = await realpath(body.data.workspace)
    const part = relative(await realpath(workspacesRoot), workspace)
    if (!part || part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part))
      throw new Error('KIRO_BIND_WORKSPACE_UNSAFE')
    const folders = vscode.workspace.workspaceFolders ?? []
    const alreadyOpen = folders.length === 1 && await realpath(folders[0].uri.fsPath).catch(() => '') === workspace
    if (!alreadyOpen)
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workspace), { forceNewWindow: true })
    return { projectId: body.data.projectId, taskId: body.data.taskId, openedNewWindow: !alreadyOpen }
  }
  const openCommand = vscode.commands.registerCommand('vibeHelper.openInKiro', async () => {
    try {
      await prepare()
      const history = await client.listProjects()
      const picked = await vscode.window.showQuickPick(history.projects.map(item => ({
        label: item.project.title,
        description: item.activeTask ? item.activeTask.title : 'Task 없음',
        detail: item.project.learningGoal,
        projectId: item.project.id,
      })), { placeHolder: 'Kiro 채팅으로 이어서 만들 Project를 고르세요' })
      if (!picked) return
      const opened = await openProjectInKiro(picked.projectId)
      if (!opened.openedNewWindow)
        void vscode.window.showInformationMessage('Kiro 연결을 갱신했습니다. 새 채팅 세션에서 이어가세요.')
    } catch (error) {
      const code = safeCode(error)
      void vscode.window.showErrorMessage(BIND_MESSAGES[code] ?? `Kiro에서 열지 못했습니다 (${code}).`)
    }
  })
  const trust = vscode.workspace.onDidGrantWorkspaceTrust(() => { void prepare().catch(() => {}) })
  async function dispose() {
    if (disposal) return disposal
    stopped = true; trust.dispose(); openCommand.dispose()
    disposal = (async () => {
      await lifecycle.dispose()
      await preparation?.catch(() => {})
      connection.dispose(); unsubscribeLifecycle()
      emit({ phase: 'STOPPED', native: 'NOT_READY' }); listeners.clear()
    })()
    return disposal
  }
  return Object.freeze({ client, worker, prepare, assertAgentReady, openProjectInKiro, getStatus: () => status,
    subscribeStatus(listener) { listeners.add(listener); listener(status); return () => listeners.delete(listener) },
    onDidRotate: connection.onDidRotate,
    async retry() {
      if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
      kiroCli = await findKiroCli(); await lifecycle.retry(); return prepare()
    },
    dispose,
  })
}
module.exports = { createFrontendHost }
