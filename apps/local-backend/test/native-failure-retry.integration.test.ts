import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { type LocalRunInput, LOCAL_PROTOCOL_VERSION } from '@vibe-helper/contracts'
import { WorkflowRuntime } from '@vibe-helper/runtime'
import { openSqliteStorage } from '@vibe-helper/storage-sqlite'
import { expect, it } from 'vitest'
import {
  entityId,
  LocalCoreClient,
  uiMetadata,
} from '../../../packages/frontend-client/src/index.js'
import { NativeAgentRelay } from '../src/native-agent-relay.js'
import { createLocalServer } from '../src/server.js'

const require = createRequire(import.meta.url)
const { classifyNativeRpcError } =
  require('../../../examples/kiro-native-host/native-rpc-error.cjs') as {
    classifyNativeRpcError: (error: unknown) => string
  }

it('preserves classified native errors over HTTP and retries only the same explicit Discovery', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-native-failure-retry-')))
  const workspaces = join(root, 'workspaces')
  await mkdir(workspaces)
  const storage = await openSqliteStorage({ dataDirectory: join(root, 'data') })
  const application = new ApplicationService({
    storage,
    workspacePolicy: await WorkspacePathPolicy.create(workspaces),
  })
  const relay = new NativeAgentRelay({
    application,
    policy: await WorkspacePathPolicy.create(workspaces),
    root,
    repository: resolve('.'),
  })
  const instanceId = randomUUID()
  const runtime = new WorkflowRuntime({ application, agents: relay, instanceId })
  const token = randomBytes(32).toString('hex')
  const server = createLocalServer({
    application,
    runtime,
    token,
    instanceId,
    nativeRelay: relay,
    mcpHandlers: relay.handlers,
  })
  await new Promise<void>((done, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', done)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('TEST_LISTENER_REQUIRED')
  const baseUrl = `http://127.0.0.1:${address.port}`
  relay.setBaseUrl(baseUrl)
  const client = new LocalCoreClient({
    protocolVersion: LOCAL_PROTOCOL_VERSION,
    backendInstanceId: instanceId,
    token,
    baseUrl,
  })
  const projectId = entityId('project')
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  let before: Awaited<ReturnType<LocalCoreClient['restoreProject']>> | undefined
  try {
    await client.execute({
      ...uiMetadata(),
      kind: 'UI_START_DISCOVERY',
      projectId,
      idempotencyKey: entityId('idem'),
      input: { learningGoal: 'Synthetic explicit retry after provider failure' },
    })
    before = await client.restoreProject(projectId)
    if (before.discoverySession === null) throw new Error('TEST_SESSION_REQUIRED')
    const payloads = [
      { code: -32603, data: { name: 'UsageLimitReachedError' } },
      { code: -32000, data: { errorType: 'ModelRegistryUnauthenticatedError' } },
      { code: -32000, data: { errorType: 'ModelRegistryUnavailableError' } },
      { code: -32603, data: { name: 'UnknownProviderError', message: 'token=synthetic-secret' } },
    ]
    const expected = [
      'NATIVE_QUOTA_EXCEEDED',
      'NATIVE_AUTH_REQUIRED',
      'NATIVE_MODEL_UNAVAILABLE',
      'NATIVE_RPC_REJECTED',
    ]
    const nativeIds = new Set<string>()
    for (const [index, payload] of payloads.entries()) {
      const request: LocalRunInput = {
        kind: 'DISCOVERY',
        projectId,
        idempotencyKey: entityId('idem'),
        discoverySessionId: before.discoverySession.id,
        expectedSessionRevision: before.discoverySession.revision,
        phase: 'PREVIEW',
        enrichAfterPreview: false,
      }
      const run = await client.startRun(request)
      let nativeId: string | undefined
      let bindingFile: string | undefined
      for (let attempt = 0; attempt < (process.platform === 'win32' ? 1500 : 100); attempt++) {
        const response = await fetch(
          `${baseUrl}/api/native/next?workspace=${encodeURIComponent(workspaces)}`,
          { headers: auth },
        )
        expect(response.ok).toBe(true)
        const next = (await response.json()) as {
          job?: { id: string; role: string; projectId: string; bindingFile: string | null }
        }
        if (next.job) {
          expect(next.job.role).toBe('DISCOVERY')
          expect(next.job.projectId).toBe(projectId)
          nativeId = next.job.id
          bindingFile = next.job.bindingFile ?? undefined
          break
        }
        await new Promise((done) => setTimeout(done, 20))
      }
      expect(nativeId).toBeDefined()
      if (nativeId === undefined) throw new Error('TEST_NATIVE_JOB_REQUIRED')
      if (bindingFile === undefined) throw new Error('TEST_NATIVE_BINDING_REQUIRED')
      const descriptorFile = bindingFile
      const binding = JSON.parse(await readFile(descriptorFile, 'utf8')) as {
        url: string
        authorization: string
      }
      const oldHandler = relay.handlers.get(new URL(binding.url).pathname)
      expect(oldHandler).toBeDefined()
      expect(nativeIds.has(nativeId)).toBe(false)
      nativeIds.add(nativeId)
      const errorCode = classifyNativeRpcError(payload)
      expect(errorCode).toBe(expected[index])
      const complete = await fetch(`${baseUrl}/api/native/jobs/${nativeId}/complete`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ errorCode }),
      })
      expect(complete.ok).toBe(true)
      // A lingering IDE-owned bridge/profile is not a live Core grant. Failure
      // revokes authority synchronously, independently of its process lifetime.
      expect(relay.handlers.has(new URL(binding.url).pathname)).toBe(false)
      expect(
        (
          await oldHandler?.fetch(
            new Request(binding.url, {
              headers: { authorization: binding.authorization },
            }),
          )
        )?.status,
      ).toBe(401)
      expect(
        (
          await fetch(binding.url, {
            headers: { authorization: binding.authorization },
          })
        ).status,
      ).toBe(404)
      await expect
        .poll(() => readFile(descriptorFile, 'utf8'))
        .toBe(JSON.stringify({ status: 'REVOKED' }))
      const final = await client.watchRun(run.id, () => {})
      expect(final).toMatchObject({ status: 'FAILED', outcome: 'NONE', errorCode })
      expect(JSON.stringify(final)).not.toContain('synthetic-secret')
      expect((await client.startRun(request)).id).toBe(run.id)
      expect(await client.listRuns(projectId)).toHaveLength(index + 1)
      const restored = await client.restoreProject(projectId)
      expect(restored.project).toEqual(before.project)
      expect(restored.discoverySession).toEqual(before.discoverySession)
      expect(restored.discoveryContext?.previewRound).toBeNull()
      expect(restored.currentTask).toBeNull()
      const idle = await fetch(
        `${baseUrl}/api/native/next?workspace=${encodeURIComponent(workspaces)}`,
        { headers: auth },
      )
      expect(((await idle.json()) as { job: unknown }).job).toBeNull()
    }
    expect(nativeIds.size).toBe(4)
  } finally {
    await runtime.close()
    await relay.close()
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
    storage.close()
  }
  // Current run records are intentionally transient. Verify the distinction
  // from durable Project/Session state after a real SQLite reopen.
  const reopened = await openSqliteStorage({ dataDirectory: join(root, 'data') })
  let invocations = 0
  const resumed = new ApplicationService({
    storage: reopened,
    workspacePolicy: await WorkspacePathPolicy.create(workspaces),
  })
  const resumedRuntime = new WorkflowRuntime({
    application: resumed,
    instanceId: randomUUID(),
    agents: {
      invoke: async () => {
        invocations++
        throw new Error('RESTORE_MUST_NOT_INVOKE_AGENT')
      },
    },
  })
  try {
    const restored = await resumed.executeUi({
      ...uiMetadata(),
      kind: 'UI_RESTORE_PROJECT_SESSION',
      projectId,
      helperConversationLimit: 20,
    })
    expect(restored.success).toBe(true)
    if (!restored.success) throw new Error('TEST_RESTORE_REQUIRED')
    expect(restored.data).toMatchObject({
      project: before?.project,
      discoverySession: before?.discoverySession,
    })
    expect(resumedRuntime.list(projectId)).toEqual([])
    expect(invocations).toBe(0)
    expect(reopened.checkIntegrity()).toMatchObject({ quickCheck: 'ok' })
  } finally {
    await resumedRuntime.close()
    reopened.close()
  }
}, 120_000)
