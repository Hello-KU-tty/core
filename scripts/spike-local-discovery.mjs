// Live T19 transport gate: real Discovery model -> run-scoped HTTP MCP -> Core.
// Never loads the user's Crew DB, tools or project. Leaves synthetic temp data.
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ApplicationService, WorkspacePathPolicy } from '../packages/application/dist/index.js'
import { KiroAcpSession } from '../packages/kiro-adapter/dist/acp-client-node.js'
import { createDiscoveryEphemeralContext } from '../packages/kiro-adapter/dist/crew-app-client.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'
import { createRoleBoundMcpHttpHandler } from '../apps/mcp-server/dist/role-server.js'
import { createCrewBackendServer } from '../apps/crew-backend/dist/server.js'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-t19-discovery-'))
const workspaces = join(runtimeRoot, 'workspaces')
const agentWorkspace = join(runtimeRoot, 'agent')
await mkdir(workspaces, { recursive: true })
await mkdir(join(agentWorkspace, '.kiro', 'agents'), { recursive: true })
const storage = await openSqliteStorage({ dataDirectory: join(runtimeRoot, 'data') })
const application = new ApplicationService({
  storage,
  workspacePolicy: await WorkspacePathPolicy.create(workspaces),
})
const projectId = `project_${randomUUID()}`
const correlationId = `corr_${randomUUID()}`
const meta = { schemaVersion: 1, actor: { kind: 'UI' }, correlationId }
const requireSuccess = (result) => {
  if (!result.success) throw new Error(result.error.code)
  return result.data
}
const restore = async (prepare = false) =>
  requireSuccess(
    await application.executeUi({
      ...meta,
      kind: prepare ? 'UI_PREPARE_DISCOVERY_AGENT_CONTEXT' : 'UI_RESTORE_PROJECT_SESSION',
      projectId,
      helperConversationLimit: 5,
    }),
  )
const handlers = {}
const server = createCrewBackendServer({
  application,
  proxySecret: randomBytes(32).toString('hex'),
  mcpHandlers: handlers,
})
await new Promise((resolveListen, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolveListen)
})
const baseUrl = `http://127.0.0.1:${server.address().port}`
let currentSession
const record = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)

async function run(phase, snapshot, purpose, selected = [], instruction = '') {
  const startedAt = performance.now()
  const definition = JSON.parse(
    await readFile(join(repository, 'agents', `vibe-helper-discovery-${phase}.json`), 'utf8'),
  )
  const mcpName = `vibe-helper-local-${phase}`
  const path = `/mcp/${phase}`
  const credential = `Bearer ${randomBytes(32).toString('hex')}`
  let active = true
  const toolNames =
    phase === 'preview'
      ? ['get_discovery_context', 'submit_candidate_previews']
      : phase === 'enrichment'
        ? ['get_discovery_context', 'submit_candidate_enrichments']
        : phase === 'spec'
          ? ['submit_learning_spec']
          : ['get_discovery_context', 'submit_candidate_round']
  const handler = createRoleBoundMcpHttpHandler({
    role: 'DISCOVERY',
    application,
    toolNames,
    binding: {
      projectId,
      correlationId,
      discoverySessionId: snapshot.discoverySession.id,
      isActive: () => active,
    },
  })
  handlers[path] = {
    fetch: (request) => {
      const supplied = Buffer.from(request.headers.get('authorization') ?? '')
      const expected = Buffer.from(credential)
      if (!active || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        return Promise.resolve(new Response(null, { status: 401 }))
      }
      return handler.fetch(request)
    },
    close: () => handler.close(),
  }
  await writeFile(
    join(agentWorkspace, '.kiro', 'agents', `${definition.name}.json`),
    `${JSON.stringify({
      name: definition.name,
      description: definition.description,
      prompt: definition.prompt,
      model: 'claude-haiku-4.5',
      includeMcpJson: false,
      resources: [],
      tools: [`@${mcpName}`],
      allowedTools: [`@${mcpName}`],
      mcpServers: {
        [mcpName]: {
          url: `${baseUrl}${path}`,
          headers: { Authorization: credential },
          timeout: 60_000,
        },
      },
    })}\n`,
    { mode: 0o600 },
  )
  const counts = { text: 0, tools: 0, denied: 0 }
  record({ phase: 'STARTED', purpose })
  try {
    currentSession = await KiroAcpSession.connect({
      executable: process.env.VIBE_HELPER_KIRO_CLI ?? 'kiro-cli',
      cwd: agentWorkspace,
      agent: definition.name,
      model: 'claude-haiku-4.5',
      turnTimeoutMs: 240_000,
      onEvent: (event) => {
        if (event.kind === 'TEXT') counts.text++
        if (event.kind === 'TOOL') counts.tools++
        if (event.kind === 'PERMISSION_DENIED') counts.denied++
      },
    })
    await currentSession.prompt(
      [
        'Run this synthetic integration request using your exact phase policy.',
        `Validated Core context: ${createDiscoveryEphemeralContext(snapshot, purpose, selected)}`,
        `Tool metadata: ${JSON.stringify({
          schemaVersion: 1,
          projectId,
          discoverySessionId: snapshot.discoverySession.id,
          correlationId,
          expectedSessionRevision: snapshot.discoverySession.revision,
          idempotencyKey: `idem_${randomUUID()}`,
        })}`,
        instruction,
      ].join('\n'),
    )
    record({
      phase: 'TURN_ENDED',
      purpose,
      durationMs: Math.round(performance.now() - startedAt),
      ...counts,
    })
  } finally {
    active = false
    await currentSession?.close()
    currentSession = undefined
    await handler.close()
    delete handlers[path]
  }
}

try {
  requireSuccess(
    await application.executeUi({
      ...meta,
      kind: 'UI_START_DISCOVERY',
      projectId,
      idempotencyKey: `idem_${randomUUID()}`,
      input: {
        learningGoal: 'TypeScript discriminated unions and exhaustive state transitions',
        personalNeed:
          'A tiny local tool for practising keyboard shortcuts, without accounts or hosted storage.',
      },
    }),
  )
  let snapshot = await restore(true)
  await run('preview', snapshot, 'PREVIEW')
  snapshot = await restore()
  if (snapshot.discoveryContext.previewRound?.previews.length !== 10)
    throw new Error('NO_DURABLE_PREVIEWS')
  const selected = snapshot.discoveryContext.previewRound.previews[0]
  record({
    phase: 'DURABLE_PREVIEWS',
    count: 10,
    sessionRevision: snapshot.discoverySession.revision,
  })
  await run('enrichment', await restore(true), 'ENRICH_SELECTED', [selected.candidateId])
  snapshot = await restore()
  if (
    !snapshot.discoveryContext.candidateEnrichments.some(
      (item) => item.candidate.id === selected.candidateId,
    )
  ) {
    throw new Error('NO_DURABLE_ENRICHMENT')
  }
  const feedback = {
    schemaVersion: 1,
    id: `feedback_${randomUUID()}`,
    discoverySessionId: snapshot.discoverySession.id,
    roundId: snapshot.discoveryContext.previewRound.finalRoundId,
    correlationId,
    intent: 'SELECT',
    targets: [{ candidateId: selected.candidateId, revision: 1 }],
    createdAt: new Date().toISOString(),
    source: { kind: 'USER' },
    redactionStatus: 'NOT_REQUIRED',
  }
  requireSuccess(
    await application.executeUi({
      ...meta,
      kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
      idempotencyKey: `idem_${randomUUID()}`,
      expectedSessionRevision: snapshot.discoverySession.revision,
      feedback,
    }),
  )
  await run('spec', await restore(true), 'SPEC')
  snapshot = await restore()
  if (snapshot.learningSpec?.status !== 'DRAFT' || snapshot.learningSpec.revision !== 1)
    throw new Error('NO_DURABLE_SPEC')
  record({
    phase: 'COMPLETED',
    runtimeRoot,
    previews: 10,
    selectedCandidateMatches: snapshot.selectedCandidate?.id === selected.candidateId,
    specRevision: snapshot.learningSpec.revision,
    projectStatus: snapshot.project.status,
  })
} catch (error) {
  record({ phase: 'FAILED', runtimeRoot, code: error.code ?? error.message })
  process.exitCode = 1
} finally {
  await currentSession?.close()
  server.closeAllConnections()
  await new Promise((resolveClose) => server.close(resolveClose))
  storage.close()
}
