import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, open, readdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { isPrivateDirectory, privateDirectory } from './private-directory.js'

const execute = promisify(execFile)
export const CORE_NODE_VERSIONS = ['24.18.0', '24.19.0'] as const
export const MANAGED_NODE = Object.freeze({
  version: '24.19.0',
  url: 'https://nodejs.org/dist/v24.19.0/win-x64/node.exe',
  sha256: '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237',
  maxBytes: 150 * 1024 * 1024,
})
export interface CoreRuntimeDescriptor {
  readonly schemaVersion: 1
  readonly source: 'KIRO' | 'EXISTING_NODE' | 'MANAGED_NODE'
  readonly executable: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly nodeVersion: string
  readonly platform: 'win32'
  readonly arch: 'x64'
  readonly napi: number
}
export interface CoreResources {
  readonly root: string
  readonly core: string
  readonly bridge: string
  readonly probe: string
  readonly promptDirectory: string
  readonly migrationsDirectory: string
  readonly guard: string
  readonly manifest: CoreResourceManifest
}
export interface CoreResourceManifest {
  readonly schemaVersion: 1
  readonly target: 'win32-x64'
  readonly nodeVersions: readonly string[]
  readonly promptVersions: Readonly<Record<string, string>>
  readonly files: Readonly<Record<string, { readonly sha256: string; readonly bytes: number }>>
}
function fail(code: string): never {
  throw new Error(code)
}
export const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')
export const sameRuntimePath = (left: string, right: string): boolean =>
  process.platform === 'win32'
    ? resolve(left).toLowerCase() === resolve(right).toLowerCase()
    : resolve(left) === resolve(right)

function within(root: string, path: string): boolean {
  const part = relative(root, path)
  return part !== '' && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part)
}
export async function plainFile(path: string, maxBytes: number): Promise<Buffer> {
  const info = await lstat(path)
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size > maxBytes ||
    !sameRuntimePath(await realpath(path), path)
  )
    fail('PORTABLE_FILE_UNSAFE')
  return readFile(path)
}

/** The immutable installation is the trust root. The manifest detects missing, changed and extra assets. */
export async function loadCoreResources(resourceRoot: string): Promise<CoreResources> {
  if (!isAbsolute(resourceRoot) || !sameRuntimePath(await realpath(resourceRoot), resourceRoot))
    fail('CORE_RESOURCE_ROOT_UNSAFE')
  const root = resolve(resourceRoot)
  const manifest = JSON.parse(
    (await plainFile(join(root, 'manifest.json'), 256 * 1024)).toString(),
  ) as CoreResourceManifest
  if (
    manifest.schemaVersion !== 1 ||
    manifest.target !== 'win32-x64' ||
    JSON.stringify(manifest.nodeVersions) !== JSON.stringify(CORE_NODE_VERSIONS) ||
    !manifest.files ||
    !manifest.promptVersions
  )
    fail('CORE_RESOURCE_MANIFEST_INVALID')
  const expected = Object.keys(manifest.files).sort()
  if (expected.length < 10 || expected.length > 500) fail('CORE_RESOURCE_MANIFEST_INVALID')
  for (const name of expected) {
    const asset = manifest.files[name]
    if (
      !asset ||
      !/^[A-Za-z0-9_@./+-]+$/.test(name) ||
      name.split('/').some((p) => !p || p === '.' || p === '..') ||
      !within(root, resolve(root, name)) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes < 1 ||
      asset.bytes > 32 * 1024 * 1024
    )
      fail('CORE_RESOURCE_MANIFEST_INVALID')
    const content = await plainFile(join(root, name), asset.bytes)
    if (content.length !== asset.bytes || sha256(content) !== asset.sha256)
      fail('CORE_RESOURCE_HASH_MISMATCH')
  }
  const actual: string[] = []
  async function walk(directory: string): Promise<void> {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, item.name)
      if (item.isSymbolicLink() || !sameRuntimePath(await realpath(path), path))
        fail('CORE_RESOURCE_LINK_DENIED')
      if (item.isDirectory()) await walk(path)
      else actual.push(relative(root, path).split(sep).join('/'))
    }
  }
  await walk(root)
  if (
    JSON.stringify(actual.filter((name) => name !== 'manifest.json').sort()) !==
    JSON.stringify(expected)
  )
    fail('CORE_RESOURCE_INVENTORY_MISMATCH')
  const required = [
    'bin/core.mjs',
    'bin/bridge.mjs',
    'bin/probe.cjs',
    'bin/guard.mjs',
    'bin/runtime.cjs',
    'bin/project-tools.mjs',
    'drizzle/meta/_journal.json',
    'node_modules/better-sqlite3/prebuilds/win32-x64.node',
  ]
  if (required.some((name) => !manifest.files[name])) fail('CORE_RESOURCE_REQUIRED_ASSET_MISSING')
  for (const name of ['discovery', 'builder', 'helper', 'evidence-analyst']) {
    const version = manifest.promptVersions[name]
    const file = `agent-prompts/${name}.md`
    if (
      !version ||
      !/^\d+\.\d+\.\d+$/.test(version) ||
      !manifest.files[file] ||
      !(await readFile(join(root, file), 'utf8')).includes(`> Prompt version: \`${version}\``)
    )
      fail('CORE_RESOURCE_PROMPT_INVALID')
  }
  return Object.freeze({
    root,
    manifest,
    core: join(root, 'bin/core.mjs'),
    bridge: join(root, 'bin/bridge.mjs'),
    probe: join(root, 'bin/probe.cjs'),
    guard: join(root, 'bin/guard.mjs'),
    promptDirectory: join(root, 'agent-prompts'),
    migrationsDirectory: join(root, 'drizzle'),
  })
}

export function runtimeEnvironment(
  runtime: Pick<CoreRuntimeDescriptor, 'env'>,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const clean = { ...inherited }
  for (const name of Object.keys(clean)) {
    if (
      /^(NODE_OPTIONS|NODE_PATH|NODE_REPL_EXTERNAL_MODULE|ELECTRON_RUN_AS_NODE|ELECTRON_EXTRA_LAUNCH_ARGS)$/i.test(
        name,
      )
    )
      delete clean[name]
  }
  return { ...clean, ...runtime.env }
}

export function currentCoreRuntime(): CoreRuntimeDescriptor {
  if (
    process.platform !== 'win32' ||
    process.arch !== 'x64' ||
    !CORE_NODE_VERSIONS.some((v) => v === process.versions.node) ||
    Number(process.versions.napi) < 10 ||
    typeof fetch !== 'function' ||
    typeof WebSocket !== 'function'
  )
    fail('CORE_RUNTIME_UNSUPPORTED')
  return Object.freeze({
    schemaVersion: 1,
    source: process.versions.electron ? 'KIRO' : 'EXISTING_NODE',
    executable: process.execPath,
    args: [],
    env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
    nodeVersion: process.versions.node,
    platform: 'win32',
    arch: 'x64',
    napi: Number(process.versions.napi),
  })
}

export async function ownedPrivateDirectory(path: string): Promise<string> {
  if (!isAbsolute(path) || resolve(path) === resolve(path, '..')) fail('PRIVATE_PATH_REQUIRED')
  const existing = await lstat(path).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (existing) {
    if (!(await isPrivateDirectory(path))) fail('PRIVATE_DIRECTORY_UNSAFE')
  } else {
    if (!sameRuntimePath(await realpath(resolve(path, '..')), resolve(path, '..')))
      fail('PRIVATE_PARENT_UNSAFE')
    await privateDirectory(path)
    if (!(await isPrivateDirectory(path))) fail('PRIVATE_DIRECTORY_UNSAFE')
  }
  return resolve(path)
}

interface Candidate {
  readonly executable: string
  readonly source: CoreRuntimeDescriptor['source']
}
export async function probeCoreRuntime(
  candidate: Candidate,
  resources: CoreResources,
  scratchRoot: string,
  signal?: AbortSignal,
): Promise<CoreRuntimeDescriptor> {
  signal?.throwIfAborted()
  if (!isAbsolute(candidate.executable)) fail('RUNTIME_EXECUTABLE_ABSOLUTE_REQUIRED')
  const executable = await realpath(candidate.executable).catch(() =>
    fail('RUNTIME_EXECUTABLE_UNAVAILABLE'),
  )
  const info = await lstat(executable)
  if (!info.isFile()) fail('RUNTIME_EXECUTABLE_UNSAFE')
  const env: Record<string, string> =
    candidate.source === 'KIRO' ? { ELECTRON_RUN_AS_NODE: '1' } : {}
  const directory = await ownedPrivateDirectory(join(scratchRoot, `probe-${randomUUID()}`))
  const result = await execute(executable, [resources.probe, directory], {
    env: runtimeEnvironment({ env }),
    cwd: resources.root,
    windowsHide: true,
    timeout: 20_000,
    maxBuffer: 16_384,
    ...(signal ? { signal } : {}),
  }).catch(() => {
    signal?.throwIfAborted()
    fail('RUNTIME_PROBE_FAILED')
  })
  let value: {
    node: string
    platform: string
    arch: string
    napi: number
    sqlite: string
    electron: string | null
    api: boolean
  }
  try {
    value = JSON.parse(result.stdout) as typeof value
  } catch {
    fail('RUNTIME_PROBE_RESPONSE_INVALID')
  }
  if (
    result.stderr.trim() ||
    value.platform !== 'win32' ||
    value.arch !== 'x64' ||
    !CORE_NODE_VERSIONS.some((v) => v === value.node) ||
    value.napi < 10 ||
    value.sqlite !== 'ok' ||
    !value.api ||
    (candidate.source === 'KIRO' ? !value.electron : value.electron !== null)
  )
    fail('RUNTIME_PROBE_REJECTED')
  return Object.freeze({
    schemaVersion: 1,
    source: candidate.source,
    executable,
    args: [],
    env,
    nodeVersion: value.node,
    platform: 'win32',
    arch: 'x64',
    napi: value.napi,
  })
}

/** Existing cache is rehashed before any process starts. A changed/incomplete cache is quarantined. */
async function cachedNode(cache: string): Promise<string | null> {
  const exists = await lstat(cache).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!exists) return null
  if (!(await isPrivateDirectory(cache))) fail('RUNTIME_CACHE_UNSAFE')
  try {
    const marker = JSON.parse((await plainFile(join(cache, 'complete.json'), 4096)).toString()) as {
      sha256?: string
    }
    const exe = join(cache, 'node.exe')
    if (
      marker.sha256 !== MANAGED_NODE.sha256 ||
      sha256(await plainFile(exe, MANAGED_NODE.maxBytes)) !== MANAGED_NODE.sha256
    )
      fail('RUNTIME_CACHE_CORRUPT')
    return exe
  } catch {
    await rename(cache, `${cache}.invalid-${randomUUID()}`)
    return null
  }
}

/** Explicit recovery after the acquisition owner has exited; never interrupts a live process. */
export async function recoverCoreAcquisition(cacheRoot: string): Promise<void> {
  if (!(await isPrivateDirectory(cacheRoot))) fail('RUNTIME_CACHE_UNSAFE')
  const lock = join(cacheRoot, 'acquisition.lock')
  const content = await plainFile(lock, 4096)
  let owner: { pid?: unknown }
  try {
    owner = JSON.parse(content.toString()) as typeof owner
  } catch {
    fail('RUNTIME_LOCK_INVALID_MANUAL_REVIEW_REQUIRED')
  }
  if (!Number.isSafeInteger(owner.pid) || Number(owner.pid) <= 0)
    fail('RUNTIME_LOCK_INVALID_MANUAL_REVIEW_REQUIRED')
  try {
    process.kill(Number(owner.pid), 0)
    fail('RUNTIME_ACQUISITION_BUSY')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error
  }
  if (!(await plainFile(lock, 4096)).equals(content)) fail('RUNTIME_LOCK_CHANGED')
  await rename(lock, join(cacheRoot, `acquisition.abandoned-${randomUUID()}.json`))
}

export async function acquireCoreNode(
  cacheRoot: string,
  resources: CoreResources,
  options: { signal?: AbortSignal; download?: typeof fetch; offline?: boolean } = {},
): Promise<string> {
  if (process.platform !== 'win32' || process.arch !== 'x64') fail('RUNTIME_TARGET_UNSUPPORTED')
  await ownedPrivateDirectory(cacheRoot)
  const destination = join(cacheRoot, `node-${MANAGED_NODE.version}-win32-x64`)
  const cached = await cachedNode(destination)
  if (cached) return cached
  options.signal?.throwIfAborted()
  if (options.offline) fail('RUNTIME_OFFLINE_UNAVAILABLE')
  // Exclusive short-lived acquisition lock. Crashed locks require explicit recovery; never steal a live lock.
  const lock = join(cacheRoot, 'acquisition.lock')
  const handle = await open(lock, 'wx', 0o600).catch(() => fail('RUNTIME_ACQUISITION_BUSY'))
  const stage = join(cacheRoot, `download-${randomUUID()}`)
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid }))
    const wonRace = await cachedNode(destination)
    if (wonRace) return wonRace
    await ownedPrivateDirectory(stage)
    const timeout = AbortSignal.timeout(120_000)
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout
    let response: Response
    try {
      response = await (options.download ?? fetch)(MANAGED_NODE.url, { redirect: 'error', signal })
    } catch {
      if (options.signal?.aborted) fail('RUNTIME_DOWNLOAD_CANCELLED')
      fail('RUNTIME_DOWNLOAD_UNAVAILABLE')
    }
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get('content-length')) > MANAGED_NODE.maxBytes
    )
      fail('RUNTIME_DOWNLOAD_REJECTED')
    const file = await open(join(stage, 'node.exe.partial'), 'wx', 0o600)
    const hash = createHash('sha256')
    let bytes = 0
    try {
      for await (const chunk of response.body) {
        signal.throwIfAborted()
        bytes += chunk.length
        if (bytes > MANAGED_NODE.maxBytes) fail('RUNTIME_DOWNLOAD_TOO_LARGE')
        hash.update(chunk)
        await file.writeFile(chunk)
      }
      await file.sync()
    } catch (error) {
      if (options.signal?.aborted) fail('RUNTIME_DOWNLOAD_CANCELLED')
      if (error instanceof Error && error.message === 'RUNTIME_DOWNLOAD_TOO_LARGE') throw error
      fail('RUNTIME_DOWNLOAD_INTERRUPTED')
    } finally {
      await file.close()
    }
    signal.throwIfAborted()
    if (bytes === 0 || hash.digest('hex') !== MANAGED_NODE.sha256)
      fail('RUNTIME_DOWNLOAD_HASH_MISMATCH')
    await rename(join(stage, 'node.exe.partial'), join(stage, 'node.exe'))
    await writeFile(
      join(stage, 'LICENSE'),
      await readFile(join(resources.root, 'licenses/node-LICENSE')),
      { flag: 'wx', mode: 0o600 },
    )
    await probeCoreRuntime(
      { executable: join(stage, 'node.exe'), source: 'MANAGED_NODE' },
      resources,
      cacheRoot,
      options.signal,
    )
    await writeFile(
      join(stage, 'complete.json'),
      JSON.stringify({ schemaVersion: 1, ...MANAGED_NODE, bytes }),
      { flag: 'wx', mode: 0o600 },
    )
    await rename(stage, destination)
    return join(destination, 'node.exe')
  } finally {
    await handle.close()
    // Archive only our lock. Interrupted stages remain non-executable candidates without a completion marker.
    await rename(lock, join(cacheRoot, `acquisition.finished-${randomUUID()}.json`))
  }
}

export async function selectCoreRuntime(options: {
  resourceRoot: string
  privateRoot: string
  kiroExecutable?: string
  nodeExecutables?: readonly string[]
  offline?: boolean
  signal?: AbortSignal
  download?: typeof fetch
}): Promise<{
  runtime: CoreRuntimeDescriptor
  resources: CoreResources
  rejected: readonly { source: string; code: string }[]
}> {
  const resources = await loadCoreResources(options.resourceRoot)
  const root = await ownedPrivateDirectory(options.privateRoot)
  const candidates: Candidate[] = []
  if (options.kiroExecutable)
    candidates.push({ source: 'KIRO', executable: options.kiroExecutable })
  const paths =
    options.nodeExecutables ??
    (process.env.PATH ?? process.env.Path ?? '')
      .split(delimiter)
      .filter((p) => isAbsolute(p))
      .map((p) => join(p, 'node.exe'))
  for (const executable of new Set(paths)) candidates.push({ source: 'EXISTING_NODE', executable })
  const rejected: { source: string; code: string }[] = []
  for (const candidate of candidates) {
    try {
      return {
        runtime: await probeCoreRuntime(candidate, resources, root, options.signal),
        resources,
        rejected,
      }
    } catch (error) {
      options.signal?.throwIfAborted()
      const code =
        error instanceof Error && /^RUNTIME_[A-Z_]{1,80}$/.test(error.message)
          ? error.message
          : 'RUNTIME_CANDIDATE_REJECTED'
      rejected.push({ source: candidate.source, code })
    }
  }
  const executable = await acquireCoreNode(join(root, 'runtime-cache'), resources, options)
  return {
    runtime: await probeCoreRuntime(
      { executable, source: 'MANAGED_NODE' },
      resources,
      root,
      options.signal,
    ),
    resources,
    rejected,
  }
}
