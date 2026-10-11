// Development measurement (K15): time from a Kiro chat Task finish to stored Next Move suggestions
// while the Evidence Analyst runs at the same time, through the product's own Core, WorkflowRuntime
// workers and kiro-cli runner. Synthetic fixture data only; needs a logged-in kiro-cli and spends
// model credits. Usage: measure-next-move.mjs <out.json> [scenario-id,...]
// With VIBE_MEASURE_CREDITS=1 each stored round's context is run once more through
// `kiro-cli chat --output-format stream-json`, which reports metered credits (the ACP runner
// the product uses does not).
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LocalAgentHost } from '../apps/local-backend/dist/agent-host.js'
import { ApplicationService, WorkspacePathPolicy } from '../packages/application/dist/index.js'
import * as schemas from '../packages/contracts/dist/index.js'
import * as fixtures from '../packages/contracts/test/fixtures.ts'
import {
  createNextMoveMessage,
  parseNextMoveResult,
} from '../packages/kiro-adapter/dist/next-move-agent.js'
import { privateDirectory, WorkflowRuntime } from '../packages/runtime/dist/index.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [outPath, only] = process.argv.slice(2)
if (!outPath) throw new Error('usage: measure-next-move.mjs <out.json> [scenario-id,...]')
const fixture = JSON.parse(
  await readFile(
    join(repository, 'tests/eval/fixtures/prompt-regressions/next-move-v1.4.0.json'),
    'utf8',
  ),
)
const selected = only ? new Set(only.split(',')) : null
const conversationId = 'conversation_00000000-0000-4000-8000-000000000901'
const limits = { title: 16, summary: 45, benefit: 35 }
const outsideLocal = /배포|결제|앱\s*스토어|API\s*키|클라우드|로그인 연동|소셜 로그인/u

const kiroCli = process.platform === 'win32' ? 'kiro-cli.exe' : 'kiro-cli'
const discoveryPrompt = (
  await readFile(join(repository, 'docs/agent-prompts/discovery.md'), 'utf8')
).replaceAll('\r\n', '\n')

/** One stream-json run of the same turn, for metered credits and model-only latency. */
async function meteredRun(message) {
  const workspace = await mkdtemp(join(tmpdir(), 'vibe-next-move-credits-'))
  const name = `vibe-helper-next-move-credits-${randomUUID()}`
  await mkdir(join(workspace, '.kiro', 'agents'), { recursive: true })
  await writeFile(
    join(workspace, '.kiro', 'agents', `${name}.json`),
    JSON.stringify({
      name,
      description: 'Next Move credit measurement',
      prompt: discoveryPrompt,
      model: 'claude-haiku-4.5',
      includeMcpJson: false,
      resources: [],
      tools: [],
      allowedTools: [],
    }),
  )
  const started = Date.now()
  const outcome = await new Promise((done, fail) => {
    const child = spawn(
      kiroCli,
      [
        'chat',
        '--agent',
        name,
        '--no-interactive',
        '--output-format',
        'stream-json',
        '--verbose',
        message,
      ],
      { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const out = []
    const timer = setTimeout(() => child.kill('SIGTERM'), 240_000)
    child.stdout.on('data', (chunk) => out.push(chunk))
    child.stderr.on('data', () => undefined)
    child.once('error', fail)
    child.once('close', (code) => {
      clearTimeout(timer)
      done({ code, stdout: Buffer.concat(out).toString('utf8') })
    })
  })
  let answer = ''
  let credits = 0
  for (const line of outcome.stdout.split(/\r?\n/u).filter(Boolean)) {
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    const update = event?.data?.update
    if (update?.sessionUpdate === 'agent_message_chunk' && update?.content?.type === 'text')
      answer += update.content.text
    for (const usage of event?.data?.meteringUsage ?? []) credits += Number(usage.value) || 0
  }
  let valid = false
  try {
    parseNextMoveResult(answer)
    valid = true
  } catch {}
  return { exitCode: outcome.code, ms: Date.now() - started, credits, valid }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const ok = async (promise) => {
  const result = await promise
  if (!result.success) throw new Error(JSON.stringify(result.error))
  return result.data
}

async function measureScenario(scenario) {
  const root = await mkdtemp(join(tmpdir(), `vibe-next-move-${scenario.id}-`))
  const workspacePath = `projects/${fixtures.ids.project}`
  await privateDirectory(join(root, 'workspaces', 'projects'))
  await privateDirectory(join(root, 'workspaces', workspacePath))
  const storage = await openSqliteStorage({ dataDirectory: join(root, 'data') })
  const policy = await WorkspacePathPolicy.create(join(root, 'workspaces'))
  const application = new ApplicationService({ storage, workspacePolicy: policy })
  storage.transaction((repo) => {
    repo.appendProject(
      schemas.projectSchema.parse({
        ...fixtures.projectFixture,
        ...scenario.project,
        generatedWorkspacePath: workspacePath,
      }),
    )
    repo.appendDiscoverySession(
      schemas.discoverySessionSchema.parse(fixtures.discoverySessionFixture),
    )
    repo.appendCandidate(schemas.projectCandidateRevisionSchema.parse(fixtures.candidateFixture))
    repo.appendCandidateRound(schemas.candidateRoundSchema.parse(fixtures.candidateRoundFixture))
    repo.appendDiscoveryFeedback(
      schemas.discoveryFeedbackSchema.parse(fixtures.discoveryFeedbackFixture),
    )
    repo.appendLearningSpec(
      schemas.learningSpecRevisionSchema.parse({
        ...fixtures.draftLearningSpecFixture,
        ...scenario.spec,
      }),
    )
    repo.appendLearningSpec(
      schemas.learningSpecRevisionSchema.parse({
        ...fixtures.confirmedLearningSpecFixture,
        ...scenario.spec,
      }),
    )
    repo.appendTask(
      schemas.builderTaskSchema.parse({
        ...fixtures.builderTaskFixture,
        title: scenario.task.title,
        productGoal: scenario.task.productGoal,
        requirements: [scenario.task.productGoal],
        acceptanceCriteria: [scenario.task.acceptance],
        expectedConcepts: scenario.task.expectedConcepts,
        excludedWork: [],
        status: 'ACTIVE',
      }),
    )
    repo.appendLiveContext(
      schemas.liveProjectContextSchema.parse({
        ...fixtures.liveContextFixture,
        checkpoint: 'TASK_STARTED',
        activeDecisionIds: [],
      }),
    )
  })
  // Same runner and models as the packaged backend: Discovery roles use the default model,
  // the Analyst prefers Sonnet 5.5 with Auto as fallback (apps/local-backend/src/main.ts).
  const host = new LocalAgentHost({
    application,
    policy,
    agentRoot: join(root, 'agents'),
    definitionsRoot: join(repository, 'agents'),
    guardPath: join(repository, 'packages/kiro-adapter/dist/builder-tool-guard-node.js'),
    executable: process.platform === 'win32' ? 'kiro-cli.exe' : 'kiro-cli',
    model: 'claude-haiku-4.5',
    builderInHostChat: true,
    promptDirectory: join(repository, 'docs/agent-prompts'),
    roleModels: { EVIDENCE_ANALYST: ['claude-sonnet-5.5', 'auto'] },
  })
  host.setBaseUrl('http://127.0.0.1:9')
  const runtime = new WorkflowRuntime({ application, agents: host, instanceId: randomUUID() })
  runtime.startAnalystWorker()
  runtime.startNextMoveWorker()

  const key = () => `idem_${randomUUID()}`
  const ui = { schemaVersion: 1, correlationId: fixtures.ids.correlation, actor: { kind: 'UI' } }
  const builder = (taskId) => ({
    schemaVersion: 1,
    correlationId: fixtures.ids.correlation,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    projectId: fixtures.ids.project,
    taskId,
  })
  const say = (message) => {
    return ok(
      application.executeUi({
        ...ui,
        kind: 'UI_RECORD_CHAT_MESSAGE',
        idempotencyKey: key(),
        projectId: fixtures.ids.project,
        taskId: fixtures.ids.task,
        conversationId,
        message,
      }),
    )
  }
  const finish = (taskId, report, acceptanceKeys) =>
    ok(
      application.executeAgent('BUILDER', {
        ...builder(taskId),
        kind: 'BUILDER_CHAT_FINISH_TASK',
        idempotencyKey: key(),
        report: {
          implemented: report.implemented,
          acceptance: acceptanceKeys.map((criterion) => ({ key: criterion, passed: true })),
          checks: [{ name: 'tests', passed: true, summary: 'All tests passed.' }],
          ...(report.remaining.length > 0 ? { remaining: report.remaining } : {}),
          ...(report.limitations.length > 0 ? { limitations: report.limitations } : {}),
        },
      }),
    )
  const readView = () =>
    ok(application.executeUi({ ...ui, kind: 'UI_READ_NEXT_MOVE', projectId: fixtures.ids.project }))
  const readAnalysis = () =>
    ok(
      application.executeUi({
        ...ui,
        kind: 'UI_READ_ANALYSIS_JOBS',
        projectId: fixtures.ids.project,
        limit: 50,
      }),
    )

  async function round(label, taskId, report, acceptanceKeys) {
    const before = new Set((await readAnalysis()).map((job) => job.id))
    await finish(taskId, report, acceptanceKeys)
    const started = Date.now()
    let nextMoveMs = null
    let analystMs = null
    let view = null
    while (Date.now() - started < 300_000) {
      view = await readView()
      if (nextMoveMs === null && (view.status === 'READY' || view.status === 'FAILED'))
        nextMoveMs = Date.now() - started
      const created = (await readAnalysis()).filter((job) => !before.has(job.id))
      if (
        analystMs === null &&
        created.length > 0 &&
        created.every((job) => job.status === 'SUCCEEDED' || job.status === 'FAILED')
      )
        analystMs = Date.now() - started
      if (nextMoveMs !== null && analystMs !== null) break
      await sleep(200)
    }
    const jobs = (await readAnalysis()).filter((job) => !before.has(job.id))
    const moves = view?.moves ?? []
    let metered = null
    if (process.env.VIBE_MEASURE_CREDITS === '1' && view?.status === 'READY') {
      const job = storage.repository.readNextMoveJobForTask(fixtures.ids.project, taskId)
      const context = await ok(
        application.executeNextMove({
          schemaVersion: 1,
          correlationId: fixtures.ids.correlation,
          actor: { kind: 'KIRO_ADAPTER' },
          kind: 'NEXT_MOVE_GET_CONTEXT',
          projectId: job.projectId,
          nextMoveJobId: job.id,
          expectedJobRevision: job.revision,
        }),
      )
      metered = await meteredRun(createNextMoveMessage(context))
    }
    return {
      metered,
      label,
      status: view?.status ?? 'UNKNOWN',
      failureCode: view?.failureCode ?? null,
      nextMoveMs,
      analystMs,
      // True when the suggestions were stored before the Analyst finished.
      beforeAnalyst: nextMoveMs !== null && (analystMs === null || nextMoveMs <= analystMs),
      analystJobs: jobs.map((job) => ({ status: job.status, attempt: job.attempt })),
      moves,
      checks: {
        count: moves.length,
        distinctTitles: new Set(moves.map((move) => move.title)).size === moves.length,
        overLimit: moves.flatMap((move) =>
          Object.entries(limits)
            .filter(([field, max]) => [...move[field]].length > max)
            .map(([field]) => `${move.number}.${field}`),
        ),
        outsideLocal: moves
          .filter((move) => outsideLocal.test(`${move.title} ${move.summary} ${move.benefit}`))
          .map((move) => move.number),
        korean: moves.every((move) => /[가-힣]/u.test(move.title)),
      },
    }
  }

  try {
    for (const message of scenario.learnerMessages) await say(message)
    const rounds = [
      await round('first', fixtures.ids.task, scenario.report, [scenario.task.acceptance.key]),
    ]
    if (scenario.secondRound && rounds[0].status === 'READY') {
      const chosen = rounds[0].moves[0]
      await say(scenario.followUp.learnerMessage)
      // What a Builder does after the learner picks: a PLAN note with the suggestion number.
      await ok(
        application.executeAgent('BUILDER', {
          ...builder(fixtures.ids.task),
          kind: 'BUILDER_CHAT_SAVE_PROGRESS',
          idempotencyKey: key(),
          note: { kind: 'PLAN', summary: `Build: ${chosen.title}`, nextMove: chosen.number },
        }),
      )
      const followUp = storage.repository.readLatestTaskForProject(fixtures.ids.project)
      const second = await round('second', followUp.id, scenario.followUp.report, [
        'user_request',
        'verified_outcome',
      ])
      second.checks.repeatsChosen = second.moves.some((move) => move.title === chosen.title)
      second.chosenBefore = chosen.title
      rounds.push(second)
    }
    return { id: scenario.id, personalNeed: scenario.personalNeed, rounds }
  } finally {
    await runtime.close()
    storage.close()
  }
}

const results = []
for (const scenario of fixture.scenarios) {
  if (selected && !selected.has(scenario.id)) continue
  const result = await measureScenario(scenario)
  results.push(result)
  await writeFile(
    outPath,
    `${JSON.stringify({ promptVersion: fixture.promptVersion, results }, null, 2)}\n`,
  )
  for (const item of result.rounds)
    process.stdout.write(
      `${scenario.id} ${item.label}: ${item.status} nextMove=${item.nextMoveMs}ms analyst=${item.analystMs}ms ${JSON.stringify(item.checks)}\n`,
    )
}
