import { describe, expect, it, vi } from 'vitest'

import { CrewAgentModeClient } from '../src/agent-mode-client.js'

const projectId = 'project_00000000-0000-4000-8000-000000000001'
const taskId = 'task_00000000-0000-4000-8000-000000000009'
const workspaceDirectory =
  '/private/tmp/vibe-helper/generated-workspaces/projects/project_00000000-0000-4000-8000-000000000001'
const builderSlot = `vibe-helper-builder-v7-${projectId}`
const helperSlot = `vibe-helper-helper-v3-${projectId}`

function sseResponse(payloads: readonly string[]) {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      payloads.forEach((payload, index) => {
        const block = `data: ${payload}\n\n`
        const split = Math.max(1, Math.floor(block.length / 2))
        controller.enqueue(encoder.encode(block.slice(0, split)))
        controller.enqueue(encoder.encode(block.slice(split)))
        if (index === payloads.length - 1) controller.close()
      })
    },
  })
  return { ok: true, status: 200, body, text: async () => '' }
}

describe('Crew Agent Mode client', () => {
  it('returns a redacted structured session for the host-native renderer', async () => {
    const client = new CrewAgentModeClient({
      get: vi.fn(async (path: string) =>
        path === '/api/chat/slots'
          ? [{ key: helperSlot }]
          : {
              running: true,
              messages: [
                {
                  role: 'user',
                  content:
                    '현재 작업을 이어서 구현해줘.\n\nCore tool identifiers: schemaVersion=1, projectId=project_internal, taskId=task_internal. Read Core before acting.',
                },
                {
                  role: 'assistant',
                  content:
                    'Changed /Users/example/private/file.ts token=synthetic-secret\n[OPTIONS: keep | change]',
                  toolCall: { path: '/Users/example/private/file.ts' },
                },
                {
                  role: 'system',
                  content: JSON.stringify({ kind: 'stop_event', state: 'stopped' }),
                },
              ],
            },
      ),
      post: vi.fn(),
    })

    const session = await client.readRenderableSession(helperSlot)

    expect(session.running).toBe(true)
    expect(JSON.stringify(session.messages)).toContain('[REDACTED_PATH]')
    expect(JSON.stringify(session.messages)).toContain('token=[REDACTED]')
    expect(JSON.stringify(session.messages)).toContain('[OPTIONS: keep | change]')
    expect(JSON.stringify(session.messages)).toContain('현재 작업을 이어서 구현해줘.')
    expect(JSON.stringify(session.messages)).not.toContain('Core tool identifiers')
    expect(JSON.stringify(session.messages)).not.toContain('project_internal')
    expect(JSON.stringify(session.messages)).not.toContain('/Users/example/private/file.ts')
    expect(JSON.stringify(session.messages)).not.toContain('synthetic-secret')
    expect(JSON.stringify(session.messages)).not.toContain('stop_event')
    expect(JSON.stringify(session.messages)).toContain('Agent 실행이 중지되었습니다.')
  })

  it('stops only a bounded Vibe Helper Agent session', async () => {
    const post = vi.fn(async () => ({ ok: true }))
    const client = new CrewAgentModeClient({ get: vi.fn(), post })

    await client.stopSession(builderSlot)

    expect(post).toHaveBeenCalledWith(`/api/chat/slots/${builderSlot}/stop`, {})
    await expect(
      client.stopSession('another-app-project_00000000-0000-4000-8000-000000000001'),
    ).rejects.toThrow('outside the Vibe Helper session boundary')
  })

  it('binds the exact Core workspace before Builder dispatch and streams redacted progress', async () => {
    const calls: string[] = []
    const post = vi.fn(async (path: string, body: Readonly<Record<string, unknown>>) => {
      calls.push(path)
      if (path === '/api/chat/slots') return { key: builderSlot }
      return { ok: true, project: body.project }
    })
    const streamingFetch = vi.fn(async () => {
      calls.push('/api/chat')
      return sseResponse([
        JSON.stringify({ type: 'chunk', cls: 'chunk', content: 'Incremental ' }),
        JSON.stringify({
          type: 'message',
          content: JSON.stringify({ type: 'chunk', cls: 'chunk', content: 'transport chunk' }),
        }),
        JSON.stringify({ type: 'tool_call', command: 'read src/index.ts' }),
        JSON.stringify({ type: 'file_change', summary: `${workspaceDirectory}/src/index.ts` }),
        JSON.stringify({ type: 'status', command: 'pnpm test' }),
        JSON.stringify({ type: 'error', summary: 'token=synthetic-secret failed' }),
        JSON.stringify({
          type: 'message',
          content: 'The socket error path is implemented as a normal message.',
        }),
        JSON.stringify({
          type: 'message',
          content: JSON.stringify({
            slot: builderSlot,
            pct: 12.5,
            used_tokens: 125_375,
            window_tokens: 1_000_000,
          }),
        }),
        JSON.stringify({
          type: 'message',
          content: `Finished ${workspaceDirectory}/src/index.ts`,
        }),
        '[DONE]',
      ])
    })
    const events: Array<{ kind: string; summary: string }> = []
    const client = new CrewAgentModeClient(
      { get: vi.fn(async () => []), post },
      { fetch: streamingFetch },
    )

    const receipt = await client.dispatchBuilder({
      projectId,
      taskId,
      workspaceDirectory,
      message: 'Continue the Builder task.',
      context: 'Private Core context for the Builder.',
      onEvent: (event) => events.push(event),
    })
    const completion = await receipt.completion

    expect(receipt.slotKey).toBe(builderSlot)
    expect(calls).toEqual([
      '/api/chat/slots',
      `/api/chat/slots/${builderSlot}/project`,
      `/api/chat/slots/${builderSlot}/context`,
      '/api/chat',
    ])
    expect(post).toHaveBeenNthCalledWith(1, '/api/chat/slots', {
      name: builderSlot,
      agent: 'vibe-helper-builder',
      memory_mode: 'temporary',
    })
    expect(post).toHaveBeenNthCalledWith(2, `/api/chat/slots/${builderSlot}/project`, {
      project: workspaceDirectory,
    })
    expect(post).toHaveBeenNthCalledWith(3, `/api/chat/slots/${builderSlot}/context`, {
      content: 'Private Core context for the Builder.',
      source: 'vibe-helper-core',
      ephemeral: true,
      maxAge: 300,
    })
    expect(streamingFetch).toHaveBeenCalledWith('/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Continue the Builder task.',
        slot: builderSlot,
        agent: 'vibe-helper-builder',
      }),
    })
    expect(events.map((event) => event.kind)).toEqual([
      'TOOL_CALL',
      'FILE_CHANGE',
      'TEST_RESULT',
      'ERROR',
      'MESSAGE',
      'MESSAGE',
    ])
    expect(
      events
        .filter((event) => event.kind === 'MESSAGE')
        .map(({ kind, summary }) => ({ kind, summary })),
    ).toEqual([
      { kind: 'MESSAGE', summary: 'The socket error path is implemented as a normal message.' },
      { kind: 'MESSAGE', summary: 'Finished [WORKSPACE]/src/index.ts' },
    ])
    expect(JSON.stringify(events)).not.toContain(workspaceDirectory)
    expect(JSON.stringify(events)).not.toContain('synthetic-secret')
    expect(JSON.stringify(events)).not.toContain(builderSlot)
    expect(JSON.stringify(events)).not.toContain('transport chunk')
    expect(events[1]?.summary).toContain('[WORKSPACE]')
    expect(completion).toEqual({
      status: 'DONE',
      assistantText: 'Finished [WORKSPACE]/src/index.ts',
      assistantSummary: 'Finished [WORKSPACE]/src/index.ts',
    })
  })

  it('refuses an existing Builder slot whose workspace cannot be verified', async () => {
    const post = vi.fn()
    const streamingFetch = vi.fn()
    const client = new CrewAgentModeClient(
      {
        get: vi.fn(async () => [
          {
            key: builderSlot,
            agent: 'vibe-helper-builder',
            project: '/private/tmp/another-project',
            messages: [{ role: 'assistant', content: 'Existing run' }],
          },
        ]),
        post,
      },
      { fetch: streamingFetch },
    )

    await expect(
      client.dispatchBuilder({
        projectId,
        taskId,
        workspaceDirectory,
        message: 'Continue.',
        context: 'Private Core context.',
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow('Builder slot workspace cannot be verified before dispatch.')
    expect(post).not.toHaveBeenCalled()
    expect(streamingFetch).not.toHaveBeenCalled()
  })

  it('keeps Helper in a separate read-only slot and returns its redacted answer', async () => {
    const longAnswer = `The recommendation catches invalid input. token=synthetic-secret ${'and keeps the full explanation visible. '.repeat(10)}\n[OPTIONS: compare again | show code]`
    const post = vi.fn(async (path: string) =>
      path === '/api/chat/slots' ? { key: helperSlot } : { ok: true },
    )
    const streamingFetch = vi.fn(async () =>
      sseResponse([
        JSON.stringify({
          type: 'message',
          content: longAnswer,
        }),
        '[DONE]',
      ]),
    )
    const chunks: string[] = []
    const client = new CrewAgentModeClient(
      { get: vi.fn(async () => []), post },
      { fetch: streamingFetch },
    )

    const receipt = await client.dispatchHelper({
      projectId,
      message: '추천 이유 설명해줘',
      context: 'Private Core context for the Helper.',
      onText: (text) => chunks.push(text),
    })
    const completion = await receipt.completion

    expect(receipt.slotKey).toBe(helperSlot)
    expect(post).toHaveBeenCalledTimes(2)
    expect(post).toHaveBeenNthCalledWith(1, '/api/chat/slots', {
      name: helperSlot,
      agent: 'vibe-helper-helper',
      memory_mode: 'temporary',
    })
    expect(post).toHaveBeenNthCalledWith(2, `/api/chat/slots/${helperSlot}/context`, {
      content: 'Private Core context for the Helper.',
      source: 'vibe-helper-core',
      ephemeral: true,
      maxAge: 300,
    })
    expect(streamingFetch).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        body: JSON.stringify({
          message: '추천 이유 설명해줘',
          slot: helperSlot,
          agent: 'vibe-helper-helper',
        }),
      }),
    )
    expect(chunks.join('')).not.toContain('synthetic-secret')
    expect(completion.status).toBe('DONE')
    expect(completion.assistantText.length).toBeGreaterThan(240)
    expect(completion.assistantText).not.toContain('synthetic-secret')
    expect(completion.assistantText).toContain('and keeps the full explanation visible.')
    expect(completion.assistantSummary).toHaveLength(240)
    expect(completion.assistantSummary).not.toContain('[OPTIONS:')
    expect(completion.assistantText.startsWith(completion.assistantSummary)).toBe(true)
  })

  it('fails closed when private Core context cannot be injected', async () => {
    const streamingFetch = vi.fn()
    const client = new CrewAgentModeClient(
      {
        get: vi.fn(async () => []),
        post: vi.fn(async (path: string) =>
          path === '/api/chat/slots' ? { key: helperSlot } : { ok: false },
        ),
      },
      { fetch: streamingFetch },
    )

    await expect(
      client.dispatchHelper({
        projectId,
        message: '설명해줘',
        context: 'Private Core context.',
      }),
    ).rejects.toThrow('Crew did not accept the private Core session context.')
    expect(streamingFetch).not.toHaveBeenCalled()
  })
})
