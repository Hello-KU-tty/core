const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const { createHash } = require('node:crypto')
const { readFile, realpath, writeFile } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const vscode = require('vscode')

const run = async () => {
  const root = process.env.VIBE_W1_PROBE_ROOT
  const runId = process.env.VIBE_W1_RUN_ID
  assert.ok(root)
  assert.match(runId, /^[0-9a-f-]{36}$/)
  const canonicalRoot = await realpath(root)
  const repository = resolve(__dirname, '../..')
  const workspace = await realpath(join(canonicalRoot, 'workspace'))
  assert.equal(vscode.workspace.workspaceFolders?.length, 1)
  assert.equal(await realpath(vscode.workspace.workspaceFolders[0].uri.fsPath), workspace)
  const product = JSON.parse(await readFile(join(vscode.env.appRoot, 'product.json'), 'utf8'))
  const agent = JSON.parse(await readFile(
    join(vscode.env.appRoot, 'extensions/kiro.kiro-agent/package.json'), 'utf8'))
  const commandIds = [
    'kiro.agentRegistry.getAgentEndpoints',
    'kiroAgent.mcp.getCanEnableMCP',
    'kiroAgent.customAgents.listCustomAgents',
  ]
  const commands = await vscode.commands.getCommands(true)
  const report = {
    schemaVersion: 1, kind: 'WINDOWS_W1_HOST_CAPABILITY',
    platform: process.platform, arch: process.arch, api: vscode.version,
    ide: product.version, commit: product.commit, agent: agent.version,
    node: process.versions.node, electron: process.versions.electron,
    napi: process.versions.napi, trusted: vscode.workspace.isTrusted,
    commands: Object.fromEntries(commandIds.map(id => [id, commands.includes(id)])),
    child: 'NOT_TESTED', endpointCount: 0,
  }
  const child = fork(join(__dirname, 'runtime-child.cjs'), [
    repository, join(canonicalRoot, `한글 공백 runtime-${runId}`), join(canonicalRoot, `runtime-${runId}.json`),
  ], {
    silent: true, execArgv: [], windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  child.stdout.resume()
  child.stderr.resume()
  const timer = setTimeout(() => child.kill(), 45_000)
  try {
    const exitCode = await new Promise((done, reject) => {
      child.once('error', reject)
      child.once('exit', done)
    })
    report.child = { exitCode, runtime: JSON.parse(await readFile(join(canonicalRoot, `runtime-${runId}.json`), 'utf8')) }
  } catch (error) { report.child = { failure: error?.code ?? 'HOST_CHILD_FAILED' } }
  finally { clearTimeout(timer) }
  if (report.commands[commandIds[0]]) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const endpoints = await vscode.commands.executeCommand(commandIds[0])
      let count = 0
      for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
        if (endpoint.folders?.length !== 1) continue
        try {
          if (await realpath(endpoint.folders[0].path) === workspace) count++
        } catch { /* Ignore other windows without collecting paths or credentials. */ }
      }
      report.endpointCount = count
      if (count) break
      await new Promise(done => setTimeout(done, 500))
    }
  }
  report.trusted = vscode.workspace.isTrusted
  if (report.trusted && report.endpointCount === 1) {
    assert.equal(product.version, '1.1.14')
    assert.equal(product.commit, 'f694ef1b025756b1ae27ae7c3d9ed4215b0160fe')
    assert.equal(agent.version, '1.1.28')
    assert.equal(vscode.version, '1.131.0')
    assert.equal(createHash('sha256').update(await readFile(join(vscode.env.appRoot,
      'extensions/kiro.kiro-agent/dist/extension.js'))).digest('hex'),
    'af4e05df0677587e689883ccbbb19bb853517d8127c5caaec66511408e4ca5da')
    const beforeTurn = async () => {
      const ledgerFile = join(canonicalRoot, 'model-turns.json')
      const ledger = await readFile(ledgerFile, 'utf8').then(JSON.parse).catch(error => {
        if (error.code === 'ENOENT') return { used: 0 }; throw error
      })
      assert.ok(Number.isInteger(ledger.used) && ledger.used >= 0 && ledger.used < 8)
      await writeFile(ledgerFile, JSON.stringify({ used: ledger.used + 1 }), { mode: 0o600 })
    }
    let helper = null
    if (process.env.VIBE_W1_HELPER_LIVE === '1') {
      assert.equal(report.child.exitCode, 0)
      const runtimeRoot = join(canonicalRoot, `한글 공백 runtime-${runId}`)
      const context = JSON.parse(await readFile(join(runtimeRoot, 'helper-context.json'), 'utf8'))
      helper = {
        rolePrompt: await readFile(join(repository, 'docs/agent-prompts/helper.md'), 'utf8'),
        message: 'Synthetic W1 check. User question: Why keep the result immutable? Answer in at most 200 characters. Core has already executed get_helper_context. Validated Core context: ' + JSON.stringify(context),
        beforeTurn,
        record: text => require('./helper-receipt.cjs').record(repository, runtimeRoot, text),
      }
    }
    report.nativeMetadata = await require('./native-metadata.cjs').probe(vscode, workspace, helper)
    let helperHost
    if (process.env.VIBE_W1_DUAL_HOST === '1') {
      helperHost = await require('./helper-host.cjs').open(vscode, canonicalRoot)
      report.helperHost = { ...helperHost.marker, windowId: helperHost.windowId }
      report.helperMetadata = await require('./native-metadata.cjs').probe(vscode, helperHost.folder, {
        name: 'vibe-w1-helper-metadata', rolePrompt: 'Metadata only; no model turn.', metadataOnly: true,
      })
      assert.equal(report.helperMetadata.status, 'PASS')
      assert.notEqual(report.nativeMetadata.windowId, report.helperMetadata.windowId)
    }
    if (process.env.VIBE_W1_DISCOVERY_LIVE === '1') {
      report.discovery = await require('./live-discovery.cjs').run(vscode, repository,
        join(canonicalRoot, `한글 공백 runtime-${runId}`), workspace, beforeTurn)
    }
    if (process.env.VIBE_W1_BUILDER_LIVE === '1') {
      report.builder = await require('./live-builder.cjs').run(vscode, repository,
        join(canonicalRoot, `한글 공백 runtime-${runId}`), workspace, beforeTurn, helperHost)
    }
  }
  await writeFile(join(canonicalRoot, `host-${runId}.json`), JSON.stringify(report, null, 2), { flag: 'wx' })
  console.log(JSON.stringify(report))
}
exports.run = async () => {
  try { await run() }
  catch (error) {
    const root = process.env.VIBE_W1_PROBE_ROOT
    const runId = process.env.VIBE_W1_RUN_ID
    if (root && /^[0-9a-f-]{36}$/.test(runId)) {
      const failure = { status: 'FAIL', code: /^[A-Z_]{1,100}$/.test(error.message) ? error.message : 'HOST_PROBE_FAILED',
        sourceLine: error.stack?.match(/(?:live-builder|test)\.cjs:\d+:\d+/)?.[0] ?? null }
      await writeFile(join(root, `host-${runId}.json`), JSON.stringify(failure), { flag: 'wx' })
    }
    throw error
  }
}
