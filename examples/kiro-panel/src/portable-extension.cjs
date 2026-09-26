const vscode = require('vscode')
const { realpath } = require('node:fs/promises')
const { dirname, join } = require('node:path')
const { createFrontendHost } = require('./frontend-host.cjs')
const { registerLocalPanel } = require('./local-panel.cjs')
const { shouldOpenGeneratedPanel } = require('./panel-startup.cjs')

let host
async function activate(context) {
  host = await createFrontendHost(context)
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left)
  bar.command = 'vibeHelper.localPanel'; bar.name = 'Vibe Helper'; bar.show()
  const unsubscribe = host.subscribeStatus(value => {
    bar.text = value.phase === 'CORE_CONNECTED' ? '$(check) Vibe Helper' : '$(sync) Vibe Helper'
    bar.tooltip = value.nativeErrorCode ?? value.errorCode ?? value.phase
  })
  context.subscriptions.push(bar, { dispose: unsubscribe })
  const prepare = async () => {
    try { return await host.prepare() }
    catch {
      const answer = await vscode.window.showErrorMessage(`Core 준비 실패: ${host.getStatus().errorCode}`, '재시도')
      if (answer === '재시도') void vscode.commands.executeCommand('vibeHelper.retryCore')
      return null
    }
  }
  registerLocalPanel(context, { prepare, singlePanel: true,
    getStatus: host.getStatus, subscribeStatus: host.subscribeStatus, assertAgentReady: host.assertAgentReady })
  context.subscriptions.push(vscode.commands.registerCommand('vibeHelper.retryCore', async () => {
    await host.retry().catch(() => {})
    return vscode.commands.executeCommand('vibeHelper.localPanel')
  }))
  void prepare().then(async ready => {
    if (!ready) return
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!folder || vscode.workspace.workspaceFolders.length !== 1) return
    const workspace = await realpath(folder)
    const generatedRoot = await realpath(join(dirname(ready.connectionFile), 'workspaces'))
    if (shouldOpenGeneratedPanel(workspace, generatedRoot))
      await vscode.commands.executeCommand('vibeHelper.localPanel')
  }).catch(() => {})
  return { lifecycleStatus: host.getStatus }
}
async function deactivate() { await host?.dispose(); host = null }
module.exports = { activate, deactivate }
