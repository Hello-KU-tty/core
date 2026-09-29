const assert = require('node:assert/strict')
const { mkdir, mkdtemp, realpath, symlink } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { test } = require('node:test')
const { prepareMacProjectTerminal } = require('../src/mac-terminal-environment.cjs')

test('Mac tool environment is limited to canonical trusted generated folders',
  { skip: process.platform !== 'darwin' }, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-mac-terminal-')))
    const workspace = join(root, 'workspaces', 'projects', 'project_test')
    await mkdir(workspace, { recursive: true })
    const calls = [], changes = []
    const folder = { uri: { fsPath: workspace } }
    const vscode = { workspace: { isTrusted: true, workspaceFolders: [folder] } }
    const collection = { persistent: true, clear() {}, getScoped(scope) {
      assert.equal(scope.workspaceFolder, folder)
      return { replace: (...args) => changes.push(args) }
    } }
    const ready = { connectionFile: join(root, 'connection.json'), resources: { root: '/product/portable' } }
    const api = { async selectProjectToolchain(options) { calls.push(options); return {} },
      projectEnvironment() { return { PATH: '/product/portable/bin:/private/tools/bin:/usr/bin' } } }
    await prepareMacProjectTerminal(vscode, { environmentVariableCollection: collection }, ready, api)
    assert.equal(collection.persistent, false)
    assert.deepEqual(calls[0].nodeExecutables, [])
    assert.deepEqual(calls[0].pnpmExecutables, [])
    assert.equal(changes.find(([key]) => key === 'NODE_OPTIONS')[1], '')
    assert.deepEqual(changes.find(([key]) => key === 'PATH')[2],
      { applyAtProcessCreation: true, applyAtShellIntegration: true })
    const initialCalls = calls.length
    folder.uri.fsPath = root
    await prepareMacProjectTerminal(vscode, { environmentVariableCollection: collection }, ready, api)
    assert.equal(calls.length, initialCalls)
    const link = join(root, 'workspaces', 'outside-link')
    await symlink(root, link)
    folder.uri.fsPath = link
    await assert.rejects(prepareMacProjectTerminal(vscode, { environmentVariableCollection: collection }, ready, api),
      /MAC_PROJECT_WORKSPACE_UNSAFE/)
    vscode.workspace.isTrusted = false
    await assert.rejects(prepareMacProjectTerminal(vscode, { environmentVariableCollection: collection }, ready, api),
      /MAC_PROJECT_ENVIRONMENT_UNAVAILABLE/)
    assert.equal(calls.length, initialCalls)
  })
