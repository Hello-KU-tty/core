import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { CREW_UI_PROTOCOL_VERSION } from '@vibe-helper/contracts'

import {
  ANALYSIS_PATH,
  ANALYST_CONTEXT_PATH,
  BUILDER_MCP_PATH,
  type CrewBackendOptions,
  createCrewBackendServer,
  createProxySignature,
  DISCOVERY_ROUND_MCP_PATH,
  DISCOVERY_SPEC_MCP_PATH,
  DISCOVERY_SPEC_RECOVERY_MCP_PATH,
  HELPER_MCP_PATH,
} from '../src/server.js'

const secret = 'test-proxy-secret-with-at-least-thirty-two-bytes'
const timestamp = '1788292800'
const target = '/api/application'

const servers: ReturnType<typeof createCrewBackendServer>[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.close()
      await once(server, 'close')
    }),
  )
})

async function start(
  executeUi: (input: unknown) => Promise<unknown> = async (input) => ({
    success: true,
    data: input,
  }),
  mcpHandlers?: CrewBackendOptions['mcpHandlers'],
): Promise<string> {
  const server = createCrewBackendServer({
    application: { executeUi } as never,
    proxySecret: secret,
    now: () => Number(timestamp),
    mcpHandlers,
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function signedHeaders(
  body: string,
  overrides: Record<string, string> = {},
  requestTarget = target,
): HeadersInit {
  const bytes = Buffer.from(body)
  return {
    'content-type': 'application/json',
    'x-kirocrew-proxy': `${timestamp}:${createProxySignature({
      secret,
      timestamp,
      method: 'POST',
      target: requestTarget,
      body: bytes,
    })}`,
    ...overrides,
  }
}

describe('Crew Node backend', () => {
  it('leaves only health unsigned and rejects direct loopback callers', async () => {
    const executeUi = vi.fn(async () => ({ success: true, data: {} }))
    const baseUrl = await start(executeUi)

    const health = await fetch(`${baseUrl}/health`)
    expect(health.status).toBe(200)
    await expect(health.json()).resolves.toEqual({ status: 'ok' })

    const unauthorized = await fetch(`${baseUrl}${target}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(unauthorized.status).toBe(401)
    expect(executeUi).not.toHaveBeenCalled()
  })

  it('verifies the exact body-bound proxy HMAC before dispatching UI contracts', async () => {
    const executeUi = vi.fn(async (input: unknown) => ({ success: true, data: input }))
    const baseUrl = await start(executeUi)
    const applicationInput = { schemaVersion: 1, kind: 'UI_LIST_PROJECTS' }
    const body = JSON.stringify({
      ...applicationInput,
      clientProtocolVersion: CREW_UI_PROTOCOL_VERSION,
    })

    const response = await fetch(`${baseUrl}${target}`, {
      method: 'POST',
      headers: signedHeaders(body),
      body,
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, data: applicationInput })
    expect(executeUi).toHaveBeenCalledOnce()

    const tampered = await fetch(`${baseUrl}${target}`, {
      method: 'POST',
      headers: signedHeaders(body),
      body: `${body} `,
    })
    expect(tampered.status).toBe(401)
    expect(executeUi).toHaveBeenCalledOnce()
  })

  it('rejects stale UI bundles before they can dispatch removed Agent protocols', async () => {
    const executeUi = vi.fn(async (input: unknown) => ({ success: true, data: input }))
    const baseUrl = await start(executeUi)
    const body = JSON.stringify({ schemaVersion: 1, kind: 'UI_LIST_PROJECTS' })

    const response = await fetch(`${baseUrl}${target}`, {
      method: 'POST',
      headers: signedHeaders(body),
      body,
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'ui protocol mismatch',
      expectedProtocolVersion: CREW_UI_PROTOCOL_VERSION,
    })
    expect(executeUi).not.toHaveBeenCalled()
  })

  it('keeps background analysis on two authenticated narrow routes', async () => {
    const executeAnalysis = vi.fn(async (input: unknown) => ({ success: true, data: [input] }))
    const executeAgent = vi.fn(async (role: string, input: unknown) => ({
      success: true,
      data: { role, input },
    }))
    const server = createCrewBackendServer({
      application: {
        executeUi: async () => ({ success: true, data: {} }),
        executeAnalysis,
        executeAgent,
      } as never,
      proxySecret: secret,
      now: () => Number(timestamp),
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const input = {
      schemaVersion: 1,
      kind: 'ANALYSIS_LIST_PENDING',
      correlationId: 'corr_00000000-0000-4000-8000-000000000001',
      actor: { kind: 'KIRO_ADAPTER' },
      limit: 10,
      clientProtocolVersion: CREW_UI_PROTOCOL_VERSION,
    }
    const analysisBody = JSON.stringify(input)
    const analysis = await fetch(`${baseUrl}${ANALYSIS_PATH}`, {
      method: 'POST',
      headers: signedHeaders(analysisBody, {}, ANALYSIS_PATH),
      body: analysisBody,
    })
    expect(analysis.status).toBe(200)
    expect(executeAnalysis).toHaveBeenCalledWith({
      schemaVersion: 1,
      kind: 'ANALYSIS_LIST_PENDING',
      correlationId: 'corr_00000000-0000-4000-8000-000000000001',
      actor: { kind: 'KIRO_ADAPTER' },
      limit: 10,
    })

    const analystBody = JSON.stringify({
      schemaVersion: 1,
      kind: 'ANALYST_GET_EPISODE_CONTEXT',
      correlationId: 'corr_00000000-0000-4000-8000-000000000001',
      clientProtocolVersion: CREW_UI_PROTOCOL_VERSION,
    })
    const analyst = await fetch(`${baseUrl}${ANALYST_CONTEXT_PATH}`, {
      method: 'POST',
      headers: signedHeaders(analystBody, {}, ANALYST_CONTEXT_PATH),
      body: analystBody,
    })
    expect(analyst.status).toBe(200)
    expect(executeAgent).toHaveBeenCalledWith('EVIDENCE_ANALYST', {
      schemaVersion: 1,
      kind: 'ANALYST_GET_EPISODE_CONTEXT',
      correlationId: 'corr_00000000-0000-4000-8000-000000000001',
    })

    const writeBody = JSON.stringify({
      schemaVersion: 1,
      kind: 'ANALYST_SUBMIT_EVIDENCE_PROPOSALS',
      correlationId: 'corr_00000000-0000-4000-8000-000000000001',
      clientProtocolVersion: CREW_UI_PROTOCOL_VERSION,
    })
    const forbiddenWrite = await fetch(`${baseUrl}${ANALYST_CONTEXT_PATH}`, {
      method: 'POST',
      headers: signedHeaders(writeBody, {}, ANALYST_CONTEXT_PATH),
      body: writeBody,
    })
    expect(forbiddenWrite.status).toBe(403)
    expect(executeAgent).toHaveBeenCalledOnce()

    const unsigned = await fetch(`${baseUrl}${ANALYSIS_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: analysisBody,
    })
    expect(unsigned.status).toBe(401)
  })

  it('turns a ready Core result into a supervised loopback URL and closes the runtime', async () => {
    const ready = {
      schemaVersion: 1 as const,
      correlationId: 'corr_00000000-0000-4000-8000-000000000001',
      projectId: 'project_00000000-0000-4000-8000-000000000002',
      workspacePath: 'projects/project_00000000-0000-4000-8000-000000000002',
      status: 'READY' as const,
    }
    const launch = vi.fn(async () => ({
      ...ready,
      status: 'RUNNING' as const,
      url: 'http://127.0.0.1:43123/',
      reused: false,
    }))
    const close = vi.fn(async () => undefined)
    const server = createCrewBackendServer({
      application: {
        executeUi: async () => ({ success: true, data: ready }),
      } as never,
      proxySecret: secret,
      now: () => Number(timestamp),
      resultLauncher: { launch, close },
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const body = JSON.stringify({
      schemaVersion: 1,
      kind: 'UI_LAUNCH_RESULT',
      correlationId: ready.correlationId,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000003',
      projectId: ready.projectId,
      clientProtocolVersion: CREW_UI_PROTOCOL_VERSION,
    })

    const response = await fetch(`${baseUrl}${target}`, {
      method: 'POST',
      headers: signedHeaders(body),
      body,
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { status: 'RUNNING', url: 'http://127.0.0.1:43123/', reused: false },
    })
    expect(launch).toHaveBeenCalledWith(ready)
    servers.pop()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    expect(close).toHaveBeenCalledOnce()
  })

  it('rejects stale signatures, unsupported media, and malformed Core envelopes', async () => {
    const body = JSON.stringify({ clientProtocolVersion: CREW_UI_PROTOCOL_VERSION })
    const staleServer = createCrewBackendServer({
      application: { executeUi: async () => ({ success: true, data: {} }) } as never,
      proxySecret: secret,
      now: () => Number(timestamp) + 61,
    })
    servers.push(staleServer)
    staleServer.listen(0, '127.0.0.1')
    await once(staleServer, 'listening')
    const staleBase = `http://127.0.0.1:${(staleServer.address() as AddressInfo).port}`
    const stale = await fetch(`${staleBase}${target}`, {
      method: 'POST',
      headers: signedHeaders(body),
      body,
    })
    expect(stale.status).toBe(401)

    const baseUrl = await start(async () => ({ unexpected: true }))
    const media = await fetch(`${baseUrl}${target}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body,
    })
    expect(media.status).toBe(415)

    const invalidCore = await fetch(`${baseUrl}${target}`, {
      method: 'POST',
      headers: signedHeaders(body),
      body,
    })
    expect(invalidCore.status).toBe(500)
    await expect(invalidCore.json()).resolves.toEqual({ error: 'invalid Core response' })
  })

  it('exposes only configured role-bound MCP handlers and closes them with the backend', async () => {
    const fetchHandler = vi.fn(async (request: Request) => {
      expect(request.url).toBe(`http://127.0.0.1${DISCOVERY_ROUND_MCP_PATH}`)
      expect(request.method).toBe('POST')
      expect(request.headers.get('content-type')).toBe('application/json')
      await expect(request.json()).resolves.toEqual({ jsonrpc: '2.0', id: 1, method: 'initialize' })
      return Response.json(
        { jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25' } },
        { status: 200, headers: { 'mcp-session-id': 'discovery-session' } },
      )
    })
    const closeHandler = vi.fn(async () => undefined)
    const specFetchHandler = vi.fn(async () => Response.json({}))
    const specCloseHandler = vi.fn(async () => undefined)
    const specRecoveryCloseHandler = vi.fn(async () => undefined)
    const builderFetchHandler = vi.fn(async () => Response.json({ role: 'BUILDER' }))
    const builderCloseHandler = vi.fn(async () => undefined)
    const helperFetchHandler = vi.fn(async () => Response.json({ role: 'HELPER' }))
    const helperCloseHandler = vi.fn(async () => undefined)
    const baseUrl = await start(undefined, {
      [DISCOVERY_ROUND_MCP_PATH]: { fetch: fetchHandler, close: closeHandler },
      [DISCOVERY_SPEC_MCP_PATH]: { fetch: specFetchHandler, close: specCloseHandler },
      [DISCOVERY_SPEC_RECOVERY_MCP_PATH]: {
        fetch: specFetchHandler,
        close: specRecoveryCloseHandler,
      },
      [BUILDER_MCP_PATH]: { fetch: builderFetchHandler, close: builderCloseHandler },
      [HELPER_MCP_PATH]: { fetch: helperFetchHandler, close: helperCloseHandler },
    })

    const response = await fetch(`${baseUrl}${DISCOVERY_ROUND_MCP_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('mcp-session-id')).toBe('discovery-session')
    expect(fetchHandler).toHaveBeenCalledOnce()
    await expect((await fetch(`${baseUrl}${BUILDER_MCP_PATH}`)).json()).resolves.toEqual({
      role: 'BUILDER',
    })
    await expect((await fetch(`${baseUrl}${HELPER_MCP_PATH}`)).json()).resolves.toEqual({
      role: 'HELPER',
    })

    const server = servers.pop()
    expect(server).toBeDefined()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
    expect(closeHandler).toHaveBeenCalledOnce()
    expect(specCloseHandler).toHaveBeenCalledOnce()
    expect(specRecoveryCloseHandler).toHaveBeenCalledOnce()
    expect(builderCloseHandler).toHaveBeenCalledOnce()
    expect(helperCloseHandler).toHaveBeenCalledOnce()

    const withoutHandler = await start()
    expect((await fetch(`${withoutHandler}${DISCOVERY_ROUND_MCP_PATH}`)).status).toBe(404)
  })
})
