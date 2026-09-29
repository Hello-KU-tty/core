const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { mkdir, mkdtemp, readFile, realpath } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { createRequire } = require('node:module')
const { test } = require('node:test')
const { runInNewContext } = require('node:vm')

for (const code of ['NATIVE_QUOTA_EXCEEDED', 'NATIVE_AUTH_REQUIRED',
  'NATIVE_MODEL_UNAVAILABLE', 'NATIVE_ACCESS_DENIED', 'NATIVE_RATE_LIMITED',
  'NATIVE_SERVICE_UNAVAILABLE', 'NATIVE_RPC_REJECTED', 'NATIVE_ENDPOINT_AMBIGUOUS',
  'NATIVE_ENDPOINT_MISSING']) {
  test(`worker forwards ${code} once without provider details or automatic retry`, async () => {
    const openingFailure = code.startsWith('NATIVE_ENDPOINT_')
    const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-worker-failure-')))
    const workspace = join(root, 'workspaces', 'projects', 'project_synthetic')
    await mkdir(workspace, { recursive: true })
    const sourcePath = join(__dirname, '../src/native-worker.cjs')
    const localRequire = createRequire(sourcePath)
    const module = { exports: {} }, completions = [], statuses = [], intervals = []
    const sensitive = 'synthetic-provider-detail-must-not-be-recorded'
    let opens = 0, prompts = 0, closes = 0, claims = 0
    runInNewContext(readFileSync(sourcePath, 'utf8'), {
      module, AbortController, AbortSignal, URL, Buffer, process, setTimeout, clearTimeout,
      setInterval(callback) { intervals.push(callback); return intervals.length },
      clearInterval() {},
      require(name) {
        if (name === 'vscode') return {
          workspace: { workspaceFolders: [{ uri: { fsPath: workspace } }] },
          commands: { executeCommand() { throw new Error('NO_WORKSPACE_SWITCH_EXPECTED') } },
        }
        if (name === '@vibe-helper/frontend-client/node') return {
          readLocalConnection: async () => ({ baseUrl: 'http://127.0.0.1:12345', token: 'synthetic' }),
        }
        if (name === '@vibe-helper/application/redaction') return { redactSensitiveText: value => value }
        if (name === './native-permission.cjs') return { chooseNativeBuilderPermission() {
          throw new Error('FAILURE_TEST_MUST_NOT_EXECUTE_TOOLS')
        } }
        if (name.endsWith('/native-client.cjs')) return { openNativeRole: async (_vscode, options) => {
          opens++
          assert.equal(options.expectedWindowId, 7)
          if (openingFailure) throw Object.assign(new Error(sensitive), { code })
          return { windowId: 7, close() { closes++ }, prompt: async () => {
            prompts++
            throw Object.assign(new Error(sensitive), { code })
          } }
        } }
        return localRequire(name)
      },
      fetch: async (url, options) => {
        const path = new URL(url).pathname
        let value = {}
        if (path === '/health') value = { agent: 'KIRO_IDE_BUILTIN_AGENT' }
        else if (path === '/api/native/next') value = claims++ === 0
          ? { job: { id: 'native_synthetic', role: 'DISCOVERY', roleName: 'synthetic',
            projectId: 'project_synthetic', workspace, bindingFile: null, message: 'Synthetic.' } }
          : { job: null }
        else if (path.endsWith('/status')) value = { status: 'CLAIMED' }
        else if (path.endsWith('/complete')) completions.push(JSON.parse(options.body))
        else throw new Error('UNEXPECTED_RELAY_REQUEST')
        return { ok: true, json: async () => value }
      },
    }, { filename: sourcePath })
    const worker = module.exports.startNativeWorker({ subscriptions: [],
      extension: { id: 'vibe-helper.synthetic-panel' },
      logUri: { scheme: 'file', path: '/logs/window7/exthost/vibe-helper.synthetic-panel' },
    }, join(root, 'connection.json'), {
      source: 'SYNTHETIC', nodePath: process.execPath, bridgeScriptPath: 'synthetic',
    })
    worker.subscribeStatus(status => statuses.push(status))
    const until = async predicate => {
      const deadline = Date.now() + 5000
      while (!await predicate() && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 5))
      assert.ok(await predicate(), 'Synthetic worker failure did not settle')
    }
    try {
      await until(() => statuses.includes(`AGENT_FAILED_${code}`) &&
        (openingFailure || closes === 1))
      assert.deepEqual(completions, [{ errorCode: code }])
      assert.ok(statuses.includes(`AGENT_FAILED_${code}`))
      assert.equal(worker.getStatus(), openingFailure ? `AGENT_FAILED_${code}` : 'AGENT_SESSION_CLOSED_DISCOVERY')
      if (!openingFailure)
        assert.ok(statuses.indexOf(`AGENT_FAILED_${code}`) < statuses.indexOf('AGENT_SESSION_CLOSED_DISCOVERY'))
      for (let count = 0; count < 3; count++) {
        const previousClaims = claims
        intervals[0]()
        await until(() => claims > previousClaims)
      }
      assert.deepEqual({ opens, prompts, closes },
        { opens: 1, prompts: openingFailure ? 0 : 1, closes: openingFailure ? 0 : 1 })
      let log = ''
      await until(async () => {
        log = await readFile(join(root, 'native-worker-status.jsonl'), 'utf8').catch(() => '')
        return log.includes(`AGENT_FAILED_${code}`)
      })
      assert.ok(!log.includes(sensitive))
      assert.ok(!JSON.stringify({ completions, statuses }).includes(sensitive))
    } finally { worker.stop() }
  })
}
