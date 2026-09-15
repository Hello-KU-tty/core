import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { LOCAL_PROTOCOL_VERSION, projectSessionSnapshotSchema } from '@vibe-helper/contracts'
import { KiroAcpSession } from '@vibe-helper/kiro-adapter/acp-node'
import { ResultRuntimeSupervisor, WorkflowError, WorkflowRuntime } from '@vibe-helper/runtime'
import { openSqliteStorage } from '@vibe-helper/storage-sqlite'
import { LocalAgentHost } from './agent-host.js'
import { NativeAgentRelay } from './native-agent-relay.js'
import { createNativeCoreBinding } from './native-core-binding.js'
import { privateDirectory } from './private-files.js'
import { createLocalServer } from './server.js'

const execute = promisify(execFile)
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
  const storage = await openSqliteStorage({ dataDirectory: join(root, 'data') })
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
  await initialized()
  const lock = JSON.parse(await readFile(join(lockPath, 'owner.json'), 'utf8')) as { pid?: unknown }
  if (!Number.isSafeInteger(lock.pid) || Number(lock.pid) <= 0)
    throw new Error('LOCK_OWNER_INVALID_MANUAL_REVIEW_REQUIRED')
  try {
    process.kill(Number(lock.pid), 0)
    throw new Error('BACKEND_PROCESS_STILL_EXISTS')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error
  }
  await rename(lockPath, join(root, `backend.abandoned-${randomUUID()}`))
  print({
    status: 'STALE_LOCK_ARCHIVED',
    next: 'Start Core, restore Project, then explicitly retry. Old runs are not replayed.',
  })
}
async function start(coreOnly = false, nativeMode = false): Promise<void> {
  await initialized()
  if (!coreOnly && !nativeMode) await kiroVersion()
  const port = Number(option('--port', '47831'))
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('PORT_INVALID')
  await mkdir(lockPath, { mode: 0o700 }).catch(() => {
    throw new Error('BACKEND_LOCKED_USE_RECOVER_AFTER_PROCESS_EXIT')
  })
  const instanceId = randomUUID()
  await writeFile(join(lockPath, 'owner.json'), JSON.stringify({ pid: process.pid, instanceId }), {
    mode: 0o600,
    flag: 'wx',
  })
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
  const close = async (): Promise<void> => {
    if (closing) return
    closing = true
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
    print({ status: 'STOPPED', backendInstanceId: instanceId })
  }
  try {
    storage = await openSqliteStorage({ dataDirectory: join(root, 'data') })
    const policy = await WorkspacePathPolicy.create(join(root, 'workspaces'))
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
    result = await ResultRuntimeSupervisor.create(join(root, 'workspaces'))
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
          singleWindowBuiltinH: process.env.VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H === '1',
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
    await writeFile(
      descriptorPath,
      JSON.stringify({
        protocolVersion: LOCAL_PROTOCOL_VERSION,
        backendInstanceId: instanceId,
        baseUrl,
        token,
      }),
      { mode: 0o600 },
    )
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
  if (process.versions.node !== '24.19.0') throw new Error('NODE_24_19_0_REQUIRED')
  if (command === 'init') await init()
  else if (command === 'doctor') await doctor()
  else if (command === 'recover') await recover()
  else if (command === 'start') await start()
  else if (command === 'core-only') await start(true)
  else if (command === 'native') await start(false, true)
  else throw new Error('UNKNOWN_COMMAND')
} catch (error) {
  // Diagnostics do not print provider stderr, absolute credential paths or raw payloads.
  const code =
    error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message)
      ? error.message
      : error instanceof Error && 'code' in error && error.code === 'ENOENT'
        ? 'FILE_OR_KIRO_EXECUTABLE_NOT_FOUND'
        : 'LOCAL_STARTUP_FAILED'
  print({ status: 'FAILED', code })
  process.exitCode = 1
}
