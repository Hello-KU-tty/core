const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createServer } = require('node:http')
const { test } = require('node:test')

const { createCoreConnectionManager } = require('../src/core-connection.cjs')

const failure = code => Object.assign(new Error(code), { code })
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    server.off('error', reject)
    resolve(server.address())
  })
})
const close = server => new Promise(resolve => server.close(resolve))
const client = (instance, overrides = {}) => ({
  health: async () => ({ backendInstanceId: instance }),
  listProjects: async () => ({ projects: [] }),
  restoreProject: async projectId => ({ project: { id: projectId } }),
  getRun: async id => ({ id }),
  listRuns: async () => [],
  watchRun: async () => ({ status: 'SUCCEEDED' }),
  execute: async request => request,
  startDiscovery: async input => input,
  startRun: async input => input,
  cancelRun: async id => ({ id }),
  ...overrides,
})

test('healthy operations reuse one connection instance', async () => {
  let connections = 0
  const first = client('instance-one')
  const manager = createCoreConnectionManager({ connectionFile: '/private/runtime/connection.json',
    connect: async () => { connections += 1; return first } })
  await manager.client.listProjects()
  await manager.client.restoreProject('project-one')
  await manager.client.listRuns('project-one')
  assert.equal(connections, 1)
  assert.equal(manager.generation, 1)
})

test('a rotated descriptor reconnects once and retries only the failed read', async () => {
  let firstReads = 0
  let secondReads = 0
  const first = client('instance-one', { listProjects: async () => {
    firstReads += 1
    throw failure('LOCAL_AUTH_FAILED')
  } })
  const second = client('instance-two', { listProjects: async () => {
    secondReads += 1
    return { projects: [{ project: { id: 'durable' } }] }
  } })
  const opened = []
  const rotations = []
  const manager = createCoreConnectionManager({ connectionFile: '/private/runtime/connection.json',
    connect: async () => [first, second][opened.push(true) - 1] })
  manager.onDidRotate(event => rotations.push(event))
  const result = await manager.client.listProjects()
  assert.equal(firstReads, 1)
  assert.equal(secondReads, 1)
  assert.equal(opened.length, 2)
  assert.equal(result.projects[0].project.id, 'durable')
  assert.equal(rotations.length, 1)
  assert.equal(rotations[0].backendInstanceId, 'instance-two')
})

test('a stale active mutation fails after refresh and is never replayed', async () => {
  let firstMutations = 0
  let secondMutations = 0
  let secondReads = 0
  const first = client('instance-one', { startRun: async () => {
    firstMutations += 1
    throw failure('BACKEND_RESTARTED_RELOAD_CONNECTION')
  } })
  const second = client('instance-two', {
    startRun: async () => { secondMutations += 1; return { id: 'must-not-run' } },
    listProjects: async () => { secondReads += 1; return { projects: [] } },
  })
  const clients = [first, second]
  const manager = createCoreConnectionManager({ connectionFile: '/private/runtime/connection.json',
    connect: async () => clients.shift() })
  await assert.rejects(manager.client.startRun({ kind: 'BUILDER' }), error =>
    error.code === 'CORE_CONNECTION_ROTATED_ACTION_NOT_REPLAYED')
  assert.equal(firstMutations, 1)
  assert.equal(secondMutations, 0)
  await manager.client.listProjects()
  assert.equal(secondReads, 1, 'the refreshed client remains available for durable reads')
})

test('connection rotation aborts an old SSE without attaching a replacement stream', async () => {
  let firstWatches = 0
  let secondWatches = 0
  let rejectWatch
  const first = client('instance-one', {
    watchRun: async (_id, _onEvent, options) => {
      firstWatches += 1
      return new Promise((_, reject) => {
        rejectWatch = reject
        options.signal.addEventListener('abort', () => reject(failure('CANCELLED')), { once: true })
      })
    },
    listProjects: async () => { throw failure('LOCAL_AUTH_FAILED') },
  })
  const second = client('instance-two', {
    watchRun: async () => { secondWatches += 1 },
    listProjects: async () => ({ projects: [] }),
  })
  const clients = [first, second]
  const manager = createCoreConnectionManager({ connectionFile: '/private/runtime/connection.json',
    connect: async () => clients.shift() })
  const watching = manager.client.watchRun('run-one', () => {})
  while (!rejectWatch) await new Promise(resolve => setImmediate(resolve))
  await manager.client.listProjects()
  await assert.rejects(watching, error =>
    error.code === 'CORE_STREAM_CONNECTION_ROTATED_RESTORE_REQUIRED')
  assert.equal(firstWatches, 1)
  assert.equal(secondWatches, 0)
})

test('a raw stream-reader TypeError is recovered only as a watch disconnection', async () => {
  let replacementWatches = 0
  const clients = [
    client('instance-one', { watchRun: async () => { throw new TypeError('terminated') } }),
    client('instance-two', { watchRun: async () => { replacementWatches += 1 } }),
  ]
  const manager = createCoreConnectionManager({ connectionFile: '/private/runtime/connection.json',
    connect: async () => clients.shift() })
  await assert.rejects(manager.client.watchRun('run-one', () => {}), error =>
    error.code === 'CORE_STREAM_CONNECTION_ROTATED_RESTORE_REQUIRED')
  assert.equal(replacementWatches, 0)
})

test('simultaneous stale reads and mutation share one recovery without replaying the mutation', async () => {
  let entered = 0
  let releaseFailure
  let allEntered
  const failed = new Promise(resolve => { releaseFailure = resolve })
  const waiting = new Promise(resolve => { allEntered = resolve })
  const stale = async () => {
    entered += 1
    if (entered === 3) allEntered()
    await failed
    throw failure('CORE_CONNECTION_UNAVAILABLE')
  }
  let replacementStarts = 0
  let replacementReads = 0
  const first = client('instance-one', {
    listProjects: stale,
    restoreProject: stale,
    startRun: stale,
  })
  const second = client('instance-two', {
    listProjects: async () => { replacementReads += 1; return { projects: [] } },
    restoreProject: async id => { replacementReads += 1; return { project: { id } } },
    startRun: async () => { replacementStarts += 1; return { id: 'duplicate' } },
  })
  const clients = [first, second]
  let connections = 0
  const rotations = []
  const manager = createCoreConnectionManager({ connectionFile: '/private/runtime/connection.json',
    connect: async () => { connections += 1; return clients.shift() } })
  manager.onDidRotate(event => rotations.push(event))
  const reads = [manager.client.listProjects(), manager.client.restoreProject('project-one')]
  const mutation = manager.client.startRun({ kind: 'BUILDER' })
  await waiting
  releaseFailure()

  const [listed, restored] = await Promise.all(reads)
  await assert.rejects(mutation, error =>
    error.code === 'CORE_CONNECTION_ROTATED_ACTION_NOT_REPLAYED')
  assert.deepEqual(listed, { projects: [] })
  assert.equal(restored.project.id, 'project-one')
  assert.equal(connections, 2)
  assert.equal(rotations.length, 1)
  assert.equal(replacementReads, 2)
  assert.equal(replacementStarts, 0)
})

test('the real SDK SSE EOF refreshes once and never opens a replacement watch', async () => {
  const { LocalCoreClient } = await import('../../../packages/frontend-client/dist/index.js')
  const firstInstance = randomUUID()
  const secondInstance = randomUUID()
  let activeInstance = firstInstance
  let streamRequests = 0
  const server = createServer((request, response) => {
    if (request.url === '/health') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ protocolVersion: 1, backendInstanceId: activeInstance }))
      return
    }
    if (request.url?.includes('/events?after=0')) {
      streamRequests += 1
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.flushHeaders()
      activeInstance = secondInstance
      response.end()
      return
    }
    response.writeHead(404).end()
  })
  const address = await listen(server)
  try {
    const baseUrl = `http://127.0.0.1:${address.port}`
    const clients = [
      new LocalCoreClient({ protocolVersion: 1, backendInstanceId: firstInstance,
        baseUrl, token: 'a'.repeat(64) }),
      new LocalCoreClient({ protocolVersion: 1, backendInstanceId: secondInstance,
        baseUrl, token: 'b'.repeat(64) }),
    ]
    const rotations = []
    const manager = createCoreConnectionManager({ connectionFile: '/private/runtime/connection.json',
      connect: async () => clients.shift() })
    manager.onDidRotate(event => rotations.push(event))
    await assert.rejects(
      manager.client.watchRun(`run_${randomUUID()}`, () => {}),
      error => error.code === 'CORE_STREAM_CONNECTION_ROTATED_RESTORE_REQUIRED',
    )
    assert.equal(streamRequests, 1)
    assert.equal(rotations.length, 1)
    assert.equal(rotations[0].backendInstanceId, secondInstance)
  } finally { await close(server) }
})

test('a real transport-lost mutation response is not replayed after recovery', async () => {
  const { LocalCoreClient } = await import('../../../packages/frontend-client/dist/index.js')
  const firstInstance = randomUUID()
  const secondInstance = randomUUID()
  let activeInstance = firstInstance
  let mutationRequests = 0
  const server = createServer((request, response) => {
    if (request.url === '/health') {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ protocolVersion: 1, backendInstanceId: activeInstance }))
      return
    }
    if (request.method === 'POST' && request.url?.endsWith('/cancel')) {
      mutationRequests += 1
      activeInstance = secondInstance
      request.resume()
      request.once('end', () => response.socket.destroy())
      return
    }
    response.writeHead(404).end()
  })
  const address = await listen(server)
  try {
    const baseUrl = `http://127.0.0.1:${address.port}`
    const clients = [
      new LocalCoreClient({ protocolVersion: 1, backendInstanceId: firstInstance,
        baseUrl, token: 'a'.repeat(64) }),
      new LocalCoreClient({ protocolVersion: 1, backendInstanceId: secondInstance,
        baseUrl, token: 'b'.repeat(64) }),
    ]
    const manager = createCoreConnectionManager({ connectionFile: '/private/runtime/connection.json',
      connect: async () => clients.shift() })
    await assert.rejects(
      manager.client.cancelRun(`run_${randomUUID()}`),
      error => error.code === 'CORE_CONNECTION_ROTATED_ACTION_NOT_REPLAYED',
    )
    assert.equal(mutationRequests, 1,
      'the server may have committed before the response disappeared; never send it twice')
  } finally { await close(server) }
})
