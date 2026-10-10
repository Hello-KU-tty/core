const { realpath } = require('node:fs/promises')
const { delimiter, dirname, join, relative, isAbsolute, sep } = require('node:path')

const SCOPED = { applyAtProcessCreation: true, applyAtShellIntegration: true }

// Scope the packaged Node and pnpm to the generated Project folder's new terminals (Kiro chat runs
// its shell commands there), including shell integration after rc files. macOS gets a curated PATH;
// Windows keeps the learner's PATH after the packaged tools so Git and other installed tools stay.
async function prepareProjectTerminal(vscode, context, ready, api) {
  if (!['darwin', 'win32'].includes(process.platform) || !vscode.workspace.isTrusted)
    throw new Error('PROJECT_ENVIRONMENT_UNAVAILABLE')
  const windows = process.platform === 'win32'
  const root = join(dirname(ready.connectionFile), 'workspaces')
  const folders = vscode.workspace.workspaceFolders
  const collection = context.environmentVariableCollection
  if (!collection?.getScoped) throw new Error('PROJECT_ENVIRONMENT_UNAVAILABLE')
  collection.persistent = false
  collection.clear()
  // Discovery may start in any trusted folder. Only generated folders receive tools.
  if (folders?.length !== 1) return
  const workspace = folders[0].uri.fsPath
  const part = relative(root, workspace)
  if (part === '' || part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part)) return
  // Windows paths compare without case (the folder URI may lower-case the drive letter).
  const same = (left, right) => windows ? left.toLowerCase() === right.toLowerCase() : left === right
  if (!same(await realpath(root), root) || !same(await realpath(workspace), workspace))
    throw new Error('PROJECT_WORKSPACE_UNSAFE')
  const toolchain = await api.selectProjectToolchain({
    resources: ready.resources, privateRoot: join(dirname(ready.connectionFile), 'project-tools'),
    nodeExecutables: [], pnpmExecutables: [],
  })
  const scoped = collection.getScoped({ workspaceFolder: folders[0] })
  for (const name of ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'ELECTRON_RUN_AS_NODE'])
    scoped.replace(name, '', SCOPED)
  for (const [name, value] of Object.entries(api.projectEnvironment(toolchain, {}))) {
    if (windows && name === 'PATH') scoped.prepend(name, `${value}${delimiter}`, SCOPED)
    else scoped.replace(name, value, SCOPED)
  }
  // PowerShell terminals on Windows may run the npm and pnpm script shims.
  if (windows) scoped.replace('PSExecutionPolicyPreference', 'RemoteSigned', SCOPED)
  scoped.description = 'Vibe Helper: generated project Node and pnpm.'
}
module.exports = { prepareProjectTerminal }
