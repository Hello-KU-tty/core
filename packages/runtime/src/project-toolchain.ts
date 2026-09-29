import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { gunzipSync } from 'node:zlib'
import {
  acquireCoreNode,
  type CoreResources,
  type CoreRuntimeDescriptor,
  managedMacNodePath,
  ownedPrivateDirectory,
  plainFile,
  probeCoreRuntime,
  sha256,
} from './portable-core.js'
import { isPrivateDirectory } from './private-directory.js'

const execute = promisify(execFile)
export const PROJECT_PNPM = Object.freeze({
  version: '11.13.1',
  url: 'https://registry.npmjs.org/pnpm/-/pnpm-11.13.1.tgz',
  integrity:
    'svx2g7imUlQU59E+G6KMqt3elr9m7FQL+ut+cCuB8+C+TR8pXt9/n+A5Z0Co3ORQnFgt33mJH0VD/qMtN2RfJQ==',
  maxBytes: 12 * 1024 * 1024,
})
export const PROJECT_TOOL_COMMAND = process.platform === 'darwin' ? '' : '.\\.kiro\\vibe-tools.cmd '
export interface ProjectToolchain {
  readonly schemaVersion: 1
  readonly node: CoreRuntimeDescriptor
  readonly pnpm: {
    readonly source: 'EXISTING_PNPM' | 'MANAGED_PNPM'
    readonly executable: string
    readonly kind: 'JS' | 'CMD' | 'EXE'
    readonly version: string
  }
  readonly privateRoot: string
}
function fail(code: string): never {
  throw new Error(code)
}
const errorCode = (error: unknown): string =>
  error instanceof Error && /^[A-Z][A-Z_]{1,80}$/.test(error.message)
    ? error.message
    : 'PROJECT_TOOL_REJECTED'

/** Pinned npm regular files plus bounded GNU long names. No links, PAX, devices or traversal. */
export function unpackPnpm(archive: Buffer): Map<string, Buffer> {
  if (
    archive.length > PROJECT_PNPM.maxBytes ||
    createHash('sha512').update(archive).digest('base64') !== PROJECT_PNPM.integrity
  )
    fail('PNPM_DOWNLOAD_HASH_MISMATCH')
  const tar = gunzipSync(archive, { maxOutputLength: 48 * 1024 * 1024 })
  const files = new Map<string, Buffer>()
  let offset = 0
  let longName: string | null = null
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const string = (start: number, length: number): string =>
      header
        .subarray(start, start + length)
        .toString('utf8')
        .replace(/\0.*$/s, '')
    const rawName = string(0, 100)
    const sizeText = string(124, 12).trim()
    const size = /^[0-7]+$/.test(sizeText) ? Number.parseInt(sizeText, 8) : NaN
    const checksum = Number.parseInt(string(148, 8).trim(), 8)
    const actual = header.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    )
    if (
      checksum !== actual ||
      string(345, 155) ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      offset + 512 + size > tar.length
    )
      fail('PNPM_ARCHIVE_INVALID')
    const type = string(156, 1)
    // npm 11.13.1 contains names longer than a TAR header's 100 bytes.
    // L is filename metadata, not a symbolic link (type 2) or hard link (type 1).
    if (type === 'L') {
      const payload = tar.subarray(offset + 512, offset + 512 + size)
      if (
        longName !== null ||
        rawName !== '././@LongLink' ||
        size < 2 ||
        size > 513 ||
        payload.at(-1) !== 0 ||
        payload.subarray(0, -1).includes(0)
      )
        fail('PNPM_ARCHIVE_INVALID')
      longName = payload.subarray(0, -1).toString('utf8')
      offset += 512 + Math.ceil(size / 512) * 512
      continue
    }
    const fullName = longName ?? rawName
    if (
      !fullName.startsWith('package/') ||
      (longName !== null && ((type !== '0' && type !== '') || fullName.slice(0, 100) !== rawName))
    )
      fail('PNPM_ARCHIVE_INVALID')
    longName = null
    const name = fullName.slice(8).replace(/\/$/, '')
    if (
      !name ||
      !/^[A-Za-z0-9_@./+-]+$/.test(name) ||
      name
        .split('/')
        .some(
          (part) =>
            !part ||
            part === '.' ||
            part === '..' ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        )
    )
      fail('PNPM_ARCHIVE_PATH_INVALID')
    if (type === '5' && size === 0) {
      offset += 512
      continue
    }
    if ((type !== '0' && type !== '') || files.has(name) || files.size >= 1000)
      fail('PNPM_ARCHIVE_TYPE_INVALID')
    files.set(name, tar.subarray(offset + 512, offset + 512 + size))
    offset += 512 + Math.ceil(size / 512) * 512
  }
  if (longName !== null) fail('PNPM_ARCHIVE_INVALID')
  const metadata = JSON.parse(files.get('package.json')?.toString() ?? '{}') as {
    name?: string
    version?: string
  }
  if (
    metadata.name !== 'pnpm' ||
    metadata.version !== PROJECT_PNPM.version ||
    !files.has('bin/pnpm.cjs') ||
    !files.has('dist/pnpm.mjs') ||
    !files.has('LICENSE')
  )
    fail('PNPM_ARCHIVE_CONTENT_INVALID')
  return files
}

async function pnpmCache(directory: string): Promise<string | null> {
  if (!(await lstat(directory).catch(() => null))) return null
  if (!(await isPrivateDirectory(directory))) fail('PNPM_CACHE_UNSAFE')
  try {
    const archive = await plainFile(join(directory, 'package.tgz'), PROJECT_PNPM.maxBytes)
    const files = unpackPnpm(archive)
    const names: string[] = []
    async function walk(path: string): Promise<void> {
      if ((await realpath(path)) !== resolve(path)) fail('PNPM_CACHE_UNSAFE')
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) fail('PNPM_CACHE_UNSAFE')
        const child = join(path, entry.name)
        if (entry.isDirectory()) await walk(child)
        else
          names.push(
            child
              .slice(directory.length + 1)
              .split(sep)
              .join('/'),
          )
      }
    }
    await walk(directory)
    if (JSON.stringify(names.sort()) !== JSON.stringify(['package.tgz', ...files.keys()].sort()))
      fail('PNPM_CACHE_CORRUPT')
    for (const [name, data] of files)
      if (!(await plainFile(join(directory, name), data.length)).equals(data))
        fail('PNPM_CACHE_CORRUPT')
    return join(directory, 'bin/pnpm.cjs')
  } catch {
    await rename(directory, `${directory}.invalid-${randomUUID()}`)
    return null
  }
}
export async function acquireProjectPnpm(
  root: string,
  options: { signal?: AbortSignal; offline?: boolean; download?: typeof fetch } = {},
): Promise<string> {
  await ownedPrivateDirectory(root)
  const destination = join(root, `pnpm-${PROJECT_PNPM.version}`)
  const cached = await pnpmCache(destination)
  if (cached) return cached
  options.signal?.throwIfAborted()
  if (options.offline) fail('PNPM_OFFLINE_UNAVAILABLE')
  const lock = join(root, 'acquisition.lock')
  const handle = await open(lock, 'wx', 0o600).catch(() => fail('RUNTIME_ACQUISITION_BUSY'))
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid }))
    const won = await pnpmCache(destination)
    if (won) return won
    const stage = await ownedPrivateDirectory(join(root, `download-${randomUUID()}`))
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000)
    const response = await (options.download ?? fetch)(PROJECT_PNPM.url, {
      redirect: 'error',
      signal,
    }).catch(() =>
      fail(options.signal?.aborted ? 'PNPM_DOWNLOAD_CANCELLED' : 'PNPM_DOWNLOAD_UNAVAILABLE'),
    )
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get('content-length')) > PROJECT_PNPM.maxBytes
    )
      fail('PNPM_DOWNLOAD_REJECTED')
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      for await (const chunk of response.body) {
        signal.throwIfAborted()
        bytes += chunk.length
        if (bytes > PROJECT_PNPM.maxBytes) fail('PNPM_DOWNLOAD_TOO_LARGE')
        chunks.push(chunk)
      }
    } catch (error) {
      fail(
        options.signal?.aborted
          ? 'PNPM_DOWNLOAD_CANCELLED'
          : errorCode(error) === 'PNPM_DOWNLOAD_TOO_LARGE'
            ? 'PNPM_DOWNLOAD_TOO_LARGE'
            : 'PNPM_DOWNLOAD_INTERRUPTED',
      )
    }
    signal.throwIfAborted()
    const archive = Buffer.concat(chunks)
    const files = unpackPnpm(archive)
    await writeFile(join(stage, 'package.tgz'), archive, { flag: 'wx', mode: 0o600 })
    for (const [name, data] of files) {
      await mkdir(dirname(join(stage, name)), { recursive: true })
      await writeFile(join(stage, name), data, { flag: 'wx', mode: 0o600 })
    }
    await rename(stage, destination)
    return (await pnpmCache(destination)) ?? fail('PNPM_CACHE_CORRUPT')
  } finally {
    await handle.close()
    await rename(lock, join(root, `acquisition.finished-${randomUUID()}.json`))
  }
}

/** Deliberately excludes user npm config, credentials, Electron and Node injection. */
export function projectEnvironment(
  toolchain: ProjectToolchain,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const name of ['SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'PATHEXT']) {
    const value = Object.entries(inherited).find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    )?.[1]
    if (value) env[name] = value
  }
  env.PATH = [
    dirname(toolchain.node.executable),
    join(toolchain.privateRoot, 'bin'),
    ...(toolchain.node.platform === 'darwin'
      ? ['/usr/bin', '/bin', '/usr/sbin', '/sbin']
      : [join(env.SystemRoot ?? 'C:\\Windows', 'System32')]),
  ].join(delimiter)
  env.USERPROFILE = join(toolchain.privateRoot, 'home')
  env.HOME = env.USERPROFILE
  env.APPDATA = join(toolchain.privateRoot, 'home', 'AppData', 'Roaming')
  env.LOCALAPPDATA = join(toolchain.privateRoot, 'home', 'AppData', 'Local')
  env.XDG_CONFIG_HOME = join(toolchain.privateRoot, 'config')
  env.XDG_CACHE_HOME = join(toolchain.privateRoot, 'cache')
  env.XDG_DATA_HOME = join(toolchain.privateRoot, 'data')
  env.XDG_STATE_HOME = join(toolchain.privateRoot, 'state')
  env.PNPM_HOME = join(toolchain.privateRoot, 'bin')
  env.npm_config_userconfig = join(toolchain.privateRoot, 'empty.npmrc')
  env.npm_config_globalconfig = join(toolchain.privateRoot, 'empty.npmrc')
  env.COREPACK_ENABLE_NETWORK = '0'
  env.COREPACK_ENABLE_PROJECT_SPEC = '0'
  env.npm_config_verify_deps_before_run = 'error'
  env.CI = 'true'
  return env
}

export function pnpmInvocation(
  toolchain: ProjectToolchain,
  args: readonly string[],
): { executable: string; args: string[]; windowsVerbatimArguments?: boolean } {
  if (args[0] === 'run' || args[0] === 'test')
    args = ['--config.verify-deps-before-run=error', ...args]
  const exe = toolchain.pnpm.executable
  if (toolchain.pnpm.kind === 'JS')
    return { executable: toolchain.node.executable, args: [exe, ...args] }
  if (toolchain.pnpm.kind === 'EXE') return { executable: exe, args: [...args] }
  if (/["%\r\n!&|<>^]/.test(exe) || args.some((arg) => !/^[A-Za-z0-9._/:=,-]+$/.test(arg)))
    fail('PNPM_COMMAND_INVALID')
  return {
    executable: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/cmd.exe'),
    args: ['/d', '/s', '/c', `""${exe}" ${args.join(' ')}"`],
    windowsVerbatimArguments: true,
  }
}
async function probePnpm(toolchain: ProjectToolchain): Promise<void> {
  const call = pnpmInvocation(toolchain, ['--version'])
  const result = await execute(call.executable, call.args, {
    env: projectEnvironment(toolchain),
    cwd: toolchain.privateRoot,
    windowsHide: true,
    windowsVerbatimArguments: call.windowsVerbatimArguments ?? false,
    timeout: 20_000,
    maxBuffer: 4096,
  })
  if (result.stdout.trim() !== PROJECT_PNPM.version || result.stderr.trim())
    fail('PNPM_VERSION_UNSUPPORTED')
}
export async function selectProjectToolchain(options: {
  resources: CoreResources
  privateRoot: string
  nodeExecutables?: readonly string[]
  pnpmExecutables?: readonly string[]
  signal?: AbortSignal
  offline?: boolean
  download?: typeof fetch
}): Promise<ProjectToolchain> {
  if (
    !(
      (process.platform === 'win32' && process.arch === 'x64') ||
      (process.platform === 'darwin' &&
        process.arch === 'arm64' &&
        options.resources.manifest.target === 'darwin-arm64')
    )
  )
    fail('PROJECT_TOOLCHAIN_UNSUPPORTED')
  const root = await ownedPrivateDirectory(options.privateRoot)
  for (const name of ['home', 'config', 'cache', 'data', 'state', 'bin'])
    await ownedPrivateDirectory(join(root, name))
  await writeFile(join(root, 'empty.npmrc'), '', { flag: 'wx', mode: 0o600 }).catch(
    async (error) => {
      if (error.code !== 'EEXIST') throw error
      if ((await plainFile(join(root, 'empty.npmrc'), 1)).length !== 0)
        fail('PROJECT_CONFIG_UNSAFE')
    },
  )
  const paths = (process.env.PATH ?? process.env.Path ?? '').split(delimiter).filter(isAbsolute)
  const recorded = await recordedProjectToolchain(root, options.resources)
  let node: CoreRuntimeDescriptor | undefined
  if (recorded) {
    try {
      if (
        recorded.node.source === 'MANAGED_NODE' &&
        (await acquireCoreNode(join(root, 'node-cache'), options.resources, {
          ...options,
          offline: true,
        })) !== recorded.node.executable
      )
        fail('PROJECT_RECORDED_NODE_UNAVAILABLE')
      node = await probeCoreRuntime(recorded.node, options.resources, root, options.signal)
      if (JSON.stringify(node) !== JSON.stringify(recorded.node))
        fail('PROJECT_RECORDED_NODE_UNAVAILABLE')
    } catch {
      options.signal?.throwIfAborted()
      fail('PROJECT_RECORDED_NODE_UNAVAILABLE')
    }
  }
  for (const executable of node
    ? []
    : (options.nodeExecutables ??
      paths.map((path) => join(path, process.platform === 'darwin' ? 'node' : 'node.exe')))) {
    try {
      node = await probeCoreRuntime(
        { executable, source: 'EXISTING_NODE' },
        options.resources,
        root,
        options.signal,
      )
      break
    } catch {
      options.signal?.throwIfAborted()
    }
  }
  if (!node)
    node = await probeCoreRuntime(
      {
        executable: await acquireCoreNode(join(root, 'node-cache'), options.resources, options),
        source: 'MANAGED_NODE',
      },
      options.resources,
      root,
      options.signal,
    )
  let result: ProjectToolchain | undefined
  if (recorded?.pnpm.version === PROJECT_PNPM.version) {
    result = { ...recorded, node }
    try {
      if (
        recorded.pnpm.source === 'MANAGED_PNPM' &&
        (await pnpmCache(join(root, 'pnpm-cache', `pnpm-${PROJECT_PNPM.version}`))) !==
          recorded.pnpm.executable
      )
        fail('PROJECT_RECORDED_PNPM_UNAVAILABLE')
      if ((await realpath(recorded.pnpm.executable)) !== recorded.pnpm.executable)
        fail('PROJECT_RECORDED_PNPM_UNAVAILABLE')
      await probePnpm(result)
    } catch {
      options.signal?.throwIfAborted()
      fail('PROJECT_RECORDED_PNPM_UNAVAILABLE')
    }
  }
  for (const path of result
    ? []
    : (options.pnpmExecutables ??
      paths.flatMap((path) =>
        process.platform === 'darwin'
          ? [join(path, 'pnpm')]
          : [join(path, 'pnpm.cmd'), join(path, 'pnpm.exe')],
      ))) {
    try {
      const executable = await realpath(path)
      if (!isAbsolute(path) || !(await lstat(executable)).isFile()) continue
      const kind = /\.[cm]js$/i.test(executable)
        ? 'JS'
        : /\.cmd$/i.test(executable)
          ? 'CMD'
          : /\.exe$/i.test(executable)
            ? 'EXE'
            : null
      if (!kind) continue
      result = {
        schemaVersion: 1,
        node,
        pnpm: { source: 'EXISTING_PNPM', executable, kind, version: PROJECT_PNPM.version },
        privateRoot: root,
      }
      await probePnpm(result)
      break
    } catch {
      result = undefined
      options.signal?.throwIfAborted()
    }
  }
  if (!result) {
    result = {
      schemaVersion: 1,
      node,
      pnpm: {
        source: 'MANAGED_PNPM',
        executable: await acquireProjectPnpm(join(root, 'pnpm-cache'), options),
        kind: 'JS',
        version: PROJECT_PNPM.version,
      },
      privateRoot: root,
    }
    await probePnpm(result)
  }
  await preparePnpmShim(result, options.resources)
  return Object.freeze(result)
}

/** Reuse an intact Core-owned record before consulting a new process's PATH. */
async function recordedProjectToolchain(
  root: string,
  resources: CoreResources,
): Promise<ProjectToolchain | undefined> {
  const directory = join(root, 'projects')
  if (!(await lstat(directory).catch(() => null))) return undefined
  if ((await realpath(directory)) !== directory || !(await isPrivateDirectory(directory)))
    fail('PROJECT_RECORDED_TOOLCHAIN_INVALID')
  const names = await readdir(directory)
  if (names.length > 4096) fail('PROJECT_RECORDED_TOOLCHAIN_INVALID')
  const files = names.filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
  if (!files.length) return undefined
  const sharedShim = await optionalProjectFile(
    join(root, process.platform === 'darwin' ? 'bin/pnpm' : 'bin/pnpm.cmd'),
  )
  const candidates: ProjectToolchain[] = []
  for (const name of files) {
    try {
      const file = join(directory, name)
      const text = (await plainFile(file, 32768)).toString()
      const data = JSON.parse(text) as {
        schemaVersion: number
        workspace: string
        resourceRoot: string
        toolchain: ProjectToolchain
      }
      const tc = data.toolchain
      if (
        data.schemaVersion !== 1 ||
        typeof data.workspace !== 'string' ||
        name !== sha256(Buffer.from(data.workspace)) + '.json' ||
        !isAbsolute(data.workspace) ||
        typeof data.resourceRoot !== 'string' ||
        (data.resourceRoot !== resources.root &&
          !isProductResourceUpgrade(data.resourceRoot, resources.root)) ||
        tc?.schemaVersion !== 1 ||
        tc.privateRoot !== root ||
        !['EXISTING_NODE', 'MANAGED_NODE'].includes(tc.node?.source) ||
        tc.node?.args?.length !== 0 ||
        Object.keys(tc.node?.env ?? {}).length !== 0 ||
        !isAbsolute(tc.node.executable) ||
        !['EXISTING_PNPM', 'MANAGED_PNPM'].includes(tc.pnpm?.source) ||
        !['JS', 'CMD', 'EXE'].includes(tc.pnpm?.kind) ||
        !isAbsolute(tc.pnpm.executable) ||
        !parseExactVersion(tc.pnpm.version) ||
        (tc.pnpm.version !== PROJECT_PNPM.version &&
          !isOlderPinnedPnpm(tc.pnpm, {
            ...tc,
            pnpm: { ...tc.pnpm, version: PROJECT_PNPM.version },
          })) ||
        (tc.pnpm.source === 'MANAGED_PNPM' &&
          (tc.pnpm.kind !== 'JS' ||
            tc.pnpm.executable !==
              join(root, 'pnpm-cache', `pnpm-${tc.pnpm.version}`, 'bin/pnpm.cjs')))
      )
        continue
      if (
        text !==
        JSON.stringify({
          schemaVersion: 1,
          workspace: data.workspace,
          toolchain: tc,
          resourceRoot: data.resourceRoot,
        })
      )
        continue
      const migratedNode = upgradedBundledNode(tc.node, data.resourceRoot, resources, root)
      const current = migratedNode ? { ...tc, node: migratedNode } : tc
      const missingWorkspace = await recordedWorkspaceMissing(data.workspace)
      const launcher = missingWorkspace
        ? null
        : await optionalProjectFile(join(data.workspace, '.kiro/vibe-tools.cmd'))
      if (
        !missingWorkspace &&
        launcher !==
          launcherText(
            current.node.executable,
            join(resources.root, 'bin/project-tools.mjs'),
            file,
            false,
            current.node.platform,
          ) &&
        ![data.resourceRoot, resources.root].some((resourceRoot) =>
          [false, true].some(
            (legacy) =>
              launcher ===
              launcherText(
                tc.node.executable,
                join(resourceRoot, 'bin/project-tools.mjs'),
                file,
                legacy,
                tc.node.platform,
              ),
          ),
        )
      )
        continue
      // A pin upgrade can be interrupted after the shared managed shim changes.
      const upgraded: ProjectToolchain = {
        ...current,
        pnpm: {
          source: 'MANAGED_PNPM',
          kind: 'JS',
          version: PROJECT_PNPM.version,
          executable: join(root, 'pnpm-cache', `pnpm-${PROJECT_PNPM.version}`, 'bin/pnpm.cjs'),
        },
      }
      if (
        sharedShim === pnpmShim(tc) ||
        sharedShim === pnpmShim(tc, true) ||
        sharedShim === pnpmShim(current) ||
        (tc.pnpm.version !== PROJECT_PNPM.version && sharedShim === pnpmShim(upgraded))
      )
        candidates.push(current)
    } catch {
      // Invalid/linked records never authorize executing their recorded tools.
    }
  }
  // Older records may coexist after a pin upgrade. Prefer the current pin and
  // require every eligible record to agree on Node; never pick by directory order.
  const selected =
    candidates.find((tc) => tc.pnpm.version === PROJECT_PNPM.version) ?? candidates[0]
  if (
    !selected ||
    candidates.some((tc) => JSON.stringify(tc.node) !== JSON.stringify(selected.node))
  )
    fail('PROJECT_RECORDED_TOOLCHAIN_INVALID')
  return selected
}

function pnpmShim(toolchain: ProjectToolchain, legacy = false): string {
  const { pnpm, node } = toolchain
  const pnpmPath = pnpm.executable
  if (node.platform === 'darwin') {
    if (pnpm.kind !== 'JS') fail('PROJECT_PNPM_KIND_UNSUPPORTED')
    return `#!/bin/sh\nunset NODE_OPTIONS NODE_PATH ELECTRON_RUN_AS_NODE\nexec ${shellQuote(node.executable)} ${shellQuote(pnpmPath)} "$@"\n`
  }
  if (
    !isAbsolute(pnpmPath) ||
    /["%\r\n!&|<>^]/.test(pnpmPath) ||
    /["%\r\n!&|<>^]/.test(node.executable)
  )
    fail('PROJECT_LAUNCHER_PATH_UNSAFE')
  const command = `${pnpm.kind === 'JS' ? `"${node.executable}" "${pnpmPath}"` : pnpm.kind === 'CMD' ? `call "${pnpmPath}"` : `"${pnpmPath}"`} %*`
  return legacy ? `@echo off\r\n${command}\r\nexit /b %errorlevel%\r\n` : utf8Batch([command])
}

/** Only Core-owned shim bytes; never modify or execute the previous external pnpm. */
export async function preparePnpmShim(
  result: ProjectToolchain,
  resources: CoreResources,
): Promise<void> {
  const root = result.privateRoot
  await ownedPrivateDirectory(join(root, 'bin'))
  const shim = pnpmShim(result)
  const legacyShim = pnpmShim(result, true)
  const shimPath = join(root, result.node.platform === 'darwin' ? 'bin/pnpm' : 'bin/pnpm.cmd')
  try {
    await writeFile(shimPath, shim, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
    const previous = (await plainFile(shimPath, 32768)).toString()
    if (
      previous === legacyShim ||
      (previous !== shim &&
        ((await olderPinnedPnpmShims(root, result.node.executable, result.pnpm.version)).includes(
          previous,
        ) ||
          (await hasRecordedPnpmShim(previous, result, resources))))
    )
      await replaceProjectFile(shimPath, shim)
    else if (previous !== shim) fail('PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED')
  }
  if (result.node.platform === 'darwin') await chmod(shimPath, 0o700)
}

async function hasRecordedPnpmShim(
  shim: string,
  toolchain: ProjectToolchain,
  resources: CoreResources,
): Promise<boolean> {
  const directory = join(toolchain.privateRoot, 'projects')
  if (!(await isPrivateDirectory(directory))) return false
  const names = await readdir(directory)
  if (names.length > 4096) return false
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
    try {
      const file = join(directory, name)
      const text = (await plainFile(file, 32768)).toString()
      const old = JSON.parse(text) as {
        workspace: string
        resourceRoot: string
        toolchain: ProjectToolchain
      }
      const migratedNode = upgradedBundledNode(
        old.toolchain?.node,
        old.resourceRoot,
        resources,
        toolchain.privateRoot,
      )
      const expectedOld = {
        ...toolchain,
        ...(migratedNode && JSON.stringify(migratedNode) === JSON.stringify(toolchain.node)
          ? { node: old.toolchain.node }
          : {}),
        ...(isOlderPinnedPnpm(old.toolchain?.pnpm, toolchain) ? { pnpm: old.toolchain.pnpm } : {}),
      }
      if (
        typeof old.workspace !== 'string' ||
        !isAbsolute(old.workspace) ||
        name !== sha256(Buffer.from(old.workspace)) + '.json' ||
        typeof old.resourceRoot !== 'string' ||
        !isProductResourceUpgrade(old.resourceRoot, resources.root) ||
        text !==
          JSON.stringify({
            schemaVersion: 1,
            workspace: old.workspace,
            toolchain: expectedOld,
            resourceRoot: old.resourceRoot,
          }) ||
        (shim !== pnpmShim(old.toolchain) && shim !== pnpmShim(old.toolchain, true))
      )
        continue
      if (await recordedWorkspaceMissing(old.workspace)) return true
      const launcher = await optionalProjectFile(join(old.workspace, '.kiro/vibe-tools.cmd'))
      if (
        [false, true].some(
          (legacy) =>
            launcher ===
            launcherText(
              old.toolchain.node.executable,
              join(old.resourceRoot, 'bin/project-tools.mjs'),
              file,
              legacy,
              toolchain.node.platform,
            ),
        ) ||
        launcher ===
          launcherText(
            toolchain.node.executable,
            join(resources.root, 'bin/project-tools.mjs'),
            file,
            false,
            toolchain.node.platform,
          )
      )
        return true
    } catch {
      // Missing, edited, linked or malformed records never authorize a shim replacement.
    }
  }
  return false
}

/**
 * Exact shared-shim texts that an older product pin would have written: the
 * same Node running a strictly older Core-managed pnpm from this private cache
 * (current and legacy batch forms). Only these may be replaced after a pin
 * change; any other shim content stays a toolchain change.
 */
export async function olderPinnedPnpmShims(
  root: string,
  nodeExecutable: string,
  currentVersion: string,
): Promise<string[]> {
  const current = parseExactVersion(currentVersion)
  if (!current) return []
  const cache = join(root, 'pnpm-cache')
  const names = await readdir(cache).catch(() => [] as string[])
  const shims: string[] = []
  for (const name of names) {
    const version = parseExactVersion(name.startsWith('pnpm-') ? name.slice(5) : '')
    if (!version || !isOlderVersion(version, current)) continue
    const command = `"${nodeExecutable}" "${join(cache, name, 'bin/pnpm.cjs')}" %*`
    shims.push(utf8Batch([command]), `@echo off\r\n${command}\r\nexit /b %errorlevel%\r\n`)
  }
  return shims
}

function parseExactVersion(value: unknown): number[] | undefined {
  if (typeof value !== 'string') return undefined
  const version = value
    .match(/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/)
    ?.slice(1)
    .map(Number)
  return version?.every(Number.isSafeInteger) ? version : undefined
}

function isOlderVersion(before: readonly number[], after: readonly number[]): boolean {
  for (let i = 0; i < 3; i++) {
    if (before[i] !== after[i]) return (before[i] ?? 0) < (after[i] ?? 0)
  }
  return false
}

/** Same finite vocabulary as native Builder, before its existing permission guard. */
export function projectCommandArgs(command: string): string[] | null {
  if (command.includes('..') || /[~;&|`$<>\n\r"'\\%]/.test(command)) return null
  if (
    ![
      /^pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile$/,
      /^pnpm install --frozen-lockfile$/,
      /^pnpm rebuild esbuild$/,
      /^pnpm test(?: [A-Za-z0-9._/:=,-]+)*$/,
      /^pnpm run [a-zA-Z0-9:_-]+(?: -- [A-Za-z0-9._/:=,-]+)*$/,
      /^node --test(?: [A-Za-z0-9._/:=-]+)*$/,
    ].some((pattern) => pattern.test(command))
  )
    return null
  return command.split(' ')
}

function utf8Batch(commands: readonly string[]): string {
  return [
    '@echo off',
    'setlocal',
    'set "_VIBE_CODEPAGE="',
    'for /f "tokens=2 delims=:" %%c in (\'"%SystemRoot%\\System32\\chcp.com"\') do set "_VIBE_CODEPAGE=%%c"',
    'if not defined _VIBE_CODEPAGE exit /b 1',
    '"%SystemRoot%\\System32\\chcp.com" 65001 >nul',
    'if errorlevel 1 exit /b 1',
    ...commands,
    'set "_VIBE_EXIT=%errorlevel%"',
    '"%SystemRoot%\\System32\\chcp.com" %_VIBE_CODEPAGE% >nul',
    'if errorlevel 1 exit /b 1',
    'exit /b %_VIBE_EXIT%',
    '',
  ].join('\r\n')
}

function shellQuote(value: string): string {
  if (!isAbsolute(value) || /[\r\n\0]/.test(value)) fail('PROJECT_LAUNCHER_PATH_UNSAFE')
  return `'${value.replaceAll("'", "'\\''")}'`
}

function launcherText(
  node: string,
  runner: string,
  descriptor: string,
  legacy = false,
  platform: string = 'win32',
): string {
  if (platform === 'darwin')
    return `#!/bin/sh\n# VIBE_DESCRIPTOR ${JSON.stringify(descriptor)}\nunset NODE_OPTIONS NODE_PATH ELECTRON_RUN_AS_NODE\nexec ${shellQuote(node)} ${shellQuote(runner)} ${shellQuote(descriptor)} "$@"\n`
  if ([node, runner, descriptor].some((path) => !isAbsolute(path) || /["%\r\n!&|<>^]/.test(path)))
    fail('PROJECT_LAUNCHER_PATH_UNSAFE')
  const commands = [
    ...[
      'NODE_OPTIONS',
      'NODE_PATH',
      'NODE_REPL_EXTERNAL_MODULE',
      'ELECTRON_RUN_AS_NODE',
      'ELECTRON_EXTRA_LAUNCH_ARGS',
    ].map((name) => `set "${name}="`),
    `"${node}" "${runner}" "${descriptor}" %*`,
  ]
  return legacy
    ? ['@echo off', 'setlocal', ...commands, 'exit /b %errorlevel%', ''].join('\r\n')
    : utf8Batch(commands)
}

const projectPreparation = new Map<string, Promise<void>>()

/**
 * The recorded pnpm was chosen by an older product pin: same kind of choice,
 * a strictly older exact version, and for the Core-managed copy the exact cache
 * path that pin would have produced. User-selected Node is never covered here.
 */
function isOlderPinnedPnpm(previous: unknown, toolchain: ProjectToolchain): boolean {
  if (typeof previous !== 'object' || previous === null) return false
  const old = previous as Record<string, unknown>
  const keys = Object.keys(old).sort().join(',')
  if (keys !== 'executable,kind,source,version') return false
  const before = parseExactVersion(old.version),
    after = parseExactVersion(toolchain.pnpm.version)
  if (!before || !after || typeof old.executable !== 'string') return false
  if (!isOlderVersion(before, after)) return false
  if (old.source === 'MANAGED_PNPM')
    return (
      old.kind === 'JS' &&
      old.executable ===
        join(toolchain.privateRoot, 'pnpm-cache', `pnpm-${old.version}`, 'bin/pnpm.cjs')
    )
  return (
    old.source === 'EXISTING_PNPM' &&
    ['JS', 'CMD', 'EXE'].includes(String(old.kind)) &&
    isAbsolute(old.executable)
  )
}

/** Only a newer version of this installed product in the same extension directory. */
function isProductResourceUpgrade(previous: string, current: string): boolean {
  if (
    !isAbsolute(previous) ||
    basename(previous) !== 'portable' ||
    basename(current) !== 'portable' ||
    dirname(dirname(previous)) !== dirname(dirname(current))
  )
    return false
  // Installed product folders: the reference panel and the frontend product VSIX.
  // An upgrade must stay within the same product; switching products is refused.
  const installed = (path: string) => {
    const match = basename(dirname(path)).match(
      /^vibe-helper\.(vibe-helper-portable-core|builder-helper-agent-panel)-(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/,
    )
    return match ? { product: match[1], version: match.slice(2).map(Number) } : undefined
  }
  const beforeInstall = installed(previous),
    afterInstall = installed(current)
  if (!beforeInstall || !afterInstall || beforeInstall.product !== afterInstall.product)
    return false
  const before = beforeInstall.version,
    after = afterInstall.version
  if ([...before, ...after].some((value) => !Number.isSafeInteger(value))) return false
  for (let i = 0; i < 3; i++) {
    if (after[i] !== before[i]) return (after[i] ?? 0) > (before[i] ?? 0)
  }
  return false
}

async function optionalProjectFile(path: string): Promise<string | null> {
  try {
    return (await plainFile(path, 32768)).toString()
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

/** A missing old project is not a new authority to create, search for, or relocate it. */
async function recordedWorkspaceMissing(workspace: string): Promise<boolean> {
  if (!isAbsolute(workspace) || resolve(workspace) !== workspace)
    fail('PROJECT_RECORDED_TOOLCHAIN_INVALID')
  const stat = await lstat(workspace).catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (stat) {
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await realpath(workspace)) !== workspace ||
      !(await isPrivateDirectory(workspace))
    )
      fail('PROJECT_RECORDED_TOOLCHAIN_INVALID')
    return false
  }
  let parent = dirname(workspace)
  while (true) {
    const info = await lstat(parent).catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (info) {
      if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(parent)) !== parent)
        fail('PROJECT_RECORDED_TOOLCHAIN_INVALID')
      return true
    }
    const next = dirname(parent)
    if (next === parent) fail('PROJECT_RECORDED_TOOLCHAIN_INVALID')
    parent = next
  }
}

/** Only the previous product's bundled Mac Node may move into the persistent cache. */
function upgradedBundledNode(
  node: CoreRuntimeDescriptor | undefined,
  previous: unknown,
  resources: CoreResources,
  privateRoot: string,
): CoreRuntimeDescriptor | undefined {
  if (
    typeof previous !== 'string' ||
    !node ||
    node.platform !== 'darwin' ||
    node.arch !== 'arm64' ||
    !['EXISTING_NODE', 'MANAGED_NODE'].includes(node.source) ||
    node.nodeVersion !== '24.19.0' ||
    node.args?.length !== 0 ||
    Object.keys(node.env ?? {}).length !== 0 ||
    node.executable !== join(previous, 'bin/node') ||
    !isProductResourceUpgrade(previous, resources.root)
  )
    return undefined
  return {
    ...node,
    source: 'MANAGED_NODE',
    executable: managedMacNodePath(join(privateRoot, 'node-cache'), resources),
  }
}

async function replaceProjectFile(path: string, content: string): Promise<void> {
  const pending = path + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(pending, content, { flag: 'wx', mode: 0o600 })
    await rename(pending, path)
  } finally {
    await unlink(pending).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

export async function prepareProjectTools(
  workspace: string,
  toolchain: ProjectToolchain,
  resources: CoreResources,
): Promise<void> {
  // The Core owner lock excludes other Core instances. Serialize callers in this instance.
  const key = resolve(workspace).toLowerCase()
  const previous = projectPreparation.get(key) ?? Promise.resolve()
  const pending = previous
    .catch(() => {})
    .then(() => prepareProjectToolsOnce(workspace, toolchain, resources))
  projectPreparation.set(key, pending)
  try {
    await pending
  } finally {
    if (projectPreparation.get(key) === pending) projectPreparation.delete(key)
  }
}

async function prepareProjectToolsOnce(
  workspace: string,
  toolchain: ProjectToolchain,
  resources: CoreResources,
): Promise<void> {
  if ((await realpath(workspace)) !== resolve(workspace) || !(await isPrivateDirectory(workspace)))
    fail('PROJECT_WORKSPACE_UNSAFE')
  const kiro = await ownedPrivateDirectory(join(workspace, '.kiro'))
  const descriptorRoot = await ownedPrivateDirectory(join(toolchain.privateRoot, 'projects'))
  const descriptorFile = join(descriptorRoot, sha256(Buffer.from(workspace)) + '.json')
  const launcherFile = join(kiro, 'vibe-tools.cmd')
  const descriptor = { schemaVersion: 1, workspace, toolchain, resourceRoot: resources.root }
  const content = JSON.stringify(descriptor)
  const launcher = launcherText(
    toolchain.node.executable,
    join(resources.root, 'bin/project-tools.mjs'),
    descriptorFile,
    false,
    toolchain.node.platform,
  )
  const oldContent = await optionalProjectFile(descriptorFile)
  const oldLauncher = await optionalProjectFile(launcherFile)
  if (oldContent === null) {
    if (oldLauncher !== null) fail('PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED')
    await writeFile(descriptorFile, content, { flag: 'wx', mode: 0o600 })
    await writeFile(launcherFile, launcher, { flag: 'wx', mode: 0o600 })
    return
  }
  if (oldContent === content) {
    if (oldLauncher === null) await writeFile(launcherFile, launcher, { flag: 'wx', mode: 0o600 })
    else if (oldLauncher !== launcher) fail('PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED')
    return
  }
  let oldRoot: unknown, oldPnpm: unknown, oldNode: CoreRuntimeDescriptor | undefined
  try {
    const parsed = JSON.parse(oldContent) as {
      resourceRoot?: unknown
      toolchain?: { pnpm?: unknown; node?: CoreRuntimeDescriptor }
    }
    oldRoot = parsed.resourceRoot
    oldPnpm = parsed.toolchain?.pnpm
    oldNode = parsed.toolchain?.node
  } catch {
    fail('PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED')
  }
  const migratedNode = upgradedBundledNode(oldNode, oldRoot, resources, toolchain.privateRoot)
  const expectedOldTools = {
    ...toolchain,
    ...(migratedNode && JSON.stringify(migratedNode) === JSON.stringify(toolchain.node)
      ? { node: oldNode ?? toolchain.node }
      : {}),
    ...(isOlderPinnedPnpm(oldPnpm, toolchain) ? { pnpm: oldPnpm } : {}),
  }
  const expectedOld = JSON.stringify({
    ...descriptor,
    toolchain: expectedOldTools,
    resourceRoot: oldRoot,
  })
  if (
    typeof oldRoot !== 'string' ||
    !isProductResourceUpgrade(oldRoot, resources.root) ||
    oldContent !== expectedOld
  )
    fail('PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED')
  const expectedOldLauncher = launcherText(
    expectedOldTools.node.executable,
    join(oldRoot, 'bin/project-tools.mjs'),
    descriptorFile,
    false,
    toolchain.node.platform,
  )
  const legacyOldLauncher = launcherText(
    expectedOldTools.node.executable,
    join(oldRoot, 'bin/project-tools.mjs'),
    descriptorFile,
    true,
    toolchain.node.platform,
  )
  if (
    oldLauncher !== expectedOldLauncher &&
    oldLauncher !== legacyOldLauncher &&
    oldLauncher !== launcher
  )
    fail('PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED')
  // Launcher first: an interrupted pair fails verification and is recoverable using
  // the still-old descriptor. Never execute or trust assets from the old package.
  if (oldLauncher !== launcher) await replaceProjectFile(launcherFile, launcher)
  await replaceProjectFile(descriptorFile, content)
}

export async function verifyProjectTools(
  workspace: string,
  resources: CoreResources,
): Promise<{ toolchain: ProjectToolchain; descriptorFile: string }> {
  const canonical = await realpath(workspace)
  if (canonical !== resolve(workspace) || !(await isPrivateDirectory(canonical)))
    fail('PROJECT_WORKSPACE_UNSAFE')
  const launcher = (await plainFile(join(canonical, '.kiro/vibe-tools.cmd'), 32768)).toString()
  const lines = launcher
    .split('\r\n')
    .map((line) => line.match(/^"([^"]+)" "([^"]+)" "([^"]+)" %\*$/))
    .filter((line) => line !== null)
  const match = lines.length === 1 ? lines[0] : null
  const macDescriptor =
    process.platform === 'darwin' ? launcher.match(/^# VIBE_DESCRIPTOR (.+)$/m)?.[1] : undefined
  if (!match?.[3] && !macDescriptor) fail('PROJECT_LAUNCHER_INVALID')
  const descriptorFile: unknown = macDescriptor ? JSON.parse(macDescriptor) : match?.[3]
  if (typeof descriptorFile !== 'string' || !isAbsolute(descriptorFile))
    fail('PROJECT_DESCRIPTOR_INVALID')
  if (!(await isPrivateDirectory(dirname(descriptorFile)))) fail('PROJECT_DESCRIPTOR_UNSAFE')
  const data = JSON.parse((await plainFile(descriptorFile, 32768)).toString()) as {
    schemaVersion: number
    workspace: string
    toolchain: ProjectToolchain
    resourceRoot: string
  }
  const tc = data.toolchain
  if (
    data.schemaVersion !== 1 ||
    data.workspace !== canonical ||
    data.resourceRoot !== resources.root ||
    tc?.schemaVersion !== 1 ||
    tc.node?.source === 'KIRO' ||
    tc.node?.args?.length !== 0 ||
    Object.keys(tc.node?.env ?? {}).length !== 0 ||
    tc.pnpm?.version !== PROJECT_PNPM.version ||
    !['JS', 'CMD', 'EXE'].includes(tc.pnpm.kind) ||
    !isAbsolute(tc.node.executable) ||
    !isAbsolute(tc.pnpm.executable) ||
    descriptorFile !== join(tc.privateRoot, 'projects', `${sha256(Buffer.from(canonical))}.json`) ||
    !(await isPrivateDirectory(tc.privateRoot))
  )
    fail('PROJECT_DESCRIPTOR_INVALID')
  if (
    launcher !==
    launcherText(
      tc.node.executable,
      join(resources.root, 'bin/project-tools.mjs'),
      descriptorFile,
      false,
      tc.node.platform,
    )
  )
    fail('PROJECT_LAUNCHER_CHANGED')
  return { toolchain: tc, descriptorFile }
}
