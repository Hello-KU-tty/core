import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, type McpServer } from '@modelcontextprotocol/server'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import {
  builderTaskSchema,
  candidateRoundSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  learningSpecRevisionSchema,
  projectCandidateRevisionSchema,
  projectSchema,
  type AgentRole,
  type CandidatePreview,
} from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import { openInMemorySqliteStorage } from '../../../packages/storage-sqlite/src/index.js'
import {
  builderTaskFixture,
  candidateFixture,
  candidateRoundFixture,
  confirmedLearningSpecFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  ids,
  learningSpecDraftContentFixture,
  projectFixture,
  timestamp,
} from '../../../packages/contracts/test/fixtures.js'
import {
  createRoleBoundMcpServer,
  ROLE_TOOL_CATALOG,
  type RoleBoundMcpServerOptions,
} from '../src/role-server.js'

interface ConnectedHarness {
  readonly client: Client
  readonly server: McpServer
  readonly application: ApplicationService
  readonly storage: Awaited<ReturnType<typeof openInMemorySqliteStorage>>
  close(): Promise<void>
}

interface ConnectRoleOptions {
  readonly binding?: RoleBoundMcpServerOptions['binding']
  readonly seedDiscovery?: boolean
  readonly seedMerge?: boolean
  readonly seedSpecReview?: boolean
  readonly seedBuilder?: boolean
  readonly toolNames?: readonly string[]
  readonly now?: () => Date
  readonly generateId?: (
    prefix:
      | 'candidate'
      | 'candidate_preview_round'
      | 'candidate_round'
      | 'learning_spec'
      | 'context'
      | 'completion_report',
  ) => string
}

const connectRole = async (
  role: AgentRole,
  options: ConnectRoleOptions = {},
): Promise<ConnectedHarness> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-mcp-workspaces-'))
  const storage = await openInMemorySqliteStorage()
  if (options.seedDiscovery) {
    storage.transaction((repository) => {
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          status: 'DISCOVERY',
          generatedWorkspacePath: undefined,
        }),
      )
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
    })
  }
  if (options.seedMerge) {
    const secondCandidateId = 'candidate_00000000-0000-4000-8000-000000000079'
    storage.transaction((repository) => {
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          status: 'DISCOVERY',
          generatedWorkspacePath: undefined,
        }),
      )
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
      repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
      repository.appendCandidate(
        projectCandidateRevisionSchema.parse({
          ...candidateFixture,
          id: secondCandidateId,
          title: 'Second Candidate',
        }),
      )
      repository.appendCandidateRound(
        candidateRoundSchema.parse({
          ...candidateRoundFixture,
          candidates: [
            { candidateId: ids.candidate, revision: 1 },
            { candidateId: secondCandidateId, revision: 1 },
          ],
        }),
      )
      repository.appendDiscoveryFeedback(
        discoveryFeedbackSchema.parse({
          ...discoveryFeedbackFixture,
          intent: 'MERGE',
          targets: [
            { candidateId: ids.candidate, revision: 1 },
            { candidateId: secondCandidateId, revision: 1 },
          ],
          message: 'Combine the two directions.',
        }),
      )
      repository.appendDiscoverySession(
        discoverySessionSchema.parse({ ...discoverySessionFixture, revision: 2 }),
      )
    })
  }
  if (options.seedSpecReview) {
    storage.transaction((repository) => {
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          status: 'DISCOVERY',
          generatedWorkspacePath: undefined,
        }),
      )
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
      repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
      repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
      repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
      repository.appendDiscoverySession(
        discoverySessionSchema.parse({
          ...discoverySessionFixture,
          revision: 2,
          status: 'SELECTED',
          closedAt: timestamp,
        }),
      )
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          revision: 2,
          status: 'SPEC_REVIEW',
          generatedWorkspacePath: undefined,
        }),
      )
    })
  }
  if (options.seedBuilder) {
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
  }
  const application = new ApplicationService({
    storage,
    workspacePolicy: await WorkspacePathPolicy.create(workspaceRoot),
  })
  const server = createRoleBoundMcpServer({
    role,
    application,
    ...(options.binding === undefined ? {} : { binding: options.binding }),
    ...(options.toolNames === undefined ? {} : { toolNames: options.toolNames }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.generateId === undefined ? {} : { generateId: options.generateId }),
  })
  const client = new Client({ name: 'vibe-helper-contract-test', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return {
    client,
    server,
    application,
    storage,
    close: async () => {
      await client.close()
      await server.close()
      storage.close()
    },
  }
}

const expectedCatalog: Readonly<Record<AgentRole, readonly string[]>> = {
  DISCOVERY: [
    'get_discovery_context',
    'submit_candidate_previews',
    'submit_candidate_enrichments',
    'submit_candidate_round',
    'submit_candidate_merge',
    'submit_learning_spec',
  ],
  BUILDER: [
    'get_builder_task',
    'start_task',
    'update_build_context',
    'request_user_decision',
    'get_decision_result',
    'apply_decision_result',
    'complete_task',
  ],
  HELPER: ['get_helper_context', 'request_builder_context_refresh'],
  EVIDENCE_ANALYST: ['get_episode_context', 'submit_evidence_proposals'],
}

describe('role-bound MCP server', () => {
  it('binds local Agent tools to the exact run scope and revokes late submissions', async () => {
    let active = true
    const harness = await connectRole('DISCOVERY', {
      seedDiscovery: true,
      binding: {
        projectId: ids.project,
        discoverySessionId: ids.discoverySession,
        correlationId: ids.correlation,
        isActive: () => active,
      },
    })
    const input = {
      schemaVersion: 1,
      kind: 'DISCOVERY_GET_CONTEXT',
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      projectId: ids.project,
      discoverySessionId: ids.discoverySession,
      correlationId: ids.correlation,
    }
    try {
      const valid = await harness.client.callTool({
        name: 'get_discovery_context',
        arguments: input,
      })
      expect(valid.isError).not.toBe(true)
      for (const change of [
        { projectId: 'project_00000000-0000-4000-8000-000000000099' },
        { discoverySessionId: 'discovery_session_00000000-0000-4000-8000-000000000099' },
        { correlationId: 'corr_00000000-0000-4000-8000-000000000099' },
      ]) {
        await expect(
          harness.client.callTool({
            name: 'get_discovery_context',
            arguments: { ...input, ...change },
          }),
        ).resolves.toMatchObject({
          isError: true,
          structuredContent: { code: 'AGENT_RUN_SCOPE_MISMATCH' },
        })
      }
      active = false
      await expect(
        harness.client.callTool({ name: 'get_discovery_context', arguments: input }),
      ).resolves.toMatchObject({
        isError: true,
        structuredContent: { code: 'AGENT_RUN_SCOPE_MISMATCH' },
      })
      expect(
        harness.storage.repository.readDiscoveryAggregate(ids.project, ids.discoverySession)
          ?.session.revision,
      ).toBe(1)
    } finally {
      await harness.close()
    }
  })

  it('exposes exactly the documented allowlist for each authenticated role', async () => {
    for (const role of Object.keys(expectedCatalog) as AgentRole[]) {
      const harness = await connectRole(role)
      try {
        const listed = await harness.client.listTools()
        expect(listed.tools.map((tool) => tool.name)).toEqual(expectedCatalog[role])
        expect(ROLE_TOOL_CATALOG[role].map((tool) => tool.name)).toEqual(expectedCatalog[role])
      } finally {
        await harness.close()
      }
    }
  })

  it('does not expose raw SQL, generic file, shell, or user-Decision mutation tools', async () => {
    const forbidden = ['sql', 'read_file', 'write_file', 'shell', 'resolve_user_decision']
    for (const role of Object.keys(expectedCatalog) as AgentRole[]) {
      const harness = await connectRole(role)
      try {
        const listed = await harness.client.listTools()
        const names = new Set(listed.tools.map((tool) => tool.name))
        for (const name of forbidden) expect(names.has(name)).toBe(false)
        if (role === 'HELPER') expect(names.has('submit_evidence_proposals')).toBe(false)
        if (role === 'EVIDENCE_ANALYST') expect(names.has('request_user_decision')).toBe(false)
        await expect(harness.client.callTool({ name: 'shell', arguments: {} })).rejects.toThrow()
      } finally {
        await harness.close()
      }
    }
  })

  it('narrows Discovery tool schemas to the requested phase allowlist', async () => {
    const preview = await connectRole('DISCOVERY', {
      toolNames: ['get_discovery_context', 'submit_candidate_previews'],
    })
    const enrichment = await connectRole('DISCOVERY', {
      toolNames: ['get_discovery_context', 'submit_candidate_enrichments'],
    })
    const round = await connectRole('DISCOVERY', {
      toolNames: ['get_discovery_context', 'submit_candidate_round'],
    })
    const spec = await connectRole('DISCOVERY', {
      toolNames: ['get_discovery_context', 'submit_learning_spec'],
    })
    const merge = await connectRole('DISCOVERY', {
      toolNames: ['get_discovery_context', 'submit_candidate_merge'],
    })
    try {
      await expect(preview.client.listTools()).resolves.toMatchObject({
        tools: [{ name: 'get_discovery_context' }, { name: 'submit_candidate_previews' }],
      })
      await expect(enrichment.client.listTools()).resolves.toMatchObject({
        tools: [{ name: 'get_discovery_context' }, { name: 'submit_candidate_enrichments' }],
      })
      await expect(round.client.listTools()).resolves.toMatchObject({
        tools: [{ name: 'get_discovery_context' }, { name: 'submit_candidate_round' }],
      })
      await expect(spec.client.listTools()).resolves.toMatchObject({
        tools: [{ name: 'get_discovery_context' }, { name: 'submit_learning_spec' }],
      })
      await expect(merge.client.listTools()).resolves.toMatchObject({
        tools: [{ name: 'get_discovery_context' }, { name: 'submit_candidate_merge' }],
      })
      expect(() =>
        createRoleBoundMcpServer({
          role: 'DISCOVERY',
          application: round.application,
          toolNames: ['shell'],
        }),
      ).toThrow('Unknown DISCOVERY MCP tool selection')
    } finally {
      await preview.close()
      await enrichment.close()
      await round.close()
      await spec.close()
      await merge.close()
    }
  })

  it('rechecks the payload actor claim against the process-bound role', async () => {
    const harness = await connectRole('HELPER')
    try {
      const result = await harness.client.callTool({
        name: 'get_helper_context',
        arguments: {
          schemaVersion: 1,
          kind: 'HELPER_GET_CONTEXT',
          correlationId: ids.correlation,
          actor: { kind: 'AGENT', role: 'BUILDER' },
          projectId: ids.project,
          question: 'What should I inspect?',
          relatedConceptNames: [],
        },
      })
      expect(result).toMatchObject({ isError: true })
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('expected "HELPER"'),
      })
    } finally {
      await harness.close()
    }
  })

  it('returns typed application errors through structured MCP output', async () => {
    const harness = await connectRole('HELPER')
    try {
      const result = await harness.client.callTool({
        name: 'get_helper_context',
        arguments: {
          schemaVersion: 1,
          kind: 'HELPER_GET_CONTEXT',
          correlationId: ids.correlation,
          actor: { kind: 'AGENT', role: 'HELPER' },
          projectId: ids.project,
          question: 'What should I inspect?',
          relatedConceptNames: [],
        },
      })
      expect(result).toMatchObject({
        isError: true,
        structuredContent: {
          kind: 'OPERATION_ERROR',
          code: 'ACTIVE_TASK_NOT_FOUND',
          correlationId: ids.correlation,
        },
      })
    } finally {
      await harness.close()
    }
  })

  it('records a durable Helper refresh request without mutating Builder Context', async () => {
    const harness = await connectRole('HELPER', { seedBuilder: true })
    try {
      const context = await harness.client.callTool({
        name: 'get_helper_context',
        arguments: {
          schemaVersion: 1,
          kind: 'HELPER_GET_CONTEXT',
          correlationId: ids.correlation,
          actor: { kind: 'AGENT', role: 'HELPER' },
          projectId: ids.project,
          taskId: ids.task,
          question: 'What is the Builder doing now?',
          relatedConceptNames: [],
        },
      })
      expect(context).toMatchObject({
        structuredContent: { freshness: { status: 'MISSING', refreshRequired: true } },
      })

      const refresh = await harness.client.callTool({
        name: 'request_builder_context_refresh',
        arguments: {
          schemaVersion: 1,
          kind: 'HELPER_REQUEST_CONTEXT_REFRESH',
          correlationId: ids.correlation,
          actor: { kind: 'AGENT', role: 'HELPER' },
          idempotencyKey: 'idem_00000000-0000-4000-8000-000000000241',
          projectId: ids.project,
          taskId: ids.task,
          reason: 'Live Context is missing.',
        },
      })
      expect(refresh).toMatchObject({
        structuredContent: { accepted: true, resourceRevision: 1 },
      })
      expect(
        harness.storage.repository.readBuilderTaskAggregate(ids.project, ids.task),
      ).toMatchObject({
        liveContext: null,
        contextRefreshRequests: [{ status: 'PENDING', revision: 1 }],
      })
    } finally {
      await harness.close()
    }
  })

  it('normalizes a stringified concise Discovery proposal before strict application validation', async () => {
    const generatedCandidateId = 'candidate_00000000-0000-4000-8000-000000000071'
    const generatedRoundId = 'candidate_round_00000000-0000-4000-8000-000000000072'
    const harness = await connectRole('DISCOVERY', {
      seedDiscovery: true,
      now: () => new Date(timestamp),
      generateId: (prefix) => (prefix === 'candidate' ? generatedCandidateId : generatedRoundId),
    })
    try {
      const conciseDraft = {
        lineage: { kind: 'NEW' },
        title: candidateFixture.title,
        summary: candidateFixture.summary,
        targetUsers: candidateFixture.targetUsers,
        coreInteraction: candidateFixture.coreInteraction,
        usageMoment: candidateFixture.usageMoment,
        appeal: candidateFixture.appeal,
        personalNeedRelationship: candidateFixture.personalNeedRelationship,
        technologyNecessity: candidateFixture.technologyNecessity,
        coreConcepts: candidateFixture.coreConcepts,
        mvpFeatures: candidateFixture.mvpFeatures,
        suggestedScope: candidateFixture.suggestedScope,
        generationTags: candidateFixture.generationTags,
      } as const
      const result = await harness.client.callTool({
        name: 'submit_candidate_round',
        arguments: {
          __tool_use_purpose: 'Submit a synthetic initial Discovery round.',
          schemaVersion: 1,
          projectId: ids.project,
          discoverySessionId: ids.discoverySession,
          correlationId: ids.correlation,
          idempotencyKey: ids.idempotency,
          expectedSessionRevision: 1,
          appliedFeedbackIds: [],
          carriedCandidates: [],
          candidates: JSON.stringify([conciseDraft]),
          generationRationale: candidateRoundFixture.generationRationale,
          diversityCheck: candidateRoundFixture.diversityCheck,
        },
      })
      expect(result).toMatchObject({
        structuredContent: { accepted: true, resourceRevision: 2 },
      })
      expect(harness.storage.repository.readDiscoveryAggregate(ids.project)).toMatchObject({
        session: { revision: 2 },
        rounds: [
          {
            id: generatedRoundId,
            inputSnapshot: discoverySessionFixture.input,
            candidates: [{ candidateId: generatedCandidateId, revision: 1 }],
            source: { kind: 'AGENT', role: 'DISCOVERY' },
          },
        ],
        candidates: [
          {
            id: generatedCandidateId,
            createdAt: timestamp,
            source: { kind: 'AGENT', role: 'DISCOVERY' },
          },
        ],
      })
      expect(
        harness.storage.repository.readDiscoveryAggregate(ids.project)?.candidates[0],
      ).not.toHaveProperty('evaluation')
    } finally {
      await harness.close()
    }
  })

  it('rejects eleven previews without staging data and accepts a corrected ten-preview retry', async () => {
    const harness = await connectRole('DISCOVERY', { seedDiscovery: true })
    try {
      const previews = Array.from({ length: 11 }, (_, index) => ({
        title: `Preview ${String(index + 1)}`,
        summary: `Distinct direction ${String(index + 1)}.`,
        coreInteraction: `Run interaction ${String(index + 1)} and inspect the result.`,
        appeal: `Makes direction ${String(index + 1)} tangible.`,
        technologyNecessity: `Input types control direction ${String(index + 1)}.`,
        generationTags: ['DIRECT'],
      }))
      const argumentsBase = {
        schemaVersion: 1,
        projectId: ids.project,
        discoverySessionId: ids.discoverySession,
        correlationId: ids.correlation,
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000610',
        expectedSessionRevision: 1,
        generationRationale: 'Distinct directions for a local learning tool.',
      }
      const invalid = await harness.client.callTool({
        name: 'submit_candidate_previews',
        arguments: { ...argumentsBase, previews: JSON.stringify(previews) },
      })
      expect(invalid.isError).toBe(true)
      expect(harness.storage.repository.readDiscoveryAggregate(ids.project)).toMatchObject({
        session: { revision: 1 },
        rounds: [],
        candidates: [],
      })
      expect(
        harness.storage.repository.readDiscoveryAggregate(ids.project)?.previewRound,
      ).toBeNull()

      const corrected = await harness.client.callTool({
        name: 'submit_candidate_previews',
        arguments: { ...argumentsBase, previews: JSON.stringify(previews.slice(0, 10)) },
      })
      expect(corrected).toMatchObject({
        structuredContent: { accepted: true, resourceRevision: 1 },
      })
      const aggregate = harness.storage.repository.readDiscoveryAggregate(ids.project)
      expect(aggregate?.previewRound?.previews).toHaveLength(10)
      expect(aggregate?.rounds).toHaveLength(0)
      expect(aggregate?.candidates).toHaveLength(0)
    } finally {
      await harness.close()
    }
  })

  it('stages ten previews and materializes them only after two fixed enrichment tool calls', async () => {
    let candidateSequence = 600
    const generatedPreviewRoundId = 'candidate_preview_round_00000000-0000-4000-8000-000000000601'
    const generatedFinalRoundId = 'candidate_round_00000000-0000-4000-8000-000000000602'
    const harness = await connectRole('DISCOVERY', {
      seedDiscovery: true,
      now: () => new Date(timestamp),
      generateId: (prefix) => {
        if (prefix === 'candidate_preview_round') return generatedPreviewRoundId
        if (prefix === 'candidate_round') return generatedFinalRoundId
        if (prefix === 'candidate') {
          candidateSequence += 1
          return `candidate_00000000-0000-4000-8000-${String(candidateSequence).padStart(12, '0')}`
        }
        return `${prefix}_00000000-0000-4000-8000-000000000699`
      },
    })
    try {
      const previewDrafts = Array.from({ length: 10 }, (_, index) => ({
        title: `Preview Tool ${String(index + 1)}`,
        summary: `Distinct preview direction ${String(index + 1)}.`,
        coreInteraction: `Run interaction ${String(index + 1)} and inspect the result.`,
        appeal: `Makes direction ${String(index + 1)} tangible.`,
        technologyNecessity: `The target type controls direction ${String(index + 1)}.`,
        generationTags: ['DIRECT'],
      }))
      const previewResult = await harness.client.callTool({
        name: 'submit_candidate_previews',
        arguments: {
          schemaVersion: 1,
          projectId: ids.project,
          discoverySessionId: ids.discoverySession,
          correlationId: ids.correlation,
          idempotencyKey: 'idem_00000000-0000-4000-8000-000000000601',
          expectedSessionRevision: 1,
          previews: JSON.stringify(previewDrafts),
          generationRationale: 'Ten distinct tool-contract previews were staged.',
        },
      })
      expect(previewResult).toMatchObject({
        structuredContent: { accepted: true, resourceRevision: 1 },
      })
      const staged = harness.storage.repository.readDiscoveryAggregate(ids.project)
      expect(staged?.previewRound?.id).toBe(generatedPreviewRoundId)
      expect(staged?.previewRound?.previews).toHaveLength(10)
      expect(staged?.rounds).toHaveLength(0)

      const enrichmentDraft = (preview: CandidatePreview) => ({
        candidateId: preview.candidateId,
        title: preview.title,
        summary: preview.summary,
        targetUsers: candidateFixture.targetUsers,
        coreInteraction: preview.coreInteraction,
        usageMoment: candidateFixture.usageMoment,
        appeal: preview.appeal,
        personalNeedRelationship: candidateFixture.personalNeedRelationship,
        technologyNecessity: preview.technologyNecessity,
        coreConcepts: candidateFixture.coreConcepts,
        mvpFeatures: candidateFixture.mvpFeatures,
        suggestedScope: candidateFixture.suggestedScope,
        generationTags: preview.generationTags,
      })

      const firstPreview = staged?.previewRound?.previews[0]
      if (firstPreview === undefined) throw new TypeError('First preview is missing')
      await expect(
        harness.client.callTool({
          name: 'submit_candidate_enrichments',
          arguments: {
            schemaVersion: 1,
            projectId: ids.project,
            discoverySessionId: ids.discoverySession,
            correlationId: ids.correlation,
            idempotencyKey: 'idem_00000000-0000-4000-8000-000000000604',
            expectedSessionRevision: 1,
            previewRoundId: generatedPreviewRoundId,
            batch: 'SELECTED',
            candidates: [enrichmentDraft(firstPreview)],
          },
        }),
      ).resolves.toMatchObject({ structuredContent: { resourceRevision: 1 } })
      expect(
        harness.storage.repository.readDiscoveryAggregate(ids.project)?.candidateEnrichments,
      ).toHaveLength(1)

      const submitBatch = async (batch: 'FIRST' | 'SECOND', start: number, key: string) => {
        const previews = staged?.previewRound?.previews.slice(start, start + 5) ?? []
        const candidates = previews.map(enrichmentDraft)
        return harness.client.callTool({
          name: 'submit_candidate_enrichments',
          arguments: {
            schemaVersion: 1,
            projectId: ids.project,
            discoverySessionId: ids.discoverySession,
            correlationId: ids.correlation,
            idempotencyKey: key,
            expectedSessionRevision: 1,
            previewRoundId: generatedPreviewRoundId,
            batch,
            candidates: batch === 'SECOND' ? JSON.stringify(candidates) : candidates,
          },
        })
      }

      await expect(
        submitBatch('FIRST', 0, 'idem_00000000-0000-4000-8000-000000000602'),
      ).resolves.toMatchObject({ structuredContent: { resourceRevision: 1 } })
      expect(harness.storage.repository.readDiscoveryAggregate(ids.project)).toMatchObject({
        session: { revision: 1 },
        candidateEnrichments: expect.arrayContaining([
          expect.objectContaining({
            candidate: expect.objectContaining({ title: 'Preview Tool 1' }),
          }),
        ]),
        rounds: [],
      })

      await expect(
        submitBatch('SECOND', 5, 'idem_00000000-0000-4000-8000-000000000603'),
      ).resolves.toMatchObject({ structuredContent: { resourceRevision: 2 } })
      const completed = harness.storage.repository.readDiscoveryAggregate(ids.project)
      expect(completed?.session.revision).toBe(2)
      expect(completed?.candidateEnrichments).toHaveLength(10)
      expect(completed?.candidates).toHaveLength(10)
      expect(completed?.rounds).toMatchObject([
        { id: generatedFinalRoundId, candidates: expect.arrayContaining([]) },
      ])
      expect(completed?.rounds[0]?.candidates).toHaveLength(10)
    } finally {
      await harness.close()
    }
  })

  it('derives MERGE feedback, lineage, and revision around one semantic Candidate', async () => {
    const generatedRoundId = 'candidate_round_00000000-0000-4000-8000-000000000078'
    const harness = await connectRole('DISCOVERY', {
      seedMerge: true,
      now: () => new Date(timestamp),
      generateId: () => generatedRoundId,
      toolNames: ['get_discovery_context', 'submit_candidate_merge'],
    })
    try {
      const result = await harness.client.callTool({
        name: 'submit_candidate_merge',
        arguments: {
          schemaVersion: 1,
          projectId: ids.project,
          discoverySessionId: ids.discoverySession,
          correlationId: ids.correlation,
          idempotencyKey: 'idem_00000000-0000-4000-8000-000000000078',
          expectedSessionRevision: 2,
          candidate: {
            title: 'Merged Candidate',
            summary: candidateFixture.summary,
            targetUsers: candidateFixture.targetUsers,
            coreInteraction: candidateFixture.coreInteraction,
            usageMoment: candidateFixture.usageMoment,
            appeal: candidateFixture.appeal,
            personalNeedRelationship: candidateFixture.personalNeedRelationship,
            technologyNecessity: candidateFixture.technologyNecessity,
            coreConcepts: candidateFixture.coreConcepts,
            mvpFeatures: candidateFixture.mvpFeatures,
            suggestedScope: candidateFixture.suggestedScope,
            generationTags: candidateFixture.generationTags,
          },
          generationRationale: 'Combined the requested strengths.',
          diversityCheck: candidateRoundFixture.diversityCheck,
        },
      })
      expect(result).toMatchObject({
        structuredContent: { accepted: true, resourceRevision: 3 },
      })
      const aggregate = harness.storage.repository.readDiscoveryAggregate(ids.project)
      expect(aggregate?.rounds.at(-1)).toMatchObject({
        id: generatedRoundId,
        appliedFeedbackIds: [ids.feedback],
        candidates: [{ candidateId: ids.candidate, revision: 2 }],
      })
      expect(
        aggregate?.candidates.find(
          (candidate) => candidate.id === ids.candidate && candidate.revision === 2,
        ),
      ).toMatchObject({
        id: ids.candidate,
        revision: 2,
        parentRevisions: [
          { candidateId: ids.candidate, revision: 1 },
          {
            candidateId: 'candidate_00000000-0000-4000-8000-000000000079',
            revision: 1,
          },
        ],
        title: 'Merged Candidate',
      })
    } finally {
      await harness.close()
    }
  })

  it('expands semantic Spec content with selected Candidate and trusted revision metadata', async () => {
    const generatedSpecId = 'learning_spec_00000000-0000-4000-8000-000000000073'
    const harness = await connectRole('DISCOVERY', {
      seedSpecReview: true,
      now: () => new Date(timestamp),
      generateId: () => generatedSpecId,
    })
    try {
      const result = await harness.client.callTool({
        name: 'submit_learning_spec',
        arguments: {
          __tool_use_purpose: 'Submit a recommended Learning Spec for the selected Candidate.',
          schemaVersion: 1,
          projectId: ids.project,
          discoverySessionId: ids.discoverySession,
          correlationId: ids.correlation,
          idempotencyKey: 'idem_00000000-0000-4000-8000-000000000074',
          expectedSessionRevision: 2,
          expectedSpecRevision: 0,
          draft: learningSpecDraftContentFixture,
        },
      })
      expect(result).toMatchObject({
        structuredContent: { accepted: true, resourceRevision: 1 },
      })
      const revised = await harness.client.callTool({
        name: 'submit_learning_spec',
        arguments: {
          schemaVersion: 1,
          projectId: ids.project,
          discoverySessionId: ids.discoverySession,
          correlationId: ids.correlation,
          idempotencyKey: 'idem_00000000-0000-4000-8000-000000000075',
          expectedSessionRevision: 3,
          expectedSpecRevision: 1,
          draft: {
            ...learningSpecDraftContentFixture,
            productPurpose: 'Compare redacted webhook variants locally.',
          },
        },
      })
      expect(revised).toMatchObject({
        structuredContent: { accepted: true, resourceRevision: 2 },
      })
      expect(harness.storage.repository.readDiscoveryAggregate(ids.project)).toMatchObject({
        session: { revision: 4, status: 'SELECTED' },
        learningSpecs: [
          {
            id: generatedSpecId,
            revision: 1,
            selectedCandidate: { candidateId: ids.candidate, revision: 1 },
            createdAt: timestamp,
            source: { kind: 'AGENT', role: 'DISCOVERY' },
          },
          {
            id: generatedSpecId,
            revision: 2,
            parentRevision: 1,
            createdAt: timestamp,
            source: { kind: 'AGENT', role: 'DISCOVERY' },
          },
        ],
      })
    } finally {
      await harness.close()
    }
  })

  it('expands semantic Builder checkpoints and completion with Core-owned metadata', async () => {
    const harness = await connectRole('BUILDER', {
      seedBuilder: true,
      now: () => new Date(timestamp),
      generateId: (prefix) =>
        prefix === 'context'
          ? ids.context
          : prefix === 'completion_report'
            ? ids.completionReport
            : `${prefix}_00000000-0000-4000-8000-000000000076`,
    })
    try {
      const contextBase = {
        schemaVersion: 1,
        projectId: ids.project,
        taskId: ids.task,
        correlationId: ids.correlation,
        expectedPreviousVersion: 0,
        checkpoint: 'TASK_STARTED',
        stage: 'Starting implementation',
        currentGoal: 'Implement the confirmed MVP.',
        recentChanges: [],
        activeDecisionIds: [],
        activeConceptNames: ['discriminated union'],
        relatedFiles: [],
        nextActions: ['Run the initial test.'],
      } as const
      const startedContext = await harness.client.callTool({
        name: 'update_build_context',
        arguments: {
          ...contextBase,
          idempotencyKey: 'idem_00000000-0000-4000-8000-000000000076',
        },
      })
      expect(startedContext).toMatchObject({
        structuredContent: { accepted: true, resourceRevision: 1 },
      })
      expect(harness.storage.repository.recoverProject(ids.project)?.liveContext).toMatchObject({
        id: ids.context,
        contextVersion: 1,
        updatedAt: timestamp,
        source: { kind: 'AGENT', role: 'BUILDER' },
        redactionStatus: 'VERIFIED_REDACTED',
      })

      const completedContext = await harness.client.callTool({
        name: 'update_build_context',
        arguments: {
          ...contextBase,
          idempotencyKey: 'idem_00000000-0000-4000-8000-000000000077',
          expectedPreviousVersion: 1,
          checkpoint: 'TASK_COMPLETED',
          stage: 'Completed',
          recentChanges: ['Implemented and validated the event renderer.'],
          nextActions: ['Open the generated result.'],
        },
      })
      expect(completedContext).toMatchObject({
        structuredContent: { accepted: true, resourceRevision: 2 },
      })

      const completionArguments = {
        schemaVersion: 1,
        projectId: ids.project,
        taskId: ids.task,
        correlationId: ids.correlation,
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000078',
        expectedTaskRevision: 1,
        report: {
          implementedFeatures: ['Validated and rendered event variants.'],
          acceptanceResults: [{ criterionKey: 'valid_event', status: 'PASSED', evidence: [] }],
          validationResults: [
            { name: 'event parser tests', status: 'PASSED', summary: 'All tests passed.' },
          ],
          conceptUsage: [
            {
              conceptName: 'discriminated union',
              scope: 'LEARNER_FOCUS',
              importance: 'CORE',
              usageReason: 'The renderer narrows each event by its type field.',
              codeReferences: [],
            },
          ],
          appliedDecisionIds: [],
          codeReferences: [],
          diffReferences: [],
          specDeviations: [],
          remainingIssues: [],
          limitations: [],
        },
      }
      const completed = await harness.client.callTool({
        name: 'complete_task',
        arguments: completionArguments,
      })
      const replayed = await harness.client.callTool({
        name: 'complete_task',
        arguments: completionArguments,
      })
      expect(completed).toMatchObject({
        structuredContent: { accepted: true, resourceRevision: 2 },
      })
      expect(replayed).toEqual(completed)
      expect(
        harness.storage.repository.readBuilderTaskAggregate(ids.project, ids.task),
      ).toMatchObject({
        task: { status: 'COMPLETED', revision: 2 },
        completionReport: {
          id: ids.completionReport,
          completedAt: timestamp,
          source: { kind: 'AGENT', role: 'BUILDER' },
          redactionStatus: 'VERIFIED_REDACTED',
        },
      })
    } finally {
      await harness.close()
    }
  })

  it('expands semantic Decision tools and resumes from a user-authored resolution', async () => {
    const harness = await connectRole('BUILDER', { seedBuilder: true })
    try {
      await harness.client.callTool({
        name: 'update_build_context',
        arguments: {
          schemaVersion: 1,
          projectId: ids.project,
          taskId: ids.task,
          correlationId: ids.correlation,
          idempotencyKey: 'idem_00000000-0000-4000-8000-000000000231',
          expectedPreviousVersion: 0,
          checkpoint: 'TASK_STARTED',
          stage: 'Starting implementation',
          currentGoal: 'Implement the parser.',
          recentChanges: [],
          activeDecisionIds: [],
          activeConceptNames: ['runtime validation'],
          relatedFiles: [],
          nextActions: ['Reach the unknown-field behavior boundary.'],
        },
      })

      const requested = await harness.client.callTool({
        name: 'request_user_decision',
        arguments: {
          schemaVersion: 1,
          projectId: ids.project,
          taskId: ids.task,
          correlationId: ids.correlation,
          idempotencyKey: 'idem_00000000-0000-4000-8000-000000000232',
          expectedTaskRevision: 1,
          expectedContextVersion: 1,
          decision: {
            category: 'DATA_MODEL',
            question: 'Should unknown fields be rejected or retained?',
            reasonRequiredNow: 'The parser result type depends on this behavior.',
            options: [
              {
                key: 'reject',
                label: 'Reject unknown fields',
                description: 'Keep parsing strict.',
                impacts: ['Typos fail early.'],
                tradeoffs: ['New provider fields require schema changes.'],
              },
              {
                key: 'retain',
                label: 'Retain unknown fields',
                description: 'Keep extra fields for inspection.',
                impacts: ['New fields remain visible.'],
                tradeoffs: ['Typos can be less obvious.'],
              },
            ],
            recommendedOptionKey: 'reject',
            recommendationRationale: 'Strict input validation catches mistakes at the boundary.',
            relatedConceptNames: ['runtime validation'],
            sourceReferences: [],
            independentWorkCanContinue: false,
          },
          context: {
            stage: 'Waiting on parser behavior',
            currentGoal: 'Choose the parser behavior.',
            recentChanges: ['Defined the known event variants.'],
            activeConceptNames: ['runtime validation'],
            relatedFiles: [],
            nextActions: ['Apply the user choice.', 'Run parser tests.'],
            blockingReason: 'The parser branch depends on this Decision.',
          },
        },
      })
      const decisionId = String(requested.structuredContent?.decisionId)
      const aggregate = harness.storage.repository.readBuilderTaskAggregate(ids.project, ids.task)
      const decision = aggregate?.decisionRequests[0]
      expect(requested).toMatchObject({
        structuredContent: { accepted: true, decisionId, resourceRevision: 2 },
      })
      expect(decision).toMatchObject({
        id: decisionId,
        contextVersion: 2,
        source: { kind: 'AGENT', role: 'BUILDER' },
        redactionStatus: 'VERIFIED_REDACTED',
      })
      expect(aggregate).toMatchObject({
        task: { status: 'BLOCKED', revision: 2 },
        liveContext: { checkpoint: 'DECISION_REQUIRED', activeDecisionIds: [decisionId] },
      })

      expect(
        await harness.application.executeUi({
          schemaVersion: 1,
          kind: 'UI_OPEN_HELPER',
          correlationId: ids.correlation,
          actor: { kind: 'UI' },
          projectId: ids.project,
          taskId: ids.task,
          question: 'Compare these parser options.',
        }),
      ).toMatchObject({ success: true, data: { activeDecisions: [{ id: decisionId }] } })

      const selectedOptionId = decision?.recommendedOptionId
      expect(selectedOptionId).toBeDefined()
      const resolvedAt = new Date().toISOString()
      expect(
        await harness.application.executeUi({
          schemaVersion: 1,
          kind: 'UI_RESOLVE_DECISION',
          correlationId: ids.correlation,
          actor: { kind: 'UI' },
          idempotencyKey: 'idem_00000000-0000-4000-8000-000000000233',
          resolution: {
            schemaVersion: 1,
            id: ids.resolution,
            decisionId,
            projectId: ids.project,
            taskId: ids.task,
            correlationId: ids.correlation,
            expectedContextVersion: 2,
            selectionKind: 'RECOMMENDATION',
            selectedOptionId,
            rationale: 'I want invalid payloads to fail at the input boundary.',
            helperUsed: true,
            resolvedAt,
            source: { kind: 'USER' },
            redactionStatus: 'VERIFIED_REDACTED',
          },
        }),
      ).toMatchObject({ success: true, data: { resourceRevision: 3 } })

      expect(
        await harness.client.callTool({
          name: 'get_decision_result',
          arguments: {
            schemaVersion: 1,
            kind: 'BUILDER_GET_DECISION_RESULT',
            correlationId: ids.correlation,
            actor: { kind: 'AGENT', role: 'BUILDER' },
            projectId: ids.project,
            taskId: ids.task,
            decisionId,
          },
        }),
      ).toMatchObject({ structuredContent: { resolution: { id: ids.resolution } } })

      expect(
        await harness.client.callTool({
          name: 'apply_decision_result',
          arguments: {
            schemaVersion: 1,
            projectId: ids.project,
            taskId: ids.task,
            decisionId,
            correlationId: ids.correlation,
            idempotencyKey: 'idem_00000000-0000-4000-8000-000000000234',
            expectedTaskRevision: 3,
            expectedContextVersion: 2,
            appliedResult: 'Implemented strict rejection at the parser boundary.',
            sourceReferences: [],
            context: {
              stage: 'Applied strict parser behavior',
              currentGoal: 'Validate the selected parser behavior.',
              recentChanges: ['Implemented unknown-field rejection.'],
              activeConceptNames: ['runtime validation'],
              relatedFiles: [],
              nextActions: ['Run parser tests.'],
            },
          },
        }),
      ).toMatchObject({
        structuredContent: { accepted: true, decisionId, resourceRevision: 3 },
      })
      expect(
        harness.storage.repository.readBuilderTaskAggregate(ids.project, ids.task),
      ).toMatchObject({
        task: { status: 'ACTIVE', revision: 3 },
        liveContext: { contextVersion: 3, activeDecisionIds: [] },
        decisionApplications: [
          {
            decisionId,
            source: { kind: 'AGENT', role: 'BUILDER' },
            redactionStatus: 'VERIFIED_REDACTED',
          },
        ],
      })
    } finally {
      await harness.close()
    }
  })
})
