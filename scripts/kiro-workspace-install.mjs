// Development installer for the Kiro-native path when Core runs with startup binding flags
// (`--native-role BUILDER … --kiro-hooks`). The product path uses POST /api/kiro/bind instead.
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  installKiroWorkspace,
  learnerScopeFrom,
} from '../packages/kiro-adapter/dist/kiro-workspace-node.js'

const [workspaceArg, bindingDescriptorArg, hookDescriptorArg] = process.argv.slice(2)
if (!workspaceArg || !bindingDescriptorArg || !hookDescriptorArg)
  throw new Error(
    'usage: kiro-workspace-install.mjs <workspace> <native-mcp.json> <kiro-hook.json>',
  )
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = resolve(workspaceArg)
const binding = JSON.parse(await readFile(bindingDescriptorArg, 'utf8'))
if (binding.role !== 'BUILDER' || resolve(binding.workspace) !== workspace)
  throw new Error('KIRO_INSTALL_BINDING_MISMATCH')
const connection = JSON.parse(
  await readFile(join(dirname(resolve(bindingDescriptorArg)), 'connection.json'), 'utf8'),
)
const restored = await fetch(new URL('/api/application', connection.baseUrl), {
  method: 'POST',
  headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    protocolVersion: 1,
    request: {
      schemaVersion: 1,
      kind: 'UI_RESTORE_PROJECT_SESSION',
      correlationId: binding.correlationId,
      actor: { kind: 'UI' },
      projectId: binding.projectId,
      helperConversationLimit: 1,
    },
  }),
}).then((response) => response.json())
if (!restored.success)
  throw new Error(`KIRO_SPEC_SOURCE_UNAVAILABLE ${JSON.stringify(restored.error)}`)
const { project, learningSpec, currentTask } = restored.data
const confirmed = learningSpec?.status === 'CONFIRMED' && currentTask
const installed = await installKiroWorkspace({
  workspace,
  binding: {
    projectId: binding.projectId,
    taskId: binding.taskId,
    correlationId: binding.correlationId,
  },
  nodeExecutable: process.execPath,
  hookScript: join(repository, 'scripts/kiro-hook.mjs'),
  hookDescriptor: resolve(hookDescriptorArg),
  bridgeScript: join(repository, 'scripts/native-core-stdio-bridge.mjs'),
  bindingDescriptor: resolve(bindingDescriptorArg),
  ...(confirmed
    ? {
        learnerScope: learnerScopeFrom(learningSpec),
        spec: { project, learningSpec, task: currentTask },
      }
    : {}),
})
process.stdout.write(
  `${JSON.stringify({ status: 'INSTALLED', workspace, spec: installed.spec })}\n`,
)
