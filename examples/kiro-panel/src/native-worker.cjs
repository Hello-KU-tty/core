const vscode = require('vscode')
const { appendFile, readFile, realpath, writeFile } = require('node:fs/promises')
const { basename, dirname, join, relative, isAbsolute } = require('node:path')
const { readLocalConnection } = require('@vibe-helper/frontend-client/node')
const { redactSensitiveText } = require('@vibe-helper/application/redaction')
const { openNativeRole, openProtectedBuiltinH, openProtectedHLogBarrier,
  currentApprovedProductWorkspace } =
  require('../../kiro-native-host/native-client.cjs')
const { chooseNativeBuilderPermission } = require('./native-permission.cjs')
const { createNativeUserInputQueue } = require('./native-user-input.cjs')
const { protectedFailureDisposition, builderFailureDisposition } = require('./protected-lifecycle.cjs')
const { createProtectedHelperCapture } = require('./protected-helper-capture.cjs')
const { HAIKU_ID, SONNET_ID, createNativeAnalystModelVariant } =
  require('./native-analyst-model-variant.cjs')
const { materializePackagedRoleRuntime } = require('./native-runtime.cjs')

let worker
function startNativeWorker(context, connectionFile, runtime) {
  if (!runtime?.bridgeScriptPath || !runtime?.nodePath)
    throw Object.assign(new Error('NATIVE_PACKAGED_RUNTIME_REQUIRED'),
      { code: 'NATIVE_PACKAGED_RUNTIME_REQUIRED' })
  if (worker) {
    if (worker.connectionFile !== connectionFile || worker.runtimeSource !== runtime.source)
      throw Object.assign(new Error('NATIVE_WORKER_SOURCE_SWITCH_REQUIRES_RELOAD'),
        { code: 'NATIVE_WORKER_SOURCE_SWITCH_REQUIRES_RELOAD' })
    return worker
  }
  const controller = new AbortController()
  const active = new Map()
  const sessionTags = new Map()
  const userInput = createNativeUserInputQueue(redactSensitiveText)
  const helperCapture = createProtectedHelperCapture()
  const analystVariant = createNativeAnalystModelVariant()
  const statusSubscribers = new Set()
  let polling = false
  let isolatedEvaluation = false
  let startupRecorded = false
  let connectedRecorded = false
  let unconfirmedSwitchTarget = null
  let protectedPair = null
  let protectedOpening = null
  let protectedOpeningProject = null
  let builderOpening = null
  // Only an H model prompt already admitted before W-open intent may finish
  // first. A claimed H job waiting for Builder is not part of this set;
  // waiting for the whole job would deadlock with builderOpening.
  const activeProtectedPrompts = new Set()
  let lastStatus = ''
  let statusWrite = Promise.resolve()
  const record = (file, status) => {
    if (!file || status === lastStatus) return
    lastStatus = status
    for (const listener of statusSubscribers) {
      try { listener(status) } catch { /* UI observer must not interrupt worker polling. */ }
    }
    const entry = { status, updatedAt: new Date().toISOString() }
    statusWrite = statusWrite.then(async () => {
      await writeFile(join(dirname(file), 'native-worker-status.json'), JSON.stringify(entry),
        { mode: 0o600 })
      await appendFile(join(dirname(file), 'native-worker-status.jsonl'),
        `${JSON.stringify(entry)}\n`, { mode: 0o600 })
    }).catch(() => undefined)
  }
  const post = async (connection, path, value) => {
    const response = await fetch(`${connection.baseUrl}${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${connection.token}`,
        'content-type': 'application/json' }, body: JSON.stringify(value),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error('NATIVE_RELAY_POST_FAILED')
    return response.json()
  }
  const get = async (connection, path) => {
    const response = await fetch(`${connection.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error('NATIVE_RELAY_GET_FAILED')
    return response.json()
  }
  const isWithin = (root, target) => {
    const path = relative(root, target)
    return path === '' || (path !== '..' && !path.startsWith(`..${require('node:path').sep}`) &&
      !isAbsolute(path))
  }
  const gate = code => Object.assign(new Error(code), { code })
  async function waitForBuilderReady(signal) {
    while (builderOpening) {
      const opening = builderOpening
      if (signal.aborted) throw gate('NATIVE_H_CANCELLED')
      let wake
      const interrupted = new Promise(resolve => { wake = resolve })
      const onAbort = () => wake('ABORTED')
      const timer = setTimeout(() => wake('TIMEOUT'), 60000)
      signal.addEventListener('abort', onAbort, { once: true })
      let opened
      try {
        opened = await Promise.race([opening.then(value => value ? 'READY' : 'FAILED'),
          interrupted])
      } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
      }
      if (opened !== 'READY')
        throw gate(opened === 'TIMEOUT' ? 'NATIVE_H_BUILDER_OPEN_TIMEOUT' :
          opened === 'ABORTED' ? 'NATIVE_H_CANCELLED' : 'NATIVE_H_BUILDER_OPEN_FAILED')
    }
  }
  async function waitForActiveProtectedPrompts(signal) {
    const deadline = Date.now() + 120000
    while (activeProtectedPrompts.size > 0) {
      if (signal.aborted) throw gate('NATIVE_CANCELLED')
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw gate('NATIVE_H_PREPARE_WAIT_TIMEOUT')
      let wake
      const interrupted = new Promise(resolve => { wake = resolve })
      const onAbort = () => wake('ABORTED')
      const timer = setTimeout(() => wake('TIMEOUT'), remaining)
      signal.addEventListener('abort', onAbort, { once: true })
      let settled
      try {
        settled = await Promise.race([Promise.all([...activeProtectedPrompts])
          .then(() => 'DONE'), interrupted])
      } finally {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
      }
      if (settled !== 'DONE')
        throw gate(settled === 'ABORTED' ? 'NATIVE_CANCELLED' :
          'NATIVE_H_PREPARE_WAIT_TIMEOUT')
    }
  }
  async function ensureProtectedPair(job, file) {
    const helper = job.helperHostWorkspace || job.workspace
    const workspace = job.projectWorkspace
    if (protectedPair) {
      if (protectedPair.projectId !== job.projectId ||
          protectedPair.workspace !== workspace || protectedPair.helper !== helper)
        throw gate('NATIVE_H_PROJECT_SWITCH_REQUIRES_IDLE_RESTART')
      if (job.role === 'BUILDER') {
        if (!protectedPair.helperSession || !protectedPair.analystSession)
          throw gate('NATIVE_H_PAIR_PARTIAL_REQUIRES_IDLE_RESTART')
        await protectedPair.helperSession.attest()
        await protectedPair.analystSession.attest()
      } else {
        const selected = job.role === 'HELPER' ? protectedPair.helperSession :
          job.role === 'EVIDENCE_ANALYST' ? protectedPair.analystSession : null
        if (!selected) throw gate('NATIVE_H_ROLE_UNAVAILABLE_REQUIRES_IDLE_RESTART')
        await selected.attest()
      }
      return protectedPair
    }
    if (protectedOpening) {
      if (protectedOpeningProject !== job.projectId)
        throw gate('NATIVE_H_PREPARE_PROJECT_CONFLICT')
      return protectedOpening
    }
    if (job.role !== 'BUILDER' && active.has('BUILDER'))
      throw gate('NATIVE_H_NOT_PREPARED_BEFORE_BUILDER')
    const analystModelId = analystVariant.modelFor({ projectId: job.projectId, workspace })
    protectedOpeningProject = job.projectId
    protectedOpening = (async () => {
      let helperSession
      let analystSession
      try {
        helperSession = await openProtectedBuiltinH(vscode, {
          projectId: job.projectId, workspace, helper, redactText: redactSensitiveText })
        analystSession = await openProtectedBuiltinH(vscode, {
          projectId: job.projectId, workspace, helper, redactText: redactSensitiveText,
          ...(analystModelId === HAIKU_ID ? { analystHaiku: true } :
            { analystModelId: SONNET_ID }) })
        if (analystSession.modelId !== analystModelId)
          throw gate('NATIVE_ANALYST_MODEL_ACK_UNCONFIRMED')
        if (helperSession.windowId !== analystSession.windowId)
          throw gate('NATIVE_H_WINDOW_ID_MISMATCH')
        const barrier = await openProtectedHLogBarrier(vscode,
          { projectId: job.projectId, workspace, helper })
        if (barrier.windowId !== helperSession.windowId)
          throw gate('NATIVE_H_BARRIER_WINDOW_ID_MISMATCH')
        await helperSession.attestAfterBarrier(barrier.sessionIdForBarrier)
        await analystSession.attestAfterBarrier(barrier.sessionIdForBarrier)
        protectedPair = { projectId: job.projectId, workspace, helper,
          helperSession, analystSession, windowId: helperSession.windowId }
        record(file, analystModelId === SONNET_ID ?
          'ANALYST_MODEL_SONNET_ACKED' : 'ANALYST_MODEL_HAIKU_ACKED')
        record(file, 'BUILTIN_H_HELPER_ANALYST_PREPARED')
        return protectedPair
      } catch (error) {
        helperSession?.close()
        analystSession?.close()
        throw error
      } finally {
        protectedOpening = null
        protectedOpeningProject = null
      }
    })()
    return protectedOpening
  }
  async function execute(connection, job, file) {
    let finishBuilderOpening = null
    if (job.role === 'BUILDER' && job.helperHostWorkspace) {
      if (builderOpening) throw gate('NATIVE_H_BUILDER_OPEN_CONFLICT')
      builderOpening = new Promise(resolve => { finishBuilderOpening = resolve })
    }
    record(file, `AGENT_OPENING_${job.role}`)
    const endpoint = `/api/native/jobs/${job.id}`
    let binding = null
    let session
    let helperCaptureToken = null
    let delivery = Promise.resolve()
    const signal = new AbortController()
    const stop = () => signal.abort()
    controller.signal.addEventListener('abort', stop, { once: true })
    if (controller.signal.aborted) signal.abort()
    const statusTimer = setInterval(() => {
      void get(connection, `${endpoint}/status`).then(value => {
        if (value.status !== 'CLAIMED') signal.abort()
      }).catch(() => signal.abort())
    }, 1000)
    const event = (value) => {
      delivery = delivery.then(() => post(connection, `${endpoint}/event`, value))
      void delivery.catch(() => signal.abort())
    }
    try {
      binding = job.bindingFile ? JSON.parse(await readFile(job.bindingFile, 'utf8')) : null
      await materializePackagedRoleRuntime(runtime, job, binding)
      if (job.role === 'BUILDER' && job.helperHostWorkspace) {
        // session/new and mode changes for both H roles happen before W
        // Builder's custom session/new changes the shared MCP pool.
        // Drain a previously admitted H prompt *before* even creating a new
        // pair: a failed old pair may be cleared while its model turn unwinds.
        await waitForActiveProtectedPrompts(signal.signal)
        const h = await ensureProtectedPair(job, file)
        // If a Helper/Analyst prompt started before this Builder claim,
        // its model turn must finish before W session/new starts another
        // asynchronous cloud-config pull against the shared IDE state.
        await waitForActiveProtectedPrompts(signal.signal)
        if (!protectedPair || protectedPair !== h)
          throw gate('NATIVE_H_PAIR_LOST_BEFORE_BUILDER')
        await h.helperSession.attest()
        await h.analystSession.attest()
        record(file, 'BUILTIN_H_READY_BEFORE_BUILDER')
        if (!h.windowId) throw gate('NATIVE_H_WINDOW_ID_INVALID')
      }
      if (job.protectedBuiltin) {
        if (!['HELPER', 'EVIDENCE_ANALYST'].includes(job.role) || job.bindingFile)
          throw gate('NATIVE_H_JOB_SCOPE_INVALID')
        await waitForBuilderReady(signal.signal)
        const h = await ensureProtectedPair(job, file)
        const selected = job.role === 'HELPER' ? h.helperSession : h.analystSession
        const prepared = await get(connection, `${endpoint}/prompt`)
        if (typeof prepared?.message !== 'string' || !prepared.message.trim())
          throw gate('NATIVE_H_CORE_PROMPT_MISSING')
        if (job.role === 'HELPER')
          helperCaptureToken = helperCapture.begin(job, selected.windowId)
        record(file, `AGENT_RUNNING_${job.role}`)
        await appendFile(join(dirname(file), 'native-host-endpoints.jsonl'),
          `${JSON.stringify({ at: new Date().toISOString(), nativeJobId: job.id,
            role: job.role, windowId: selected.windowId })}\n`, { mode: 0o600 })
        // This second gate closes the race between the first Builder check
        // and the actual model prompt. Once it sees no W-open intent, add the
        // prompt to the active set synchronously, with no intervening await.
        while (builderOpening) await waitForBuilderReady(signal.signal)
        let releasePrompt
        const promptFinished = new Promise(resolve => { releasePrompt = resolve })
        activeProtectedPrompts.add(promptFinished)
        let result
        try {
          result = await selected.prompt(prepared.message, update => {
            if (update.kind === 'text_delta') event({ kind: 'TEXT', text: update.text })
          }, signal.signal)
        } finally {
          activeProtectedPrompts.delete(promptFinished)
          releasePrompt()
        }
        await delivery
        await post(connection, `${endpoint}/complete`, result)
        if (job.role === 'HELPER' && result.stopReason === 'end_turn' &&
            !signal.signal.aborted && helperCapture.complete(helperCaptureToken,
              prepared.message))
          record(file, 'NATIVE_HELPER_CAPTURE_READY')
        record(file, `AGENT_ENDED_${job.role}`)
        return
      }
      const roleOptions = {
        workspace: job.workspace, role: job.roleName,
        requireMcp: Boolean(binding), binding, bindingFile: job.bindingFile,
        discoveryHaiku: job.role === 'DISCOVERY',
        productBuilder: job.role === 'BUILDER', productMode: true,
        ...(job.role === 'BUILDER' ?
          { builderLeaseDeadlineAt: job.leaseDeadlineAt } : {}),
        bridgeScriptPath: runtime.bridgeScriptPath,
        redactText: redactSensitiveText,
        onPermissionTelemetry: (phase, toolName) => {
          const kind = ['read', 'search', 'write', 'shell'].includes(toolName) ?
            toolName.toUpperCase() : 'UNKNOWN'
          if (['REQUEST', 'SELECTED', 'DENIED', 'SENT', 'ACKED'].includes(phase))
            record(file, `PERMISSION_${phase}_${job.role}_${kind}`)
        },
        onProtocolTelemetry: (summary) => {
          if (summary?.kind === 'USER_INPUT_ACKED') {
            userInput.acknowledge(job.id, summary.sessionId, summary.toolCallId)
            record(file, `USER_INPUT_ACKED_${job.role}`)
            return
          }
          if (summary?.kind !== 'USER_INPUT_REQUEST') return
          const shape = summary.sessionIdPresent && summary.toolCallIdPresent &&
            summary.questionType === 'STRING' && summary.optionCount >= 0 &&
            summary.unknownKeyCount === 0 ? 'KNOWN_SHAPE' : 'UNKNOWN_SHAPE'
          record(file, `USER_INPUT_REQUEST_${job.role}_${shape}_OPTIONS_${
            Math.max(0, Math.min(20, summary.optionCount))}`)
        },
        onUserInputRequest: async (request) => {
          if (job.role === 'EVIDENCE_ANALYST' ||
            !job.projectId ||
            (job.role === 'DISCOVERY' ? !job.discoverySessionId : !job.taskId))
            throw new Error('NATIVE_USER_INPUT_SCOPE_INVALID')
          return userInput.request({ job, ...request, signal: signal.signal })
        },
        onPermissionRequest: async (_summary, detail) => {
          if (job.role !== 'BUILDER') {
            event({ kind: 'PERMISSION_DENIED' }); return null
          }
          if (detail.toolName === 'shell') {
            const input = detail.rawInput
            const background = input && Object.hasOwn(input, 'run_in_background') ?
              input.run_in_background === false ? 'FALSE' :
                input.run_in_background === true ? 'TRUE' : 'OTHER' : 'ABSENT'
            record(file, `PERMISSION_INPUT_BUILDER_SHELL_BACKGROUND_${background}`)
          }
          if (detail.toolName === 'write') {
            const toolIdClass = detail.nativeToolId === 'str_replace' ? 'STR_REPLACE' :
              detail.nativeToolId === 'fs_write' ? 'FS_WRITE' :
                detail.nativeToolId == null ? 'ABSENT' : 'OTHER'
            record(file, `PERMISSION_INPUT_BUILDER_WRITE_TOOL_${toolIdClass}`)
          }
          const optionId = await chooseNativeBuilderPermission(detail, job.workspace,
            reason => {
              if (detail.toolName === 'shell') record(file, `PERMISSION_GUARD_BUILDER_SHELL_${reason}`)
              if (detail.toolName === 'write') record(file, `PERMISSION_GUARD_BUILDER_WRITE_${reason}`)
            })
          if (!optionId) {
            event({ kind: 'PERMISSION_DENIED' }); return null
          }
          return optionId
        },
      }
      for (let attempt = 0; attempt < 8; attempt++) {
        try { session = await openNativeRole(vscode, roleOptions); break }
        catch (error) {
          if (error?.code !== 'NATIVE_ROLE_MODE_UNAVAILABLE' || attempt === 7) throw error
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
      sessionTags.set(job.role, session.sessionTag)
      if (job.role === 'BUILDER' && job.helperHostWorkspace &&
          session.windowId !== protectedPair?.windowId)
        throw gate('NATIVE_H_BUILDER_WINDOW_ID_MISMATCH')
      if (job.role === 'BUILDER' && job.helperHostWorkspace) {
        await protectedPair.helperSession.attestAfterBarrier(session.sessionIdForBarrier)
        await protectedPair.analystSession.attestAfterBarrier(session.sessionIdForBarrier)
        record(file, 'BUILTIN_H_MEMORY_BARRIER_ATTESTED')
        finishBuilderOpening?.(true)
        builderOpening = null
        finishBuilderOpening = null
      }
      // Role/job-bound numeric window identity is enough to test whether the
      // two custom Agents reached separate IDE hosts. Never record port/token.
      await appendFile(join(dirname(file), 'native-host-endpoints.jsonl'),
        `${JSON.stringify({ at: new Date().toISOString(), nativeJobId: job.id,
          role: job.role, windowId: session.windowId })}\n`, { mode: 0o600 })
      if (job.role === 'DISCOVERY' && session.modelId === 'claude-haiku-4.5')
        record(file, 'DISCOVERY_HAIKU_ACKED')
      record(file, `AGENT_RUNNING_${job.role}`)
      if (signal.signal.aborted) throw Object.assign(new Error('NATIVE_CANCELLED'),
        { code: 'NATIVE_CANCELLED' })
      const result = await session.prompt(job.message, update => {
        if (update.kind === 'session_queued') {
          const behindRole = [...sessionTags.entries()].find(([role, tag]) =>
            role !== job.role && tag === update.activeSessionTag)?.[0] ?? 'UNKNOWN'
          record(file, `AGENT_QUEUED_${job.role}_BEHIND_${behindRole}`)
        }
        if (update.kind === 'text_delta') event({ kind: 'TEXT', text: update.text })
        if (update.kind === 'tool_activity') event({ kind: 'TOOL', update: {
          sessionUpdate: 'tool_call_update', titleClass: update.titleClass,
          srcPath: update.srcPath, updateKeys: update.updateKeys,
          protocolKind: update.protocolKind, nativeStatus: update.nativeStatus,
          nativeToolIdClass: update.nativeToolIdClass,
          toolId: update.toolId, toolName: update.toolName,
          coreAction: update.coreAction, envelopeInputAction: update.envelopeInputAction,
          coreIsError: update.coreIsError,
          coreSuccess: update.coreSuccess, coreErrorCode: update.coreErrorCode,
          bridgeErrorCode: update.bridgeErrorCode,
          relativePath: update.relativePath, command: update.command,
          shellExitCode: update.shellExitCode,
          kiroOutputTransformation: update.kiroOutputTransformation,
          acpTruncationMarkerPresent: update.acpTruncationMarkerPresent,
          output: update.output, outputTruncated: update.outputTruncated,
          rawOutputType: update.rawOutputType, rawInputKeys: update.rawInputKeys,
          validationFieldMentions: update.validationFieldMentions,
          validationIssueKinds: update.validationIssueKinds,
        } })
      }, signal.signal)
      await delivery
      await post(connection, `${endpoint}/complete`, {
        text: result.text, stopReason: result.stopReason,
      })
      record(file, `AGENT_ENDED_${job.role}`)
    } catch (error) {
      if (finishBuilderOpening) {
        finishBuilderOpening(false)
        builderOpening = null
        finishBuilderOpening = null
      }
      const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(error.code) ?
        error.code : 'NATIVE_IDE_TURN_FAILED'
      if (protectedPair && job.protectedBuiltin) {
        const disposition = protectedFailureDisposition(code)
        if (disposition === 'REUSE_PAIR') {
          record(file, 'BUILTIN_H_CANCEL_CONFIRMED_REUSABLE')
        } else if (disposition === 'CLOSE_ROLE') {
          if (job.role === 'HELPER') {
            protectedPair.helperSession?.close()
            protectedPair.helperSession = null
          } else {
            protectedPair.analystSession?.close()
            protectedPair.analystSession = null
          }
          record(file, `BUILTIN_H_${job.role}_CLOSED_PEER_RETAINED`)
        } else if (disposition === 'CLOSE_PAIR') {
          protectedPair.helperSession?.close()
          protectedPair.analystSession?.close()
          protectedPair = null
          record(file, 'BUILTIN_H_FAIL_CLOSED')
        }
      } else if (protectedPair && job.role === 'BUILDER' && job.helperHostWorkspace) {
        // A deliberately partial pair must not be silently recreated while
        // another W/H turn may still depend on this shared IDE host.
        if (builderFailureDisposition(code) === 'CLOSE_PAIR') {
          protectedPair.helperSession?.close()
          protectedPair.analystSession?.close()
          protectedPair = null
          record(file, 'BUILTIN_H_FAIL_CLOSED')
        }
      }
      await delivery.catch(() => undefined)
      await post(connection, `${endpoint}/complete`, { errorCode: code }).catch(() => undefined)
      record(file, `AGENT_FAILED_${code}`)
    } finally {
      helperCapture.abort(helperCaptureToken)
      if (finishBuilderOpening) {
        finishBuilderOpening(false)
        builderOpening = null
      }
      sessionTags.delete(job.role)
      userInput.clearJob(job.id)
      clearInterval(statusTimer)
      controller.signal.removeEventListener('abort', stop)
      session?.close()
      if (session) record(file, `AGENT_SESSION_CLOSED_${job.role}`)
    }
  }
  async function tick() {
    if (polling || isolatedEvaluation || controller.signal.aborted) return
    polling = true
    try {
      const file = connectionFile || vscode.workspace.getConfiguration('vibeHelper').get('connectionFile', '')
      if (!file) return
      if (!startupRecorded) { record(file, 'WORKER_STARTED'); startupRecorded = true }
      const connection = await readLocalConnection(file)
      const health = await get(connection, '/health')
      if (health.agent !== 'KIRO_IDE_BUILTIN_AGENT') return
      if (!connectedRecorded) { record(file, 'WORKER_CONNECTED'); connectedRecorded = true }
      const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
      if (!folder || vscode.workspace.workspaceFolders.length !== 1) return
      const workspace = await realpath(folder)
      const generatedRoot = await realpath(join(dirname(file), 'workspaces'))
      const helperHost = dirname(workspace) === generatedRoot &&
        basename(workspace).startsWith('__vibe-native-helper-')
      // Wait for the prior Helper/Analyst session to close before opening the
      // next custom Agent against this host's single MCP pool.
      if (helperHost && active.size > 0) return
      if (active.size >= 4) return
      const next = await get(connection,
        `/api/native/next?workspace=${encodeURIComponent(workspace)}` +
        `&activeRoles=${encodeURIComponent([...active.keys()].join(','))}`)
      // A later retry is a new routing opportunity after the old pending Job
      // has expired. Suppress only repeats of the same still-pending switch.
      if (!next.pendingWorkspace) unconfirmedSwitchTarget = null
      if (next.job) {
        if (active.has(next.job.role) || active.size >= 4) {
          await post(connection, `/api/native/jobs/${next.job.id}/complete`,
            { errorCode: 'NATIVE_ROLE_SLOT_CONFLICT' }).catch(() => undefined)
          return
        }
        record(file, `JOB_CLAIMED_${next.job.role}`)
        const task = execute(connection, next.job, file).catch(async () => {
          await post(connection, `/api/native/jobs/${next.job.id}/complete`,
            { errorCode: 'NATIVE_WORKER_FAILED' }).catch(() => undefined)
          record(file, 'AGENT_FAILED_NATIVE_WORKER_FAILED')
        }).finally(() => active.delete(next.job.role))
        active.set(next.job.role, task)
        void task
      } else if (active.size === 0 && next.pendingWorkspace &&
          next.pendingWorkspace !== workspace) {
        // Only switch between this backend's generated workspaces, never to an arbitrary path.
        // A Helper-only workspace needs its own IDE window and Agent host.
        // Its worker must never navigate into Builder's workspace.
        if (helperHost) return
        const target = await realpath(next.pendingWorkspace)
        if (!isWithin(generatedRoot, target)) return
        if (unconfirmedSwitchTarget === target) return
        record(file, 'WORKSPACE_SWITCHING')
        // The IDE may focus another window that already has this folder open.
        // Keep this host's worker alive until VS Code actually disposes it, and
        // do not repeatedly refocus an unrelated window on an unconfirmed route.
        try {
          await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(target),
            { forceNewWindow: false })
          await new Promise(resolve => setTimeout(resolve, 1500))
          const currentFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
          const current = currentFolder ? await realpath(currentFolder) : null
          if (current !== target && !controller.signal.aborted) {
            unconfirmedSwitchTarget = target
            record(file, 'WORKSPACE_SWITCH_UNCONFIRMED')
          }
        } catch {
          unconfirmedSwitchTarget = target
          record(file, 'WORKSPACE_SWITCH_FAILED')
        }
      }
    } catch {
      connectedRecorded = false
      /* Backend may be stopped; retry without exposing credentials or user text. */
    }
    finally { polling = false }
  }
  const timer = setInterval(() => void tick(), 1000)
  context.subscriptions.push({ dispose: () => { controller.abort(); clearInterval(timer)
    protectedPair?.helperSession?.close(); protectedPair?.analystSession?.close()
    protectedPair = null; helperCapture.clear() } })
  void tick()
  worker = {
    connectionFile,
    runtimeSource: runtime.source,
    getStatus: () => lastStatus,
    armAnalystSonnetVariant: async (scope) => {
      if (controller.signal.aborted || isolatedEvaluation || active.size > 0 ||
          protectedPair || builderOpening || protectedOpening ||
          activeProtectedPrompts.size > 0)
        throw gate('NATIVE_ANALYST_VARIANT_WORKER_NOT_IDLE')
      for (let attempt = 0; polling && attempt < 20; attempt++)
        await new Promise(resolve => setTimeout(resolve, 50))
      if (controller.signal.aborted || isolatedEvaluation || polling || active.size > 0 ||
          protectedPair || builderOpening || protectedOpening ||
          activeProtectedPrompts.size > 0)
        throw gate('NATIVE_ANALYST_VARIANT_WORKER_NOT_IDLE')
      const owned = currentApprovedProductWorkspace(vscode)
      if (scope?.projectId !== owned.projectId || scope?.workspace !== owned.workspace)
        throw gate('NATIVE_ANALYST_VARIANT_PROJECT_MISMATCH')
      const modelId = analystVariant.armSonnet(owned)
      record(connectionFile, 'ANALYST_MODEL_SONNET_VARIANT_ARMED')
      return { projectId: owned.projectId, modelId }
    },
    armCompletedHelperCapture: async (scope) => {
      if (controller.signal.aborted || isolatedEvaluation || active.size > 0 ||
          builderOpening || protectedOpening || activeProtectedPrompts.size > 0)
        throw gate('NATIVE_HELPER_CAPTURE_WORKER_NOT_IDLE')
      for (let attempt = 0; polling && attempt < 20; attempt++)
        await new Promise(resolve => setTimeout(resolve, 50))
      if (controller.signal.aborted || isolatedEvaluation || polling || active.size > 0 ||
          builderOpening || protectedOpening || activeProtectedPrompts.size > 0)
        throw gate('NATIVE_HELPER_CAPTURE_WORKER_NOT_IDLE')
      const result = helperCapture.arm(scope)
      record(connectionFile, 'NATIVE_HELPER_CAPTURE_ARMED')
      return result
    },
    // A metadata-only synthetic evaluation creates extra native sessions and
    // changes the host's shared MCP pool. Reserve the idle worker before that
    // first session/new, and keep ordinary job claiming paused until release.
    acquireIsolatedEvaluation: async (options = {}) => {
      if (options.requireHelperCaptureProjectId &&
          !helperCapture.available(options.requireHelperCaptureProjectId))
        throw gate('NATIVE_HELPER_CAPTURE_UNAVAILABLE')
      if (controller.signal.aborted || isolatedEvaluation || active.size > 0 ||
          builderOpening || protectedOpening || activeProtectedPrompts.size > 0)
        throw gate('NATIVE_EVAL_WORKER_NOT_IDLE')
      for (let attempt = 0; polling && attempt < 20; attempt++)
        await new Promise(resolve => setTimeout(resolve, 50))
      if (controller.signal.aborted || isolatedEvaluation || polling || active.size > 0 ||
          builderOpening || protectedOpening || activeProtectedPrompts.size > 0)
        throw gate('NATIVE_EVAL_WORKER_NOT_IDLE')
      isolatedEvaluation = true
      protectedPair?.helperSession?.close()
      protectedPair?.analystSession?.close()
      protectedPair = null
      record(connectionFile, 'NATIVE_EVAL_ISOLATED_IDLE')
      let released = false
      return { signal: controller.signal,
        takeCompletedHelperCapture: (projectId) => {
          if (!isolatedEvaluation || released || controller.signal.aborted)
            throw gate('NATIVE_HELPER_CAPTURE_LEASE_INVALID')
          return helperCapture.take(projectId)
        },
        assertIdle: () => isolatedEvaluation && !released &&
          !controller.signal.aborted && active.size === 0 && !polling &&
          !builderOpening && !protectedOpening &&
          activeProtectedPrompts.size === 0,
        release: (options = {}) => {
        if (released) return
        released = true
        if (options.resume !== true) {
          record(connectionFile, 'NATIVE_EVAL_RELOAD_REQUIRED')
          return
        }
        isolatedEvaluation = false
        record(connectionFile, 'NATIVE_EVAL_ISOLATION_RELEASED')
        void tick()
      } }
    },
    subscribeStatus: (listener) => {
      statusSubscribers.add(listener)
      return () => statusSubscribers.delete(listener)
    },
    listUserInputs: (projectId) => userInput.list(projectId),
    subscribeUserInputs: (listener) => userInput.subscribe(listener),
    submitUserInput: async (value) => {
      if (!value || typeof value.nativeJobId !== 'string' ||
        !/^native_[0-9a-f-]{36}$/.test(value.nativeJobId))
        throw new Error('NATIVE_USER_INPUT_RESPONSE_INVALID')
      const file = connectionFile || vscode.workspace.getConfiguration('vibeHelper').get('connectionFile', '')
      const connection = await readLocalConnection(file)
      const status = await get(connection, `/api/native/jobs/${encodeURIComponent(value.nativeJobId)}/status`)
      if (status.status !== 'CLAIMED') throw new Error('NATIVE_USER_INPUT_STALE')
      return userInput.submit(value)
    },
    stop: () => { controller.abort(); clearInterval(timer)
      protectedPair?.helperSession?.close(); protectedPair?.analystSession?.close()
      protectedPair = null; worker = undefined },
  }
  return worker
}
module.exports = { startNativeWorker }
