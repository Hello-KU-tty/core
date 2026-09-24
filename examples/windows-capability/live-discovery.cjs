const assert = require('node:assert/strict')
const { randomBytes, randomUUID } = require('node:crypto')
const { readFile, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

exports.run = async (vscode, repository, root, workspace, beforeTurn) => {
  const load = path => import(pathToFileURL(join(repository, path)).href)
  const { ApplicationService, WorkspacePathPolicy } = await load('packages/application/dist/index.js')
  const { openSqliteStorage } = await load('packages/storage-sqlite/dist/index.js')
  const { WorkflowRuntime } = await load('packages/runtime/dist/index.js')
  const { LocalCoreClient } = await load('packages/frontend-client/dist/index.js')
  const { createLocalServer } = await load('apps/local-backend/dist/server.js')
  const { createNativeCoreBinding } = await load('apps/local-backend/dist/native-core-binding.js')
  const { privateDirectory } = await load('apps/local-backend/dist/private-files.js')
  const data = await privateDirectory(join(root, 'native-discovery'))
  const storage = await openSqliteStorage({ dataDirectory: data })
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
  const descriptor = join(data, 'binding.json')
  let binding
  try {
    const client = new LocalCoreClient({ protocolVersion: 1, backendInstanceId: instanceId, baseUrl, token })
    const projectId = `project_${randomUUID()}`
    const correlationId = `corr_${randomUUID()}`
    await client.execute({ schemaVersion: 1, actor: { kind: 'UI' }, kind: 'UI_START_DISCOVERY',
      correlationId, projectId, idempotencyKey: `idem_${randomUUID()}`,
      input: { learningGoal: 'Learn TypeScript discriminated unions through a small local state viewer.' } })
    const snapshot = await client.restoreProject(projectId)
    const discoverySessionId = snapshot.discoverySession.id
    const scope = { projectId, correlationId, discoverySessionId }
    const toolNames = ['get_discovery_context', 'submit_candidate_previews']
    binding = createNativeCoreBinding({ application, role: 'DISCOVERY', ...scope, toolNames })
    handlers.set(binding.path, binding.handler)
    await writeFile(descriptor, JSON.stringify({ role: 'DISCOVERY', ...scope, workspace,
      url: baseUrl + binding.path, authorization: binding.authorization, toolNames,
      mode: 'PREVIEW', requestedCandidateIds: [] }), { mode: 0o600, flag: 'wx' })
    const configuration = {
      tools: toolNames.map(tool => `@vibe-native-core/${tool}`),
      mcpServers: { 'vibe-native-core': { command: process.execPath,
        args: [join(repository, 'scripts/native-core-stdio-bridge.mjs'), descriptor, workspace],
        env: { ELECTRON_RUN_AS_NODE: '1' }, timeout: 60000 } },
      permissions: { rules: [
        ...toolNames.map(tool => ({ capability: 'mcp', match: [`vibe-native-core/${tool}`], effect: 'allow' })),
        ...['fs_read', 'fs_write', 'shell', 'web_search'].map(capability => ({ capability, effect: 'deny' })),
      ] },
    }
    return await require('./native-metadata.cjs').probe(vscode, workspace, {
      role: 'DISCOVERY', name: `vibe-w1-discovery-${instanceId.slice(0, 8)}`, allowMcp: true, toolNames,
      configuration, beforeTurn,
      rolePrompt: await readFile(join(repository, 'docs/agent-prompts/discovery.md'), 'utf8'),
      message: 'Synthetic W1 PREVIEW phase only. Call get_discovery_context, then submit exactly 10 varied previews through submit_candidate_previews inputJson. Do not enrich or choose. Core-issued scope: ' + JSON.stringify(scope),
      record: async () => {
        const aggregate = storage.repository.readDiscoveryAggregate(projectId, discoverySessionId)
        assert.equal(aggregate?.previewRound?.previews.length, 10)
        return { stored: true, previewCount: 10, sessionRevision: aggregate.session.revision,
          previewRoundId: aggregate.previewRound.id }
      },
    })
  } finally {
    binding?.revoke()
    await writeFile(descriptor, JSON.stringify({ status: 'REVOKED' }), { mode: 0o600 })
    await binding?.handler.close()
    await runtime.close()
    server.closeAllConnections()
    await new Promise(done => server.close(done))
    storage.close()
  }
}
