// Extension-host API, independent of any panel. Never send this object to a webview.
const vscode = require('vscode')
const { mkdir, readFile, realpath } = require('node:fs/promises')
const { join } = require('node:path')
const { connectLocalCore, readLocalConnection } = require('@vibe-helper/frontend-client/node')
const { createCoreLifecycle } = require('./core-lifecycle.cjs')
const { createCoreConnectionManager, READ_ONLY_UI_KINDS } = require('./core-connection.cjs')
const { startNativeWorker } = require('./native-worker.cjs')
const { createNativeWorkerHandle } = require('./native-worker-handle.cjs')
const { prepareWindowsProjectTerminal } = require('./windows-terminal-environment.cjs')
const { attestWindowsKiroInstallation } = require('../../kiro-native-host/native-installation-source.cjs')

const safeCode = error => /^[A-Z][A-Z0-9_]{0,99}$/.test(error?.code ?? error?.message ?? '')
  ? error.code ?? error.message : 'FRONTEND_HOST_FAILED'

async function createFrontendHost(context) {
  const api = require(join(context.extensionPath, 'portable/bin/runtime.cjs'))
  await mkdir(context.globalStorageUri.fsPath, { recursive: true })
  const storagePath = await realpath(context.globalStorageUri.fsPath)
  const resourceRoot = await realpath(join(context.extensionPath, 'portable'))
  const lifecycle = createCoreLifecycle({ api, connect: connectLocalCore, readConnection: readLocalConnection,
    storagePath, selectRuntime: signal => api.selectCoreRuntime({ resourceRoot,
      privateRoot: join(storagePath, 'core-tools'), kiroExecutable: process.execPath, signal }),
  })
  const connectionFile = join(storagePath, 'core-data/connection.json')
  const connection = createCoreConnectionManager({ connectionFile, connect: connectLocalCore })
  const worker = createNativeWorkerHandle()
  let nativeWorker, preparation, disposal, stopped = false
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
  // Read-only History remains available if the exact Kiro source is unsupported.
  // No mutation may silently enter a mock transport or bypass readiness/trust.
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
      const ready = await lifecycle.start()
      if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
      try {
        const installation = attestWindowsKiroInstallation(vscode)
        if (!vscode.workspace.isTrusted) throw new Error('NATIVE_WORKSPACE_TRUST_REQUIRED')
        if (!nativeWorker) {
          const windows1170Diagnostic = installation.appVersion === '1.1.70'
          if (windows1170Diagnostic) await prepareWindowsProjectTerminal(vscode, context, ready.connectionFile)
          if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
          const prompts = {}
          for (const [role, name] of Object.entries({ DISCOVERY: 'discovery', BUILDER: 'builder',
            HELPER: 'helper', EVIDENCE_ANALYST: 'evidence-analyst' })) {
            const path = join(ready.resources.promptDirectory, `${name}.md`)
            prompts[role] = { path, text: await readFile(path, 'utf8') }
          }
          if (stopped) throw new Error('FRONTEND_HOST_STOPPED')
          nativeWorker = startNativeWorker(context, ready.connectionFile, {
            source: `KIRO_IDE_${installation.appVersion}_AGENT_${installation.agentExtensionVersion}_WINDOWS_X64`,
            windowsProduct: true, windows1170Diagnostic,
            nodePath: ready.runtime.executable, runtimeDescriptor: ready.runtime,
            bridgeScriptPath: ready.resources.bridge, prompts, projectTools: { api, resources: ready.resources },
          })
          worker.attach(nativeWorker)
        }
        emit({ native: 'WORKER_READY', helperMode: 'SEPARATE_WINDOW', nativeErrorCode: null })
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
  const trust = vscode.workspace.onDidGrantWorkspaceTrust(() => { void prepare().catch(() => {}) })
  async function dispose() {
    if (disposal) return disposal
    stopped = true; trust.dispose()
    disposal = (async () => {
      await lifecycle.dispose()
      await preparation?.catch(() => {})
      nativeWorker?.stop(); nativeWorker = null; worker.attach(null)
      connection.dispose(); unsubscribeLifecycle()
      emit({ phase: 'STOPPED', native: 'NOT_READY' }); listeners.clear()
    })()
    return disposal
  }
  return Object.freeze({ client, worker, prepare, assertAgentReady, getStatus: () => status,
    subscribeStatus(listener) { listeners.add(listener); listener(status); return () => listeners.delete(listener) },
    onDidRotate: connection.onDidRotate,
    async retry() { if (stopped) throw new Error('FRONTEND_HOST_STOPPED'); await lifecycle.retry(); return prepare() },
    dispose,
  })
}
module.exports = { createFrontendHost }
