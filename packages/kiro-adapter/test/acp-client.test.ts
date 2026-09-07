import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { PassThrough, Writable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))

import { type KiroAcpEvent, KiroAcpSession } from '../src/acp-client-node.js'

const agent = 'vibe-helper-test'
const model = 'claude-haiku-4.5'
type Json = Record<string, unknown>

function createPeer(
  overrides: {
    agent?: string
    model?: string
    holdPrompt?: boolean
    holdInitialize?: boolean
  } = {},
) {
  const received: Json[] = []
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    stdin: new Writable({
      write(chunk, _encoding, callback) {
        const message = JSON.parse(String(chunk)) as Json
        received.push(message)
        queueMicrotask(() => respond(message))
        callback()
      },
    }),
    pid: 123456,
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null, 'SIGTERM'))
      return true
    }),
  })
  function send(message: Json) {
    child.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  }
  function update(value: Json, sessionId = 'synthetic-session') {
    send({ method: 'session/update', params: { sessionId, update: value } })
  }
  function respond(message: Json) {
    if (message.method === 'initialize') {
      if (overrides.holdInitialize) return
      send({ id: message.id, result: { protocolVersion: 1, agentInfo: { version: '2.21.1' } } })
    } else if (message.method === 'session/new') {
      send({
        id: message.id,
        result: {
          sessionId: 'synthetic-session',
          modes: { currentModeId: overrides.agent ?? agent },
          models: { currentModelId: overrides.model ?? model },
        },
      })
    } else if (message.method === 'session/prompt' && !overrides.holdPrompt) {
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Ready.' } })
      send({ id: message.id, result: { stopReason: 'end_turn' } })
    }
  }
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => child.kill())
  mocks.spawn.mockImplementation((command) => {
    if (command === 'taskkill.exe') {
      child.kill()
      const killer = Object.assign(new EventEmitter(), { kill: vi.fn() })
      queueMicrotask(() => killer.emit('exit', 0))
      return killer
    }
    return child
  })
  return { child, received, send, update, kill }
}

describe('Kiro ACP lifecycle and fail-closed protocol', () => {
  beforeEach(() => mocks.spawn.mockReset())
  afterEach(() => vi.restoreAllMocks())

  const connect = (onEvent?: (event: KiroAcpEvent) => void) =>
    KiroAcpSession.connect({
      executable: 'kiro-cli',
      cwd: tmpdir(),
      agent,
      model,
      requestTimeoutMs: 500,
      turnTimeoutMs: 500,
      ...(onEvent ? { onEvent } : {}),
    })

  it('pins Agent/engine/model, disables client fs/terminal and completes a prompt', async () => {
    const peer = createPeer()
    const events: KiroAcpEvent[] = []
    const session = await connect((event) => events.push(event))
    expect(session.agentVersion).toBe('2.21.1')
    expect(mocks.spawn.mock.calls[0]?.[1]).toEqual([
      'acp',
      '--agent-engine',
      'v2',
      '--agent',
      agent,
      '--model',
      model,
      '--effort',
      'low',
    ])
    expect(peer.received[0]?.params).toMatchObject({
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    })
    expect(await session.prompt('Synthetic prompt')).toEqual({
      text: 'Ready.',
      stopReason: 'end_turn',
    })
    expect(events).toEqual([{ kind: 'TEXT', text: 'Ready.' }])
    await session.close()
    await session.close()
    expect(peer.child.kill).toHaveBeenCalledTimes(process.platform === 'win32' ? 1 : 2)
    if (process.platform !== 'win32') {
      expect(peer.kill).toHaveBeenNthCalledWith(1, -peer.child.pid, 'SIGTERM')
      expect(peer.kill).toHaveBeenNthCalledWith(2, -peer.child.pid, 'SIGKILL')
    }
  })

  it('cancels a connection during initialization without waiting for the request timeout', async () => {
    const peer = createPeer({ holdInitialize: true })
    const controller = new AbortController()
    const connecting = KiroAcpSession.connect({
      executable: 'kiro-cli',
      cwd: tmpdir(),
      agent,
      model,
      signal: controller.signal,
      requestTimeoutMs: 45_000,
    })
    const rejection = expect(connecting).rejects.toMatchObject({ code: 'CANCELLED' })
    controller.abort()
    await rejection
    expect(peer.received.some((message) => message.method === 'session/new')).toBe(false)
    expect(peer.child.kill).toHaveBeenCalled()
  })

  it.each([
    [{ agent: 'default' }, 'IDENTITY_MISMATCH'],
    [{ model: 'unexpected-model' }, 'MODEL_MISMATCH'],
  ] as const)('refuses silent fallback %j before prompting', async (override, code) => {
    const peer = createPeer(override)
    await expect(connect()).rejects.toMatchObject({ code })
    expect(peer.received.some((message) => message.method === 'session/prompt')).toBe(false)
    expect(peer.child.kill).toHaveBeenCalledTimes(process.platform === 'win32' ? 1 : 2)
  })

  it('rejects concurrent turns and cancels only the owned session/process', async () => {
    const peer = createPeer({ holdPrompt: true })
    const session = await connect()
    const turn = session.prompt('Synthetic prompt')
    const rejected = expect(turn).rejects.toMatchObject({ code: 'CANCELLED' })
    await expect(session.prompt('Duplicate')).rejects.toMatchObject({ code: 'TURN_BUSY' })
    await session.cancel()
    await rejected
    expect(peer.received.at(-1)).toMatchObject({
      method: 'session/cancel',
      params: { sessionId: 'synthetic-session' },
    })
    if (process.platform === 'win32') {
      expect(mocks.spawn).toHaveBeenCalledWith(
        'taskkill.exe',
        ['/pid', '123456', '/T', '/F'],
        expect.objectContaining({ shell: false }),
      )
    } else expect(peer.kill).toHaveBeenCalledWith(-123456, 'SIGTERM')
    await expect(session.prompt('Late')).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' })
  })

  it('buffers split credentials, drops thought/cross-session events and redacts tool fields', async () => {
    const peer = createPeer({ holdPrompt: true })
    const events: KiroAcpEvent[] = []
    const session = await connect((event) => events.push(event))
    const turn = session.prompt('Synthetic prompt')
    peer.update({
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'private thought' },
    })
    peer.update(
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'unrelated data' } },
      'other-session',
    )
    for (const text of ['api_', 'key = ', 'synthetic-secret', '\nUseful output.']) {
      peer.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } })
    }
    peer.update({
      sessionUpdate: 'tool_call',
      toolCallId: 'one',
      rawInput: { token: 'synthetic-secret' },
    })
    const prompt = peer.received.find((message) => message.method === 'session/prompt')
    peer.send({ id: prompt?.id, result: { stopReason: 'end_turn' } })
    const result = await turn
    expect(result.text).toContain('[REDACTED]')
    expect(JSON.stringify(events)).not.toMatch(/synthetic-secret|private thought|unrelated data/)
    expect(JSON.stringify(events)).toContain('Useful output.')
    await session.close()
  })

  it('declines permission escalation and never implements generic file/terminal delegation', async () => {
    const peer = createPeer({ holdPrompt: true })
    const session = await connect()
    const turn = session.prompt('Synthetic prompt')
    const rejected = expect(turn).rejects.toMatchObject({ code: 'CANCELLED' })
    peer.send({
      id: 'permission-one',
      method: 'session/request_permission',
      params: { options: [{ kind: 'allow_always' }] },
    })
    peer.send({
      id: 'file-one',
      method: 'fs/write_text_file',
      params: { path: '/outside', content: 'no' },
    })
    expect(peer.received).toContainEqual({
      jsonrpc: '2.0',
      id: 'permission-one',
      result: { outcome: { outcome: 'cancelled' } },
    })
    expect(peer.received).toContainEqual({
      jsonrpc: '2.0',
      id: 'file-one',
      error: { code: -32601, message: 'Not supported' },
    })
    await session.cancel()
    await rejected
  })

  it('rejects malformed JSON and closes the process', async () => {
    const peer = createPeer({ holdPrompt: true })
    const session = await connect()
    const turn = session.prompt('Synthetic prompt')
    const rejected = expect(turn).rejects.toMatchObject({ code: 'PROTOCOL_INVALID' })
    peer.child.stdout.write('not-json\n')
    await rejected
    expect(peer.child.kill).toHaveBeenCalledTimes(process.platform === 'win32' ? 1 : 2)
  })

  it('bounds pending turns and never forwards raw provider errors', async () => {
    const peer = createPeer({ holdPrompt: true })
    const session = await connect()
    const turn = session.prompt('Synthetic prompt')
    const prompt = peer.received.find((message) => message.method === 'session/prompt')
    peer.send({ id: prompt?.id, error: { code: -1, message: 'token=synthetic-secret' } })
    await expect(turn).rejects.toMatchObject({ code: 'RPC_ERROR', message: 'Kiro ACP: RPC_ERROR' })
    expect(peer.child.kill).toHaveBeenCalledTimes(process.platform === 'win32' ? 1 : 2)
  })

  it('times out a silent peer and terminates it', async () => {
    const peer = createPeer({ holdPrompt: true })
    const session = await connect()
    await expect(session.prompt('Synthetic prompt')).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    })
    expect(peer.child.kill).toHaveBeenCalledTimes(process.platform === 'win32' ? 1 : 2)
  })
})
