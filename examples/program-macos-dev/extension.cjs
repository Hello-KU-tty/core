// Development-only host for the actual program UI. Never shipped as Windows
// support or a replacement for its managed/portable runtime attestation.
const vscode = require('vscode')
const { readFile } = require('node:fs/promises')
const { join } = require('node:path')
const { connectLocalCore } = require('@vibe-helper/frontend-client/node')
const { AgentPanelViewProvider, AGENT_PANEL_VIEW_ID } = require('@vibe-helper/program-panel')
const { createCoreConnectionManager } = require('../kiro-panel/src/core-connection.cjs')
const { resolvePackagedNativeRuntime } = require('../kiro-panel/src/native-runtime.cjs')
const { startNativeWorker } = require('../kiro-panel/src/native-worker.cjs')
const { createNativeWorkerHandle } = require('../kiro-panel/src/native-worker-handle.cjs')
const { createBudgetedClient } = require('./model-admission.cjs')
const { configureWorkspaceEnvironment } = require('./isolated-environment.cjs')

async function activate(context) {
  const config = JSON.parse(await readFile(join(context.extensionPath, 'dev-config.json'), 'utf8'))
  const manager = createCoreConnectionManager({ connectionFile: config.connectionFile, connect: connectLocalCore })
  const worker = createNativeWorkerHandle()
  const listeners = new Set()
  let status = { phase: 'CORE_PREPARING', native: 'NOT_READY' }
  let preparation
  const setStatus = value => {
    status = value
    for (const listener of listeners) listener(status)
  }
  // Missing/expired observations fail closed; reads and cancellation remain
  // available. Atomic claims preserve the limit across reload/overlapping hosts.
  const client = createBudgetedClient(manager.client, config, () => vscode.workspace.isTrusted)
  const prepare = async () => {
    if (!preparation) preparation = (async () => {
      const health = await client.health()
      if (health.agent !== 'KIRO_IDE_BUILTIN_AGENT') throw new Error('NATIVE_CORE_REQUIRED')
      if (!vscode.workspace.isTrusted) {
        setStatus({ phase: 'CORE_CONNECTED', native: 'NOT_READY', nativeErrorCode: 'NATIVE_WORKSPACE_TRUST_REQUIRED' })
        return { client }
      }
      const runtime = await resolvePackagedNativeRuntime({
        extensionPath: context.extensionPath, vscode,
        platform: process.platform, arch: process.arch, vscodeVersion: vscode.version,
        runtimeSource: 'KIRO_IDE_1.0.437_AGENT_1.0.794_MACOS_ARM64',
        nodeExecutable: '/opt/homebrew/opt/node@24/bin/node',
      })
      if (config.isolatedCoreRoot)
        await configureWorkspaceEnvironment(vscode, context, config.isolatedCoreRoot)
      worker.attach(startNativeWorker(context, config.connectionFile, runtime))
      setStatus({ phase: 'CORE_CONNECTED', native: 'WORKER_READY' })
      return { client }
    })().catch(error => {
      preparation = undefined
      const code = /^[A-Z][A-Z0-9_]{0,99}$/.test(error?.code ?? error?.message ?? '') ? (error.code ?? error.message) : 'CORE_PREPARE_FAILED'
      setStatus({ phase: 'CORE_FAILED', native: 'NOT_READY', errorCode: code })
      throw error
    })
    return preparation
  }
  const host = { client, worker, prepare,
    retry: async () => { preparation = undefined; return prepare() },
    getStatus: () => status,
    subscribeStatus: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    onDidRotate: listener => manager.onDidRotate(listener),
    dispose: async () => manager.dispose(),
  }
  context.subscriptions.push({ dispose: () => manager.dispose() })
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(AGENT_PANEL_VIEW_ID,
    new AgentPanelViewProvider(context.extensionUri, Promise.resolve(host), context.globalState)))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.retryCore', async () => {
    await host.retry()
    await vscode.commands.executeCommand('workbench.action.reloadWindow')
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.stopDiscovery', async () => {
    const projectId = context.globalState.get('bhlr.lastProjectId')
    if (!projectId) return
    for (const run of await client.listRuns(projectId))
      if (run.kind === 'DISCOVERY' && ['ACCEPTED', 'RUNNING'].includes(run.status)) await client.cancelRun(run.id)
  }))
  void vscode.commands.executeCommand(`${AGENT_PANEL_VIEW_ID}.focus`)
  return { backend: Promise.resolve(host) }
}
module.exports = { activate }
