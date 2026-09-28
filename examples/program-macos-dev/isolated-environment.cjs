// Verification-only terminal environment. No account/profile/global setting is
// changed, and this is not a supported Mac product toolchain or an OS sandbox.
const { lstat, realpath } = require('node:fs/promises')
const { basename, dirname, join, relative, isAbsolute } = require('node:path')

const PINNED_PATH = '/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'
const fail = () => { throw new Error('MAC_DEVELOPMENT_ISOLATION_REQUIRED') }

async function isolatedCoreRoot(root) {
  if (typeof root !== 'string' || !isAbsolute(root) ||
      dirname(root) !== '/private/tmp' ||
      !/^vibe-helper-macos-core-[A-Za-z0-9]+$/.test(basename(root))) fail()
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(root) !== root ||
      info.uid !== process.getuid() || (info.mode & 0o077) !== 0) fail()
  // Do not read inherited package configuration or follow even dangling links.
  for (const parent of ['/private/tmp', '/private', '/'])
    for (const name of ['pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs', '.pnpmfile.mjs']) {
      const entry = await lstat(join(parent, name)).catch(error => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (entry) fail()
    }
  return root
}

async function configureWorkspaceEnvironment(vscode, context, root) {
  await isolatedCoreRoot(root)
  const folders = vscode.workspace.workspaceFolders
  if (!vscode.workspace.isTrusted || folders?.length !== 1) fail()
  const folder = folders[0]
  const workspace = folder.uri.fsPath
  const allowed = join(root, 'workspaces')
  const scope = relative(allowed, workspace)
  if (await realpath(allowed) !== allowed || await realpath(workspace) !== workspace ||
      scope === '..' || scope.startsWith('../') || isAbsolute(scope)) fail()
  const collection = context.environmentVariableCollection
  if (!collection || typeof collection.getScoped !== 'function') fail()
  // Changes belong only to this development extension and this one folder.
  // Non-persistence prevents stale terminal mutations after the host is removed.
  collection.persistent = false
  collection.clear()
  const scoped = collection.getScoped({ workspaceFolder: folder })
  scoped.replace('PATH', PINNED_PATH, {
    applyAtProcessCreation: true, applyAtShellIntegration: true,
  })
  scoped.description = 'Mac verification only: Node 24.19.0 / pnpm 11.13.1. New terminals required.'
}

module.exports = { isolatedCoreRoot, configureWorkspaceEnvironment, PINNED_PATH }
