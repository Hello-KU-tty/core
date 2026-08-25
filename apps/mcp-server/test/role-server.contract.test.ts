import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, type McpServer } from '@modelcontextprotocol/server'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import type { AgentRole } from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import { openInMemorySqliteStorage } from '../../../packages/storage-sqlite/src/index.js'
import { ids } from '../../../packages/contracts/test/fixtures.js'
import { createRoleBoundMcpServer, ROLE_TOOL_CATALOG } from '../src/role-server.js'

interface ConnectedHarness {
  readonly client: Client
  readonly server: McpServer
  close(): Promise<void>
}

const connectRole = async (role: AgentRole): Promise<ConnectedHarness> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-mcp-workspaces-'))
  const storage = await openInMemorySqliteStorage()
  const application = new ApplicationService({
    storage,
    workspacePolicy: await WorkspacePathPolicy.create(workspaceRoot),
  })
  const server = createRoleBoundMcpServer({ role, application })
  const client = new Client({ name: 'vibe-helper-contract-test', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return {
    client,
    server,
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
})
