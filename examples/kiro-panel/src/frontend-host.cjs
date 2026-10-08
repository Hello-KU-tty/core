// Extension-host API, independent of any panel. Never send this object to a webview.
//
// Kiro-native host: Discovery, Helper and the Evidence Analyst run in Core through kiro-cli.
// The Builder is the learner's own Kiro chat in the Project folder: the open folder when it is
// empty, otherwise a Core-generated one in a new window. POST /api/kiro/bind writes Steering,
// hooks, MCP, the Helper agent and the Spec into that folder.
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
// The open folder cannot hold this Project; a Core-generated folder in a new window can.
const CURRENT_FOLDER_REFUSALS = new Set(['WORKSPACE_FOLDER_NOT_EMPTY', 'WORKSPACE_FOLDER_IN_USE',
  'WORKSPACE_FOLDER_NOT_CANONICAL', 'WORKSPACE_FOLDER_NOT_OWNED', 'WORKSPACE_FOLDER_TOO_BROAD',
  'WORKSPACE_FOLDER_OVERLAPS_CORE', 'WORKSPACE_FOLDER_INVALID'])
// The Project already has its folder elsewhere; open that one instead of splitting the work.
const PROJECT_FOLDER_ELSEWHERE = new Set(['PROJECT_REGISTERED_ELSEWHERE', 'PROJECT_HAS_GENERATED_FOLDER'])
const CORE_TOOLS_CONSENT_KEY = 'vibeHelper.coreToolsConsent'
const BOUND_MARKER = '.kiro/hooks/vibe-helper.json'
const inside = (parent, child) => {
  const part = relative(parent, child)
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)
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
  async function bind(request) {
    const descriptor = await readLocalConnection(connectionFile)
    const response = await fetch(`${descriptor.baseUrl}/api/kiro/bind`, {
      method: 'POST', headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, ...request }), signal: AbortSignal.timeout(15000),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body?.success !== true)
      throw new Error(safeCode({ message: body?.error ?? 'KIRO_BIND_FAILED' }))
    return body.data
  }
  // Asked once: whether Kiro may run Vibe Helper's Core tools in Project folders without asking.
  async function coreToolsConsent() {
    const saved = context.globalState?.get(CORE_TOOLS_CONSENT_KEY)
    if (saved === 'ALLOW' || saved === 'ASK') return saved === 'ALLOW'
    const allow = '허용', ask = '매번 묻기'
    const choice = await vscode.window.showInformationMessage(
      'Kiro 채팅이 Vibe Helper 도구(작업 상태와 Decision 기록)를 쓸 때마다 확인을 묻지 않도록 Project 폴더에서 허용할까요?',
      { modal: true, detail: 'Vibe Helper 도구에만 적용돼요. 파일 수정과 명령 실행 확인은 그대로예요. 나중에 Kiro 권한 설정에서 바꿀 수 있어요.' },
      allow, ask)
    if (choice === allow || choice === ask)
      await context.globalState?.update(CORE_TOOLS_CONSENT_KEY, choice === allow ? 'ALLOW' : 'ASK')
    return choice === allow
  }
  /**
   * Connects the Project to Kiro chat. An empty open folder becomes the Project folder in this
   * window; a folder with other files leads to a Core-generated folder in a new window, after the
   * learner agrees. Rebinding revokes the previous binding.
   */
  async function openProjectInKiro(projectId) {
    if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
    if (status.phase !== 'CORE_CONNECTED') throw new Error(status.errorCode ?? 'CORE_NOT_CONNECTED')
    const folders = vscode.workspace.workspaceFolders ?? []
    const current = folders.length === 1 ? await realpath(folders[0].uri.fsPath).catch(() => null) : null
    const generatedRoot = await realpath(workspacesRoot)
    const allowCoreTools = await coreToolsConsent()
    let data
    if (current !== null && !inside(generatedRoot, current) && current !== generatedRoot) {
      try {
        data = await bind({ projectId, workspace: current, allowCoreTools })
      } catch (error) {
        const code = safeCode(error)
        if (PROJECT_FOLDER_ELSEWHERE.has(code)) {
          void vscode.window.showInformationMessage('이 Project는 이미 다른 폴더에서 만들고 있어요. 그 폴더를 새 창으로 열게요.')
        } else if (CURRENT_FOLDER_REFUSALS.has(code)) {
          const open = '새 창에서 열기'
          const choice = await vscode.window.showWarningMessage(
            code === 'WORKSPACE_FOLDER_NOT_EMPTY'
              ? '지금 연 폴더에는 이미 다른 파일이 있어요. Vibe Helper가 새 폴더를 만들어 새 창으로 열까요?'
              : `지금 연 폴더는 Project 폴더로 쓸 수 없어요 (${code}). Vibe Helper가 새 폴더를 만들어 새 창으로 열까요?`,
            { modal: true }, open)
          if (choice !== open) return { projectId, taskId: null, folder: 'CANCELLED', openedNewWindow: false }
        } else throw error
        data = await bind({ projectId, allowCoreTools })
      }
    } else data = await bind({ projectId, allowCoreTools })
    const workspace = await realpath(data.workspace)
    // Only the generated root or the folder Core just confirmed as this Project's registration opens.
    if (!(data.registered === true || inside(generatedRoot, workspace)))
      throw new Error('KIRO_BIND_WORKSPACE_UNSAFE')
    const alreadyOpen = current === workspace
    if (!alreadyOpen)
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workspace), { forceNewWindow: true })
    return { projectId: data.projectId, taskId: data.taskId, openedNewWindow: !alreadyOpen,
      folder: data.registered === true ? 'REGISTERED' : 'GENERATED', coreTools: data.coreTools }
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
      if (opened.folder !== 'CANCELLED' && !opened.openedNewWindow)
        void vscode.window.showInformationMessage('이 폴더를 Vibe Helper Project로 연결했어요. Kiro 채팅에서 새 세션(+)을 열어 시작하세요. Helper는 새 탭에서 vibe-helper 에이전트를 고르면 돼요.')
    } catch (error) {
      const code = safeCode(error)
      void vscode.window.showErrorMessage(BIND_MESSAGES[code] ?? `Kiro에서 열지 못했습니다 (${code}).`)
    }
  })
  // Kiro skips hooks and steering in an untrusted folder and loads hooks when a session starts,
  // so a bound folder needs trust and then a reload before chat reaches Vibe Helper.
  const boundFolder = async () => {
    const folders = vscode.workspace.workspaceFolders ?? []
    if (folders.length !== 1) return false
    return access(join(folders[0].uri.fsPath, BOUND_MARKER)).then(() => true, () => false)
  }
  void boundFolder().then(async bound => {
    if (!bound || vscode.workspace.isTrusted || stopped) return
    const manage = '신뢰 설정 열기'
    const choice = await vscode.window.showWarningMessage(
      '이 폴더를 신뢰해야 Vibe Helper가 Kiro 채팅에 연결돼요.', manage)
    if (choice === manage) await vscode.commands.executeCommand('workbench.trust.manage')
  }).catch(() => {})
  const trust = vscode.workspace.onDidGrantWorkspaceTrust(() => {
    void prepare().catch(() => {})
    void boundFolder().then(async bound => {
      if (!bound || stopped) return
      const reload = '다시 로드'
      const choice = await vscode.window.showInformationMessage(
        '신뢰가 Kiro 채팅에 적용되도록 창을 다시 로드할까요? 그 뒤 새 채팅 세션에서 시작하세요.', reload)
      if (choice === reload) await vscode.commands.executeCommand('workbench.action.reloadWindow')
    }).catch(() => {})
  })
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
