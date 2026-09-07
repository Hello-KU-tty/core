// Explicit live capability probe, not a product runtime or a mock fallback.
// Only synthetic text is sent; no tools, user projects, or Crew data are used.
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { redactSensitiveText } from '../packages/application/dist/index.js'

const runtimeRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-t19-acp-'))
const agentName = 'vibe-helper-acp-probe'
const model = 'claude-haiku-4.5'
const cli = process.env.VIBE_HELPER_KIRO_CLI ?? 'kiro-cli'
const engine = process.env.VIBE_HELPER_KIRO_ENGINE ?? 'v2'
if (!['v2', 'v3'].includes(engine)) throw new Error('Only explicit v2/v3 probes are supported.')
await mkdir(join(runtimeRoot, '.kiro', 'agents'), { recursive: true })
await writeFile(
  join(runtimeRoot, '.kiro', 'agents', `${agentName}.json`),
  `${JSON.stringify({
    name: agentName,
    description: 'Isolated no-tool transport capability probe.',
    prompt: 'This is a synthetic transport probe. Reply with ACP_READY. Do not use any tools.',
    tools: [],
    allowedTools: [],
    resources: [],
    mcpServers: {},
    includeMcpJson: false,
    model,
  })}\n`,
  { mode: 0o600, flag: 'wx' },
)

const child = spawn(
  cli,
  [
    'acp',
    '--agent',
    agentName,
    '--agent-engine',
    engine,
    '--model',
    model,
    '--effort',
    'low',
    ...(engine === 'v3' ? ['--auth-method', 'cli'] : []),
  ],
  { cwd: runtimeRoot, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] },
)
let nextId = 0
let buffer = ''
let stderr = ''
let phase = 'SPAWN'
let reply = ''
let finished = false
const pending = new Map()
const notificationMethods = new Set()
const updateTypes = new Set()
const serverRequests = new Set()
const summary = { runtimeRoot, engine, model }

const failPending = (error) => {
  for (const request of pending.values()) {
    clearTimeout(request.timer)
    request.reject(error)
  }
  pending.clear()
}
const closed = new Promise((resolveClosed) => {
  child.once('error', () => {
    finished = true
    failPending(new Error('PROCESS_START_FAILED'))
    resolveClosed()
  })
  child.once('close', (code, signal) => {
    finished = true
    summary.exitCode = code
    summary.signal = signal
    failPending(new Error('PROCESS_CLOSED'))
    resolveClosed()
  })
})
const send = (message) => {
  if (finished || child.stdin.destroyed) throw new Error('PROCESS_CLOSED')
  child.stdin.write(`${JSON.stringify(message)}\n`)
}
child.stdin.on('error', () => failPending(new Error('STDIN_CLOSED')))
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-16_384)
})
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  buffer += chunk
  if (Buffer.byteLength(buffer) > 2 * 1024 * 1024) {
    failPending(new Error('FRAME_TOO_LARGE'))
    child.kill('SIGTERM')
    return
  }
  let newline = buffer.indexOf('\n')
  while (newline >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    newline = buffer.indexOf('\n')
    if (!line.trim()) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      failPending(new Error('INVALID_JSON_RPC'))
      child.kill('SIGTERM')
      return
    }
    if (typeof message.method === 'string') {
      if (message.id !== undefined) {
        serverRequests.add(message.method)
        if (message.method === 'session/request_permission') {
          send({ jsonrpc: '2.0', id: message.id, result: { outcome: { outcome: 'cancelled' } } })
        } else {
          send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: 'Not supported' },
          })
        }
      } else {
        notificationMethods.add(message.method)
        const update = message.params?.update
        if (typeof update?.sessionUpdate === 'string') updateTypes.add(update.sessionUpdate)
        if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
          reply = `${reply}${update.content.text}`.slice(-16_384)
        }
      }
      continue
    }
    const request = pending.get(message.id)
    if (!request) continue
    clearTimeout(request.timer)
    pending.delete(message.id)
    if (message.error) {
      summary.rpcErrorCode = message.error.code
      request.reject(new Error('RPC_ERROR'))
    } else request.resolve(message.result)
  }
})
const request = (method, params, timeoutMs = 45_000) =>
  new Promise((resolveRequest, reject) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('REQUEST_TIMEOUT'))
    }, timeoutMs)
    pending.set(id, { resolve: resolveRequest, reject, timer })
    send({ jsonrpc: '2.0', id, method, params })
  })

process.stdout.write(`${JSON.stringify({ phase: 'STARTED', ...summary })}\n`)
try {
  phase = 'INITIALIZE'
  const initialized = await request('initialize', {
    protocolVersion: 1,
    clientInfo: { name: 'vibe-helper-capability-probe', version: '0.1.0' },
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
  })
  summary.protocolVersion = initialized.protocolVersion
  summary.agentVersion = initialized.agentInfo?.version
  process.stdout.write(`${JSON.stringify({ phase: 'INITIALIZED', ...summary })}\n`)
  phase = 'SESSION_NEW'
  const session = await request('session/new', { cwd: runtimeRoot, mcpServers: [] })
  summary.agentIdentityMatches = session.modes?.currentModeId === agentName
  summary.modelMatches = session.models?.currentModelId === model
  summary.sessionCreated = typeof session.sessionId === 'string' && session.sessionId.length > 0
  process.stdout.write(`${JSON.stringify({ phase: 'SESSION_CREATED', ...summary })}\n`)
  if (!summary.agentIdentityMatches || !summary.sessionCreated) {
    throw new Error('AGENT_IDENTITY_UNVERIFIED')
  }
  phase = 'PROMPT'
  const result = await request('session/prompt', {
    sessionId: session.sessionId,
    prompt: [{ type: 'text', text: 'Reply with ACP_READY.' }],
  })
  summary.stopReason = result.stopReason
  summary.syntheticReplyReceived = reply.includes('ACP_READY')
  if (!summary.syntheticReplyReceived || serverRequests.size > 0) throw new Error('PROBE_FAILED')
  phase = 'COMPLETED'
} catch (error) {
  summary.failure = error instanceof Error ? error.message : 'UNKNOWN_FAILURE'
  process.exitCode = 1
} finally {
  if (!finished) {
    child.stdin.end()
    child.kill('SIGTERM')
  }
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000)
  await closed
  clearTimeout(killTimer)
  summary.notificationMethods = [...notificationMethods]
  summary.updateTypes = [...updateTypes]
  summary.serverRequests = [...serverRequests]
  summary.stderr = redactSensitiveText(stderr, runtimeRoot)
  process.stdout.write(`${JSON.stringify({ phase, ...summary })}\n`)
}
