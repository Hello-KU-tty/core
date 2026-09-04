import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { type ApplicationService, MAX_APPLICATION_PAYLOAD_BYTES } from '@vibe-helper/application'
import { CREW_UI_PROTOCOL_VERSION } from '@vibe-helper/contracts'

const APPLICATION_PATH = '/api/application'
const TEST_AGENT_PATH = '/api/test/agent'
export const DISCOVERY_ROUND_MCP_PATH = '/mcp/discovery-round'
export const DISCOVERY_PREVIEW_MCP_PATH = '/mcp/discovery-preview'
export const DISCOVERY_ENRICHMENT_MCP_PATH = '/mcp/discovery-enrichment'
export const DISCOVERY_MERGE_MCP_PATH = '/mcp/discovery-merge'
export const DISCOVERY_SPEC_MCP_PATH = '/mcp/discovery-spec'
export const DISCOVERY_SPEC_RECOVERY_MCP_PATH = '/mcp/discovery-spec-recovery'
const HEALTH_PATH = '/health'
const MAX_CLOCK_SKEW_SECONDS = 60

export interface CrewBackendOptions {
  readonly application: Pick<ApplicationService, 'executeUi'>
  readonly proxySecret: string
  readonly now?: () => number
  readonly testAgentExecutor?: (input: unknown) => Promise<unknown>
  readonly discoveryMcpHandlers?: Readonly<
    Record<
      string,
      {
        readonly fetch: (request: Request) => Promise<Response>
        readonly close: () => Promise<void>
      }
    >
  >
}

function json(response: ServerResponse, statusCode: number, body: unknown): void {
  const serialized = JSON.stringify(body)
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(serialized),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(serialized)
}

function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex')
}

export function createProxySignature(input: {
  readonly secret: string
  readonly timestamp: string
  readonly method: string
  readonly target: string
  readonly body: Buffer
}): string {
  const message = `${input.timestamp}:${input.method}:${input.target}:${sha256(input.body)}`
  return createHmac('sha256', input.secret).update(message).digest('hex')
}

export function verifyProxyRequest(input: {
  readonly header: string | undefined
  readonly secret: string
  readonly method: string
  readonly target: string
  readonly body: Buffer
  readonly now: number
}): boolean {
  if (input.secret.length === 0 || input.header === undefined) return false
  const separator = input.header.indexOf(':')
  if (separator < 1) return false
  const timestamp = input.header.slice(0, separator)
  const signature = input.header.slice(separator + 1)
  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return false
  if (Math.abs(input.now - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) return false
  const expected = createProxySignature({
    secret: input.secret,
    timestamp,
    method: input.method,
    target: input.target,
    body: input.body,
  })
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > MAX_APPLICATION_PAYLOAD_BYTES) {
        reject(new RangeError('PAYLOAD_TOO_LARGE'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

function webHeaders(request: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined || name.toLowerCase() === 'host') continue
    headers.set(name, Array.isArray(value) ? value.join(', ') : value)
  }
  return headers
}

async function handleDiscoveryMcpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  path: string,
  handler: NonNullable<CrewBackendOptions['discoveryMcpHandlers']>[string],
): Promise<void> {
  const method = request.method ?? 'GET'
  let body: Buffer | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      body = await readBody(request)
    } catch (error) {
      if (error instanceof RangeError && error.message === 'PAYLOAD_TOO_LARGE') {
        if (!response.headersSent) json(response, 413, { error: 'payload too large' })
        return
      }
      if (!response.headersSent) json(response, 400, { error: 'request body could not be read' })
      return
    }
  }
  const webRequest = new Request(`http://127.0.0.1${path}`, {
    method,
    headers: webHeaders(request),
    ...(body === undefined ? {} : { body }),
  })
  const mcpResponse = await handler.fetch(webRequest)
  const headers: Record<string, string> = {}
  mcpResponse.headers.forEach((value, name) => {
    headers[name] = value
  })
  const responseBody = Buffer.from(await mcpResponse.arrayBuffer())
  headers['content-length'] = String(responseBody.byteLength)
  response.writeHead(mcpResponse.status, headers)
  response.end(responseBody)
}

function isApplicationResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('success' in value)) return false
  const record = value as Record<string, unknown>
  return (
    (record.success === true && 'data' in record) ||
    (record.success === false && typeof record.error === 'object' && record.error !== null)
  )
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: CrewBackendOptions,
): Promise<void> {
  const target = request.url ?? '/'
  if (target === HEALTH_PATH && request.method === 'GET') {
    json(response, 200, { status: 'ok' })
    return
  }
  const discoveryMcpHandler = options.discoveryMcpHandlers?.[target]
  if (discoveryMcpHandler !== undefined) {
    await handleDiscoveryMcpRequest(request, response, target, discoveryMcpHandler)
    return
  }
  const testAgentExecutor = options.testAgentExecutor
  const isApplicationRequest = target === APPLICATION_PATH
  const isTestAgentRequest = target === TEST_AGENT_PATH && testAgentExecutor !== undefined
  if (!isApplicationRequest && !isTestAgentRequest) {
    json(response, 404, { error: 'not found' })
    return
  }
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST')
    json(response, 405, { error: 'method not allowed' })
    return
  }
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    json(response, 415, { error: 'application/json is required' })
    return
  }
  const contentLength = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_APPLICATION_PAYLOAD_BYTES) {
    json(response, 413, { error: 'payload too large' })
    return
  }

  let body: Buffer
  try {
    body = await readBody(request)
  } catch (error) {
    if (error instanceof RangeError && error.message === 'PAYLOAD_TOO_LARGE') {
      if (!response.headersSent) json(response, 413, { error: 'payload too large' })
      return
    }
    if (!response.headersSent) json(response, 400, { error: 'request body could not be read' })
    return
  }

  if (
    !verifyProxyRequest({
      header:
        typeof request.headers['x-kirocrew-proxy'] === 'string'
          ? request.headers['x-kirocrew-proxy']
          : undefined,
      secret: options.proxySecret,
      method: request.method,
      target,
      body,
      now: (options.now ?? (() => Date.now() / 1_000))(),
    })
  ) {
    json(response, 401, { error: 'proxy authentication failed' })
    return
  }

  let input: unknown
  try {
    input = JSON.parse(body.toString('utf8'))
  } catch {
    json(response, 400, { error: 'invalid JSON' })
    return
  }

  if (isApplicationRequest) {
    if (
      typeof input !== 'object' ||
      input === null ||
      !('clientProtocolVersion' in input) ||
      input.clientProtocolVersion !== CREW_UI_PROTOCOL_VERSION
    ) {
      json(response, 409, {
        error: 'ui protocol mismatch',
        expectedProtocolVersion: CREW_UI_PROTOCOL_VERSION,
      })
      return
    }
    const { clientProtocolVersion: _clientProtocolVersion, ...applicationInput } = input
    input = applicationInput
  }

  const result =
    isTestAgentRequest && testAgentExecutor !== undefined
      ? await testAgentExecutor(input)
      : await options.application.executeUi(input)
  if (!isApplicationResult(result)) {
    json(response, 500, { error: 'invalid Core response' })
    return
  }
  json(response, 200, result)
}

export function createCrewBackendServer(options: CrewBackendOptions): Server {
  if (options.proxySecret.length < 32) {
    throw new TypeError('Crew proxy secret must contain at least 32 characters')
  }
  const server = createServer((request, response) => {
    void handleRequest(request, response, options).catch(() => {
      if (!response.headersSent) json(response, 500, { error: 'internal server error' })
      else response.end()
    })
  })
  if (options.discoveryMcpHandlers !== undefined) {
    server.once('close', () => {
      for (const handler of Object.values(options.discoveryMcpHandlers ?? {})) {
        void handler.close()
      }
    })
  }
  return server
}
