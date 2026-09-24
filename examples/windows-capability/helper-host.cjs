const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { readFile, realpath, writeFile } = require('node:fs/promises')
const { join } = require('node:path')

// The second window shares only the already authorized synthetic profile.
// Its endpoint and Agent execution queue are separate from the Builder window.
exports.open = async (vscode, root) => {
  const { privateDirectory } = await import('../../apps/local-backend/dist/private-files.js')
  const folder = await privateDirectory(join(root, 'workspace', '__w1-helper-host'))
  // Kiro reuses an existing Development Host for the same development path.
  // Give this metadata-only extension a distinct identity/path, in the private root.
  const extension = await privateDirectory(join(root, 'helper-extension'))
  await writeFile(join(extension, 'package.json'), JSON.stringify({ name: 'vibe-w1-helper-host',
    publisher: 'vibe-helper', version: '0.0.1', engines: { vscode: '^1.109.0' },
    main: 'extension.cjs', activationEvents: ['onStartupFinished'] }))
  await writeFile(join(extension, 'probe-config.json'), JSON.stringify({ root,
    runId: process.env.VIBE_W1_RUN_ID, folder }))
  await writeFile(join(extension, 'extension.cjs'), `
const vscode = require('vscode')
const fs = require('node:fs/promises')
const { join } = require('node:path')
exports.activate = async () => {
  const { root, runId, folder } = require('./probe-config.json')
  if (vscode.workspace.workspaceFolders?.length !== 1 ||
      await fs.realpath(vscode.workspace.workspaceFolders[0].uri.fsPath) !== folder) return
  await fs.writeFile(join(root, 'helper-host-' + runId + '.json'), JSON.stringify({
    trusted: vscode.workspace.isTrusted, api: vscode.version, node: process.versions.node, oneFolder: true,
  }), { flag: 'wx' })
}
`)
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  for (const key of Object.keys(environment)) if (key.startsWith('VSCODE_')) delete environment[key]
  const child = spawn(process.execPath, [
    '--new-window', '--user-data-dir', join(root, 'profile'), '--extensions-dir', join(root, 'extensions'),
    `--extensionDevelopmentPath=${extension}`,
    '--skip-welcome', '--skip-release-notes', '--sync', 'off', folder,
  ], { windowsHide: true, stdio: 'ignore', env: environment })
  child.on('error', () => {})
  const until = Date.now() + 35000
  while (Date.now() < until) {
    const marker = await readFile(join(root, `helper-host-${process.env.VIBE_W1_RUN_ID}.json`), 'utf8')
      .then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error })
    const endpoints = await vscode.commands.executeCommand('kiro.agentRegistry.getAgentEndpoints')
    const matches = []
    for (const endpoint of endpoints ?? []) {
      if (endpoint.folders?.length === 1 && await realpath(endpoint.folders[0].path).catch(() => null) === folder) matches.push(endpoint)
    }
    if (marker && matches.length === 1) {
      assert.equal(marker.trusted, true)
      assert.equal(marker.oneFolder, true)
      assert.equal(marker.api, '1.131.0')
      return { folder, windowId: matches[0].windowId, marker }
    }
    await new Promise(done => setTimeout(done, 250))
  }
  throw new Error(`HELPER_HOST_NOT_READY${child.exitCode === 0 ? '_LAUNCH_EXIT_OK' : '_LAUNCH_PENDING_OR_FAILED'}`)
}
