import { randomUUID } from 'node:crypto'
import {
  type DiscoveryInput,
  LOCAL_PROTOCOL_VERSION,
  type LocalConnection,
  type LocalRun,
  type LocalRunEvent,
  type LocalRunInput,
  type LocalUiResponse,
  localConnectionSchema,
  localResponseSchemas,
  localRunEventSchema,
  localRunIdSchema,
  localRunRequestSchema,
  localRunSchema,
  projectIdSchema,
  type UiRequest,
  uiRequestSchema,
} from '@vibe-helper/contracts'

export * from '@vibe-helper/contracts'
export * from './program-adapter.js'
export function entityId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}
export function uiMetadata(correlationId = entityId('corr')) {
  return { schemaVersion: 1 as const, correlationId, actor: { kind: 'UI' as const } }
}
export class LocalClientError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code)
    this.name = 'LocalClientError'
  }
}
type Fetch = typeof globalThis.fetch
const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input)
const complete = (run: LocalRun) => !['ACCEPTED', 'RUNNING'].includes(run.status)

/** Extension-host client. Credentials are private; never expose the connection object to Webview. */
export class LocalCoreClient {
  readonly #connection: LocalConnection
  readonly #fetch: Fetch
  constructor(connection: LocalConnection, options: { fetch?: Fetch } = {}) {
    this.#connection = localConnectionSchema.parse(connection)
    const port = Number(new URL(connection.baseUrl).port)
    if (port < 1 || port > 65_535) throw new LocalClientError('INVALID_LOCAL_PORT')
    this.#fetch = options.fetch ?? globalThis.fetch
  }
  async health(): Promise<{ protocolVersion: number; backendInstanceId: string; agent?: string }> {
    const value = await this.#json('/health')
    if (
      !isRecord(value) ||
      value.protocolVersion !== LOCAL_PROTOCOL_VERSION ||
      value.backendInstanceId !== this.#connection.backendInstanceId
    )
      throw new LocalClientError('BACKEND_RESTARTED_RELOAD_CONNECTION')
    return {
      protocolVersion: LOCAL_PROTOCOL_VERSION,
      backendInstanceId: this.#connection.backendInstanceId,
      ...(typeof value.agent === 'string' ? { agent: value.agent } : {}),
    }
  }
  async execute<K extends UiRequest['kind']>(
    request: Extract<UiRequest, { kind: K }>,
  ): Promise<LocalUiResponse<K>> {
    const value = await this.#json('/api/application', {
      protocolVersion: LOCAL_PROTOCOL_VERSION,
      request: uiRequestSchema.parse(request),
    })
    if (!isRecord(value)) throw new LocalClientError('INVALID_CORE_RESPONSE')
    if (value.success === false) {
      const error = isRecord(value.error) ? value.error : {}
      throw new LocalClientError(
        typeof error.code === 'string' && /^[A-Z0-9_]{1,100}$/.test(error.code)
          ? error.code
          : 'CORE_OPERATION_FAILED',
      )
    }
    if (value.success !== true) throw new LocalClientError('INVALID_CORE_RESPONSE')
    const parsed = localResponseSchemas[request.kind].safeParse(value.data)
    if (!parsed.success) throw new LocalClientError('INVALID_CORE_RESPONSE')
    return parsed.data as LocalUiResponse<K>
  }
  listProjects(limit = 50) {
    return this.execute({ ...uiMetadata(), kind: 'UI_LIST_PROJECTS', limit })
  }
  restoreProject(projectId: string) {
    return this.execute({
      ...uiMetadata(),
      kind: 'UI_RESTORE_PROJECT_SESSION',
      projectId,
      helperConversationLimit: 20,
    })
  }
  async startDiscovery(input: DiscoveryInput, options: { enrichAfterPreview?: boolean } = {}) {
    const projectId = entityId('project')
    await this.execute({
      ...uiMetadata(),
      kind: 'UI_START_DISCOVERY',
      projectId,
      idempotencyKey: entityId('idem'),
      input,
    })
    const snapshot = await this.restoreProject(projectId)
    if (snapshot.discoverySession === null) throw new LocalClientError('DISCOVERY_SESSION_MISSING')
    const run = await this.startRun({
      kind: 'DISCOVERY',
      projectId,
      idempotencyKey: entityId('idem'),
      phase: 'PREVIEW',
      discoverySessionId: snapshot.discoverySession.id,
      expectedSessionRevision: snapshot.discoverySession.revision,
      enrichAfterPreview: options.enrichAfterPreview ?? true,
    })
    return { projectId, run }
  }
  async startRun(request: LocalRunInput): Promise<LocalRun> {
    return localRunSchema.parse(
      await this.#json('/api/runs', {
        protocolVersion: LOCAL_PROTOCOL_VERSION,
        request: localRunRequestSchema.parse(request),
      }),
    )
  }
  async getRun(id: string): Promise<LocalRun> {
    return localRunSchema.parse(await this.#json(`/api/runs/${localRunIdSchema.parse(id)}`))
  }
  async listRuns(projectId: string): Promise<LocalRun[]> {
    return localRunSchema
      .array()
      .parse(await this.#json(`/api/runs?projectId=${projectIdSchema.parse(projectId)}`))
  }
  async cancelRun(id: string): Promise<LocalRun> {
    return localRunSchema.parse(
      await this.#json(`/api/runs/${localRunIdSchema.parse(id)}/cancel`, {}),
    )
  }
  async watchRun(
    id: string,
    onEvent: (event: LocalRunEvent) => void,
    options: { signal?: AbortSignal; after?: number; onRun?: (run: LocalRun) => void } = {},
  ): Promise<LocalRun> {
    localRunIdSchema.parse(id)
    const after = options.after ?? 0
    if (!Number.isSafeInteger(after) || after < 0) throw new LocalClientError('INVALID_SEQUENCE')
    const response = await this.#request(
      `/api/runs/${id}/events?after=${after}`,
      undefined,
      options.signal,
      true,
    )
    if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream'))
      throw new LocalClientError('INVALID_STREAM')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let latest: LocalRun | undefined
    let receivedSequence = after
    let replayThrough = after
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        buffer += decoder.decode(chunk.value, { stream: true }).replaceAll('\r\n', '\n')
        if (buffer.length > 2_097_152) throw new LocalClientError('STREAM_TOO_LARGE')
        let boundary = buffer.indexOf('\n\n')
        while (boundary >= 0) {
          const frame = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const data = frame
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n')
          if (data) {
            let value: unknown
            try {
              value = JSON.parse(data)
            } catch {
              throw new LocalClientError('INVALID_STREAM')
            }
            if (frame.includes('event: run')) {
              latest = localRunSchema.parse(value)
              if (
                latest.backendInstanceId !== this.#connection.backendInstanceId ||
                latest.id !== id
              )
                throw new LocalClientError('RUN_BINDING_MISMATCH')
              options.onRun?.(latest)
              replayThrough = latest.lastSequence
            } else {
              const event = localRunEventSchema.parse(value)
              if (event.runId !== id || (latest && event.projectId !== latest.projectId))
                throw new LocalClientError('RUN_BINDING_MISMATCH')
              if (
                event.run &&
                (event.run.id !== id ||
                  event.run.projectId !== event.projectId ||
                  event.run.backendInstanceId !== this.#connection.backendInstanceId)
              )
                throw new LocalClientError('RUN_BINDING_MISMATCH')
              onEvent(event)
              receivedSequence = Math.max(receivedSequence, event.sequence)
              if (event.run && (!latest || event.run.lastSequence >= latest.lastSequence)) {
                latest = event.run
                options.onRun?.(latest)
              }
            }
          }
          boundary = buffer.indexOf('\n\n')
        }
        if (latest && complete(latest) && receivedSequence >= replayThrough) return latest
      }
      if (latest && complete(latest) && receivedSequence >= replayThrough) return latest
      throw new LocalClientError('STREAM_DISCONNECTED_RESTORE_PROJECT')
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
  async #json(path: string, body?: unknown): Promise<unknown> {
    const response = await this.#request(path, body)
    const text = await response.text()
    if (text.length > 4_194_304) throw new LocalClientError('RESPONSE_TOO_LARGE')
    try {
      return JSON.parse(text)
    } catch {
      throw new LocalClientError('INVALID_JSON_RESPONSE')
    }
  }
  async #request(
    path: string,
    body?: unknown,
    signal?: AbortSignal,
    stream = false,
  ): Promise<Response> {
    let response: Response
    try {
      response = await this.#fetch(`${this.#connection.baseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${this.#connection.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(signal === undefined && stream
          ? {}
          : { signal: signal ?? AbortSignal.timeout(15_000) }),
      })
    } catch {
      throw new LocalClientError(signal?.aborted ? 'CANCELLED' : 'CORE_CONNECTION_UNAVAILABLE')
    }
    if (!response.ok) {
      let code = `HTTP_${response.status}`
      try {
        const error: unknown = await response.json()
        if (
          isRecord(error) &&
          typeof error.error === 'string' &&
          /^[A-Z0-9_]{1,100}$/.test(error.error)
        )
          code = error.error
      } catch {
        /* Never expose untrusted server bodies or transport credentials. */
      }
      throw new LocalClientError(code, response.status)
    }
    return response
  }
}
