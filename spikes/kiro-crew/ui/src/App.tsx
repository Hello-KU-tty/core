import {
  ChatEmbed,
  type CrewEvent,
  type SlotSummary,
  useAppApi,
  useAppEvents,
  useAppInfo,
  useChatLauncher,
} from '@kirocrew/app-sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'

const BUILDER_SLOT = 'vibe-helper-probe-builder'
const HELPER_SLOT = 'vibe-helper-probe-helper'
const ANALYST_SLOT = 'vibe-helper-probe-analyst-s5'
const ANALYST_AGENT = 'vibe-probe-analyst'
const ANALYST_TIMEOUT_MS = 30_000
const ANALYST_POLL_MS = 500

type ProbeStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SlotState {
  key: string
  agent: string
}

interface ChatMessage {
  role?: string
  content?: unknown
}

interface ChatSlot extends SlotSummary {
  messages?: ChatMessage[] | number
}

interface AnalystProposal {
  kind: 'evidence_proposal'
  episodeId: string
  correlationId: string
  status: 'ok'
  observedConcepts: string[]
}

type AnalystRun =
  | { phase: 'idle'; detail: string }
  | { phase: 'dispatching' | 'running'; detail: string; episodeId: string }
  | {
      phase: 'pass'
      detail: string
      episodeId: string
      dispatchMs: number
      totalMs: number
    }
  | { phase: 'error'; detail: string; episodeId?: string }

interface EventCounts {
  chatMessage: number
  chatStatus: number
  chatChunk: number
  chatDone: number
  toolCall: number
  approval: number
  subagentStatus: number
  subagentDone: number
  slots: number
}

const initialCounts: EventCounts = {
  chatMessage: 0,
  chatStatus: 0,
  chatChunk: 0,
  chatDone: 0,
  toolCall: 0,
  approval: 0,
  subagentStatus: 0,
  subagentDone: 0,
  slots: 0,
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function dispatchAnalystEpisode(
  slot: SlotState,
  message: string,
): Promise<void> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, slot: slot.key, agent: slot.agent }),
  })

  if (!response.ok) {
    throw new Error(`Analyst dispatch failed with HTTP ${response.status}.`)
  }

  // `/api/chat` is an SSE endpoint. Drain it without blocking the UI; the
  // app-owned slot remains the recovery/query surface for validated results.
  void response.text().catch(() => undefined)
}

function messageText(message: ChatMessage): string | null {
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return null

  const parts = message.content
    .map((part) => {
      if (typeof part === 'string') return part
      if (
        typeof part === 'object' &&
        part !== null &&
        'text' in part &&
        typeof part.text === 'string'
      ) {
        return part.text
      }
      return ''
    })
    .filter(Boolean)

  return parts.length > 0 ? parts.join('') : null
}

function parseProposal(
  text: string,
  episodeId: string,
  correlationId: string,
): AnalystProposal | null {
  try {
    const value: unknown = JSON.parse(text)
    if (
      typeof value !== 'object' ||
      value === null ||
      !('kind' in value) ||
      value.kind !== 'evidence_proposal' ||
      !('episodeId' in value) ||
      value.episodeId !== episodeId ||
      !('correlationId' in value) ||
      value.correlationId !== correlationId ||
      !('status' in value) ||
      value.status !== 'ok' ||
      !('observedConcepts' in value) ||
      !Array.isArray(value.observedConcepts) ||
      !value.observedConcepts.every((item) => typeof item === 'string')
    ) {
      return null
    }
    return value as AnalystProposal
  } catch {
    return null
  }
}

function eventSlot(event: CrewEvent): string {
  const value = event.slot ?? event.slot_id
  return typeof value === 'string' ? value : ''
}

export default function App() {
  const api = useAppApi()
  const appInfo = useAppInfo()
  const { openChat } = useChatLauncher()
  const [status, setStatus] = useState<ProbeStatus>('idle')
  const [message, setMessage] = useState('Initialize the two app-owned slots.')
  const [builder, setBuilder] = useState<SlotState | null>(null)
  const [helper, setHelper] = useState<SlotState | null>(null)
  const [counts, setCounts] = useState<EventCounts>(initialCounts)
  const [permissionProbe, setPermissionProbe] = useState<'pending' | 'pass' | 'fail'>(
    'pending',
  )
  const [analystRun, setAnalystRun] = useState<AnalystRun>({
    phase: 'idle',
    detail: 'No Episode has been dispatched.',
  })

  const updateEvent = useCallback(
    (key: keyof EventCounts, event: CrewEvent) => {
      const slot = eventSlot(event)
      if (slot && slot !== builder?.key && slot !== helper?.key) return
      setCounts((current) => ({ ...current, [key]: current[key] + 1 }))
    },
    [builder?.key, helper?.key],
  )

  useAppEvents('chat_message', (event) => updateEvent('chatMessage', event))
  useAppEvents('chat_status', (event) => updateEvent('chatStatus', event))
  useAppEvents('chat_chunk', (event) => updateEvent('chatChunk', event))
  useAppEvents('chat_done', (event) => updateEvent('chatDone', event))
  useAppEvents('tool_call', (event) => updateEvent('toolCall', event))
  useAppEvents('approval', (event) => updateEvent('approval', event))
  useAppEvents('subagent_status', (event) => updateEvent('subagentStatus', event))
  useAppEvents('subagent_done', (event) => updateEvent('subagentDone', event))
  useAppEvents('slots', (event) => updateEvent('slots', event))

  const ensureSlot = useCallback(
    async (key: string, agent: string): Promise<SlotState> => {
      const slots = await api.get<SlotSummary[]>('/api/chat/slots')
      const existing = slots.find((slot) => slot.key === key)
      if (existing) return { key: existing.key, agent }

      const created = await api.post<SlotSummary>('/api/chat/slots', {
        name: key,
        agent,
        memory_mode: 'temporary',
      })
      return { key: created.key, agent }
    },
    [api],
  )

  const initialize = useCallback(async () => {
    setStatus('loading')
    setMessage('Creating or restoring app-owned Builder and Helper slots…')
    try {
      const [builderSlot, helperSlot] = await Promise.all([
        ensureSlot(BUILDER_SLOT, 'vibe-probe-builder'),
        ensureSlot(HELPER_SLOT, 'vibe-probe-helper'),
      ])
      setBuilder(builderSlot)
      setHelper(helperSlot)
      setStatus('ready')
      setMessage('Two independent slots are ready. Send a message in each pane.')
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Slot initialization failed.')
    }
  }, [ensureSlot])

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    api
      .get('/api/status')
      .then(() => setPermissionProbe('fail'))
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : String(error)
        setPermissionProbe(text.includes('not permitted') ? 'pass' : 'fail')
      })
  }, [api])

  const runAnalystProbe = useCallback(async () => {
    const timestamp = Date.now()
    const episodeId = `episode-s5-${timestamp}`
    const correlationId = `corr-s5-${timestamp}`
    const startedAt = performance.now()
    setAnalystRun({
      phase: 'dispatching',
      detail: 'Creating or restoring the isolated Analyst slot…',
      episodeId,
    })

    try {
      const analyst = await ensureSlot(ANALYST_SLOT, ANALYST_AGENT)
      const before = await api.get<ChatSlot>(`/api/chat/slots/${analyst.key}`)
      const baseline = Array.isArray(before.messages) ? before.messages.length : 0
      const episode = {
        episodeId,
        correlationId,
        activities: [
          {
            type: 'builder_checkpoint',
            summary: 'Added a registration model with typed database fields.',
          },
        ],
      }
      const prompt = [
        'Analyze only this synthetic Episode and return the required JSON object.',
        JSON.stringify(episode),
      ].join('\n')

      await dispatchAnalystEpisode(analyst, prompt)
      const dispatchMs = Math.round(performance.now() - startedAt)
      setAnalystRun({
        phase: 'running',
        detail: `Dispatch returned in ${dispatchMs} ms; polling the isolated slot…`,
        episodeId,
      })

      while (performance.now() - startedAt < ANALYST_TIMEOUT_MS) {
        await delay(ANALYST_POLL_MS)
        const current = await api.get<ChatSlot>(`/api/chat/slots/${analyst.key}`)
        const messages = Array.isArray(current.messages) ? current.messages : []
        const candidates = messages.slice(baseline).filter((item) => item.role === 'assistant')
        const response = candidates.map(messageText).find((item): item is string => item !== null)

        if (response) {
          const proposal = parseProposal(response, episodeId, correlationId)
          if (!proposal) {
            throw new Error('Analyst returned an invalid or mismatched proposal.')
          }
          setAnalystRun({
            phase: 'pass',
            detail: `${proposal.kind} validated; Core mutation was not exposed.`,
            episodeId,
            dispatchMs,
            totalMs: Math.round(performance.now() - startedAt),
          })
          return
        }

        if (current.running === false && messages.length > baseline) {
          throw new Error('Analyst finished without a valid assistant result.')
        }
      }

      throw new Error(`Analyst did not finish within ${ANALYST_TIMEOUT_MS / 1000} seconds.`)
    } catch (error) {
      setAnalystRun({
        phase: 'error',
        detail: error instanceof Error ? error.message : 'Analyst probe failed.',
        episodeId,
      })
    }
  }, [api, ensureSlot])

  const eventSummary = useMemo(
    () =>
      Object.entries(counts)
        .map(([key, count]) => `${key}:${count}`)
        .join(' · '),
    [counts],
  )

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>T01 · macOS capability probe</p>
          <h1 style={styles.title}>Vibe Helper — Builder + Helper</h1>
          <p style={styles.subtitle}>
            {appInfo.name} {appInfo.version} · {message}
          </p>
        </div>
        <div style={styles.actions}>
          <span style={styles.badge}>status:{status}</span>
          <span style={styles.badge}>permission:{permissionProbe}</span>
          <button style={styles.secondaryButton} onClick={() => void initialize()}>
            Restore slots
          </button>
          <button
            style={styles.secondaryButton}
            onClick={() => openChat({ agent: 'vibe-probe-builder' })}
          >
            Compare native chat
          </button>
        </div>
      </header>

      <p style={styles.telemetry} aria-live="polite">
        Redacted event counts only: {eventSummary}
      </p>

      <section style={styles.analystCard} aria-label="Background Analyst probe">
        <div>
          <p style={styles.role}>EVIDENCE ANALYST · HIDDEN SLOT · NO TOOLS</p>
          <p style={styles.analystDetail} aria-live="polite">
            {analystRun.phase}:{analystRun.detail}
          </p>
          {'episodeId' in analystRun ? (
            <code style={styles.code}>{analystRun.episodeId}</code>
          ) : null}
        </div>
        <button
          style={styles.secondaryButton}
          disabled={analystRun.phase === 'dispatching' || analystRun.phase === 'running'}
          onClick={() => void runAnalystProbe()}
        >
          Run synthetic Episode
        </button>
      </section>

      <section style={styles.grid} aria-label="Builder and Helper chat probe">
        <article style={styles.pane}>
          <div style={styles.paneHeader}>
            <div>
              <p style={styles.role}>BUILDER</p>
              <h2 style={styles.paneTitle}>Build stream</h2>
            </div>
            <code style={styles.code}>{builder?.key ?? 'not-ready'}</code>
          </div>
          <div style={styles.chat}>
            {builder ? (
              <ChatEmbed
                slotKey={builder.key}
                agent={builder.agent}
                placeholder="Ask the Builder probe to describe its current task."
                frameless
                startAtBottom
              />
            ) : (
              <p style={styles.empty}>Builder slot is not ready.</p>
            )}
          </div>
        </article>

        <article style={styles.pane}>
          <div style={styles.paneHeader}>
            <div>
              <p style={styles.role}>HELPER · READ ONLY</p>
              <h2 style={styles.paneTitle}>Concept conversation</h2>
            </div>
            <code style={styles.code}>{helper?.key ?? 'not-ready'}</code>
          </div>
          <div style={styles.chat}>
            {helper ? (
              <ChatEmbed
                slotKey={helper.key}
                agent={helper.agent}
                placeholder="Ask the Helper probe a concept question."
                frameless
                startAtBottom
              />
            ) : (
              <p style={styles.empty}>Helper slot is not ready.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: '100vh',
    gap: 12,
    padding: 20,
    background: 'var(--bg, #0b1020)',
    color: 'var(--text, #e8edf8)',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  eyebrow: {
    margin: 0,
    color: 'var(--accent, #8b9cff)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
  },
  title: { margin: '4px 0 0', fontSize: 24, lineHeight: 1.2 },
  subtitle: { margin: '6px 0 0', color: 'var(--muted, #9aa6bf)', fontSize: 13 },
  actions: { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  badge: {
    border: '1px solid var(--border, #28314a)',
    borderRadius: 999,
    padding: '7px 10px',
    color: 'var(--muted, #9aa6bf)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
  },
  secondaryButton: {
    border: '1px solid var(--border, #28314a)',
    borderRadius: 8,
    padding: '7px 10px',
    background: 'var(--card, #151c2f)',
    color: 'var(--text, #e8edf8)',
    cursor: 'pointer',
  },
  telemetry: {
    margin: 0,
    color: 'var(--muted, #9aa6bf)',
    fontFamily: 'ui-monospace, monospace',
    fontSize: 11,
  },
  analystCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '12px 14px',
    border: '1px solid var(--border, #28314a)',
    borderRadius: 12,
    background: 'var(--card, #11182a)',
  },
  analystDetail: {
    margin: '4px 0',
    color: 'var(--muted, #9aa6bf)',
    fontSize: 12,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
    flex: 1,
    minHeight: 0,
  },
  pane: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 560,
    overflow: 'hidden',
    border: '1px solid var(--border, #28314a)',
    borderRadius: 14,
    background: 'var(--card, #11182a)',
  },
  paneHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '14px 16px',
    borderBottom: '1px solid var(--border, #28314a)',
  },
  role: {
    margin: 0,
    color: 'var(--accent, #8b9cff)',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.12em',
  },
  paneTitle: { margin: '3px 0 0', fontSize: 15 },
  code: { color: 'var(--muted, #9aa6bf)', fontSize: 10 },
  chat: { flex: 1, minHeight: 0, overflow: 'hidden' },
  empty: { padding: 24, color: 'var(--muted, #9aa6bf)' },
}
