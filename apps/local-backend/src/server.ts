import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { type ApplicationService, MAX_APPLICATION_PAYLOAD_BYTES } from '@vibe-helper/application'
import {
  generatedResultDescriptorSchema,
  LOCAL_PROTOCOL_VERSION,
  localApplicationEnvelopeSchema,
  localRunEnvelopeSchema,
  localRunIdSchema,
  projectIdSchema,
} from '@vibe-helper/contracts'
import { ResultRuntimeError, WorkflowError, type WorkflowRuntime } from '@vibe-helper/runtime'
import type { LocalMcpHandler } from './agent-host.js'
import type { NativeAgentRelay } from './native-agent-relay.js'

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}
async function body(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > MAX_APPLICATION_PAYLOAD_BYTES) throw new WorkflowError('PAYLOAD_TOO_LARGE')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}
export function createLocalServer(options: {
  application: ApplicationService
  runtime: WorkflowRuntime
  token: string
  instanceId: string
  mcpHandlers: ReadonlyMap<string, LocalMcpHandler>
  nativeRelay?: NativeAgentRelay
  /** Experimental Core-only startup rejects Agent runs before accepting them. */
  runStartDisabledCode?: 'NATIVE_RUNTIME_NOT_ATTACHED'
  isClosing?: () => boolean
  resultLauncher?: {
    launch(value: ReturnType<typeof generatedResultDescriptorSchema.parse>): Promise<unknown>
  }
}) {
  if (!/^[0-9a-f]{64}$/.test(options.token)) throw new TypeError('LOCAL_TOKEN_INVALID')
  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      if (response.headersSent) {
        response.end()
        return
      }
      const code =
        error instanceof WorkflowError || error instanceof ResultRuntimeError
          ? error.code
          : 'INVALID_REQUEST'
      json(
        response,
        code === 'PAYLOAD_TOO_LARGE'
          ? 413
          : code.includes('NOT_FOUND')
            ? 404
            : /STALE|BUSY|CONFLICT|CAPACITY/.test(code)
              ? 409
              : 400,
        {
          error: code,
        },
      )
    })
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (options.isClosing?.()) {
      json(response, 503, { error: 'RUNTIME_CLOSED' })
      return
    }
    // No browser-origin access/CORS, DNS rebinding, remote bind or credential query strings.
    const address = server.address()
    const expectedHost =
      address !== null && typeof address !== 'string' ? `127.0.0.1:${address.port}` : ''
    if (
      request.headers.host !== expectedHost ||
      request.headers.origin !== undefined ||
      request.headers['sec-fetch-site'] !== undefined
    ) {
      json(response, 403, { error: 'LOCAL_EXTENSION_HOST_ONLY' })
      return
    }
    const url = new URL(request.url ?? '/', `http://${expectedHost}`)
    if (url.pathname.startsWith('/mcp/')) {
      const handler = options.mcpHandlers.get(url.pathname)
      if (handler === undefined || url.search) {
        json(response, 404, { error: 'MCP_RUN_NOT_FOUND' })
        return
      }
      const headers = new Headers()
      for (const [name, value] of Object.entries(request.headers))
        if (value !== undefined && name !== 'host')
          headers.set(name, Array.isArray(value) ? value.join(', ') : value)
      const method = request.method ?? 'GET'
      const buffer = method === 'GET' || method === 'HEAD' ? undefined : await body(request)
      const result = await handler.fetch(
        new Request(`http://${expectedHost}${url.pathname}`, {
          method,
          headers,
          ...(buffer === undefined ? {} : { body: buffer }),
        }),
      )
      response.writeHead(result.status, Object.fromEntries(result.headers.entries()))
      response.end(Buffer.from(await result.arrayBuffer()))
      return
    }
    const supplied = Buffer.from(request.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${options.token}`)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      json(response, 401, { error: 'LOCAL_AUTH_FAILED' })
      return
    }
    if (request.method === 'GET' && url.pathname === '/health' && !url.search) {
      json(response, 200, {
        protocolVersion: LOCAL_PROTOCOL_VERSION,
        backendInstanceId: options.instanceId,
        status: options.runStartDisabledCode ? 'CORE_ONLY_READY' : 'READY',
        agent: options.runStartDisabledCode
          ? 'UNATTACHED'
          : options.nativeRelay
            ? 'KIRO_IDE_BUILTIN_AGENT'
            : 'KIRO_CLI_ACP_V2',
        liveModelVerified: false,
      })
      return
    }
    if (options.nativeRelay && url.pathname === '/api/native/next' && request.method === 'GET') {
      if ([...url.searchParams.keys()].some((k) => k !== 'workspace' && k !== 'activeRoles'))
        throw new WorkflowError('INVALID_QUERY')
      const workspace = url.searchParams.get('workspace')
      if (!workspace || workspace.length > 4096) throw new WorkflowError('NATIVE_WORKSPACE_INVALID')
      const activeValue = url.searchParams.get('activeRoles') ?? ''
      const activeRoles = activeValue ? activeValue.split(',') : []
      if (
        activeRoles.length > 4 ||
        new Set(activeRoles).size !== activeRoles.length ||
        activeRoles.some(
          (role) => !['DISCOVERY', 'BUILDER', 'HELPER', 'EVIDENCE_ANALYST'].includes(role),
        )
      )
        throw new WorkflowError('NATIVE_ACTIVE_ROLES_INVALID')
      json(response, 200, {
        job: options.nativeRelay.claim(
          workspace,
          activeRoles as ('DISCOVERY' | 'BUILDER' | 'HELPER' | 'EVIDENCE_ANALYST')[],
        ),
        pendingWorkspace: options.nativeRelay.pendingWorkspace(),
      })
      return
    }
    const nativeMatch = url.pathname.match(
      /^\/api\/native\/jobs\/(native_[0-9a-f-]{36})(?:\/(event|complete|status|prompt))?$/,
    )
    if (options.nativeRelay && nativeMatch && !url.search) {
      const jobId = nativeMatch[1] as string
      if (nativeMatch[2] === 'status' && request.method === 'GET') {
        json(response, 200, { status: options.nativeRelay.status(jobId) })
        return
      }
      if (nativeMatch[2] === 'prompt' && request.method === 'GET') {
        json(response, 200, { message: await options.nativeRelay.protectedPrompt(jobId) })
        return
      }
      if (
        request.method === 'POST' &&
        (nativeMatch[2] === 'event' || nativeMatch[2] === 'complete') &&
        request.headers['content-type']?.split(';')[0] === 'application/json'
      ) {
        const input: unknown = JSON.parse((await body(request)).toString('utf8'))
        if (nativeMatch[2] === 'event') options.nativeRelay.event(jobId, input)
        else options.nativeRelay.complete(jobId, input)
        json(response, 200, { accepted: true })
        return
      }
    }
    if (request.method === 'GET' && url.pathname === '/api/runs') {
      if ([...url.searchParams.keys()].some((k) => k !== 'projectId'))
        throw new WorkflowError('INVALID_QUERY')
      const projectId = projectIdSchema.parse(url.searchParams.get('projectId'))
      json(response, 200, options.runtime.list(projectId))
      return
    }
    const match = url.pathname.match(/^\/api\/runs\/(run_[0-9a-f-]{36})(?:\/(events|cancel))?$/)
    if (match) {
      const runId = localRunIdSchema.parse(match[1])
      if (match[2] === 'events' && request.method === 'GET') {
        const after = Number(url.searchParams.get('after') ?? 0)
        if (
          !Number.isSafeInteger(after) ||
          after < 0 ||
          [...url.searchParams.keys()].some((k) => k !== 'after')
        )
          throw new WorkflowError('INVALID_SEQUENCE')
        const run = options.runtime.get(runId)
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-store',
          connection: 'keep-alive',
        })
        response.write(`event: run\ndata: ${JSON.stringify(run)}\n\n`)
        const unsubscribe = options.runtime.subscribe(runId, after, (event) => {
          if (response.destroyed) return
          if (response.writableLength > 1_048_576) {
            response.destroy()
            return
          }
          response.write(`id: ${event.sequence}\nevent: event\ndata: ${JSON.stringify(event)}\n\n`)
        })
        const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000)
        response.once('close', () => {
          clearInterval(heartbeat)
          unsubscribe()
        })
        return
      }
      if (url.search) throw new WorkflowError('INVALID_QUERY')
      if (!match[2] && request.method === 'GET') {
        json(response, 200, options.runtime.get(runId))
        return
      }
      if (match[2] === 'cancel' && request.method === 'POST') {
        json(response, 200, await options.runtime.cancel(runId))
        return
      }
    }
    if (
      request.method !== 'POST' ||
      !['/api/application', '/api/runs'].includes(url.pathname) ||
      url.search
    ) {
      json(response, 404, { error: 'NOT_FOUND' })
      return
    }
    if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
      json(response, 415, { error: 'JSON_REQUIRED' })
      return
    }
    const input: unknown = JSON.parse((await body(request)).toString('utf8'))
    if (
      typeof input !== 'object' ||
      input === null ||
      !('protocolVersion' in input) ||
      input.protocolVersion !== LOCAL_PROTOCOL_VERSION
    ) {
      json(response, 409, {
        error: 'LOCAL_PROTOCOL_MISMATCH',
        expectedProtocolVersion: LOCAL_PROTOCOL_VERSION,
      })
      return
    }
    if (url.pathname === '/api/runs') {
      if (options.runStartDisabledCode !== undefined) {
        json(response, 503, { error: options.runStartDisabledCode })
        return
      }
      json(response, 202, await options.runtime.start(localRunEnvelopeSchema.parse(input).request))
      return
    }
    const command = localApplicationEnvelopeSchema.parse(input).request
    await options.runtime.beforeUi(command)
    const result = await options.application.executeUi(command)
    if (
      result.success &&
      command.kind === 'UI_LAUNCH_RESULT' &&
      options.resultLauncher !== undefined
    ) {
      json(response, 200, {
        success: true,
        data: await options.resultLauncher.launch(
          generatedResultDescriptorSchema.parse(result.data),
        ),
      })
      return
    }
    json(response, 200, result)
  }
  return server
}
