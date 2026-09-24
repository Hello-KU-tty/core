const { createHash } = require('node:crypto')
const { constants } = require('node:fs')
const { access, lstat, open, readFile, realpath } = require('node:fs/promises')
const { execFile: execFileCallback } = require('node:child_process')
const { isAbsolute, join, relative, resolve, sep } = require('node:path')
const { promisify } = require('node:util')
const { attestPinnedKiroInstallation } =
  require('../../kiro-native-host/native-installation-source.cjs')

const execFile = promisify(execFileCallback)
const RUNTIME_MANIFEST = 'runtime/manifest.json'
const RUNTIME_SOURCE = 'KIRO_IDE_1.0.437_AGENT_1.0.794_MACOS_ARM64'
const NODE_VERSION = '24.19.0'
const NODE_EXECUTABLE = '/opt/homebrew/opt/node@24/bin/node'
const VSCODE_VERSION = '1.109.5'
const AGENT_EXTENSION_VERSION = '1.0.794'
const PROMPTS = Object.freeze({
  DISCOVERY: 'agent-prompts/discovery.md',
  BUILDER: 'agent-prompts/builder.md',
  HELPER: 'agent-prompts/helper.md',
  EVIDENCE_ANALYST: 'agent-prompts/evidence-analyst.md',
})

function gate(code, cause) {
  const error = Object.assign(new Error(code), { code })
  if (cause !== undefined) error.cause = cause
  return error
}

function inside(root, target) {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
}

function parseManifest(text) {
  let value
  try { value = JSON.parse(text) }
  catch { throw gate('NATIVE_RUNTIME_MANIFEST_INVALID') }
  const requiredAssets = ['bridge', ...Object.keys(PROMPTS)]
  if (!value || value.schemaVersion !== 1 || value.runtimeSource !== RUNTIME_SOURCE ||
      value.platform !== 'darwin' || value.arch !== 'arm64' ||
      value.vscodeVersion !== VSCODE_VERSION ||
      value.kiroIdeVersion !== '1.0.437' ||
      value.agentExtensionVersion !== AGENT_EXTENSION_VERSION ||
      value.nodeVersion !== NODE_VERSION || value.nodeExecutable !== NODE_EXECUTABLE ||
      !value.promptVersions ||
      Object.keys(value.promptVersions).sort().join(',') !== Object.keys(PROMPTS).sort().join(',') ||
      Object.values(value.promptVersions).some(version =>
        typeof version !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) ||
      !value.assets || Object.keys(value.assets).sort().join(',') !== requiredAssets.sort().join(','))
    throw gate('NATIVE_RUNTIME_SOURCE_UNSUPPORTED')
  for (const name of requiredAssets) {
    const asset = value.assets[name]
    if (!asset || typeof asset.path !== 'string' ||
        !/^[A-Za-z0-9._/-]{1,160}$/.test(asset.path) || asset.path.includes('..') ||
        typeof asset.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(asset.sha256))
      throw gate('NATIVE_RUNTIME_MANIFEST_INVALID')
  }
  return value
}

async function verifiedFile(root, asset) {
  const candidate = resolve(root, asset.path)
  if (!inside(root, candidate)) throw gate('NATIVE_RUNTIME_ASSET_ESCAPED')
  const info = await lstat(candidate).catch(() => null)
  if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
      info.size < 1 || info.size > 8 * 1024 * 1024)
    throw gate('NATIVE_RUNTIME_ASSET_UNSAFE')
  const canonical = await realpath(candidate)
  if (!inside(root, canonical)) throw gate('NATIVE_RUNTIME_ASSET_ESCAPED')
  const content = await readFile(canonical)
  if (createHash('sha256').update(content).digest('hex') !== asset.sha256)
    throw gate('NATIVE_RUNTIME_ASSET_HASH_MISMATCH')
  return { path: canonical, content }
}

async function verifyNodeRuntime(path, run = execFile, checkAccess = access) {
  if (path !== NODE_EXECUTABLE || !isAbsolute(path))
    throw gate('NATIVE_NODE_SOURCE_UNSUPPORTED')
  await checkAccess(path, constants.X_OK).catch(() => { throw gate('NATIVE_NODE_UNAVAILABLE') })
  let result
  try { result = await run(path, ['--version'], { timeout: 5_000, windowsHide: true }) }
  catch (error) { throw gate('NATIVE_NODE_VERSION_UNCONFIRMED', error) }
  if (String(result?.stdout ?? '').trim() !== `v${NODE_VERSION}` ||
      String(result?.stderr ?? '').trim() !== '')
    throw gate('NATIVE_NODE_VERSION_UNCONFIRMED')
}

async function resolvePackagedNativeRuntime(options) {
  const extensionRoot = await realpath(options.extensionPath)
  const manifestPath = resolve(extensionRoot, RUNTIME_MANIFEST)
  if (!inside(extensionRoot, manifestPath)) throw gate('NATIVE_RUNTIME_MANIFEST_ESCAPED')
  const manifestInfo = await lstat(manifestPath).catch(() => null)
  if (!manifestInfo?.isFile() || manifestInfo.isSymbolicLink() || manifestInfo.nlink !== 1 ||
      manifestInfo.size < 1 || manifestInfo.size > 64 * 1024)
    throw gate('NATIVE_RUNTIME_MANIFEST_UNSAFE')
  const manifest = parseManifest(await readFile(manifestPath, 'utf8'))
  if (options.runtimeSource !== manifest.runtimeSource ||
      options.nodeExecutable !== manifest.nodeExecutable)
    throw gate('NATIVE_RUNTIME_CONFIGURATION_UNSUPPORTED')
  if (options.platform !== manifest.platform || options.arch !== manifest.arch ||
      options.vscodeVersion !== manifest.vscodeVersion)
    throw gate('NATIVE_RUNTIME_HOST_UNSUPPORTED')
  let installedSource
  try {
    installedSource = (options.attestKiroInstallation ??
      attestPinnedKiroInstallation)(options.vscode)
  }
  catch (error) { throw gate('NATIVE_RUNTIME_AGENT_SOURCE_UNSUPPORTED', error) }
  if (installedSource.agentExtensionVersion !== manifest.agentExtensionVersion)
    throw gate('NATIVE_RUNTIME_AGENT_SOURCE_UNSUPPORTED')
  await verifyNodeRuntime(manifest.nodeExecutable, options.execFile ?? execFile, options.access ?? access)
  const runtimeRoot = await realpath(join(extensionRoot, 'runtime'))
  if (!inside(extensionRoot, runtimeRoot)) throw gate('NATIVE_RUNTIME_ROOT_ESCAPED')
  const bridge = await verifiedFile(runtimeRoot, manifest.assets.bridge)
  const prompts = {}
  for (const role of Object.keys(PROMPTS)) {
    prompts[role] = await verifiedFile(runtimeRoot, manifest.assets[role])
    if (!prompts[role].content.toString('utf8')
      .includes(`> Prompt version: \`${manifest.promptVersions[role]}\``))
      throw gate('NATIVE_RUNTIME_PROMPT_VERSION_MISMATCH')
  }
  return Object.freeze({
    source: manifest.runtimeSource,
    nodePath: manifest.nodeExecutable,
    nodeVersion: manifest.nodeVersion,
    bridgeScriptPath: bridge.path,
    prompts: Object.freeze(Object.fromEntries(Object.entries(prompts)
      .map(([role, asset]) => [role, Object.freeze({
        path: asset.path,
        text: asset.content.toString('utf8'),
      })]))),
  })
}

function createRetryableRuntimeResolver(resolveRuntime) {
  let current
  return () => {
    if (!current) {
      const attempt = Promise.resolve().then(resolveRuntime)
      current = attempt
      // A failed background startup check must not poison every later explicit
      // panel command. Clear only that failed attempt; never schedule a retry.
      void attempt.catch(() => { if (current === attempt) current = undefined })
    }
    return current
  }
}

async function materializePackagedRoleRuntime(runtime, job, binding) {
  if (!runtime || !job || job.protectedBuiltin || !job.bindingFile) return
  if (!Object.hasOwn(runtime.prompts, job.role) ||
      typeof job.workspace !== 'string' || typeof job.roleName !== 'string' ||
      !/^vibe-native-[a-z-]+-[0-9a-f]{8}$/.test(job.roleName))
    throw gate('NATIVE_PACKAGED_ROLE_SCOPE_INVALID')
  const workspace = await realpath(job.workspace)
  const bindingFile = await realpath(job.bindingFile)
  if (binding?.workspace !== workspace || bindingFile !== resolve(job.bindingFile))
    throw gate('NATIVE_PACKAGED_ROLE_BINDING_MISMATCH')
  const agentsPath = resolve(workspace, '.kiro', 'agents')
  const configPath = resolve(agentsPath, `${job.roleName}.json`)
  if (!inside(workspace, configPath)) throw gate('NATIVE_PACKAGED_ROLE_CONFIG_ESCAPED')
  const canonicalAgents = await realpath(agentsPath).catch(() => null)
  const canonicalConfig = await realpath(configPath).catch(() => null)
  // The leaf O_NOFOLLOW check is insufficient when `.kiro` or `agents` is a
  // symlink. Require the complete existing path to be the exact canonical path
  // below this canonical workspace before inspecting or truncating anything.
  if (canonicalAgents !== agentsPath || canonicalConfig !== configPath ||
      !inside(workspace, canonicalConfig))
    throw gate('NATIVE_PACKAGED_ROLE_CONFIG_ESCAPED')
  const info = await lstat(configPath).catch(() => null)
  if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 512 * 1024 ||
      (process.platform !== 'win32' && (info.mode & 0o077) !== 0))
    throw gate('NATIVE_PACKAGED_ROLE_CONFIG_UNSAFE')
  let config
  try { config = JSON.parse(await readFile(canonicalConfig, 'utf8')) }
  catch { throw gate('NATIVE_PACKAGED_ROLE_CONFIG_INVALID') }
  const server = config?.mcpServers?.['vibe-native-core']
  if (runtime.windowsProduct) {
    const descriptor = runtime.runtimeDescriptor
    if (config.name !== job.roleName || config.prompt !== runtime.prompts[job.role].text ||
        Object.keys(config.mcpServers ?? {}).join(',') !== 'vibe-native-core' ||
        server?.command !== descriptor.executable ||
        JSON.stringify(server?.args) !== JSON.stringify([...descriptor.args, runtime.bridgeScriptPath, bindingFile, workspace]) ||
        JSON.stringify(server?.env ?? {}) !== JSON.stringify(descriptor.env))
      throw gate('NATIVE_PACKAGED_ROLE_CONFIG_INVALID')
    return // Core already wrote the verified portable command; never mutate an active role file.
  }
  if (config.name !== job.roleName || config.prompt !== runtime.prompts[job.role].text ||
      Object.keys(config.mcpServers ?? {}).join(',') !== 'vibe-native-core' ||
      typeof server?.command !== 'string' ||
      !Array.isArray(server.args) || server.args.length !== 3 ||
      server.args[1] !== bindingFile || server.args[2] !== workspace ||
      Object.keys(server.env ?? {}).some(name => name !== 'VIBE_NATIVE_BRIDGE_RECEIPT_FILE'))
    throw gate('NATIVE_PACKAGED_ROLE_CONFIG_INVALID')
  const next = {
    ...config,
    prompt: runtime.prompts[job.role].text,
    mcpServers: { 'vibe-native-core': {
      ...server,
      command: runtime.nodePath,
      args: [runtime.bridgeScriptPath, bindingFile, workspace],
    } },
  }
  let handle
  try {
    handle = await open(canonicalConfig, constants.O_RDWR | constants.O_NOFOLLOW)
    const opened = await handle.stat()
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== info.dev || opened.ino !== info.ino ||
        (process.platform !== 'win32' && (opened.mode & 0o077) !== 0))
      throw gate('NATIVE_PACKAGED_ROLE_CONFIG_UNSAFE')
    await handle.truncate(0)
    await handle.writeFile(`${JSON.stringify(next)}\n`)
    await handle.chmod(0o600)
  } finally { await handle?.close() }
}

module.exports = {
  AGENT_EXTENSION_VERSION,
  NODE_EXECUTABLE,
  NODE_VERSION,
  PROMPTS,
  RUNTIME_SOURCE,
  VSCODE_VERSION,
  createRetryableRuntimeResolver,
  materializePackagedRoleRuntime,
  parseManifest,
  resolvePackagedNativeRuntime,
  verifyNodeRuntime,
}
