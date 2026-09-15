const vscode = require('vscode')
const { randomBytes } = require('node:crypto')
const { mkdtemp, readFile, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { connectLocalCore } = require('@vibe-helper/frontend-client/node')
const { redactSensitiveText } = require('@vibe-helper/application/redaction')
const { entityId, uiMetadata, localRunRequestSchema, candidateIdSchema, discoveryInputSchema } = require('@vibe-helper/frontend-client')
const { startNativeWorker } = require('./native-worker.cjs')
const { readFailedAnalysisJobs, retryFailedAnalysis } = require('./analysis-retry.cjs')
const { eligibleFinalUpgradeTraces } = require('./final-upgrade.cjs')
const { summarizeEvidenceTrace } = require('./evidence-view.cjs')
const { restartDiscoveryInput } = require('./discovery-navigation.cjs')
const { createCoreConnectionManager } = require('./core-connection.cjs')
const { createRetryableRuntimeResolver, resolvePackagedNativeRuntime } =
  require('./native-runtime.cjs')
const { readLanguageModelMetadata, formatLanguageModelMetadata,
  readProbeMarkers, evaluateSubagentProbe, evaluateInvokeProbe } =
  require('./single-host-capability.cjs')

function activate(context) {
  const packagedRuntime = createRetryableRuntimeResolver(() => {
    const configuration = vscode.workspace.getConfiguration('vibeHelper')
    return resolvePackagedNativeRuntime({
      extensionPath: context.extensionPath,
      vscode,
      platform: process.platform,
      arch: process.arch,
      vscodeVersion: vscode.version,
      runtimeSource: configuration.get('nativeRuntimeSource',
        'KIRO_IDE_1.0.437_AGENT_1.0.794_MACOS_ARM64'),
      nodeExecutable: configuration.get('nativeNodeExecutable',
        '/opt/homebrew/opt/node@24/bin/node'),
    })
  })
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.singleHostModelMetadata', async () => {
    try {
      const metadata = await readLanguageModelMetadata(vscode)
      await vscode.window.showInformationMessage(formatLanguageModelMetadata(metadata))
    } catch {
      await vscode.window.showInformationMessage('LM_PROBE_FAILED')
    }
  }))
  let subagentProbeBusy = false
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.singleHostSubagentProbe', async () => {
    if (subagentProbeBusy) return
    subagentProbeBusy = true
    let session
    try {
      const folders = vscode.workspace.workspaceFolders
      if (folders?.length !== 1) throw new Error('SINGLE_HOST_PROBE_WORKSPACE_REQUIRED')
      const workspace = require('node:fs').realpathSync(folders[0].uri.fsPath)
      const { verifyProbe, AGENTS } = require('../../kiro-native-host/single-host-subagent-probe.cjs')
      const { openNativeRole } = require('../../kiro-native-host/native-client.cjs')
      const probe = verifyProbe(workspace)
      let permissionRequests = 0
      let userInputRequests = 0
      let eventOverflow = false
      const activities = []
      session = await openNativeRole(vscode, { workspace, role: AGENTS.parent,
        requireMcp: false, capabilityProbe: true, redactText: () => '',
        onPermissionRequest: async () => { permissionRequests += 1; return null },
        onUserInputRequest: async () => ({ action: 'dismissed' }),
        onProtocolTelemetry: event => {
          if (event.kind === 'USER_INPUT_REQUEST') userInputRequests += 1
        } })
      await session.prompt('Run exactly one orchestrate_subagent call with task "inert concurrency check" and two independent stages. Stage A: name "a", role "vibe-single-host-a", prompt_template "Call your own meet tool exactly once, then subagent_response with response A_DONE and no files." Stage B: name "b", role "vibe-single-host-b", prompt_template "Call your own meet tool exactly once, then subagent_response with response B_DONE and no files." Do not add dependencies, repeat, files, user_input, other roles, or other tools. If orchestrate_subagent is unavailable, say DAG_TOOL_UNAVAILABLE and stop.', event => {
        if (event.kind === 'tool_activity') {
          if (activities.length >= 100) eventOverflow = true
          else activities.push({
            action: event.probeAction, tool: event.probeToolId,
            status: event.nativeStatus, stages: event.probeStageRoles,
            subExecutionTag: event.subExecutionTag,
            protocolKind: event.protocolKind, error: event.probeToolError,
          })
        }
      })
      const markers = await readProbeMarkers(probe.markerDirectory)
      const result = evaluateSubagentProbe(markers, activities, permissionRequests,
        userInputRequests, eventOverflow)
      await vscode.window.showInformationMessage(
        `SINGLE_HOST_PROBE ${result.passed ? 'DAG_BARRIER_PASS' : 'UNCONFIRMED'} ` +
        `window=${session.windowId} overlap=${markers.overlapped} ` +
        `orchestrate=${result.orchestrate} meetA=${result.meetA} ` +
        `meetB=${result.meetB} childIds=${result.childIdsObserved} ` +
        `permissionRequests=${permissionRequests} userInputRequests=${userInputRequests} ` +
        `unsafe=${result.unsafe} overflow=${eventOverflow}`)
    } catch (error) {
      const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ?
        error.code : typeof error?.message === 'string' &&
          /^[A-Z0-9_]{1,80}$/.test(error.message) ? error.message : 'SINGLE_HOST_PROBE_FAILED'
      await vscode.window.showInformationMessage(`SINGLE_HOST_PROBE ${code}`)
    } finally { session?.close(); subagentProbeBusy = false }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.singleHostInvokeProbe', async () => {
    if (subagentProbeBusy) return
    subagentProbeBusy = true
    let session
    try {
      const folders = vscode.workspace.workspaceFolders
      if (folders?.length !== 1) throw new Error('SINGLE_HOST_INVOKE_WORKSPACE_REQUIRED')
      const workspace = require('node:fs').realpathSync(folders[0].uri.fsPath)
      const { verifyProbe, AGENTS } = require('../../kiro-native-host/single-host-invoke-probe.cjs')
      const { openNativeRole } = require('../../kiro-native-host/native-client.cjs')
      const probe = verifyProbe(workspace)
      let permissionRequests = 0
      const permittedRoles = new Set()
      let unexpectedPermissionRequests = 0
      let userInputRequests = 0
      let eventOverflow = false
      const activities = []
      session = await openNativeRole(vscode, { workspace, role: AGENTS.parent,
        requireMcp: false, invokeCapabilityProbe: true, redactText: () => '',
        onPermissionRequest: async (summary, details) => {
          permissionRequests += 1
          const input = details.rawInput
          if (details.nativeToolId !== 'invoke_sub_agent' ||
              ![AGENTS.a, AGENTS.b].includes(summary.safeName) ||
              !input || typeof input !== 'object' || Array.isArray(input) ||
              input?.name !== summary.safeName ||
              Object.keys(input).some(key => !['name', 'prompt', 'explanation'].includes(key)) ||
              typeof input.prompt !== 'string' || input.prompt.length > 500 ||
              !/^[\x20-\x7e]+$/.test(input.prompt) ||
              !/meet/i.test(input.prompt) ||
              !/subagent_response/i.test(input.prompt) ||
              !/no files/i.test(input.prompt) ||
              !input.prompt.includes(summary.safeName === AGENTS.a ? 'A_DONE' : 'B_DONE') ||
              /[/\\~]|https?:|\b(?:read|write|shell|execute|fetch)\b/i.test(input.prompt) ||
              typeof input.explanation !== 'string' || input.explanation.length > 2000 ||
              permittedRoles.has(input.name) || permittedRoles.size >= 2) {
            unexpectedPermissionRequests += 1
            return null
          }
          const allow = details.options.find(option => option.kind === 'allow_once')
          if (!allow?.optionId) return null
          permittedRoles.add(input.name)
          return allow.optionId
        },
        onUserInputRequest: async () => ({ action: 'dismissed' }),
        onProtocolTelemetry: event => {
          if (event.kind === 'USER_INPUT_REQUEST') userInputRequests += 1
        } })
      const turn = await session.prompt(
        'This is a token-free capability check. In ONE assistant response issue TWO separate '
        + 'invoke_sub_agent tool calls, one with name "vibe-single-invoke-a" and one with '
        + 'name "vibe-single-invoke-b". A prompt: "Call your own meet tool once, then '
        + 'subagent_response with A_DONE and no files." B prompt: "Call your own meet '
        + 'tool once, then subagent_response with B_DONE and no files." Use distinct '
        + 'explanations A and B. Omit contextFiles and preset. Do not wait for A before '
        + 'issuing B; do not use any file, shell, MCP, user_input, or other role yourself. '
        + 'If invoke_sub_agent is unavailable, reply exactly INVOKE_TOOL_UNAVAILABLE and stop.',
        event => {
          if (event.kind !== 'tool_activity') return
          if (activities.length >= 100) eventOverflow = true
          else activities.push({
            action: event.probeAction, tool: event.probeToolId,
            toolCallTag: event.toolId, role: event.probeRole,
            contextFilesPresent: event.probeContextFilesPresent,
            responseFilesPresent: event.probeResponseFilesPresent,
            status: event.nativeStatus, subExecutionTag: event.subExecutionTag,
            protocolKind: event.protocolKind, error: event.probeToolError,
          })
        })
      const markers = await readProbeMarkers(probe.markerDirectory)
      const result = evaluateInvokeProbe(markers, activities, permissionRequests,
        userInputRequests, eventOverflow, turn.exactUnavailableSentinel, turn.stopReason,
        unexpectedPermissionRequests, [...permittedRoles])
      await vscode.window.showInformationMessage(
        `SINGLE_HOST_INVOKE ${result.passed ? 'BARRIER_PASS' : 'UNCONFIRMED'} ` +
        `window=${session.windowId} overlap=${markers.overlapped} ` +
        `invokeA=${result.invokedA} invokeB=${result.invokedB} ` +
        `twoCalls=${result.distinctCalls} meetA=${result.meetA} meetB=${result.meetB} ` +
        `childIds=${result.childIdsObserved} sentinel=${result.exactUnavailableSentinel} ` +
        `stop=${result.stopReason} permissions=${permissionRequests} ` +
        `allowed=${permittedRoles.size} permissionRoute=${result.permissionRoute} ` +
        `unexpectedPermissions=${unexpectedPermissionRequests} ` +
        `userInput=${userInputRequests} ` +
        `unsafe=${result.unsafe} overflow=${eventOverflow}`)
    } catch (error) {
      const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ?
        error.code : typeof error?.message === 'string' &&
          /^[A-Z0-9_]{1,80}$/.test(error.message) ? error.message :
            'SINGLE_HOST_INVOKE_FAILED'
      await vscode.window.showInformationMessage(`SINGLE_HOST_INVOKE ${code}`)
    } finally { session?.close(); subagentProbeBusy = false }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.singleHostBuiltinPolicyProbe', async () => {
    if (subagentProbeBusy) return
    subagentProbeBusy = true
    try {
      const { probeBuiltinHelperPolicy } = require('../../kiro-native-host/native-client.cjs')
      const result = await probeBuiltinHelperPolicy(vscode)
      const compact = checks => checks.map(item =>
        `${item.capability}:${item.scope}=${item.effect}`).join(',')
      await vscode.window.showInformationMessage(
        `BUILTIN_H_POLICY window=${result.windowId} mode=${result.mode} ` +
        `bootstrapAsk=${result.bootstrapAskObserved} ` +
        `bootstrap[${compact(result.bootstrapOutcomes)}] ` +
        `vibe[${compact(result.outcomes)}] sampledDeniesAll=${result.sampledDeniesAll}`)
    } catch (error) {
      const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ?
        error.code : typeof error?.message === 'string' &&
          /^[A-Z0-9_]{1,80}$/.test(error.message) ? error.message :
            'NATIVE_BUILTIN_H_POLICY_PROBE_FAILED'
      await vscode.window.showInformationMessage(`BUILTIN_H_POLICY ${code}`)
    } finally { subagentProbeBusy = false }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.singleHostBuiltinDenySeedProbe', async () => {
    if (subagentProbeBusy) return
    subagentProbeBusy = true
    try {
      const { probeBuiltinHelperDenySeed } = require('../../kiro-native-host/native-client.cjs')
      const result = await probeBuiltinHelperDenySeed(vscode)
      await vscode.window.showInformationMessage(
        `BUILTIN_H_SEED DENY_PASS window=${result.windowId} mode=${result.mode} ` +
        `sessionAllDeny=${result.sessionAllDeny} sampledDeniesAll=${result.sampledDeniesAll} ` +
        `requests=${result.permissionRequests} rejectAlways=${result.seedResponses} ` +
        `samples=${result.capabilities.length}`)
    } catch (error) {
      const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ?
        error.code : typeof error?.message === 'string' &&
          /^[A-Z0-9_]{1,80}$/.test(error.message) ? error.message :
            'NATIVE_H_SEED_FAILED'
      await vscode.window.showInformationMessage(`BUILTIN_H_SEED ${code}`)
    } finally { subagentProbeBusy = false }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.singleHostMemoryMetadata', async () => {
    const config = vscode.workspace.getConfiguration('kiroAgent')
    const value = config.inspect('memoryEnabled')
    const classify = input => input === true ? 'TRUE' : input === false ? 'FALSE' :
      input === undefined ? 'UNSET' : 'OTHER'
    await vscode.window.showInformationMessage(
      `BUILTIN_H_MEMORY effective=${classify(config.get('memoryEnabled'))} ` +
      `workspace=${classify(value?.workspaceValue)} global=${classify(value?.globalValue)} ` +
      `default=${classify(value?.defaultValue)} channel=${vscode.version}`)
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.singleHostProtectedToolMetadata', async () => {
    const { inspectProtectedBuiltinFlags } =
      require('../../kiro-native-host/native-protected-tools.cjs')
    const value = await inspectProtectedBuiltinFlags(vscode)
    await vscode.window.showInformationMessage(
      `BUILTIN_H_TOOLS artifacts=${value.artifacts} tasks=${value.tasks} ` +
      `screenshot=${value.screenshot} remoteAll=${value.remoteAll} ` +
      `quality=${value.quality} hostPid=${process.pid} safe=${value.safe}`)
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.singleHostProtectedPairProbe', async () => {
    if (subagentProbeBusy) return
    subagentProbeBusy = true
    try {
      const { probeProtectedBuiltinPair } = require('../../kiro-native-host/native-client.cjs')
      const result = await probeProtectedBuiltinPair(vscode)
      await vscode.window.showInformationMessage(
        `BUILTIN_H_PAIR PREFLIGHT_PASS window=${result.windowId} sessions=${result.sessions} ` +
        `memoryDefaults=${result.memoryDefaultAttested} denyAll=${result.sessionAllDeny} ` +
        `catalogSafe=${result.catalogSafe} shellIntrospectionTags=${result.shellIntrospectionTags} ` +
        `analystHaiku=${result.analystHaiku} ` +
        `modelTurns=${result.modelTurns}`)
    } catch (error) {
      const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ?
        error.code : typeof error?.message === 'string' &&
          /^[A-Z0-9_]{1,80}$/.test(error.message) ? error.message :
            'NATIVE_H_PAIR_PREFLIGHT_FAILED'
      await vscode.window.showInformationMessage(`BUILTIN_H_PAIR ${code}`)
    } finally { subagentProbeBusy = false }
  }))
  const configuredConnection = vscode.workspace.getConfiguration('vibeHelper').get('connectionFile', '') ||
    process.env.VIBE_HELPER_CONNECTION_FILE || ''
  let nativeWorker = null
  const { registerNativeCleanEvaluationCommand } =
    require('./native-clean-evaluation-command.cjs')
  const { currentApprovedBuiltinHelperScope, openProtectedBuiltinH,
    openProtectedHLogBarrier } =
    require('../../kiro-native-host/native-client.cjs')
  const { assertNativeCoreIdle, assertNativeHelperAblationIdle } =
    require('./native-helper-ablation-idle.cjs')
  context.subscriptions.push(registerNativeCleanEvaluationCommand(vscode, {
    isBusy: () => subagentProbeBusy,
    setBusy: value => { subagentProbeBusy = value },
    getNativeWorker: () => nativeWorker,
    packagedRuntime,
    connectLocalCore,
    configuredConnection,
    currentApprovedBuiltinHelperScope,
    openProtectedBuiltinH,
    openProtectedHLogBarrier,
    assertNativeCoreIdle,
    assertNativeHelperAblationIdle,
    uiMetadata,
    redactText: redactSensitiveText,
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.nativeAnalystSonnetVariant', async () => {
    if (subagentProbeBusy) return
    subagentProbeBusy = true
    try {
      if (!nativeWorker?.armAnalystSonnetVariant)
        throw new Error('NATIVE_ANALYST_VARIANT_WORKER_UNAVAILABLE')
      const { currentApprovedProductWorkspace } =
        require('../../kiro-native-host/native-client.cjs')
      const scope = currentApprovedProductWorkspace(vscode)
      const client = await connectLocalCore(configuredConnection)
      const snapshot = await client.restoreProject(scope.projectId)
      if (!snapshot.currentTask?.id)
        throw new Error('NATIVE_ANALYST_VARIANT_TASK_REQUIRED')
      const { assertNativeCoreIdle } = require('./native-helper-ablation-idle.cjs')
      await assertNativeCoreIdle(client, scope.projectId, snapshot.currentTask.id,
        uiMetadata)
      const selected = await nativeWorker.armAnalystSonnetVariant(scope)
      await vscode.window.showInformationMessage(
        `NATIVE_ANALYST_VARIANT ARMED project=${selected.projectId} ` +
        `model=${selected.modelId} workerLifetimeOnly=true`)
    } catch (error) {
      const candidate = error?.code ?? error?.message
      const code = typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) ?
        candidate : 'NATIVE_ANALYST_VARIANT_FAILED'
      await vscode.window.showInformationMessage(`NATIVE_ANALYST_VARIANT ${code}`)
    } finally { subagentProbeBusy = false }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.nativeHelperAblationArm', async () => {
    if (subagentProbeBusy) return
    subagentProbeBusy = true
    try {
      if (!nativeWorker?.armCompletedHelperCapture)
        throw new Error('NATIVE_HELPER_CAPTURE_WORKER_UNAVAILABLE')
      const { plannedApprovedBuiltinHelperScope } =
        require('../../kiro-native-host/native-client.cjs')
      const scope = plannedApprovedBuiltinHelperScope(vscode)
      const client = await connectLocalCore(configuredConnection)
      const snapshot = await client.restoreProject(scope.projectId)
      if (!snapshot.currentTask?.id)
        throw new Error('NATIVE_HELPER_CAPTURE_TASK_REQUIRED')
      const { assertNativeCoreIdle } = require('./native-helper-ablation-idle.cjs')
      await assertNativeCoreIdle(client, scope.projectId, snapshot.currentTask.id,
        uiMetadata)
      const { expiresAt } = await nativeWorker.armCompletedHelperCapture({
        ...scope, taskId: snapshot.currentTask.id })
      await vscode.window.showInformationMessage(
        `NATIVE_HELPER_ABLATION ARMED nextCompletedHelper=1 expiresAt=${expiresAt} ` +
        'thenRun=vibeHelper.nativeHelperAblationRun')
    } catch (error) {
      const candidate = error?.code ?? error?.message
      const code = typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) ?
        candidate : 'NATIVE_HELPER_CAPTURE_FAILED'
      await vscode.window.showInformationMessage(`NATIVE_HELPER_ABLATION ${code}`)
    } finally { subagentProbeBusy = false }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.nativeHelperAblationRun', async () => {
    if (subagentProbeBusy) return
    subagentProbeBusy = true
    let lease
    let artifactPath
    try {
      if (!nativeWorker?.acquireIsolatedEvaluation)
        throw new Error('NATIVE_HELPER_ABLATION_WORKER_UNAVAILABLE')
      const { currentApprovedBuiltinHelperScope, openProtectedBuiltinH,
        openProtectedHLogBarrier } = require('../../kiro-native-host/native-client.cjs')
      const { assertNativeCoreIdle, assertNativeHelperAblationIdle } =
        require('./native-helper-ablation-idle.cjs')
      const { runNativeHelperAblation } = require('./native-helper-ablation.cjs')
      const { renderHelperAblationHtml } = require('./native-helper-ablation-view.cjs')
      const scope = currentApprovedBuiltinHelperScope(vscode)
      const client = await connectLocalCore(configuredConnection)
      const snapshot = await client.restoreProject(scope.projectId)
      if (!snapshot.currentTask?.id)
        throw new Error('HELPER_ABLATION_TASK_REQUIRED')
      // Do not pause the worker while the UI A Analyst job is still pending;
      // otherwise that job could never drain and a valid capture is consumed.
      await assertNativeCoreIdle(client, scope.projectId, snapshot.currentTask.id,
        uiMetadata)
      lease = await nativeWorker.acquireIsolatedEvaluation({
        requireHelperCaptureProjectId: scope.projectId })
      const capture = lease.takeCompletedHelperCapture(scope.projectId)
      const assertIdle = () => assertNativeHelperAblationIdle(client, lease,
        capture.projectId, capture.taskId, uiMetadata)
      await assertIdle()
      const artifactDirectory = await mkdtemp(join(tmpdir(), 'vibe-native-helper-ablation-'))
      artifactPath = join(artifactDirectory, 'metadata.json')
      await writeFile(artifactPath, JSON.stringify({ status: 'PREPARED' }),
        { flag: 'wx', mode: 0o600 })
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Vibe Helper: native Helper context ablation', cancellable: true,
      }, async (progress, token) => {
        const cancelled = new AbortController()
        const cancel = () => cancelled.abort()
        const cancellationListener = token.onCancellationRequested(cancel)
        lease.signal.addEventListener('abort', cancel, { once: true })
        if (token.isCancellationRequested || lease.signal.aborted) cancel()
        try {
          return await runNativeHelperAblation({ capture, scope, assertIdle,
            openSession: async (ownedScope, modelId) => openProtectedBuiltinH(vscode,
              { ...ownedScope, redactText: redactSensitiveText,
                analystModelId: modelId }),
            openBarrier: ownedScope => openProtectedHLogBarrier(vscode, ownedScope),
            onCell: cell => progress.report({ message:
              `${cell.variant} ${cell.status}` }),
            signal: cancelled.signal })
        } finally {
          cancellationListener.dispose()
          lease.signal.removeEventListener('abort', cancel)
        }
      })
      // The full result also contains model answers. Serialize only metadata.
      await writeFile(artifactPath, JSON.stringify(result.metadata, null, 2),
        { mode: 0o600 })
      const panel = vscode.window.createWebviewPanel('vibeHelper.helperAblation',
        'Helper Context Ablation', vscode.ViewColumn.Beside,
        { enableScripts: false, retainContextWhenHidden: false })
      panel.webview.html = renderHelperAblationHtml(result, redactSensitiveText)
      await vscode.window.showInformationMessage(
        `NATIVE_HELPER_ABLATION ${result.metadata.status} ` +
        `turns=${result.metadata.turns} reloadRequired=true artifact=${artifactPath}`)
    } catch (error) {
      const candidate = error?.code ?? error?.message
      const code = typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) ?
        candidate : 'NATIVE_HELPER_ABLATION_FAILED'
      if (artifactPath) await writeFile(artifactPath,
        JSON.stringify({ status: 'FAILED', errorCode: code }), { mode: 0o600 })
        .catch(() => undefined)
      await vscode.window.showInformationMessage(
        `NATIVE_HELPER_ABLATION ${code} reloadRequired=${Boolean(lease)}` +
        `${artifactPath ? ` artifact=${artifactPath}` : ''}`)
    } finally { lease?.release({ resume: false }); subagentProbeBusy = false }
  }))
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.nativeAnalystSemanticEval', async () => {
    if (subagentProbeBusy) return
    if (!nativeWorker?.acquireIsolatedEvaluation) {
      await vscode.window.showInformationMessage('NATIVE_ANALYST_EVAL WORKER_UNAVAILABLE')
      return
    }
    subagentProbeBusy = true
    let lease
    let artifactPath
    try {
      const { currentApprovedBuiltinHelperScope, openProtectedBuiltinH,
        openProtectedHLogBarrier } = require('../../kiro-native-host/native-client.cjs')
      const { runNativeAnalystSemanticEval } =
        require('./native-analyst-semantic-eval.cjs')
      const scope = currentApprovedBuiltinHelperScope(vscode)
      lease = await nativeWorker.acquireIsolatedEvaluation()
      const artifactDirectory = await mkdtemp(join(tmpdir(), 'vibe-native-analyst-eval-'))
      artifactPath = join(artifactDirectory, 'metadata.json')
      // No model output or Episode prose is written to this private artifact.
      await writeFile(artifactPath, JSON.stringify({ status: 'PREPARED' }),
        { flag: 'wx', mode: 0o600 })
      const redactor = redactSensitiveText
      let inspection
      try {
        inspection = await openProtectedBuiltinH(vscode, { ...scope,
          redactText: redactor, inspectAnalystModels: true })
        if (!Array.isArray(inspection.analystModels) ||
            !inspection.analystModels.includes('claude-haiku-4.5') ||
            inspection.modelId !== null || !Number.isInteger(inspection.windowId))
          throw new Error('ANALYST_EVAL_MODEL_CATALOG_UNCONFIRMED')
      } finally { inspection?.close() }
      const models = [
        { family: 'HAIKU', id: 'claude-haiku-4.5', confirmed: true,
          source: 'IDE_CONFIG_OPTION' },
        { family: 'SONNET', id: inspection.analystModels.includes('claude-sonnet-4.5') ?
          'claude-sonnet-4.5' : null,
        confirmed: inspection.analystModels.includes('claude-sonnet-4.5'),
        source: 'IDE_CONFIG_OPTION' },
      ]
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Vibe Helper: native Analyst semantic evaluation', cancellable: true,
      }, async (progress, token) => {
        const cancelled = new AbortController()
        const cancel = () => cancelled.abort()
        const cancellationListener = token.onCancellationRequested(cancel)
        lease.signal.addEventListener('abort', cancel, { once: true })
        if (token.isCancellationRequested || lease.signal.aborted) cancel()
        try {
          return await runNativeAnalystSemanticEval({ scope, models,
            openSession: async (ownedScope, modelId) => {
              const session = await openProtectedBuiltinH(vscode,
                { ...ownedScope, redactText: redactor, analystModelId: modelId })
              if (session.windowId !== inspection.windowId) {
                session.close()
                throw new Error('ANALYST_EVAL_WINDOW_CHANGED')
              }
              return session
            },
            openBarrier: ownedScope => openProtectedHLogBarrier(vscode, ownedScope),
            onCell: cell => progress.report({ message:
              `${cell.caseId} ${cell.promptVersion} ${cell.modelFamily} ${cell.status}` }),
            signal: cancelled.signal })
        } finally {
          cancellationListener.dispose()
          lease.signal.removeEventListener('abort', cancel)
        }
      })
      const artifact = {
        kind: result.kind, status: result.status, maxTurns: result.maxTurns,
        turns: result.turns, cases: result.cases, prompts: result.prompts,
        fixtureSha256: result.fixtureSha256,
        softTimeoutMs: result.softTimeoutMs,
        nativePromptRpcTimeoutMs: result.nativePromptRpcTimeoutMs,
        observedCells: result.observedCells, skippedCells: result.skippedCells,
        coarseExpectationMatches: result.coarseExpectationMatches,
        priorPromptProvenance: 'RECONSTRUCTED_FROM_EXPLICIT_INVERSE_SEMANTIC_PATCH',
        models: result.models.map(model => ({ family: model.family, id: model.id,
          confirmed: model.confirmed, source: model.source })),
        cells: result.cells.map(cell => ({
          caseId: cell.caseId, promptVersion: cell.promptVersion,
          modelFamily: cell.modelFamily, modelId: cell.modelId,
          status: cell.status, elapsedMs: cell.elapsedMs,
          modelElapsedMs: cell.modelElapsedMs,
          softDeadlineExceeded: cell.softDeadlineExceeded,
          errorCode: cell.errorCode,
          jsonForm: cell.jsonForm, schemaValid: cell.schemaValid,
          envelopeValid: cell.envelopeValid,
          sourceReferencesValid: cell.sourceReferencesValid,
          proposalCount: cell.proposalCount,
          noEvidenceReasonPresent: cell.noEvidenceReasonPresent,
          coarseExpectationMatch: cell.coarseExpectationMatch,
          proposals: Array.isArray(cell.proposals) ? cell.proposals.map(proposal => ({
            signal: proposal.signal, strength: proposal.strength,
            maximumSupportedState: proposal.maximumSupportedState,
            promptDependence: proposal.promptDependence,
            sourceReferencesValid: proposal.sourceReferencesValid,
            originalExpressionFromUser: proposal.originalExpressionFromUser,
            evidenceExcerptFromUser: proposal.evidenceExcerptFromUser,
            claimExcerptPresent: proposal.claimExcerptPresent,
          })) : [],
        })),
      }
      await writeFile(artifactPath, JSON.stringify(artifact, null, 2), { mode: 0o600 })
      await vscode.window.showInformationMessage(
        `NATIVE_ANALYST_EVAL ${result.status} turns=${result.turns} ` +
        `observed=${result.observedCells} skipped=${result.skippedCells} ` +
        `coarseMatches=${result.coarseExpectationMatches} ` +
        'reloadRequired=true ' +
        `artifact=${artifactPath}`)
    } catch (error) {
      const candidate = error?.code ?? error?.message
      const code = typeof candidate === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(candidate) ?
        candidate : 'ANALYST_EVAL_FAILED'
      if (artifactPath) await writeFile(artifactPath,
        JSON.stringify({ status: 'FAILED', errorCode: code }), { mode: 0o600 })
        .catch(() => undefined)
      await vscode.window.showInformationMessage(
        `NATIVE_ANALYST_EVAL ${code} reloadRequired=${Boolean(lease)}` +
        `${artifactPath ? ` artifact=${artifactPath}` : ''}`)
    } finally { lease?.release({ resume: false }); subagentProbeBusy = false }
  }))
  const command = vscode.commands.registerCommand('vibeHelper.localPanel', async () => {
    let file = vscode.workspace.getConfiguration('vibeHelper').get('connectionFile', '') ||
      process.env.VIBE_HELPER_CONNECTION_FILE || ''
    if (!file) {
      const selected = await vscode.window.showOpenDialog({ canSelectMany: false, title: 'Select local Core connection.json', filters: { JSON: ['json'] } })
      if (!selected?.[0]) return
      file = selected[0].fsPath
    }
    const connection = createCoreConnectionManager({ connectionFile: file,
      connect: connectLocalCore })
    const client = connection.client
    let health
    try { health = await client.health() }
    catch { vscode.window.showErrorMessage('Local Core connection failed. Start Core and select its current connection.json.'); return }
    if (health.agent === 'KIRO_IDE_BUILTIN_AGENT') {
      let runtime
      try { runtime = await packagedRuntime() }
      catch (error) {
        vscode.window.showErrorMessage(`Native runtime unavailable: ${safeError(error)}`)
        return
      }
      nativeWorker = startNativeWorker(context, file, runtime)
    }
    const panel = vscode.window.createWebviewPanel('vibeHelper.local', 'Vibe Helper · Local', vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] })
    const nonce = randomBytes(16).toString('hex')
    const html = await readFile(join(context.extensionPath, 'media', 'panel.html'), 'utf8')
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'panel.js'))
    panel.webview.html = html.replaceAll('{{nonce}}', nonce).replaceAll('{{script}}', String(script))
    let projectId = context.globalState.get('vibeHelper.selectedProject')
    let disposed = false
    let busy = false
    const streams = new Map()
    const terminalReplays = new Map()
    let restoreSequence = 0
    let recoveryInProgress = false
    let recoveryRestore = Promise.resolve()
    const waitForRecovery = async () => {
      while (true) {
        const selected = recoveryRestore
        await selected
        if (selected === recoveryRestore) return
      }
    }
    const send = message => { if (!disposed) void panel.webview.postMessage(message) }
    const resetProjectStreams = () => {
      const stopped = streams.size + terminalReplays.size
      for (const { controller } of streams.values()) controller.abort()
      streams.clear()
      for (const controller of terminalReplays.values()) controller.abort()
      terminalReplays.clear()
      return stopped
    }
    const unsubscribeConnection = connection.onDidRotate(event => {
      const stoppedStreams = resetProjectStreams()
      // Invalidate every pre-rotation restore before it can publish another
      // fragment. Exactly one queued durable restore owns each new generation,
      // and it deliberately does not attach any active or retained SSE.
      ++restoreSequence
      recoveryInProgress = true
      let scheduled
      scheduled = recoveryRestore.catch(() => undefined).then(async () => {
        if (disposed || connection.generation !== event.generation) return
        const restored = await restore({ generation: event.generation, reattachStreams: false })
        if (!restored || disposed || connection.generation !== event.generation) return
        send({ kind: 'connectionStatus', status: 'RECOVERED_READ_ONLY',
          backendChanged: event.previousBackendInstanceId !== event.backendInstanceId,
          stoppedStreams })
      }).catch(error => send({ kind: 'error', code: safeError(error) })).finally(() => {
        if (recoveryRestore !== scheduled) return
        recoveryInProgress = false
        if (!busy) send({ kind: 'ready' })
      })
      recoveryRestore = scheduled
    })
    const unsubscribeWorkerStatus = nativeWorker?.subscribeStatus(status =>
      send({ kind: 'workerStatus', status }))
    if (nativeWorker?.getStatus()) send({ kind: 'workerStatus', status: nativeWorker.getStatus() })
    const sendUserInputs = () => {
      if (!projectId) return
      send({ kind: 'userInputs', projectId,
        data: nativeWorker?.listUserInputs(projectId) ?? [] })
    }
    const unsubscribeUserInputs = nativeWorker?.subscribeUserInputs(sendUserInputs)
    const restore = async ({ generation = connection.generation, reattachStreams = true } = {}) => {
      if (disposed || generation !== connection.generation) return false
      const sequence = ++restoreSequence
      const selected = projectId
      const current = () => !disposed && sequence === restoreSequence &&
        generation === connection.generation && selected === projectId
      const history = await client.listProjects()
      if (!current()) return false
      send({ kind: 'history', data: history })
      if (selected) {
        const snapshot = await client.restoreProject(selected)
        if (!current()) return false
        send({ kind: 'snapshot', data: snapshot })
        sendUserInputs()
        const failedJobs = await readFailedAnalysisJobs(client, selected)
        if (!current()) return false
        send({ kind: 'analysisJobs', projectId: selected, data: failedJobs.map(job => ({
          id: job.id, episodeId: job.episodeId, errorCode: job.lastFailure?.code ?? null,
        })) })
        let upgradeTraces = []
        try {
          const evidence = await client.execute({ ...uiMetadata(snapshot.project.correlationId),
            kind: 'UI_READ_EVIDENCE_TRACE', projectId: selected })
          if (!current()) return false
          send({ kind: 'evidenceTrace', projectId: selected,
            data: summarizeEvidenceTrace(selected, evidence, redactSensitiveText) })
          upgradeTraces = eligibleFinalUpgradeTraces(snapshot, evidence)
        } catch (error) { if (current()) send({ kind: 'error', code: safeError(error) }) }
        if (!current()) return false
        send({ kind: 'finalUpgradeTraces', projectId: selected, data: upgradeTraces })
        const restoredRuns = await client.listRuns(selected)
        const terminalHelpers = new Set(restoredRuns.filter(run => run.kind === 'HELPER' &&
          !['ACCEPTED', 'RUNNING'].includes(run.status)).slice(-5).map(run => run.id))
        for (const run of restoredRuns) {
          if (!current()) return false
          send({ kind: 'run', data: run })
          // A workspace switch or a closed webview can outlive its SSE owner.
          // The backend run keeps going; attach this panel once to any active
          // run restored from History so its terminal result updates the UI.
          // A connection-rotation restore is different: durable state only,
          // with no automatic watch replacement or retained stream replay.
          if (reattachStreams && ['ACCEPTED', 'RUNNING'].includes(run.status))
            void watch(run).catch(error => send({ kind: 'error', code: safeError(error) }))
          else if (reattachStreams && terminalHelpers.has(run.id)) replayTerminalHelper(run)
        }
      }
      return true
    }
    function replayTerminalHelper(run) {
      if (disposed || terminalReplays.has(run.id) || streams.has(run.id)) return
      const controller = new AbortController()
      terminalReplays.set(run.id, controller)
      void client.watchRun(run.id, event => {
        if (event.projectId === projectId) send({ kind: 'event', data: event })
      }, {
        signal: controller.signal,
      }).catch(error => {
        if (!controller.signal.aborted) {
          const code = safeError(error)
          send({ kind: 'error', code })
        }
      }).finally(() => {
        if (terminalReplays.get(run.id) === controller) terminalReplays.delete(run.id)
      })
    }
    async function watch(run, wait = false) {
      if (disposed) return
      const existing = streams.get(run.id)
      if (existing) return wait ? existing.work : undefined
      send({ kind: 'run', data: run })
      const controller = new AbortController()
      let previewRestored = false
      const work = client.watchRun(run.id, event => {
        if (event.projectId === projectId) send({ kind: 'event', data: event })
      }, {
        signal: controller.signal, onRun: value => {
          if (value.projectId !== projectId) return
          send({ kind: 'run', data: value })
          // PREVIEW is durable before the same run begins background enrichment.
          if (!previewRestored && run.projectId === projectId && value.kind === 'DISCOVERY' &&
              ['ENRICH_FIRST', 'ENRICH_SECOND'].includes(value.phase) && value.status === 'RUNNING') {
            previewRestored = true
            void restore().catch(error => send({ kind: 'error', code: safeError(error) }))
          }
        },
      }).then(async result => {
        await restore()
        if (result.status !== 'SUCCEEDED') throw new Error(result.errorCode ?? result.status)
        return result
      }).finally(() => {
        if (streams.get(run.id)?.controller === controller) streams.delete(run.id)
      })
      streams.set(run.id, { controller, work })
      if (wait) return work
      void work.catch(error => {
        if (!controller.signal.aborted) {
          const code = safeError(error)
          send({ kind: 'error', code })
        }
      })
    }
    async function pauseDiscovery() {
      if (!projectId) return
      for (const run of await client.listRuns(projectId)) if (run.kind === 'DISCOVERY' && ['ACCEPTED', 'RUNNING'].includes(run.status)) await client.cancelRun(run.id)
    }
    async function runDiscovery(phase, message, candidateIds = []) {
      const snapshot = await client.restoreProject(projectId)
      if (!snapshot.discoverySession) throw new Error('DISCOVERY_SESSION_REQUIRED')
      return client.startRun({ kind: 'DISCOVERY', projectId, idempotencyKey: entityId('idem'), phase,
        discoverySessionId: snapshot.discoverySession.id, expectedSessionRevision: snapshot.discoverySession.revision,
        candidateIds, ...(message ? { message, expectedSpecRevision: snapshot.learningSpec?.revision ?? 0 } : {}) })
    }
    panel.webview.onDidReceiveMessage(async message => {
      if (!message || typeof message !== 'object' || typeof message.action !== 'string') return
      // Only explicit screen actions. No raw MCP, file, shell or authenticated HTTP bridge.
      if (recoveryInProgress) {
        if (message.action === 'refresh') await waitForRecovery()
        else send({ kind: 'error', code: 'CORE_CONNECTION_RECOVERY_IN_PROGRESS_RETRY_ACTION' })
        return
      }
      if (busy && !['cancel', 'refresh', 'answerUserInput'].includes(message.action)) return
      const ownsBusy = !busy
      if (ownsBusy) busy = true
      try {
        switch (message.action) {
          case 'refresh': await restore(); break
          case 'history':
            if (typeof message.projectId !== 'string') throw new Error('PROJECT_REQUIRED')
            await client.restoreProject(message.projectId)
            if (message.projectId !== projectId) resetProjectStreams()
            projectId = message.projectId;
            await context.globalState.update('vibeHelper.selectedProject', projectId); await restore(); break
          case 'start': {
            const started = await client.startDiscovery({ learningGoal: message.goal, ...(message.need ? { personalNeed: message.need } : {}) })
            if (started.projectId !== projectId) resetProjectStreams()
            projectId = started.projectId;
            await context.globalState.update('vibeHelper.selectedProject', projectId);
            await restore(); await watch(started.run); break
          }
          case 'retryDiscovery': {
            if (!['PREVIEW', 'ENRICH_ALL', 'ROUND'].includes(message.phase)) throw new Error('INVALID_PHASE')
            if (message.phase === 'ROUND') {
              const [snapshot, runs] = await Promise.all([client.restoreProject(projectId), client.listRuns(projectId)])
              const latestRound = runs.filter(run => run.kind === 'DISCOVERY' && run.phase === 'ROUND').at(-1)
              const applied = new Set(snapshot.discoveryContext?.rounds.flatMap(round => round.appliedFeedbackIds) ?? [])
              const pending = snapshot.discoveryContext?.feedback.filter(feedback => !applied.has(feedback.id)) ?? []
              const active = runs.some(run => run.kind === 'DISCOVERY' && ['ACCEPTED', 'RUNNING'].includes(run.status))
              if (snapshot.discoverySession?.status !== 'ACTIVE' || pending.length === 0 || active ||
                  (latestRound && latestRound.status !== 'FAILED'))
                throw new Error('FAILED_ROUND_WITH_PENDING_FEEDBACK_REQUIRED')
            }
            await pauseDiscovery(); await watch(await runDiscovery(message.phase)); break
          }
          case 'feedback': {
            await pauseDiscovery()
            const ids = Array.isArray(message.candidateIds) ? message.candidateIds.map(value => candidateIdSchema.parse(value)) : []
            let snapshot = await client.restoreProject(projectId)
            const context = snapshot.discoveryContext
            if (!context) throw new Error('DISCOVERY_CONTEXT_REQUIRED')
            if (context.rounds.length === 0) {
              if (message.intent === 'MORE') await watch(await runDiscovery('ENRICH_ALL'), true)
              const enriched = new Set(context.candidateEnrichments.map(e => e.candidate.id))
              const missing = ids.filter(id => !enriched.has(id))
              if (missing.length) await watch(await runDiscovery('ENRICH_SELECTED', undefined, missing), true)
              snapshot = await client.restoreProject(projectId)
            }
            const session = snapshot.discoverySession
            const current = snapshot.discoveryContext
            const latest = current.rounds.at(-1)
            const targets = ids.map(candidateId => ({ candidateId, revision: latest?.candidates.find(c => c.candidateId === candidateId)?.revision ?? 1 }))
            await client.execute({ ...uiMetadata(session.correlationId), kind: 'UI_RECORD_DISCOVERY_FEEDBACK', idempotencyKey: entityId('idem'), expectedSessionRevision: session.revision,
              feedback: { schemaVersion: 1, id: entityId('feedback'), discoverySessionId: session.id, roundId: latest?.id ?? current.previewRound.finalRoundId,
                correlationId: session.correlationId, intent: message.intent, targets, ...(message.text ? { message: message.text } : {}),
                createdAt: new Date().toISOString(), source: { kind: 'USER' }, redactionStatus: 'NOT_REQUIRED' } })
            await restore()
            await watch(await runDiscovery(message.intent === 'SELECT' ? 'SPEC' : message.intent === 'MERGE' ? 'MERGE' : 'ROUND'))
            break
          }
          case 'refineSpec':
            await pauseDiscovery(); await watch(await runDiscovery('SPEC', message.text)); break
          case 'restartDiscovery': {
            await pauseDiscovery(); const s = await client.restoreProject(projectId)
            const input = discoveryInputSchema.parse(restartDiscoveryInput(s, message.goal, message.need))
            await client.execute({ ...uiMetadata(s.discoverySession.correlationId), kind: 'UI_RETURN_TO_DISCOVERY', projectId,
              discoverySessionId: s.discoverySession.id, expectedSessionRevision: s.discoverySession.revision,
              expectedSpecRevision: s.learningSpec.revision, input, idempotencyKey: entityId('idem') })
            await restore()
            await watch(await runDiscovery('PREVIEW'))
            break
          }
          case 'confirm': {
            await pauseDiscovery(); let s = await client.restoreProject(projectId)
            await client.execute({ ...uiMetadata(s.discoverySession.correlationId), kind: 'UI_CONFIRM_LEARNING_SPEC', projectId,
              learningSpecId: s.learningSpec.id, expectedSpecRevision: s.learningSpec.revision, idempotencyKey: entityId('idem') })
            s = await client.restoreProject(projectId)
            await client.execute({ ...uiMetadata(s.discoverySession.correlationId), kind: 'UI_PREPARE_BUILDER_TASK', projectId,
              learningSpecId: s.learningSpec.id, expectedSpecRevision: s.learningSpec.revision, idempotencyKey: entityId('idem') })
            await restore(); break
          }
          case 'agent': {
            const s = await client.restoreProject(projectId)
            const request = localRunRequestSchema.parse({ kind: message.role, projectId, taskId: s.currentTask?.id,
              ...(message.role === 'BUILDER' ? { expectedTaskRevision: s.currentTask?.revision } : message.decisionId ? { decisionId: message.decisionId } : {}),
              idempotencyKey: entityId('idem'), message: message.text })
            await watch(await client.startRun(request)); break
          }
          case 'decision': {
            const s = await client.restoreProject(projectId)
            const d = s.pendingDecisions.find(d => d.id === message.decisionId)
            if (!d) throw new Error('DECISION_NOT_PENDING')
            const custom = message.selectionKind === 'CUSTOM'
            if (!custom && (message.selectionKind !== 'OPTION' ||
                !d.options.some(option => option.id === message.optionId)))
              throw new Error('DECISION_OPTION_INVALID')
            const customProposal = typeof message.customProposal === 'string' ? message.customProposal.trim() : ''
            if (custom && (!customProposal || customProposal.length > 4_000 || message.optionId !== undefined))
              throw new Error('DECISION_CUSTOM_INVALID')
            await client.execute({ ...uiMetadata(d.correlationId), kind: 'UI_RESOLVE_DECISION', idempotencyKey: entityId('idem'),
              resolution: { schemaVersion: 1, id: entityId('decision_resolution'), projectId, taskId: d.taskId, decisionId: d.id,
                correlationId: d.correlationId, expectedContextVersion: s.liveContext.contextVersion,
                selectionKind: custom ? 'CUSTOM' : 'OPTION',
                ...(custom ? { customProposal } : { selectedOptionId: message.optionId }),
                helperUsed: Boolean(message.helperUsed),
                ...(message.rationale ? { rationale: message.rationale } : {}), resolvedAt: new Date().toISOString(), source: { kind: 'USER' }, redactionStatus: 'NOT_REQUIRED' } })
            await restore(); break
          }
          case 'prepareFinalUpgrade': {
            if (!projectId || typeof message.personalizationTraceId !== 'string')
              throw new Error('FINAL_UPGRADE_TRACE_REQUIRED')
            const userGoal = typeof message.userGoal === 'string' ? message.userGoal.trim() : ''
            if (!userGoal || userGoal.length > 4_000) throw new Error('FINAL_UPGRADE_GOAL_REQUIRED')
            const s = await client.restoreProject(projectId)
            const evidence = await client.execute({ ...uiMetadata(s.project.correlationId),
              kind: 'UI_READ_EVIDENCE_TRACE', projectId })
            const eligible = eligibleFinalUpgradeTraces(s, evidence)
            if (!eligible.some(trace => trace.id === message.personalizationTraceId))
              throw new Error('FINAL_UPGRADE_TRACE_STALE')
            await client.execute({ ...uiMetadata(s.project.correlationId),
              kind: 'UI_PREPARE_FINAL_UPGRADE_TASK', idempotencyKey: entityId('idem'),
              projectId, sourceTaskId: s.currentTask.id,
              expectedSourceTaskRevision: s.currentTask.revision,
              personalizationTraceId: message.personalizationTraceId, userGoal })
            await restore(); break
          }
          case 'retryAnalysis': {
            if (!projectId || typeof message.analysisJobId !== 'string') throw new Error('FAILED_ANALYSIS_JOB_REQUIRED')
            await retryFailedAnalysis(client, projectId, message.analysisJobId)
            await restore(); break
          }
          case 'answerUserInput': {
            if (!projectId || !nativeWorker ||
              typeof message.nativeJobId !== 'string' ||
              typeof message.requestId !== 'string')
              throw new Error('NATIVE_USER_INPUT_STALE')
            const s = await client.restoreProject(projectId)
            const pending = nativeWorker.listUserInputs(projectId).find(item =>
              item.nativeJobId === message.nativeJobId &&
              item.requestId === message.requestId)
            if (!pending ||
              (pending.role === 'DISCOVERY'
                ? pending.discoverySessionId !== s.discoverySession?.id
                : pending.taskId !== s.currentTask?.id))
              throw new Error('NATIVE_USER_INPUT_STALE')
            await nativeWorker.submitUserInput({ projectId,
              nativeJobId: message.nativeJobId, requestId: message.requestId,
              action: message.responseAction,
              ...(message.optionIndex === undefined ? {} : { optionIndex: message.optionIndex }),
              ...(message.subOptionIndices === undefined ? {} :
                { subOptionIndices: message.subOptionIndices }),
              ...(message.answer === undefined ? {} : { answer: message.answer }),
            })
            sendUserInputs(); break
          }
          case 'cancel': await client.cancelRun(message.runId); await restore(); break
          case 'openWorkspace': {
            const s = await client.restoreProject(projectId)
            if (!s.currentTask) throw new Error('TASK_REQUIRED')
            const runs = await client.listRuns(projectId)
            if (runs.some(run => ['ACCEPTED', 'RUNNING'].includes(run.status)))
              throw new Error('WORKSPACE_SWITCH_REQUIRES_IDLE')
            const binding = await client.execute({ ...uiMetadata(s.currentTask.correlationId), kind: 'UI_PREPARE_BUILDER_SESSION', purpose: 'WORKSPACE_VIEW', projectId, taskId: s.currentTask.id })
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(binding.workspaceDirectory), { forceNewWindow: false }); break
          }
          case 'launch': {
            const s = await client.restoreProject(projectId)
            const result = await client.execute({ ...uiMetadata(s.project.correlationId), kind: 'UI_LAUNCH_RESULT', projectId, idempotencyKey: entityId('idem') })
            if (result.status !== 'RUNNING' || !/^http:\/\/127\.0\.0\.1:\d+\//.test(result.url))
              throw new Error('RESULT_NOT_RUNNING')
            let opened = false
            try { opened = await vscode.env.openExternal(vscode.Uri.parse(result.url)) }
            catch { /* Keep the verified loopback URL visible for a manual open. */ }
            send({ kind: 'resultLaunch', projectId, url: result.url, opened: opened === true })
            break
          }
          default: throw new Error('UNKNOWN_ACTION')
        }
      } catch (error) {
        const code = safeError(error)
        send({ kind: 'error', code })
        if (code === 'CORE_CONNECTION_ROTATED_ACTION_NOT_REPLAYED') await waitForRecovery()
      }
      finally { if (ownsBusy) { await waitForRecovery(); busy = false; send({ kind: 'ready' }) } }
    }, undefined, context.subscriptions)
    panel.onDidDispose(() => { disposed = true; unsubscribeUserInputs?.(); unsubscribeWorkerStatus?.();
      unsubscribeConnection()
      for (const { controller } of streams.values()) controller.abort()
      for (const controller of terminalReplays.values()) controller.abort() })
    // UI-only disposal does not cancel a backend run. History remains the recovery source.
    return { panelOpened: true }
  })
  context.subscriptions.push(command)
  if (configuredConnection) {
    void connectLocalCore(configuredConnection).then(client => client.health()).then(health => {
      if (health.agent === 'KIRO_IDE_BUILTIN_AGENT') return packagedRuntime().then(runtime => {
        nativeWorker = startNativeWorker(context, configuredConnection, runtime)
        return vscode.commands.executeCommand('vibeHelper.localPanel')
      })
    }).catch(() => undefined)
  }
}
function safeError(error) { return typeof error?.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(error.code) ? error.code : /^[A-Z0-9_]{1,100}$/.test(error?.message ?? '') ? error.message : 'ACTION_FAILED_RESTORE_PROJECT' }
module.exports = { activate }
