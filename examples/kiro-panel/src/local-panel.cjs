const vscode = require('vscode')
const { randomBytes } = require('node:crypto')
const { readFile } = require('node:fs/promises')
const { join } = require('node:path')
const { connectLocalCore } = require('@vibe-helper/frontend-client/node')
const { redactSensitiveText } = require('@vibe-helper/application/redaction')
const { entityId, uiMetadata, localRunRequestSchema, candidateIdSchema, discoveryInputSchema } = require('@vibe-helper/frontend-client')
const { readFailedAnalysisJobs, retryFailedAnalysis } = require('./analysis-retry.cjs')
const { eligibleFinalUpgradeTraces } = require('./final-upgrade.cjs')
const { summarizeEvidenceTrace } = require('./evidence-view.cjs')
const { restartDiscoveryInput } = require('./discovery-navigation.cjs')
const { createCoreConnectionManager } = require('./core-connection.cjs')

function registerLocalPanel(context, options) {
  let existingPanel, opening
  const command = vscode.commands.registerCommand('vibeHelper.localPanel', async () => {
    if (options.singlePanel && existingPanel) { existingPanel.reveal(); return { panelOpened: true } }
    if (options.singlePanel && opening) return opening
    const pending = openPanel()
    if (options.singlePanel) opening = pending
    try { return await pending } finally { if (opening === pending) opening = null }
  })
  async function openPanel() {
    const ready = await options.prepare()
    if (!ready) return
    const { connectionFile: file, worker: nativeWorker } = ready
    const connection = createCoreConnectionManager({ connectionFile: file, connect: connectLocalCore })
    const client = connection.client
    await client.health()
    const panel = vscode.window.createWebviewPanel('vibeHelper.local', 'Vibe Helper · Local', vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] })
    existingPanel = panel
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
    const unsubscribeLifecycle = options.subscribeStatus?.(data => {
      send({ kind: 'lifecycleStatus', data })
      // A relaunched Core is now reachable. Trigger the SDK's normal rotation
      // path so its durable restore can finish even if the old SSE failed earlier.
      if (data.phase === 'CORE_CONNECTED' && data.restoreRequired)
        void client.health().catch(error => send({ kind: 'error', code: safeError(error) }))
    })
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
        if (options.getStatus) send({ kind: 'lifecycleStatus', data: options.getStatus() })
        if (['start', 'restartDiscovery', 'retryDiscovery', 'feedback', 'refineSpec', 'agent', 'retryAnalysis'].includes(message.action))
          options.assertAgentReady?.()
        switch (message.action) {
          case 'retryCore': await vscode.commands.executeCommand('vibeHelper.retryCore'); break
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
      if (existingPanel === panel) existingPanel = null
      unsubscribeLifecycle?.()
      unsubscribeConnection()
      for (const { controller } of streams.values()) controller.abort()
      for (const controller of terminalReplays.values()) controller.abort() })
    // UI-only disposal does not cancel a backend run. History remains the recovery source.
    return { panelOpened: true }
  }
  context.subscriptions.push(command)
}
function safeError(error) { return typeof error?.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(error.code) ? error.code : /^[A-Z0-9_]{1,100}$/.test(error?.message ?? '') ? error.message : 'ACTION_FAILED_RESTORE_PROJECT' }
module.exports = { registerLocalPanel }
