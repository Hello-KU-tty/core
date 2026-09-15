import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { LOCAL_PROTOCOL_VERSION, type LocalRunEvent } from '@vibe-helper/contracts'
import { WorkflowRuntime, type WorkflowAgentPort } from '@vibe-helper/runtime'
import { openSqliteStorage } from '@vibe-helper/storage-sqlite'
import {
  LocalCoreClient,
  entityId,
  uiMetadata,
} from '../../../packages/frontend-client/src/index.js'
import { createLocalServer } from '../src/server.js'

async function harness(agents: WorkflowAgentPort, directory?: string) {
  const root = directory ?? (await mkdtemp(join(tmpdir(), 'vibe-helper-local-server-')))
  await mkdir(join(root, 'workspaces'), { recursive: true })
  const storage = await openSqliteStorage({ dataDirectory: join(root, 'data') })
  const application = new ApplicationService({
    storage,
    workspacePolicy: await WorkspacePathPolicy.create(join(root, 'workspaces')),
  })
  const instanceId = randomUUID()
  const token = randomBytes(32).toString('hex')
  const runtime = new WorkflowRuntime({ application, agents, instanceId })
  const mcpHandlers = new Map<
    string,
    { fetch(request: Request): Promise<Response>; close(): Promise<void> }
  >()
  const server = createLocalServer({
    application,
    runtime,
    token,
    instanceId,
    mcpHandlers,
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('listen failed')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const client = new LocalCoreClient({
    protocolVersion: LOCAL_PROTOCOL_VERSION,
    backendInstanceId: instanceId,
    baseUrl,
    token,
  })
  return {
    root,
    client,
    baseUrl,
    token,
    runtime,
    mcpHandlers,
    application,
    close: async () => {
      await runtime.close()
      server.closeAllConnections()
      await new Promise<void>((done) => server.close(() => done()))
      storage.close()
    },
  }
}
const noSubmit = () =>
  vi.fn<WorkflowAgentPort['invoke']>(async () => ({
    text: 'No tool submitted.',
    stopReason: 'end_turn',
  }))

describe('Crew-independent loopback backend and real client', () => {
  it('routes MCP handlers registered after the server starts', async () => {
    const h = await harness({ invoke: noSubmit() })
    try {
      h.mcpHandlers.set('/mcp/late-native-check', {
        fetch: async () => new Response('LATE_HANDLER_READY', { status: 200 }),
        close: async () => undefined,
      })
      const response = await fetch(`${h.baseUrl}/mcp/late-native-check`)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('LATE_HANDLER_READY')
    } finally {
      await h.close()
    }
  })
  it('persists UI Discovery and History over restart without any model call', async () => {
    const invoke = noSubmit()
    let h = await harness({ invoke })
    const projectId = entityId('project')
    try {
      expect(await h.client.health()).toMatchObject({ protocolVersion: 1 })
      expect((await h.client.listProjects()).projects).toHaveLength(0)
      const request = {
        ...uiMetadata(),
        kind: 'UI_START_DISCOVERY' as const,
        projectId,
        idempotencyKey: entityId('idem'),
        input: { learningGoal: 'TypeScript state transitions' },
      }
      await h.client.execute(request)
      await h.client.execute(request)
      const before = await h.client.restoreProject(projectId)
      expect((await h.client.listProjects()).projects).toHaveLength(1)
      await h.close()
      h = await harness({ invoke }, h.root)
      const after = await h.client.restoreProject(projectId)
      expect(after.project).toEqual(before.project)
      expect(after.discoverySession).toEqual(before.discoverySession)
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      await h.close()
    }
  })
  it('requires local authentication, matching protocol and UI provenance; exposes no Agent mutation route', async () => {
    const h = await harness({ invoke: noSubmit() })
    const headers = { Authorization: `Bearer ${h.token}`, 'content-type': 'application/json' }
    try {
      expect((await fetch(`${h.baseUrl}/health`)).status).toBe(401)
      expect(
        (
          await fetch(`${h.baseUrl}/health`, {
            headers: { ...headers, Origin: 'https://evil.example' },
          })
        ).status,
      ).toBe(403)
      const rebindingStatus = await new Promise((resolveStatus) => {
        const request = httpRequest(
          `${h.baseUrl}/health`,
          { headers: { ...headers, Host: 'evil.example' } },
          (response) => {
            response.resume()
            resolveStatus(response.statusCode)
          },
        )
        request.end()
      })
      expect(rebindingStatus).toBe(403)
      expect(
        (await fetch(`${h.baseUrl}/api/test/agent`, { method: 'POST', headers, body: '{}' }))
          .status,
      ).toBe(404)
      expect(
        (
          await fetch(`${h.baseUrl}/api/application`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ protocolVersion: 999, request: {} }),
          })
        ).status,
      ).toBe(409)
      const forged = await fetch(`${h.baseUrl}/api/application`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          protocolVersion: 1,
          request: {
            ...uiMetadata(),
            kind: 'UI_LIST_PROJECTS',
            limit: 5,
            actor: { kind: 'AGENT', role: 'DISCOVERY' },
          },
        }),
      })
      expect(forged.status).toBe(400)
      expect(await forged.text()).not.toContain(h.token)
      expect((await fetch(`${h.baseUrl}/health?token=${h.token}`, { headers })).status).toBe(404)
    } finally {
      await h.close()
    }
  })
  it('distinguishes stream completion without a durable result and validates run idempotency', async () => {
    const invoke = noSubmit()
    const h = await harness({ invoke })
    try {
      const { projectId, run } = await h.client.startDiscovery(
        { learningGoal: 'Independent fixture' },
        { enrichAfterPreview: false },
      )
      const events: LocalRunEvent[] = []
      const result = await h.client.watchRun(run.id, (event) => events.push(event))
      expect(result).toMatchObject({
        status: 'FAILED',
        errorCode: 'AGENT_RESULT_NOT_STORED',
        outcome: 'NONE',
      })
      expect(events.some((e) => e.kind === 'STATE')).toBe(true)
      expect(invoke).toHaveBeenCalledTimes(1)
      const snapshot = await h.client.restoreProject(projectId)
      const request = {
        kind: 'DISCOVERY' as const,
        projectId,
        discoverySessionId: snapshot.discoverySession?.id ?? '',
        expectedSessionRevision: snapshot.discoverySession?.revision ?? 0,
        idempotencyKey: entityId('idem'),
        phase: 'PREVIEW' as const,
        enrichAfterPreview: false,
      }
      const retry = await h.client.startRun(request)
      const duplicate = await h.client.startRun(request)
      expect(duplicate.id).toBe(retry.id)
      await expect(h.client.startRun({ ...request, phase: 'SPEC' })).rejects.toMatchObject({
        code: 'RUN_IDEMPOTENCY_CONFLICT',
      })
      await expect(
        h.client.startRun({
          ...request,
          idempotencyKey: entityId('idem'),
          expectedSessionRevision: 99,
        }),
      ).rejects.toMatchObject({ code: 'STALE_DISCOVERY_REVISION' })
    } finally {
      await h.close()
    }
  })
  it('cancels owned runs, closes streams and rejects simultaneous duplicate role dispatch', async () => {
    const invoke = vi.fn<WorkflowAgentPort['invoke']>(
      (request) =>
        new Promise((_done, reject) => {
          request.signal.addEventListener('abort', () => reject(new Error('stopped')), {
            once: true,
          })
        }),
    )
    const h = await harness({ invoke })
    try {
      const { projectId, run } = await h.client.startDiscovery({
        learningGoal: 'Cancellation fixture',
      })
      const snapshot = await h.client.restoreProject(projectId)
      await expect(
        h.client.startRun({
          kind: 'DISCOVERY',
          projectId,
          discoverySessionId: snapshot.discoverySession?.id ?? '',
          expectedSessionRevision: snapshot.discoverySession?.revision ?? 0,
          idempotencyKey: entityId('idem'),
          phase: 'PREVIEW',
        }),
      ).rejects.toMatchObject({ code: 'RUN_BUSY' })
      const watching = h.client.watchRun(run.id, () => undefined)
      expect(await h.client.cancelRun(run.id)).toMatchObject({ status: 'CANCELLED' })
      expect(await watching).toMatchObject({ status: 'CANCELLED' })
      expect(invoke).toHaveBeenCalledTimes(1)
      expect((await h.client.restoreProject(projectId)).discoveryContext?.previewRound).toBeNull()
    } finally {
      await h.close()
    }
  })
})
