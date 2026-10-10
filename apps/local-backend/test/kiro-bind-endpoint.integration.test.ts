import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { WorkflowRuntime } from '@vibe-helper/runtime'
import { openInMemorySqliteStorage } from '@vibe-helper/storage-sqlite'
import { describe, expect, it } from 'vitest'
import { createLocalServer } from '../src/server.js'

const projectId = 'project_00000000-0000-4000-8000-000000000001'

describe('Kiro bind endpoint', () => {
  it('passes only a validated folder and consent to the binding manager', async () => {
    const application = new ApplicationService({
      storage: await openInMemorySqliteStorage(),
      workspacePolicy: await WorkspacePathPolicy.create(
        await mkdtemp(join(tmpdir(), 'vibe-kiro-endpoint-')),
      ),
    })
    const runtime = new WorkflowRuntime({
      application,
      instanceId: randomUUID(),
      agents: {
        invoke: async () => {
          throw new Error('not used')
        },
      },
    })
    const calls: unknown[] = []
    const token = randomBytes(32).toString('hex')
    const server = createLocalServer({
      application,
      runtime,
      token,
      instanceId: randomUUID(),
      mcpHandlers: new Map(),
      kiroBindings: {
        bind: async (id, request) => {
          calls.push({ id, request })
          if (request.workspace === '/Users/me/busy') throw new Error('WORKSPACE_FOLDER_NOT_EMPTY')
          return { projectId: id, workspace: request.workspace ?? '/generated', registered: true }
        },
      },
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('listen failed')
    const post = (body: unknown, authorization = `Bearer ${token}`) =>
      fetch(`http://127.0.0.1:${address.port}/api/kiro/bind`, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    try {
      const ok = await post({
        protocolVersion: 1,
        projectId,
        workspace: '/Users/me/memo',
        allowCoreTools: true,
      })
      expect(ok.status).toBe(200)
      expect(await ok.json()).toMatchObject({
        success: true,
        data: { workspace: '/Users/me/memo' },
      })
      const refused = await post({ protocolVersion: 1, projectId, workspace: '/Users/me/busy' })
      expect(refused.status).toBe(409)
      expect(await refused.json()).toEqual({ success: false, error: 'WORKSPACE_FOLDER_NOT_EMPTY' })
      for (const invalid of [
        { protocolVersion: 1, projectId, workspace: 3 },
        { protocolVersion: 1, projectId, workspace: '' },
        { protocolVersion: 1, projectId, allowCoreTools: 'yes' },
        { protocolVersion: 1, projectId, extra: true },
        { protocolVersion: 2, projectId },
        { protocolVersion: 1, projectId: 'project_x' },
      ]) {
        const response = await post(invalid)
        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'KIRO_BIND_REQUEST_INVALID' })
      }
      expect((await post({ protocolVersion: 1, projectId }, 'Bearer wrong')).status).toBe(401)
      expect(calls).toEqual([
        { id: projectId, request: { workspace: '/Users/me/memo', allowCoreTools: true } },
        { id: projectId, request: { workspace: '/Users/me/busy' } },
      ])
    } finally {
      server.closeAllConnections()
      await new Promise<void>((done) => server.close(() => done()))
      await runtime.close()
    }
  })
})
