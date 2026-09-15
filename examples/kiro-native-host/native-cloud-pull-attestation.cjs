// Kiro 1.0.794 starts fetch_cloud_config asynchronously on session/new.
// A protected model turn may begin only after that owned deterministic action
// has settled without changing cloud config. Read fixed metadata from the
// exact session store; never expose messages, arguments, or action output.
const { createHash } = require('node:crypto')
const { lstat, readFile, realpath } = require('node:fs/promises')
const { homedir } = require('node:os')
const { join, posix, resolve } = require('node:path')

const MAX_SESSION_BYTES = 128 * 1024
const MAX_MESSAGES_BYTES = 256 * 1024
const SESSION_ID = /^sess_[0-9a-f-]{36}$/
const CLOUD_CONFIG_ROOT = join(homedir(), '.kiro', 'cloud-cache', 'user', 'config')

function cloudStoreHash(workspace) {
  if (typeof workspace !== 'string' || !workspace.startsWith('/'))
    throw new Error('NATIVE_CLOUD_WORKSPACE_INVALID')
  // Installed Kiro Nu([cwd]): absolute path, slash normalization, trailing
  // slash removal, SHA-256 hex prefix. This route supplies one cwd only.
  const normalized = posix.normalize(resolve(workspace).replace(/\\/g, '/'))
  return createHash('sha256').update(normalized.length > 1 ?
    normalized.replace(/\/+$/, '') : normalized).digest('hex').slice(0, 16)
}

async function ownedPath(path, kind, allowPending = false) {
  let info
  try { info = await lstat(path) }
  catch (error) {
    if (allowPending && error?.code === 'ENOENT')
      throw new Error('NATIVE_CLOUD_PENDING')
    throw new Error('NATIVE_CLOUD_STORE_UNVERIFIED')
  }
  if (info.isSymbolicLink() ||
      (kind === 'directory' ? !info.isDirectory() : !info.isFile()) ||
      (typeof process.getuid === 'function' && info.uid !== process.getuid()) ||
      await realpath(path) !== path)
    throw new Error('NATIVE_CLOUD_STORE_UNVERIFIED')
  return info
}

async function assertCloudConfigAbsent(root = CLOUD_CONFIG_ROOT) {
  try { await lstat(root) }
  catch (error) {
    if (error?.code === 'ENOENT') return true
    throw new Error('NATIVE_CLOUD_CONFIG_UNVERIFIED')
  }
  throw new Error('NATIVE_CLOUD_CONFIG_PRESENT')
}

function parseCloudMessages(contents, notBefore) {
  if (!Number.isSafeInteger(notBefore) || notBefore < 0)
    throw new Error('NATIVE_CLOUD_START_TIME_INVALID')
  if (!contents.endsWith('\n')) throw new Error('NATIVE_CLOUD_PENDING')
  const calls = new Map()
  const results = new Map()
  let currentCompleted = 0
  for (const line of contents.split('\n')) {
    if (!line) continue
    if (Buffer.byteLength(line, 'utf8') > 64 * 1024)
      throw new Error('NATIVE_CLOUD_STORE_UNVERIFIED')
    let payload
    let timestamp
    try {
      const entry = JSON.parse(line)
      payload = entry?.payload
      timestamp = Date.parse(entry?.timestamp)
    }
    catch { throw new Error('NATIVE_CLOUD_MESSAGES_INVALID') }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        !Number.isFinite(timestamp))
      throw new Error('NATIVE_CLOUD_MESSAGES_INVALID')
    if (payload.type === 'user' || payload.type === 'turn_start' ||
        payload.type === 'assistant')
      throw new Error('NATIVE_CLOUD_MODEL_STARTED')
    if (payload.type === 'tool_call') {
      if (calls.size >= 16 || payload.toolName !== 'fetch_cloud_config' ||
          payload.actionType !== 'fetch_cloud_config' ||
          payload.status !== 'completed' || payload.kind !== 'other' ||
          !payload.args || typeof payload.args !== 'object' ||
          Array.isArray(payload.args) ||
          Object.keys(payload.args).length !== 1 ||
          payload.args.toolName !== 'fetch_cloud_config' ||
          typeof payload.toolCallId !== 'string' ||
          typeof payload.executionId !== 'string' ||
          calls.has(payload.toolCallId))
        throw new Error('NATIVE_CLOUD_ACTION_UNVERIFIED')
      calls.set(payload.toolCallId, { executionId: payload.executionId, timestamp })
    } else if (payload.type === 'tool_result') {
      if (results.size >= 16 || typeof payload.toolCallId !== 'string' ||
          typeof payload.executionId !== 'string' ||
          payload.success !== true || typeof payload.content !== 'string' ||
          Buffer.byteLength(payload.content, 'utf8') > 256)
        throw new Error('NATIVE_CLOUD_RESULT_UNVERIFIED')
      let output
      try { output = JSON.parse(payload.content) }
      catch { throw new Error('NATIVE_CLOUD_RESULT_UNVERIFIED') }
      if (!output || typeof output !== 'object' || Array.isArray(output) ||
          Object.keys(output).length !== 2 ||
          output.kind !== 'notEnabled' || output.retracted !== false ||
          results.has(payload.toolCallId))
        throw new Error('NATIVE_CLOUD_RESULT_UNVERIFIED')
      results.set(payload.toolCallId, { executionId: payload.executionId, timestamp })
    } else if (payload.type === 'pending_interaction' ||
               payload.type === 'interaction_resolved') {
      // These are the single known no-model policy seed events for H.
      continue
    } else {
      throw new Error('NATIVE_CLOUD_MESSAGES_UNEXPECTED')
    }
  }
  if (calls.size === 0 || results.size < calls.size)
    throw new Error('NATIVE_CLOUD_PENDING')
  if (calls.size !== results.size)
    throw new Error('NATIVE_CLOUD_ACTION_MISMATCH')
  for (const [id, call] of calls) {
    const result = results.get(id)
    if (!result || call.executionId !== result.executionId ||
        result.timestamp < call.timestamp)
      throw new Error('NATIVE_CLOUD_ACTION_MISMATCH')
    if (call.timestamp >= notBefore && result.timestamp >= notBefore)
      currentCompleted += 1
  }
  if (currentCompleted === 0) throw new Error('NATIVE_CLOUD_PENDING')
  return true
}

async function attestOwnedCloudPull(sessionId, workspace, notBefore,
  sessionsRoot = join(homedir(), '.kiro', 'sessions'),
  configRoot = CLOUD_CONFIG_ROOT) {
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId))
    throw new Error('NATIVE_CLOUD_SESSION_INVALID')
  const canonical = await realpath(workspace).catch(() => null)
  if (canonical !== workspace) throw new Error('NATIVE_CLOUD_WORKSPACE_INVALID')
  await assertCloudConfigAbsent(configRoot)
  await ownedPath(sessionsRoot, 'directory')
  const bucket = join(sessionsRoot, cloudStoreHash(workspace))
  await ownedPath(bucket, 'directory', true)
  const directory = join(bucket, sessionId)
  await ownedPath(directory, 'directory', true)
  const metadataPath = join(directory, 'session.json')
  const metadataInfo = await ownedPath(metadataPath, 'file', true)
  if (metadataInfo.size > MAX_SESSION_BYTES)
    throw new Error('NATIVE_CLOUD_STORE_UNVERIFIED')
  let metadata
  try { metadata = JSON.parse(await readFile(metadataPath, 'utf8')) }
  catch { throw new Error('NATIVE_CLOUD_PENDING') }
  if (metadata?.id !== sessionId ||
      !Array.isArray(metadata.workspacePaths) ||
      metadata.workspacePaths.length !== 1 ||
      metadata.workspacePaths[0] !== workspace ||
      (metadata.rootPaths !== undefined &&
        (!Array.isArray(metadata.rootPaths) ||
         metadata.rootPaths.length !== 1 || metadata.rootPaths[0] !== workspace)))
    throw new Error('NATIVE_CLOUD_SESSION_SCOPE_MISMATCH')
  const messagesPath = join(directory, 'messages.jsonl')
  const messagesInfo = await ownedPath(messagesPath, 'file', true)
  if (messagesInfo.size > MAX_MESSAGES_BYTES)
    throw new Error('NATIVE_CLOUD_STORE_UNVERIFIED')
  parseCloudMessages(await readFile(messagesPath, 'utf8'), notBefore)
  await assertCloudConfigAbsent(configRoot)
  return true
}

async function waitForOwnedCloudPull(sessionId, workspace, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw new Error('NATIVE_CLOUD_TIMEOUT_INVALID')
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      return await attestOwnedCloudPull(sessionId, workspace, options.notBefore,
        options.sessionsRoot, options.configRoot)
    } catch (error) {
      if (error?.message !== 'NATIVE_CLOUD_PENDING') throw error
      if (Date.now() >= deadline) throw new Error('NATIVE_CLOUD_TIMEOUT')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}

module.exports = { cloudStoreHash, parseCloudMessages, assertCloudConfigAbsent,
  attestOwnedCloudPull, waitForOwnedCloudPull }
