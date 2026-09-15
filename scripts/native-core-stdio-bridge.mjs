// Experimental Kiro stdio MCP facade for one Core-issued HTTP run binding.
// Kiro's IDE Agent is the model; this process only relays fixed Core tools.
import { appendFile, lstat, readFile, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  Client,
  StreamableHTTPClientTransport,
} from '../apps/mcp-server/node_modules/@modelcontextprotocol/client/dist/index.mjs'
import { Server } from '../apps/mcp-server/node_modules/@modelcontextprotocol/server/dist/index.mjs'
import { StdioServerTransport } from '../apps/mcp-server/node_modules/@modelcontextprotocol/server/dist/stdio.mjs'
import { candidateIdSchema } from '../packages/contracts/dist/primitives.js'
import { restoreCoreProvenEmptyActiveDecisions } from './native-builder-transport.mjs'
import { describeCompletionInput } from './native-completion-diagnostic.mjs'
import { describeNativeCoreError } from './native-core-error-diagnostic.mjs'
import { previewInputFailure } from './native-discovery-preview-validation.mjs'
import {
  advertiseNativeEnrichment,
  bindNativeEnrichment,
  isNativeEnrichmentTool,
} from './native-discovery-enrichment.mjs'
import { restoreDiscoveryEmptyCollections } from './native-discovery-transport.mjs'
import {
  advertiseJsonEnvelope,
  decodeJsonEnvelope,
  envelopeFailureReceipt,
  isJsonEnvelopeTool,
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
    'start_task',
    'update_build_context',
    'request_user_decision',
    'get_decision_result',
    'apply_decision_result',
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
const descriptorPath = process.argv[2]
const expectedWorkspace = process.argv[3]
const receiptPath = process.env.VIBE_NATIVE_BRIDGE_RECEIPT_FILE

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
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || (fileInfo.mode & 0o077) !== 0)
    throw new Error('BRIDGE_DESCRIPTOR_UNSAFE')
  const binding = JSON.parse(await readFile(file, 'utf8'))
  if (
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
  return { binding, file, endpoint, canonical }
}

async function start() {
  const { binding, file, endpoint } = await loadBinding()
  const client = new Client({ name: 'vibe-helper-native-core-bridge', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: binding.authorization } },
  })
  await client.connect(transport)
  const listed = await client.listTools()
  const actualNames = listed.tools.map((tool) => tool.name)
  if (
    actualNames.length !== binding.toolNames.length ||
    actualNames.some((name) => !binding.toolNames.includes(name))
  ) {
    await client.close()
    throw new Error('BRIDGE_CORE_CATALOG_MISMATCH')
  }
  await receipt({ event: 'CORE_CATALOG_VERIFIED', role: binding.role, toolNames: actualNames })
  const server = new Server(
    { name: `vibe-native-${binding.role.toLowerCase()}-bridge`, version: '0.1.0' },
    { capabilities: { tools: {} } },
  )
  // Selected mutation tools use scalar envelopes because the pinned IDE parser
  // drops empty JSON containers. Original schemas stay in descriptions and
  // Core still validates each decoded Agent-authored object unchanged.
  server.setRequestHandler('tools/list', async () => ({
    tools: listed.tools.map((tool) =>
      advertiseNativeEnrichment(binding.role, advertiseJsonEnvelope(binding.role, tool)),
    ),
  }))
  server.setRequestHandler('tools/call', async (request) => {
    const name = request.params?.name
    if (typeof name !== 'string' || !binding.toolNames.includes(name))
      throw new Error('BRIDGE_TOOL_NOT_ALLOWED')
    const latest = JSON.parse(await readFile(file, 'utf8'))
    if (
      latest.role !== binding.role ||
      latest.workspace !== binding.workspace ||
      latest.projectId !== binding.projectId ||
      latest.taskId !== binding.taskId ||
      latest.discoverySessionId !== binding.discoverySessionId ||
      latest.mode !== binding.mode ||
      JSON.stringify(latest.requestedCandidateIds) !==
        JSON.stringify(binding.requestedCandidateIds) ||
      latest.correlationId !== binding.correlationId ||
      latest.url !== binding.url ||
      latest.authorization !== binding.authorization ||
      JSON.stringify(latest.toolNames) !== JSON.stringify(binding.toolNames)
    )
      throw new Error('BRIDGE_BINDING_REVOKED')
    const rawArguments = request.params.arguments ?? {}
    let envelope
    try {
      envelope = decodeJsonEnvelope(binding.role, name, rawArguments)
    } catch (error) {
      if (isJsonEnvelopeTool(binding.role, name))
        await receipt(envelopeFailureReceipt(binding.role, name, rawArguments, error))
      throw error
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
        const code =
          typeof error?.message === 'string' &&
          /^BRIDGE_(?:ENRICHMENT|ENVELOPE)_[A-Z_]+$/.test(error.message)
            ? error.message
            : 'BRIDGE_ENRICHMENT_FAILED'
        await receipt({ event: 'NATIVE_ENRICHMENT_INPUT_REJECTED', role: binding.role, code })
        throw new Error(code)
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
    const result = await client.callTool({ name, arguments: normalized.input })
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
  await receipt({ event: 'STDIO_BRIDGE_READY', role: binding.role })
}

await start().catch((error) => {
  const code =
    error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message)
      ? error.message
      : 'BRIDGE_START_OR_TOOL_FAILED'
  process.stderr.write(`${code}\n`)
  process.exitCode = 1
})
