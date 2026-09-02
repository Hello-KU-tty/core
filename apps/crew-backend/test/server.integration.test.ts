import { once } from 'node:events'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createCrewBackendServer, createProxySignature } from '../src/server.js'

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
): Promise<string> {
  const server = createCrewBackendServer({
    application: { executeUi } as never,
    proxySecret: secret,
    now: () => Number(timestamp),
  })
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function signedHeaders(body: string, overrides: Record<string, string> = {}): HeadersInit {
  const bytes = Buffer.from(body)
  return {
    'content-type': 'application/json',
    'x-kirocrew-proxy': `${timestamp}:${createProxySignature({
      secret,
      timestamp,
      method: 'POST',
      target,
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
    const body = JSON.stringify({ schemaVersion: 1, kind: 'UI_LIST_PROJECTS' })

    const response = await fetch(`${baseUrl}${target}`, {
      method: 'POST',
      headers: signedHeaders(body),
      body,
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true, data: JSON.parse(body) })
    expect(executeUi).toHaveBeenCalledOnce()

    const tampered = await fetch(`${baseUrl}${target}`, {
      method: 'POST',
      headers: signedHeaders(body),
      body: `${body} `,
    })
    expect(tampered.status).toBe(401)
    expect(executeUi).toHaveBeenCalledOnce()
  })

  it('rejects stale signatures, unsupported media, and malformed Core envelopes', async () => {
    const body = '{}'
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
})
