// Actual frontend controller/port + authenticated HTTP/SSE + disk SQLite/Core.
// Agent responses are synthetic contract fixtures, not native/model quality claims.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { createLocalServer } from '../apps/local-backend/dist/server.js'
import { ApplicationService, WorkspacePathPolicy } from '../packages/application/dist/index.js'
import { entityId, LocalCoreClient } from '../packages/frontend-client/dist/index.js'
import { WorkflowRuntime } from '../packages/runtime/dist/workflow-runtime.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'

const program = resolve(process.argv[2] ?? '../program')
await mkdir(resolve('.data/frontend-handoff'), { recursive: true })
const root = await mkdtemp(join(resolve('.data/frontend-handoff'), 'follow-up-'))
const require = createRequire(import.meta.url)
for (const [entry, name] of [
  [join(program, 'src/adapter/agent/managed-agent-port.ts'), 'port'],
  [join(program, 'src/core/agent/agent-controller.ts'), 'controller'],
  [resolve('packages/contracts/test/fixtures.ts'), 'fixtures'],
]) {
  await build({
    entryPoints: [entry],
    outfile: join(root, `${name}.cjs`),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
  })
}
const { ManagedAgentPort } = require(join(root, 'port.cjs'))
const { AgentSurfaceController } = require(join(root, 'controller.cjs'))
const f = require(join(root, 'fixtures.cjs'))
const workspaceRoot = join(root, 'workspaces')
const workspace = join(workspaceRoot, f.projectFixture.generatedWorkspacePath)
await mkdir(workspace, { recursive: true })
await writeFile(join(workspace, 'user-source.ts'), 'synthetic original source\n')
const storage = await openSqliteStorage({ dataDirectory: join(root, 'db') })
storage.transaction((r) => {
  for (const [method, fixture] of [
    ['appendProject', 'projectFixture'],
    ['appendDiscoverySession', 'discoverySessionFixture'],
    ['appendCandidate', 'candidateFixture'],
    ['appendCandidateRound', 'candidateRoundFixture'],
    ['appendDiscoveryFeedback', 'discoveryFeedbackFixture'],
    ['appendLearningSpec', 'draftLearningSpecFixture'],
    ['appendLearningSpec', 'confirmedLearningSpecFixture'],
    ['appendTask', 'builderTaskFixture'],
  ])
    r[method](f[fixture])
  r.appendTask({ ...f.builderTaskFixture, revision: 2, status: 'COMPLETED' })
  r.appendCompletionReport(f.completionReportFixture)
})
const application = new ApplicationService({
  storage,
  workspacePolicy: await WorkspacePathPolicy.create(workspaceRoot),
})
const counts = { BUILDER: 0, HELPER: 0 }
let agentFailure = null
const reports = [f.completionReportFixture]
const agentCommand = async (role, command) => {
  const result = await application.executeAgent(role, {
    schemaVersion: 1,
    actor: { kind: 'AGENT', role },
    correlationId: f.ids.correlation,
    ...command,
  })
  assert.equal(result.success, true, JSON.stringify(result))
  return result.data
}
let previousTask = f.builderTaskFixture.id
const instanceId = randomUUID()
const runtime = new WorkflowRuntime({
  application,
  instanceId,
  agents: {
    async invoke(request) {
      try {
        counts[request.mode]++
        // Ensure duplicate clicks overlap before the synthetic turn settles.
        await new Promise((done) => setTimeout(done, 40))
        if (request.mode === 'HELPER') {
          return {
            text: 'Synthetic explanation of the existing source; no learner understanding asserted.',
            stopReason: 'end_turn',
          }
        }
        assert.equal(request.mode, 'BUILDER')
        let context = await agentCommand('BUILDER', {
          kind: 'BUILDER_GET_TASK',
          projectId: request.projectId,
          taskId: request.taskId,
        })
        assert.equal(context.previousCompletionReport.taskId, previousTask)
        assert.deepEqual(context.previousCompletionReport, reports.at(-1))
        assert.equal(context.task.status, 'PENDING')
        assert.equal(context.task.sequence, counts.BUILDER + 1)
        assert.equal(context.task.finalUpgrade, undefined)
        await agentCommand('BUILDER', {
          kind: 'BUILDER_START_TASK',
          idempotencyKey: entityId('idem'),
          projectId: request.projectId,
          taskId: request.taskId,
          expectedTaskRevision: context.task.revision,
        })
        context = await agentCommand('BUILDER', {
          kind: 'BUILDER_GET_TASK',
          projectId: request.projectId,
          taskId: request.taskId,
        })
        assert.equal(
          await readFile(join(workspace, 'user-source.ts'), 'utf8'),
          'synthetic original source\n',
        )
        const contextId = entityId('context')
        for (const [index, checkpoint] of ['TASK_STARTED', 'TASK_COMPLETED'].entries()) {
          await agentCommand('BUILDER', {
            kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
            idempotencyKey: entityId('idem'),
            context: {
              ...f.liveContextFixture,
              id: contextId,
              taskId: request.taskId,
              checkpoint,
              contextVersion: index + 1,
              expectedPreviousVersion: index,
              stage: 'Synthetic follow-up inspected',
              currentGoal: context.task.productGoal,
              recentChanges: ['No source mutation required by this synthetic inspection.'],
              activeDecisionIds: [],
              activeConceptNames: [],
              relatedFiles: [],
              nextActions: [],
              updatedAt: new Date().toISOString(),
            },
          })
        }
        const report = {
          ...f.completionReportFixture,
          id: entityId('completion_report'),
          taskId: request.taskId,
          expectedTaskRevision: context.task.revision,
          implementedFeatures: ['Synthetic source inspection complete.'],
          acceptanceResults: context.task.acceptanceCriteria.map((criterion) => ({
            criterionKey: criterion.key,
            status: 'PASSED',
            evidence: [],
          })),
          validationResults: [
            {
              name: 'Synthetic source read',
              status: 'PASSED',
              summary: 'Read and compared the preserved fixture source.',
            },
          ],
          conceptUsage: [],
          appliedDecisionIds: [],
          codeReferences: [],
          diffReferences: [],
          specDeviations: [],
          remainingIssues: [],
          limitations: ['Synthetic contract fixture; no model run.'],
          completedAt: new Date().toISOString(),
        }
        await agentCommand('BUILDER', {
          kind: 'BUILDER_COMPLETE_TASK',
          idempotencyKey: entityId('idem'),
          report,
        })
        reports.push(report)
        previousTask = request.taskId
        return {
          text: 'Synthetic follow-up finished through real Core contracts.',
          stopReason: 'end_turn',
        }
      } catch (error) {
        agentFailure = error
        throw error
      }
    },
  },
})
const token = randomBytes(32).toString('hex')
const server = createLocalServer({ application, runtime, token, instanceId })
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const client = new LocalCoreClient({
  protocolVersion: 1,
  backendInstanceId: instanceId,
  baseUrl: `http://127.0.0.1:${server.address().port}`,
  token,
})
const worker = {
  getStatus: () => 'WORKER_CONNECTED',
  listUserInputs: () => [],
  subscribeStatus: () => () => {},
  subscribeUserInputs: () => () => {},
}
const makeController = () =>
  new AgentSurfaceController({
    port: new ManagedAgentPort(client, worker),
    globalState: {
      get: () => f.ids.project,
      update: async (_key, value) => assert.equal(value, f.ids.project),
    },
    onChange: () => {},
    openFolder: async () => assert.fail('Unexpected folder open'),
    openExternal: async () => assert.fail('Unexpected external open'),
  })
let controller = makeController()
try {
  for (const goal of [
    '접속할 수 있게 실행 방법을 설명해 주세요.',
    'Explain the current implementation.',
    '다음 수정에 앞서 기존 동작을 다시 설명해 주세요.',
  ]) {
    await controller.recover()
    assert.equal(controller.getViewModel().builder.phase, 'TASK_COMPLETED')
    const before = await client.restoreProject(f.ids.project)
    await controller.startHelper({
      message: 'Explain the completed implementation.',
      origin: 'FREE_TEXT',
    })
    assert.equal(
      controller.getViewModel().helper.phase,
      'RECORDED',
      JSON.stringify(controller.getViewModel().helper),
    )
    assert.equal((await client.restoreProject(f.ids.project)).currentTask.id, before.currentTask.id)
    await Promise.all([controller.startBuilder(goal), controller.startBuilder(goal)])
    if (agentFailure) throw agentFailure
    const after = await client.restoreProject(f.ids.project)
    assert.equal(
      controller.getViewModel().builder.phase,
      'TASK_COMPLETED',
      JSON.stringify(controller.getViewModel().builder),
    )
    assert.equal(after.currentTask.sequence, before.currentTask.sequence + 1)
    assert.equal(after.currentTask.productGoal, goal)
    assert.equal(after.project.generatedWorkspacePath, before.project.generatedWorkspacePath)
    assert.equal(after.completionReport.taskId, after.currentTask.id)
    for (const report of reports) {
      assert.deepEqual(
        storage.repository.readBuilderTaskAggregate(f.ids.project, report.taskId).completionReport,
        report,
      )
    }
    controller.dispose()
    controller = makeController()
    await controller.recover()
    assert.equal((await client.restoreProject(f.ids.project)).currentTask.id, after.currentTask.id)
  }
  assert.deepEqual(counts, { BUILDER: 3, HELPER: 3 })
  assert.equal(
    await readFile(join(workspace, 'user-source.ts'), 'utf8'),
    'synthetic original source\n',
  )
  const receipt = {
    result: 'PASS',
    provenance: 'SYNTHETIC_AGENT_WITH_REAL_FRONTEND_HTTP_SSE_SQLITE',
    modelCalls: 0,
    counts,
    cases: [
      'three consecutive follow-ups after completion',
      'Helper remains usable on every completed Task',
      'duplicate clicks start one run',
      'completed reports and workspace source preserved',
      'panel reload/read creates no new Task',
      'previous completion supplied as Agent-authored context',
    ],
  }
  await writeFile(
    resolve('dist/builder-follow-up-receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
  )
  console.log(JSON.stringify(receipt))
} finally {
  controller.dispose()
  await runtime.close()
  server.closeAllConnections()
  await new Promise((done) => server.close(done))
  storage.close()
}
