import { resolve, join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, realpath, mkdtemp, cp } from 'node:fs/promises'
import { connectLocalCore } from '../packages/frontend-client/dist/node.js'
import { entityId, uiMetadata } from '../packages/frontend-client/dist/index.js'

const client = await connectLocalCore(resolve(process.argv[2] ?? '.data/local/connection.json'))
const projectId = process.argv[3]
if (!projectId) throw new Error('Pass the synthetic Project ID from test-live-local.mjs.')
const print = (value) => console.log(JSON.stringify({ projectId, ...value }))
async function snapshot() {
  return client.restoreProject(projectId)
}
async function turn(kind, message, decisionId) {
  const s = await snapshot()
  const run = await client.startRun({
    kind,
    projectId,
    taskId: s.currentTask.id,
    idempotencyKey: entityId('idem'),
    message,
    ...(kind === 'BUILDER'
      ? { expectedTaskRevision: s.currentTask.revision }
      : decisionId
        ? { decisionId }
        : {}),
  })
  const counts = { text: 0, tools: 0 }
  const result = await client.watchRun(run.id, (e) => {
    if (e.kind === 'TEXT') counts.text++
    if (e.kind === 'TOOL') counts.tools++
  })
  print({
    role: kind,
    status: result.status,
    outcome: result.outcome,
    errorCode: result.errorCode,
    ...counts,
  })
  if (result.status !== 'SUCCEEDED') throw new Error(result.errorCode ?? 'RUN_FAILED')
}
try {
  let s = await snapshot()
  if (
    s.project.learningGoal !== 'TypeScript discriminated unions and exhaustive UI state transitions'
  )
    throw new Error('SYNTHETIC_PROJECT_REQUIRED')
  if (s.currentTask.status === 'PENDING')
    await turn(
      'BUILDER',
      'This is a synthetic live integration test. Start the confirmed Task, inspect its real context and request the first meaningful blocking product Decision from expectedDecisions. End this turn after the Decision so the synthetic user can ask Helper. Do not select for the user or claim completion.',
    )
  s = await snapshot()
  const decision = s.pendingDecisions[0]
  if (decision) {
    const before = s.liveContext?.contextVersion
    await turn(
      'HELPER',
      '이 선택이 이 프로젝트에서 실제로 무엇을 바꾸는지, 선택지의 차이와 추천 이유를 설명해줘.',
      decision.id,
    )
    s = await snapshot()
    if (s.liveContext?.contextVersion !== before) throw new Error('HELPER_CHANGED_BUILDER_CONTEXT')
    await client.execute({
      ...uiMetadata(decision.correlationId),
      kind: 'UI_RESOLVE_DECISION',
      idempotencyKey: entityId('idem'),
      resolution: {
        schemaVersion: 1,
        id: entityId('decision_resolution'),
        projectId,
        taskId: decision.taskId,
        decisionId: decision.id,
        correlationId: decision.correlationId,
        expectedContextVersion: s.liveContext.contextVersion,
        selectionKind: 'RECOMMENDATION',
        selectedOptionId: decision.recommendedOptionId,
        helperUsed: true,
        resolvedAt: new Date().toISOString(),
        source: { kind: 'USER' },
        redactionStatus: 'NOT_REQUIRED',
      },
    })
    print({ phase: 'HELPER_READ_ONLY_AND_USER_RESOLUTION', contextUnchanged: true })
  } else if (s.decisions.length === 0) throw new Error('NO_DURABLE_DECISION')
  s = await snapshot()
  if (s.currentTask.status !== 'COMPLETED')
    await turn(
      'BUILDER',
      'The synthetic user has accepted the recommendation. Read and apply the Decision result, then finish the confirmed Task as a tiny real local TypeScript browser app. Add an actual TypeScript compile/typecheck build script and run real tests. Use a package.json with type module, compiled JS entry, and the documented .vibe-helper/result.json loopback manifest. Keep source, build output and tests in the generated workspace. Do not add accounts, external services or deployment. Record checkpoint evidence and complete_task only after acceptance criteria and tests pass. If further user input is essential, stop at its Decision.',
    )
  s = await snapshot()
  if (s.currentTask.status !== 'COMPLETED' || !s.completionReport)
    throw new Error('TASK_NOT_COMPLETED')
  // Independent validation, never an Agent-authored success claim. Only this
  // synthetic test runner executes generated scripts; there is no shell API.
  const binding = await client.execute({
    ...uiMetadata(s.currentTask.correlationId),
    kind: 'UI_PREPARE_BUILDER_SESSION',
    purpose: 'WORKSPACE_VIEW',
    projectId,
    taskId: s.currentTask.id,
  })
  const workspace = await realpath(binding.workspaceDirectory)
  const pkg = JSON.parse(await readFile(resolve(workspace, 'package.json'), 'utf8'))
  if (!pkg.scripts?.build || !pkg.scripts?.test) throw new Error('BUILD_AND_TEST_SCRIPTS_REQUIRED')
  const verificationRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-generated-verify-'))
  const cleanWorkspace = join(verificationRoot, 'project')
  await cp(workspace, cleanWorkspace, {
    recursive: true,
    filter: (source) =>
      !relative(workspace, source)
        .split(sep)
        .some((part) => ['node_modules', 'dist', '.kiro', '.git', 'npm-cache'].includes(part)),
  })
  const execute = promisify(execFile)
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const options = {
    cwd: cleanWorkspace,
    timeout: 60_000,
    maxBuffer: 1_048_576,
    shell: process.platform === 'win32',
    env: {
      PATH: process.env.PATH,
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      ...(process.env.TEMP ? { TEMP: process.env.TEMP } : {}),
      ...(process.env.TMP ? { TMP: process.env.TMP } : {}),
      NPM_CONFIG_CACHE: join(verificationRoot, 'npm-cache'),
    },
  }
  try {
    await execute(npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], options)
  } catch {
    throw new Error('INDEPENDENT_FROZEN_INSTALL_FAILED')
  }
  print({
    phase: 'ISOLATED_GENERATED_PROJECT_INSTALL',
    status: 'PASSED',
    directory: verificationRoot,
  })
  for (const script of ['build', 'test']) {
    try {
      await execute(npm, ['run', script], options)
    } catch {
      throw new Error(`INDEPENDENT_${script.toUpperCase()}_FAILED`)
    }
    print({ phase: 'INDEPENDENT_VALIDATION', script, status: 'PASSED' })
  }
  const result = await client.execute({
    ...uiMetadata(s.project.correlationId),
    kind: 'UI_LAUNCH_RESULT',
    projectId,
    idempotencyKey: entityId('idem'),
  })
  if (result.status !== 'RUNNING' || !(await fetch(result.url)).ok)
    throw new Error('RESULT_NOT_RUNNING')
  print({
    phase: 'BUILDER_COMPLETE_AND_RESULT_HEALTHY',
    taskRevision: s.currentTask.revision,
    resultStatus: result.status,
  })
  const deadline = Date.now() + 100_000
  let analysisFinished = false
  let analysisFailures = 0
  while (Date.now() < deadline) {
    const jobs = await client.execute({
      ...uiMetadata(),
      kind: 'UI_READ_ANALYSIS_JOBS',
      projectId,
      limit: 100,
    })
    if (jobs.length > 0 && jobs.every((j) => !['PENDING', 'RUNNING'].includes(j.status))) {
      print({
        phase: 'ANALYSIS_DURABLE',
        succeeded: jobs.filter((j) => j.status === 'SUCCEEDED').length,
        failed: jobs.filter((j) => j.status === 'FAILED').map((j) => j.lastFailure?.code),
      })
      if (!jobs.some((j) => j.status === 'SUCCEEDED')) throw new Error('NO_SUCCESSFUL_ANALYSIS')
      analysisFailures = jobs.filter((j) => j.status === 'FAILED').length
      analysisFinished = true
      break
    }
    await new Promise((done) => setTimeout(done, 2_000))
  }
  if (!analysisFinished) throw new Error('ANALYSIS_NOT_FINISHED_BEFORE_DEADLINE')
  print({
    status: analysisFailures ? 'FLOW_VERIFIED_WITH_ANALYSIS_FAILURES' : 'COMPLETE',
    historyContainsProject: (await client.listProjects()).projects.some(
      (p) => p.project.id === projectId,
    ),
  })
} catch (error) {
  print({ status: 'FAILED', code: error.code ?? error.message })
  process.exitCode = 1
}
