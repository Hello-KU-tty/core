import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import {
  LocalCoreClient,
  localRunSchema,
  LocalProgramAdapter,
  type LocalRun,
  type LocalRunEvent,
  type ProgramEvent,
} from '../src/index.js'

const instance = randomUUID()
const projectId = `project_${randomUUID()}`
const connection = {
  protocolVersion: 1 as const,
  backendInstanceId: instance,
  baseUrl: 'http://127.0.0.1:47831',
  token: 'a'.repeat(64),
}
const run: LocalRun = {
  protocolVersion: 1,
  backendInstanceId: instance,
  id: `run_${randomUUID()}`,
  projectId,
  kind: 'BUILDER',
  phase: 'BUILDER',
  status: 'SUCCEEDED',
  outcome: 'TURN_ENDED',
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
  errorCode: null,
  lastSequence: 3,
  retainedFromSequence: 1,
}
const event = (sequence: number, body: Partial<LocalRunEvent>): LocalRunEvent => ({
  runId: run.id,
  projectId,
  sequence,
  kind: 'TEXT',
  transient: true,
  redactionStatus: 'VERIFIED_REDACTED',
  ...body,
})

describe('external frontend SDK stream', () => {
  it('keeps the frontend loading/partial/failure fixtures on the real run contract', async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL('../../../examples/kiro-panel/fixtures/run-states.json', import.meta.url),
        'utf8',
      ),
    )
    expect(fixture.mode).toBe('MOCK')
    for (const variant of Object.values(fixture.variants)) {
      expect(localRunSchema.safeParse({ ...fixture.base, ...(variant as object) }).success).toBe(
        true,
      )
    }
  })
  it('replays a finished run across chunks before reporting completion', async () => {
    const chunks = [
      `event: run\ndata: ${JSON.stringify(run)}\n\n`,
      `event: progress\ndata: ${JSON.stringify(event(1, { kind: 'STATE', run: { ...run, status: 'RUNNING', outcome: 'PENDING', lastSequence: 1 } }))}\n\n`,
      `event: progress\ndata: ${JSON.stringify(event(2, { text: 'Actual test output' }))}\n\n`,
      `event: progress\ndata: ${JSON.stringify(event(3, { kind: 'STATE', run }))}\n\n`,
    ]
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              const chunk = chunks.shift()
              if (chunk) controller.enqueue(new TextEncoder().encode(chunk))
              else controller.close()
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    )
    const client = new LocalCoreClient(connection, { fetch: fetcher })
    const seen: LocalRunEvent[] = []
    expect(await client.watchRun(run.id, (e) => seen.push(e))).toMatchObject({
      status: 'SUCCEEDED',
    })
    expect(seen.map((e) => e.sequence)).toEqual([1, 2, 3])
    expect(seen[1]?.text).toBe('Actual test output')
  })
  it('rejects another backend instance and disallows non-loopback descriptors', async () => {
    const client = new LocalCoreClient(connection, {
      fetch: async () => Response.json({ protocolVersion: 1, backendInstanceId: randomUUID() }),
    })
    await expect(client.health()).rejects.toMatchObject({
      code: 'BACKEND_RESTARTED_RELOAD_CONNECTION',
    })
    expect(
      () => new LocalCoreClient({ ...connection, baseUrl: 'http://example.com:47831' }),
    ).toThrow()
    expect(
      () => new LocalCoreClient({ ...connection, baseUrl: 'http://127.0.0.1:99999' }),
    ).toThrow()
  })
})

describe('program AgentAdapter bridge', () => {
  it('selects permissions by explicit role, preserves failed tool output, and ends only once', async () => {
    const client = new LocalCoreClient(connection)
    vi.spyOn(client, 'restoreProject').mockResolvedValue({
      currentTask: { id: `task_${randomUUID()}`, revision: 2 },
    } as Awaited<ReturnType<LocalCoreClient['restoreProject']>>)
    const start = vi.spyOn(client, 'startRun').mockResolvedValue(run)
    vi.spyOn(client, 'watchRun').mockImplementation(async (_id, notify) => {
      notify(
        event(1, {
          kind: 'TOOL',
          update: { toolCallId: 'tool-1', kind: 'execute', title: 'test', status: 'in_progress' },
        }),
      )
      notify(
        event(2, {
          kind: 'TOOL',
          update: {
            toolCallId: 'tool-1',
            kind: 'execute',
            title: 'test',
            status: 'failed',
            content: 'GUARD_SHELL_DENIED',
          },
        }),
      )
      notify(event(3, { text: 'Tests could not execute.' }))
      return run
    })
    const seen: ProgramEvent[] = []
    await new LocalProgramAdapter(client, () => projectId).startTurn(
      { agent: 'builder', text: 'Continue', allowWorkStream: true },
      (e) => seen.push(e),
    )
    await vi.waitFor(() => expect(seen.at(-1)?.kind).toBe('completed'))
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'BUILDER', expectedTaskRevision: 2 }),
    )
    expect(seen).toContainEqual(expect.objectContaining({ kind: 'work_item_result', failed: true }))
    expect(JSON.stringify(seen)).toContain('GUARD_SHELL_DENIED')
    expect(seen.filter((e) => e.kind === 'completed')).toHaveLength(1)
    seen.length = 0
    await new LocalProgramAdapter(client, () => projectId).startTurn(
      { agent: 'helper', text: 'Explain', allowWorkStream: true },
      (e) => seen.push(e),
    )
    await vi.waitFor(() => expect(seen.at(-1)?.kind).toBe('completed'))
    expect(start).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'HELPER' }))
    expect(seen.some((e) => e.kind === 'work_item')).toBe(false)
  })
})
