// Kiro command hook: forwards the learner's chat prompt to the local Vibe Helper Core.
// It always exits 0 so Kiro is never blocked. A learner prompt that cannot reach Core (starting,
// restarting or gone) is queued next to the descriptor; Core records the queue once connected.
import { randomUUID } from 'node:crypto'
import { appendFile, lstat, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  kiroSessionTranscriptPath,
  lastAssistantReply,
} from '../packages/kiro-adapter/dist/kiro-workspace-node.js'

const descriptorPath = process.argv[2]
const warn = (message) => process.stderr.write(`Vibe Helper hook skipped: ${message}\n`)
// Matches the bound Core's reader (apps/local-backend/src/kiro-hook-binding.ts).
const MAX_QUEUE_BYTES = 1024 * 1024
// Core read the prompt and refused it; sending it again later would not change that.
const FINAL_STATUSES = new Set([400, 409, 413])

async function queuePrompt(outgoing) {
  const file = join(dirname(resolve(descriptorPath)), 'hook-queue.jsonl')
  const info = await lstat(file).catch((error) => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  if (
    info &&
    (!info.isFile() ||
      info.nlink !== 1 ||
      (process.platform !== 'win32' && (info.mode & 0o077) !== 0))
  )
    throw new Error('KIRO_HOOK_QUEUE_UNSAFE')
  if (info && info.size > MAX_QUEUE_BYTES) throw new Error('KIRO_HOOK_QUEUE_FULL')
  await appendFile(file, `${JSON.stringify({ input: outgoing })}\n`, { mode: 0o600 })
}

async function readStdin() {
  let input = ''
  for await (const chunk of process.stdin) input += chunk
  return input
}

async function loadDescriptor() {
  if (!descriptorPath) throw new Error('KIRO_HOOK_DESCRIPTOR_REQUIRED')
  const info = await lstat(descriptorPath)
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    (process.platform !== 'win32' && (info.mode & 0o077) !== 0)
  )
    throw new Error('KIRO_HOOK_DESCRIPTOR_UNSAFE')
  const descriptor = JSON.parse(await readFile(descriptorPath, 'utf8'))
  if (descriptor.status === 'REVOKED') return null
  const url = new URL(descriptor.url)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !/^\/hooks\/kiro-[0-9a-f-]{36}$/.test(url.pathname) ||
    url.search ||
    url.username ||
    url.password ||
    typeof descriptor.authorization !== 'string' ||
    !/^Bearer [0-9a-f]{64}$/.test(descriptor.authorization)
  )
    throw new Error('KIRO_HOOK_DESCRIPTOR_INVALID')
  return { url, authorization: descriptor.authorization }
}

// On Stop, attach the Agent's reply for the finished turn so a /vibe-helper exchange can be kept.
async function withTurnReply(raw) {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    return raw
  }
  if (input?.hook_event_name !== 'Stop' || typeof input.cwd !== 'string') return raw
  const transcript = kiroSessionTranscriptPath(homedir(), input.cwd, String(input.session_id))
  for (let attempt = 0; attempt < 3; attempt++) {
    const reply = lastAssistantReply(await readFile(transcript, 'utf8').catch(() => ''))
    if (reply !== null)
      return JSON.stringify({ ...input, vibe_helper_reply: reply.slice(0, 8_000) })
    await delay(300)
  }
  return raw
}

try {
  const input = await readStdin()
  let parsed = null
  try {
    parsed = JSON.parse(input)
  } catch {}
  // Only learner prompts are kept for later. The delivery ID lets Core record a prompt once even
  // when a timed-out request did reach it and the queued copy arrives too.
  const outgoing =
    parsed?.hook_event_name === 'UserPromptSubmit' &&
    typeof parsed.prompt === 'string' &&
    parsed.prompt.trim() !== ''
      ? { ...parsed, vibe_helper_delivery_id: randomUUID() }
      : null
  let delivered = false
  try {
    const descriptor = await loadDescriptor()
    if (descriptor !== null) {
      const response = await fetch(descriptor.url, {
        method: 'POST',
        headers: { authorization: descriptor.authorization, 'content-type': 'application/json' },
        body: outgoing ? JSON.stringify(outgoing) : await withTurnReply(input),
        signal: AbortSignal.timeout(3_000),
      })
      if (!response.ok) {
        warn(`Core responded ${response.status}`)
        delivered = FINAL_STATUSES.has(response.status)
      } else {
        delivered = true
        // UserPromptSubmit stdout joins the Agent context for this turn (Kiro hooks v1).
        const body = await response.json().catch(() => null)
        if (typeof body?.context === 'string') process.stdout.write(`${body.context}\n`)
      }
    }
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error))
  }
  if (!delivered && outgoing !== null)
    await queuePrompt(outgoing).then(
      () => warn('queued for Core'),
      (error) => warn(error instanceof Error ? error.message : String(error)),
    )
} catch (error) {
  warn(error instanceof Error ? error.message : String(error))
}
process.exit(0)
