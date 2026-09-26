// Experimental 1.1.158 diagnostic path. Source pinning is performed by the caller.
// That source emits an uncorrelated debug event instead of a session receipt.
// Admit only a complete group of fresh pulls, all positively notEnabled.
// The pinned service coalesces overlapping pulls into a queued reconciliation.
// Every creating session must finish its own silent pull before the group closes.
// Never enable logging, change Kiro settings, or expose log content here.
const { readdir, readFile } = require('node:fs/promises')
const { homedir } = require('node:os')
const { join } = require('node:path')
const { assertCloudConfigAbsent, ownedCloudSessionDirectory, ownedPath } =
  require('./native-cloud-pull-attestation.cjs')

const SESSION = /^\[KiroAgent\] ACP session\/(new|load|prompt) sessionId=(sess_[0-9a-f-]{36})(?: |$)/
const BEGIN = 'cloudConfig.sync.reconcileStarted'
const DISABLED = 'cloudConfig.manifest.notEnabled'
const SILENT = 'cloudConfig.pull.silent '
const MAX_LOG_BYTES = 16 * 1024 * 1024
const pending = () => new Error('NATIVE_CLOUD_PENDING')
const reject = () => { throw new Error('NATIVE_CLOUD_CYCLE_UNVERIFIED') }

function attestSilentCloudLines(contents, sessionId, notBefore) {
  if (!Number.isSafeInteger(notBefore) || notBefore < 0)
    throw new Error('NATIVE_CLOUD_START_TIME_INVALID')
  if (!/^sess_[0-9a-f-]{36}$/.test(sessionId)) throw new Error('NATIVE_CLOUD_SESSION_INVALID')
  if (!contents.endsWith('\n')) throw pending()
  let syncing = false, queued = false, proved = false, ownCount = 0
  let inheritedPull = false
  let started = 0, disabled = 0, returned = 0
  const creating = new Set()
  let previous = -Infinity
  const resident = new Set()
  for (const line of contents.split(/\r?\n/)) {
    if (!line.includes('ACP session/') && !line.includes('cloudConfig.')) continue
    if (Buffer.byteLength(line) > 65536) reject()
    let entry
    try { entry = JSON.parse(line) } catch { reject() }
    const message = entry?.message
    const time = Date.parse(entry?.timestamp)
    if (typeof message !== 'string' || !Number.isFinite(time) || time < previous) reject()
    previous = time
    const session = message.match(SESSION)
    // Ordinary logging may omit the completed startup pull before this proof.
    // Begin at the caller's fresh pre-session bound. The first reconciliation
    // must be positively observed as idle or busy. Keep old resident IDs only
    // to distinguish a UI load joining an existing session from a fresh pull.
    // Never reuse an old own ID or infer completion from missing debug lines.
    if (time < notBefore) {
      if (session?.[2] === sessionId) reject()
      if (session && session[1] !== 'prompt') resident.add(session[2])
      continue
    }
    if (session) {
      const [, operation, id] = session
      if (operation === 'prompt') {
        if (id === sessionId || creating.size) reject()
        continue
      }
      // Source resolveSession joins loading an already resident/creating ID.
      if (operation === 'load' && (resident.has(id) || creating.has(id))) continue
      if (proved || returned || creating.size >= 8) reject()
      if (resident.has(id) || creating.has(id) || (operation === 'new' && !message.endsWith(' idempotent=false')) ||
          (operation === 'load' && id === sessionId)) reject()
      creating.add(id)
      if (id === sessionId) {
        if (time < notBefore || ++ownCount !== 1) reject()
      }
      continue
    }
    if (message === BEGIN) {
      if (!creating.size || syncing || proved || ++started > creating.size) reject()
      syncing = true
      queued = false
    } else if (message === 'cloudConfig.sync.joinedQueuedFollowUp') {
      // In the pinned source, this marker is emitted only when startReconcile
      // observes a live predecessor and queues the new caller. Admit exactly
      // one pre-bound startup caller, then require BOTH explicit notEnabled
      // reconciliations and BOTH silent returns. No result is inferred here.
      if (!inheritedPull && !proved && started <= 1 && syncing === (started === 1) && !disabled && !returned &&
          ownCount === 1 && creating.size === 1 && creating.has(sessionId) && resident.size) {
        creating.add('PRE_BOUND_STARTUP_CALLER')
        inheritedPull = true
        syncing = true
        started = 1
      }
      if (!syncing || proved || creating.size < 2) reject()
      queued = true
    } else if (message === DISABLED) {
      if (!syncing) reject()
      syncing = false
      disabled += 1
    } else if (message.startsWith(SILENT)) {
      let value
      try { value = JSON.parse(message.slice(SILENT.length)) } catch { reject() }
      if (!disabled || Object.keys(value ?? {}).length !== 1 ||
          value.outcome !== 'notEnabled' || ++returned > creating.size) reject()
      if (returned === creating.size) {
        if (syncing || queued || disabled !== started) reject()
        if (creating.has(sessionId)) proved = true
        for (const id of creating) resident.add(id)
        creating.clear()
        started = disabled = returned = 0
      }
    } else if (message.startsWith('cloudConfig.') && !message.startsWith('cloudConfig.active ')) {
      // Reject cached fallback, changes, failed retraction and unknown events.
      reject()
    }
  }
  if (!proved || ownCount !== 1 || creating.size || syncing || queued) throw pending()
  return true
}

async function attestOwnedSilentCloudPull(sessionId, workspace, options = {}) {
  const { directory, metadata } = await ownedCloudSessionDirectory(sessionId, workspace,
    options.sessionsRoot, options.configRoot)
  const created = Date.parse(metadata.createdAt)
  if (!Number.isSafeInteger(options.notBefore) || !Number.isFinite(created) || created < options.notBefore)
    throw new Error('NATIVE_CLOUD_SESSION_NOT_FRESH')
  // A fresh pre-model session may have no message file or only policy seed events.
  const messagesPath = join(directory, 'messages.jsonl')
  try {
    const stat = await ownedPath(messagesPath, 'file', true)
    if (stat.size > 256 * 1024) throw new Error('NATIVE_CLOUD_STORE_UNVERIFIED')
    const contents = await readFile(messagesPath, 'utf8')
    if (contents && !contents.endsWith('\n')) throw pending()
    for (const line of contents.split(/\r?\n/).filter(Boolean)) {
      let event
      try { event = JSON.parse(line) } catch { throw new Error('NATIVE_CLOUD_MESSAGES_INVALID') }
      if (!['pending_interaction', 'interaction_resolved'].includes(event?.payload?.type))
        throw new Error('NATIVE_CLOUD_MESSAGES_UNEXPECTED')
    }
  } catch (error) {
    if (error.message !== 'NATIVE_CLOUD_PENDING') throw error
    // Pending is acceptable only for ENOENT, never for a partial existing file.
    try { await readFile(messagesPath); throw pending() }
    catch (missing) { if (missing.code !== 'ENOENT') throw missing }
  }
  const logsRoot = options.logsRoot ?? join(homedir(), '.kiro', 'logs')
  await ownedPath(logsRoot, 'directory')
  const names = (await readdir(logsRoot)).filter(name => /^\d{8}T\d{9}$/.test(name))
    .sort().reverse().slice(0, 24)
  let matches = 0
  for (const name of names) {
    const folder = join(logsRoot, name)
    await ownedPath(folder, 'directory')
    const file = join(folder, 'kiro.log')
    let info
    try { info = await ownedPath(file, 'file', true) }
    catch (error) { if (error.message === 'NATIVE_CLOUD_PENDING') continue; throw error }
    if (info.size > MAX_LOG_BYTES) throw new Error('NATIVE_CLOUD_LOG_TOO_LARGE')
    const contents = await readFile(file, 'utf8')
    if (!contents.includes(`[KiroAgent] ACP session/new sessionId=${sessionId} `)) continue
    if (++matches !== 1) throw new Error('NATIVE_CLOUD_LOG_AMBIGUOUS')
    attestSilentCloudLines(contents, sessionId, options.notBefore)
  }
  if (matches !== 1) throw pending()
  await assertCloudConfigAbsent(options.configRoot)
  return true
}

async function waitForOwnedSilentCloudPull(sessionId, workspace, options = {}) {
  const timeout = options.timeoutMs ?? 15000
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000)
    throw new Error('NATIVE_CLOUD_TIMEOUT_INVALID')
  const deadline = Date.now() + timeout
  while (true) {
    try { return await attestOwnedSilentCloudPull(sessionId, workspace, options) }
    catch (error) {
      if (error.message !== 'NATIVE_CLOUD_PENDING') throw error
      if (Date.now() >= deadline) throw new Error('NATIVE_CLOUD_DIAGNOSTIC_PROOF_UNAVAILABLE')
      await new Promise(done => setTimeout(done, 100))
    }
  }
}

module.exports = { attestSilentCloudLines, attestOwnedSilentCloudPull, waitForOwnedSilentCloudPull }
