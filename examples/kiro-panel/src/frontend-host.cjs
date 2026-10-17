// Extension-host API, independent of any panel. Never send this object to a webview.
//
// Kiro-native host: Discovery, Helper and the Evidence Analyst run in Core through kiro-cli.
// The Builder is the learner's own Kiro chat in the Project folder: the open folder when it is
// empty, otherwise a Core-generated one in a new window. POST /api/kiro/bind writes Steering,
// hooks, MCP, the Helper agent and the Spec into that folder.
const vscode = require('vscode')
const { execFile } = require('node:child_process')
const { access, constants, mkdir, readFile, realpath } = require('node:fs/promises')
const { homedir } = require('node:os')
const { delimiter, join, relative, isAbsolute, sep } = require('node:path')
const { connectLocalCore, readLocalConnection } = require('@vibe-helper/frontend-client/node')
const { createCoreLifecycle } = require('./core-lifecycle.cjs')
const { createCoreConnectionManager, READ_ONLY_UI_KINDS } = require('./core-connection.cjs')
const { createNativeWorkerHandle } = require('./native-worker-handle.cjs')
const { prepareProjectTerminal } = require('./project-terminal-environment.cjs')

const safeCode = error => /^[A-Z][A-Z0-9_]{0,99}$/.test(error?.code ?? error?.message ?? '')
  ? error.code ?? error.message : 'FRONTEND_HOST_FAILED'
// Kiro-native runs on Apple Silicon Mac and Windows x64 (Kiro CLI 2.x runs natively on Windows 11).
const KIRO_NATIVE_PLATFORMS = new Set(['darwin', 'win32'])
// Usual install locations first (Windows: the official installer's per-user %LOCALAPPDATA%\Kiro-Cli,
// as kiro-cli 2.29.0 installs, or Program Files\Kiro-Cli; macOS: the install script's ~/.local/bin or
// the app bundle), then kiro-cli on PATH, so another install location still works. The per-user
// folder is checked directly because a Kiro window opened before the install keeps its old PATH.
const onPath = name => (process.env.PATH ?? process.env.Path ?? '').split(delimiter)
  .filter(directory => isAbsolute(directory)).map(directory => join(directory, name))
const kiroCliCandidates = () => process.platform === 'win32'
  ? [
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Kiro-Cli', 'kiro-cli.exe'),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Kiro-Cli', 'bin', 'kiro-cli.exe'),
      ...(process.env.LOCALAPPDATA && isAbsolute(process.env.LOCALAPPDATA)
        ? [join(process.env.LOCALAPPDATA, 'Kiro-Cli', 'kiro-cli.exe')] : []),
      ...onPath('kiro-cli.exe'),
    ]
  : [join(homedir(), '.local/bin/kiro-cli'), '/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli',
      ...onPath('kiro-cli')]
const BIND_MESSAGES = {
  KIRO_BIND_TASK_NOT_READY: 'Learning Spec을 확정하고 Task가 생긴 뒤에 Kiro에서 열 수 있습니다.',
  KIRO_NATIVE_NOT_ENABLED: '이 Core는 Kiro 채팅 연결을 지원하지 않습니다. 확장을 다시 설치하세요.',
}
// The open folder cannot hold this Project; a Core-generated folder in a new window can.
const CURRENT_FOLDER_REFUSALS = new Set(['WORKSPACE_FOLDER_NOT_EMPTY', 'WORKSPACE_FOLDER_IN_USE',
  'WORKSPACE_FOLDER_NOT_CANONICAL', 'WORKSPACE_FOLDER_NOT_OWNED', 'WORKSPACE_FOLDER_TOO_BROAD',
  'WORKSPACE_FOLDER_OVERLAPS_CORE', 'WORKSPACE_FOLDER_INVALID'])
// Why the open folder cannot hold the Project, in the learner's words; others keep their code (K23).
const CURRENT_FOLDER_REASONS = {
  WORKSPACE_FOLDER_NOT_EMPTY: '지금 연 폴더에는 이미 다른 파일이 있어요.',
  WORKSPACE_FOLDER_IN_USE: '지금 연 폴더는 다른 Project가 쓰고 있어요.',
}
// The Project already has its folder elsewhere; open that one instead of splitting the work.
const PROJECT_FOLDER_ELSEWHERE = new Set(['PROJECT_REGISTERED_ELSEWHERE', 'PROJECT_HAS_GENERATED_FOLDER'])
// Replaces 0.2.x `vibeHelper.coreToolsConsent` (Core tools only); the wider choice is asked anew.
const COMMAND_APPROVAL_KEY = 'vibeHelper.commandApproval'
// Project folders whose next trusted window should start a new Kiro chat session (K17).
const FRESH_SESSION_KEY = 'vibeHelper.freshChatSessionFolders'
// Kiro opens its chat view a few seconds after the window; the + command needs that view.
const FRESH_SESSION_DELAY_MS = 4000
const BOUND_MARKER = '.kiro/hooks/vibe-helper.json'
// Kiro starts the new window's extension host before this panel loads, so the wait is said first (K23).
const NEW_WINDOW_WAIT = '새 창에서 ‘신뢰’를 누르면 패널이 다시 뜨기까지 보통 10~30초 걸려요.'
const RELOAD_AFTER_LATE_TRUST = '이 폴더를 Vibe Helper Project로 연결했어요. 이 창은 폴더를 신뢰하기 전에 열려서 Kiro가 아직 Vibe Helper hook과 도구를 읽지 않았어요. 창을 다시 로드할까요? 다시 로드하면 새 채팅 세션이 열려요.'
const inside = (parent, child) => {
  const part = relative(parent, child)
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}

async function findKiroCli() {
  for (const candidate of kiroCliCandidates()) {
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
  if (!KIRO_NATIVE_PLATFORMS.has(process.platform)) throw new Error('KIRO_NATIVE_HOST_PLATFORM_UNSUPPORTED')
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
    // Core writes its own Node into Kiro hook and MCP commands, so it must run on a real Node, not
    // on Kiro's executable with ELECTRON_RUN_AS_NODE (that command would open Kiro instead). It is
    // always the managed Node under Core's own name, never a `node` on PATH, so a Builder command
    // that stops `node` by name does not stop Core or the Kiro MCP bridge (K18).
    selectRuntime: signal => api.selectCoreRuntime({ resourceRoot,
      privateRoot: join(storagePath, 'core-tools'), nodeExecutables: [], signal }),
  })
  const connectionFile = join(storagePath, 'core-data/connection.json')
  const workspacesRoot = join(storagePath, 'core-data/workspaces')
  const connection = createCoreConnectionManager({ connectionFile, connect: connectLocalCore })
  // Kiro-native mode has no IDE-internal worker; the handle reports no status and no questions.
  const worker = createNativeWorkerHandle()
  let preparation, disposal, terminalPrepared = false, stopped = false
  // K18: a window on a Vibe Helper Project folder keeps Core up for Kiro chat's MCP bridge, panel
  // or not, and says so once when Core cannot be reached.
  let boundWindow = false, prepareFailed = false, failureNoticed = false
  // Kiro reads hooks and workspace MCP when a window opens. In a window opened untrusted they stay
  // off after trust is granted, until the window reloads.
  const openedUntrusted = !vscode.workspace.isTrusted
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
    if (value.phase === 'CORE_CONNECTED') {
      failureNoticed = false
      // The periodic check reconnected after a failed preparation; finish it for the panel.
      if (prepareFailed && !preparation && !stopped) void prepare().catch(() => {})
    }
    if (value.phase === 'FAILED' && boundWindow && !failureNoticed && !stopped) {
      failureNoticed = true
      void noticeCoreFailure(value.errorCode).catch(() => {})
    }
  })
  async function noticeCoreFailure(code) {
    const reconnect = '다시 연결'
    const choice = await vscode.window.showWarningMessage(
      `Vibe Helper Core에 연결하지 못했어요 (${code ?? 'CORE_NOT_CONNECTED'}). 그동안 Kiro 채팅의 Vibe Helper 도구가 동작하지 않아요. 잠시 뒤 저절로 다시 시도해요.`,
      reconnect)
    if (choice !== reconnect || stopped) return
    failureNoticed = false
    await retry()
  }
  async function prepareOnce() {
    try {
      kiroCli = await findKiroCli()
      const ready = await lifecycle.start()
      if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
      try {
        // Generated Project folders get the packaged Node/pnpm in their terminals,
        // which Kiro chat also uses for shell commands.
        if (!terminalPrepared && vscode.workspace.isTrusted) {
          await prepareProjectTerminal(vscode, context, ready, api)
          terminalPrepared = true
        }
        if (!await kiroCliLoggedIn(kiroCli)) throw new Error('KIRO_CLI_LOGIN_REQUIRED')
        if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
        emit({ native: 'WORKER_READY', helperMode: 'KIRO_CLI', nativeErrorCode: null })
      } catch (error) {
        emit({ native: 'UNAVAILABLE', nativeErrorCode: safeCode(error) })
      }
      prepareFailed = false
      return { client, connection, connectionFile: ready.connectionFile, worker }
    } catch (error) {
      prepareFailed = true
      emit({ phase: stopped ? 'STOPPED' : 'FAILED', errorCode: safeCode(error) })
      throw error
    }
  }
  function prepare() {
    if (stopped) return Promise.reject(new Error('FRONTEND_HOST_STOPPED'))
    if (!preparation) preparation = prepareOnce().finally(() => { preparation = null })
    return preparation
  }
  async function postKiro(path, request, failure) {
    const descriptor = await readLocalConnection(connectionFile)
    const response = await fetch(`${descriptor.baseUrl}${path}`, {
      method: 'POST', headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ protocolVersion: 1, ...request }), signal: AbortSignal.timeout(15000),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body?.success !== true)
      throw new Error(safeCode({ message: body?.error ?? failure }))
    return body.data
  }
  const bind = request => postKiro('/api/kiro/bind', request, 'KIRO_BIND_FAILED')
  /**
   * Asked once (again with `ask`): pre-approve the Core tools and common dev commands in Project
   * folders, or let Kiro ask each time. Dismissing it decides nothing and asks again next time.
   */
  async function commandApproval({ ask = false } = {}) {
    const saved = context.globalState?.get(COMMAND_APPROVAL_KEY)
    if (!ask && (saved === 'PREAPPROVED' || saved === 'MANUAL')) return saved
    const preapprove = '개발 명령 미리 승인', manual = '수동으로 승인'
    const choice = await vscode.window.showInformationMessage(
      'Kiro 채팅이 명령을 실행할 때 어떻게 승인할까요?',
      { modal: true, detail: [
        `${preapprove}: Vibe Helper가 연결한 Project 폴더에서 Vibe Helper 도구와 자주 쓰는 개발 명령(설치·빌드·테스트, 파일 보기, 폴더 만들기, git 커밋, 내 컴퓨터 서버 확인과 브라우저로 열기)은 묻지 않고 실행해요. 파일 삭제, 프로세스 종료, 배포, git push, 전역 설치, sudo, 다른 주소 접속은 계속 물어요. 실수를 줄이는 목록이지 격리 장치는 아니에요. Kiro 채팅도 Autopilot으로 시작해서 파일 수정을 하나씩 검토하지 않아도 돼요.`,
        `${manual}: 명령과 도구마다 Kiro가 확인을 받아요.`,
        '나중에 명령 팔레트의 "Vibe Helper: Change Command Approval"로 바꿀 수 있어요.',
      ].join('\n\n') },
      preapprove, manual)
    if (choice !== preapprove && choice !== manual) return undefined
    const approval = choice === preapprove ? 'PREAPPROVED' : 'MANUAL'
    await context.globalState?.update(COMMAND_APPROVAL_KEY, approval)
    if (approval === 'PREAPPROVED') await enableAutopilot()
    return approval
  }
  /**
   * Pre-approval also starts new Kiro chat sessions in Autopilot, so the learner does not review
   * every file edit (K17). Kiro reads the setting when it creates a session, and a mode the learner
   * picked in Kiro's chat wins over it; manual approval leaves the setting alone.
   */
  async function enableAutopilot() {
    try {
      const config = vscode.workspace.getConfiguration('kiroAgent')
      if (config.inspect('agentAutonomy') === undefined || config.get('agentAutonomy') === 'Autopilot') return
      await config.update('agentAutonomy', 'Autopilot', vscode.ConfigurationTarget.Global)
    } catch {}
  }
  const folderKey = folder => (process.platform === 'win32' ? folder.toLowerCase() : folder)
  async function markFreshSession(folder) {
    const folders = context.globalState?.get(FRESH_SESSION_KEY) ?? []
    const key = folderKey(folder)
    if (!folders.includes(key)) await context.globalState?.update(FRESH_SESSION_KEY, [...folders, key].slice(-20))
  }
  /**
   * Kiro opens a chat session as soon as a window opens, before the learner trusts the folder,
   * and keeps it after the reload. That session asks to review every edit and has no Vibe Helper
   * hooks. Right after a Project folder is connected or trusted, start a new session once, the
   * same as the chat's + button (K17).
   */
  async function startFreshSession(folder) {
    const key = folderKey(folder)
    const folders = context.globalState?.get(FRESH_SESSION_KEY) ?? []
    if (!folders.includes(key) || !vscode.workspace.isTrusted) return false
    await context.globalState?.update(FRESH_SESSION_KEY, folders.filter(item => item !== key))
    try {
      await vscode.commands.executeCommand('kiroAgent.newSession')
      return true
    } catch {
      return false
    }
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
    const approval = await commandApproval()
    const choice = approval === undefined ? {} : { approval }
    let data
    if (current !== null && !inside(generatedRoot, current) && current !== generatedRoot) {
      try {
        data = await bind({ projectId, workspace: current, ...choice })
      } catch (error) {
        const code = safeCode(error)
        if (PROJECT_FOLDER_ELSEWHERE.has(code)) {
          void vscode.window.showInformationMessage(`이 Project는 이미 다른 폴더에서 만들고 있어요. 그 폴더를 새 창으로 열게요. ${NEW_WINDOW_WAIT}`)
        } else if (CURRENT_FOLDER_REFUSALS.has(code)) {
          const open = '새 창에서 열기'
          const choice = await vscode.window.showWarningMessage(
            `${CURRENT_FOLDER_REASONS[code] ?? `지금 연 폴더는 Project 폴더로 쓸 수 없어요 (${code}).`} Vibe Helper가 새 폴더를 만들어 새 창으로 열까요?`,
            { modal: true, detail: NEW_WINDOW_WAIT }, open)
          if (choice !== open) return { projectId, taskId: null, folder: 'CANCELLED', openedNewWindow: false }
        } else throw error
        data = await bind({ projectId, ...choice })
      }
    } else data = await bind({ projectId, ...choice })
    const workspace = await realpath(data.workspace)
    // Only the generated root or the folder Core just confirmed as this Project's registration opens.
    if (!(data.registered === true || inside(generatedRoot, workspace)))
      throw new Error('KIRO_BIND_WORKSPACE_UNSAFE')
    const alreadyOpen = current === workspace
    await markFreshSession(workspace)
    if (!alreadyOpen)
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workspace), { forceNewWindow: true })
    // A new window asks on start; this one asks now, before the learner opens a chat session.
    else if (!vscode.workspace.isTrusted)
      void askForTrust('이 폴더를 Vibe Helper Project로 연결했어요. ').catch(() => {})
    else if (openedUntrusted) void offerReload(RELOAD_AFTER_LATE_TRUST).catch(() => {})
    const reloadRequired = alreadyOpen && (openedUntrusted || !vscode.workspace.isTrusted)
    // This window is trusted and already reads the hooks: start the new chat session now.
    const freshSession = alreadyOpen && !reloadRequired ? await startFreshSession(workspace) : false
    return { projectId: data.projectId, taskId: data.taskId, openedNewWindow: !alreadyOpen,
      folder: data.registered === true ? 'REGISTERED' : 'GENERATED', permissions: data.permissions,
      reloadRequired, freshSession }
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
      if (opened.folder !== 'CANCELLED' && !opened.openedNewWindow && !opened.reloadRequired) {
        void vscode.window.showInformationMessage(opened.freshSession
          ? '이 폴더를 Vibe Helper Project로 연결하고 Kiro 채팅에 새 세션을 열었어요. 거기서 시작하세요.'
          : '이 폴더를 Vibe Helper Project로 연결했어요. Kiro 채팅에서 새 세션(+)을 열어 시작하세요.')
      }
    } catch (error) {
      const code = safeCode(error)
      void vscode.window.showErrorMessage(BIND_MESSAGES[code] ?? `Kiro에서 열지 못했습니다 (${code}).`)
    }
  })
  // Changing the choice reaches every Project folder this Core has connected, so turning
  // pre-approval off takes effect without reconnecting.
  const approvalCommand = vscode.commands.registerCommand('vibeHelper.changeCommandApproval', async () => {
    try {
      const approval = await commandApproval({ ask: true })
      if (approval === undefined) return
      await prepare()
      const counts = await postKiro('/api/kiro/approval', { approval }, 'KIRO_APPROVAL_FAILED')
      const skipped = counts.UNRECOGNIZED > 0
        ? ` Project 폴더 ${counts.UNRECOGNIZED}곳은 Kiro 권한 파일 모양이 달라 바꾸지 못했어요.` : ''
      void vscode.window.showInformationMessage(approval === 'PREAPPROVED'
        ? `이제 Project 폴더에서 자주 쓰는 개발 명령을 미리 승인해요.${skipped}`
        : `이제 Kiro가 명령과 도구마다 확인을 받아요.${skipped}`)
    } catch (error) {
      const code = safeCode(error)
      void vscode.window.showErrorMessage(BIND_MESSAGES[code] ?? `승인 방식을 바꾸지 못했습니다 (${code}).`)
    }
  })
  // Kiro skips hooks and steering in an untrusted folder (and asks before every command even when
  // pre-approved) and loads hooks when a session starts, so a bound folder needs trust and then a
  // reload before chat reaches Vibe Helper.
  const boundFolder = async () => {
    const folders = vscode.workspace.workspaceFolders ?? []
    if (folders.length !== 1) return false
    return access(join(folders[0].uri.fsPath, BOUND_MARKER)).then(() => true, () => false)
  }
  const currentFolder = async () => {
    const folders = vscode.workspace.workspaceFolders ?? []
    return folders.length === 1 ? await realpath(folders[0].uri.fsPath).catch(() => folders[0].uri.fsPath) : ''
  }
  async function offerReload(text) {
    const reload = '다시 로드'
    const choice = await vscode.window.showInformationMessage(text, reload)
    if (choice === reload) await vscode.commands.executeCommand('workbench.action.reloadWindow')
  }
  async function askForTrust(lead = '') {
    const manage = '신뢰 설정 열기'
    const choice = await vscode.window.showWarningMessage(
      `${lead}이 폴더를 신뢰해야 Vibe Helper가 Kiro 채팅에 연결돼요.`, manage)
    if (choice === manage) await vscode.commands.executeCommand('workbench.trust.manage')
  }
  void boundFolder().then(async bound => {
    if (!bound || stopped) return
    boundWindow = true
    if (!vscode.workspace.isTrusted) return askForTrust()
    // Kiro chat's Vibe Helper tools reach Core through the MCP bridge; start it without the panel.
    void prepare().catch(() => {})
    // A folder just connected (new window) or just trusted (after the reload) starts a new session.
    const folder = await currentFolder()
    const timer = setTimeout(() => { if (!stopped) void startFreshSession(folder).catch(() => {}) }, FRESH_SESSION_DELAY_MS)
    timer.unref?.()
  }).catch(() => {})
  const trust = vscode.workspace.onDidGrantWorkspaceTrust(() => {
    void prepare().catch(() => {})
    void boundFolder().then(async bound => {
      if (!bound || stopped) return
      boundWindow = true
      await markFreshSession(await currentFolder())
      await offerReload('신뢰가 Kiro 채팅에 적용되도록 창을 다시 로드할까요? 다시 로드하면 새 채팅 세션이 열려요.')
    }).catch(() => {})
  })
  // The Project this window's folder is connected to, read from the hook Core wrote there
  // (`…/kiro-bindings/<projectId>/hook.json`); 'UNKNOWN' when the hook names none (K23).
  const boundProject = async () => {
    const folders = vscode.workspace.workspaceFolders ?? []
    if (folders.length !== 1) return null
    const text = await readFile(join(folders[0].uri.fsPath, BOUND_MARKER), 'utf8').catch(() => null)
    if (text === null) return null
    return text.match(/kiro-bindings[\\/]+(project_[0-9a-f-]{36})[\\/]+hook\.json/)?.[1] ?? 'UNKNOWN'
  }
  /**
   * K23: what Kiro chat in this window reaches for `projectId`, for the panel's "지금 할 일". A
   * folder connected to another Project is `NOT_BOUND` for this one. A window that opened before
   * its folder was trusted keeps hooks and MCP off until one reload. Never rejects.
   */
  async function kiroWindow(projectId) {
    const bound = await boundProject().catch(() => null)
    if (bound === null) return 'NOT_BOUND'
    if (typeof projectId === 'string' && bound !== 'UNKNOWN' && bound !== projectId) return 'NOT_BOUND'
    if (!vscode.workspace.isTrusted) return 'UNTRUSTED'
    return openedUntrusted ? 'RELOAD' : 'READY'
  }
  async function retry() {
    if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
    kiroCli = await findKiroCli(); await lifecycle.retry(); return prepare()
  }
  async function dispose() {
    if (disposal) return disposal
    stopped = true; trust.dispose(); openCommand.dispose(); approvalCommand.dispose()
    disposal = (async () => {
      await lifecycle.dispose()
      await preparation?.catch(() => {})
      connection.dispose(); unsubscribeLifecycle()
      emit({ phase: 'STOPPED', native: 'NOT_READY' }); listeners.clear()
    })()
    return disposal
  }
  return Object.freeze({ client, worker, prepare, assertAgentReady, openProjectInKiro, kiroWindow, getStatus: () => status,
    subscribeStatus(listener) { listeners.add(listener); listener(status); return () => listeners.delete(listener) },
    onDidRotate: connection.onDidRotate,
    retry,
    dispose,
  })
}
module.exports = { createFrontendHost }
