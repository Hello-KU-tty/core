// Prepare inert, token-free Kiro profiles for one UI-triggered capability turn.
// This module never starts an Agent or a model request.
const { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync,
  writeFileSync } = require('node:fs')
const { join, resolve, dirname, basename } = require('node:path')
const { randomBytes } = require('node:crypto')
const { setTimeout: delay } = require('node:timers/promises')

const D_WORKSPACE_NAME = 'project_efc36445-7551-495f-bf4e-c66b82c871a8'
const AGENTS = Object.freeze({ parent: 'vibe-single-host-parent', a: 'vibe-single-host-a', b: 'vibe-single-host-b' })
const SERVERS = Object.freeze({ a: 'vibe-single-host-probe-a', b: 'vibe-single-host-probe-b' })
const NODE = '/opt/homebrew/opt/node@24/bin/node'
// The native helper is also bundled into examples/kiro-panel/dist/extension.cjs.
// Resolve only the two known source/bundle layouts; never trust a profile path.
function probeServerScript(baseDirectory) {
  const bundle = basename(baseDirectory) === 'dist'
  if (!bundle && basename(baseDirectory) !== 'kiro-native-host')
    throw new Error('SINGLE_HOST_PROBE_LAYOUT_UNVERIFIED')
  const script = bundle
    ? resolve(baseDirectory, '..', '..', '..', 'scripts', 'single-host-probe-mcp.mjs')
    : resolve(baseDirectory, '..', '..', 'scripts', 'single-host-probe-mcp.mjs')
  if (!existsSync(script) || realpathSync(script) !== script)
    throw new Error('SINGLE_HOST_PROBE_SERVER_SCRIPT_MISSING')
  return script
}
const SERVER_SCRIPT = probeServerScript(__dirname)

function assertPrivateDirectory(path) {
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
      stat.uid !== process.getuid() || realpathSync(path) !== path)
    throw new Error('SINGLE_HOST_PROBE_DIRECTORY_UNSAFE')
}

function probeConfigs(workspace, markerDirectory) {
  const server = side => ({ command: NODE,
    args: [SERVER_SCRIPT, workspace, markerDirectory, side] })
  const denyFilesystem = [
    { capability: 'fs_read', effect: 'deny' },
    { capability: 'fs_write', effect: 'deny' },
    { capability: 'shell', effect: 'deny' },
  ]
  const base = (name, tools, mcpServers, rules) => ({
    name, description: 'Inert single-host subagent concurrency capability probe',
    prompt: name === AGENTS.parent
      ? 'Use orchestrate_subagent once with two independent registered stages, '
        + 'vibe-single-host-a and vibe-single-host-b. Never read files, use shell, '
        + 'ask user_input, or call MCP directly. If the tool is unavailable, say DAG_TOOL_UNAVAILABLE and stop.'
      : `Use only your own @${SERVERS[name === AGENTS.a ? 'a' : 'b']}/meet tool once. `
        + 'Then call subagent_response with a short completion string and no files. '
        + 'Do not read files, use shell, ask user_input, or call the opposite probe tool.',
    tools, mcpServers, includeMcpJson: false, includePowers: false, resources: [],
    permissions: { rules },
  })
  return {
    [AGENTS.parent]: base(AGENTS.parent, ['orchestrate_subagent'], {
      [SERVERS.a]: server('a'), [SERVERS.b]: server('b'),
    }, denyFilesystem),
    [AGENTS.a]: base(AGENTS.a, [`@${SERVERS.a}/meet`], {}, [
      { capability: 'mcp', match: [`${SERVERS.a}/meet`], effect: 'allow' },
      { capability: 'mcp', match: [`${SERVERS.b}/meet`], effect: 'deny' },
      ...denyFilesystem,
    ]),
    [AGENTS.b]: base(AGENTS.b, [`@${SERVERS.b}/meet`], {}, [
      { capability: 'mcp', match: [`${SERVERS.b}/meet`], effect: 'allow' },
      { capability: 'mcp', match: [`${SERVERS.a}/meet`], effect: 'deny' },
      ...denyFilesystem,
    ]),
  }
}

function prepareProbe(workspace) {
  const canonical = realpathSync(workspace)
  if (canonical !== workspace || basename(canonical) !== D_WORKSPACE_NAME ||
      basename(dirname(canonical)) !== 'projects' ||
      !canonical.includes('/NativeExperiment-20260913/runtime/workspaces/projects/'))
    throw new Error('SINGLE_HOST_PROBE_WORKSPACE_INVALID')
  const kiroDirectory = join(canonical, '.kiro')
  const agentsDirectory = join(kiroDirectory, 'agents')
  assertPrivateDirectory(kiroDirectory)
  assertPrivateDirectory(agentsDirectory)
  const markerDirectory = join(kiroDirectory,
    `single-host-probe-${randomBytes(8).toString('hex')}`)
  mkdirSync(markerDirectory, { mode: 0o700 })
  assertPrivateDirectory(markerDirectory)
  const configs = probeConfigs(canonical, markerDirectory)
  for (const [name, config] of Object.entries(configs)) {
    const path = join(agentsDirectory, `${name}.json`)
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  }
  return { workspace: canonical, markerDirectory, roles: AGENTS }
}

function verifyProbe(workspace) {
  const canonical = realpathSync(workspace)
  const parentPath = join(canonical, '.kiro', 'agents', `${AGENTS.parent}.json`)
  const parent = JSON.parse(readFileSync(parentPath, 'utf8'))
  const serverA = parent.mcpServers?.[SERVERS.a]
  const serverB = parent.mcpServers?.[SERVERS.b]
  if (serverA?.command !== NODE || serverB?.command !== NODE ||
      serverA.args?.[0] !== SERVER_SCRIPT || serverB.args?.[0] !== SERVER_SCRIPT ||
      serverA.args?.[1] !== canonical || serverB.args?.[1] !== canonical ||
      serverA.args?.[2] !== serverB.args?.[2] ||
      serverA.args?.[3] !== 'a' || serverB.args?.[3] !== 'b')
    throw new Error('SINGLE_HOST_PROBE_SERVER_INVALID')
  const markerDirectory = serverA.args[2]
  if (dirname(markerDirectory) !== join(canonical, '.kiro') ||
      !/^single-host-probe-[0-9a-f]{16}$/.test(basename(markerDirectory)))
    throw new Error('SINGLE_HOST_PROBE_MARKER_INVALID')
  assertPrivateDirectory(markerDirectory)
  const expected = probeConfigs(canonical, markerDirectory)
  for (const [name, config] of Object.entries(expected)) {
    const path = join(canonical, '.kiro', 'agents', `${name}.json`)
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid() ||
        JSON.stringify(JSON.parse(readFileSync(path, 'utf8'))) !== JSON.stringify(config))
      throw new Error('SINGLE_HOST_PROBE_PROFILE_UNVERIFIED')
  }
  return { workspace: canonical, markerDirectory, roles: AGENTS }
}

async function waitForProbeServers(markerDirectory, deadlineMs = 15000) {
  const started = Date.now()
  while (Date.now() - started < deadlineMs) {
    const listed = ['a', 'b'].every(side => {
      try {
        const value = JSON.parse(readFileSync(join(markerDirectory,
          `${side}.listed.json`), 'utf8'))
        return value.side === side && Number.isSafeInteger(value.listedAt)
      } catch { return false }
    })
    if (listed) return
    await delay(100)
  }
  throw new Error('SINGLE_HOST_PROBE_MCP_NOT_READY')
}

module.exports = { AGENTS, SERVERS, D_WORKSPACE_NAME, probeServerScript, probeConfigs,
  prepareProbe, verifyProbe, waitForProbeServers }
