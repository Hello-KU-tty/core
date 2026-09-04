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
    if (path.startsWith(`${chatSlotsPath}/`) && path.endsWith('/project')) {
      if (localStorage.getItem('vibe-helper.test.crew-disconnected') === 'true') {
        throw new Error('Synthetic Crew disconnect')
      }
      const stored = localStorage.getItem('vibe-helper.test.slots')
      const slots: unknown = stored === null ? [] : JSON.parse(stored)
      const slotKey = path.slice(chatSlotsPath.length + 1, -'/project'.length)
      if (Array.isArray(slots)) {
        localStorage.setItem(
          'vibe-helper.test.slots',
          JSON.stringify(
            slots.map((slot) =>
              typeof slot === 'object' && slot !== null && 'key' in slot && slot.key === slotKey
                ? { ...slot, project: input.project }
                : slot,
            ),
          ),
        )
      }
      return { ok: typeof input.project === 'string', project: input.project }
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

interface DevChatMessage {
  readonly id?: string
  readonly role?: string
  readonly content?: unknown
}

interface DevChatSlot {
  readonly key?: string
  readonly messages?: readonly DevChatMessage[]
  readonly [key: string]: unknown
}

function readDevSlots(): readonly DevChatSlot[] {
  const stored = localStorage.getItem('vibe-helper.test.slots')
  if (stored === null) return []
  const parsed: unknown = JSON.parse(stored)
  return Array.isArray(parsed) ? (parsed as readonly DevChatSlot[]) : []
}

function appendDevMessage(slotKey: string, message: DevChatMessage): void {
  const slots = readDevSlots()
  const found = slots.some((slot) => slot.key === slotKey)
  const next = found
    ? slots.map((slot) =>
        slot.key === slotKey ? { ...slot, messages: [...(slot.messages ?? []), message] } : slot,
      )
    : [...slots, { key: slotKey, messages: [message] }]
  localStorage.setItem('vibe-helper.test.slots', JSON.stringify(next))
}

function visibleChatContent(content: unknown): string {
  if (typeof content !== 'string') return ''
  return content.replace(/\n?\[OPTIONS:\s*[\s\S]*?\]\s*$/i, '').trim()
}

function DevChatContent({ content }: { readonly content: string }) {
  const segments = content.split(/(```diff[\s\S]*?```)/g)
  return createElement(
    'div',
    { className: 'dev-chat-content' },
    ...segments.flatMap((segment, index) => {
      if (segment.startsWith('```diff')) {
        return [
          createElement(
            'pre',
            { className: 'dev-native-diff', 'data-native-diff': true, key: `diff-${index}` },
            segment
              .replace(/^```diff\s*/i, '')
              .replace(/```$/, '')
              .trim(),
          ),
        ]
      }
      return segment.length === 0
        ? []
        : [createElement('p', { key: `text-${index}` }, segment.trim())]
    }),
  )
}

export function ChatMessageList({
  messages,
  running,
}: {
  readonly messages: readonly unknown[]
  readonly running?: boolean
}) {
  const normalized = messages.filter(
    (message): message is DevChatMessage => typeof message === 'object' && message !== null,
  )
  return createElement(
    'div',
    { className: 'dev-chat-messages' },
    ...normalized.flatMap((message, index) => {
      const content = visibleChatContent(message.content)
      if (content.length === 0) return []
      const messageRole = message.role === 'user' ? 'user' : 'assistant'
      return [
        createElement(
          'article',
          {
            className: `dev-chat-message dev-chat-message-${messageRole}`,
            key: message.id ?? index,
          },
          createElement('span', null, messageRole === 'user' ? 'You' : 'Agent'),
          createElement(DevChatContent, { content }),
        ),
      ]
    }),
    running ? createElement('p', { className: 'dev-chat-running' }, 'Agent is working…') : null,
  )
}

export function ChatEmbed({
  slotKey,
  agent,
  placeholder,
  onSend,
}: {
  readonly slotKey: string
  readonly agent?: string
  readonly placeholder?: string
  readonly frameless?: boolean
  readonly startAtBottom?: boolean
  readonly onSend?: (message: string) => void | Promise<void>
}) {
  const [messages, setMessages] = useState<readonly DevChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const role = agent?.includes('builder') === true ? 'Builder' : 'Helper'

  useEffect(() => {
    const refresh = (): void => {
      setMessages(readDevSlots().find((slot) => slot.key === slotKey)?.messages ?? [])
    }
    refresh()
    const interval = window.setInterval(refresh, 100)
    return () => window.clearInterval(interval)
  }, [slotKey])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const message = draft.trim()
    if (message.length === 0 || busy) return
    setDraft('')
    setBusy(true)
    appendDevMessage(slotKey, {
      id: `test-user-${crypto.randomUUID()}`,
      role: 'user',
      content: message,
    })
    try {
      await onSend?.(message)
    } finally {
      setBusy(false)
    }
  }

  return createElement(
    'div',
    { className: 'dev-chat-embed' },
    createElement(
      'div',
      { className: 'dev-chat-messages', role: 'log', 'aria-label': `${role} transcript` },
      ...messages.flatMap((message, index) => {
        const content = visibleChatContent(message.content)
        if (content.length === 0) return []
        const messageRole = message.role === 'user' ? 'user' : 'assistant'
        return [
          createElement(
            'article',
            {
              className: `dev-chat-message dev-chat-message-${messageRole}`,
              key: message.id ?? index,
            },
            createElement('span', null, messageRole === 'user' ? 'You' : role),
            createElement(DevChatContent, { content }),
          ),
        ]
      }),
    ),
    createElement(
      'form',
      { className: 'dev-chat-composer', onSubmit: (event: FormEvent) => void submit(event) },
      createElement('textarea', {
        'aria-label': `${role} message`,
        value: draft,
        placeholder,
        disabled: busy,
        onChange: (event: { currentTarget: { value: string } }) =>
          setDraft(event.currentTarget.value),
      }),
      createElement(
        'button',
        { type: 'submit', disabled: busy || draft.trim().length === 0 },
        busy ? `${role} 응답 중…` : `${role}에게 보내기`,
      ),
    ),
  )
}
import { createElement, type FormEvent, useEffect, useState } from 'react'
