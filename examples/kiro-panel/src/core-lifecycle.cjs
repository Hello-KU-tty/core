// Host-only lifecycle. No connection credentials or filesystem paths enter status events.
const { spawn } = require('node:child_process')
const { createHash, randomUUID } = require('node:crypto')
const { join } = require('node:path')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const safeCode = error => /^[A-Z][A-Z0-9_]{0,99}$/.test(error?.message ?? '')
  ? error.message : 'CORE_LIFECYCLE_FAILED'
const alive = pid => {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('CORE_OWNER_INVALID')
  try { process.kill(pid, 0); return true }
  catch (error) { if (error.code === 'ESRCH') return false; throw new Error('CORE_OWNER_UNCONFIRMED') }
}

function createCoreLifecycle(options) {
  const { api, connect, selectRuntime, storagePath } = options
  // `managed` is the IDE-internal runner; `managed-kiro` runs off-chat Agents through kiro-cli.
  const managedCommand = options.command ?? 'managed'
  if (!['managed', 'managed-kiro'].includes(managedCommand)) throw new Error('CORE_COMMAND_INVALID')
  const dataRoot = join(storagePath, 'core-data')
  const connectionFile = join(dataRoot, 'connection.json')
  const listeners = new Set()
  let state = Object.freeze({ phase: 'IDLE' })
  let selected, packageHash, runtimeIdentity, owned, attempt, timer, stopped = false
  let lastInstance, recoveries = []
  let leasedInstance, maintenance
  const controller = new AbortController()
  const leaseId = randomUUID()
  async function lease(action, expectedInstance) {
    if (action === 'RENEW' && stopped) throw new Error('CORE_LIFECYCLE_STOPPED')
    const descriptor = await options.readConnection(connectionFile)
    if (action === 'RENEW' && stopped) throw new Error('CORE_LIFECYCLE_STOPPED')
    if (descriptor.backendInstanceId !== expectedInstance) throw new Error('CORE_DESCRIPTOR_STALE')
    const response = await fetch(`${descriptor.baseUrl}/api/host/lease`, {
      method: 'POST', headers: { authorization: `Bearer ${descriptor.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action, id: leaseId, pid: process.pid }), signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('CORE_HOST_LEASE_FAILED')
    if (action === 'RENEW') leasedInstance = expectedInstance
  }
  const publish = value => {
    const next = Object.freeze(value)
    if (JSON.stringify(state) === JSON.stringify(next)) return
    state = next
    for (const listener of listeners) { try { listener(state) } catch {} }
  }
  async function owner() {
    try {
      const value = JSON.parse((await api.plainFile(join(dataRoot, 'backend.lock/owner.json'), 4096)).toString())
      if (!Number.isSafeInteger(value.pid) || value.pid <= 0 ||
          typeof value.instanceId !== 'string' || !/^[0-9a-f-]{36}$/.test(value.instanceId) ||
          typeof value.packageHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.packageHash) ||
          (value.runtimeIdentity !== undefined && (typeof value.runtimeIdentity !== 'string' ||
            !/^[0-9a-f]{64}$/.test(value.runtimeIdentity))))
        throw new Error('CORE_OWNER_INVALID')
      return value
    } catch (error) { if (error.code === 'ENOENT') return null; throw error }
  }
  function launch(command) {
    const extra = command === managedCommand ? options.launchArgs?.() ?? [] : []
    const child = spawn(selected.runtime.executable,
      [...selected.runtime.args, selected.resources.core, command, '--root', dataRoot, '--port', '0', ...extra],
      { cwd: selected.resources.root, env: api.runtimeEnvironment(selected.runtime),
        // Managed Core belongs to all leased hosts, not this extension host's
        // process group. Lease expiry still bounds its lifetime after host exit.
        detached: command === managedCommand, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    const entry = { child, exited: false, failure: null }
    let pending = ''
    child.stdout.on('data', data => {
      pending = (pending + data.toString()).slice(-32768)
      const lines = pending.split('\n'); pending = lines.pop()
      for (const line of lines) {
        try {
          const value = JSON.parse(line)
          if (value.status === 'FAILED') entry.failure = safeCode({ message: value.code })
        } catch {}
      }
    })
    child.stderr.resume()
    entry.done = new Promise(resolve => {
      child.once('error', () => { entry.failure = 'CORE_PROCESS_START_FAILED'; entry.exited = true; resolve() })
      child.once('exit', () => { entry.exited = true; resolve() })
    })
    return entry
  }
  async function shutdown(entry) {
    if (!entry || entry.exited) return
    if (entry.child.connected) entry.child.send('VIBE_CORE_SHUTDOWN', () => {})
    await Promise.race([entry.done, delay(15000)])
    // Only the exact child we created can be terminated. Its backend lock remains
    // recoverable if shutdown did not reach SQLite close.
    if (!entry.exited) { entry.child.kill(); await entry.done }
  }
  async function ensure() {
    if (stopped) throw new Error('CORE_LIFECYCLE_STOPPED')
    if (!selected) {
      publish({ phase: 'PREPARING_RUNTIME' })
      const candidate = await selectRuntime(controller.signal)
      const candidateHash = createHash('sha256').update(JSON.stringify(candidate.resources.manifest)).digest('hex')
      const candidateIdentity = api.coreInstallationIdentity(candidate.resources, candidate.runtime)
      if (typeof candidateIdentity !== 'string' || !/^[0-9a-f]{64}$/.test(candidateIdentity))
        throw new Error('CORE_RUNTIME_IDENTITY_INVALID')
      await api.ownedPrivateDirectory(dataRoot)
      // A rejected preparation must not cache partially validated state that
      // would skip the identity or private-directory guard on explicit retry.
      selected = candidate; packageHash = candidateHash; runtimeIdentity = candidateIdentity
    }
    publish({ phase: 'CONNECTING_CORE', runtimeSource: selected.runtime.source, errorCode: null })
    const deadline = Date.now() + 45000
    let launched = false, recovered = false, waitingForOwnerExit = false
    while (!stopped && Date.now() < deadline) {
      let lock, lockAlive
      try {
        lock = await owner()
        lockAlive = lock && alive(lock.pid) &&
          await api.isLockOwnerAlive(lock.pid, join(dataRoot, 'backend.lock/owner.json'))
        // Another host can finish recovery while the OS inspection is running.
        if (JSON.stringify(await owner()) !== JSON.stringify(lock)) { await delay(100); continue }
      } catch (error) {
        if (error.code === 'ENOENT' || error.message === 'LOCK_OWNER_CHANGED') {
          await delay(100); continue
        }
        throw error
      }
      if (lockAlive) {
        if (lock.packageHash !== packageHash || lock.runtimeIdentity !== runtimeIdentity) {
          // A reload must not renew the previous installation's lease. Its
          // existing hosts decide when it can close; never kill a shared PID.
          waitingForOwnerExit = true
          publish({ phase: 'CONNECTING_CORE', runtimeSource: selected.runtime.source,
            errorCode: 'CORE_UPDATE_WAITING_FOR_OWNER_EXIT' })
        } else try {
          waitingForOwnerExit = false
          const client = await connect(connectionFile)
          const health = await client.health()
          if (health.backendInstanceId !== lock.instanceId) throw new Error('CORE_DESCRIPTOR_STALE')
          await lease('RENEW', lock.instanceId)
          const rotated = Boolean(lastInstance && lastInstance !== lock.instanceId)
          lastInstance = lock.instanceId
          publish({ phase: 'CORE_CONNECTED', runtimeSource: selected.runtime.source,
            errorCode: null,
            ownership: owned?.child.pid === lock.pid ? 'OWNED' : 'SHARED',
            backendInstanceId: lock.instanceId, restoreRequired: rotated })
          return { connectionFile, ...selected, health }
        } catch (error) {
          if (safeCode(error) === 'CORE_UPDATE_WAITING_FOR_OWNER_EXIT') throw error
        }
      } else if (lock && !recovered) {
        waitingForOwnerExit = false
        publish({ phase: 'RECOVERING_CORE' })
        const recovery = launch('recover')
        await Promise.race([recovery.done, delay(45000)])
        if (!recovery.exited) await shutdown(recovery)
        // Another window may have recovered first. Re-read the owner before acting.
        recovered = true
      } else if (!lock && !launched) {
        waitingForOwnerExit = false
        if (lastInstance) {
          recoveries = recoveries.filter(time => Date.now() - time < 60000)
          if (recoveries.length >= 2) throw new Error('CORE_CRASH_RETRY_REQUIRED')
          recoveries.push(Date.now())
        }
        owned = launch(managedCommand)
        launched = true
      }
      if (owned?.exited && owned.failure && owned.failure !== 'BACKEND_LOCKED_USE_RECOVER_AFTER_PROCESS_EXIT')
        throw new Error(owned.failure)
      await delay(200)
    }
    throw new Error(stopped ? 'CORE_LIFECYCLE_STOPPED' : waitingForOwnerExit
      ? 'CORE_UPDATE_WAITING_FOR_OWNER_EXIT' : 'CORE_START_TIMEOUT')
  }
  function start() {
    if (attempt) return attempt
    attempt = ensure().catch(error => {
      publish({ phase: 'FAILED', errorCode: safeCode(error) }); throw error
    }).finally(() => { attempt = null })
    if (!timer) timer = setInterval(() => {
      if (stopped || attempt || maintenance || ['FAILED', 'IDLE'].includes(state.phase)) return
      maintenance = (async () => {
        try {
          const client = await connect(connectionFile)
          const health = await client.health()
          if (stopped) return
          if (health.backendInstanceId === lastInstance) { await lease('RENEW', lastInstance); return }
        } catch {}
        if (!stopped) await start()
      })().catch(() => {}).finally(() => { maintenance = null })
    }, 2000)
    return attempt
  }
  return Object.freeze({
    start,
    retry() { recoveries = []; return start() },
    getStatus: () => state,
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener) },
    async dispose() {
      if (stopped) return
      stopped = true; controller.abort(); clearInterval(timer)
      // Drain this host's bounded periodic request before RELEASE. Otherwise a
      // delayed renewal could re-add the lease after disposal and delay updates.
      await maintenance
      await attempt?.catch(() => {})
      if (leasedInstance) await lease('RELEASE', leasedInstance).catch(() => {})
      leasedInstance = undefined
      // Core outlives host reloads and other live windows. The final lease expiry
      // closes/revokes it; a shared process is never killed by a departing host.
      if (owned && !owned.exited) {
        if (owned.child.connected) owned.child.disconnect()
        owned.child.stdout.destroy(); owned.child.stderr.destroy(); owned.child.unref()
      }
      publish({ phase: 'STOPPED' }); listeners.clear()
    },
  })
}
module.exports = { createCoreLifecycle }
