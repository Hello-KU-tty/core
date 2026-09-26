// Test-only installed extension. UI inputs are synthetic; Agent outputs are live.
// Never packaged in the product VSIX. No SQL, fixture seed, or mutation replay.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { readFile, writeFile, rename } = require('node:fs/promises')
const { basename, dirname, join } = require('node:path')
const id = prefix => `${prefix}_${randomUUID()}`
const meta = correlationId => ({ schemaVersion: 1, actor: { kind: 'UI' }, correlationId: correlationId ?? id('corr') })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const safe = error => /^[A-Z][A-Z0-9_]{0,99}$/.test(error?.code ?? error?.message ?? '')
  ? error.code ?? error.message : error?.code === 'ERR_ASSERTION' ? 'VERTICAL_ASSERTION_FAILED' : 'VERTICAL_CHECK_FAILED'

// A separate receipt may retry only an acknowledged, terminal initialization failure.
// Original files and the failed run remain immutable evidence; unknown mutations are refused.
exports.prepareBuilderRetry = function (source, sourceDigest, sourceName) {
  const builder = source?.runs?.BUILDER_INITIAL
  const step = source?.steps?.BUILDER_INITIAL
  const project = source?.projectId
  const task = source?.steps?.PREPARE_TASK?.value?.taskId
  const attempt = (source?.retry?.attempt ?? 0) + 1
  if (source?.status !== 'FAIL' || source.stage !== 'BUILDER_INITIAL_WAITING' ||
      !['NATIVE_RPC_TIMEOUT', 'PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED',
        'NATIVE_CLOUD_CYCLE_UNVERIFIED'].includes(source.errorCode) || builder?.status !== 'FAILED' ||
      builder.outcome !== 'NONE' || builder.errorCode !== source.errorCode ||
      step?.state !== 'DONE' || step.value !== builder.id ||
      !/^run_[0-9a-f-]{36}$/.test(builder.id) || !/^project_[0-9a-f-]{36}$/.test(project) ||
      !/^task_[0-9a-f-]{36}$/.test(task) ||
      source.steps.START_DISCOVERY?.state !== 'DONE' || source.steps.START_DISCOVERY.value !== project ||
      source.steps.CONFIRM_SPEC?.state !== 'DONE' || source.steps.PREPARE_TASK.state !== 'DONE' ||
      source.steps.CHOOSE_DECISION || source.steps.BUILDER_APPLY ||
      !['PREVIEW', 'JIT_ENRICH', 'REFINE_ROUND', 'SPEC', 'SPEC_REVISE']
        .every(key => source.runs[key]?.status === 'SUCCEEDED' && source.steps[key]?.state === 'DONE') ||
      !Number.isInteger(source.nativeRequests) || source.nativeRequests < 6 || source.nativeRequests > 100 ||
      !Number.isInteger(attempt) || attempt < 1 || attempt > 2 ||
      !Array.isArray(source.previousAttempts ?? []) ||
      (source.previousAttempts?.length ?? 0) !== attempt - 1 ||
      !/^[a-f0-9]{64}$/.test(sourceDigest) || !/^receipt-[0-9a-f-]{36}\.json$/.test(sourceName))
    throw new Error('KNOWN_FAILED_BUILDER_RETRY_REQUIRED')
  const report = JSON.parse(JSON.stringify(source))
  report.previousAttempts = [...(source.previousAttempts ?? []), {
    productVersion: source.productVersion, backendInstanceId: source.backendInstanceId,
    nativeRequests: source.nativeRequests, activatedHosts: source.activatedHosts,
    failedRun: builder, acknowledgedStep: step, sourceDigest,
    memory: { atStartBytes: source.hostMemoryAtStartBytes, lastBytes: source.hostMemoryBytes,
      maxObservedBytes: source.maxObservedHostRssBytes },
  }]
  report.retry = { attempt, sourceDigest, sourceName, previousRunId: builder.id,
    projectId: project, taskId: task, priorNativeRequests: source.nativeRequests }
  // These are new-attempt fields. Never remove a STARTED/unknown request.
  delete report.steps.BUILDER_INITIAL
  delete report.runs.BUILDER_INITIAL
  delete report.status
  delete report.errorCode
  delete report.backendInstanceId
  delete report.lifecycle
  delete report.hostMemoryAtStartBytes
  delete report.hostMemoryBytes
  delete report.maxObservedHostRssBytes
  delete report.memoryScope
  report.stage = 'RETRY_VALIDATING'
  report.activatedHosts = 0
  report.readFailures = 0
  return report
}


exports.verifyBuilderRetry = async function (client, report, instance, personalNeed) {
  const retry = report.retry
  const existing = await client.restoreProject(retry.projectId)
  assert.equal(existing.project.id, retry.projectId)
  assert.equal(existing.currentTask.id, retry.taskId)
  assert.equal(existing.learningSpec.status, 'CONFIRMED')
  assert.equal(existing.learningSpec.revision, report.confirmedSpecRevision ?? report.revisedSpecRevision + 1)
  assert.equal(Boolean(existing.discoverySession.input.personalNeed), Boolean(personalNeed))
  if (!report.steps.BUILDER_INITIAL && (existing.decisions.length || existing.completionReport))
    throw new Error('BUILDER_RETRY_REQUIRES_MANUAL_OBSERVATION')
  const runs = await client.listRuns(retry.projectId)
  if (!report.steps.BUILDER_INITIAL && runs.some(run => ['ACCEPTED', 'RUNNING'].includes(run.status)))
    throw new Error('BUILDER_RETRY_RUN_STILL_ACTIVE')
  try {
    const previous = await client.getRun(retry.previousRunId)
    assert.equal(previous.status, 'FAILED')
    assert.equal(previous.outcome, 'NONE')
    assert.equal(previous.projectId, retry.projectId)
    assert.equal(previous.kind, 'BUILDER')
    assert.equal(previous.errorCode, report.previousAttempts.at(-1).failedRun.errorCode)
    return 'CURRENT_CORE_TERMINAL_RUN'
  } catch (error) {
    // Workflow runs are explicitly transient. A restarted Core restores domain state,
    // while the private, hashed receipt remains evidence of the terminal response.
    const priorInstance = report.previousAttempts.at(-1)?.backendInstanceId
    if (safe(error) !== 'RUN_NOT_FOUND_RESTORE_PROJECT' || !priorInstance || priorInstance === instance)
      throw error
    return 'RECORDED_TERMINAL_RESPONSE_AND_RESTORED_PROJECT'
  }
}


exports.prepareBuildContinuation = function (source, sourceDigest, sourceName) {
  const run = source?.runs?.BUILDER_APPLY
  const task = source?.task
  if (source?.status !== 'FAIL' || source.stage !== 'BUILDER_APPLY_WAITING' ||
      !['ERR_ASSERTION', 'TASK_COMPLETION_NOT_RECORDED'].includes(source.errorCode) ||
      run?.status !== 'SUCCEEDED' || run.outcome !== 'TURN_ENDED' ||
      source.steps?.BUILDER_APPLY?.state !== 'DONE' || source.steps.BUILDER_APPLY.value !== run.id ||
      !/^run_[0-9a-f-]{36}$/.test(run.id) || !/^project_[0-9a-f-]{36}$/.test(source.projectId) ||
      !/^task_[0-9a-f-]{36}$/.test(task?.id) || task.status !== 'ACTIVE' || task.completion !== false ||
      !Number.isInteger(task.revision) || task.revision < 1 ||
      !Number.isInteger(task.decisionsApplied) || task.decisionsApplied < 1 ||
      source.helperRecorded !== true || source.steps.PREPARE_TASK?.value?.taskId !== task.id ||
      source.steps.START_DISCOVERY?.value !== source.projectId ||
      source.steps.CHOOSE_DECISION?.state !== 'DONE' ||
      source.steps.RESOLVE_DECISIONS?.state !== 'DONE' ||
      source.steps.LAUNCH_RESULT || source.continuation ||
      Object.values(source.steps).some(value => value.state !== 'DONE') ||
      !['PREVIEW', 'JIT_ENRICH', 'REFINE_ROUND', 'SPEC', 'SPEC_REVISE', 'BUILDER_INITIAL', 'HELPER_DECISION']
        .every(key => source.runs[key]?.status === 'SUCCEEDED' && source.steps[key]?.state === 'DONE') ||
      !Number.isInteger(source.nativeRequests) || source.nativeRequests < 8 || source.nativeRequests > 100 ||
      !/^[a-f0-9]{64}$/.test(sourceDigest) || !/^receipt-[0-9a-f-]{36}\.json$/.test(sourceName))
    throw new Error('KNOWN_INCOMPLETE_BUILD_REQUIRED')
  const report = JSON.parse(JSON.stringify(source))
  report.continuation = { sourceDigest, sourceName, priorRun: run,
    previousCore: source.backendInstanceId, taskId: task.id, taskRevision: task.revision,
    decisionsApplied: task.decisionsApplied, attempt: 1 }
  delete report.retry
  delete report.steps.BUILDER_APPLY
  delete report.runs.BUILDER_APPLY
  for (const key of ['status', 'errorCode', 'backendInstanceId', 'lifecycle', 'hostMemoryAtStartBytes',
    'hostMemoryBytes', 'maxObservedHostRssBytes', 'memoryScope']) delete report[key]
  report.stage = 'CONTINUATION_VALIDATING'
  report.activatedHosts = 0
  report.readFailures = 0
  return report
}

exports.verifyBuildContinuation = async function (client, report, instance, personalNeed) {
  const prior = report.continuation
  const current = await client.restoreProject(report.projectId)
  assert.equal(current.project.id, report.projectId)
  assert.equal(current.currentTask.id, prior.taskId)
  assert.equal(current.currentTask.revision, prior.taskRevision)
  assert.equal(current.currentTask.status, 'ACTIVE')
  assert.equal(current.learningSpec.status, 'CONFIRMED')
  assert.equal(current.learningSpec.revision, report.confirmedSpecRevision ?? report.revisedSpecRevision + 1)
  assert.equal(Boolean(current.discoverySession.input.personalNeed), Boolean(personalNeed))
  if (!report.steps.BUILDER_APPLY) {
    assert.equal(current.pendingDecisions.length, 0)
    assert.equal(current.completionReport, null)
    assert.equal(current.decisions.filter(value => value.application).length, prior.decisionsApplied)
    assert.ok(current.decisions.some(value => value.request.id === report.steps.CHOOSE_DECISION.value && value.application))
    assert.ok(current.helperConversations.some(value => value.helperResponseSummaries.length > 0))
    assert.equal((await client.listRuns(report.projectId)).some(value => ['ACCEPTED', 'RUNNING'].includes(value.status)), false)
  }
  try {
    const run = await client.getRun(prior.priorRun.id)
    assert.equal(run.status, 'SUCCEEDED')
    assert.equal(run.outcome, 'TURN_ENDED')
    assert.equal(run.kind, 'BUILDER')
    assert.equal(run.projectId, report.projectId)
    return 'CURRENT_CORE_INCOMPLETE_TURN'
  } catch (error) {
    if (safe(error) !== 'RUN_NOT_FOUND_RESTORE_PROJECT' || !prior.previousCore || prior.previousCore === instance) throw error
    return 'RECORDED_INCOMPLETE_TURN_AND_RESTORED_TASK'
  }
}

// One environment-repair observation, distinct from the already consumed build continuation.
exports.prepareShellEnvironmentRecovery = function (source, sourceDigest, sourceName, environment) {
  if (source?.environmentRecovery || source?.continuation?.attempt !== 1 ||
      !/^[a-f0-9]{64}$/.test(source.continuation.sourceDigest ?? '') ||
      !['CURRENT_CORE_INCOMPLETE_TURN', 'RECORDED_INCOMPLETE_TURN_AND_RESTORED_TASK']
        .includes(source.continuation.verification) ||
      source.productVersion !== '0.3.10' || source.apiVersion !== '1.131.0' ||
      source.nativeRequests !== 10 || source.errorCode !== 'TASK_COMPLETION_NOT_RECORDED' ||
      environment?.status !== 'PASS' || environment.mode !== 'WINDOWS_DEFAULT_MODULES' ||
      environment.standardModule !== true || environment.policyChanged !== false ||
      environment.executionPolicy !== 'Restricted' || environment.version !== '2.0.0' ||
      !Number.isFinite(Date.parse(environment.observedAt)) ||
      Date.now() - Date.parse(environment.observedAt) < 0 ||
      Date.now() - Date.parse(environment.observedAt) > 60000)
    throw new Error('VERIFIED_SHELL_ENVIRONMENT_RECOVERY_REQUIRED')
  const input = JSON.parse(JSON.stringify(source))
  delete input.continuation
  const report = exports.prepareBuildContinuation(input, sourceDigest, sourceName)
  report.environmentRecovery = { attempt: 1, sourceDigest, sourceName,
    previousContinuation: source.continuation, environment }
  return report
}

exports.activate = async function () {
  const vscode = require('vscode')
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? ''
  if (basename(folder).startsWith('__vibe-native-helper-')) return
  const config = JSON.parse(await readFile(join(__dirname, 'config.json'), 'utf8'))
  const report = await readFile(config.report, 'utf8').then(JSON.parse).catch(error => {
    if (error.code !== 'ENOENT') throw error
    return { target: 'win32-x64', environment: config.cleanWindowsUserConfirmed ? 'USER_CONFIRMED_INITIAL_CLEAN_WINDOWS' : 'ISOLATED_DEVELOPMENT_PC',
      provenance: 'SYNTHETIC_UI_INPUT_LIVE_NATIVE_AGENT', cleanMachine: config.cleanWindowsUserConfirmed ? 'USER_CONFIRMED_INITIAL_CLEAN_WINDOWS' : 'NOT_VERIFIED',
      verificationToolsPreparedLater: config.cleanWindowsUserConfirmed === true,
      processShellPolicy: config.processShellPolicy ?? null,
      uiCoverage: 'PANEL_OPEN_AND_SDK_DRIVEN_HOST', stage: 'ACTIVATING', nativeRequests: 0,
      steps: {}, runs: {}, readFailures: 0, activatedHosts: 0 }
  })
  if (report.status) return
  report.activatedHosts += 1
  report.hostMemoryAtStartBytes ??= process.memoryUsage().rss
  const save = async () => {
    report.hostMemoryBytes = process.memoryUsage().rss
    report.maxObservedHostRssBytes = Math.max(report.maxObservedHostRssBytes ?? 0, report.hostMemoryBytes)
    report.memoryScope = 'EXTENSION_HOST_RSS_NOT_TOTAL_KIRO_OR_CORE'
    const pending = `${config.report}.tmp`
    await writeFile(pending, JSON.stringify(report), { mode: 0o600 })
    for (let attempt = 0; ; attempt++) {
      try { await rename(pending, config.report); break }
      catch (error) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5) throw error
        await pause(100 * (attempt + 1))
      }
    }
  }
  const step = async (key, action) => {
    const previous = report.steps[key]
    if (previous?.state === 'DONE') return previous.value
    if (previous) throw new Error('MUTATION_RESPONSE_UNKNOWN_NOT_REPLAYED')
    report.stage = key
    report.steps[key] = { state: 'STARTED', at: new Date().toISOString() }
    await save()
    const value = await action()
    report.steps[key] = { ...report.steps[key], state: 'DONE', value }
    await save()
    return value
  }
  const until = async (check, timeout = 240000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await check()) return
      await pause(1500)
    }
    throw new Error('VERTICAL_STAGE_TIMEOUT')
  }
  try {
    await save()
    const extension = vscode.extensions.getExtension('vibe-helper.vibe-helper-portable-core')
    assert.ok(extension)
    const api = await extension.activate()
    report.productVersion = extension.packageJSON.version
    report.apiVersion = vscode.version
    report.agentVersion = vscode.extensions.getExtension('kiro.kiroAgent')?.packageJSON.version
    await until(async () => {
      const state = api.lifecycleStatus()
      if (state.phase === 'FAILED') throw new Error(state.errorCode)
      if (!vscode.workspace.isTrusted) report.stage = 'WAITING_FOR_USER_WORKSPACE_TRUST'
      else report.stage = 'WAITING_FOR_NATIVE_READY'
      await save()
      return state.phase === 'CORE_CONNECTED' && state.native === 'WORKER_READY'
    }, 300000)
    report.lifecycle = api.lifecycleStatus()
    report.panelOpened = (await vscode.commands.executeCommand('vibeHelper.localPanel')).panelOpened
    assert.equal(report.panelOpened, true)
    const sdk = require(join(extension.extensionPath, 'portable/bin/client.cjs'))
    const client = await sdk.connectLocalCore(config.connectionFile)
    const instance = (await client.health()).backendInstanceId
    if (report.backendInstanceId && report.backendInstanceId !== instance)
      throw new Error('CORE_RESTARTED_OBSERVATION_REQUIRED')
    report.backendInstanceId = instance
    if (report.retry) {
      report.retry.verification = await exports.verifyBuilderRetry(client, report, instance, config.personalNeed)
      await save()
    }
    if (report.continuation) {
      report.continuation.verification = await exports.verifyBuildContinuation(client, report, instance, config.personalNeed)
      await save()
    }
    // Only explicitly read-only operations enter this bounded retry helper.
    const read = async operation => {
      for (let attempt = 0; ; attempt++) {
        try { return await operation() }
        catch (error) {
          if (!['CORE_CONNECTION_UNAVAILABLE', 'CORE_CONNECTION_RECOVERY_FAILED'].includes(safe(error)) || attempt >= 2) throw error
          report.readFailures += 1
          await save()
          await pause(2000)
          assert.equal((await client.health()).backendInstanceId, instance)
        }
      }
    }
    const projectId = await step('START_DISCOVERY', async () => {
      const projectId = id('project')
      await client.execute({ ...meta(), kind: 'UI_START_DISCOVERY', projectId, idempotencyKey: id('idem'),
        input: config.personalNeed ? {
          learningGoal: 'Learn TypeScript finite state machines and valid state transitions in a tiny browser app.',
          personalNeed: 'I want to track the stages of repairing my household objects without accounts or cloud services.',
        } : { learningGoal: 'Learn TypeScript discriminated unions and exhaustive handling in a tiny browser app.' } })
      return projectId
    })
    report.projectId = projectId
    const snapshot = () => read(() => client.restoreProject(projectId))
    const run = async (key, request) => {
      const completedStages = ['PREVIEW', 'JIT_ENRICH', 'REFINE_ROUND', 'SPEC', 'SPEC_REVISE',
        ...(report.continuation ? ['BUILDER_INITIAL', 'HELPER_DECISION'] : [])]
      if ((report.retry?.verification || report.continuation?.verification) &&
          completedStages.includes(key) &&
          report.steps[key]?.state === 'DONE' && report.runs[key]?.status === 'SUCCEEDED') return
      const runId = await step(key, async () => {
        if (config.nativeRequestLimit !== null && config.nativeRequestLimit !== undefined) {
          assert.ok(Number.isInteger(config.nativeRequestLimit) && config.nativeRequestLimit >= 1 &&
            config.nativeRequestLimit <= 20 && report.nativeRequests < config.nativeRequestLimit,
            'NATIVE_REQUEST_LIMIT_REACHED')
        }
        report.nativeRequests += 1
        await save()
        const value = await client.startRun({ ...request, projectId, idempotencyKey: id('idem') })
        return value.id
      })
      report.stage = `${key}_WAITING`
      await save()
      await until(async () => {
        const value = await read(() => client.getRun(runId))
        assert.equal(value.projectId, projectId)
        if (['ACCEPTED', 'RUNNING'].includes(value.status)) return false
        report.runs[key] = { id: value.id, status: value.status, outcome: value.outcome,
          errorCode: value.errorCode, lastSequence: value.lastSequence }
        await save()
        if (value.status !== 'SUCCEEDED') throw new Error(value.errorCode ?? 'NATIVE_RUN_NOT_SUCCEEDED')
        return true
      }, request.kind === 'BUILDER' ? 1200000 : 300000)
    }
    const discovery = async (key, phase, options = {}) => {
      const s = await snapshot()
      await run(key, { kind: 'DISCOVERY', phase, discoverySessionId: s.discoverySession.id,
        expectedSessionRevision: s.discoverySession.revision, enrichAfterPreview: false, ...options })
    }
    await discovery('PREVIEW', 'PREVIEW')
    let s = await snapshot()
    report.previewCount = s.discoveryContext.previewRound.previews.length
    assert.equal(report.previewCount, 10)
    const candidateId = await step('CHOOSE_SYNTHETIC_PREVIEW', async () => s.discoveryContext.previewRound.previews[0].candidateId)
    await discovery('JIT_ENRICH', 'ENRICH_SELECTED', { candidateIds: [candidateId] })
    const feedback = async (key, intent, message) => step(key, async () => {
      const current = await snapshot()
      const session = current.discoverySession
      const context = current.discoveryContext
      const latest = context.rounds.at(-1)
      await client.execute({ ...meta(session.correlationId), kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
        idempotencyKey: id('idem'), expectedSessionRevision: session.revision,
        feedback: { schemaVersion: 1, id: id('feedback'), discoverySessionId: session.id,
          roundId: latest?.id ?? context.previewRound.finalRoundId, correlationId: session.correlationId,
          intent, targets: [{ candidateId, revision: latest?.candidates.find(c => c.candidateId === candidateId)?.revision ?? 1 }],
          ...(message ? { message } : {}), createdAt: new Date().toISOString(), source: { kind: 'USER' }, redactionStatus: 'NOT_REQUIRED' } })
      return true
    })
    await feedback('REFINE_INPUT', 'SHRINK', 'Keep this candidate identity and its learning mechanism. Limit the MVP to one useful interaction on one local browser page. No accounts, external APIs, cloud, or framework. Use a small TypeScript Node HTTP server and built-in tests; persistence behavior is still a product choice to discuss during build.')
    await discovery('REFINE_ROUND', 'ROUND')
    await feedback('SELECT', 'SELECT')
    await discovery('SPEC', 'SPEC')
    s = await snapshot()
    report.firstSpecRevision ??= s.learningSpec.revision
    await discovery('SPEC_REVISE', 'SPEC', { expectedSpecRevision: s.learningSpec.revision,
      message: 'Make the MVP acceptance criteria explicitly include a local browser interaction, one invalid input or transition test, and a result that can be launched locally. Keep the current project and one small feature.' })
    s = await snapshot()
    report.revisedSpecRevision ??= s.learningSpec.revision
    assert.ok(report.revisedSpecRevision > report.firstSpecRevision)
    await step('CONFIRM_SPEC', async () => {
      const current = await snapshot()
      await client.execute({ ...meta(current.discoverySession.correlationId), kind: 'UI_CONFIRM_LEARNING_SPEC',
        projectId, learningSpecId: current.learningSpec.id, expectedSpecRevision: current.learningSpec.revision, idempotencyKey: id('idem') })
      return true
    })
    await step('PREPARE_TASK', async () => {
      const current = await snapshot()
      assert.equal(current.learningSpec.status, 'CONFIRMED')
      report.confirmedSpecRevision = current.learningSpec.revision
      const prepared = await client.execute({ ...meta(current.discoverySession.correlationId), kind: 'UI_PREPARE_BUILDER_TASK',
        projectId, learningSpecId: current.learningSpec.id, expectedSpecRevision: current.learningSpec.revision, idempotencyKey: id('idem') })
      return { taskId: prepared.task.id }
    })
    const builder = async (key, message) => {
      const current = await snapshot()
      await run(key, { kind: 'BUILDER', taskId: current.currentTask.id,
        expectedTaskRevision: current.currentTask.revision, message })
    }
    await builder('BUILDER_INITIAL', 'Read and start the confirmed Task in this generated workspace. Before choosing whether user entries survive a page reload or server restart, explain the materially different retention options through a real Core Decision. I have not decided this behavior. After recording that Decision, end this turn so I can consult Helper and resolve it before you implement. Do not implement or claim completion yet. The next turn will implement and verify the actual build/tests and local result manifest with the protected Windows launcher.')
    s = await snapshot()
    if (!report.steps.CHOOSE_DECISION) assert.ok(s.pendingDecisions.length > 0)
    report.decisionCount ??= s.pendingDecisions.length
    const decisionId = await step('CHOOSE_DECISION', async () => s.pendingDecisions[0].id)
    await run('HELPER_DECISION', { kind: 'HELPER', taskId: s.currentTask.id, decisionId,
      message: 'This is a synthetic validation conversation. Compare the current retention choices and their effect on a page reload and server restart. Do not choose for me. Keep it brief.' })
    report.helperRecorded = (await snapshot()).helperConversations.some(c => c.helperResponseSummaries.length > 0)
    assert.equal(report.helperRecorded, true)
    await step('RESOLVE_DECISIONS', async () => {
      // Each Decision gets its own journal entry to prevent partial-batch replay.
      const current = await snapshot()
      for (const decision of current.pendingDecisions) {
        await step(`RESOLVE_${decision.id}`, async () => {
          const latest = await snapshot()
          await client.execute({ ...meta(decision.correlationId), kind: 'UI_RESOLVE_DECISION', idempotencyKey: id('idem'),
            resolution: { schemaVersion: 1, id: id('decision_resolution'), projectId, taskId: decision.taskId,
              decisionId: decision.id, correlationId: decision.correlationId, expectedContextVersion: latest.liveContext.contextVersion,
              selectionKind: 'OPTION', selectedOptionId: decision.options[0].id, helperUsed: true,
              resolvedAt: new Date().toISOString(), source: { kind: 'USER' }, redactionStatus: 'NOT_REQUIRED' } })
          return true
        })
      }
      return true
    })
    await builder('BUILDER_APPLY', 'Apply the stored user Decision, implement the confirmed minimal MVP, run the real frozen install/build/tests using the protected Windows launcher, create the result manifest, and complete the Task through Core only when the acceptance criteria really pass. The test selection supplied no rationale, so it is not evidence of user understanding.')
    s = await snapshot()
    report.task = { id: s.currentTask.id, status: s.currentTask.status, revision: s.currentTask.revision,
      completion: Boolean(s.completionReport), decisionsApplied: s.decisions.filter(d => d.application).length }
    if (!s.completionReport) throw new Error('TASK_COMPLETION_NOT_RECORDED')
    assert.equal(report.task.status, 'COMPLETED')
    assert.equal(s.pendingDecisions.length, 0)
    assert.ok(report.task.decisionsApplied > 0)
    await step('LAUNCH_RESULT', async () => {
      const result = await client.execute({ ...meta(s.project.correlationId), kind: 'UI_LAUNCH_RESULT', projectId, idempotencyKey: id('idem') })
      assert.equal(result.status, 'RUNNING')
      assert.match(result.url, /^http:\/\/127\.0\.0\.1:\d+\//)
      const response = await fetch(result.url, { signal: AbortSignal.timeout(15000) })
      assert.ok(response.ok)
      return { status: result.status, httpStatus: response.status, bodyBytes: (await response.arrayBuffer()).byteLength }
    })
    report.stage = 'ANALYSIS_OBSERVATION'
    await save()
    await until(async () => {
      const jobs = await read(() => client.execute({ ...meta(), kind: 'UI_READ_ANALYSIS_JOBS', projectId, limit: 100 }))
      return jobs.every(job => ['SUCCEEDED', 'FAILED'].includes(job.status))
    }, 180000)
    const jobs = await read(() => client.execute({ ...meta(), kind: 'UI_READ_ANALYSIS_JOBS', projectId, limit: 100 }))
    report.analysis = jobs.map(job => ({ id: job.id, status: job.status, errorCode: job.lastFailure?.code ?? null }))
    report.analysisOperationalPass = jobs.length > 0 && jobs.every(job => job.status === 'SUCCEEDED')
    await run('HELPER_NEXT_CONTEXT', { kind: 'HELPER', taskId: s.currentTask.id,
      message: 'Explain how the implemented retention behavior responds to reload and restart. Use stored context if relevant, but do not infer that I understood it from my earlier choice without a reason.' })
    const evidence = await read(() => client.execute({ ...meta(), kind: 'UI_READ_EVIDENCE_TRACE', projectId }))
    report.evidence = { conceptStates: evidence.concepts.map(c => c.state),
      userUnderstandingCount: evidence.concepts.flatMap(c => c.evidence).filter(e => e.kind === 'USER_UNDERSTANDING').length,
      personalization: evidence.personalization.map(p => ({ target: p.target, mode: p.mode, basisCount: p.basis.length })) }
    // A choice without rationale and a question are a negative control, not mastery.
    assert.equal(report.evidence.userUnderstandingCount, 0)
    const runsBefore = (await read(() => client.listRuns(projectId))).length
    const history = await read(() => client.listProjects())
    assert.ok(history.projects.some(item => item.project.id === projectId))
    assert.equal((await snapshot()).currentTask.id, s.currentTask.id)
    report.historyReadStartsNoRun = (await read(() => client.listRuns(projectId))).length === runsBefore
    if (!report.historyReadStartsNoRun) throw new Error('HISTORY_READ_STARTED_RUN')
    if (!report.analysisOperationalPass) throw new Error('ANALYSIS_NOT_SUCCEEDED')
    report.hostMemoryBytes = process.memoryUsage().rss
    report.stage = 'VERTICAL_COMPLETE'
    report.status = 'PASS'
    await save()
  } catch (error) {
    report.status = 'FAIL'
    report.errorCode = safe(error)
    await save()
  }
}
