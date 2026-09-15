// Version-pinned, metadata-only attestation for the stock IDE Agent's memory
// experiment. Never return or log Agent log lines, session IDs, or user text.
const { readdirSync, lstatSync, realpathSync, readFileSync } = require('node:fs')
const { homedir } = require('node:os')
const { join } = require('node:path')

const SNAPSHOT = '[KiroAgent] Active experiments changed '
const SESSION = '[KiroAgent] ACP session/new sessionId='
const MEMORY_FLAGS = new Set(['memory_internal_enabled', 'memory_external_enabled'])
const MAX_LOG_BYTES = 16 * 1024 * 1024

function safeLog(path) {
  const info = lstatSync(path)
  return info.isFile() && !info.isSymbolicLink() &&
    (typeof process.getuid !== 'function' || info.uid === process.getuid()) &&
    info.size <= MAX_LOG_BYTES && realpathSync(path) === path
}

function parseSnapshot(message) {
  if (!message.startsWith(SNAPSHOT)) return null
  const value = JSON.parse(message.slice(SNAPSHOT.length))
  if (!value || typeof value !== 'object' ||
      typeof value.activeExperiments !== 'string' ||
      value.activeExperiments.endsWith(',...') ||
      value.activeExperiments.length > 1024)
    throw new Error('NATIVE_H_MEMORY_SNAPSHOT_INVALID')
  const entries = value.activeExperiments === '' ? [] : value.activeExperiments.split(',')
  const names = new Set()
  for (const entry of entries) {
    const match = entry.match(/^([A-Za-z0-9_]+)=([A-Za-z0-9._-]+|#[0-9a-f]{8})$/)
    if (!match || names.has(match[1]))
      throw new Error('NATIVE_H_MEMORY_SNAPSHOT_INVALID')
    names.add(match[1])
  }
  return ![...MEMORY_FLAGS].some(flag => names.has(flag))
}

function attestedInLines(lines, sessionId, bounds) {
  let seenSnapshot = false
  let disabledAtSession = false
  let sessionCount = 0
  let barrierSeen = false
  let previousTimestamp = -Infinity
  for (const line of lines) {
    if (!line.includes(SNAPSHOT) && !line.includes(SESSION)) continue
    let value
    try { value = JSON.parse(line) }
    catch { throw new Error('NATIVE_H_MEMORY_LOG_INVALID') }
    if (typeof value?.message !== 'string' ||
        typeof value.timestamp !== 'string' ||
        !Number.isFinite(Date.parse(value.timestamp)))
      throw new Error('NATIVE_H_MEMORY_LOG_INVALID')
    const timestamp = Date.parse(value.timestamp)
    if (timestamp < previousTimestamp)
      throw new Error('NATIVE_H_MEMORY_LOG_OUT_OF_ORDER')
    previousTimestamp = timestamp
    if (value.message.startsWith(SNAPSHOT)) {
      const disabled = parseSnapshot(value.message)
      if (!disabled) throw new Error('NATIVE_H_MEMORY_EXPERIMENT_ENABLED')
      seenSnapshot = true
      if (sessionCount > 0) disabledAtSession = disabledAtSession && disabled
    } else if (value.message.startsWith(`${SESSION}${sessionId} `)) {
      if (bounds && (timestamp < bounds.notBefore || timestamp > bounds.notAfter))
        throw new Error('NATIVE_H_MEMORY_SESSION_TIME_MISMATCH')
      sessionCount += 1
      if (sessionCount !== 1 || !seenSnapshot)
        throw new Error('NATIVE_H_MEMORY_SESSION_LOG_AMBIGUOUS')
      disabledAtSession = true
    } else if (bounds?.barrierSessionId &&
               value.message.startsWith(`${SESSION}${bounds.barrierSessionId} `)) {
      if (sessionCount !== 1 || barrierSeen)
        throw new Error('NATIVE_H_MEMORY_BARRIER_AMBIGUOUS')
      barrierSeen = true
    }
  }
  return sessionCount === 1 && disabledAtSession &&
    (!bounds?.barrierSessionId || barrierSeen)
}

function attestSessionMemoryDisabled(sessionId, root = join(homedir(), '.kiro', 'logs'), bounds) {
  if (typeof sessionId !== 'string' || !/^sess_[0-9a-f-]{36}$/.test(sessionId))
    throw new Error('NATIVE_H_MEMORY_SESSION_INVALID')
  if (bounds?.barrierSessionId &&
      !/^sess_[0-9a-f-]{36}$/.test(bounds.barrierSessionId))
    throw new Error('NATIVE_H_MEMORY_BARRIER_INVALID')
  if (!realpathSync(root) || realpathSync(root) !== root)
    throw new Error('NATIVE_H_MEMORY_LOG_ROOT_INVALID')
  const candidates = readdirSync(root).filter(name => /^\d{8}T\d{9}$/.test(name))
    .sort().reverse().slice(0, 24)
  let matched = 0
  for (const name of candidates) {
    const directory = join(root, name)
    const dirInfo = lstatSync(directory)
    if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink() ||
        (typeof process.getuid === 'function' && dirInfo.uid !== process.getuid()) ||
        realpathSync(directory) !== directory) continue
    const path = join(directory, 'kiro.log')
    try {
      if (!safeLog(path)) continue
      const contents = readFileSync(path, 'utf8')
      if (!contents.includes(`${SESSION}${sessionId} `)) continue
      matched += 1
      if (!attestedInLines(contents.split(/\r?\n/), sessionId, bounds))
        throw new Error('NATIVE_H_MEMORY_LOG_UNCONFIRMED')
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
  }
  if (matched !== 1) throw new Error('NATIVE_H_MEMORY_LOG_UNCONFIRMED')
  return true
}

module.exports = { attestSessionMemoryDisabled, attestedInLines, parseSnapshot }
