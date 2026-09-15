import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import {
  builderTaskSchema,
  candidateRoundSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  learningSpecRevisionSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from '@vibe-helper/contracts'
import { WorkflowRuntime } from '@vibe-helper/runtime'
import { openInMemorySqliteStorage } from '@vibe-helper/storage-sqlite'
import { describe, expect, it } from 'vitest'
import {
  builderTaskFixture,
  candidateFixture,
  candidateRoundFixture,
  confirmedLearningSpecFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  ids,
  liveContextFixture,
  projectFixture,
} from '../../../packages/contracts/test/fixtures.js'
import { createLocalServer } from '../src/server.js'
import { createNativeCoreBinding } from '../src/native-core-binding.js'

describe('experimental native Core binding', () => {
  it('issues a fresh Helper correlation for each turn while retaining task scope', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibe-native-helper-correlation-'))
    const storage = await openInMemorySqliteStorage()
    storage.transaction((repository) => {
      repository.appendProject(projectSchema.parse(projectFixture))
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
      repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
      repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
      repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(confirmedLearningSpecFixture))
      repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
    })
    const application = new ApplicationService({
      storage,
      workspacePolicy: await WorkspacePathPolicy.create(root),
    })
    const seen: Array<{ correlationId: string; projectId: string; taskId?: string }> = []
    const runtime = new WorkflowRuntime({
      application,
      instanceId: randomUUID(),
      agents: {
        invoke: async (request) => {
          seen.push({
            correlationId: request.correlationId,
            projectId: request.projectId,
            taskId: request.taskId,
          })
          return { text: 'The parser checks runtime fields separately.', stopReason: 'end_turn' }
        },
      },
    })
    try {
      for (const message of ['How does narrowing work?', 'What validates extra fields?']) {
        const run = await runtime.start({
          kind: 'HELPER',
          projectId: ids.project,
          taskId: ids.task,
          idempotencyKey: `idem_${randomUUID()}`,
          message,
          origin: 'FREE_TEXT',
        })
        let final = runtime.get(run.id)
        for (let attempt = 0; attempt < 100 && final.status === 'RUNNING'; attempt++) {
          await new Promise((done) => setTimeout(done, 10))
          final = runtime.get(run.id)
        }
        expect(final.status).toBe('SUCCEEDED')
        expect(final.outcome).toBe('HELPER_RECORDED')
      }
      expect(seen).toHaveLength(2)
      expect(seen[0]?.correlationId).toMatch(/^corr_[0-9a-f-]{36}$/)
      expect(seen[0]?.correlationId).not.toBe(seen[1]?.correlationId)
      expect(
        seen.every(
          (entry) =>
            entry.correlationId !== ids.correlation &&
            entry.projectId === ids.project &&
            entry.taskId === ids.task,
        ),
      ).toBe(true)
      const episodes = storage.repository.readRecentEpisodeAggregatesForProject(ids.project, 10)
      expect(episodes).toHaveLength(2)
      expect(new Set(episodes.map((entry) => entry.episode.correlationId))).toEqual(
        new Set(seen.map((entry) => entry.correlationId)),
      )
    } finally {
      await runtime.close()
      storage.close()
    }
  })
  it('uses real Core with one Builder Task scope and revokes the MCP authority', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibe-native-bound-core-'))
    const storage = await openInMemorySqliteStorage()
    storage.transaction((repository) => {
      repository.appendProject(projectSchema.parse(projectFixture))
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
      repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
      repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
      repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(confirmedLearningSpecFixture))
      repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
    })
    const application = new ApplicationService({
      storage,
      workspacePolicy: await WorkspacePathPolicy.create(root),
    })
    const binding = createNativeCoreBinding({
      application,
      role: 'BUILDER',
      projectId: ids.project,
      correlationId: ids.correlation,
      taskId: ids.task,
    })
    const runtime = new WorkflowRuntime({
      application,
      agents: {
        invoke: async () => {
          throw new Error('NATIVE_AGENT_NOT_ATTACHED')
        },
      },
      instanceId: randomUUID(),
    })
    const token = randomBytes(32).toString('hex')
    const server = createLocalServer({
      application,
      runtime,
      token,
      instanceId: randomUUID(),
      mcpHandlers: new Map([[binding.path, binding.handler]]),
      runStartDisabledCode: 'NATIVE_RUNTIME_NOT_ATTACHED',
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('LISTEN_FAILED')
    const url = new URL(`http://127.0.0.1:${address.port}${binding.path}`)
    const client = new Client({ name: 'native-bound-test', version: '0.1.0' })
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: binding.authorization } },
    })
    try {
      await client.connect(transport)
      const listed = await client.listTools()
      expect(listed.tools.map((tool) => tool.name)).toEqual([
        'get_builder_task',
        'start_task',
        'update_build_context',
        'request_user_decision',
        'get_decision_result',
        'apply_decision_result',
        'complete_task',
      ])
      const args = {
        schemaVersion: 1,
        kind: 'BUILDER_GET_TASK',
        actor: { kind: 'AGENT', role: 'BUILDER' },
        projectId: ids.project,
        taskId: ids.task,
        correlationId: ids.correlation,
      }
      const read = await client.callTool({ name: 'get_builder_task', arguments: args })
      expect(read.isError).not.toBe(true)
      expect(read.structuredContent).toMatchObject({ task: { id: ids.task } })
      const wrong = await client.callTool({
        name: 'get_builder_task',
        arguments: {
          ...args,
          projectId: 'project_00000000-0000-4000-8000-000000000099',
        },
      })
      expect(wrong).toMatchObject({
        isError: true,
        structuredContent: { code: 'AGENT_RUN_SCOPE_MISMATCH' },
      })
      binding.revoke()
      await expect(client.callTool({ name: 'get_builder_task', arguments: args })).rejects.toThrow()
    } finally {
      await client.close()
      await binding.handler.close()
      await runtime.close()
      server.closeAllConnections()
      await new Promise<void>((done) => server.close(() => done()))
      storage.close()
    }
  })
  it('passes a decoded Builder JSON envelope to original Core idempotency unchanged', async () => {
    // The running Kiro parser drops empty containers. This test uses a separate
    // in-memory Core to prove the scalar transport preserves both those values
    // and the original mutation's replay/conflict contract.
    // @ts-expect-error Experimental script is intentionally an untyped .mjs facade.
    const { decodeJsonEnvelope } = await import('../../../scripts/native-json-envelope.mjs')
    const root = await mkdtemp(join(tmpdir(), 'vibe-native-envelope-core-'))
    const storage = await openInMemorySqliteStorage()
    storage.transaction((repository) => {
      repository.appendProject(projectSchema.parse(projectFixture))
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
      repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
      repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
      repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(confirmedLearningSpecFixture))
      repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
    })
    const application = new ApplicationService({
      storage,
      workspacePolicy: await WorkspacePathPolicy.create(root),
    })
    const binding = createNativeCoreBinding({
      application,
      role: 'BUILDER',
      projectId: ids.project,
      correlationId: ids.correlation,
      taskId: ids.task,
    })
    const runtime = new WorkflowRuntime({
      application,
      agents: {
        invoke: async () => {
          throw new Error('NATIVE_AGENT_NOT_ATTACHED')
        },
      },
      instanceId: randomUUID(),
    })
    const server = createLocalServer({
      application,
      runtime,
      token: randomBytes(32).toString('hex'),
      instanceId: randomUUID(),
      mcpHandlers: new Map([[binding.path, binding.handler]]),
      runStartDisabledCode: 'NATIVE_RUNTIME_NOT_ATTACHED',
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('LISTEN_FAILED')
    const client = new Client({ name: 'native-envelope-core-test', version: '0.1.0' })
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${address.port}${binding.path}`),
      { requestInit: { headers: { Authorization: binding.authorization } } },
    )
    try {
      await client.connect(transport)
      const toolInput = {
        schemaVersion: 1,
        projectId: ids.project,
        taskId: ids.task,
        correlationId: ids.correlation,
        idempotencyKey: ids.idempotency,
        expectedPreviousVersion: 0,
        checkpoint: 'TASK_STARTED',
        stage: liveContextFixture.stage,
        currentGoal: liveContextFixture.currentGoal,
        recentChanges: [...liveContextFixture.recentChanges],
        activeDecisionIds: [],
        activeConceptNames: [...liveContextFixture.activeConceptNames],
        relatedFiles: [],
        nextActions: [...liveContextFixture.nextActions],
      }
      const decoded = decodeJsonEnvelope('BUILDER', 'update_build_context', {
        inputJson: JSON.stringify(toolInput),
      })
      expect(decoded.decoded).toBe(true)
      expect(decoded.input.activeDecisionIds).toEqual([])
      expect(decoded.input.relatedFiles).toEqual([])
      const first = await client.callTool({
        name: 'update_build_context',
        arguments: decoded.input,
      })
      expect(first.isError).not.toBe(true)
      const replay = await client.callTool({
        name: 'update_build_context',
        arguments: decoded.input,
      })
      expect(replay.isError).not.toBe(true)
      expect(replay.structuredContent).toEqual(first.structuredContent)
      const changed = decodeJsonEnvelope('BUILDER', 'update_build_context', {
        inputJson: JSON.stringify({ ...toolInput, stage: 'Different stage' }),
      })
      const conflict = await client.callTool({
        name: 'update_build_context',
        arguments: changed.input,
      })
      expect(conflict).toMatchObject({
        isError: true,
        structuredContent: { code: 'IDEMPOTENCY_KEY_REUSE' },
      })
      expect(
        storage.repository.readBuilderTaskAggregate(ids.project, ids.task)?.liveContext,
      ).toMatchObject({ contextVersion: 1, stage: toolInput.stage })
    } finally {
      await client.close()
      await binding.handler.close()
      await runtime.close()
      server.closeAllConnections()
      await new Promise<void>((done) => server.close(() => done()))
      storage.close()
    }
  })
})
