import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { MAX_APPLICATION_PAYLOAD_BYTES, type ApplicationService } from '@vibe-helper/application'

const APPLICATION_PATH = '/api/application'
const HEALTH_PATH = '/health'
const MAX_CLOCK_SKEW_SECONDS = 60

export interface CrewBackendOptions {
  readonly application: Pick<ApplicationService, 'executeUi'>
  readonly proxySecret: string
  readonly now?: () => number
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
  if (target !== APPLICATION_PATH) {
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

  const result = await options.application.executeUi(input)
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
  return createServer((request, response) => {
    void handleRequest(request, response, options).catch(() => {
      if (!response.headersSent) json(response, 500, { error: 'internal server error' })
      else response.end()
    })
  })
}
