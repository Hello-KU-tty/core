import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { ApplicationService } from '@vibe-helper/application'
import {
  type KiroCoreBinding,
  parseKiroHookInput,
  translateKiroHook,
} from '@vibe-helper/kiro-adapter/kiro-workspace-node'
import type { LocalMcpHandler } from './agent-host.js'

const MAX_HOOK_BODY_BYTES = 64 * 1024

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * One Kiro workspace's hook authority. It can only record learner chat messages for the bound
 * Project and Task; it cannot read Core state or call any other command.
 */
export function createKiroHookBinding(options: {
  application: ApplicationService
  binding: KiroCoreBinding
}): { path: string; authorization: string; handler: LocalMcpHandler; revoke: () => void } {
  const path = `/hooks/kiro-${randomUUID()}`
  const authorization = `Bearer ${randomBytes(32).toString('hex')}`
  let active = true
  return {
    path,
    authorization,
    revoke: () => {
      active = false
    },
    handler: {
      fetch: async (request) => {
        const supplied = Buffer.from(request.headers.get('authorization') ?? '')
        const expected = Buffer.from(authorization)
        if (!active || supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
          return new Response(null, { status: 401 })
        if (request.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' })
        if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
          return json(415, { error: 'JSON_REQUIRED' })
        const body = await request.arrayBuffer()
        if (body.byteLength > MAX_HOOK_BODY_BYTES) return json(413, { error: 'PAYLOAD_TOO_LARGE' })
        let input: ReturnType<typeof parseKiroHookInput>
        try {
          input = parseKiroHookInput(JSON.parse(Buffer.from(body).toString('utf8')))
        } catch {
          return json(400, { error: 'KIRO_HOOK_INPUT_INVALID' })
        }
        const translated = translateKiroHook(options.binding, input)
        if (translated.kind === 'IGNORED') return json(200, { ignored: translated.reason })
        const result = await options.application.executeUi(translated.request)
        if (!result.success) return json(409, { error: result.error.code })
        return json(200, { recorded: true, receipt: result.data })
      },
      close: async () => {
        active = false
      },
    },
  }
}
