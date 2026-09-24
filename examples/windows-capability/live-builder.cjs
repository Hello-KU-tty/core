const assert = require('node:assert/strict')
const { randomBytes, randomUUID, createHash } = require('node:crypto')
const { lstat, readFile, writeFile, mkdir } = require('node:fs/promises')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

exports.run = async (vscode, repository, root, workspace, beforeTurn, helperHost = null) => {
  const load = path => import(pathToFileURL(join(repository, path)).href)
  const { ApplicationService, WorkspacePathPolicy, redactSensitiveText } = await load('packages/application/dist/index.js')
  const { openSqliteStorage } = await load('packages/storage-sqlite/dist/index.js')
  const { WorkflowRuntime } = await load('packages/runtime/dist/index.js')
  const { createLocalServer } = await load('apps/local-backend/dist/server.js')
  const { createNativeCoreBinding } = await load('apps/local-backend/dist/native-core-binding.js')
  const { privateDirectory } = await load('apps/local-backend/dist/private-files.js')
  const { guardBuilderToolInput } = await load('packages/kiro-adapter/dist/builder-tool-guard.js')
  const fixtures = await load('packages/contracts/test/fixtures.ts')
  const schemas = await load('packages/contracts/dist/index.js')
  const { ids } = fixtures
  const data = await privateDirectory(join(root, 'native-builder'))
  const projectRoot = await privateDirectory(join(workspace, `scenario-${randomUUID()}`))
  const builderWorkspace = await privateDirectory(join(projectRoot, 'projects', ids.project))
  const helperWorkspace = helperHost?.folder ?? await privateDirectory(join(projectRoot, '__w1-helper'))
  await mkdir(join(builderWorkspace, 'src'))
  await writeFile(join(builderWorkspace, 'package.json'), JSON.stringify({ name: 'w1-event-fixture', private: true, type: 'module' }), { flag: 'wx' })
  const storage = await openSqliteStorage({ dataDirectory: data })
  storage.transaction(repo => {
    for (const [method, schema, fixture] of [
      ['appendProject', 'projectSchema', 'projectFixture'],
      ['appendDiscoverySession', 'discoverySessionSchema', 'discoverySessionFixture'],
      ['appendCandidate', 'projectCandidateRevisionSchema', 'candidateFixture'],
      ['appendCandidateRound', 'candidateRoundSchema', 'candidateRoundFixture'],
      ['appendDiscoveryFeedback', 'discoveryFeedbackSchema', 'discoveryFeedbackFixture'],
      ['appendLearningSpec', 'learningSpecRevisionSchema', 'draftLearningSpecFixture'],
      ['appendLearningSpec', 'learningSpecRevisionSchema', 'confirmedLearningSpecFixture'],
      ['appendTask', 'builderTaskSchema', 'builderTaskFixture'],
    ]) {
      let value = fixtures[fixture]
      if (fixture === 'projectFixture') value = { ...value, generatedWorkspacePath: `projects/${ids.project}` }
      if (fixture === 'builderTaskFixture') value = { ...value,
        title: 'W1 bounded tagged event validation', productGoal: 'Validate a tagged created/deleted event in TypeScript.',
        requirements: ['Only create src/native-event.ts and src/native-event.test.ts; use node:assert and node:test; no dependencies or UI.'],
        acceptanceCriteria: [{ key: 'valid_event', description: 'Valid created/deleted objects are accepted and malformed objects rejected by a node --test test.' }],
        expectedDecisionCategories: [], excludedWork: ['UI', 'Dependency installation', 'Network access', 'Other files'] }
      repo[method](schemas[schema].parse(value))
    }
  })
  const policy = await WorkspacePathPolicy.create(projectRoot)
  const application = new ApplicationService({ storage, workspacePolicy: policy })
  assert.equal(await policy.resolveProjectWorkspace(fixtures.projectFixture &&
    { ...fixtures.projectFixture, generatedWorkspacePath: `projects/${ids.project}` }, ids.correlation), builderWorkspace)
  const handlers = new Map()
  const runs = []
  let phase = helperHost ? 'BUILDER_REUSE' : 'BUILDER_CANCEL'
  let currentRunId
  let concurrentHelper
  let baseUrl
  const permission = async detail => {
    const input = detail.rawInput
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null
    const option = detail.options.find(item => item.kind === 'allow_once')
    if (!option) return null
    let toolName
    if (detail.kind === 'edit' && detail.nativeToolId === 'fs_write') {
      if (!['src/native-event.ts', 'src/native-event.test.ts'].includes(input.path) || typeof input.text !== 'string' ||
          Object.keys(input).some(key => !['path', 'text'].includes(key))) return null
      const existing = await lstat(join(builderWorkspace, input.path)).catch(error => { if (error.code === 'ENOENT') return null; throw error })
      if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) return null
      toolName = 'write'
    } else if (detail.kind === 'execute') {
      if (input.command !== 'node --test src/native-event.test.ts' ||
          ![undefined, '.', './', builderWorkspace].includes(input.cwd) || input.ignoreWarning === true ||
          input.warning != null || input.run_in_background === true ||
          Object.keys(input).some(key => !['command', 'cwd', 'timeout', 'ignoreWarning', 'warning', 'run_in_background'].includes(key))) return null
      toolName = 'shell'
    } else if (detail.kind === 'read') {
      if (!['src/native-event.ts', 'src/native-event.test.ts', 'package.json'].includes(input.path)) return null
      toolName = 'read'
    } else return null
    const checked = await guardBuilderToolInput({ toolName, input: { ...input, cwd: builderWorkspace }, cwd: builderWorkspace }, builderWorkspace)
    return checked.allowed ? option.optionId : null
  }
  const instanceId = randomUUID()
  const runtime = new WorkflowRuntime({ application, instanceId, agents: { invoke: async request => {
    assert.ok(['BUILDER', 'HELPER'].includes(request.mode))
    const role = request.mode
    const ownPhase = phase
    const toolNames = role === 'BUILDER' ? ['get_builder_task', 'update_build_context'] : ['get_helper_context']
    const scope = { projectId: request.projectId, taskId: request.taskId, correlationId: request.correlationId }
    const binding = createNativeCoreBinding({ application, role, ...scope, toolNames })
    handlers.set(binding.path, binding.handler)
    const descriptor = join(data, `${randomUUID()}.json`)
    await writeFile(descriptor, JSON.stringify({ role, ...scope, workspace: builderWorkspace,
      url: baseUrl + binding.path, authorization: binding.authorization, toolNames }), { mode: 0o600, flag: 'wx' })
    const revoke = () => binding.revoke()
    request.signal.addEventListener('abort', revoke, { once: true })
    let result
    let measured
    try {
      let message = request.message
      if (role === 'HELPER') {
        const context = await application.executeAgent('HELPER', { schemaVersion: 1, kind: 'HELPER_GET_CONTEXT',
          actor: { kind: 'AGENT', role: 'HELPER' }, ...scope, question: request.helperQuestion, relatedConceptNames: [] })
        assert.equal(context.success, true)
        message += '\nCore already executed get_helper_context. Validated context: ' + JSON.stringify(context.data)
      }
      measured = await require('./native-metadata.cjs').probe(vscode,
        role === 'HELPER' && helperHost ? helperHost.folder : workspace, {
        role, name: `vibe-w1-${role.toLowerCase()}-${randomUUID().slice(0, 8)}`,
        sessionWorkspace: role === 'BUILDER' ? builderWorkspace : helperWorkspace,
        rolePrompt: await readFile(join(repository, `docs/agent-prompts/${role.toLowerCase()}.md`), 'utf8'),
        message, beforeTurn, signal: request.signal, permission,
        allowMcp: role === 'BUILDER', allowBuilder: role === 'BUILDER', toolNames,
        ...(role === 'BUILDER' ? { configuration: {
          tools: ['read', 'write', 'shell', ...toolNames.map(tool => `@vibe-native-core/${tool}`)],
          mcpServers: { 'vibe-native-core': { command: process.execPath,
            args: [join(repository, 'scripts/native-core-stdio-bridge.mjs'), descriptor, builderWorkspace],
            env: { ELECTRON_RUN_AS_NODE: '1' }, timeout: 60000 } },
          permissions: { rules: [
            ...toolNames.map(tool => ({ capability: 'mcp', match: [`vibe-native-core/${tool}`], effect: 'allow' })),
            ...['fs_read', 'fs_write', 'shell'].map(capability => ({ capability, effect: 'ask' })),
            { capability: 'web_search', effect: 'deny' },
          ] },
        } } : {}),
        onEvent: request.onEvent, redact: text => redactSensitiveText(text, builderWorkspace),
        onPromptStart: () => {
          if (ownPhase.endsWith('_CANCEL')) setTimeout(() => { void runtime.cancel(currentRunId) }, 150)
          else if (role === 'BUILDER' && ownPhase === 'BUILDER_REUSE') {
            if (helperHost) {
              concurrentHelper = (async () => {
                phase = 'HELPER_CANCEL'
                const cancelled = await start('HELPER', 'Explain the difference between TypeScript unions and intersections in detail.')
                assert.equal(cancelled.status, 'CANCELLED')
                phase = 'HELPER_REUSE'
                const reused = await start('HELPER', 'Why does a tagged union help this task? Answer in under 200 characters.')
                assert.equal(reused.status, 'SUCCEEDED')
                return [cancelled, reused]
              })()
              void concurrentHelper.catch(() => {})
            } else concurrentHelper = runtime.start({ kind: 'HELPER', projectId: ids.project, taskId: ids.task,
              idempotencyKey: `idem_${randomUUID()}`, message: 'Why does a tagged union help this task? Answer in under 200 characters.' })
          }
        },
        onComplete: value => { result = value },
        record: async () => ({ coreContextVersion: storage.repository.readBuilderTaskAggregate(ids.project, ids.task)?.liveContext?.contextVersion ?? 0 }),
      })
      runs.push({ phase: ownPhase, role, native: measured })
      if (!['PASS', 'CANCELLED'].includes(measured.status)) throw new Error('NATIVE_GATE_FAILED')
      if (!result) throw new Error('NATIVE_TURN_NOT_COMPLETED')
      return result
    } finally {
      request.signal.removeEventListener('abort', revoke)
      binding.revoke()
      await writeFile(descriptor, JSON.stringify({ status: 'REVOKED' }), { mode: 0o600 })
      const rejected = await fetch(baseUrl + binding.path, { method: 'POST', headers: { Authorization: binding.authorization, 'Content-Type': 'application/json' }, body: '{}' })
      if (measured) measured.revokedStatus = rejected.status
      assert.equal(rejected.status, 401)
      await binding.handler.close()
      handlers.delete(binding.path)
    }
  } } })
  const server = createLocalServer({ application, runtime, token: randomBytes(32).toString('hex'), instanceId, mcpHandlers: handlers })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  baseUrl = `http://127.0.0.1:${server.address().port}`
  const wait = async id => {
    const until = Date.now() + 155000
    while (['ACCEPTED', 'RUNNING'].includes(runtime.get(id).status)) {
      if (Date.now() > until) { await runtime.cancel(id); throw new Error('CORE_RUN_TIMEOUT') }
      await new Promise(done => setTimeout(done, 100))
    }
    return runtime.get(id)
  }
  const start = async (role, message) => {
    const run = await runtime.start({ kind: role, projectId: ids.project, taskId: ids.task,
      ...(role === 'BUILDER' ? { expectedTaskRevision: 1 } : {}), idempotencyKey: `idem_${randomUUID()}`, message })
    currentRunId = run.id
    const final = await wait(run.id)
    return { id: final.id, status: final.status, outcome: final.outcome, errorCode: final.errorCode }
  }
  const report = { status: 'IN_PROGRESS', runs, coreRuns: [] }
  try {
    if (!helperHost) {
      report.coreRuns.push(await start('BUILDER', 'Read get_builder_task and explain the plan. Do not write or run shell yet; this is a cancellation check.'))
      assert.equal(report.coreRuns.at(-1).status, 'CANCELLED')
    }
    phase = 'BUILDER_REUSE'
    report.coreRuns.push(await start('BUILDER', 'Perform only the bounded W1 Task. Read get_builder_task. Write src/native-event.ts and src/native-event.test.ts (node:test and node:assert/strict, import ./native-event.ts). Run exactly node --test src/native-event.test.ts once. Then update_build_context with the real test outcome. Do not edit other files, install dependencies, or add UI. This is a fixture capability slice, not product completion.'))
    assert.equal(report.coreRuns.at(-1).status, 'SUCCEEDED')
    assert.ok(concurrentHelper)
    if (helperHost) report.coreRuns.push(...await concurrentHelper)
    else {
      const helperRun = await concurrentHelper
      const helperFinal = await wait(helperRun.id)
      report.coreRuns.push({ id: helperFinal.id, status: helperFinal.status, outcome: helperFinal.outcome })
      assert.equal(helperFinal.status, 'SUCCEEDED')
    }
    const builderResult = runs.find(item => item.phase === 'BUILDER_REUSE' && item.role === 'BUILDER').native.builder
    const helperResult = runs.find(item => item.phase === (helperHost ? 'HELPER_REUSE' : 'BUILDER_REUSE') && item.role === 'HELPER').native.helper
    if (helperHost) {
      assert.notEqual(runs.find(item => item.role === 'BUILDER').native.windowId, runs.find(item => item.role === 'HELPER').native.windowId)
      report.separateWindows = true
    }
    report.helperDuringBuilder = helperResult.started + helperResult.firstChunkMs < builderResult.finished && builderResult.started + builderResult.firstChunkMs < helperResult.finished
    assert.equal(report.helperDuringBuilder, true)
    report.files = []
    for (const path of ['src/native-event.ts', 'src/native-event.test.ts']) {
      const contents = await readFile(join(builderWorkspace, path))
      report.files.push({ path, bytes: contents.length, sha256: createHash('sha256').update(contents).digest('hex') })
    }
    const tested = await promisify(execFile)(process.execPath, ['--test', '--test-reporter=tap', 'src/native-event.test.ts'], {
      cwd: builderWorkspace, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, timeout: 10000,
    })
    report.independentTest = { exitCode: 0, passed: /# fail 0\b/.test(tested.stdout) }
    assert.equal(report.independentTest.passed, true)
    if (!helperHost) {
      phase = 'HELPER_CANCEL'
      report.coreRuns.push(await start('HELPER', 'Explain the difference between every TypeScript union and intersection type in detail.'))
      assert.equal(report.coreRuns.at(-1).status, 'CANCELLED')
      phase = 'HELPER_REUSE'
      report.coreRuns.push(await start('HELPER', 'Why validate unknown input before narrowing? Answer in under 200 characters.'))
      assert.equal(report.coreRuns.at(-1).status, 'SUCCEEDED')
    }
    report.status = 'PASS'
  } catch (error) {
    report.status = 'FAIL'
    report.failure = /^[A-Z_]{1,100}$/.test(error.message) ? error.message : 'ASSERTION_FAILED'
  } finally {
    await runtime.close()
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    assert.deepEqual(storage.checkIntegrity(), { quickCheck: 'ok', foreignKeyViolations: 0 })
    storage.close()
  }
  return report
}
