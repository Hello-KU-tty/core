import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import {
  cp,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Client } from '../apps/mcp-server/node_modules/@modelcontextprotocol/client/dist/index.mjs'
import { StdioClientTransport } from '../apps/mcp-server/node_modules/@modelcontextprotocol/client/dist/stdio.mjs'
import { privateDirectory } from '../packages/runtime/dist/private-directory.js'

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('W2_WINDOWS_REQUIRED')
const root = await privateDirectory(await mkdtemp(join(tmpdir(), 'vibe-w2-portable-')))
const resourceRoot = join(root, '설치 패키지')
await cp(resolve('dist/portable-core-win32-x64'), resourceRoot, { recursive: true })
// All runtime/Core/bridge/client modules below are resolved from the copied package.
const require = createRequire(import.meta.url)
const api = require(join(resourceRoot, 'bin/runtime.cjs'))
const sdk = require(join(resourceRoot, 'bin/client.cjs'))
const resources = await api.loadCoreResources(resourceRoot)
const report = {
  schemaVersion: 1,
  target: 'win32-x64',
  modelCalls: 0,
  resources: 'PASS',
  cases: {},
  runtimes: {},
}
const record = (name, data = 'PASS') => {
  report.cases[name] = data
  console.log(JSON.stringify({ check: name, status: 'PASS' }))
}
const toolsRoot = await api.ownedPrivateDirectory(join(root, '도구 준비'))
const host = process.argv[2]
assert.ok(host, 'Kiro executable argument is required for the W2 runtime receipt')
for (const [name, executable, source] of [
  ['kiro', host, 'KIRO'],
  ['existing', process.execPath, 'EXISTING_NODE'],
]) {
  const runtime = await api.probeCoreRuntime({ executable, source }, resources, toolsRoot)
  report.runtimes[name] = {
    source: runtime.source,
    node: runtime.nodeVersion,
    napi: runtime.napi,
    sqlite: 'transaction/reopen PASS',
  }
}
const selected = await api.selectCoreRuntime({
  resourceRoot,
  privateRoot: toolsRoot,
  kiroExecutable: host,
  nodeExecutables: [process.execPath],
  offline: true,
  download: async () => {
    throw new Error('UNEXPECTED_DOWNLOAD')
  },
})
assert.equal(selected.runtime.source, 'KIRO')
record('kiroPreferredWithoutDownload')
const fallback = await api.selectCoreRuntime({
  resourceRoot,
  privateRoot: toolsRoot,
  kiroExecutable: join(root, 'missing.exe'),
  nodeExecutables: [process.execPath],
  offline: true,
})
assert.equal(fallback.runtime.source, 'EXISTING_NODE')
assert.equal(fallback.rejected.length, 1)
record('existingFallback')

const prompt = join(resourceRoot, 'agent-prompts/helper.md')
const original = await readFile(prompt)
await writeFile(prompt, Buffer.concat([original, Buffer.from('tamper')]))
await assert.rejects(api.loadCoreResources(resourceRoot), /HASH_MISMATCH|FILE_UNSAFE/)
await writeFile(prompt, original)
await writeFile(join(resourceRoot, 'unexpected.env'), 'synthetic')
await assert.rejects(api.loadCoreResources(resourceRoot), /INVENTORY_MISMATCH/)
await rm(join(resourceRoot, 'unexpected.env'))
const manifestFile = join(resourceRoot, 'manifest.json')
const manifestContent = await readFile(manifestFile)
const badManifest = JSON.parse(manifestContent)
badManifest.files['../outside'] = { bytes: 1, sha256: '0'.repeat(64) }
await writeFile(manifestFile, JSON.stringify(badManifest))
await assert.rejects(api.loadCoreResources(resourceRoot), /MANIFEST_INVALID/)
await writeFile(manifestFile, manifestContent)
await link(prompt, join(root, 'hardlink.md'))
await assert.rejects(api.loadCoreResources(resourceRoot), /FILE_UNSAFE/)
await rm(join(root, 'hardlink.md'))
await symlink(resourceRoot, join(root, 'junction'), 'junction')
await assert.rejects(api.loadCoreResources(join(root, 'junction')), /ROOT_UNSAFE/)
record('resourceTamperExtraTraversalHardlinkJunction')
await mkdir(join(root, 'inherited-acl'))
await assert.rejects(
  api.ownedPrivateDirectory(join(root, 'inherited-acl')),
  /PRIVATE_DIRECTORY_UNSAFE/,
)
record('unsafeAclRejected')

const cache = join(toolsRoot, 'runtime-cache')
await assert.rejects(
  api.acquireCoreNode(cache, resources, { offline: true }),
  /OFFLINE_UNAVAILABLE/,
)
await assert.rejects(
  api.acquireCoreNode(cache, resources, {
    download: async () => {
      throw new Error('offline')
    },
  }),
  /DOWNLOAD_UNAVAILABLE/,
)
await assert.rejects(
  api.acquireCoreNode(cache, resources, {
    download: async (url, options) => {
      assert.equal(url, api.MANAGED_NODE.url)
      assert.equal(options.redirect, 'error')
      return new Response('corrupt executable')
    },
  }),
  /HASH_MISMATCH/,
)
await assert.rejects(
  api.acquireCoreNode(cache, resources, {
    download: async () =>
      new Response('', { headers: { 'content-length': String(api.MANAGED_NODE.maxBytes + 1) } }),
  }),
  /DOWNLOAD_REJECTED/,
)
const abort = new AbortController()
await assert.rejects(
  api.acquireCoreNode(cache, resources, {
    signal: abort.signal,
    download: async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]))
            abort.abort()
            controller.close()
          },
        }),
      ),
  }),
)
await assert.rejects(
  lstat(join(cache, `node-${api.MANAGED_NODE.version}-win32-x64/complete.json`)),
  { code: 'ENOENT' },
)
record('offlineCorruptionSizeCancellationRetryable')
await writeFile(join(cache, 'acquisition.lock'), JSON.stringify({ pid: process.pid }), {
  flag: 'wx',
})
await assert.rejects(api.acquireCoreNode(cache, resources), /ACQUISITION_BUSY/)
await assert.rejects(api.recoverCoreAcquisition(cache), /ACQUISITION_BUSY/)
await rm(join(cache, 'acquisition.lock'))
const previousOwner = spawn(process.execPath, ['-e', 'process.exit(0)'], {
  windowsHide: true,
  stdio: 'ignore',
})
await once(previousOwner, 'exit')
await writeFile(join(cache, 'acquisition.lock'), JSON.stringify({ pid: previousOwner.pid }), {
  flag: 'wx',
})
await api.recoverCoreAcquisition(cache)
await assert.rejects(lstat(join(cache, 'acquisition.lock')), { code: 'ENOENT' })
record('acquisitionLockAndExitedOwnerRecovery')

// Real official download, checksum, SQLite probe, and cache reuse; no global installation.
const acquired = await api.selectCoreRuntime({
  resourceRoot,
  privateRoot: toolsRoot,
  nodeExecutables: [],
  download: fetch,
})
assert.equal(acquired.runtime.source, 'MANAGED_NODE')
const binary = await readFile(acquired.runtime.executable)
report.runtimes.managed = {
  source: acquired.runtime.source,
  node: acquired.runtime.nodeVersion,
  napi: acquired.runtime.napi,
  downloadedBytes: binary.length,
  sha256: api.sha256(binary),
}
const cached = await api.selectCoreRuntime({
  resourceRoot,
  privateRoot: toolsRoot,
  nodeExecutables: [],
  offline: true,
  download: async () => {
    throw new Error('UNEXPECTED_DOWNLOAD')
  },
})
assert.equal(cached.runtime.source, 'MANAGED_NODE')
record('officialAcquisitionAndOfflineCache')
await writeFile(acquired.runtime.executable, 'corrupted cache')
await assert.rejects(
  api.acquireCoreNode(cache, resources, { offline: true }),
  /OFFLINE_UNAVAILABLE/,
)
assert.ok((await readdir(cache)).some((name) => name.includes('.invalid-')))
const repaired = await api.acquireCoreNode(cache, resources, {
  download: async () => new Response(binary),
})
assert.equal(api.sha256(await readFile(repaired)), api.MANAGED_NODE.sha256)
record('corruptCacheQuarantineAndExplicitRetry')

async function core(runtime, command, data) {
  const startedAt = Date.now()
  const child = spawn(
    runtime.executable,
    [
      ...runtime.args,
      resources.core,
      command,
      '--root',
      data,
      ...(command === 'native' ? ['--port', '0'] : []),
    ],
    {
      cwd: root,
      env: api.runtimeEnvironment(runtime, {
        SystemRoot: process.env.SystemRoot,
        TEMP: root,
        TMP: root,
        PATH: join(process.env.SystemRoot, 'System32'),
        USERPROFILE: process.env.USERPROFILE,
      }),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  )
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (data) => {
    stdout += data
  })
  child.stderr.on('data', (data) => {
    stderr += data
  })
  const ended = once(child, 'exit')
  if (command === 'init') {
    const [code] = await ended
    assert.equal(code, 0, `Packaged init failed: ${stdout.slice(0, 180)}`)
    assert.equal(stderr, '')
    return null
  }
  // Match the installed lifecycle readiness budget; never widen the product gate here.
  const deadline = startedAt + 45_000
  while (!stdout.includes('NATIVE_READY')) {
    if (Date.now() > deadline || child.exitCode !== null) {
      const reason = child.exitCode === null ? 'READINESS_TIMEOUT' : 'PROCESS_EXITED'
      console.log(
        JSON.stringify({
          check: 'packagedCoreStartup',
          runtime: runtime.source,
          command,
          status: 'FAIL',
          reason,
          elapsedMs: Date.now() - startedAt,
          exitCode: child.exitCode,
        }),
      )
      if (child.exitCode === null) child.kill()
      await ended
      throw new Error('PACKAGED_START_FAILED')
    }
    await new Promise((done) => setTimeout(done, 50))
  }
  const timing = { runtime: runtime.source, command, elapsedMs: Date.now() - startedAt }
  report.startupObservations ??= []
  report.startupObservations.push(timing)
  console.log(JSON.stringify({ check: 'packagedCoreStartup', status: 'PASS', ...timing }))
  return {
    child,
    stop: async () => {
      child.send('VIBE_CORE_SHUTDOWN')
      const timer = setTimeout(() => child.kill(), 10_000)
      const [code] = await ended
      clearTimeout(timer)
      assert.equal(code, 0)
      assert.equal(stderr, '')
      assert.ok(stdout.includes('STOPPED'))
    },
  }
}
for (const runtime of [selected.runtime, fallback.runtime, cached.runtime]) {
  const data = join(root, `Core 자료 ${runtime.source}`)
  await core(runtime, 'init', data)
  let running = await core(runtime, 'native', data)
  let projectId
  try {
    const client = await sdk.connectLocalCore(join(data, 'connection.json'))
    const connection = await sdk.readLocalConnection(join(data, 'connection.json'))
    assert.equal((await fetch(`${connection.baseUrl}/api/native/next?workspace=test`)).status, 401)
    assert.equal((await client.listProjects()).projects.length, 0)
    const started = await client.startDiscovery(
      { learningGoal: '합성 TypeScript event model' },
      { enrichAfterPreview: false },
    )
    projectId = started.projectId
    const workspace = await realpath(join(data, 'workspaces'))
    let job
    for (let n = 0; n < 100 && !job; n++) {
      const response = await fetch(
        `${connection.baseUrl}/api/native/next?workspace=${encodeURIComponent(workspace)}`,
        { headers: { Authorization: `Bearer ${connection.token}` } },
      )
      job = (await response.json()).job
      if (!job) await new Promise((done) => setTimeout(done, 25))
    }
    assert.equal(job.role, 'DISCOVERY')
    const config = JSON.parse(
      await readFile(join(workspace, '.kiro/agents', `${job.roleName}.json`), 'utf8'),
    )
    const server = config.mcpServers['vibe-native-core']
    assert.equal(server.command, runtime.executable)
    assert.equal(server.args[0], resources.bridge)
    assert.deepEqual(server.env, runtime.env)
    const bridge = new Client({ name: 'w2-packaged-smoke', version: '1.0.0' })
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: api.runtimeEnvironment(runtime, {
        SystemRoot: process.env.SystemRoot,
        TEMP: root,
        TMP: root,
      }),
      cwd: root,
      stderr: 'pipe',
    })
    transport.stderr?.resume()
    try {
      await bridge.connect(transport)
      assert.deepEqual(
        (await bridge.listTools()).tools.map((tool) => tool.name),
        ['get_discovery_context', 'submit_candidate_previews'],
      )
      const request = {
        schemaVersion: 1,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        kind: 'DISCOVERY_GET_CONTEXT',
        projectId,
        correlationId: job.correlationId,
        discoverySessionId: job.discoverySessionId,
      }
      assert.notEqual(
        (await bridge.callTool({ name: 'get_discovery_context', arguments: request })).isError,
        true,
      )
      const wrong = await bridge.callTool({
        name: 'get_discovery_context',
        arguments: { ...request, projectId: `project_${randomUUID()}` },
      })
      assert.equal(wrong.isError, true)
      await assert.rejects(bridge.callTool({ name: 'request_user_decision', arguments: request }))
      assert.equal((await client.cancelRun(started.run.id)).status, 'CANCELLED')
      assert.deepEqual(JSON.parse(await readFile(job.bindingFile, 'utf8')), { status: 'REVOKED' })
      await assert.rejects(bridge.callTool({ name: 'get_discovery_context', arguments: request }))
    } finally {
      await bridge.close()
    }
  } finally {
    await running.stop()
  }
  running = await core(runtime, 'native', data)
  try {
    const client = await sdk.connectLocalCore(join(data, 'connection.json'))
    const restored = await client.restoreProject(projectId)
    assert.equal(restored.project.id, projectId)
    assert.equal(restored.discoveryContext?.previewRound, null)
    assert.equal((await client.listProjects()).projects.length, 1)
  } finally {
    await running.stop()
  }
  record(`packagedCoreMcpRestart_${runtime.source}`)
}
report.status = 'PASS'
report.packageFiles = Object.keys(resources.manifest.files).length
await writeFile(join(root, 'receipt.json'), JSON.stringify(report, null, 2), { mode: 0o600 })
await writeFile('dist/portable-w2-receipt.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
