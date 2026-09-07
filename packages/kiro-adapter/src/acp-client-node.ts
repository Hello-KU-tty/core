import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'

import { redactSensitiveText } from '@vibe-helper/application/redaction'

const MAX_FRAME_BYTES = 2 * 1024 * 1024
const MAX_TEXT_CHARACTERS = 512 * 1024

export type KiroAcpErrorCode =
  | 'START_FAILED'
  | 'CONNECTION_CLOSED'
  | 'PROTOCOL_INVALID'
  | 'REQUEST_TIMEOUT'
  | 'RPC_ERROR'
  | 'IDENTITY_MISMATCH'
  | 'MODEL_MISMATCH'
  | 'TURN_BUSY'
  | 'CANCELLED'
  | 'OUTPUT_TOO_LARGE'

export class KiroAcpError extends Error {
  constructor(readonly code: KiroAcpErrorCode) {
    // Never forward provider error strings, command arguments or credentials.
    super(`Kiro ACP: ${code}`)
    this.name = 'KiroAcpError'
  }
}

export type KiroAcpEvent =
  | { readonly kind: 'TEXT'; readonly text: string }
  | { readonly kind: 'TOOL'; readonly update: Readonly<Record<string, unknown>> }
  | { readonly kind: 'PERMISSION_DENIED' }

export interface KiroAcpOptions {
  readonly executable: string
  readonly cwd: string
  readonly agent: string
  readonly model: string
  readonly requestTimeoutMs?: number
  readonly turnTimeoutMs?: number
  readonly environment?: NodeJS.ProcessEnv
  readonly signal?: AbortSignal
  readonly onEvent?: (event: KiroAcpEvent) => void
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: KiroAcpError) => void
  readonly timer: ReturnType<typeof setTimeout>
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function boundedTimeout(value: number | undefined, fallback: number): number {
  const result = value ?? fallback
  if (!Number.isSafeInteger(result) || result < 10 || result > 1_200_000) {
    throw new TypeError('ACP timeout must be 10..1200000 milliseconds')
  }
  return result
}

function redactValue(value: unknown, workspace: string, depth = 0): unknown {
  if (depth > 20) return '[REDACTED_DEPTH_LIMIT]'
  if (typeof value === 'string') return redactSensitiveText(value, workspace)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, workspace, depth + 1))
  const object = record(value)
  if (object === null) return value
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [
      key,
      /^(?:api[_-]?key|.*token|.*secret|password|authorization)$/i.test(key)
        ? '[REDACTED]'
        : redactValue(item, workspace, depth + 1),
    ]),
  )
}

/** One explicitly selected Kiro v2 Agent/session, owned by the local backend.
 * No generic ACP request surface, filesystem/terminal delegation, or trust-all.
 * Agent config + Builder hook remain mandatory independent execution guards.
 */
export class KiroAcpSession {
  readonly #child: ChildProcessWithoutNullStreams
  readonly #options: KiroAcpOptions
  readonly #pending = new Map<number, PendingRequest>()
  readonly #closed: Promise<void>
  readonly #requestTimeoutMs: number
  readonly #turnTimeoutMs: number
  #nextId = 0
  #buffer = ''
  #sessionId: string | undefined
  #terminated = false
  #closing: Promise<void> | undefined
  #busy = false
  #cancelled = false
  #text = ''
  #unpublishedText = ''
  #agentVersion: string | undefined

  private constructor(options: KiroAcpOptions) {
    if (!isAbsolute(options.cwd) || !/^vibe-helper-[a-z0-9-]+$/.test(options.agent)) {
      throw new TypeError('ACP requires an absolute workspace and a Vibe Helper Agent')
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(options.model) || options.executable.length === 0) {
      throw new TypeError('ACP executable and explicit model are required')
    }
    this.#requestTimeoutMs = boundedTimeout(options.requestTimeoutMs, 45_000)
    this.#turnTimeoutMs = boundedTimeout(options.turnTimeoutMs, 420_000)
    this.#options = options
    this.#child = spawn(
      options.executable,
      [
        'acp',
        '--agent-engine',
        'v2',
        '--agent',
        options.agent,
        '--model',
        options.model,
        '--effort',
        'low',
      ],
      {
        cwd: options.cwd,
        env: options.environment ?? process.env,
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    this.#closed = new Promise((resolveClosed) => {
      const finish = (code: KiroAcpErrorCode): void => {
        this.#terminated = true
        this.#failPending(this.#cancelled ? 'CANCELLED' : code)
        resolveClosed()
      }
      this.#child.once('error', () => finish('START_FAILED'))
      this.#child.once('close', () => finish('CONNECTION_CLOSED'))
    })
    this.#child.stdin.on('error', () => this.#failPending('CONNECTION_CLOSED'))
    this.#child.once('exit', () => {
      void this.close()
    })
    // Drain diagnostics, but do not retain/forward untrusted raw provider logs.
    this.#child.stderr.on('data', () => undefined)
    this.#child.stdout.setEncoding('utf8')
    this.#child.stdout.on('data', (chunk: string) => this.#receive(chunk))
  }

  static async connect(options: KiroAcpOptions): Promise<KiroAcpSession> {
    if (options.signal?.aborted) throw new KiroAcpError('CANCELLED')
    const session = new KiroAcpSession(options)
    const abort = () => {
      session.#cancelled = true
      void session.close()
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      const initialized = record(
        await session.#request('initialize', {
          protocolVersion: 1,
          clientInfo: { name: 'vibe-helper-local-runtime', version: '0.1.0' },
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false,
          },
        }),
      )
      if (initialized?.protocolVersion !== 1) throw new KiroAcpError('PROTOCOL_INVALID')
      const info = record(initialized.agentInfo)
      session.#agentVersion = typeof info?.version === 'string' ? info.version : undefined
      const created = record(
        await session.#request('session/new', { cwd: options.cwd, mcpServers: [] }),
      )
      const id = created?.sessionId
      if (typeof id !== 'string' || id.length === 0 || id.length > 512) {
        throw new KiroAcpError('PROTOCOL_INVALID')
      }
      if (record(created?.modes)?.currentModeId !== options.agent) {
        throw new KiroAcpError('IDENTITY_MISMATCH')
      }
      if (record(created?.models)?.currentModelId !== options.model) {
        throw new KiroAcpError('MODEL_MISMATCH')
      }
      session.#sessionId = id
      return session
    } catch (error) {
      await session.close()
      throw error
    } finally {
      options.signal?.removeEventListener('abort', abort)
    }
  }

  get agentVersion(): string | undefined {
    return this.#agentVersion
  }

  async prompt(text: string): Promise<{ readonly text: string; readonly stopReason: string }> {
    if (this.#busy) throw new KiroAcpError('TURN_BUSY')
    if (this.#terminated || this.#closing || this.#sessionId === undefined) {
      throw new KiroAcpError('CONNECTION_CLOSED')
    }
    if (text.trim().length === 0 || Buffer.byteLength(text) > MAX_FRAME_BYTES / 2) {
      throw new KiroAcpError('PROTOCOL_INVALID')
    }
    this.#busy = true
    this.#cancelled = false
    this.#text = ''
    this.#unpublishedText = ''
    try {
      const result = record(
        await this.#request(
          'session/prompt',
          { sessionId: this.#sessionId, prompt: [{ type: 'text', text }] },
          this.#turnTimeoutMs,
        ),
      )
      if (this.#cancelled) throw new KiroAcpError('CANCELLED')
      if (typeof result?.stopReason !== 'string') throw new KiroAcpError('PROTOCOL_INVALID')
      this.#flushText(true)
      return {
        text: redactSensitiveText(this.#text, this.#options.cwd),
        stopReason: result.stopReason,
      }
    } catch (error) {
      await this.close()
      throw error
    } finally {
      this.#busy = false
      this.#text = ''
      this.#unpublishedText = ''
    }
  }

  async cancel(): Promise<void> {
    if (!this.#busy || this.#terminated) return
    this.#cancelled = true
    this.#send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: this.#sessionId } })
    // Cancel revokes this runtime handle. Durable Core results remain intact.
    await this.close()
  }

  close(): Promise<void> {
    // Reserve before invoking cleanup: child exit can re-enter close synchronously.
    this.#closing ??= Promise.resolve().then(() => this.#closeProcess())
    return this.#closing
  }

  async #closeProcess(): Promise<void> {
    this.#failPending(this.#cancelled ? 'CANCELLED' : 'CONNECTION_CLOSED')
    const terminate = (signal: NodeJS.Signals): void => {
      if (this.#child.pid === undefined) return
      if (process.platform !== 'win32') {
        try {
          process.kill(-this.#child.pid, signal)
          return
        } catch {
          // Only fall back to this owned child, never an arbitrary PID/group.
        }
      }
      if (!this.#terminated) this.#child.kill(signal)
    }
    // On Windows, kill the owned process tree while the root is still alive.
    if (process.platform === 'win32' && !this.#terminated && this.#child.pid !== undefined) {
      const killer = spawn('taskkill.exe', ['/pid', String(this.#child.pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      })
      const killerTimeout = setTimeout(() => {
        killer.kill()
        terminate('SIGKILL')
      }, 2_000)
      killer.on('exit', () => clearTimeout(killerTimeout))
      killer.on('error', () => {
        clearTimeout(killerTimeout)
        terminate('SIGTERM')
      })
    } else terminate('SIGTERM')
    const force = setTimeout(() => terminate('SIGKILL'), 2_000)
    try {
      await this.#closed
      if (process.platform !== 'win32') {
        // Closed pipes/root exit do not prove that the owned descendants exited.
        await new Promise<void>((done) => setTimeout(done, 200))
        terminate('SIGKILL')
      }
    } finally {
      clearTimeout(force)
    }
  }

  #send(value: unknown): void {
    if (this.#terminated || this.#child.stdin.destroyed) throw new KiroAcpError('CONNECTION_CLOSED')
    this.#child.stdin.write(`${JSON.stringify(value)}\n`)
  }

  #request(method: string, params: unknown, timeoutMs = this.#requestTimeoutMs): Promise<unknown> {
    return new Promise((resolveRequest, reject: (error: KiroAcpError) => void) => {
      const id = this.#nextId++
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new KiroAcpError('REQUEST_TIMEOUT'))
      }, timeoutMs)
      this.#pending.set(id, { resolve: resolveRequest, reject, timer })
      try {
        this.#send({ jsonrpc: '2.0', id, method, params })
      } catch {
        this.#pending.delete(id)
        clearTimeout(timer)
        reject(new KiroAcpError('CONNECTION_CLOSED'))
      }
    })
  }

  #failPending(code: KiroAcpErrorCode): void {
    for (const request of this.#pending.values()) {
      clearTimeout(request.timer)
      request.reject(new KiroAcpError(code))
    }
    this.#pending.clear()
  }

  #receive(chunk: string): void {
    if (this.#closing || this.#terminated) return
    this.#buffer += chunk
    if (Buffer.byteLength(this.#buffer) > MAX_FRAME_BYTES) {
      this.#failPending('OUTPUT_TOO_LARGE')
      void this.close()
      return
    }
    let newline = this.#buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline)
      this.#buffer = this.#buffer.slice(newline + 1)
      newline = this.#buffer.indexOf('\n')
      if (!line.trim()) continue
      try {
        const message = record(JSON.parse(line))
        if (message?.jsonrpc !== '2.0') throw new KiroAcpError('PROTOCOL_INVALID')
        this.#message(message)
      } catch {
        this.#failPending('PROTOCOL_INVALID')
        void this.close()
        return
      }
    }
  }

  #message(message: Record<string, unknown>): void {
    if (typeof message.method === 'string') {
      if (message.id !== undefined) {
        if (message.method === 'session/request_permission') {
          this.#send({
            jsonrpc: '2.0',
            id: message.id,
            result: { outcome: { outcome: 'cancelled' } },
          })
          this.#options.onEvent?.({ kind: 'PERMISSION_DENIED' })
        } else {
          this.#send({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: 'Not supported' },
          })
        }
        return
      }
      const params = record(message.params)
      if (
        message.method !== 'session/update' ||
        !this.#busy ||
        params?.sessionId !== this.#sessionId
      )
        return
      const update = record(params?.update)
      if (update?.sessionUpdate === 'agent_message_chunk') {
        const content = record(update.content)
        if (content?.type !== 'text' || typeof content.text !== 'string') return
        this.#text += content.text
        this.#unpublishedText += content.text
        if (this.#text.length > MAX_TEXT_CHARACTERS) {
          this.#failPending('OUTPUT_TOO_LARGE')
          void this.close()
          return
        }
        this.#flushText(false)
      } else if (
        update?.sessionUpdate === 'tool_call' ||
        update?.sessionUpdate === 'tool_call_update'
      ) {
        this.#flushText(true)
        const sanitized = record(redactValue(update, this.#options.cwd))
        if (sanitized !== null) this.#options.onEvent?.({ kind: 'TOOL', update: sanitized })
      }
      // Never expose thought chunks, internal metadata, or another session.
      return
    }
    if (typeof message.id !== 'number') return
    const request = this.#pending.get(message.id)
    if (request === undefined) return
    clearTimeout(request.timer)
    this.#pending.delete(message.id)
    if ('error' in message) request.reject(new KiroAcpError('RPC_ERROR'))
    else if ('result' in message) request.resolve(message.result)
    else request.reject(new KiroAcpError('PROTOCOL_INVALID'))
  }

  #flushText(complete: boolean): void {
    let end = complete ? this.#unpublishedText.length : this.#unpublishedText.lastIndexOf('\n') + 1
    if (!complete && /(?:[:=]\s*|Bearer\s*)$/i.test(this.#unpublishedText.slice(0, end))) end = 0
    if (end === 0) return
    const text = redactSensitiveText(this.#unpublishedText.slice(0, end), this.#options.cwd)
    this.#unpublishedText = this.#unpublishedText.slice(end)
    this.#options.onEvent?.({ kind: 'TEXT', text })
  }
}
