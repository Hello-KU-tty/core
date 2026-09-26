const assert = require('node:assert/strict')
const { mkdtemp, mkdir, realpath, symlink } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { test } = require('node:test')
const { prepareWindowsProjectTerminal } = require('../src/windows-terminal-environment.cjs')

test('terminal policy is temporary and limited to a trusted owned Project folder',
  { skip: process.platform !== 'win32' }, async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-terminal-scope-')))
    const project = join(root, 'workspaces/projects/project_fixture')
    const helper = join(root, 'workspaces/helpers/project_fixture')
    const outside = join(root, 'outside/projects/project_fixture')
    for (const folder of [project, helper, outside]) await mkdir(folder, { recursive: true })
    const alias = join(root, 'project-alias')
    await symlink(project, alias, 'junction')
    const mutations = []
    let cleared = false
    const context = { subscriptions: [], environmentVariableCollection: {
      persistent: true,
      getScoped(scope) {
        assert.equal(scope.workspaceFolder.uri.fsPath, project)
        return { replace: (...args) => mutations.push(args), clear: () => { cleared = true } }
      },
    } }
    const host = (path, trusted = true) => ({ workspace: {
      isTrusted: trusted, workspaceFolders: [{ uri: { fsPath: path } }],
    } })
    for (const path of [join(root, 'workspaces'), helper, outside, alias])
      assert.equal(await prepareWindowsProjectTerminal(host(path), context, join(root, 'connection.json')), false)
    assert.equal(await prepareWindowsProjectTerminal(host(project, false), context, join(root, 'connection.json')), false)
    const multiple = host(project)
    multiple.workspace.workspaceFolders.push({ uri: { fsPath: outside } })
    assert.equal(await prepareWindowsProjectTerminal(multiple, context, join(root, 'connection.json')), false)
    assert.deepEqual(mutations, [])
    assert.equal(await prepareWindowsProjectTerminal(host(project), context, join(root, 'connection.json')), true)
    assert.equal(context.environmentVariableCollection.persistent, false)
    assert.deepEqual(mutations, [['PSExecutionPolicyPreference', 'RemoteSigned']])
    context.subscriptions[0].dispose()
    assert.equal(cleared, true)
  })
