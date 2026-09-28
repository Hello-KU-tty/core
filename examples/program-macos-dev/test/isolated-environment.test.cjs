const assert = require('node:assert/strict')
const { test } = require('node:test')
const { mkdtemp, mkdir, chmod, symlink } = require('node:fs/promises')
const { join } = require('node:path')
const { isolatedCoreRoot, configureWorkspaceEnvironment, PINNED_PATH } = require('../isolated-environment.cjs')

async function setup() {
  const root = await mkdtemp('/private/tmp/vibe-helper-macos-core-')
  const workspace = join(root, 'workspaces', 'projects', 'synthetic')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  const folder = { uri: { fsPath: workspace } }
  const calls = []
  const scoped = { replace: (...args) => calls.push(args) }
  const collection = { persistent: true, clear: () => calls.push('clear'),
    getScoped: scope => { assert.equal(scope.workspaceFolder, folder); return scoped } }
  return { root, workspace, folder, calls, scoped, collection,
    vscode: { workspace: { isTrusted: true, workspaceFolders: [folder] } },
    context: { environmentVariableCollection: collection } }
}

test('isolated development root is canonical, private, owned and outside the repository', async () => {
  const h = await setup()
  assert.equal(await isolatedCoreRoot(h.root), h.root)
  for (const root of ['.', '/private/tmp', `${h.root}/nested`, '/Users/example/project', null])
    await assert.rejects(isolatedCoreRoot(root), /MAC_DEVELOPMENT_ISOLATION_REQUIRED/)
})

test('non-private root and symlink aliases fail closed', async () => {
  const h = await setup()
  await chmod(h.root, 0o755)
  await assert.rejects(isolatedCoreRoot(h.root), /MAC_DEVELOPMENT_ISOLATION_REQUIRED/)
  await chmod(h.root, 0o700)
  const alias = `${h.root}Alias`
  await symlink(h.root, alias)
  await assert.rejects(isolatedCoreRoot(alias), /MAC_DEVELOPMENT_ISOLATION_REQUIRED/)
})

test('PATH mutation is folder-scoped and nonpersistent, not a global setting', async () => {
  const h = await setup()
  await configureWorkspaceEnvironment(h.vscode, h.context, h.root)
  assert.equal(h.collection.persistent, false)
  assert.deepEqual(h.calls, ['clear', ['PATH', PINNED_PATH, {
    applyAtProcessCreation: true, applyAtShellIntegration: true,
  }]])
})

for (const kind of ['untrusted', 'multi-root', 'outside', 'symlink'])
  test(`does not mutate terminal environment for ${kind} workspace`, async () => {
    const h = await setup()
    if (kind === 'untrusted') h.vscode.workspace.isTrusted = false
    if (kind === 'multi-root') h.vscode.workspace.workspaceFolders.push(h.folder)
    if (kind === 'outside') h.folder.uri.fsPath = h.root
    if (kind === 'symlink') {
      const alias = join(h.root, 'workspaces', 'alias')
      await symlink(h.workspace, alias)
      h.folder.uri.fsPath = alias
    }
    await assert.rejects(configureWorkspaceEnvironment(h.vscode, h.context, h.root), /MAC_DEVELOPMENT_ISOLATION_REQUIRED/)
    assert.deepEqual(h.calls, [])
  })
