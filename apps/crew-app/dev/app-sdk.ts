const applicationPrefix = '/apps/vibe-helper/api'
const applicationTarget = '/api/application'
const chatSlotsPath = ['/api', 'chat', 'slots'].join('/')
const testProxySecret = 'test-proxy-secret-with-at-least-thirty-two-bytes'

async function signature(body: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1_000).toString()
  const bytes = new TextEncoder().encode(body)
  const bodyHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(testProxySecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const payload = new TextEncoder().encode(`${timestamp}:POST:${applicationTarget}:${bodyHash}`)
  const digest = await crypto.subtle.sign('HMAC', key, payload)
  const mac = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  return `${timestamp}:${mac}`
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}`)
  return response.json()
}

const api = {
  async get(path: string): Promise<unknown> {
    if (path.startsWith(chatSlotsPath)) {
      if (localStorage.getItem('vibe-helper.test.crew-disconnected') === 'true')
        throw new Error('Synthetic Crew disconnect')
      const stored = localStorage.getItem('vibe-helper.test.slots')
      const slots: unknown = stored === null ? [] : JSON.parse(stored)
      if (path === chatSlotsPath) return slots
      const slotKey = path.slice(chatSlotsPath.length + 1).split('?')[0]
      return Array.isArray(slots)
        ? (slots.find(
            (slot) =>
              typeof slot === 'object' && slot !== null && 'key' in slot && slot.key === slotKey,
          ) ?? { key: slotKey, messages: [] })
        : { key: slotKey, messages: [] }
    }
    return readJson(await fetch(path))
  },
  async post(path: string, input: Readonly<Record<string, unknown>>): Promise<unknown> {
    if (path === chatSlotsPath) {
      if (localStorage.getItem('vibe-helper.test.crew-disconnected') === 'true') {
        throw new Error('Synthetic Crew disconnect')
      }
      const stored = localStorage.getItem('vibe-helper.test.slots')
      const slots: unknown = stored === null ? [] : JSON.parse(stored)
      if (!Array.isArray(slots) || typeof input.name !== 'string') {
        throw new Error('Synthetic Crew slot request is invalid')
      }
      const slot = {
        key: input.name,
        name: input.name,
        agent: input.agent,
        memory_mode: input.memory_mode,
        messages: [],
      }
      localStorage.setItem('vibe-helper.test.slots', JSON.stringify([...slots, slot]))
      return slot
    }
    if (path.startsWith(`${chatSlotsPath}/`) && path.endsWith('/context')) {
      if (localStorage.getItem('vibe-helper.test.crew-disconnected') === 'true') {
        throw new Error('Synthetic Crew disconnect')
      }
      return { ok: typeof input.content === 'string' && input.content.length > 0 }
    }
    const body = JSON.stringify(input)
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (path.startsWith(applicationPrefix)) headers['x-kirocrew-proxy'] = await signature(body)
    return readJson(await fetch(path, { method: 'POST', headers, body }))
  },
}

export function useAppApi() {
  return api
}
