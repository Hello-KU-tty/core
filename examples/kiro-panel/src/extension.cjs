const vscode = require('vscode')
const { randomBytes } = require('node:crypto')
const { readFile } = require('node:fs/promises')
const { join } = require('node:path')
const { connectLocalCore } = require('@vibe-helper/frontend-client/node')
const { entityId, uiMetadata, localRunRequestSchema, candidateIdSchema } = require('@vibe-helper/frontend-client')

function activate(context) {
  const command = vscode.commands.registerCommand('vibeHelper.localPanel', async () => {
    let file = vscode.workspace.getConfiguration('vibeHelper').get('connectionFile', '')
    if (!file) {
      const selected = await vscode.window.showOpenDialog({ canSelectMany: false, title: 'Select local Core connection.json', filters: { JSON: ['json'] } })
      if (!selected?.[0]) return
      file = selected[0].fsPath
    }
    let client
    try { client = await connectLocalCore(file) }
    catch { vscode.window.showErrorMessage('Local Core connection failed. Start Core and select its current connection.json.'); return }
    const panel = vscode.window.createWebviewPanel('vibeHelper.local', 'Vibe Helper · Local', vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] })
    const nonce = randomBytes(16).toString('hex')
    const html = await readFile(join(context.extensionPath, 'media', 'panel.html'), 'utf8')
    const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'panel.js'))
    panel.webview.html = html.replaceAll('{{nonce}}', nonce).replaceAll('{{script}}', String(script))
    let projectId
    let disposed = false
    let busy = false
    const streams = new Map()
    const send = message => { if (!disposed) void panel.webview.postMessage(message) }
    const restore = async () => {
      const selected = projectId
      send({ kind: 'history', data: await client.listProjects() })
      if (selected) {
        const snapshot = await client.restoreProject(selected)
        if (selected !== projectId) return
        send({ kind: 'snapshot', data: snapshot })
        for (const run of await client.listRuns(selected)) send({ kind: 'run', data: run })
      }
    }
    async function watch(run, wait = false) {
      send({ kind: 'run', data: run })
      const controller = new AbortController(); streams.set(run.id, controller)
      const work = client.watchRun(run.id, event => send({ kind: 'event', data: event }), {
        signal: controller.signal, onRun: value => send({ kind: 'run', data: value }),
      }).then(async result => {
        await restore()
        if (result.status !== 'SUCCEEDED') throw new Error(result.errorCode ?? result.status)
        return result
      }).finally(() => streams.delete(run.id))
      if (wait) return work
      void work.catch(error => send({ kind: 'error', code: safeError(error) }))
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
      if (busy && !['cancel', 'refresh'].includes(message.action)) return
      const ownsBusy = !busy
      if (ownsBusy) busy = true
      try {
        switch (message.action) {
          case 'refresh': await restore(); break
          case 'history':
            if (typeof message.projectId !== 'string') throw new Error('PROJECT_REQUIRED')
            await client.restoreProject(message.projectId); projectId = message.projectId; await restore(); break
          case 'start': {
            const started = await client.startDiscovery({ learningGoal: message.goal, ...(message.need ? { personalNeed: message.need } : {}) })
            projectId = started.projectId; await restore(); await watch(started.run); break
          }
          case 'retryDiscovery':
            await pauseDiscovery(); await watch(await runDiscovery(message.phase)); break
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
          case 'return': {
            await pauseDiscovery(); const s = await client.restoreProject(projectId)
            await client.execute({ ...uiMetadata(s.discoverySession.correlationId), kind: 'UI_RETURN_TO_DISCOVERY', projectId,
              discoverySessionId: s.discoverySession.id, expectedSessionRevision: s.discoverySession.revision,
              expectedSpecRevision: s.learningSpec?.revision ?? 0, idempotencyKey: entityId('idem') });
            await restore(); break
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
            await client.execute({ ...uiMetadata(d.correlationId), kind: 'UI_RESOLVE_DECISION', idempotencyKey: entityId('idem'),
              resolution: { schemaVersion: 1, id: entityId('decision_resolution'), projectId, taskId: d.taskId, decisionId: d.id,
                correlationId: d.correlationId, expectedContextVersion: s.liveContext.contextVersion,
                selectionKind: 'OPTION', selectedOptionId: message.optionId, helperUsed: Boolean(message.helperUsed),
                ...(message.rationale ? { rationale: message.rationale } : {}), resolvedAt: new Date().toISOString(), source: { kind: 'USER' }, redactionStatus: 'NOT_REQUIRED' } })
            await restore(); break
          }
          case 'cancel': await client.cancelRun(message.runId); await restore(); break
          case 'openWorkspace': {
            const s = await client.restoreProject(projectId)
            const binding = await client.execute({ ...uiMetadata(s.currentTask.correlationId), kind: 'UI_PREPARE_BUILDER_SESSION', purpose: 'WORKSPACE_VIEW', projectId, taskId: s.currentTask.id })
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(binding.workspaceDirectory), { forceNewWindow: true }); break
          }
          case 'launch': {
            const s = await client.restoreProject(projectId)
            const result = await client.execute({ ...uiMetadata(s.project.correlationId), kind: 'UI_LAUNCH_RESULT', projectId, idempotencyKey: entityId('idem') })
            if (result.status === 'RUNNING' && /^http:\/\/127\.0\.0\.1:\d+\//.test(result.url)) await vscode.env.openExternal(vscode.Uri.parse(result.url))
            else throw new Error('RESULT_NOT_RUNNING')
            break
          }
          default: throw new Error('UNKNOWN_ACTION')
        }
      } catch (error) { send({ kind: 'error', code: safeError(error) }) }
      finally { if (ownsBusy) { busy = false; send({ kind: 'ready' }) } }
    }, undefined, context.subscriptions)
    panel.onDidDispose(() => { disposed = true; for (const controller of streams.values()) controller.abort() })
    // UI-only disposal does not cancel a backend run. History remains the recovery source.
    return { panelOpened: true }
  })
  context.subscriptions.push(command)
}
function safeError(error) { return typeof error?.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(error.code) ? error.code : /^[A-Z0-9_]{1,100}$/.test(error?.message ?? '') ? error.message : 'ACTION_FAILED_RESTORE_PROJECT' }
module.exports = { activate }
