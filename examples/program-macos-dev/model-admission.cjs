// Development-only admission control, not a billing hard cap. Native follow-up
// work must still be observed against the actual account dashboard.
const { constants } = require('node:fs')
const { open } = require('node:fs/promises')
const { createHash } = require('node:crypto')

const CODE = 'NATIVE_CREDIT_OBSERVATION_REQUIRED'
const fail = () => Object.assign(new Error(CODE), { code: CODE })
const maxAge = 15 * 60_000

async function readBounded(file, limit, missingAllowed = false) {
  let handle
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > limit) throw fail()
    const buffer = Buffer.alloc(limit + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead > limit) throw fail()
    return buffer.subarray(0, bytesRead).toString('utf8')
  } catch (error) {
    if (missingAllowed && error.code === 'ENOENT') return ''
    throw error
  } finally {
    await handle?.close()
  }
}

async function observation(file) {
  const value = JSON.parse(await readBounded(file, 8192))
  if (!value || Array.isArray(value) || typeof value !== 'object') throw fail()
  const observed = typeof value.observedAt === 'string' ? Date.parse(value.observedAt) : NaN
  const age = Date.now() - observed
  if (value.approved !== true || value.overageEnabled !== false ||
      value.cumulativeLimit !== 900 || value.newCallCutoff !== 880 ||
      !Number.isFinite(value.used) || value.used < 0 || value.used >= 880 ||
      !Number.isFinite(age) || age < 0 || age > maxAge) throw fail()
  return { observed, observedAt: new Date(observed).toISOString(), used: value.used }
}

async function reserve(config, kind) {
  const observed = await observation(config.budgetFile)
  const log = await readBounded(config.admissionsFile, 128 * 1024, true)
  // Preserve earlier admissions made before atomic claim files were introduced.
  const legacy = log.split('\n').filter(Boolean).map(line => {
    const entry = JSON.parse(line)
    if (!entry || typeof entry.observedAt !== 'string' || !Number.isFinite(Date.parse(entry.observedAt))) throw fail()
    return Date.parse(entry.observedAt)
  }).filter(at => at === observed.observed).length
  if (legacy >= 2) throw fail()
  const stamp = createHash('sha256').update(String(observed.observed)).digest('hex')
  const metadata = JSON.stringify({ kind, observedAt: observed.observedAt, used: observed.used, admittedAt: new Date().toISOString() }) + '\n'
  let claimed = false
  for (let slot = legacy; slot < 2; slot++) {
    let claim
    try {
      // O_EXCL is shared across processes/windows. A partial/crashed claim
      // remains consumed; neither reload nor a failed dispatch refunds it.
      claim = await open(`${config.admissionsFile}.${stamp}.${slot}.claim`,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      await claim.writeFile(metadata)
      claimed = true
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    } finally {
      await claim?.close()
    }
    if (claimed) break
  }
  if (!claimed) throw fail()
  const audit = await open(config.admissionsFile,
    constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
  try {
    const stat = await audit.stat()
    if (!stat.isFile() || stat.size + Buffer.byteLength(metadata) > 128 * 1024) throw fail()
    await audit.writeFile(metadata)
  } finally {
    await audit.close()
  }
  // Do not dispatch using a revoked/expired/replaced receipt after a slow I/O.
  const latest = await observation(config.budgetFile)
  if (latest.observed !== observed.observed || latest.used !== observed.used) throw fail()
}

function createBudgetedClient(client, config, isTrusted = () => false) {
  let queue = Promise.resolve()
  const admit = kind => {
    const checkTrust = () => {
      if (!isTrusted()) throw Object.assign(new Error('NATIVE_WORKSPACE_TRUST_REQUIRED'), { code: 'NATIVE_WORKSPACE_TRUST_REQUIRED' })
    }
    const next = queue.then(async () => {
      checkTrust()
      await reserve(config, kind).catch(() => { throw fail() })
      checkTrust()
    })
    queue = next.catch(() => {})
    return next
  }
  return Object.freeze({ ...client,
    startDiscovery: async (...args) => {
      await admit('DISCOVERY')
      return client.startDiscovery(...args)
    },
    startRun: async (...args) => {
      const kind = ['DISCOVERY', 'BUILDER', 'HELPER'].includes(args[0]?.kind) ? args[0].kind : 'UNKNOWN'
      await admit(kind)
      return client.startRun(...args)
    },
    execute: async (...args) => {
      if (args[0]?.kind === 'UI_RETRY_ANALYSIS') await admit('ANALYSIS_RETRY')
      return client.execute(...args)
    },
  })
}

module.exports = { createBudgetedClient }
