const { realpath } = require('node:fs/promises')
const { dirname, join, relative, isAbsolute, sep } = require('node:path')

// Scope tools to the generated workspace, including shell integration after rc files.
async function prepareMacProjectTerminal(vscode, context, ready, api) {
  if (process.platform !== 'darwin' || !vscode.workspace.isTrusted)
    throw new Error('MAC_PROJECT_ENVIRONMENT_UNAVAILABLE')
  const root = join(dirname(ready.connectionFile), 'workspaces')
  const folders = vscode.workspace.workspaceFolders
  const collection = context.environmentVariableCollection
  if (!collection?.getScoped) throw new Error('MAC_PROJECT_ENVIRONMENT_UNAVAILABLE')
  collection.persistent = false
  collection.clear()
  // Discovery may start in any trusted folder. Only generated folders receive tools.
  if (folders?.length !== 1) return
  const workspace = folders[0].uri.fsPath
  const part = relative(root, workspace)
  if (part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) return
  if (await realpath(root) !== root || await realpath(workspace) !== workspace)
    throw new Error('MAC_PROJECT_WORKSPACE_UNSAFE')
  const toolchain = await api.selectProjectToolchain({
    resources: ready.resources, privateRoot: join(dirname(ready.connectionFile), 'project-tools'),
    nodeExecutables: [], pnpmExecutables: [],
  })
  const scoped = collection.getScoped({ workspaceFolder: folders[0] })
  for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'ELECTRON_RUN_AS_NODE'])
    scoped.replace(name, '', { applyAtProcessCreation: true, applyAtShellIntegration: true })
  for (const [name, value] of Object.entries(api.projectEnvironment(toolchain, {})))
    scoped.replace(name, value, { applyAtProcessCreation: true, applyAtShellIntegration: true })
  scoped.description = 'Vibe Helper: generated project Node and pnpm.'
}
module.exports = { prepareMacProjectTerminal }
