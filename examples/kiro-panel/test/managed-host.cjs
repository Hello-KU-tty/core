// Runs from a copied driver alongside an installed VSIX, never from the checkout.
const assert = require('node:assert/strict')
const { readFile, realpath, writeFile } = require('node:fs/promises')
const { basename, dirname, join } = require('node:path')
const { randomUUID } = require('node:crypto')
const vscode = require('vscode')
exports.activate = async function (context) {
  const config = JSON.parse(await readFile(join(__dirname, 'config.json'), 'utf8'))
  if (basename(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '').startsWith('__vibe-native-helper-')) {
    if (!config.windowLifecycle) return
    const api = await vscode.extensions.getExtension('vibe-helper.vibe-helper-portable-core').activate()
    let polling = false
    const timer = setInterval(async () => {
      if (polling) return
      polling = true
      try {
        const generated = await realpath(join(dirname(config.connectionFile), 'workspaces'))
        const endpoints = await vscode.commands.executeCommand('kiro.agentRegistry.getAgentEndpoints')
        let mainPresent = false
        for (const endpoint of endpoints ?? [])
          if (endpoint.folders?.length === 1 && await realpath(endpoint.folders[0].path).catch(() => null) === generated)
            mainPresent = true
        const state = api.lifecycleStatus()
        await writeFile(`${config.report}.helper-host`, JSON.stringify({ mainPresent, observedAt: Date.now(),
          phase: state.phase, backendInstanceId: state.backendInstanceId, ownership: state.ownership }))
        const close = await readFile(`${config.report}.close-helper`, 'utf8').then(JSON.parse).catch(() => null)
        if (close?.action === 'CLOSE_SYNTHETIC_HELPER') {
          clearInterval(timer)
          await vscode.commands.executeCommand('workbench.action.closeWindow')
        }
      } finally { polling = false }
    }, 1000)
    context.subscriptions.push({ dispose() { clearInterval(timer) } })
    return
  }
  const previous = await readFile(config.report, 'utf8').then(JSON.parse).catch(() => null)
  if (previous?.status || previous?.nativeStatus) return
  const report = previous ?? { target: 'win32-x64', stage: 'ACTIVATING', nativeRequests: 0 }
  const save = async () => writeFile(config.report, JSON.stringify(report), { mode: 0o600 })
  const wait = async (check, timeout = 90000) => {
    const until = Date.now() + timeout
    while (Date.now() < until) { if (await check()) return; await new Promise(done => setTimeout(done, 500)) }
    throw new Error('HOST_CHECK_TIMEOUT')
  }
  try {
    const extension = vscode.extensions.getExtension('vibe-helper.vibe-helper-portable-core')
    assert.ok(extension)
    await save()
    const api = await extension.activate()
    await wait(async () => {
      const state = api.lifecycleStatus()
      report.lifecycle = state
      await save()
      if (state.phase === 'FAILED') throw new Error(state.errorCode)
      return state.phase === 'CORE_CONNECTED'
    })
    report.core = api.lifecycleStatus().phase
    report.native = api.lifecycleStatus().native
    report.errorCode = api.lifecycleStatus().errorCode
    report.trusted = vscode.workspace.isTrusted
    report.stage = 'CORE_ACTIVATED'
    await save()
    assert.equal((await vscode.commands.executeCommand('vibeHelper.localPanel')).panelOpened, true)
    report.panel = 'OPENED'
    const sdk = require(join(extension.extensionPath, 'portable/bin/client.cjs'))
    const client = await sdk.connectLocalCore(config.connectionFile)
    report.history = (await client.listProjects()).projects.length
    report.stage = 'WAITING_FOR_NATIVE_READY'
    await save()
    if (config.hold && !vscode.workspace.isTrusted) {
      report.stage = 'WAITING_FOR_USER_WORKSPACE_TRUST'
      await save()
      await new Promise(resolve => {
        const subscription = vscode.workspace.onDidGrantWorkspaceTrust(() => {
          subscription.dispose()
          resolve()
        })
      })
      report.trusted = true
      report.stage = 'WAITING_FOR_NATIVE_READY'
      await save()
    }
    await wait(() => api.lifecycleStatus().native === 'WORKER_READY', 180000)
    report.native = api.lifecycleStatus().native
    report.trusted = vscode.workspace.isTrusted
    report.lifecycle = api.lifecycleStatus()
    report.errorCode = api.lifecycleStatus().errorCode
    if (config.live) {
      if (!report.discovery) {
        if (report.nativeRequests > 0) throw new Error('DISCOVERY_RESPONSE_UNKNOWN_NOT_REPLAYED')
        report.stage = 'DISCOVERY_STARTING'; report.nativeRequests += 1; await save()
        const started = await client.startDiscovery({ learningGoal: 'Learn TypeScript discriminated unions with a small personal decision journal.' }, { enrichAfterPreview: false })
        report.discovery = { projectId: started.projectId, runId: started.run.id }
        report.stage = 'DISCOVERY_STARTED'; await save()
      }
      await wait(async () => {
        const run = await client.getRun(report.discovery.runId)
        if (['ACCEPTED', 'RUNNING'].includes(run.status)) return false
        report.run = { status: run.status, outcome: run.outcome, errorCode: run.errorCode }
        assert.equal(run.status, 'SUCCEEDED')
        const snapshot = await client.restoreProject(report.discovery.projectId)
        report.previewCount = snapshot.discoveryContext?.candidatePreviews?.length ?? snapshot.discoveryContext?.previewRound?.previews?.length
        report.projectStored = Boolean(snapshot.project)
        return true
      }, 240000)
    }
    if (config.helperTask) {
      const { projectId, taskId } = config.helperTask
      report.helperSetup = config.helperTask.provenance
      const before = await client.restoreProject(projectId)
      if (!report.helper) {
        if (report.helperRequested) throw new Error('HELPER_RESPONSE_UNKNOWN_NOT_REPLAYED')
        report.stage = 'HELPER_STARTING'; report.helperRequested = true; report.nativeRequests += 1; await save()
        const run = await client.startRun({ kind: 'HELPER', projectId, taskId,
          idempotencyKey: `idem_${randomUUID()}`,
          message: 'For this event viewer, why should I validate the discriminant before rendering fields? Explain in two short Korean sentences.' })
        report.helper = { runId: run.id, conversationsBefore: before.helperConversations.length }
        report.stage = 'HELPER_WAITING_FOR_AUTOMATIC_WINDOW'; await save()
      }
      await wait(async () => {
        const run = await client.getRun(report.helper.runId)
        const endpoints = await vscode.commands.executeCommand('kiro.agentRegistry.getAgentEndpoints')
        const generated = await realpath(join(dirname(config.connectionFile), 'workspaces'))
        const hosts = []
        for (const endpoint of endpoints ?? []) {
          if (endpoint.folders?.length !== 1) continue
          const folder = await realpath(endpoint.folders[0].path).catch(() => null)
          if (folder === generated || folder && dirname(folder) === generated && basename(folder).startsWith('__vibe-native-helper-'))
            hosts.push({ helper: folder !== generated, windowId: endpoint.windowId })
        }
        report.helperDistinctWindows = hosts.some(a => !a.helper && hosts.some(b => b.helper && b.windowId !== a.windowId))
        if (['ACCEPTED', 'RUNNING'].includes(run.status)) { await save(); return false }
        report.helperRun = { status: run.status, outcome: run.outcome, errorCode: run.errorCode }
        assert.equal(run.status, 'SUCCEEDED')
        assert.equal(run.outcome, 'HELPER_RECORDED')
        assert.equal(report.helperDistinctWindows, true)
        const snapshot = await client.restoreProject(projectId)
        report.helperStored = snapshot.helperConversations.length > report.helper.conversationsBefore &&
          snapshot.helperConversations.some(value => value.helperResponseSummaries.length > 0)
        assert.equal(report.helperStored, true)
        report.helperCoreInstanceUnchanged = (await client.health()).backendInstanceId === report.lifecycle.backendInstanceId
        assert.equal(report.helperCoreInstanceUnchanged, true)
        return true
      }, 240000)
    }
    if (config.builderTask) {
      const { projectId, taskId } = config.builderTask
      if (!report.builder) {
        if (report.builderRequested) throw new Error('BUILDER_RESPONSE_UNKNOWN_NOT_REPLAYED')
        report.stage = 'BUILDER_TOOLS_STARTING'; report.builderRequested = true; report.nativeRequests += 1; await save()
        const before = await client.restoreProject(projectId)
        const run = await client.startRun({ kind: 'BUILDER', projectId, taskId,
          expectedTaskRevision: before.currentTask.revision,
          idempotencyKey: `idem_${randomUUID()}`,
          message: 'This is a synthetic Windows toolchain validation. The TypeScript web app, test, smoke and result manifest are already provided in this generated workspace. Read get_builder_task and update Context. Do not change dependencies or invent learner Evidence. Run each command separately with the Windows protected launcher from your canonical prompt: pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile, pnpm install --frozen-lockfile, pnpm run build, pnpm test, pnpm run smoke. Verify actual command exit codes and HTTP smoke output. If all pass, report the observed success in Context; do not call complete_task because this fixture validates tools only. Do not use command chaining or background commands.' })
        report.builder = { runId: run.id }; await save()
      }
      await wait(async () => {
        const run = await client.getRun(report.builder.runId)
        if (['ACCEPTED', 'RUNNING'].includes(run.status)) { report.stage = 'BUILDER_TOOLS_RUNNING'; await save(); return false }
        report.builderRun = { status: run.status, outcome: run.outcome, errorCode: run.errorCode }
        assert.equal(run.status, 'SUCCEEDED')
        return true
      }, 660000)
      const commands = ['pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile', 'pnpm install --frozen-lockfile', 'pnpm run build', 'pnpm test', 'pnpm run smoke']
      const receipts = new Map()
      let smokeObserved = false
      await client.watchRun(report.builder.runId, event => {
        const update = event.update
        if (event.kind !== 'TOOL' || update?.toolName !== 'shell') return
        const command = update.command?.replace(/^\.\\\.kiro\\vibe-tools\.cmd /, '')
        if (commands.includes(command) && update.shellExitCode === 0) receipts.set(command, { command, exitCode: 0 })
        if (command === 'pnpm run smoke' && String(update.output ?? '').includes('W4_HTTP_SMOKE_PASS')) smokeObserved = true
      }, { signal: AbortSignal.timeout(15000) })
      report.nativeShell = [...receipts.values()]
      report.nativeHttpSmokeObserved = smokeObserved
      assert.equal(receipts.size, commands.length)
      assert.equal(smokeObserved, true)
      const generated = await realpath(join(dirname(config.connectionFile), 'workspaces/projects', projectId))
      const runtime = require(join(extension.extensionPath, 'portable/bin/runtime.cjs'))
      const resources = await runtime.loadCoreResources(await realpath(join(extension.extensionPath, 'portable')))
      const { toolchain } = await runtime.verifyProjectTools(generated, resources)
      report.projectTools = { node: toolchain.node.nodeVersion, nodeSource: toolchain.node.source, pnpm: toolchain.pnpm.version, pnpmSource: toolchain.pnpm.source }
      assert.equal(toolchain.node.source, config.withoutProjectTools ? 'MANAGED_NODE' : 'EXISTING_NODE')
      assert.equal(toolchain.pnpm.source, config.withoutProjectTools ? 'MANAGED_PNPM' : 'EXISTING_PNPM')
      const supervisor = await runtime.ResultRuntimeSupervisor.create(dirname(generated), { projectToolchain: async () => toolchain })
      try {
        const launched = await supervisor.launch({ schemaVersion: 1, correlationId: `corr_${randomUUID()}`, projectId, workspacePath: basename(generated), status: 'READY' })
        assert.equal(launched.status, 'RUNNING')
        const body = await fetch(launched.url).then(response => response.json())
        assert.equal(await realpath(body.selectedNode), toolchain.node.executable)
        assert.equal(body.electron, null)
        report.resultHttpViaPackagedSupervisor = true
      } finally { await supervisor.close() }
      report.stage = 'BUILDER_TOOLS_COMPLETE'
    }
    report.nativeStatus = 'PASS'
    report.stage = config.windowLifecycle ? 'WINDOW_LIFECYCLE' : 'COMPLETE'
    if (!config.windowLifecycle) report.status = 'PASS'
    await save()
    if (config.builderTask && report.status === 'PASS') setTimeout(() => {
      void vscode.commands.executeCommand('workbench.action.closeWindow')
    }, 10000)
    if (config.windowLifecycle && report.helperStored) {
      report.ownerWindowCloseRequested = true; await save()
      await vscode.commands.executeCommand('workbench.action.closeWindow')
    }
  } catch (error) {
    const code = error.code ?? error.message
    report.status = 'FAIL'; report.errorCode = /^[A-Z0-9_]{1,100}$/.test(code) ? code : 'HOST_CHECK_FAILED'
    await save()
  }
}
