const RECOVERABLE_CONNECTION_CODES = new Set([
  'LOCAL_AUTH_FAILED',
  'BACKEND_RESTARTED_RELOAD_CONNECTION',
  'CORE_CONNECTION_UNAVAILABLE',
])

const RECOVERABLE_STREAM_CODES = new Set([
  ...RECOVERABLE_CONNECTION_CODES,
  'STREAM_DISCONNECTED_RESTORE_PROJECT',
])

const READ_ONLY_UI_KINDS = new Set([
  'UI_LIST_PROJECTS',
  'UI_RESTORE_PROJECT_SESSION',
  'UI_READ_ANALYSIS_JOBS',
  'UI_READ_EVIDENCE_TRACE',
])

function codedError(code, cause) {
  const error = Object.assign(new Error(code), { code })
  if (cause !== undefined) error.cause = cause
  return error
}

function errorCode(error) {
  const value = error?.code ?? error?.message
  return typeof value === 'string' ? value : ''
}

function recoverable(error) {
  return RECOVERABLE_CONNECTION_CODES.has(errorCode(error))
}

function recoverableStream(error) {
  // Node's fetch reader can reject with a raw TypeError when the response
  // socket disappears after SSE headers. This branch is deliberately limited
  // to watchRun: no mutation or ordinary read treats arbitrary TypeError as a
  // credential rotation.
  return RECOVERABLE_STREAM_CODES.has(errorCode(error)) || error?.name === 'TypeError'
}

/**
 * Keep one healthy Core client until the private connection descriptor rotates.
 * Only read-only requests may cross a reconnect boundary. A mutation may have
 * reached Core before its response was lost, so it is never replayed here.
 */
function createCoreConnectionManager(options) {
  if (!options || typeof options.connectionFile !== 'string' ||
      !options.connectionFile || typeof options.connect !== 'function')
    throw new TypeError('CORE_CONNECTION_MANAGER_OPTIONS_INVALID')

  let current = null
  let opening = null
  let generation = 0
  let disposed = false
  const rotationListeners = new Set()
  const streamControllers = new Set()

  async function open(force = false, failed = null) {
    if (disposed) throw codedError('CORE_CONNECTION_DISPOSED')
    if (!force && current) return current
    if (force && failed && current && current !== failed) return current
    if (opening) return opening
    opening = (async () => {
      let client
      let health
      try {
        client = await options.connect(options.connectionFile)
        health = await client.health()
      } catch (error) {
        throw codedError('CORE_CONNECTION_RECOVERY_FAILED', error)
      }
      if (!health || typeof health.backendInstanceId !== 'string')
        throw codedError('CORE_CONNECTION_HEALTH_INVALID')
      const previous = current
      if (disposed) throw codedError('CORE_CONNECTION_DISPOSED')
      const next = { client, health, generation: ++generation }
      current = next
      if (previous) {
        for (const controller of streamControllers) controller.abort()
        const event = Object.freeze({
          previousBackendInstanceId: previous.health.backendInstanceId,
          backendInstanceId: next.health.backendInstanceId,
          generation: next.generation,
        })
        for (const listener of rotationListeners) {
          try { listener(event) }
          catch { /* A UI listener cannot make credential recovery fail. */ }
        }
      }
      return next
    })().finally(() => { opening = null })
    return opening
  }

  async function recover(failed) {
    return open(true, failed)
  }

  async function read(operation) {
    const selected = await open()
    try { return await operation(selected.client) }
    catch (error) {
      if (!recoverable(error)) throw error
      const refreshed = await recover(selected)
      try { return await operation(refreshed.client) }
      catch (retryError) {
        if (recoverable(retryError))
          throw codedError('CORE_CONNECTION_RECOVERY_FAILED', retryError)
        throw retryError
      }
    }
  }

  async function mutate(operation) {
    const selected = await open()
    try { return await operation(selected.client) }
    catch (error) {
      if (!recoverable(error)) throw error
      await recover(selected)
      throw codedError('CORE_CONNECTION_ROTATED_ACTION_NOT_REPLAYED', error)
    }
  }

  async function watchRun(id, onEvent, watchOptions = {}) {
    const selected = await open()
    const controller = new AbortController()
    const external = watchOptions.signal
    const abort = () => controller.abort()
    external?.addEventListener('abort', abort, { once: true })
    if (external?.aborted) controller.abort()
    streamControllers.add(controller)
    try {
      return await selected.client.watchRun(id, onEvent, {
        ...watchOptions,
        signal: controller.signal,
      })
    } catch (error) {
      if (!external?.aborted && recoverableStream(error)) {
        await recover(selected)
        throw codedError('CORE_STREAM_CONNECTION_ROTATED_RESTORE_REQUIRED', error)
      }
      if (controller.signal.aborted && !external?.aborted && current !== selected)
        throw codedError('CORE_STREAM_CONNECTION_ROTATED_RESTORE_REQUIRED', error)
      throw error
    } finally {
      streamControllers.delete(controller)
      external?.removeEventListener('abort', abort)
    }
  }

  const client = Object.freeze({
    health: () => read(value => value.health()),
    listProjects: (...args) => read(value => value.listProjects(...args)),
    restoreProject: (...args) => read(value => value.restoreProject(...args)),
    getRun: (...args) => read(value => value.getRun(...args)),
    listRuns: (...args) => read(value => value.listRuns(...args)),
    watchRun,
    execute: (request) => READ_ONLY_UI_KINDS.has(request?.kind)
      ? read(value => value.execute(request))
      : mutate(value => value.execute(request)),
    startDiscovery: (...args) => mutate(value => value.startDiscovery(...args)),
    startRun: (...args) => mutate(value => value.startRun(...args)),
    cancelRun: (...args) => mutate(value => value.cancelRun(...args)),
  })

  return Object.freeze({
    client,
    dispose() {
      disposed = true
      for (const controller of streamControllers) controller.abort()
      streamControllers.clear(); rotationListeners.clear(); current = null
    },
    onDidRotate(listener) {
      if (typeof listener !== 'function') throw new TypeError('CORE_ROTATION_LISTENER_INVALID')
      rotationListeners.add(listener)
      return () => rotationListeners.delete(listener)
    },
    get generation() { return current?.generation ?? 0 },
  })
}

module.exports = {
  READ_ONLY_UI_KINDS,
  RECOVERABLE_CONNECTION_CODES,
  RECOVERABLE_STREAM_CODES,
  createCoreConnectionManager,
}
