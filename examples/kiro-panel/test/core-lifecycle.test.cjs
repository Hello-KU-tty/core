const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { EventEmitter } = require('node:events')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')
const { runInNewContext } = require('node:vm')

const code = readFileSync(join(__dirname, '../src/core-lifecycle.cjs'), 'utf8')
const manifest = { schemaVersion: 1, synthetic: 'same contents at different installations' }
const packageHash = createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
const identity = '1'.repeat(64), otherIdentity = '2'.repeat(64)
const instance = '00000000-0000-4000-8000-000000000001'
const replacementInstance = '00000000-0000-4000-8000-000000000002'

function harness(options = {}) {
  let clock = 0, ownerReads = 0, connects = 0, preparations = 0, directoryChecks = 0, descriptorRotated = false
  let holdRenewal, holdConnection
  let lock = { pid: 1234, instanceId: instance, packageHash,
    runtimeIdentity: identity, ...options.owner }
  const leases = [], launches = [], statuses = [], kills = [], intervals = new Set()
  const selected = { resources: { root: '/verified/new/portable', core: '/verified/new/portable/bin/core.mjs', manifest },
    runtime: { executable: '/verified/node', args: [], env: {}, source: 'SYNTHETIC' } }
  const currentOwner = () => {
    if (options.expireAt !== undefined && clock >= options.expireAt && lock?.instanceId === instance) lock = null
    return lock
  }
  const module = { exports: {} }
  const api = {
    coreInstallationIdentity(resources, runtime) {
      assert.equal(resources, selected.resources); assert.equal(runtime, selected.runtime)
      return options.selectedIdentity ?? identity
    },
    ownedPrivateDirectory: async () => {
      directoryChecks++
      if (options.rejectDirectory) throw new Error('PRIVATE_DIRECTORY_UNSAFE')
    }, runtimeEnvironment: () => ({}),
    async plainFile() {
      ownerReads++
      const value = currentOwner()
      if (!value) throw Object.assign(new Error('absent'), { code: 'ENOENT' })
      return Buffer.from(JSON.stringify(value))
    },
    isLockOwnerAlive: async () => true,
  }
  const spawn = (executable, args, spawnOptions) => {
    assert.equal(executable, selected.runtime.executable)
    assert.ok(args.includes(options.command ?? 'managed'))
    assert.equal(spawnOptions.detached, true)
    launches.push({ executable, args })
    lock = { pid: 6789, instanceId: replacementInstance, packageHash, runtimeIdentity: identity }
    const child = new EventEmitter()
    child.pid = lock.pid; child.connected = true
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter()
    child.stdout.destroy = () => {}; child.stderr.destroy = () => {}; child.stderr.resume = () => {}
    child.disconnect = () => { child.connected = false }; child.unref = () => {}
    child.kill = () => { throw new Error('SHARED_PROCESS_MUST_NOT_BE_KILLED') }
    return child
  }
  runInNewContext(code, { module,
    require: name => name === 'node:child_process' ? { spawn } : require(name),
    Date: { now: () => clock }, AbortController, AbortSignal,
    process: { pid: 5678, kill(pid, signal) { kills.push({ pid, signal }); assert.equal(signal, 0); return true } },
    setTimeout(fn, ms) { clock += ms; queueMicrotask(fn); return {} },
    setInterval(fn) { intervals.add(fn); return fn }, clearInterval(fn) { intervals.delete(fn) },
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body)
      leases.push({ ...body, instance: currentOwner()?.instanceId })
      if (body.action === 'RENEW' && holdRenewal) {
        const held = holdRenewal; holdRenewal = undefined
        await held
      }
      return { ok: true }
    },
  })
  const manager = module.exports.createCoreLifecycle({ api, storagePath: '/private/synthetic',
    ...(options.command ? { command: options.command, launchArgs: options.launchArgs } : {}),
    selectRuntime: async () => { preparations++; return selected },
    connect: async () => {
      connects++
      if (holdConnection) {
        const held = holdConnection; holdConnection = undefined
        await held
      }
      return { health: async () => ({ backendInstanceId: currentOwner()?.instanceId }) }
    },
    readConnection: async () => ({ backendInstanceId: descriptorRotated ? replacementInstance : currentOwner()?.instanceId,
      baseUrl: 'http://synthetic.invalid', token: 'synthetic-secret' }),
  })
  manager.subscribe(value => statuses.push(value))
  return { manager, leases, launches, statuses, kills, intervals,
    holdNextRenewal() {
      let release
      holdRenewal = new Promise(resolve => { release = resolve })
      return () => release()
    },
    holdNextConnection() {
      let release
      holdConnection = new Promise(resolve => { release = resolve })
      return () => release()
    },
    rotateDescriptor: () => { descriptorRotated = true },
    counters: () => ({ clock, connects, ownerReads, preparations, directoryChecks }) }
}

test('matching package and installation share one Core and release only their lease', async () => {
  const h = harness()
  try {
    const [a, b] = await Promise.all([h.manager.start(), h.manager.start()])
    assert.equal(a, b)
    assert.equal(h.manager.getStatus().ownership, 'SHARED')
    assert.equal(h.launches.length, 0)
    assert.deepEqual(h.leases.map(value => value.action), ['RENEW'])
  } finally { await h.manager.dispose() }
  assert.deepEqual(h.leases.map(value => value.action), ['RENEW', 'RELEASE'])
  assert.equal(h.intervals.size, 0)
})

for (const owner of [
  { runtimeIdentity: otherIdentity },
  { runtimeIdentity: undefined },
  { packageHash: '3'.repeat(64) },
]) test(`incompatible live owner is neither renewed nor killed ${JSON.stringify(owner)}`, async () => {
  const h = harness({ owner })
  try {
    await assert.rejects(h.manager.start(), /CORE_UPDATE_WAITING_FOR_OWNER_EXIT/)
    assert.equal(h.counters().clock, 45000)
    assert.equal(h.counters().connects, 0)
    assert.equal(h.manager.getStatus().phase, 'FAILED')
    assert.equal(h.launches.length, 0)
    assert.equal(h.leases.length, 0)
    assert.ok(h.kills.every(call => call.signal === 0))
  } finally { await h.manager.dispose() }
  assert.equal(h.leases.length, 0, 'an unleased updater must not reset the old Core idle grace')
})

test('same-content new installation starts after the old owner exits without old lease renewal', async () => {
  const h = harness({ owner: { runtimeIdentity: otherIdentity }, expireAt: 6000 })
  try {
    const ready = await h.manager.start()
    assert.equal(ready.health.backendInstanceId, replacementInstance)
    assert.equal(h.launches.length, 1)
    assert.equal(h.manager.getStatus().ownership, 'OWNED')
    assert.equal(h.manager.getStatus().errorCode, null)
    assert.deepEqual(h.leases.map(value => [value.action, value.instance]), [['RENEW', replacementInstance]])
    assert.ok(h.statuses.some(value => value.errorCode === 'CORE_UPDATE_WAITING_FOR_OWNER_EXIT'))
    assert.doesNotMatch(JSON.stringify(h.statuses), /verified|private|synthetic-secret/)
  } finally { await h.manager.dispose() }
})

test('Kiro-native host launches managed-kiro with its kiro-cli path as a shared Core', async () => {
  const h = harness({ owner: { runtimeIdentity: otherIdentity }, expireAt: 6000,
    command: 'managed-kiro', launchArgs: () => ['--kiro-cli', '/verified/kiro-cli'] })
  try {
    await h.manager.start()
    assert.equal(h.launches.length, 1)
    const { args } = h.launches[0]
    assert.equal(args[1], 'managed-kiro')
    assert.equal(JSON.stringify(args.slice(-2)), JSON.stringify(['--kiro-cli', '/verified/kiro-cli']))
    assert.equal(h.manager.getStatus().ownership, 'OWNED')
  } finally { await h.manager.dispose() }
})

test('an unknown Core command is rejected before any launch', () => {
  assert.throws(() => harness({ command: 'start' }), /CORE_COMMAND_INVALID/)
})

for (const invalid of ['', ['1'.repeat(64)], 123, 'bad']) test(`invalid owner identity fails closed ${JSON.stringify(invalid)}`, async () => {
  const h = harness({ owner: { runtimeIdentity: invalid } })
  try {
    await assert.rejects(h.manager.start(), /CORE_OWNER_INVALID/)
    assert.equal(h.leases.length, 0)
    assert.equal(h.launches.length, 0)
  } finally { await h.manager.dispose() }
})

test('descriptor rotation cannot renew a different instance after owner validation', async () => {
  const h = harness(); h.rotateDescriptor()
  try {
    await assert.rejects(h.manager.start(), /CORE_START_TIMEOUT/)
    assert.equal(h.leases.length, 0)
    assert.equal(h.launches.length, 0)
  } finally { await h.manager.dispose() }
})

test('dispose does not release a lease against a replacement instance', async () => {
  const h = harness()
  await h.manager.start(); h.rotateDescriptor(); await h.manager.dispose()
  assert.deepEqual(h.leases.map(value => value.action), ['RENEW'])
})

test('explicit retry can replace an incompatible owner that exits after the first deadline', async () => {
  const h = harness({ owner: { runtimeIdentity: otherIdentity }, expireAt: 50000 })
  try {
    await assert.rejects(h.manager.start(), /CORE_UPDATE_WAITING_FOR_OWNER_EXIT/)
    assert.equal(h.counters().clock, 45000)
    assert.equal(h.leases.length, 0)
    const ready = await h.manager.retry()
    assert.equal(ready.health.backendInstanceId, replacementInstance)
    assert.equal(h.manager.getStatus().errorCode, null)
    assert.deepEqual(h.leases.map(value => value.instance), [replacementInstance])
    assert.equal(h.launches.length, 1)
  } finally { await h.manager.dispose() }
})

for (const [options, expected] of [
  [{ selectedIdentity: 'invalid' }, 'CORE_RUNTIME_IDENTITY_INVALID'],
  [{ rejectDirectory: true }, 'PRIVATE_DIRECTORY_UNSAFE'],
]) test(`explicit retry cannot skip rejected preparation: ${expected}`, async () => {
  const h = harness(options)
  try {
    await assert.rejects(h.manager.start(), new RegExp(expected))
    await assert.rejects(h.manager.retry(), new RegExp(expected))
    assert.equal(h.counters().preparations, 2)
    assert.equal(h.counters().directoryChecks, options.rejectDirectory ? 2 : 0)
    assert.equal(h.counters().connects, 0)
    assert.equal(h.leases.length, 0)
    assert.equal(h.launches.length, 0)
  } finally { await h.manager.dispose() }
})

test('slow periodic maintenance cannot overlap another renewal', async () => {
  const h = harness()
  await h.manager.start()
  const release = h.holdNextRenewal()
  try {
    const tick = [...h.intervals][0]
    tick()
    await new Promise(setImmediate)
    assert.equal(h.leases.length, 2)
    tick(); tick()
    await new Promise(setImmediate)
    assert.equal(h.leases.length, 2, 'slow maintenance must not overlap another renewal')
  } finally { release(); await h.manager.dispose() }
})

test('dispose drains an in-flight periodic renewal before releasing the final lease', async () => {
  const h = harness()
  await h.manager.start()
  const release = h.holdNextRenewal()
  let disposing
  try {
    const tick = [...h.intervals][0]
    tick()
    await new Promise(setImmediate)
    assert.deepEqual(h.leases.map(value => value.action), ['RENEW', 'RENEW'])
    let disposed = false
    disposing = h.manager.dispose().then(() => { disposed = true })
    await new Promise(setImmediate)
    assert.equal(disposed, false, 'dispose must drain the owned pending renewal')
    assert.deepEqual(h.leases.map(value => value.action), ['RENEW', 'RENEW'])
    release()
    await disposing
    assert.deepEqual(h.leases.map(value => value.action), ['RENEW', 'RENEW', 'RELEASE'])
    assert.equal(h.manager.getStatus().phase, 'STOPPED')
    assert.equal(h.intervals.size, 0)
  } finally { release(); await disposing; await h.manager.dispose() }
})

test('a periodic health read finishing after stop cannot send a new renewal', async () => {
  const h = harness()
  await h.manager.start()
  const release = h.holdNextConnection()
  let disposing
  try {
    const tick = [...h.intervals][0]
    tick()
    await new Promise(setImmediate)
    assert.equal(h.counters().connects, 2)
    disposing = h.manager.dispose()
    await new Promise(setImmediate)
    assert.deepEqual(h.leases.map(value => value.action), ['RENEW'])
    release()
    await disposing
    assert.deepEqual(h.leases.map(value => value.action), ['RENEW', 'RELEASE'])
    assert.equal(h.manager.getStatus().phase, 'STOPPED')
  } finally { release(); await disposing; await h.manager.dispose() }
})
