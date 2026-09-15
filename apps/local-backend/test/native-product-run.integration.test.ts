import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { LOCAL_PROTOCOL_VERSION } from '@vibe-helper/contracts'
import { WorkflowRuntime } from '@vibe-helper/runtime'
import { openInMemorySqliteStorage } from '@vibe-helper/storage-sqlite'
import { describe, expect, it } from 'vitest'
import { LocalCoreClient } from '../../../packages/frontend-client/src/index.js'
import { NativeAgentRelay } from '../src/native-agent-relay.js'
import { createLocalServer } from '../src/server.js'

describe('native IDE product entry', () => {
  it('accepts the existing run API, sends work only to the bound IDE workspace, and cancels with Core intact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibe-native-product-run-'))
    const workspaces = join(root, 'workspaces')
    await mkdir(workspaces)
    const policy = await WorkspacePathPolicy.create(workspaces)
    const storage = await openInMemorySqliteStorage()
    const application = new ApplicationService({ storage, workspacePolicy: policy })
    const relay = new NativeAgentRelay({ application, policy, root, repository: resolve('.') })
    const instanceId = randomUUID()
    const token = randomBytes(32).toString('hex')
    const runtime = new WorkflowRuntime({ application, agents: relay, instanceId })
    const server = createLocalServer({
      application,
      runtime,
      token,
      instanceId,
      mcpHandlers: relay.handlers,
      nativeRelay: relay,
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('LISTEN_FAILED')
    const baseUrl = `http://127.0.0.1:${address.port}`
    relay.setBaseUrl(baseUrl)
    const client = new LocalCoreClient({
      protocolVersion: LOCAL_PROTOCOL_VERSION,
      backendInstanceId: instanceId,
      baseUrl,
      token,
    })
    try {
      expect((await client.health()).agent).toBe('KIRO_IDE_BUILTIN_AGENT')
      const started = await client.startDiscovery(
        { learningGoal: 'TypeScript union viewer' },
        { enrichAfterPreview: false },
      )
      expect(started.run.status).toMatch(/ACCEPTED|RUNNING/)
      const path = `/api/native/next?workspace=${encodeURIComponent(await realpath(workspaces))}`
      expect((await fetch(`${baseUrl}${path}`)).status).toBe(401)
      let job = null
      for (let n = 0; n < 100 && !job; n++) {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const value = await response.json()
        job = value.job
        if (!job) await new Promise((done) => setTimeout(done, 10))
      }
      expect(job).toMatchObject({ role: 'DISCOVERY', workspace: await realpath(workspaces) })
      const cancelled = await client.cancelRun(started.run.id)
      expect(cancelled.status).toBe('CANCELLED')
      const state = await fetch(`${baseUrl}/api/native/jobs/${job.id}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((response) => response.json())
      expect(state.status).toBe('CANCELLED')
      expect(JSON.parse(await readFile(job.bindingFile, 'utf8'))).toEqual({ status: 'REVOKED' })
      const restored = await client.restoreProject(started.projectId)
      expect(restored.discoverySession).not.toBeNull()
      expect(restored.discoveryContext?.previewRound).toBeNull()
    } finally {
      await runtime.close()
      await relay.close()
      server.closeAllConnections()
      await new Promise<void>((done) => server.close(() => done()))
      storage.close()
    }
  })
})
