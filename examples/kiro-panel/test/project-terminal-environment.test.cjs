const assert = require('node:assert/strict')
const { mkdir, mkdtemp, realpath, symlink } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { test } = require('node:test')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const { prepareProjectTerminal } = require('../src/project-terminal-environment.cjs')

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
    await prepareProjectTerminal(vscode, { environmentVariableCollection: collection }, ready, api)
    assert.equal(collection.persistent, false)
    assert.deepEqual(calls[0].nodeExecutables, [])
    assert.deepEqual(calls[0].pnpmExecutables, [])
    assert.equal(changes.find(([key]) => key === 'NODE_OPTIONS')[1], '')
    assert.deepEqual(changes.find(([key]) => key === 'PATH')[2],
      { applyAtProcessCreation: true, applyAtShellIntegration: true })
    const initialCalls = calls.length
    folder.uri.fsPath = root
    await prepareProjectTerminal(vscode, { environmentVariableCollection: collection }, ready, api)
    assert.equal(calls.length, initialCalls)
    const link = join(root, 'workspaces', 'outside-link')
    await symlink(root, link)
    folder.uri.fsPath = link
    await assert.rejects(prepareProjectTerminal(vscode, { environmentVariableCollection: collection }, ready, api),
      /PROJECT_WORKSPACE_UNSAFE/)
    vscode.workspace.isTrusted = false
    await assert.rejects(prepareProjectTerminal(vscode, { environmentVariableCollection: collection }, ready, api),
      /PROJECT_ENVIRONMENT_UNAVAILABLE/)
    assert.equal(calls.length, initialCalls)
  })

test('Windows keeps the learner PATH after the packaged tools in generated folders only', async () => {
  const path = require('node:path').win32
  const code = readFileSync(join(__dirname, '../src/project-terminal-environment.cjs'), 'utf8')
  const module = { exports: {} }
  runInNewContext(code, { module, process: { ...process, platform: 'win32' }, require: name =>
    name === 'node:path' ? path
      // The folder URI lower-cases the drive letter; realpath reports it in upper case.
      : name === 'node:fs/promises' ? { realpath: async value => value.replace(/^c:/, 'C:') }
        : require(name) })
  const root = 'C:\\Users\\Me\\AppData\\core-data'
  const folder = { uri: { fsPath: 'c:\\Users\\Me\\AppData\\core-data\\workspaces\\projects\\project_1' } }
  const vscode = { workspace: { isTrusted: true, workspaceFolders: [folder] } }
  const changes = []
  const collection = { persistent: true, clear() {}, getScoped: () => ({
    replace: (...args) => changes.push(['replace', ...args]), prepend: (...args) => changes.push(['prepend', ...args]) }) }
  const api = { selectProjectToolchain: async () => ({}),
    projectEnvironment: () => ({ PATH: 'C:\\tools\\node;C:\\tools\\bin;C:\\Windows\\System32', PNPM_HOME: 'C:\\tools\\bin' }) }
  await module.exports.prepareProjectTerminal(vscode, { environmentVariableCollection: collection },
    { connectionFile: `${root}\\connection.json`, resources: {} }, api)
  // Objects made inside the VM context compare by content, not prototype.
  assert.equal(JSON.stringify(changes.find(([, key]) => key === 'PATH')),
    JSON.stringify(['prepend', 'PATH', 'C:\\tools\\node;C:\\tools\\bin;C:\\Windows\\System32;',
      { applyAtProcessCreation: true, applyAtShellIntegration: true }]))
  assert.equal(changes.find(([, key]) => key === 'PNPM_HOME')[0], 'replace')
  assert.equal(changes.find(([, key]) => key === 'PSExecutionPolicyPreference')[2], 'RemoteSigned')
  changes.length = 0
  folder.uri.fsPath = 'C:\\Users\\Me\\own-folder'
  await module.exports.prepareProjectTerminal(vscode, { environmentVariableCollection: collection },
    { connectionFile: `${root}\\connection.json`, resources: {} }, api)
  assert.equal(changes.length, 0)
})
