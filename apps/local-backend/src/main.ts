import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { LOCAL_PROTOCOL_VERSION, projectSessionSnapshotSchema } from '@vibe-helper/contracts'
import { KiroAcpSession } from '@vibe-helper/kiro-adapter/acp-node'
import {
  type CoreResources,
  currentCoreRuntime,
  loadCoreResources,
  ownedPrivateDirectory,
  type ProjectToolchain,
  prepareProjectTools,
  isLockOwnerAlive,
  ResultRuntimeSupervisor,
  selectProjectToolchain,
  verifyProjectTools,
  WorkflowError,
  WorkflowRuntime,
} from '@vibe-helper/runtime'
import { openSqliteStorage } from '@vibe-helper/storage-sqlite'
import { LocalAgentHost } from './agent-host.js'
import { HostLeases } from './host-leases.js'
import { NativeAgentRelay } from './native-agent-relay.js'
import { createNativeCoreBinding } from './native-core-binding.js'
import { privateDirectory } from './private-files.js'
import { createLocalServer } from './server.js'

const execute = promisify(execFile)
declare const __VIBE_PACKAGED_CORE__: boolean
const packaged = typeof __VIBE_PACKAGED_CORE__ !== 'undefined' && __VIBE_PACKAGED_CORE__
let resources: CoreResources | undefined
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2).filter((value) => value !== '--')
const command = args.shift() ?? 'start'
const allowed = new Set([
  '--root',
  '--port',
  '--kiro-cli',
  '--model',
  '--live',
  '--native-role',
  '--native-project-id',
  '--native-correlation-id',
  '--native-task-id',
  '--native-tools',
])
function option(name: string, fallback: string): string {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error('OPTION_VALUE_REQUIRED')
  return value
}
for (let index = 0; index < args.length; index++) {
  const value = args[index]
  if (value === undefined || !allowed.has(value)) throw new Error('UNKNOWN_OPTION')
  if (value !== '--live') index++
}
const root = resolve(option('--root', join(repository, '.data/local')))
const executable = option('--kiro-cli', process.platform === 'win32' ? 'kiro-cli.exe' : 'kiro-cli')
const model = option('--model', 'claude-haiku-4.5')
const markerPath = join(root, 'local-runtime.json')
const lockPath = join(root, 'backend.lock')
const descriptorPath = join(root, 'connection.json')
const print = (data: unknown): void => {
  process.stdout.write(`${JSON.stringify(data)}\n`)
}

async function initialized(): Promise<void> {
  if ((await lstat(root)).isSymbolicLink()) throw new Error('DATA_ROOT_SYMLINK_DENIED')
  const marker: unknown = JSON.parse(await readFile(markerPath, 'utf8'))
  if (
    typeof marker !== 'object' ||
    marker === null ||
    !('format' in marker) ||
    marker.format !== 'vibe-helper-local-v1'
  )
    throw new Error('INITIALIZE_REQUIRED')
}
async function init(): Promise<void> {
  const entries = await readdir(root).catch(() => [])
  if (entries.length > 0) {
    await initialized()
    print({ status: 'ALREADY_INITIALIZED', root })
    return
  }
  await privateDirectory(root)
  await writeFile(markerPath, JSON.stringify({ format: 'vibe-helper-local-v1' }), {
    mode: 0o600,
    flag: 'wx',
  })
  for (const name of ['data', 'workspaces', 'agents']) await privateDirectory(join(root, name))
  const storage = await openSqliteStorage({
    dataDirectory: join(root, 'data'),
    ...(resources ? { migrationsDirectory: resources.migrationsDirectory } : {}),
  })
  try {
    print({ status: 'INITIALIZED', root, storage: storage.checkIntegrity() })
  } finally {
    storage.close()
  }
}
async function kiroVersion(): Promise<string> {
  const { stdout } = await execute(executable, ['--version'], {
    timeout: 10_000,
    windowsHide: true,
    maxBuffer: 16_384,
  })
  const version = stdout.match(/\b(\d+\.\d+\.\d+)\b/)?.[1]
  if (version !== '2.21.1') throw new Error('KIRO_VERSION_NOT_VERIFIED_EXPECT_2_21_1')
  return version
}
async function doctor(): Promise<void> {
  await initialized()
  const version = await kiroVersion()
  const storage = await openSqliteStorage({ dataDirectory: join(root, 'data') })
  try {
    print({ check: 'storage', ...storage.checkIntegrity() })
  } finally {
    storage.close()
  }
  print({
    check: 'toolchain',
    node: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
    kiroCli: version,
    engine: 'v2',
    model,
    windowsLiveGate: 'NOT_VERIFIED',
  })
  if (!args.includes('--live')) {
    print({ check: 'login_and_model', status: 'NOT_CHECKED', next: 'core:doctor --live' })
    return
  }
  const directory = await privateDirectory(join(root, 'agents', `doctor-${randomUUID()}`))
  await mkdir(join(directory, '.kiro', 'agents'), { recursive: true, mode: 0o700 })
  const name = 'vibe-helper-local-doctor'
  await writeFile(
    join(directory, '.kiro', 'agents', `${name}.json`),
    JSON.stringify({
      name,
      description: 'Explicit no-tool connectivity check',
      prompt: 'Reply LOCAL_ACP_READY to the connectivity check.',
      tools: [],
      allowedTools: [],
      resources: [],
      mcpServers: {},
      includeMcpJson: false,
    }),
    { mode: 0o600 },
  )
  const session = await KiroAcpSession.connect({ executable, cwd: directory, agent: name, model })
  try {
    const result = await session.prompt('Connectivity check: reply LOCAL_ACP_READY.')
    if (result.stopReason !== 'end_turn' || !result.text.includes('LOCAL_ACP_READY'))
      throw new Error('LIVE_CHECK_FAILED')
    print({ check: 'login_and_model', status: 'VERIFIED', nativeBuilderPermissions: 'NOT_CHECKED' })
  } finally {
    await session.close()
  }
}
async function recover(): Promise<void> {
  // Managed initialization may have been interrupted before its marker was published.
  if (!packaged) await initialized()
  const ownerText = await readFile(join(lockPath, 'owner.json'), 'utf8')
  const lock = JSON.parse(ownerText) as { pid?: unknown }
  const assertDead = async (): Promise<void> => {
    if (!Number.isSafeInteger(lock.pid) || Number(lock.pid) <= 0)
      throw new Error('LOCK_OWNER_INVALID_MANUAL_REVIEW_REQUIRED')
    if (await isLockOwnerAlive(Number(lock.pid), join(lockPath, 'owner.json')))
      throw new Error('BACKEND_PROCESS_STILL_EXISTS')
  }
  await assertDead()
  const recoveryPath = join(lockPath, 'recovering')
  const recovery = await open(recoveryPath, 'wx', 0o600)
  const recoveryStat = await recovery.stat()
  await recovery.close()
  try {
    if ((await readFile(join(lockPath, 'owner.json'), 'utf8')) !== ownerText)
      throw new Error('LOCK_OWNER_CHANGED')
    await assertDead()
    await rename(lockPath, join(root, `backend.abandoned-${randomUUID()}`))
    print({
      status: 'STALE_LOCK_ARCHIVED',
      next: 'Start Core, restore Project, then explicitly retry. Old runs are not replayed.',
    })
  } catch (error) {
    const current = await lstat(recoveryPath).catch(() => null)
    if (current?.ino === recoveryStat.ino && current?.dev === recoveryStat.dev)
      await unlink(recoveryPath)
    throw error
  }
}
async function start(coreOnly = false, nativeMode = false, managed = false): Promise<void> {
  if (!managed) await initialized()
  if (!coreOnly && !nativeMode) await kiroVersion()
  const port = Number(option('--port', '47831'))
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('PORT_INVALID')
  await mkdir(lockPath, { mode: 0o700 }).catch(() => {
    throw new Error('BACKEND_LOCKED_USE_RECOVER_AFTER_PROCESS_EXIT')
  })
  const instanceId = randomUUID()
  await writeFile(
    join(lockPath, 'owner.json'),
    JSON.stringify({
      pid: process.pid,
      instanceId,
      ...(resources
        ? {
            packageHash: createHash('sha256')
              .update(JSON.stringify(resources.manifest))
              .digest('hex'),
          }
        : {}),
    }),
    {
      mode: 0o600,
      flag: 'wx',
    },
  )
  let storage: Awaited<ReturnType<typeof openSqliteStorage>> | undefined
  let nativeBinding: ReturnType<typeof createNativeCoreBinding> | undefined
  let nativeWorkspace: string | undefined
  const nativeBindingFile = join(root, `native-mcp-${instanceId}.json`)
  let nativeBindingFileWritten = false
  let runtime: WorkflowRuntime | undefined
  let nativeRelay: NativeAgentRelay | undefined
  let result: ResultRuntimeSupervisor | undefined
  let server: ReturnType<typeof createLocalServer> | undefined
  let closing = false
  const hostLeases = managed ? new HostLeases() : undefined
  let leaseTimer: ReturnType<typeof setInterval> | undefined
  const close = async (): Promise<void> => {
    if (closing) return
    closing = true
    clearInterval(leaseTimer)
    // Revoke Agent authority and stop owned children before closing persistence.
    await runtime?.close()
    await nativeRelay?.close()
    nativeBinding?.revoke()
    await nativeBinding?.handler.close()
    if (nativeBindingFileWritten)
      await writeFile(nativeBindingFile, JSON.stringify({ status: 'REVOKED' }), { mode: 0o600 })
    await result?.close()
    if (server?.listening) {
      server.closeAllConnections()
      await new Promise<void>((done) => server?.close(() => done()))
    }
    storage?.close()
    await rename(lockPath, join(root, `backend.stopped-${instanceId}`))
    if (!managed || process.connected) print({ status: 'STOPPED', backendInstanceId: instanceId })
    if (packaged && process.connected) process.disconnect()
  }
  try {
    if (managed) {
      for (const name of ['data', 'workspaces', 'agents'])
        await ownedPrivateDirectory(join(root, name))
      const marker = await lstat(markerPath).catch(() => null)
      if (marker) await initialized()
      else
        await writeFile(markerPath, JSON.stringify({ format: 'vibe-helper-local-v1' }), {
          mode: 0o600,
          flag: 'wx',
        })
    }
    storage = await openSqliteStorage({
      dataDirectory: join(root, 'data'),
      ...(resources ? { migrationsDirectory: resources.migrationsDirectory } : {}),
    })
    const policy = await WorkspacePathPolicy.create(
      join(root, 'workspaces'),
      packaged ? { prepareNewWorkspace: privateDirectory } : {},
    )
    const application = new ApplicationService({ storage, workspacePolicy: policy })
    const nativeRole = option('--native-role', '')
    if (
      nativeRole === '' &&
      ['--native-project-id', '--native-correlation-id', '--native-task-id', '--native-tools'].some(
        (flag) => args.includes(flag),
      )
    )
      throw new Error('NATIVE_BINDING_ROLE_REQUIRED')
    if (nativeRole !== '') {
      if (!coreOnly || (nativeRole !== 'BUILDER' && nativeRole !== 'HELPER'))
        throw new Error('NATIVE_BINDING_ROLE_INVALID')
      const projectId = option('--native-project-id', '')
      const correlationId = option('--native-correlation-id', '')
      const taskId = option('--native-task-id', '')
      if (!projectId || !correlationId || !taskId) throw new Error('NATIVE_BINDING_SCOPE_REQUIRED')
      const restored = await application.executeUi({
        schemaVersion: 1,
        actor: { kind: 'UI' },
        kind: 'UI_RESTORE_PROJECT_SESSION',
        projectId,
        correlationId,
        helperConversationLimit: 1,
      })
      if (!restored.success) throw new Error('NATIVE_TASK_BINDING_MISMATCH')
      const snapshot = projectSessionSnapshotSchema.parse(restored.data)
      if (
        snapshot.currentTask?.id !== taskId ||
        (nativeRole === 'BUILDER' && snapshot.currentTask.correlationId !== correlationId)
      )
        throw new Error('NATIVE_TASK_BINDING_MISMATCH')
      nativeWorkspace = await policy.resolveProjectWorkspace(snapshot.project, correlationId)
      nativeBinding = createNativeCoreBinding({
        application,
        role: nativeRole,
        projectId,
        correlationId,
        taskId,
        ...(option('--native-tools', '')
          ? { toolNames: option('--native-tools', '').split(',') }
          : {}),
      })
    }
    let projectTools: Promise<ProjectToolchain> | undefined
    const prepareTools = resources
      ? async (workspace: string, signal?: AbortSignal): Promise<ProjectToolchain> => {
          const assets = resources as CoreResources
          if (!projectTools) {
            projectTools = selectProjectToolchain({
              resources: assets,
              privateRoot: join(root, 'project-tools'),
              ...(signal ? { signal } : {}),
            })
            void projectTools.catch(() => {
              projectTools = undefined
            })
          }
          const selected = await projectTools
          signal?.throwIfAborted()
          await prepareProjectTools(workspace, selected, assets)
          return (await verifyProjectTools(workspace, assets)).toolchain
        }
      : undefined
    result = await ResultRuntimeSupervisor.create(
      join(root, 'workspaces'),
      prepareTools ? { projectToolchain: prepareTools } : {},
    )
    const localAgents =
      coreOnly || nativeMode
        ? undefined
        : new LocalAgentHost({
            application,
            policy,
            agentRoot: join(root, 'agents'),
            definitionsRoot: join(repository, 'agents'),
            guardPath: join(repository, 'packages/kiro-adapter/dist/builder-tool-guard-node.js'),
            executable,
            model,
          })
    nativeRelay = nativeMode
      ? new NativeAgentRelay({
          application,
          policy,
          root,
          repository,
          ...(resources
            ? {
                portable: {
                  promptDirectory: resources.promptDirectory,
                  bridgeScriptPath: resources.bridge,
                  runtime: currentCoreRuntime(),
                },
                prepareBuilderTools: async (workspace: string, signal: AbortSignal) => {
                  try {
                    await prepareTools?.(workspace, signal)
                  } catch (error) {
                    throw new WorkflowError(
                      error instanceof Error &&
                        /^(PROJECT|PNPM|RUNTIME|PRIVATE)_[A-Z_]{1,80}$/.test(error.message)
                        ? error.message
                        : 'PROJECT_TOOLCHAIN_PREPARATION_FAILED',
                    )
                  }
                },
              }
            : {}),
          singleWindowBuiltinH:
            !packaged && process.env.VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H === '1',
        })
      : undefined
    const agents = localAgents ??
      nativeRelay ?? {
        invoke: async (): Promise<never> => {
          throw new WorkflowError('NATIVE_RUNTIME_NOT_ATTACHED')
        },
        handlers: new Map(),
      }
    runtime = new WorkflowRuntime({ application, agents, instanceId })
    const token = randomBytes(32).toString('hex')
    // Keep the live CLI handler map: LocalAgentHost registers each run after startup.
    const mcpHandlers = agents.handlers
    if (nativeBinding) mcpHandlers.set(nativeBinding.path, nativeBinding.handler)
    server = createLocalServer({
      application,
      runtime,
      token,
      instanceId,
      mcpHandlers,
      ...(hostLeases ? { hostLease: (input: unknown) => hostLeases.update(input) } : {}),
      ...(nativeRelay ? { nativeRelay } : {}),
      ...(coreOnly ? { runStartDisabledCode: 'NATIVE_RUNTIME_NOT_ATTACHED' as const } : {}),
      isClosing: () => closing,
      resultLauncher: result,
    })
    await new Promise<void>((done, reject) => {
      server?.once('error', reject)
      server?.listen(port, '127.0.0.1', done)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('LISTEN_FAILED')
    const baseUrl = `http://127.0.0.1:${address.port}`
    localAgents?.setBaseUrl(baseUrl)
    nativeRelay?.setBaseUrl(baseUrl)
    const nextDescriptorPath = `${descriptorPath}.${instanceId}.tmp`
    await writeFile(
      nextDescriptorPath,
      JSON.stringify({
        protocolVersion: LOCAL_PROTOCOL_VERSION,
        backendInstanceId: instanceId,
        baseUrl,
        token,
      }),
      { mode: 0o600 },
    )
    await rename(nextDescriptorPath, descriptorPath)
    if (nativeBinding) {
      await writeFile(
        nativeBindingFile,
        JSON.stringify({
          role: nativeRole,
          projectId: option('--native-project-id', ''),
          correlationId: option('--native-correlation-id', ''),
          taskId: option('--native-task-id', ''),
          workspace: nativeWorkspace,
          toolNames: nativeBinding.toolNames,
          url: `${baseUrl}${nativeBinding.path}`,
          authorization: nativeBinding.authorization,
        }),
        { mode: 0o600, flag: 'wx' },
      )
      nativeBindingFileWritten = true
    }
    if (!coreOnly) runtime.startAnalystWorker()
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.once(signal, () => {
        void close().catch(() => {
          process.exitCode = 1
        })
      })
    if (hostLeases)
      leaseTimer = setInterval(() => {
        if (hostLeases.expired()) void close()
      }, 1000)
    if (packaged && process.connected) {
      process.once('disconnect', () => {
        if (!managed) void close()
      })
      process.on('message', (message) => {
        if (message === 'VIBE_CORE_SHUTDOWN' && !managed) void close()
      })
    }
    print({
      status: coreOnly ? 'CORE_ONLY_READY' : nativeMode ? 'NATIVE_READY' : 'READY',
      baseUrl,
      connectionFile: descriptorPath,
      ...(nativeBinding ? { nativeBindingFile } : {}),
      backendInstanceId: instanceId,
      protocolVersion: LOCAL_PROTOCOL_VERSION,
      agentLogin: coreOnly
        ? 'NATIVE_AGENT_NOT_ATTACHED'
        : nativeMode
          ? 'CHECK_IN_KIRO_IDE'
          : 'CHECK_WITH_DOCTOR_LIVE',
    })
  } catch (error) {
    await close()
    throw error
  }
}
try {
  if (packaged) {
    currentCoreRuntime()
    resources = await loadCoreResources(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
    if (!args.includes('--root')) throw new Error('PACKAGED_PRIVATE_ROOT_REQUIRED')
    if (!['init', 'native', 'managed', 'core-only', 'recover'].includes(command))
      throw new Error('PACKAGED_COMMAND_UNSUPPORTED')
    const assetPath = resources.root.toLowerCase()
    const dataPath = root.toLowerCase()
    if (
      assetPath === dataPath ||
      assetPath.startsWith(`${dataPath}${sep}`) ||
      dataPath.startsWith(`${assetPath}${sep}`)
    )
      throw new Error('PACKAGED_DATA_RESOURCE_OVERLAP')
    await ownedPrivateDirectory(root)
  } else if (process.versions.node !== '24.19.0') throw new Error('NODE_24_19_0_REQUIRED')
  if (command === 'init') await init()
  else if (command === 'doctor') await doctor()
  else if (command === 'recover') await recover()
  else if (command === 'start') await start()
  else if (command === 'core-only') await start(true)
  else if (command === 'native') await start(false, true)
  else if (command === 'managed' && packaged) await start(false, true, true)
  else throw new Error('UNKNOWN_COMMAND')
} catch (error) {
  // Diagnostics do not print provider stderr, absolute credential paths or raw payloads.
  const code =
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[A-Z][A-Z0-9_]{1,99}$/.test(error.code) &&
    error.code !== 'ENOENT'
      ? error.code
      : error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message)
        ? error.message
        : error instanceof Error && 'code' in error && error.code === 'ENOENT'
          ? 'FILE_OR_KIRO_EXECUTABLE_NOT_FOUND'
          : 'LOCAL_STARTUP_FAILED'
  print({ status: 'FAILED', code })
  process.exitCode = 1
}
