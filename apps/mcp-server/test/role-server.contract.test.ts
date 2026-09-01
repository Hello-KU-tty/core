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
import { createRoleBoundMcpServer, ROLE_TOOL_CATALOG } from '../src/role-server.js'

interface ConnectedHarness {
  readonly client: Client
  readonly server: McpServer
  readonly storage: Awaited<ReturnType<typeof openInMemorySqliteStorage>>
  close(): Promise<void>
}

interface ConnectRoleOptions {
  readonly seedDiscovery?: boolean
  readonly seedSpecReview?: boolean
  readonly seedBuilder?: boolean
  readonly now?: () => Date
  readonly generateId?: (
    prefix: 'candidate' | 'candidate_round' | 'learning_spec' | 'context' | 'completion_report',
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
    storage,
    close: async () => {
      await client.close()
      await server.close()
      storage.close()
    },
  }
}

const expectedCatalog: Readonly<Record<AgentRole, readonly string[]>> = {
  DISCOVERY: ['get_discovery_context', 'submit_candidate_round', 'submit_learning_spec'],
  BUILDER: [
    'get_builder_task',
    'start_task',
    'update_build_context',
    'request_user_decision',
    'get_decision_result',
    'complete_task',
  ],
  HELPER: ['get_helper_context', 'request_builder_context_refresh'],
  EVIDENCE_ANALYST: ['get_episode_context', 'submit_evidence_proposals'],
}

describe('role-bound MCP server', () => {
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

  it('expands a concise Discovery proposal with trusted metadata before application', async () => {
    const generatedCandidateId = 'candidate_00000000-0000-4000-8000-000000000071'
    const generatedRoundId = 'candidate_round_00000000-0000-4000-8000-000000000072'
    const harness = await connectRole('DISCOVERY', {
      seedDiscovery: true,
      now: () => new Date(timestamp),
      generateId: (prefix) => (prefix === 'candidate' ? generatedCandidateId : generatedRoundId),
    })
    try {
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
          candidates: [
            {
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
              risks: candidateFixture.risks,
              generationTags: candidateFixture.generationTags,
              evaluation: candidateFixture.evaluation,
            },
          ],
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
})
