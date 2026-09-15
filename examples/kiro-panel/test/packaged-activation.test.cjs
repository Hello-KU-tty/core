const assert = require('node:assert/strict')
const { existsSync } = require('node:fs')
const { copyFile, mkdir, mkdtemp } = require('node:fs/promises')
const Module = require('node:module')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { test } = require('node:test')

test('the final bundle activates from a relocated repo-less installed layout', async () => {
  const panelRoot = join(__dirname, '..')
  const installedRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-installed-activation-'))
  const installedDist = join(installedRoot, 'dist')
  await mkdir(installedDist)
  await copyFile(join(panelRoot, 'dist', 'extension.cjs'),
    join(installedDist, 'extension.cjs'))
  await copyFile(join(panelRoot, 'package.json'), join(installedRoot, 'package.json'))
  assert.equal(existsSync(join(installedRoot, 'scripts', 'single-host-probe-mcp.mjs')), false)

  const registered = []
  const vscode = {
    ProgressLocation: { Notification: 1 },
    ViewColumn: { Beside: 2 },
    workspace: {
      getConfiguration: () => ({ get: (_name, fallback) => fallback }),
    },
    window: {
      showQuickPick() {},
      showWarningMessage() {},
      withProgress() {},
      createWebviewPanel() {},
      showInformationMessage() {},
    },
    commands: {
      registerCommand: (name) => {
        registered.push(name)
        return { dispose() {} }
      },
    },
  }
  const context = {
    extensionPath: installedRoot,
    extensionUri: {},
    subscriptions: [],
  }
  const bundle = join(installedDist, 'extension.cjs')
  const originalLoad = Module._load
  try {
    Module._load = function (request, parent, isMain) {
      if (request === 'vscode') return vscode
      return originalLoad.call(this, request, parent, isMain)
    }
    delete require.cache[bundle]
    const extension = require(bundle)
    assert.doesNotThrow(() => extension.activate(context))
  } finally {
    Module._load = originalLoad
    delete require.cache[bundle]
  }

  assert.equal(registered.filter(name => name === 'vibeHelper.localPanel').length, 1)
  assert.equal(registered.filter(name => name === 'vibeHelper.nativeCleanEvaluationRun').length, 1)
  assert.ok(context.subscriptions.length > 0)
})
