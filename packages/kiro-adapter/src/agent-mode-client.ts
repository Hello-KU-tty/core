import { redactSensitiveText } from '@vibe-helper/application/redaction'

import { builderSlotKey, evidenceAnalystSlotKey, helperSlotKey } from './agent-slots.js'
import { type BuilderStreamEvent, normalizeBuilderStreamLine } from './builder-stream.js'

const CHAT_PATH = '/api/chat'
const SLOT_PATH = '/api/chat/slots'
const BUILDER_AGENT = 'vibe-helper-builder'
const HELPER_AGENT = 'vibe-helper-helper'
const EVIDENCE_ANALYST_AGENT = 'vibe-helper-evidence-analyst'
const MAX_ASSISTANT_CHARACTERS = 12_000

interface AgentModeApi {
  get(path: string): Promise<unknown>
  post(path: string, body: Readonly<Record<string, unknown>>): Promise<unknown>
}

export interface RenderableChatSession {
  readonly messages: readonly unknown[]
  readonly running: boolean
}

export type AgentModeFetch = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, 'body' | 'ok' | 'status' | 'text'>>

export interface AgentModeCompletion {
  readonly assistantText: string
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
  readonly context: string
  readonly onEvent: (event: BuilderStreamEvent) => void
}

export interface HelperDispatchInput {
  readonly projectId: string
  readonly message: string
  readonly context: string
  readonly onText?: (text: string) => void
}

export interface EvidenceAnalystDispatchInput {
  readonly projectId: string
  readonly analysisJobId: string
  readonly attempt: number
  readonly context: string
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
      if (
        isRecord(nested) &&
        ('type' in nested || 'event' in nested || 'kind' in nested || 'cls' in nested)
      ) {
        event = nested
      }
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

function summarizeAssistantText(text: string): string {
  return text
    .replace(/\n?\[OPTIONS:\s*[\s\S]*?\]\s*$/i, '')
    .trim()
    .slice(0, 240)
}

function sanitizeRenderableText(text: string): string {
  const redacted = redactSensitiveText(text)
  const sanitized = redacted.replace(/(?:^|\n{1,2})Core tool identifiers:[^\n]*(?=\n|$)/g, '')
  return sanitized === redacted ? redacted : sanitized.replace(/\n{3,}/g, '\n\n').trim()
}

function redactRenderableValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeRenderableText(value)
  if (Array.isArray(value)) return value.map(redactRenderableValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, redactRenderableValue(nested)]),
  )
}

function isStopEvent(value: unknown): boolean {
  if (!isRecord(value)) return false
  const marker =
    `${String(value.kind ?? '')} ${String(value.type ?? '')} ${String(value.cls ?? '')}`
      .toLocaleLowerCase('en-US')
      .replaceAll('-', '_')
  if (marker.includes('stop_event')) return true
  if (typeof value.content !== 'string') return false
  try {
    return isStopEvent(JSON.parse(value.content) as unknown)
  } catch {
    return false
  }
}

function sanitizeRenderableMessage(value: unknown): unknown {
  const sanitized = redactRenderableValue(value)
  if (!isStopEvent(sanitized) || !isRecord(sanitized)) return sanitized
  return {
    ...sanitized,
    role: 'assistant',
    type: 'message',
    cls: 'message',
    content: 'Agent 실행이 중지되었습니다.',
  }
}

function assertRenderableSlotKey(slotKey: string): void {
  if (!/^vibe-helper-(?:builder|helper)(?:-v\d+)?-project_[0-9a-f-]{36}$/.test(slotKey)) {
    throw new Error('Crew chat slot is outside the Vibe Helper session boundary.')
  }
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

  async readRenderableSession(slotKey: string): Promise<RenderableChatSession> {
    assertRenderableSlotKey(slotKey)
    const slots = await this.#api.get(SLOT_PATH)
    if (!Array.isArray(slots)) throw new Error('Crew returned an invalid slot list.')
    if (!slots.some((slot) => isRecord(slot) && slot.key === slotKey)) {
      return { messages: [], running: false }
    }
    const detail = await this.#api.get(`${SLOT_PATH}/${slotKey}?limit=100`)
    if (!isRecord(detail) || !Array.isArray(detail.messages)) {
      throw new Error('Crew returned an invalid chat session.')
    }
    return {
      messages: detail.messages.slice(-100).map(sanitizeRenderableMessage),
      running: detail.running === true || detail.status === 'running' || detail.state === 'running',
    }
  }

  async stopSession(slotKey: string): Promise<void> {
    assertRenderableSlotKey(slotKey)
    const result = await this.#api.post(`${SLOT_PATH}/${slotKey}/stop`, {})
    if (!isRecord(result) || result.ok !== true) {
      throw new Error('Crew did not stop the active Agent turn.')
    }
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

    await this.#injectContext(key, input.context)

    const response = await this.#dispatch(key, BUILDER_AGENT, input.message)
    let sequence = this.#streamSequenceBySlot.get(key) ?? 0
    const completion = consumeSse(response, (payload) => {
      sequence += 1
      this.#streamSequenceBySlot.set(key, sequence)
      const event = normalizeBuilderStreamLine(payload, sequence, input.workspaceDirectory)
      if (event !== null) input.onEvent(event)
    })
      .then((text) => {
        const assistantText = redactSensitiveText(text, input.workspaceDirectory).trim()
        return {
          assistantText,
          assistantSummary: summarizeAssistantText(assistantText),
          status: 'DONE' as const,
        }
      })
      .catch(() => ({
        assistantText: '',
        assistantSummary: '',
        status: 'STREAM_FAILED' as const,
      }))
    return { slotKey: key, completion }
  }

  async dispatchHelper(input: HelperDispatchInput): Promise<AgentModeDispatchReceipt> {
    const key = helperSlotKey(input.projectId)
    await this.#ensureSlot(key, HELPER_AGENT)
    await this.#injectContext(key, input.context)
    const response = await this.#dispatch(key, HELPER_AGENT, input.message)
    const completion = consumeSse(response, (payload) => {
      const text = redactSensitiveText(assistantText(payload))
      if (text.length > 0) input.onText?.(text)
    })
      .then((text) => {
        const assistantText = redactSensitiveText(text).trim()
        return {
          assistantText,
          assistantSummary: summarizeAssistantText(assistantText),
          status: 'DONE' as const,
        }
      })
      .catch(() => ({
        assistantText: '',
        assistantSummary: '',
        status: 'STREAM_FAILED' as const,
      }))
    return { slotKey: key, completion }
  }

  async dispatchEvidenceAnalyst(
    input: EvidenceAnalystDispatchInput,
  ): Promise<AgentModeDispatchReceipt> {
    const key = evidenceAnalystSlotKey(input.projectId, input.analysisJobId, input.attempt)
    await this.#ensureSlot(key, EVIDENCE_ANALYST_AGENT)
    await this.#injectContext(key, input.context)
    const response = await this.#dispatch(
      key,
      EVIDENCE_ANALYST_AGENT,
      'Analyze the injected Episode context and return exactly one strict JSON result.',
    )
    const completion = consumeSse(response, () => undefined)
      .then((text) => {
        const assistantText = redactSensitiveText(text).trim()
        return {
          assistantText,
          assistantSummary: summarizeAssistantText(assistantText),
          status: 'DONE' as const,
        }
      })
      .catch(() => ({
        assistantText: '',
        assistantSummary: '',
        status: 'STREAM_FAILED' as const,
      }))
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

  async #injectContext(slot: string, content: string): Promise<void> {
    const result = await this.#api.post(`${SLOT_PATH}/${slot}/context`, {
      content,
      source: 'vibe-helper-core',
      ephemeral: true,
      maxAge: 300,
    })
    if (!isRecord(result) || result.ok !== true) {
      throw new Error('Crew did not accept the private Core session context.')
    }
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
