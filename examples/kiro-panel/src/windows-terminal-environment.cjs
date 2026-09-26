const { lstat, realpath } = require('node:fs/promises')
const { basename, dirname, join } = require('node:path')

// VS Code applies this nonpersistent collection only to new terminals belonging
// to the owned generated Project folder. No profile, registry or parent env edit.
async function prepareWindowsProjectTerminal(vscode, context, connectionFile) {
  if (process.platform !== 'win32' || !vscode.workspace.isTrusted ||
      vscode.workspace.workspaceFolders?.length !== 1) return false
  const folder = vscode.workspace.workspaceFolders[0]
  const info = await lstat(folder.uri.fsPath)
  if (!info.isDirectory() || info.isSymbolicLink()) return false
  const workspace = await realpath(folder.uri.fsPath)
  const root = await realpath(join(dirname(connectionFile), 'workspaces'))
  if (dirname(dirname(workspace)).toLowerCase() !== root.toLowerCase() || basename(dirname(workspace)) !== 'projects' ||
      !/^project_[A-Za-z0-9_-]+$/.test(basename(workspace))) return false
  const expected = await lstat(join(root, 'projects', basename(workspace)), { bigint: true })
  const actual = await lstat(workspace, { bigint: true })
  if (actual.ino === 0n || actual.ino !== expected.ino || actual.dev !== expected.dev ||
      expected.isSymbolicLink()) return false
  const collection = context.environmentVariableCollection
  collection.persistent = false
  const scoped = collection.getScoped({ workspaceFolder: folder })
  scoped.replace('PSExecutionPolicyPreference', 'RemoteSigned')
  context.subscriptions.push({ dispose: () => scoped.clear() })
  return true
}

module.exports = { prepareWindowsProjectTerminal }
