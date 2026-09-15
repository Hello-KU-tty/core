import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROMPTS = {
  DISCOVERY: ['discovery.md', '1.3.4'],
  BUILDER: ['builder.md', '1.3.6'],
  HELPER: ['helper.md', '1.2.0'],
}
const ROLE_TOOLS = {
  DISCOVERY: [
    'get_discovery_context',
    'submit_candidate_previews',
    'submit_candidate_enrichments',
    'submit_candidate_round',
    'submit_candidate_merge',
    'submit_learning_spec',
  ],
  BUILDER: [
    'get_builder_task',
    'start_task',
    'update_build_context',
    'request_user_decision',
    'get_decision_result',
    'apply_decision_result',
    'complete_task',
  ],
  HELPER: ['get_helper_context'],
}

/** Synthetic native role configuration; credentials stay in one 0600 generated workspace file. */
export async function prepareNativeAgent({
  workspace,
  bindingFile,
  transport = 'http',
  bridgeReceiptFile,
  syntheticSrcWrite = false,
  replaceRetired = false,
}) {
  const canonical = await realpath(workspace)
  const binding = JSON.parse(await readFile(bindingFile, 'utf8'))
  if (
    !Object.hasOwn(PROMPTS, binding.role) ||
    !Array.isArray(binding.toolNames) ||
    binding.toolNames.length === 0 ||
    typeof binding.url !== 'string' ||
    typeof binding.authorization !== 'string' ||
    typeof binding.workspace !== 'string' ||
    binding.toolNames.some((name) => !ROLE_TOOLS[binding.role].includes(name))
  )
    throw new Error('NATIVE_BINDING_DESCRIPTOR_INVALID')
  if (canonical !== (await realpath(binding.workspace)))
    throw new Error('NATIVE_WORKSPACE_BINDING_MISMATCH')
  if (syntheticSrcWrite && (!canonical.startsWith('/private/tmp/') || binding.role !== 'BUILDER'))
    throw new Error('NATIVE_SYNTHETIC_WRITE_SCOPE_INVALID')
  const url = new URL(binding.url)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !/^\/mcp\/native-[0-9a-f-]{36}$/.test(url.pathname)
  )
    throw new Error('NATIVE_BINDING_URL_INVALID')
  const [filename, version] = PROMPTS[binding.role]
  const prompt = await readFile(join(repository, 'docs', 'agent-prompts', filename), 'utf8')
  if (!prompt.includes(`> Prompt version: \`${version}\``))
    throw new Error('NATIVE_PROMPT_VERSION_MISMATCH')
  const name = `vibe-native-${binding.role.toLowerCase()}`
  if (transport !== 'http' && transport !== 'stdio-bridge')
    throw new Error('NATIVE_AGENT_TRANSPORT_UNSUPPORTED')
  if (
    bridgeReceiptFile &&
    (transport !== 'stdio-bridge' || !bridgeReceiptFile.startsWith('/private/tmp/'))
  )
    throw new Error('NATIVE_BRIDGE_RECEIPT_INVALID')
  const server =
    transport === 'http'
      ? { url: binding.url, headers: { Authorization: binding.authorization }, timeout: 60000 }
      : {
          command: '/opt/homebrew/opt/node@24/bin/node',
          args: [join(repository, 'scripts/native-core-stdio-bridge.mjs'), bindingFile, canonical],
          ...(bridgeReceiptFile
            ? { env: { VIBE_NATIVE_BRIDGE_RECEIPT_FILE: bridgeReceiptFile } }
            : {}),
        }
  const config = {
    name,
    description: `Experimental ${binding.role} with a run-bound local Core`,
    prompt,
    includeMcpJson: false,
    includePowers: false,
    resources: [],
    tools: [
      ...(syntheticSrcWrite ? ['read', 'write'] : []),
      ...binding.toolNames.map((tool) => `@vibe-native-core/${tool}`),
    ],
    mcpServers: { 'vibe-native-core': server },
    // File and shell execution remain disabled until IDE-native containment is measured.
    permissions: {
      rules: [
        ...binding.toolNames.map((tool) => ({
          capability: 'mcp',
          match: [`vibe-native-core/${tool}`],
          effect: 'allow',
        })),
        ...(syntheticSrcWrite
          ? [
              {
                capability: 'fs_read',
                match: ['.kiro/**', `${canonical}/.kiro/**`],
                effect: 'deny',
              },
              { capability: 'fs_read', match: ['src/**', `${canonical}/src/**`], effect: 'allow' },
              { capability: 'fs_write', match: ['src/**', `${canonical}/src/**`], effect: 'allow' },
            ]
          : [{ capability: 'fs_write', effect: 'deny' }]),
        { capability: 'shell', effect: 'deny' },
      ],
    },
  }
  const directory = join(canonical, '.kiro', 'agents')
  for (const candidate of [join(canonical, '.kiro'), directory]) {
    const info = await lstat(candidate).catch((error) => {
      if (error?.code === 'ENOENT') return null
      throw error
    })
    if (info?.isSymbolicLink()) throw new Error('NATIVE_AGENT_CONFIG_SYMLINK_DENIED')
  }
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if ((await realpath(directory)) !== directory) throw new Error('NATIVE_AGENT_CONFIG_PATH_ESCAPED')
  const path = join(directory, `${name}.json`)
  if (replaceRetired) {
    const previous = await lstat(path)
    if (
      !previous.isFile() ||
      previous.isSymbolicLink() ||
      previous.nlink !== 1 ||
      (previous.mode & 0o777) !== 0o600
    )
      throw new Error('NATIVE_RETIRED_CONFIG_UNSAFE')
    const retired = JSON.parse(await readFile(path, 'utf8'))
    if (
      retired.name !== name ||
      retired.prompt !== 'Synthetic run ended.' ||
      !Array.isArray(retired.tools) ||
      retired.tools.length !== 0 ||
      Object.keys(retired.mcpServers ?? {}).length !== 0
    )
      throw new Error('NATIVE_RETIRED_CONFIG_MISMATCH')
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  } else {
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
  }
  return { name, path, toolNames: binding.toolNames }
}
