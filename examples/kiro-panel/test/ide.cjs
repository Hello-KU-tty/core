const assert = require('node:assert/strict')
const vscode = require('vscode')
const { writeFile } = require('node:fs/promises')
const { connectLocalCore } = require('@vibe-helper/frontend-client/node')
exports.run = async function () {
  const file = process.env.VIBE_HELPER_TEST_CONNECTION_FILE
  assert.ok(file, 'Set the synthetic test connection file path, not its token.')
  await vscode.workspace.getConfiguration('vibeHelper').update('connectionFile', file, vscode.ConfigurationTarget.Global)
  const extension = vscode.extensions.getExtension('vibe-helper.vibe-helper-local-panel')
  assert.ok(extension, 'Example extension must load in the actual IDE')
  await extension.activate()
  const opened = await vscode.commands.executeCommand('vibeHelper.localPanel')
  assert.equal(opened.panelOpened, true)
  const client = await connectLocalCore(file)
  const history = await client.listProjects()
  assert.ok(history.projects.length > 0, 'Run the synthetic live workflow before IDE verification')
  let snapshot
  for (const item of history.projects) {
    const candidate = await client.restoreProject(item.project.id)
    if (candidate.discoveryContext && candidate.learningSpec && candidate.currentTask) { snapshot = candidate; break }
  }
  assert.ok(snapshot, 'Complete Discovery, Spec and Task preparation in the synthetic root first')
  assert.ok(snapshot.discoveryContext, 'Discovery snapshot')
  assert.ok(snapshot.learningSpec, 'Spec snapshot')
  assert.ok(snapshot.currentTask, 'Builder snapshot')
  const report = { status: 'IDE_HOST_PASSED', ideName: vscode.env.appName, ideVersion: vscode.version,
    node: process.versions.node, platform: process.platform, historyCount: history.projects.length,
    projectId: snapshot.project.id, discovery: true, spec: true, builder: true, history: true,
    visualReview: 'NOT_ASSERTED_BY_HOST_TEST' }
  await writeFile(process.env.VIBE_HELPER_TEST_REPORT, JSON.stringify(report), { mode: 0o600, flag: 'wx' })
  console.log(JSON.stringify(report))
}
