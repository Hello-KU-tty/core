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
  require('./local-panel.cjs').registerLocalPanel(context, {
    prepare: async () => {
      let file = configuredConnection
      if (!file) {
        const selected = await vscode.window.showOpenDialog({ canSelectMany: false,
          title: 'Select local Core connection.json', filters: { JSON: ['json'] } })
        if (!selected?.[0]) return null
        file = selected[0].fsPath
      }
      const client = await connectLocalCore(file)
      const health = await client.health()
      if (health.agent === 'KIRO_IDE_BUILTIN_AGENT')
        nativeWorker = startNativeWorker(context, file, await packagedRuntime())
      return { connectionFile: file, worker: nativeWorker }
    },
  })
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
