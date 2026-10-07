// Development installer for the Kiro-native path: writes Vibe Helper steering, hooks and MCP
// settings into one Core-managed generated workspace. Existing non-Vibe-Helper files are kept.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  KIRO_HELPER_STEERING_FILE,
  KIRO_HOOK_FILE,
  KIRO_LEARNER_STEERING_FILE,
  KIRO_MCP_CONFIG_FILE,
  LEARNER_PROFILE_FILE,
  mergeKiroMcpConfig,
  renderHelperSteering,
  renderKiroHooksConfig,
  renderKiroMcpServerEntry,
  renderLearnerSteering,
} from '../packages/kiro-adapter/dist/kiro-workspace-node.js'

const [workspaceArg, bindingDescriptorArg, hookDescriptorArg, profileArg] = process.argv.slice(2)
if (!workspaceArg || !bindingDescriptorArg || !hookDescriptorArg)
  throw new Error(
    'usage: kiro-workspace-install.mjs <workspace> <native-mcp.json> <kiro-hook.json> [profile.md]',
  )
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = resolve(workspaceArg)
const binding = JSON.parse(await readFile(bindingDescriptorArg, 'utf8'))
if (binding.role !== 'BUILDER' || resolve(binding.workspace) !== workspace)
  throw new Error('KIRO_INSTALL_BINDING_MISMATCH')

const write = async (relative, content) => {
  const target = join(workspace, relative)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
}
const node = process.execPath
await write(
  KIRO_LEARNER_STEERING_FILE,
  renderLearnerSteering({
    projectId: binding.projectId,
    taskId: binding.taskId,
    correlationId: binding.correlationId,
  }),
)
await write(KIRO_HELPER_STEERING_FILE, renderHelperSteering())
await write(
  KIRO_HOOK_FILE,
  `${JSON.stringify(
    renderKiroHooksConfig({
      nodeExecutable: node,
      hookScript: join(repository, 'scripts/kiro-hook.mjs'),
      hookDescriptor: resolve(hookDescriptorArg),
    }),
    null,
    2,
  )}\n`,
)
const mcpPath = join(workspace, KIRO_MCP_CONFIG_FILE)
const existing = await readFile(mcpPath, 'utf8').catch((error) => {
  if (error?.code === 'ENOENT') return null
  throw error
})
await write(
  KIRO_MCP_CONFIG_FILE,
  mergeKiroMcpConfig(
    existing,
    renderKiroMcpServerEntry({
      nodeExecutable: node,
      bridgeScript: join(repository, 'scripts/native-core-stdio-bridge.mjs'),
      bindingDescriptor: resolve(bindingDescriptorArg),
      workspace,
    }),
  ),
)
await write(
  LEARNER_PROFILE_FILE,
  profileArg
    ? await readFile(profileArg, 'utf8')
    : '# 학습자 개념 상태 (Vibe Helper)\n\n아직 확인된 개념이 없다. 처음 나오는 개념은 쉬운 말로 설명한다.\n',
)
await write('.vibe-helper/.gitignore', '*\n')
process.stdout.write(`${JSON.stringify({ status: 'INSTALLED', workspace })}\n`)
