const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { test } = require('node:test')

const {
  NODE_EXECUTABLE,
  PROMPTS,
  RUNTIME_SOURCE,
  createRetryableRuntimeResolver,
  materializePackagedRoleRuntime,
  resolvePackagedNativeRuntime,
} = require('../src/native-runtime.cjs')

const sha256 = value => createHash('sha256').update(value).digest('hex')

async function stageRuntime(source = RUNTIME_SOURCE) {
  const root = await mkdtemp(join(tmpdir(), 'vibe-helper-relocated-extension-'))
  const runtime = join(root, 'runtime')
  await mkdir(join(runtime, 'agent-prompts'), { recursive: true })
  const assets = {}
  const promptVersions = {}
  const bridge = Buffer.from('console.log("packaged bridge")\n')
  await writeFile(join(runtime, 'native-core-stdio-bridge.mjs'), bridge)
  assets.bridge = { path: 'native-core-stdio-bridge.mjs', sha256: sha256(bridge) }
  for (const [role, path] of Object.entries(PROMPTS)) {
    const content = Buffer.from(`# ${role}\n\n> Prompt version: \`0.0.0\`\n`)
    await writeFile(join(runtime, path), content)
    assets[role] = { path, sha256: sha256(content) }
    promptVersions[role] = '0.0.0'
  }
  await writeFile(join(runtime, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    runtimeSource: source,
    platform: 'darwin',
    arch: 'arm64',
    vscodeVersion: '1.109.5',
    kiroIdeVersion: '1.0.437',
    agentExtensionVersion: '1.0.794',
    nodeVersion: '24.19.0',
    nodeExecutable: NODE_EXECUTABLE,
    promptVersions,
    assets,
  }))
  return root
}

const runtimeOptions = extensionPath => ({
  extensionPath,
  platform: 'darwin',
  arch: 'arm64',
  vscodeVersion: '1.109.5',
  runtimeSource: RUNTIME_SOURCE,
  nodeExecutable: NODE_EXECUTABLE,
  attestKiroInstallation: () => ({ agentExtensionVersion: '1.0.794' }),
  vscode: { version: '1.109.5', env: { appRoot: extensionPath },
    extensions: { getExtension: () => { throw new Error('CROSS_HOST_API_MUST_NOT_BE_USED') } } },
  execFile: async () => ({ stdout: 'v24.19.0\n', stderr: '' }),
  access: async path => { assert.equal(path, NODE_EXECUTABLE) },
})

test('a relocated staged extension resolves only packaged runtime assets', async () => {
  const root = await stageRuntime()
  const runtime = await resolvePackagedNativeRuntime(runtimeOptions(root))
  const canonicalRoot = await realpath(root)
  assert.equal(runtime.source, RUNTIME_SOURCE)
  assert.equal(runtime.nodePath, NODE_EXECUTABLE)
  assert.equal(runtime.bridgeScriptPath,
    join(canonicalRoot, 'runtime', 'native-core-stdio-bridge.mjs'))
  for (const value of Object.values(runtime.prompts))
    assert.ok(value.path.startsWith(join(canonicalRoot, 'runtime', 'agent-prompts')))

  const workspace = await mkdtemp(join(tmpdir(), 'vibe-helper-role-workspace-'))
  const canonicalWorkspace = await realpath(workspace)
  const agents = join(canonicalWorkspace, '.kiro', 'agents')
  await mkdir(agents, { recursive: true })
  const bindingFile = join(canonicalWorkspace, 'binding.json')
  const binding = { workspace: canonicalWorkspace }
  await writeFile(bindingFile, JSON.stringify(binding), { mode: 0o600 })
  const roleName = 'vibe-native-builder-deadbeef'
  const configPath = join(agents, `${roleName}.json`)
  await writeFile(configPath, JSON.stringify({
    name: roleName,
    prompt: runtime.prompts.BUILDER.text,
    mcpServers: { 'vibe-native-core': {
      command: NODE_EXECUTABLE,
      args: ['/repo/scripts/native-core-stdio-bridge.mjs', bindingFile, canonicalWorkspace],
    } },
  }), { mode: 0o600 })
  await materializePackagedRoleRuntime(runtime, {
    role: 'BUILDER', roleName, workspace: canonicalWorkspace, bindingFile,
    protectedBuiltin: false,
  }, binding)
  const materialized = JSON.parse(await readFile(configPath, 'utf8'))
  assert.equal(materialized.mcpServers['vibe-native-core'].args[0],
    runtime.bridgeScriptPath)
})

test('an unrecognized private runtime source fails closed', async () => {
  const root = await stageRuntime('KIRO_IDE_UNSUPPORTED_SOURCE')
  await assert.rejects(resolvePackagedNativeRuntime(runtimeOptions(root)), error =>
    error.code === 'NATIVE_RUNTIME_SOURCE_UNSUPPORTED')
})

test('a symlinked Agent config parent cannot redirect the package rewrite outside workspace', async () => {
  const root = await stageRuntime()
  const runtime = await resolvePackagedNativeRuntime(runtimeOptions(root))
  const workspace = await mkdtemp(join(tmpdir(), 'vibe-helper-role-workspace-'))
  const canonicalWorkspace = await realpath(workspace)
  const outside = await mkdtemp(join(tmpdir(), 'vibe-helper-role-outside-'))
  const outsideAgents = join(outside, 'agents')
  await mkdir(outsideAgents)
  await symlink(outside, join(canonicalWorkspace, '.kiro'), 'junction')
  const bindingFile = join(canonicalWorkspace, 'binding.json')
  const binding = { workspace: canonicalWorkspace }
  await writeFile(bindingFile, JSON.stringify(binding), { mode: 0o600 })
  const roleName = 'vibe-native-builder-cafebabe'
  const outsideConfig = join(outsideAgents, `${roleName}.json`)
  const original = `${JSON.stringify({
    name: roleName,
    prompt: runtime.prompts.BUILDER.text,
    mcpServers: { 'vibe-native-core': {
      command: NODE_EXECUTABLE,
      args: ['/repo/scripts/native-core-stdio-bridge.mjs', bindingFile, canonicalWorkspace],
    } },
  })}\n`
  await writeFile(outsideConfig, original, { mode: 0o600 })

  await assert.rejects(materializePackagedRoleRuntime(runtime, {
    role: 'BUILDER', roleName, workspace: canonicalWorkspace, bindingFile,
    protectedBuiltin: false,
  }, binding), error => error.code === 'NATIVE_PACKAGED_ROLE_CONFIG_ESCAPED')
  assert.equal(await readFile(outsideConfig, 'utf8'), original,
    'the outside file must remain byte-for-byte unchanged')
})

test('the configured Node executable must report exactly 24.19.0', async () => {
  const root = await stageRuntime()
  await assert.rejects(resolvePackagedNativeRuntime({ ...runtimeOptions(root),
    execFile: async () => ({ stdout: 'v24.20.0\n', stderr: '' }),
  }), error => error.code === 'NATIVE_NODE_VERSION_UNCONFIRMED')
})

test('a rejected startup check retries only after a later explicit resolver call', async () => {
  let attempts = 0
  const resolver = createRetryableRuntimeResolver(async () => {
    attempts += 1
    if (attempts === 1) throw new Error('TRANSIENT_STARTUP_FAILURE')
    return { source: RUNTIME_SOURCE }
  })
  const startup = resolver()
  assert.equal(resolver(), startup, 'concurrent callers must share one attempt')
  await assert.rejects(startup, /TRANSIENT_STARTUP_FAILURE/)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(attempts, 1, 'failure must not schedule an automatic retry')
  assert.deepEqual(await resolver(), { source: RUNTIME_SOURCE })
  assert.equal(attempts, 2)
})
