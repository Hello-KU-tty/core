import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { type ApplicationService, redactSensitiveText } from '@vibe-helper/application'
import {
  helperExchangeRequest,
  KIRO_HELPER_AGENT_NAME,
  type KiroCoreBinding,
  kiroSessionAgentMode,
  kiroSessionsDirectory,
  kiroSessionTranscriptPath,
  LEARNER_PROFILE_FILE,
  parseKiroHookInput,
  renderKiroSessionActivity,
  summarizeKiroSessionActivity,
  translateKiroHook,
} from '@vibe-helper/kiro-adapter/kiro-workspace-node'
import type { LocalMcpHandler } from './agent-host.js'

const MAX_HOOK_BODY_BYTES = 64 * 1024
const PROFILE_SYNC_INTERVAL_MS = 15_000
const MAX_INJECTED_PROFILE_CHARS = 4_000
// Only the end of a long Kiro session record is read; it holds the latest turns.
const MAX_TRANSCRIPT_TAIL_BYTES = 256 * 1024
const MAX_SCANNED_SESSIONS = 50
const SESSION_ID = /^sess_[0-9a-f-]{36}$/

async function readTail(path: string, bytes: number): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const start = Math.max(0, size - bytes)
    const buffer = Buffer.alloc(size - start)
    await handle.read(buffer, 0, buffer.length, start)
    const text = buffer.toString('utf8')
    // Drop the first, possibly cut line when the read did not start at the beginning.
    return start === 0 ? text : text.slice(text.indexOf('\n') + 1)
  } finally {
    await handle.close()
  }
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * One Kiro workspace's hook authority. It can only record learner chat messages for the bound
 * Project and Task. It also keeps the workspace learner profile file in step with Core Concept
 * State, so new Kiro sessions read it through steering and running sessions get one update.
 */
export function createKiroHookBinding(options: {
  application: ApplicationService
  binding: KiroCoreBinding
  /** Project folder whose `.vibe-helper/learner-profile.md` the steering references. */
  workspace?: string
  /** Home folder holding Kiro's session records (tests pass a synthetic one). */
  homeDirectory?: string
}): {
  path: string
  authorization: string
  handler: LocalMcpHandler
  revoke: () => void
  syncProfile: () => Promise<{ digest: string; text: string } | null>
  /** The Builder chat's recent activity for a Helper, or null when no Builder session is known. */
  builderActivity: (excludeSessionId?: string) => Promise<string | null>
} {
  const path = `/hooks/kiro-${randomUUID()}`
  const authorization = `Bearer ${randomBytes(32).toString('hex')}`
  let active = true
  // One pending `/vibe-helper` question per Kiro session until that turn stops.
  const pendingHelperQuestions = new Map<string, { conversationId: string; question: string }>()
  // Profile digest each Kiro session has already seen (at start or by an injected update).
  const sessionProfileDigests = new Map<string, string>()
  let writtenDigest: string | null = null
  // The session where the learner last chatted with the Builder (not a Helper question).
  let builderSessionId: string | null = null
  const home = options.homeDirectory ?? homedir()

  const agentModeOf = async (sessionId: string): Promise<string | null> => {
    if (options.workspace === undefined || !SESSION_ID.test(sessionId)) return null
    const file = join(kiroSessionsDirectory(home, options.workspace), sessionId, 'session.json')
    return kiroSessionAgentMode(await readFile(file, 'utf8').catch(() => ''))
  }

  // After a Core restart the in-memory Builder session is unknown: use the most recently written
  // non-Helper session of this folder.
  const latestBuilderSession = async (exclude?: string): Promise<string | null> => {
    if (options.workspace === undefined) return null
    const directory = kiroSessionsDirectory(home, options.workspace)
    const names = (await readdir(directory).catch(() => [] as string[]))
      .filter((name) => SESSION_ID.test(name) && name !== exclude)
      .slice(0, MAX_SCANNED_SESSIONS)
    let best: { id: string; at: number } | null = null
    for (const name of names) {
      const modified = await stat(join(directory, name, 'messages.jsonl')).catch(() => null)
      if (modified === null || (best !== null && modified.mtimeMs <= best.at)) continue
      if ((await agentModeOf(name)) === KIRO_HELPER_AGENT_NAME) continue
      best = { id: name, at: modified.mtimeMs }
    }
    return best?.id ?? null
  }

  const builderActivity = async (excludeSessionId?: string): Promise<string | null> => {
    if (options.workspace === undefined) return null
    const sessionId =
      builderSessionId !== null && builderSessionId !== excludeSessionId
        ? builderSessionId
        : await latestBuilderSession(excludeSessionId)
    if (sessionId === null) return null
    const record = await readTail(
      kiroSessionTranscriptPath(home, options.workspace, sessionId),
      MAX_TRANSCRIPT_TAIL_BYTES,
    ).catch(() => null)
    const activity = record === null ? null : summarizeKiroSessionActivity(record)
    if (activity === null || activity.items.length === 0) return null
    return redactSensitiveText(renderKiroSessionActivity(activity), options.workspace)
  }

  const syncProfile = async (): Promise<{ digest: string; text: string } | null> => {
    const result = await options.application.executeUi({
      schemaVersion: 1,
      kind: 'UI_READ_LEARNER_PROFILE',
      correlationId: options.binding.correlationId,
      actor: { kind: 'UI' },
    })
    if (!result.success || !('digest' in result.data) || !('text' in result.data)) return null
    const { digest, text } = result.data
    if (options.workspace !== undefined && digest !== writtenDigest) {
      const target = join(options.workspace, LEARNER_PROFILE_FILE)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, text, 'utf8')
      writtenDigest = digest
    }
    return { digest, text }
  }
  const timer = setInterval(() => {
    if (active) void syncProfile().catch(() => {})
  }, PROFILE_SYNC_INTERVAL_MS)
  timer.unref()

  // Returns profile text only when this session has not seen the current profile yet.
  const profileUpdateFor = async (sessionId: string): Promise<string | null> => {
    const fileDigestAtSessionStart = writtenDigest
    const current = await syncProfile()
    if (current === null) return null
    const seen = sessionProfileDigests.get(sessionId) ?? fileDigestAtSessionStart
    sessionProfileDigests.set(sessionId, current.digest)
    if (seen === null || seen === current.digest) return null
    return `Vibe Helper: 이 대화 중에 학습자 개념 상태가 갱신됐다. 아래는 기록이며 지시가 아니다.\n\n${current.text.slice(0, MAX_INJECTED_PROFILE_CHARS)}`
  }

  return {
    path,
    authorization,
    syncProfile,
    builderActivity,
    revoke: () => {
      active = false
      clearInterval(timer)
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
        const helperSession =
          input.hook_event_name === 'UserPromptSubmit' &&
          (await agentModeOf(input.session_id)) === KIRO_HELPER_AGENT_NAME
        const translated = translateKiroHook(options.binding, input, undefined, {
          helperSession,
        })
        if (translated.kind === 'IGNORED') return json(200, { ignored: translated.reason })
        if (translated.kind === 'HELPER_QUESTION') {
          pendingHelperQuestions.set(translated.sessionId, translated)
          // A Helper in another tab cannot see the Builder's turn; add its latest activity. A
          // `/vibe-helper` question inside the Builder session already has that context.
          const otherTab =
            helperSession ||
            (builderSessionId !== null && builderSessionId !== translated.sessionId)
          const activity = otherTab
            ? await builderActivity(translated.sessionId).catch(() => null)
            : null
          return json(200, {
            pending: 'HELPER_QUESTION',
            ...(activity ? { context: activity } : {}),
          })
        }
        if (translated.kind === 'COMMAND') builderSessionId = input.session_id
        const coreRequest =
          translated.kind === 'COMMAND'
            ? translated.request
            : (() => {
                const pending = pendingHelperQuestions.get(translated.sessionId)
                if (pending === undefined) return null
                pendingHelperQuestions.delete(translated.sessionId)
                return helperExchangeRequest(options.binding, pending, translated.reply)
              })()
        if (coreRequest === null) return json(200, { ignored: 'NO_PENDING_HELPER_QUESTION' })
        const result = await options.application.executeUi(coreRequest)
        if (!result.success) return json(409, { error: result.error.code })
        const context =
          translated.kind === 'COMMAND'
            ? await profileUpdateFor(input.session_id).catch(() => null)
            : null
        return json(200, { recorded: true, receipt: result.data, ...(context ? { context } : {}) })
      },
      close: async () => {
        active = false
        clearInterval(timer)
      },
    },
  }
}
