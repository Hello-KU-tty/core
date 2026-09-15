// Prepare token-free profiles for one UI-triggered stock invoke_sub_agent probe.
// This module does not launch a Kiro session or call a model.
const { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } = require('node:fs')
const { join, dirname, basename } = require('node:path')
const { randomBytes } = require('node:crypto')
const { D_WORKSPACE_NAME, probeServerScript, waitForProbeServers } =
  require('./single-host-subagent-probe.cjs')

const AGENTS = Object.freeze({ parent: 'vibe-single-invoke-parent',
  a: 'vibe-single-invoke-a', b: 'vibe-single-invoke-b' })
const SERVERS = Object.freeze({ a: 'vibe-single-invoke-probe-a',
  b: 'vibe-single-invoke-probe-b' })
const NODE = '/opt/homebrew/opt/node@24/bin/node'
const SERVER_SCRIPT = probeServerScript(__dirname)
const MARKER_NAME = /^single-host-invoke-probe-[0-9a-f]{16}$/
const APPROVED_WORKSPACE = join('/Users/hurdoo/Library/Application Support/VibeHelper',
  'NativeExperiment-20260913', 'runtime', 'workspaces', 'projects', D_WORKSPACE_NAME)

function assertPrivateDirectory(path) {
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
      stat.uid !== process.getuid() || realpathSync(path) !== path)
    throw new Error('SINGLE_HOST_INVOKE_DIRECTORY_UNSAFE')
}

function assertWorkspace(workspace) {
  const canonical = realpathSync(workspace)
  if (canonical !== workspace || canonical !== APPROVED_WORKSPACE ||
      basename(canonical) !== D_WORKSPACE_NAME || basename(dirname(canonical)) !== 'projects')
    throw new Error('SINGLE_HOST_INVOKE_WORKSPACE_INVALID')
  return canonical
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
    name, description: 'Inert stock single-host invoke concurrency capability probe',
    prompt: name === AGENTS.parent
      ? 'In one response issue two separate invoke_sub_agent calls for '
        + 'vibe-single-invoke-a and vibe-single-invoke-b. Each must call its own meet '
        + 'tool. Never read files, use shell, call MCP directly, ask user_input, or '
        + 'supply contextFiles. If invoke_sub_agent is unavailable, reply exactly '
        + 'INVOKE_TOOL_UNAVAILABLE and stop.'
      : `Call only @${SERVERS[name === AGENTS.a ? 'a' : 'b']}/meet once. `
        + 'Then call subagent_response with a short completion and files omitted. '
        + 'Do not read files, use shell, ask user_input, or call the other probe tool.',
    tools, mcpServers, includeMcpJson: false, includePowers: false, resources: [],
    permissions: { rules },
  })
  return {
    [AGENTS.parent]: base(AGENTS.parent, ['invoke_sub_agent'], {
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
  const canonical = assertWorkspace(workspace)
  const kiroDirectory = join(canonical, '.kiro')
  const agentsDirectory = join(kiroDirectory, 'agents')
  assertPrivateDirectory(kiroDirectory)
  assertPrivateDirectory(agentsDirectory)
  const markerDirectory = join(kiroDirectory,
    `single-host-invoke-probe-${randomBytes(8).toString('hex')}`)
  mkdirSync(markerDirectory, { mode: 0o700 })
  assertPrivateDirectory(markerDirectory)
  const configs = probeConfigs(canonical, markerDirectory)
  for (const [name, config] of Object.entries(configs))
    writeFileSync(join(agentsDirectory, `${name}.json`),
      `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  return { workspace: canonical, markerDirectory, roles: AGENTS }
}

function verifyProbe(workspace) {
  const canonical = assertWorkspace(workspace)
  const parentPath = join(canonical, '.kiro', 'agents', `${AGENTS.parent}.json`)
  const parent = JSON.parse(readFileSync(parentPath, 'utf8'))
  const serverA = parent.mcpServers?.[SERVERS.a]
  const serverB = parent.mcpServers?.[SERVERS.b]
  if (serverA?.command !== NODE || serverB?.command !== NODE ||
      serverA.args?.[0] !== SERVER_SCRIPT || serverB.args?.[0] !== SERVER_SCRIPT ||
      serverA.args?.[1] !== canonical || serverB.args?.[1] !== canonical ||
      serverA.args?.[2] !== serverB.args?.[2] ||
      serverA.args?.[3] !== 'a' || serverB.args?.[3] !== 'b')
    throw new Error('SINGLE_HOST_INVOKE_SERVER_INVALID')
  const markerDirectory = serverA.args[2]
  if (dirname(markerDirectory) !== join(canonical, '.kiro') ||
      !MARKER_NAME.test(basename(markerDirectory)))
    throw new Error('SINGLE_HOST_INVOKE_MARKER_INVALID')
  assertPrivateDirectory(markerDirectory)
  const expected = probeConfigs(canonical, markerDirectory)
  for (const [name, config] of Object.entries(expected)) {
    const path = join(canonical, '.kiro', 'agents', `${name}.json`)
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid() ||
        JSON.stringify(JSON.parse(readFileSync(path, 'utf8'))) !== JSON.stringify(config))
      throw new Error('SINGLE_HOST_INVOKE_PROFILE_UNVERIFIED')
  }
  return { workspace: canonical, markerDirectory, roles: AGENTS }
}

module.exports = { AGENTS, SERVERS, APPROVED_WORKSPACE, probeConfigs, prepareProbe, verifyProbe,
  waitForProbeServers }
