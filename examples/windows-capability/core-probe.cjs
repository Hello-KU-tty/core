const assert = require('node:assert/strict')
const { randomBytes, randomUUID } = require('node:crypto')
const { writeFile } = require('node:fs/promises')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

exports.run = async (repository, root) => {
  const load = path => import(pathToFileURL(join(repository, path)).href)
  const { ApplicationService, WorkspacePathPolicy } = await load('packages/application/dist/index.js')
  const { WorkflowRuntime } = await load('packages/runtime/dist/index.js')
  const { openSqliteStorage } = await load('packages/storage-sqlite/dist/index.js')
  const { LocalCoreClient } = await load('packages/frontend-client/dist/index.js')
  const { createLocalServer } = await load('apps/local-backend/dist/server.js')
  const { createNativeCoreBinding } = await load('apps/local-backend/dist/native-core-binding.js')
  const { privateDirectory, isPrivateDirectory } = await load('apps/local-backend/dist/private-files.js')
  const { privateNativeFile } = require('../kiro-native-host/native-private-directory.cjs')
  const { Client } = await load('apps/mcp-server/node_modules/@modelcontextprotocol/client/dist/index.mjs')
  const { StdioClientTransport } = await load('apps/mcp-server/node_modules/@modelcontextprotocol/client/dist/stdio.mjs')
  const fixtures = await load('packages/contracts/test/fixtures.ts')
  const { ids } = fixtures
  const contracts = await load('packages/contracts/dist/index.js')
  const data = await privateDirectory(join(root, 'core-http'))
  const workspace = await privateDirectory(join(root, 'workspace 한글'))
  assert.equal(await isPrivateDirectory(data), true)
  const storage = await openSqliteStorage({ dataDirectory: data })
  const report = { sdk: 'NOT_TESTED', bridge: {}, shutdown: 'NOT_TESTED' }
  storage.transaction(repo => {
    for (const [method, schema, fixture] of [
      ['appendProject', 'projectSchema', 'projectFixture'],
      ['appendDiscoverySession', 'discoverySessionSchema', 'discoverySessionFixture'],
      ['appendCandidate', 'projectCandidateRevisionSchema', 'candidateFixture'],
      ['appendCandidateRound', 'candidateRoundSchema', 'candidateRoundFixture'],
      ['appendDiscoveryFeedback', 'discoveryFeedbackSchema', 'discoveryFeedbackFixture'],
      ['appendLearningSpec', 'learningSpecRevisionSchema', 'draftLearningSpecFixture'],
      ['appendLearningSpec', 'learningSpecRevisionSchema', 'confirmedLearningSpecFixture'],
      ['appendTask', 'builderTaskSchema', 'builderTaskFixture'],
    ]) repo[method](contracts[schema].parse(fixtures[fixture]))
  })
  const application = new ApplicationService({ storage, workspacePolicy: await WorkspacePathPolicy.create(workspace) })
  const instanceId = randomUUID()
  const runtime = new WorkflowRuntime({ application, instanceId,
    agents: { invoke: async () => { throw new Error('NATIVE_AGENT_NOT_ATTACHED') } } })
  const token = randomBytes(32).toString('hex')
  const handlers = new Map()
  const server = createLocalServer({ application, runtime, token, instanceId, mcpHandlers: handlers,
    runStartDisabledCode: 'NATIVE_RUNTIME_NOT_ATTACHED' })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  try {
    const client = new LocalCoreClient({ protocolVersion: 1, backendInstanceId: instanceId, baseUrl, token })
    await client.health()
    const projects = await client.listProjects()
    assert.ok(JSON.stringify(projects).includes(ids.project))
    const unauthorized = await fetch(`${baseUrl}/api/application`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    assert.equal(unauthorized.status, 401)
    report.sdk = 'PASS'
    report.unauthenticatedStatus = unauthorized.status
    for (const [role, tool, kind] of [
      ['DISCOVERY', 'get_discovery_context', 'DISCOVERY_GET_CONTEXT'],
      ['BUILDER', 'get_builder_task', 'BUILDER_GET_TASK'],
      ['HELPER', 'get_helper_context', 'HELPER_GET_CONTEXT'],
    ]) {
      const scope = { projectId: ids.project, correlationId: ids.correlation,
        ...(role === 'DISCOVERY' ? { discoverySessionId: ids.discoverySession } : { taskId: ids.task }) }
      const binding = createNativeCoreBinding({ application, role, ...scope })
      handlers.set(binding.path, binding.handler)
      const descriptor = join(data, `${role.toLowerCase()}-binding.json`)
      await writeFile(descriptor, JSON.stringify({ role, ...scope, workspace, url: baseUrl + binding.path,
        authorization: binding.authorization, toolNames: binding.toolNames,
        ...(role === 'DISCOVERY' ? { mode: 'PREVIEW', requestedCandidateIds: [] } : {}),
      }), { flag: 'wx', mode: 0o600 })
      assert.equal(privateNativeFile(descriptor), true)
      const bridge = new Client({ name: 'w1-core-probe', version: '0.1.0' })
      const transport = new StdioClientTransport({ command: process.execPath,
        args: [join(repository, 'scripts/native-core-stdio-bridge.mjs'), descriptor, workspace],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stderr: 'pipe' })
      transport.stderr?.resume()
      try {
        await bridge.connect(transport)
        const catalog = (await bridge.listTools()).tools.map(item => item.name)
        assert.deepEqual(catalog, [...binding.toolNames])
        const args = { schemaVersion: 1, kind, actor: { kind: 'AGENT', role }, ...scope,
          ...(role === 'HELPER' ? { question: 'Why use a discriminated union?', relatedConceptNames: [] } : {}) }
        const context = await bridge.callTool({ name: tool, arguments: args })
        if (context.isError) throw Object.assign(new Error('CORE_CONTEXT_FAILED'), {
          code: /^[A-Z_]{1,100}$/.test(context.structuredContent?.code) ? context.structuredContent.code : 'CORE_CONTEXT_FAILED', role,
          diagnostic: (context.content ?? []).filter(item => item.type === 'text').map(item => item.text)
            .join(' ').replace(/[A-Za-z]:[\\/][^\s"']*/g, '[PATH]').slice(0, 1000),
        })
        assert.notEqual(context.isError, true)
        if (role === 'HELPER') await writeFile(join(root, 'helper-context.json'), JSON.stringify(context.structuredContent), { mode: 0o600, flag: 'wx' })
        const wrong = await bridge.callTool({ name: tool, arguments: { ...args, projectId: `project_${randomUUID()}` } })
        assert.equal(wrong.isError, true)
        assert.equal(wrong.structuredContent?.code, 'AGENT_RUN_SCOPE_MISMATCH')
        if (role === 'HELPER') {
          assert.deepEqual(catalog, ['get_helper_context'])
          await assert.rejects(bridge.callTool({ name: 'request_user_decision', arguments: args }))
        }
        binding.revoke()
        await writeFile(descriptor, JSON.stringify({ status: 'REVOKED' }), { mode: 0o600 })
        await assert.rejects(bridge.callTool({ name: tool, arguments: args }))
        report.bridge[role] = { status: 'PASS', toolCount: catalog.length, scopeDenial: 'AGENT_RUN_SCOPE_MISMATCH', revoked: true }
      } finally {
        binding.revoke()
        await bridge.close()
        await binding.handler.close()
        handlers.delete(binding.path)
      }
    }
  } finally {
    await runtime.close()
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    storage.close()
  }
  const reopened = await openSqliteStorage({ dataDirectory: data })
  try {
    assert.deepEqual(reopened.checkIntegrity(), { quickCheck: 'ok', foreignKeyViolations: 0 })
    report.shutdown = 'PASS'
  } finally { reopened.close() }
  return report
}
