// Candidate-only diagnostic. Never imported by the product or its package.
const assert = require('node:assert/strict')
const { fork } = require('node:child_process')
const { createHash } = require('node:crypto')
const { readFile, realpath, writeFile } = require('node:fs/promises')
const { basename, dirname, join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const vscode = require('vscode')

const candidate = Object.freeze({
  version: '1.1.70',
  vsCodeVersion: '1.131.0',
  commit: '8ce1870416c7dc7e51fffb01765d93ef7ad55102',
  agentVersion: '1.1.158',
  agentSha256: 'cf6a5124f2fed75144b9d4236e0ffff85a5b22732d739807070783323c071b87',
})
const safeCode = error => /^[A-Z][A-Z0-9_]{0,100}$/.test(error?.code ?? error?.message ?? '')
  ? error.code ?? error.message : 'COMPATIBILITY_PROBE_FAILED'

exports.activate = async context => {
  if (!process.env.VIBE_W5_COMPAT_ROOT) return
  const root = await realpath(process.env.VIBE_W5_COMPAT_ROOT)
  assert.equal(dirname(root), await realpath(tmpdir()))
  assert.match(basename(root), /^vibe-w5-compat-[A-Za-z0-9]{6}$/)
  const repository = resolve(__dirname, '../..')
  // The launcher creates and checks the private root; verify again in the host.
  const { pathToFileURL } = require('node:url')
  const { isPrivateDirectory } = await import(pathToFileURL(
    join(repository, 'packages/runtime/dist/private-directory.js')).href)
  assert.equal(await isPrivateDirectory(root), true)
  const workspace = await realpath(join(root, 'workspace'))
  assert.equal(vscode.workspace.workspaceFolders?.length, 1)
  assert.equal(await realpath(vscode.workspace.workspaceFolders[0].uri.fsPath), workspace)
  const report = {
    schemaVersion: 1, kind: 'W5_KIRO_1170_COMPATIBILITY',
    status: 'RUNNING', stage: 'SOURCE', modelCalls: 0,
    productSupportChanged: false, startedAt: new Date().toISOString(),
  }
  const record = async () => writeFile(join(root, 'receipt.json'), JSON.stringify(report, null, 2))
  const work = async () => {
    try {
      const product = JSON.parse(await readFile(join(vscode.env.appRoot, 'product.json'), 'utf8'))
      const agentRoot = join(vscode.env.appRoot, 'extensions/kiro.kiro-agent')
      const agent = JSON.parse(await readFile(join(agentRoot, 'package.json'), 'utf8'))
      for (const key of ['version', 'vsCodeVersion', 'commit']) assert.equal(product[key], candidate[key])
      assert.equal(agent.version, candidate.agentVersion)
      assert.equal(vscode.version, candidate.vsCodeVersion)
      assert.equal(createHash('sha256').update(await readFile(join(agentRoot, 'dist/extension.js')))
        .digest('hex'), candidate.agentSha256)
      report.host = { ...candidate, platform: process.platform, arch: process.arch,
        node: process.versions.node, electron: process.versions.electron, napi: process.versions.napi }
      try {
        require('../kiro-native-host/native-installation-source.cjs').attestWindowsKiroInstallation(vscode)
        report.originalProductGate = 'ACCEPTED'
      } catch (error) { report.originalProductGate = safeCode(error) }
      require('../kiro-native-host/native-installation-source.cjs')
        .attestWindowsKiroInstallation(vscode, undefined, undefined, { diagnostic1170: true })
      report.candidateSourceGate = 'PASS'
      report.stage = 'RUNTIME_CORE_MCP'
      await record()
      // Rechecks must not reuse SQLite/workspace fixtures or a prior receipt.
      const attempt = Date.now()
      const runtimeRoot = join(root, `runtime-${attempt}`)
      const runtimeReceipt = join(root, `runtime-receipt-${attempt}.json`)
      const child = fork(join(repository, 'examples/windows-capability/runtime-child.cjs'), [
        repository, runtimeRoot, runtimeReceipt,
      ], { silent: true, execArgv: [], windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
      child.stdout.resume()
      child.stderr.resume()
      const timer = setTimeout(() => child.kill(), 90_000)
      let exitCode
      try {
        exitCode = await new Promise((done, reject) => {
          child.once('error', reject)
          child.once('exit', done)
        })
      } finally { clearTimeout(timer) }
      report.runtime = { exitCode,
        receipt: await readFile(runtimeReceipt, 'utf8').then(JSON.parse).catch(() => null) }
      if (exitCode !== 0) throw new Error('HOST_RUNTIME_FAILED')
      report.stage = 'NATIVE_ENDPOINT'
      await record()
      let owned = 0
      for (let attempt = 0; attempt < 60 && owned !== 1; attempt++) {
        const endpoints = await vscode.commands.executeCommand('kiro.agentRegistry.getAgentEndpoints')
          .catch(() => [])
        owned = 0
        for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
          if (endpoint.folders?.length !== 1) continue
          try { if (await realpath(endpoint.folders[0].path) === workspace) owned++ } catch {}
        }
        if (owned > 1) throw new Error('NATIVE_ENDPOINT_AMBIGUOUS')
        if (owned !== 1) await new Promise(done => setTimeout(done, 500))
      }
      report.ownedEndpointCount = owned
      if (owned !== 1) throw new Error('NATIVE_ENDPOINT_NOT_READY')
      report.stage = 'NATIVE_METADATA'
      await record()
      const liveHelper = process.env.VIBE_W5_COMPAT_HELPER_LIMIT === '1'
      const helperContext = liveHelper
        ? JSON.parse(await readFile(join(runtimeRoot, 'helper-context.json'), 'utf8')) : null
      report.native = await require('../windows-capability/native-metadata.cjs').probe(vscode, workspace, {
        name: 'vibe-w5-1170-metadata',
        rolePrompt: liveHelper ? await readFile(join(repository, 'docs/agent-prompts/helper.md'), 'utf8')
          : 'Metadata-only compatibility check. No model turn is authorized.',
        metadataOnly: !liveHelper,
        cloudProofMode: 'WINDOWS_1170_DIAGNOSTIC',
        message: liveHelper ? 'Synthetic W5 check. User question: Why keep the result immutable? Answer in at most 200 characters. Core has already executed get_helper_context. Validated Core context: ' + JSON.stringify(helperContext) : undefined,
        record: text => require('../windows-capability/helper-receipt.cjs').record(repository, runtimeRoot, text),
        beforeTurn: async () => {
          assert.equal(liveHelper, true)
          // Persist intent before dispatch; a failed or uncertain turn cannot replay.
          await writeFile(join(root, 'w5-helper-once.json'), JSON.stringify({ modelCalls: 1 }), { flag: 'wx' })
          report.modelCalls = 1
          await record()
        },
      })
      assert.equal(report.native.modelTurns, report.modelCalls)
      report.status = report.native.status === 'PASS'
        ? liveHelper ? 'PASS_NATIVE_HELPER' : 'PASS_METADATA_ONLY' : 'FAIL'
      report.stage = 'COMPLETE'
    } catch (error) {
      report.status = 'FAIL'
      report.errorCode = safeCode(error)
    } finally {
      report.finishedAt = new Date().toISOString()
      await record()
    }
  }
  if (vscode.workspace.isTrusted) void work()
  else {
    report.stage = 'WAITING_FOR_WORKSPACE_TRUST'
    await record()
    const listener = vscode.workspace.onDidGrantWorkspaceTrust(() => {
      listener.dispose()
      void work()
    })
    context.subscriptions.push(listener)
  }
}
