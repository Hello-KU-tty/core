import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import {
  builderTaskSchema,
  candidateRoundSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  LOCAL_PROTOCOL_VERSION,
  learningSpecRevisionSchema,
  type LocalRunEvent,
  projectCandidateRevisionSchema,
  projectSchema,
} from '@vibe-helper/contracts'
import { type AgentInvocation, WorkflowRuntime } from '@vibe-helper/runtime'
import { openSqliteStorage } from '@vibe-helper/storage-sqlite'
import {
  candidateFixture,
  candidateRoundFixture,
  confirmedLearningSpecFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  builderTaskFixture,
  ids,
  liveContextFixture,
  projectFixture,
} from '../../../packages/contracts/test/fixtures.js'
import {
  classifyBuilderTurn,
  createDecisionResolutionRequest,
  entityId,
  LocalCoreClient,
  projectRunEvent,
  uiMetadata,
} from '../../../packages/frontend-client/src/index.js'
import { createLocalServer } from '../src/server.js'

// Frontend contract for Builder/Helper/Decision/cancel over the real loopback Core and SDK.
// The Agent is a deterministic stand-in that performs the same Core commands as the MCP tools.

type Behaviour = (request: AgentInvocation) => Promise<{ text: string; stopReason: string }>
const builder = { kind: 'AGENT' as const, role: 'BUILDER' as const }

describe('frontend Builder/Helper contract over the loopback Core', () => {
  it('runs Decision → Helper → cancel → resolve → Builder completion with durable checks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibe-helper-builder-contract-'))
    await mkdir(join(root, 'workspaces', ...projectFixture.generatedWorkspacePath.split('/')), {
      recursive: true,
    })
    const storage = await openSqliteStorage({ dataDirectory: join(root, 'data') })
    const application = new ApplicationService({
      storage,
      workspacePolicy: await WorkspacePathPolicy.create(join(root, 'workspaces')),
    })
    storage.transaction((repository) => {
      repository.appendProject(projectSchema.parse(projectFixture))
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
      repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
      repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
      repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
      for (const spec of [draftLearningSpecFixture, confirmedLearningSpecFixture])
        repository.appendLearningSpec(
          learningSpecRevisionSchema.parse({ ...spec, expectedDecisions: [] }),
        )
      repository.appendTask(
        builderTaskSchema.parse({ ...builderTaskFixture, expectedDecisionCategories: [] }),
      )
      repository.appendLiveContext({
        ...liveContextFixture,
        checkpoint: 'TASK_STARTED',
        stage: 'Starting implementation',
        activeDecisionIds: [],
      })
    })
    const behaviours: Behaviour[] = []
    const invocations: AgentInvocation[] = []
    const instanceId = randomUUID()
    const token = randomBytes(32).toString('hex')
    const runtime = new WorkflowRuntime({
      application,
      instanceId,
      agents: {
        invoke: (request) => {
          invocations.push(request)
          const next = behaviours.shift()
          if (next === undefined) throw new Error('UNEXPECTED_AGENT_CALL')
          return next(request)
        },
      },
    })
    const server = createLocalServer({
      application,
      runtime,
      token,
      instanceId,
      mcpHandlers: new Map(),
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('listen failed')
    const client = new LocalCoreClient({
      protocolVersion: LOCAL_PROTOCOL_VERSION,
      backendInstanceId: instanceId,
      baseUrl: `http://127.0.0.1:${address.port}`,
      token,
    })
    const agent = async (kind: string, body: Record<string, unknown>, role = builder) => {
      const result = await application.executeAgent(role.role, {
        schemaVersion: 1,
        actor: role,
        kind,
        ...body,
      } as never)
      if (!result.success)
        throw Object.assign(new Error(result.error.code), { code: result.error.code })
      return result.data
    }
    const watch = async (runId: string) => {
      const events: LocalRunEvent[] = []
      const run = await client.watchRun(runId, (event) => events.push(event))
      return { run, views: events.map(projectRunEvent) }
    }

    try {
      // Builder turn 1 asks for a user Decision. The turn ends; the Task is not complete.
      behaviours.push(async (request) => {
        request.onEvent({
          kind: 'TOOL',
          update: { nativeStatus: 'completed', toolName: 'write', relativePath: 'src/events.ts' },
        })
        await agent('BUILDER_REQUEST_DECISION', {
          correlationId: request.correlationId,
          idempotencyKey: entityId('idem'),
          projectId: ids.project,
          taskId: ids.task,
          expectedTaskRevision: 1,
          expectedContextVersion: 1,
          decision: {
            category: 'DATA_MODEL',
            question: 'Should unknown fields be rejected or retained for inspection?',
            reasonRequiredNow: 'The parser result depends on this choice.',
            options: [
              {
                key: 'reject',
                label: 'Reject unknown fields',
                description: 'Keep the parser strict.',
                impacts: ['Typos fail at the input boundary.'],
                tradeoffs: ['Provider additions require a schema update.'],
              },
              {
                key: 'retain',
                label: 'Retain unknown fields',
                description: 'Expose unmodeled fields.',
                impacts: ['New provider fields remain visible.'],
                tradeoffs: ['Typos can be less obvious.'],
              },
            ],
            recommendedOptionKey: 'reject',
            recommendationRationale: 'Strict parsing catches invalid payloads early.',
            relatedConceptNames: ['runtime validation'],
            sourceReferences: [liveContextFixture.relatedFiles[0]],
            independentWorkCanContinue: false,
          },
          context: {
            stage: 'Waiting on parser behavior',
            currentGoal: 'Choose unknown-field behavior.',
            recentChanges: ['Defined the known event variants.'],
            activeConceptNames: ['runtime validation'],
            relatedFiles: [liveContextFixture.relatedFiles[0]],
            nextActions: ['Apply the selected parser behavior.'],
            blockingReason: 'The parser branch depends on the user choice.',
          },
        })
        request.onEvent({ kind: 'TEXT', text: 'Waiting for your parser decision.' })
        return { text: 'Decision requested.', stopReason: 'end_turn' }
      })
      let snapshot = await client.restoreProject(ids.project)
      const first = await client.startRun({
        kind: 'BUILDER',
        projectId: ids.project,
        taskId: ids.task,
        expectedTaskRevision: snapshot.currentTask?.revision ?? 0,
        idempotencyKey: entityId('idem'),
        message: 'Start building the parser.',
      })
      const firstResult = await watch(first.id)
      expect(firstResult.run).toMatchObject({ status: 'SUCCEEDED', outcome: 'TURN_ENDED' })
      expect(firstResult.views).toContainEqual(
        expect.objectContaining({ kind: 'TOOL', tool: 'write', status: 'SUCCEEDED' }),
      )
      snapshot = await client.restoreProject(ids.project)
      const outcome = classifyBuilderTurn(firstResult.run, snapshot, ids.task)
      expect(outcome.kind).toBe('DECISION_REQUIRED')
      const decisionId = snapshot.pendingDecisions[0]?.id ?? ''
      expect(snapshot.currentTask).toMatchObject({ status: 'BLOCKED' })

      // A Helper answer about the pending Decision is recorded; the Decision stays pending.
      behaviours.push(async (request) => {
        await agent(
          'HELPER_GET_CONTEXT',
          {
            correlationId: request.correlationId,
            projectId: ids.project,
            taskId: ids.task,
            decisionId,
            question: request.helperQuestion,
            relatedConceptNames: [],
          },
          { kind: 'AGENT', role: 'HELPER' } as never,
        )
        request.onEvent({ kind: 'TEXT', text: 'Strict parsing fails fast on typos.' })
        return { text: 'Strict parsing fails fast on typos.', stopReason: 'end_turn' }
      })
      const helper = await client.startRun({
        kind: 'HELPER',
        projectId: ids.project,
        taskId: ids.task,
        decisionId,
        idempotencyKey: entityId('idem'),
        message: 'What changes if I reject unknown fields?',
      })
      expect((await watch(helper.id)).run).toMatchObject({
        status: 'SUCCEEDED',
        outcome: 'HELPER_RECORDED',
      })

      // A cancelled Helper turn read its context (trace written) but records no answer.
      let contextRead!: () => void
      const readContext = new Promise<void>((done) => {
        contextRead = done
      })
      behaviours.push(async (request) => {
        await agent(
          'HELPER_GET_CONTEXT',
          {
            correlationId: request.correlationId,
            projectId: ids.project,
            taskId: ids.task,
            question: request.helperQuestion,
            relatedConceptNames: [],
          },
          { kind: 'AGENT', role: 'HELPER' } as never,
        )
        contextRead()
        return new Promise((_done, reject) =>
          request.signal.addEventListener('abort', () => reject(new Error('stopped')), {
            once: true,
          }),
        )
      })
      const cancelled = await client.startRun({
        kind: 'HELPER',
        projectId: ids.project,
        taskId: ids.task,
        idempotencyKey: entityId('idem'),
        message: 'Explain the retain option too.',
      })
      await readContext
      expect(await client.cancelRun(cancelled.id)).toMatchObject({
        status: 'CANCELLED',
        errorCode: 'CANCELLED',
        outcome: 'NONE',
      })
      snapshot = await client.restoreProject(ids.project)
      const trace = await client.execute({
        ...uiMetadata(),
        kind: 'UI_READ_EVIDENCE_TRACE',
        projectId: ids.project,
      })
      const helperTraces = trace.personalization.filter(
        (item) => item.target.kind === 'HELPER_TURN',
      )
      expect(helperTraces).toHaveLength(2)
      const recorded = new Set(snapshot.helperConversations.map((item) => item.correlationId))
      expect(helperTraces.filter((item) => recorded.has(item.correlationId))).toHaveLength(1)
      expect(snapshot.pendingDecisions.map((item) => item.id)).toEqual([decisionId])

      // The user resolves with their own rationale; Builder resumes only on a new explicit run.
      const resolution = createDecisionResolutionRequest(snapshot, {
        decisionId,
        selection: { kind: 'RECOMMENDATION' },
        rationale: 'I want typos to fail loudly.',
        helperUsed: true,
      })
      await client.execute(resolution)
      await expect(client.execute(resolution)).resolves.toMatchObject({})
      snapshot = await client.restoreProject(ids.project)
      expect(snapshot.pendingDecisions).toEqual([])
      expect(snapshot.decisions[0]).toMatchObject({ resolution: { id: resolution.resolution.id } })
      expect(invocations.map((item) => item.mode)).toEqual(['BUILDER', 'HELPER', 'HELPER'])
      const staleRevision = snapshot.currentTask?.revision ?? 0
      await expect(
        client.startRun({
          kind: 'BUILDER',
          projectId: ids.project,
          taskId: ids.task,
          expectedTaskRevision: staleRevision - 1,
          idempotencyKey: entityId('idem'),
          message: '',
        }),
      ).rejects.toMatchObject({ code: 'STALE_TASK_REVISION' })

      // Builder turn 2 applies the Decision and completes through the Core report.
      behaviours.push(async (request) => {
        expect(request.message).toContain(
          'Continue the current Task from durable Context/Decision state.',
        )
        expect(request.message).toContain(
          'No additional user message was provided for this explicit Builder start/resume.',
        )
        expect(request.message).not.toContain('Exact user message:')
        const before = await client.restoreProject(ids.project)
        const context = before.liveContext
        if (context === null || before.currentTask === null) throw new Error('CONTEXT_REQUIRED')
        const taskRevision = before.currentTask.revision
        await agent('BUILDER_APPLY_DECISION', {
          correlationId: request.correlationId,
          idempotencyKey: entityId('idem'),
          projectId: ids.project,
          taskId: ids.task,
          decisionId,
          expectedTaskRevision: taskRevision,
          expectedContextVersion: context.contextVersion,
          appliedResult: 'Rejected unknown fields at the parser boundary.',
          sourceReferences: [liveContextFixture.relatedFiles[0]],
          context: {
            stage: 'Applied strict parser behavior',
            currentGoal: 'Validate the selected behavior.',
            recentChanges: ['Implemented strict unknown-field rejection.'],
            activeConceptNames: ['runtime validation'],
            relatedFiles: [liveContextFixture.relatedFiles[0]],
            nextActions: ['Run parser tests.'],
          },
        })
        const applied = await client.restoreProject(ids.project)
        const version = applied.liveContext?.contextVersion ?? 0
        await agent('BUILDER_UPDATE_LIVE_CONTEXT', {
          correlationId: request.correlationId,
          idempotencyKey: entityId('idem'),
          context: {
            ...applied.liveContext,
            contextVersion: version + 1,
            expectedPreviousVersion: version,
            checkpoint: 'TASK_COMPLETED',
            stage: 'Completed',
            activeDecisionIds: [],
          },
        })
        await agent('BUILDER_COMPLETE_TASK', {
          correlationId: request.correlationId,
          idempotencyKey: entityId('idem'),
          report: {
            schemaVersion: 1,
            id: entityId('completion_report'),
            projectId: ids.project,
            taskId: ids.task,
            correlationId: request.correlationId,
            expectedTaskRevision: taskRevision,
            implementedFeatures: ['Validated webhook variants with strict parsing.'],
            acceptanceResults: [{ criterionKey: 'valid_event', status: 'PASSED', evidence: [] }],
            validationResults: [{ name: 'parser tests', status: 'PASSED', summary: 'Passed.' }],
            conceptUsage: [
              {
                conceptName: 'discriminated union',
                scope: 'LEARNER_FOCUS',
                importance: 'CORE',
                usageReason: 'The parser narrows each validated variant.',
                codeReferences: [],
              },
            ],
            appliedDecisionIds: [decisionId],
            codeReferences: [],
            diffReferences: [],
            specDeviations: [],
            remainingIssues: [],
            limitations: [],
            completedAt: new Date().toISOString(),
            source: builder,
            redactionStatus: 'VERIFIED_REDACTED',
          },
        })
        return { text: 'Completed.', stopReason: 'end_turn' }
      })
      const second = await client.startRun({
        kind: 'BUILDER',
        projectId: ids.project,
        taskId: ids.task,
        expectedTaskRevision: staleRevision,
        idempotencyKey: entityId('idem'),
        message: '',
      })
      const secondResult = await watch(second.id)
      expect(secondResult.run).toMatchObject({ status: 'SUCCEEDED', errorCode: null })
      snapshot = await client.restoreProject(ids.project)
      expect(classifyBuilderTurn(secondResult.run, snapshot, ids.task)).toMatchObject({
        kind: 'TASK_COMPLETED',
      })
      expect(snapshot.decisions[0]?.application).not.toBeNull()
    } finally {
      await runtime.close()
      server.closeAllConnections()
      await new Promise<void>((done) => server.close(() => done()))
      storage.close()
    }
  })
})
