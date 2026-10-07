// Kiro command hook: forwards the learner's chat prompt to the local Vibe Helper Core.
// It prints nothing to stdout (no context injection) and always exits 0 so Kiro is never blocked.
import { lstat, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import {
  kiroSessionTranscriptPath,
  lastAssistantReply,
} from '../packages/kiro-adapter/dist/kiro-workspace-node.js'

const descriptorPath = process.argv[2]
const warn = (message) => process.stderr.write(`Vibe Helper hook skipped: ${message}\n`)

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
  const descriptor = await loadDescriptor()
  if (descriptor !== null) {
    const response = await fetch(descriptor.url, {
      method: 'POST',
      headers: { authorization: descriptor.authorization, 'content-type': 'application/json' },
      body: await withTurnReply(input),
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) warn(`Core responded ${response.status}`)
  }
} catch (error) {
  warn(error instanceof Error ? error.message : String(error))
}
process.exit(0)
