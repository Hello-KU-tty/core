const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { test } = require('node:test')
const { join } = require('node:path')

const source = readFileSync(join(__dirname, '../src/extension.cjs'), 'utf8')

test('a reopened panel reattaches one live run stream and restores its terminal state', async () => {
  const projectId = 'project_synthetic'
  const runId = 'run_synthetic'
  const messages = []
  const panels = []
  const subscriptions = []
  const watches = []
  let currentRun = { id: runId, projectId, kind: 'DISCOVERY', phase: 'ENRICH_FIRST',
    status: 'RUNNING', outcome: 'PENDING' }
  let terminalHelper = null
  let helperReplays = 0
  let cancelled = 0
  let staleConnection = false
  let connectionClient
  let openPanel
  const client = {
    health: async () => ({ agent: 'OTHER', backendInstanceId: 'instance-synthetic' }),
    listProjects: async () => {
      if (staleConnection) throw Object.assign(new Error('LOCAL_AUTH_FAILED'),
        { code: 'LOCAL_AUTH_FAILED' })
      return { projects: [] }
    },
    restoreProject: async id => ({ project: { id, correlationId: 'corr_synthetic' } }),
    execute: async () => ({}),
    listRuns: async id => id === projectId
      ? [currentRun, ...(terminalHelper ? [terminalHelper] : [])] : [],
    startDiscovery: async () => ({ projectId, run: currentRun }),
    cancelRun: async () => { cancelled += 1 },
    watchRun: (id, onEvent, options) => {
      if (id === terminalHelper?.id) {
        helperReplays += 1
        onEvent({ runId: id, projectId, kind: 'TEXT', text: 'Actual retained Helper response' })
        return Promise.resolve(terminalHelper)
      }
      return new Promise((resolve, reject) => {
      assert.equal(id, runId)
      const watch = { resolve, reject, options }
      watches.push(watch)
      options.signal.addEventListener('abort', () => reject(new Error('ABORTED')), { once: true })
      })
    },
  }
  connectionClient = client
  const vscode = {
    workspace: { getConfiguration: () => ({ get: () => 'synthetic-connection' }) },
    commands: { registerCommand: (name, callback) => {
      if (name === 'vibeHelper.localPanel') openPanel = callback
      else assert.ok(['vibeHelper.singleHostModelMetadata',
        'vibeHelper.singleHostSubagentProbe',
        'vibeHelper.singleHostInvokeProbe',
        'vibeHelper.singleHostBuiltinPolicyProbe',
        'vibeHelper.singleHostBuiltinDenySeedProbe',
        'vibeHelper.singleHostMemoryMetadata',
        'vibeHelper.singleHostProtectedToolMetadata',
        'vibeHelper.singleHostProtectedPairProbe',
        'vibeHelper.nativeCleanEvaluationRun',
        'vibeHelper.nativeAnalystSemanticEval',
        'vibeHelper.nativeAnalystSonnetVariant',
        'vibeHelper.nativeHelperAblationArm',
        'vibeHelper.nativeHelperAblationRun'].includes(name))
      return { dispose() {} }
    } },
    window: { createWebviewPanel: () => {
      const panel = { webview: {
        asWebviewUri: () => 'synthetic-script',
        postMessage: message => { messages.push(message); return true },
        onDidReceiveMessage: callback => { panel.receive = callback },
      }, onDidDispose: callback => { panel.disposePanel = callback } }
      panels.push(panel)
      return panel
    } },
    ViewColumn: { Beside: 2 },
    Uri: { joinPath: () => 'synthetic-uri' },
  }
  const dependencies = {
    vscode,
    'node:crypto': require('node:crypto'),
    'node:fs/promises': { readFile: async () => '<html>{{nonce}}{{script}}</html>' },
    'node:path': require('node:path'),
    'node:os': require('node:os'),
    '@vibe-helper/frontend-client/node': { connectLocalCore: async () => connectionClient },
    '@vibe-helper/application/redaction': { redactSensitiveText: value => value },
    '@vibe-helper/frontend-client': {
      entityId: () => 'synthetic-id', uiMetadata: () => ({}),
      localRunRequestSchema: { parse: value => value },
      candidateIdSchema: { parse: value => value },
      discoveryInputSchema: { parse: value => value },
    },
    './native-worker.cjs': { startNativeWorker: () => null },
    './analysis-retry.cjs': { readFailedAnalysisJobs: async () => [], retryFailedAnalysis() {} },
    './final-upgrade.cjs': { eligibleFinalUpgradeTraces: () => [] },
    './evidence-view.cjs': { summarizeEvidenceTrace: () => ({}) },
    './discovery-navigation.cjs': { restartDiscoveryInput: () => ({}) },
    './core-connection.cjs': require('../src/core-connection.cjs'),
    './native-runtime.cjs': {
      createRetryableRuntimeResolver: callback => callback,
      resolvePackagedNativeRuntime: async () => ({}),
    },
    './native-clean-evaluation-command.cjs': {
      registerNativeCleanEvaluationCommand: mockedVscode =>
        mockedVscode.commands.registerCommand('vibeHelper.nativeCleanEvaluationRun', async () => {}),
    },
    '../../kiro-native-host/native-client.cjs': {
      currentApprovedBuiltinHelperScope: () => ({}),
      openProtectedBuiltinH: async () => ({}),
      openProtectedHLogBarrier: async () => ({}),
    },
    './native-helper-ablation-idle.cjs': {
      assertNativeCoreIdle: async () => undefined,
      assertNativeHelperAblationIdle: async () => undefined,
    },
    './single-host-capability.cjs': { readLanguageModelMetadata: async () => ({ apiAvailable: false }),
      formatLanguageModelMetadata: () => 'LM_API_UNAVAILABLE' },
  }
  const module = { exports: {} }
  new Function('require', 'module', source)((name) => {
    if (!(name in dependencies)) throw new Error(`UNEXPECTED_REQUIRE:${name}`)
    return dependencies[name]
  }, module)
  module.exports.activate({ extensionUri: {}, extensionPath: '/synthetic',
    globalState: { get: () => projectId, update: async () => {} }, subscriptions })

  await openPanel()
  await panels[0].receive({ action: 'start', goal: 'synthetic goal' })
  assert.equal(watches.length, 1,
    'start → restore → explicit watch should subscribe exactly once')
  await panels[0].receive({ action: 'refresh' })
  assert.equal(watches.length, 1, 'refresh should not attach a duplicate stream')
  panels[0].disposePanel()
  assert.equal(watches[0].options.signal.aborted, true)
  assert.equal(cancelled, 0, 'closing the panel must not cancel the backend run')

  await openPanel()
  await panels[1].receive({ action: 'refresh' })
  assert.equal(watches.length, 2, 'new panel should reattach the active run')
  currentRun = { ...currentRun, status: 'SUCCEEDED', outcome: 'DURABLE_RESULT' }
  watches[1].options.onRun(currentRun)
  watches[1].resolve(currentRun)
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(messages.some(message => message.kind === 'run' &&
    message.data?.status === 'SUCCEEDED' && message.data?.id === runId))
  assert.equal(watches.length, 2, 'terminal restore must not reattach the finished run')
  assert.equal(cancelled, 0)

  terminalHelper = { id: 'run_helper_synthetic', projectId, kind: 'HELPER', phase: 'HELPER',
    status: 'SUCCEEDED', outcome: 'HELPER_RECORDED' }
  await panels[1].receive({ action: 'refresh' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(helperReplays, 1, 'restore replays the actual terminal Helper stream once')
  assert.ok(messages.some(message => message.kind === 'event' &&
    message.data?.runId === terminalHelper.id &&
    message.data.text === 'Actual retained Helper response'))
  await panels[1].receive({ action: 'refresh' })
  assert.equal(helperReplays, 2, 'refresh replays retained output for a recreated webview')
  await panels[1].receive({ action: 'history', projectId: 'project_other' })
  await panels[1].receive({ action: 'history', projectId })
  assert.equal(helperReplays, 3, 'returning to a Project replays its terminal Helper after UI clear')
  panels[1].disposePanel()
  await openPanel()
  await panels[2].receive({ action: 'refresh' })
  assert.equal(helperReplays, 4, 'a reopened panel may replay retained output again')

  currentRun = { ...currentRun, status: 'RUNNING', outcome: 'PENDING' }
  await panels[2].receive({ action: 'refresh' })
  assert.equal(watches.length, 3, 'ordinary refresh may retain the existing active watch')
  const helperReplaysBeforeRotation = helperReplays
  const snapshotsBeforeRotation = messages.filter(message => message.kind === 'snapshot').length
  let replacementLists = 0
  let replacementRestores = 0
  connectionClient = {
    ...client,
    health: async () => ({ agent: 'OTHER', backendInstanceId: 'instance-replacement' }),
    listProjects: async () => { replacementLists += 1; return { projects: [] } },
    restoreProject: async id => {
      replacementRestores += 1
      return { project: { id, correlationId: 'corr_replacement' }, restoredGeneration: 2 }
    },
  }
  staleConnection = true
  await panels[2].receive({ action: 'refresh' })
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(replacementLists, 2,
    'the interrupted restore retries its read, then one queued durable restore owns UI recovery')
  assert.equal(replacementRestores, 1,
    'the invalidated pre-rotation restore cannot continue with a late snapshot')
  assert.equal(watches.length, 3, 'rotation recovery must not attach a replacement active SSE')
  assert.equal(helperReplays, helperReplaysBeforeRotation,
    'rotation recovery must not replay retained terminal SSE either')
  const recoveredSnapshots = messages.filter(message => message.kind === 'snapshot')
    .slice(snapshotsBeforeRotation)
  assert.equal(recoveredSnapshots.length, 1)
  assert.equal(recoveredSnapshots[0].data.restoredGeneration, 2)
  assert.equal(messages.filter(message => message.kind === 'connectionStatus' &&
    message.status === 'RECOVERED_READ_ONLY').length, 1)
  assert.equal(messages.at(-1).kind, 'ready',
    'the initiating UI action becomes ready only after durable recovery completes')
})
