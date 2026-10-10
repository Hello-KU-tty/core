// Experimental Kiro stdio MCP facade for one Core-issued HTTP run binding.
// Kiro's IDE Agent is the model; this process only relays fixed Core tools.
import { appendFile, lstat, readFile, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  Client,
  StreamableHTTPClientTransport,
} from '../apps/mcp-server/node_modules/@modelcontextprotocol/client/dist/index.mjs'
import { Server } from '../apps/mcp-server/node_modules/@modelcontextprotocol/server/dist/index.mjs'
import { StdioServerTransport } from '../apps/mcp-server/node_modules/@modelcontextprotocol/server/dist/stdio.mjs'
import nativePrivatePaths from '../examples/kiro-native-host/native-private-directory.cjs'
import { candidateIdSchema } from '../packages/contracts/dist/primitives.js'
import { createBridgeLifecycle } from './native-bridge-lifecycle.mjs'
import { restoreCoreProvenEmptyActiveDecisions } from './native-builder-transport.mjs'
import { describeCompletionInput } from './native-completion-diagnostic.mjs'
import { describeNativeCoreError } from './native-core-error-diagnostic.mjs'
import {
  advertiseNativeEnrichment,
  bindNativeEnrichment,
  isNativeEnrichmentTool,
  nativeEnrichmentFailure,
  nativeEnrichmentToolError,
} from './native-discovery-enrichment.mjs'
import { previewInputFailure } from './native-discovery-preview-validation.mjs'
import { restoreDiscoveryEmptyCollections } from './native-discovery-transport.mjs'
import {
  advertiseJsonEnvelope,
  decodeJsonEnvelope,
  envelopeFailureReceipt,
  isJsonEnvelopeTool,
  jsonEnvelopeToolError,
} from './native-json-envelope.mjs'
import { allowedNativeReceipt } from './native-receipt-scope.mjs'

const ROLE_TOOLS = {
  DISCOVERY: [
    'get_discovery_context',
    'submit_candidate_previews',
    'submit_candidate_enrichments',
    'submit_candidate_round',
    'submit_candidate_merge',
    'submit_learning_spec',
  ],
  BUILDER: [
    'get_builder_task',
    'get_build_status',
    'start_task',
    'update_build_context',
    'request_user_decision',
    'get_decision_result',
    'apply_decision_result',
    'resolve_decision_from_chat',
    'complete_task',
  ],
  HELPER: ['get_helper_context'],
}
const DISCOVERY_MODES = new Set([
  'PREVIEW',
  'ENRICH_FIRST',
  'ENRICH_SECOND',
  'ENRICH_SELECTED',
  'ROUND',
  'MERGE',
  'SPEC',
  'SPEC_RECOVERY',
])
// Kiro waits 60 s for an MCP server by default. A Project connection (Kiro-native) may start
// before the Core that restores it, so its bridge waits for Core within that window.
const STARTUP_WAIT_MS = 45_000
const NOT_READY = new Set(['ENOENT', 'BRIDGE_BINDING_NOT_READY'])
const descriptorPath = process.argv[2]
const expectedWorkspace = process.argv[3]
const receiptPath = process.env.VIBE_NATIVE_BRIDGE_RECEIPT_FILE
const lifecycle = createBridgeLifecycle()
lifecycle.stage('PROCESS_STARTED')

async function receipt(event) {
  if (!receiptPath) return
  if (!allowedNativeReceipt(receiptPath, descriptorPath))
    throw new Error('BRIDGE_RECEIPT_PATH_INVALID')
  const info = await lstat(receiptPath).catch((error) => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  if (
    info &&
    (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077) !== 0)
  )
    throw new Error('BRIDGE_RECEIPT_FILE_UNSAFE')
  await appendFile(receiptPath, `${JSON.stringify(event)}\n`, { mode: 0o600 })
}

async function loadBinding() {
  if (!descriptorPath || !expectedWorkspace) throw new Error('BRIDGE_SCOPE_REQUIRED')
  const file = resolve(descriptorPath)
  const fileInfo = await lstat(file)
  if (
    !fileInfo.isFile() ||
    fileInfo.isSymbolicLink() ||
    fileInfo.nlink !== 1 ||
    (process.platform === 'win32'
      ? !nativePrivatePaths.privateNativeFile(file)
      : (fileInfo.mode & 0o077) !== 0)
  )
    throw new Error('BRIDGE_DESCRIPTOR_UNSAFE')
  const raw = await readFile(file, 'utf8')
  const binding = JSON.parse(raw)
  if (binding?.status === 'REVOKED') throw new Error('BRIDGE_BINDING_NOT_READY')
  if (
    (binding.lifecycle !== undefined && binding.lifecycle !== 'PROJECT') ||
    !Object.hasOwn(ROLE_TOOLS, binding.role) ||
    (binding.role === 'DISCOVERY'
      ? typeof binding.discoverySessionId !== 'string' || binding.taskId !== undefined
      : typeof binding.taskId !== 'string' || binding.discoverySessionId !== undefined) ||
    !Array.isArray(binding.toolNames) ||
    binding.toolNames.length === 0 ||
    binding.toolNames.length !== new Set(binding.toolNames).size ||
    binding.toolNames.some((name) => !ROLE_TOOLS[binding.role].includes(name)) ||
    (binding.role === 'DISCOVERY' &&
      (!DISCOVERY_MODES.has(binding.mode) ||
        !Array.isArray(binding.requestedCandidateIds) ||
        binding.requestedCandidateIds.length > 10 ||
        binding.requestedCandidateIds.some((id) => !candidateIdSchema.safeParse(id).success) ||
        new Set(binding.requestedCandidateIds).size !== binding.requestedCandidateIds.length ||
        (binding.mode === 'ENRICH_SELECTED'
          ? binding.requestedCandidateIds.length === 0
          : binding.requestedCandidateIds.length !== 0))) ||
    typeof binding.authorization !== 'string' ||
    !/^Bearer [0-9a-f]{64}$/.test(binding.authorization) ||
    typeof binding.workspace !== 'string' ||
    typeof binding.url !== 'string'
  )
    throw new Error('BRIDGE_DESCRIPTOR_INVALID')
  const canonical = await realpath(binding.workspace)
  if (canonical !== (await realpath(expectedWorkspace)))
    throw new Error('BRIDGE_WORKSPACE_MISMATCH')
  const endpoint = new URL(binding.url)
  if (
    endpoint.protocol !== 'http:' ||
    endpoint.hostname !== '127.0.0.1' ||
    endpoint.username ||
    endpoint.password ||
    !/^\/mcp\/native-[0-9a-f-]{36}$/.test(endpoint.pathname) ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error('BRIDGE_ENDPOINT_INVALID')
  return { binding, file, endpoint, canonical, raw }
}

async function connectCore({ binding, endpoint }) {
  const client = new Client({ name: 'vibe-helper-native-core-bridge', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: binding.authorization } },
  })
  await client.connect(transport)
  try {
    return { client, listed: await client.listTools() }
  } catch (error) {
    await client.close().catch(() => undefined)
    throw error
  }
}

const notReady = (error, loaded) =>
  NOT_READY.has(error?.code) ||
  NOT_READY.has(error?.message) ||
  // A Project descriptor that still names a Core which is gone or not listening yet.
  (loaded?.binding.lifecycle === 'PROJECT' && !/^BRIDGE_[A-Z_]+$/.test(error?.message ?? ''))

// Returned as a tool result so the Agent can keep working and try again; never a mock success.
const notConnectedResult = () => {
  const payload = {
    code: 'VIBE_HELPER_NOT_CONNECTED',
    message:
      'Vibe Helper Core is not connected right now (Kiro may still be starting it). Keep working on parts that need no learner decision, do not ask a real decision before Core records it, and call this tool again in a few seconds.',
  }
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: true }
}

async function start() {
  const deadline = Date.now() + STARTUP_WAIT_MS
  let loaded
  let connection
  for (;;) {
    loaded = undefined
    try {
      loaded = await loadBinding()
      lifecycle.stage('BINDING_VALIDATED')
      lifecycle.stage('CORE_CONNECTING')
      connection = await connectCore(loaded)
      break
    } catch (error) {
      if (!notReady(error, loaded) || Date.now() > deadline) throw error
      await delay(1000)
    }
  }
  let { binding } = loaded
  // The descriptor text last validated. Unchanged text needs no new check (on Windows each check
  // inspects the file's ACL through PowerShell).
  let validatedRaw = loaded.raw
  let { client } = connection
  const { listed } = connection
  lifecycle.stage('CORE_CONNECTED')
  lifecycle.stage('CORE_TOOLS_LISTED')
  const actualNames = listed.tools.map((tool) => tool.name)
  if (
    actualNames.length !== binding.toolNames.length ||
    actualNames.some((name) => !binding.toolNames.includes(name))
  ) {
    await client.close()
    throw new Error('BRIDGE_CORE_CATALOG_MISMATCH')
  }
  await receipt({ event: 'CORE_CATALOG_VERIFIED', role: binding.role, toolNames: actualNames })
  lifecycle.stage('CORE_CATALOG_VERIFIED')
  const server = new Server(
    { name: `vibe-native-${binding.role.toLowerCase()}-bridge`, version: '0.1.0' },
    { capabilities: { tools: {} } },
  )
  // Selected mutation tools use scalar envelopes because the pinned IDE parser
  // drops empty JSON containers. Original schemas stay in descriptions and
  // Core still validates each decoded Agent-authored object unchanged.
  server.oninitialized = () => lifecycle.stage('STDIO_INITIALIZED')
  server.setRequestHandler('tools/list', async () => {
    lifecycle.stage('STDIO_TOOLS_LISTED')
    return {
      tools: listed.tools.map((tool) =>
        advertiseNativeEnrichment(binding.role, advertiseJsonEnvelope(binding.role, tool)),
      ),
    }
  })
  server.setRequestHandler('tools/call', async (request) => {
    const name = request.params?.name
    if (typeof name !== 'string' || !binding.toolNames.includes(name))
      throw new Error('BRIDGE_TOOL_NOT_ALLOWED')
    // Each call re-reads the descriptor. A run binding must stay exactly the same. A Project
    // binding may be rewritten for the same folder, Project and role (a new Core after a restart
    // or a rebind); the bridge then follows it, and waits while no Core is connected.
    let latest = binding
    let latestRaw = validatedRaw
    const current = await readFile(resolve(descriptorPath), 'utf8').catch(() => null)
    if (current !== validatedRaw) {
      try {
        const loaded = await loadBinding()
        latest = loaded.binding
        latestRaw = loaded.raw
      } catch (error) {
        if (binding.lifecycle === 'PROJECT' && notReady(error)) return notConnectedResult()
        throw new Error('BRIDGE_BINDING_REVOKED')
      }
    }
    const sameScope =
      latest.role === binding.role &&
      latest.workspace === binding.workspace &&
      latest.projectId === binding.projectId &&
      latest.discoverySessionId === binding.discoverySessionId &&
      latest.mode === binding.mode &&
      JSON.stringify(latest.requestedCandidateIds) ===
        JSON.stringify(binding.requestedCandidateIds) &&
      JSON.stringify(latest.toolNames) === JSON.stringify(binding.toolNames)
    const sameConnection =
      latest.taskId === binding.taskId &&
      latest.correlationId === binding.correlationId &&
      latest.url === binding.url &&
      latest.authorization === binding.authorization
    if (
      !sameScope ||
      (!sameConnection && (binding.lifecycle !== 'PROJECT' || latest.lifecycle !== 'PROJECT'))
    )
      throw new Error('BRIDGE_BINDING_REVOKED')
    if (!sameConnection) {
      let next
      try {
        next = await connectCore(await loadBinding())
      } catch {
        return notConnectedResult()
      }
      const names = next.listed.tools.map((tool) => tool.name)
      if (
        names.length !== binding.toolNames.length ||
        names.some((tool) => !binding.toolNames.includes(tool))
      ) {
        await next.client.close().catch(() => undefined)
        throw new Error('BRIDGE_CORE_CATALOG_MISMATCH')
      }
      await client.close().catch(() => undefined)
      client = next.client
      binding = latest
      await receipt({ event: 'PROJECT_BINDING_FOLLOWED', role: binding.role })
    }
    validatedRaw = latestRaw
    const rawArguments = request.params.arguments ?? {}
    let envelope
    try {
      envelope = decodeJsonEnvelope(binding.role, name, rawArguments)
    } catch (error) {
      if (isJsonEnvelopeTool(binding.role, name))
        await receipt(envelopeFailureReceipt(binding.role, name, rawArguments, error))
      return jsonEnvelopeToolError(error)
    }
    if (envelope.decoded)
      await receipt({
        event: `${binding.role}_JSON_ENVELOPE_DECODED`,
        role: binding.role,
        toolName: name,
      })
    let nativeEnrichment = null
    if (isNativeEnrichmentTool(binding.role, name)) {
      try {
        nativeEnrichment = await bindNativeEnrichment(binding, name, rawArguments, async () => {
          const state = await client.callTool({
            name: 'get_discovery_context',
            arguments: {
              schemaVersion: 1,
              kind: 'DISCOVERY_GET_CONTEXT',
              actor: { kind: 'AGENT', role: 'DISCOVERY' },
              projectId: binding.projectId,
              discoverySessionId: binding.discoverySessionId,
              correlationId: binding.correlationId,
            },
          })
          return state.isError === true ? null : state.structuredContent
        })
      } catch (error) {
        const failure = nativeEnrichmentFailure(error)
        await receipt({
          event: 'NATIVE_ENRICHMENT_INPUT_REJECTED',
          role: binding.role,
          ...failure,
        })
        return nativeEnrichmentToolError(failure)
      }
      await receipt({
        event: 'NATIVE_ENRICHMENT_IMMUTABLE_FROM_CORE',
        role: binding.role,
        batch: nativeEnrichment.batch,
        candidateCount: nativeEnrichment.candidateCount,
      })
    }
    let normalized =
      nativeEnrichment?.bound || envelope.decoded
        ? { input: nativeEnrichment?.input ?? envelope.input, restored: [] }
        : await restoreDiscoveryEmptyCollections(binding, name, rawArguments, async () => {
            const state = await client.callTool({
              name: 'get_discovery_context',
              arguments: {
                schemaVersion: 1,
                kind: 'DISCOVERY_GET_CONTEXT',
                actor: { kind: 'AGENT', role: 'DISCOVERY' },
                projectId: binding.projectId,
                discoverySessionId: binding.discoverySessionId,
                correlationId: binding.correlationId,
              },
            })
            return state.isError === true ? null : state.structuredContent
          })
    if (binding.role === 'BUILDER' && name === 'update_build_context' && !envelope.decoded)
      normalized = await restoreCoreProvenEmptyActiveDecisions(
        binding,
        name,
        normalized.input,
        async () => {
          const state = await client.callTool({
            name: 'get_builder_task',
            arguments: {
              schemaVersion: 1,
              kind: 'BUILDER_GET_TASK',
              actor: { kind: 'AGENT', role: 'BUILDER' },
              projectId: binding.projectId,
              taskId: binding.taskId,
              correlationId: binding.correlationId,
            },
          })
          return state.isError === true ? null : state.structuredContent
        },
      )
    if (normalized.restored.length > 0)
      await receipt({
        event:
          binding.role === 'BUILDER'
            ? 'BUILDER_EMPTY_ACTIVE_DECISIONS_RESTORED'
            : normalized.input.expectedSessionRevision === 1
              ? 'INITIAL_EMPTY_COLLECTIONS_RESTORED'
              : 'ROUND_EMPTY_COLLECTIONS_RESTORED',
        role: binding.role,
        names: normalized.restored,
      })
    else if (
      binding.role === 'BUILDER' &&
      name === 'update_build_context' &&
      !envelope.decoded &&
      rawArguments &&
      typeof rawArguments === 'object' &&
      !Array.isArray(rawArguments) &&
      !Object.hasOwn(rawArguments, 'activeDecisionIds')
    )
      await receipt({
        event: 'BUILDER_EMPTY_ACTIVE_DECISIONS_NOT_RESTORED',
        role: binding.role,
        reason: normalized.skipReason ?? 'BUILDER_GUARD_NOT_APPLICABLE',
      })
    else if (
      binding.role === 'DISCOVERY' &&
      name === 'submit_candidate_round' &&
      rawArguments &&
      typeof rawArguments === 'object' &&
      !Array.isArray(rawArguments) &&
      !Object.hasOwn(rawArguments, 'carriedCandidates') &&
      Number.isSafeInteger(rawArguments.expectedSessionRevision) &&
      rawArguments.expectedSessionRevision > 1
    )
      await receipt({
        event: 'ROUND_EMPTY_CARRY_NOT_RESTORED',
        role: binding.role,
        reason: normalized.skipReason ?? 'ROUND_GUARD_NOT_APPLICABLE',
        candidatesEncoding: Array.isArray(rawArguments.candidates)
          ? 'ARRAY'
          : typeof rawArguments.candidates === 'string'
            ? 'STRING'
            : 'OTHER',
        appliedFeedbackIdsEncoding: Array.isArray(rawArguments.appliedFeedbackIds)
          ? 'ARRAY'
          : typeof rawArguments.appliedFeedbackIds === 'string'
            ? 'STRING'
            : 'OTHER',
        schemaVersionPresent: Object.hasOwn(rawArguments, 'schemaVersion'),
      })
    if (binding.role === 'BUILDER' && name === 'complete_task')
      await receipt({
        event: 'BUILDER_COMPLETION_INPUT_SHAPE',
        role: binding.role,
        ...describeCompletionInput(normalized.input),
      })
    if (binding.role === 'DISCOVERY' && name === 'submit_candidate_previews' && envelope.decoded) {
      const preflight = previewInputFailure(binding, normalized.input)
      if (preflight) {
        await receipt(preflight.receipt)
        return preflight.result
      }
    }
    await receipt({ event: 'CORE_TOOL_REQUESTED', role: binding.role, toolName: name })
    let result
    try {
      result = await client.callTool({ name, arguments: normalized.input })
    } catch (error) {
      // The descriptor still names a Core that stopped; the next Core rewrites it.
      if (binding.lifecycle === 'PROJECT') return notConnectedResult()
      throw error
    }
    await receipt({
      event: 'CORE_TOOL_RESULT',
      role: binding.role,
      toolName: name,
      isError: result.isError === true,
      ...(result.isError === true ? describeNativeCoreError(result) : {}),
      errorCode:
        result.isError === true &&
        typeof result.structuredContent?.code === 'string' &&
        /^[A-Z0-9_]{1,100}$/.test(result.structuredContent.code)
          ? result.structuredContent.code
          : null,
      taskMatch:
        name === 'get_builder_task' ? result.structuredContent?.task?.id === binding.taskId : null,
      structuredSuccess:
        typeof result.structuredContent?.success === 'boolean'
          ? result.structuredContent.success
          : null,
    })
    return result
  })
  let closing = false
  const close = async () => {
    if (closing) return
    closing = true
    await server.close().catch(() => undefined)
    await client.close().catch(() => undefined)
    lifecycle.stage('CLOSED')
  }
  process.once('SIGTERM', () => {
    void close()
  })
  process.once('SIGINT', () => {
    void close()
  })
  process.stdin.once('end', () => {
    void close()
  })
  await server.connect(new StdioServerTransport())
  lifecycle.stage('STDIO_READY')
  await receipt({ event: 'STDIO_BRIDGE_READY', role: binding.role })
}

await start().catch((error) => {
  lifecycle.failed()
  const code =
    error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message)
      ? error.message
      : 'BRIDGE_START_OR_TOOL_FAILED'
  process.stderr.write(`${code}\n`)
  process.exitCode = 1
})
