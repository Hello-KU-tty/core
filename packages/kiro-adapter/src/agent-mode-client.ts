import { redactSensitiveText } from '@vibe-helper/application/redaction'

import { builderSlotKey } from './agent-slots.js'
import { type BuilderStreamEvent, normalizeBuilderStreamLine } from './builder-stream.js'

const CHAT_PATH = '/api/chat'
const SLOT_PATH = '/api/chat/slots'
const BUILDER_AGENT = 'vibe-helper-builder'
const HELPER_AGENT = 'vibe-helper-helper'
const MAX_ASSISTANT_CHARACTERS = 12_000

interface AgentModeApi {
  get(path: string): Promise<unknown>
  post(path: string, body: Readonly<Record<string, unknown>>): Promise<unknown>
}

export type AgentModeFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, 'body' | 'ok' | 'status' | 'text'>>

export interface AgentModeCompletion {
  readonly assistantSummary: string
  readonly status: 'DONE' | 'STREAM_FAILED'
}

export interface AgentModeDispatchReceipt {
  readonly slotKey: string
  readonly completion: Promise<AgentModeCompletion>
}

export interface BuilderDispatchInput {
  readonly projectId: string
  readonly taskId: string
  readonly workspaceDirectory: string
  readonly message: string
  readonly onEvent: (event: BuilderStreamEvent) => void
}

export interface HelperDispatchInput {
  readonly projectId: string
  readonly message: string
  readonly onText?: (text: string) => void
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function helperSlotKey(projectId: string): string {
  return `vibe-helper-helper-${projectId}`
}

interface AssistantTextPart {
  readonly kind: 'CHUNK' | 'FINAL'
  readonly text: string
}

function assistantTextPart(payload: string): AssistantTextPart | null {
  let value: unknown
  try {
    value = JSON.parse(payload)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  let event = value
  if (typeof event.content === 'string') {
    try {
      const nested: unknown = JSON.parse(event.content)
      if (isRecord(nested)) event = nested
    } catch {
      // A normal assistant message is not a nested transport envelope.
    }
  }
  const marker =
    `${String(event.type ?? event.event ?? event.kind ?? '')} ${String(event.cls ?? '')}`
      .trim()
      .toLocaleLowerCase('en-US')
  if (
    marker.includes('tool') ||
    marker.includes('error') ||
    marker.includes('status') ||
    marker.includes('context_usage') ||
    marker.includes('context-usage') ||
    marker === 'done' ||
    (typeof event.slot === 'string' &&
      typeof event.used_tokens === 'number' &&
      typeof event.window_tokens === 'number')
  ) {
    return null
  }
  for (const key of ['content', 'text', 'delta', 'message']) {
    const candidate = event[key]
    if (typeof candidate === 'string') {
      return { kind: marker.includes('chunk') ? 'CHUNK' : 'FINAL', text: candidate }
    }
    if (isRecord(candidate)) {
      for (const nestedKey of ['content', 'text', 'delta', 'message']) {
        const nested = candidate[nestedKey]
        if (typeof nested === 'string') {
          return { kind: marker.includes('chunk') ? 'CHUNK' : 'FINAL', text: nested }
        }
      }
    }
  }
  return null
}

function assistantText(payload: string): string {
  return assistantTextPart(payload)?.text ?? ''
}

async function consumeSse(
  response: Pick<Response, 'body' | 'text'>,
  onPayload: (payload: string) => void,
): Promise<string> {
  const assistantChunks: string[] = []
  let assistantCharacters = 0
  let finalAssistantMessage = ''
  const acceptPayload = (payload: string): void => {
    const trimmed = payload.trim()
    if (trimmed.length === 0 || trimmed === '[DONE]') return
    onPayload(trimmed)
    const part = assistantTextPart(trimmed)
    if (part === null) return
    if (part.kind === 'FINAL') {
      finalAssistantMessage = part.text.slice(0, MAX_ASSISTANT_CHARACTERS)
      return
    }
    if (assistantCharacters >= MAX_ASSISTANT_CHARACTERS) return
    const bounded = part.text.slice(0, MAX_ASSISTANT_CHARACTERS - assistantCharacters)
    assistantChunks.push(bounded)
    assistantCharacters += bounded.length
  }
  const acceptBlock = (block: string): void => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (data.length > 0) acceptPayload(data)
  }

  if (response.body === null) {
    const text = await response.text()
    const blocks = text.split(/\r?\n\r?\n/)
    if (blocks.some((block) => block.includes('data:'))) blocks.forEach(acceptBlock)
    else text.split(/\r?\n/).forEach(acceptPayload)
    return finalAssistantMessage || assistantChunks.join('')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  while (true) {
    const next = await reader.read()
    buffered += decoder.decode(next.value, { stream: !next.done })
    const blocks = buffered.split(/\r?\n\r?\n/)
    buffered = blocks.pop() ?? ''
    blocks.forEach(acceptBlock)
    if (next.done) break
  }
  if (buffered.trim().length > 0) {
    if (buffered.includes('data:')) acceptBlock(buffered)
    else acceptPayload(buffered)
  }
  return finalAssistantMessage || assistantChunks.join('')
}

export class CrewAgentModeClient {
  readonly #api: AgentModeApi
  readonly #fetch: AgentModeFetch
  readonly #streamSequenceBySlot = new Map<string, number>()

  constructor(api: AgentModeApi, options: { readonly fetch?: AgentModeFetch } = {}) {
    this.#api = api
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init))
  }

  async dispatchBuilder(input: BuilderDispatchInput): Promise<AgentModeDispatchReceipt> {
    const key = builderSlotKey(input.projectId)
    const existing = await this.#ensureSlot(key, BUILDER_AGENT)
    const existingProject = typeof existing.project === 'string' ? existing.project : ''
    const existingMessages = Array.isArray(existing.messages) ? existing.messages.length : 0
    if (existingMessages > 0 && existingProject !== input.workspaceDirectory) {
      throw new Error('Builder slot workspace cannot be verified before dispatch.')
    }
    if (existingProject !== input.workspaceDirectory) {
      const bound = await this.#api.post(`${SLOT_PATH}/${key}/project`, {
        project: input.workspaceDirectory,
      })
      if (!isRecord(bound) || bound.ok !== true || bound.project !== input.workspaceDirectory) {
        throw new Error('Crew did not confirm the Core-assigned Builder workspace.')
      }
    }

    const response = await this.#dispatch(key, BUILDER_AGENT, input.message)
    let sequence = this.#streamSequenceBySlot.get(key) ?? 0
    const completion = consumeSse(response, (payload) => {
      sequence += 1
      this.#streamSequenceBySlot.set(key, sequence)
      const event = normalizeBuilderStreamLine(payload, sequence, input.workspaceDirectory)
      if (event !== null) input.onEvent(event)
    })
      .then((summary) => ({
        assistantSummary: redactSensitiveText(summary, input.workspaceDirectory),
        status: 'DONE' as const,
      }))
      .catch(() => ({ assistantSummary: '', status: 'STREAM_FAILED' as const }))
    return { slotKey: key, completion }
  }

  async dispatchHelper(input: HelperDispatchInput): Promise<AgentModeDispatchReceipt> {
    const key = helperSlotKey(input.projectId)
    await this.#ensureSlot(key, HELPER_AGENT)
    const response = await this.#dispatch(key, HELPER_AGENT, input.message)
    const completion = consumeSse(response, (payload) => {
      const text = redactSensitiveText(assistantText(payload))
      if (text.length > 0) input.onText?.(text)
    })
      .then((summary) => ({
        assistantSummary: redactSensitiveText(summary).trim().slice(0, 240),
        status: 'DONE' as const,
      }))
      .catch(() => ({ assistantSummary: '', status: 'STREAM_FAILED' as const }))
    return { slotKey: key, completion }
  }

  async #dispatch(
    slot: string,
    agent: string,
    message: string,
  ): Promise<Pick<Response, 'body' | 'text'>> {
    const response = await this.#fetch(CHAT_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, slot, agent }),
    })
    if (!response.ok) throw new Error(`Crew Agent dispatch failed with HTTP ${response.status}.`)
    return response
  }

  async #ensureSlot(key: string, agent: string): Promise<Readonly<Record<string, unknown>>> {
    const slots = await this.#api.get(SLOT_PATH)
    if (!Array.isArray(slots)) throw new Error('Crew returned an invalid slot list.')
    const existing = slots.find((slot) => isRecord(slot) && slot.key === key)
    if (isRecord(existing)) {
      if (
        typeof existing.agent === 'string' &&
        existing.agent.length > 0 &&
        existing.agent !== agent
      ) {
        throw new Error('Crew slot belongs to another Agent.')
      }
      if (!Array.isArray(existing.messages)) {
        const detail = await this.#api.get(`${SLOT_PATH}/${key}?limit=1`)
        return isRecord(detail) ? { ...existing, ...detail } : existing
      }
      return existing
    }
    const created = await this.#api.post(SLOT_PATH, {
      name: key,
      agent,
      memory_mode: 'temporary',
    })
    if (
      !isRecord(created) ||
      created.key !== key ||
      (typeof created.agent === 'string' && created.agent.length > 0 && created.agent !== agent)
    ) {
      throw new Error('Crew returned a slot that does not match the requested Agent.')
    }
    return typeof created.agent === 'string' ? created : { ...created, agent }
  }
}
