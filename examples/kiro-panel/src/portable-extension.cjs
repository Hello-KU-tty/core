const vscode = require('vscode')
const { mkdir, readFile, realpath } = require('node:fs/promises')
const { dirname, join } = require('node:path')
const { connectLocalCore, readLocalConnection } = require('@vibe-helper/frontend-client/node')
const { createCoreLifecycle } = require('./core-lifecycle.cjs')
const { registerLocalPanel } = require('./local-panel.cjs')
const { startNativeWorker } = require('./native-worker.cjs')
const { createNativeWorkerHandle } = require('./native-worker-handle.cjs')
const { shouldOpenGeneratedPanel } = require('./panel-startup.cjs')
const { attestWindowsKiroInstallation } = require('../../kiro-native-host/native-installation-source.cjs')

let lifecycle, nativeWorker
const safeCode = error => /^[A-Z][A-Z0-9_]{0,99}$/.test(error?.code ?? error?.message ?? '')
  ? error.code ?? error.message : 'PORTABLE_START_FAILED'

async function activate(context) {
  const api = require(join(context.extensionPath, 'portable/bin/runtime.cjs'))
  await mkdir(context.globalStorageUri.fsPath, { recursive: true })
  const storagePath = await realpath(context.globalStorageUri.fsPath)
  const resourceRoot = await realpath(join(context.extensionPath, 'portable'))
  lifecycle = createCoreLifecycle({ api, connect: connectLocalCore, readConnection: readLocalConnection,
    storagePath,
    selectRuntime: signal => api.selectCoreRuntime({
      resourceRoot,
      privateRoot: join(storagePath, 'core-tools'),
      kiroExecutable: process.execPath, signal,
    }),
  })
  let status = { phase: 'PREPARING_RUNTIME', native: 'NOT_READY' }
  let nativeError = 'NATIVE_NOT_READY'
  const workerHandle = createNativeWorkerHandle()
  let preparation
  const listeners = new Set()
  const emit = value => {
    status = Object.freeze({ ...status, ...value })
    for (const listener of listeners) { try { listener(status) } catch {} }
  }
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
  bar.command = 'vibeHelper.localPanel'
  bar.name = 'Vibe Helper'
  bar.show()
  context.subscriptions.push(bar)
  lifecycle.subscribe(value => {
    emit(value)
    bar.text = value.phase === 'CORE_CONNECTED' ? '$(check) Vibe Helper' : '$(sync) Vibe Helper'
    bar.tooltip = value.errorCode ?? value.phase
  })
  function prepare() {
    if (!preparation) preparation = prepareOnce().finally(() => { preparation = null })
    return preparation
  }
  async function prepareOnce() {
    let ready
    try { ready = await lifecycle.start() }
    catch (error) {
      const answer = await vscode.window.showErrorMessage(`Core 준비 실패: ${safeCode(error)}`, '재시도')
      if (answer === '재시도') void vscode.commands.executeCommand('vibeHelper.retryCore')
      return null
    }
    try {
      attestWindowsKiroInstallation(vscode)
      if (!vscode.workspace.isTrusted) throw new Error('NATIVE_WORKSPACE_TRUST_REQUIRED')
      if (!nativeWorker) {
        const prompts = {}
        for (const [role, name] of Object.entries({ DISCOVERY: 'discovery', BUILDER: 'builder',
          HELPER: 'helper', EVIDENCE_ANALYST: 'evidence-analyst' })) {
          const path = join(ready.resources.promptDirectory, `${name}.md`)
          prompts[role] = { path, text: await readFile(path, 'utf8') }
        }
        nativeWorker = startNativeWorker(context, ready.connectionFile, {
          source: 'KIRO_IDE_1.1.14_AGENT_1.1.28_WINDOWS_X64', windowsProduct: true,
          nodePath: ready.runtime.executable, runtimeDescriptor: ready.runtime,
          bridgeScriptPath: ready.resources.bridge, prompts,
          projectTools: { api, resources: ready.resources },
        })
        workerHandle.attach(nativeWorker)
      }
      nativeError = null
      emit({ native: 'WORKER_READY', helperMode: 'SEPARATE_WINDOW', errorCode: null })
    } catch (error) {
      nativeError = safeCode(error)
      emit({ native: 'UNAVAILABLE', errorCode: nativeError })
    }
    return { connectionFile: ready.connectionFile, worker: workerHandle }
  }
  registerLocalPanel(context, { prepare, singlePanel: true,
    getStatus: () => status,
    subscribeStatus(listener) { listeners.add(listener); listener(status); return () => listeners.delete(listener) },
    assertAgentReady() {
      if (status.phase !== 'CORE_CONNECTED') throw new Error(status.errorCode ?? 'CORE_NOT_CONNECTED')
      if (nativeError) throw new Error(nativeError)
    },
  })
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.retryCore', async () => {
    await lifecycle.retry().catch(() => {})
    await prepare()
    return vscode.commands.executeCommand('vibeHelper.localPanel')
  }))
  context.subscriptions.push(vscode.workspace.onDidGrantWorkspaceTrust(() => { void prepare() }))
  void prepare().then(async ready => {
    if (!ready) return
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!folder || vscode.workspace.workspaceFolders.length !== 1) return
    const workspace = await realpath(folder)
    const generatedRoot = await realpath(join(dirname(ready.connectionFile), 'workspaces'))
    if (shouldOpenGeneratedPanel(workspace, generatedRoot))
      await vscode.commands.executeCommand('vibeHelper.localPanel')
  }).catch(() => {})
  return { lifecycleStatus: () => status }
}
async function deactivate() { nativeWorker?.stop(); nativeWorker = null; await lifecycle?.dispose() }
module.exports = { activate, deactivate }
