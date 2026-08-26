import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, type McpServer } from '@modelcontextprotocol/server'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { discoverySessionSchema, projectSchema, type AgentRole } from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import { openInMemorySqliteStorage } from '../../../packages/storage-sqlite/src/index.js'
import {
  candidateFixture,
  candidateRoundFixture,
  discoverySessionFixture,
  ids,
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
  readonly now?: () => Date
  readonly generateId?: (prefix: 'candidate' | 'candidate_round') => string
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
})
