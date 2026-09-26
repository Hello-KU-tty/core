// Experimental, version-pinned access to Kiro's private local Agent mux.
// This module never reads a Kiro credential store or exports a generic RPC surface.
const { readFileSync, realpathSync, lstatSync } = require('node:fs')
const { createHash } = require('node:crypto')
const { join, resolve, relative, isAbsolute, basename, dirname } = require('node:path')
const { homedir } = require('node:os')
const { selectDiscoveryHaikuModel, selectBuiltinAnalystHaikuModel,
  selectBuiltinAnalystModel, availableBuiltinAnalystModels } =
  require('./native-model.cjs')
const { attestSessionMemoryDisabled } = require('./native-memory-attestation.cjs')
const { inspectProtectedBuiltinFlags } = require('./native-protected-tools.cjs')
const { attestPinnedKiroInstallation, attestWindowsKiroInstallation } = require('./native-installation-source.cjs')
const { privateNativeDirectory } = require('./native-private-directory.cjs')
const { assertCloudConfigAbsent, waitForOwnedCloudPull } =
  require('./native-cloud-pull-attestation.cjs')
const { waitForOwnedSilentCloudPull } = require('./native-cloud-silent-attestation.cjs')
const { withScopedCloudDebug } = require('./native-cloud-debug-scope.cjs')

const EXPECTED = Object.freeze({ vscode: '1.109.5', kiroExtensions: ['1.0.653', '1.0.794'] })
const D_WORKSPACE_NAME = 'project_efc36445-7551-495f-bf4e-c66b82c871a8'
const SUBAGENT_PROBE_AGENTS = Object.freeze({ parent: 'vibe-single-host-parent',
  a: 'vibe-single-host-a', b: 'vibe-single-host-b' })
const INVOKE_AGENTS = Object.freeze({ parent: 'vibe-single-invoke-parent',
  a: 'vibe-single-invoke-a', b: 'vibe-single-invoke-b' })
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024
// Keep the Builder's 600 s native RPC as a hard guard. Request cancellation
// while its response is still observable, with time left on the 660 s relay lease.
const BUILDER_PROMPT_SOFT_TIMEOUT_MS = 590_000
const BUILDER_LEASE_HEADROOM_MS = 15_000
const SECRET_PREFIX = /(?:["']?\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password|secret|token)\b["']?\s*(?:[:=]\s*)?|\bBearer\s*)$/i
const CORE_ACTIONS = new Set([
  'DISCOVERY_GET_CONTEXT', 'DISCOVERY_SUBMIT_CANDIDATE_PREVIEWS',
  'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS', 'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
  'DISCOVERY_SUBMIT_LEARNING_SPEC', 'BUILDER_GET_TASK', 'BUILDER_START_TASK',
  'BUILDER_UPDATE_LIVE_CONTEXT', 'BUILDER_REQUEST_DECISION',
  'BUILDER_GET_DECISION_RESULT', 'BUILDER_APPLY_DECISION',
  'BUILDER_COMPLETE_TASK', 'HELPER_GET_CONTEXT', 'HELPER_REQUEST_CONTEXT_REFRESH',
])
// The bridge owns these codes. Never forward an ACP error message or echoed
// inputJson: only one exact, known code may cross the diagnostic boundary.
const BRIDGE_ENVELOPE_CODES = new Set([
  'BRIDGE_ENVELOPE_SCHEMA_TOO_LARGE', 'BRIDGE_ENVELOPE_WRAPPER_INVALID',
  'BRIDGE_ENVELOPE_JSON_REQUIRED', 'BRIDGE_ENVELOPE_JSON_TOO_LARGE',
  'BRIDGE_ENVELOPE_JSON_INVALID', 'BRIDGE_ENVELOPE_OBJECT_REQUIRED',
  'BRIDGE_ENVELOPE_UNKNOWN',
])
function bridgeEnvelopeErrorCode(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null
  const candidates = [output.code, output.message, output.error?.code,
    output.error?.message, output.structuredContent?.code]
  if (Array.isArray(output.content))
    for (const item of output.content.slice(0, 8))
      if (item?.type === 'text') candidates.push(item.text)
  const found = new Set()
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.length > 4096) continue
    for (const match of candidate.matchAll(/\bBRIDGE_ENVELOPE_[A-Z_]{1,80}\b/g))
      if (BRIDGE_ENVELOPE_CODES.has(match[0])) found.add(match[0])
  }
  return found.size === 1 ? [...found][0] : null
}
function envelopeInputAction(inputJson) {
  if (typeof inputJson !== 'string' || Buffer.byteLength(inputJson, 'utf8') > 131_072)
    return null
  try {
    const input = JSON.parse(inputJson)
    return input && typeof input === 'object' && !Array.isArray(input) &&
      CORE_ACTIONS.has(input.kind) ? input.kind : null
  } catch { return null }
}
function protectedToolClass(update) {
  const id = update?._meta?.kiro?.toolId
  if (id === 'todo_list') return 'TOOL_TODO_LIST'
  if (id === 'update_session_information') return 'TOOL_SESSION_INFORMATION'
  if (id === 'tool_search') return 'TOOL_SEARCH'
  if (id === 'memory') return 'TOOL_MEMORY'
  if (id === 'knowledge') return 'TOOL_KNOWLEDGE'
  if (id === 'list_processes' || id === 'get_process_output')
    return 'TOOL_PROCESS_INTROSPECTION'
  return typeof id === 'string' && id.length > 0 ?
    'TOOL_ID_PRESENT_OTHER' : 'TOOL_ID_MISSING'
}
// ACP's structured kind must agree with the corresponding input shape. A
// display title is never authority for a native file or shell permission.
function nativeToolName(update) {
  const input = update?.rawInput
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  if (update.kind === 'read' && typeof input.path === 'string') return 'read'
  if (update.kind === 'search' && typeof input.path === 'string') return 'search'
  if (update.kind === 'edit' && typeof input.path === 'string') return 'write'
  if (update.kind === 'execute' && typeof input.command === 'string') return 'shell'
  return null
}

function safeRelativePath(workspace, path) {
  if (typeof path !== 'string' || path.length > 512) return null
  const location = relative(realpathSync(workspace), resolve(realpathSync(workspace), path))
  if (location === '') return '.'
  return location && location !== '..' && !location.startsWith(`..${require('node:path').sep}`) &&
    !isAbsolute(location) && !location.split(/[\\/]/).includes('.kiro') &&
    /^[A-Za-z0-9._/-]{1,160}$/.test(location) ? location : null
}

function safeNativeCommand(command, redactText, workspace) {
  if (typeof command !== 'string' || command.length > 160 || !redactText ||
      redactText(command, workspace) !== command ||
      command.includes('..') || command.includes('~') || /[;&|`$<>\n\r]/.test(command) ||
      /(^|\s)\//.test(command)) return null
  const logical = command.startsWith('.\\.kiro\\vibe-tools.cmd ') ?
    command.slice('.\\.kiro\\vibe-tools.cmd '.length) : command
  return [
    /^pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile$/,
    /^node --test(?: [A-Za-z0-9._/:=-]+)*$/,
    /^pnpm test(?: [A-Za-z0-9._/:=,-]+)*$/,
    /^pnpm rebuild esbuild$/,
    /^pnpm run [a-zA-Z0-9:_-]+(?: -- [A-Za-z0-9._/:=,-]+)*$/,
    /^pnpm install --frozen-lockfile$/,
    /^npm test(?: -- [A-Za-z0-9._/:=,-]+)*$/,
    /^npm run [a-zA-Z0-9:_-]+(?: -- [A-Za-z0-9._/:=,-]+)*$/,
    /^npm install(?: --include=dev)?$/,
  ].some(pattern => pattern.test(logical)) ? command : null
}

class NativeGateError extends Error {
  constructor(code) {
    super(code)
    this.name = 'NativeGateError'
    this.code = code
  }
}

// Product activation must not evaluate developer-only probe modules: their
// source layout intentionally resolves an inert repo script that is absent
// from an installed product extension. Load and cross-check those modules only
// after an explicit capability-probe request reaches the existing probe gate.
function loadCapabilityProbe(invoke) {
  const probe = typeof __VIBE_PORTABLE_HOST__ !== 'undefined' && __VIBE_PORTABLE_HOST__ ? null :
    invoke ? require('./single-host-invoke-probe.cjs') :
    require('./single-host-subagent-probe.cjs')
  if (!probe) throw new NativeGateError('NATIVE_LEGACY_PROBE_NOT_PACKAGED')
  const agents = invoke ? INVOKE_AGENTS : SUBAGENT_PROBE_AGENTS
  const workspaceName = invoke ? basename(probe.APPROVED_WORKSPACE) : probe.D_WORKSPACE_NAME
  if (workspaceName !== D_WORKSPACE_NAME ||
      JSON.stringify(probe.AGENTS) !== JSON.stringify(agents) ||
      typeof probe.verifyProbe !== 'function' ||
      typeof probe.waitForProbeServers !== 'function')
    throw new NativeGateError('NATIVE_PROBE_SOURCE_SCOPE_MISMATCH')
  return { agents, verify: probe.verifyProbe, wait: probe.waitForProbeServers }
}

function builderLeaseDeadline(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    throw new NativeGateError('NATIVE_BUILDER_LEASE_DEADLINE_INVALID')
  const deadline = Date.parse(value)
  if (!Number.isFinite(deadline) || new Date(deadline).toISOString() !== value)
    throw new NativeGateError('NATIVE_BUILDER_LEASE_DEADLINE_INVALID')
  return deadline
}

function assertNoProtectedCommandHooks(helper) {
  const home = homedir()
  for (const directory of [
    join(helper, '.kiro', 'hooks'),
    join(home, '.kiro', 'hooks'),
    join(home, '.kiro', 'cloud-cache', 'user', 'config', 'hooks'),
  ]) {
    try { lstatSync(directory) }
    catch (error) {
      if (error?.code === 'ENOENT') continue
      throw new NativeGateError('NATIVE_H_HOOK_SCOPE_UNVERIFIED')
    }
    // A present directory may contain SessionStart/UserPromptSubmit/Stop
    // commands outside the Agent tool-policy path. Never open H in that case.
    throw new NativeGateError('NATIVE_H_HOOKS_PRESENT')
  }
}

function uniqueWorkspaceEndpoint(endpoints, workspace) {
  if (!Array.isArray(endpoints)) throw new NativeGateError('NATIVE_ENDPOINTS_UNAVAILABLE')
  const canonical = realpathSync(workspace)
  const matching = endpoints.filter((endpoint) => {
    if (!Array.isArray(endpoint?.folders) || endpoint.folders.length !== 1) return false
    const folder = endpoint.folders[0]?.path
    if (typeof folder !== 'string') return false
    try { return relative(realpathSync(folder), canonical) === '' } catch { return false }
  })
  if (matching.length === 0) throw new NativeGateError('NATIVE_ENDPOINT_MISSING')
  if (matching.length > 1) throw new NativeGateError('NATIVE_ENDPOINT_AMBIGUOUS')
  const endpoint = matching[0]
  if (!Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535 ||
      !Number.isInteger(endpoint.windowId) || typeof endpoint.token !== 'string' ||
      endpoint.token.length < 16) throw new NativeGateError('NATIVE_ENDPOINT_INVALID')
  // The mux is loopback-only in the pinned Kiro build. The token is used in memory.
  return { port: endpoint.port, token: endpoint.token, windowId: endpoint.windowId }
}

async function diagnose(vscode, expectedWorkspace, options = {}) {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!folder || vscode.workspace.workspaceFolders.length !== 1 ||
      relative(realpathSync(folder), realpathSync(expectedWorkspace)) !== '')
    throw new NativeGateError('NATIVE_WORKSPACE_NOT_BOUND')
  let extensionVersion
  let cloudProofMode = 'SESSION_RECEIPT'
  if (options.productSource === true) {
    try {
      const installation = (options.windowsProduct === true
        ? attestWindowsKiroInstallation(vscode, undefined, undefined,
          { diagnostic1170: options.windows1170Diagnostic === true })
        : attestPinnedKiroInstallation(vscode, options.filesystem,
          options.pinnedAppRoot))
      extensionVersion = installation.agentExtensionVersion
      cloudProofMode = installation.cloudProofMode ?? cloudProofMode
    }
    catch { throw new NativeGateError('NATIVE_KIRO_VERSION_UNVERIFIED') }
  } else {
    // Historical source probes may still run against the older co-located
    // 1.0.653 host. Keep their API activation path separate from product mode.
    const kiro = vscode.extensions.getExtension('kiro.kiroAgent')
    if (!kiro) throw new NativeGateError('NATIVE_KIRO_EXTENSION_MISSING')
    extensionVersion = kiro.packageJSON.version
    if (vscode.version !== EXPECTED.vscode ||
        !EXPECTED.kiroExtensions.includes(extensionVersion))
      throw new NativeGateError('NATIVE_KIRO_VERSION_UNVERIFIED')
    await kiro.activate()
  }
  if (!(options.windowsProduct === true && vscode.version === '1.131.0' &&
      (extensionVersion === '1.1.28' || cloudProofMode === 'WINDOWS_1170_DIAGNOSTIC')) &&
      (vscode.version !== EXPECTED.vscode || !EXPECTED.kiroExtensions.includes(extensionVersion)))
    throw new NativeGateError('NATIVE_KIRO_VERSION_UNVERIFIED')
  // The old list command was removed in 1.0.794. That build proves the role
  // through session/new options and set_config_option's returned currentValue.
  const agents = extensionVersion === '1.0.653'
    ? await vscode.commands.executeCommand('kiroAgent.customAgents.listCustomAgents') : null
  const agentIds = Array.isArray(agents) ? agents.map((agent) => agent?.id).filter((id) => typeof id === 'string') : null
  const mcpSetting = vscode.workspace.getConfiguration('kiroAgent').get('configureMCP')
  // Windows 1.1.28's isolated Agent host registers legacy metadata commands
  // after this product extension may start. Actual MCP readiness is attested
  // from the owned session's policy and catalog, not this obsolete UI setting.
  const canEnableMcp = options.windowsProduct ? false :
    await vscode.commands.executeCommand('kiroAgent.mcp.getCanEnableMCP')
  return {
    trusted: vscode.workspace.isTrusted,
    extensionVersion,
    cloudProofMode,
    agentIds,
    mcpSetting,
    canEnableMcp: canEnableMcp === true,
    mcpReady: vscode.workspace.isTrusted && mcpSetting === 'Enabled' && canEnableMcp === true,
  }
}

async function connectObserver(vscode, workspace, onPermissionRequest, onPermissionTelemetry,
  onProtocolTelemetry, onUserInputRequest, waitForHostStartup = false) {
  const permissionTelemetry = (phase, toolName) => {
    try { onPermissionTelemetry?.(phase, toolName) }
    catch { /* Diagnostics must never prevent a permission response. */ }
  }
  let endpoint
  const attempts = waitForHostStartup ? 60 : 10
  for (let attempt = 0; attempt < attempts; attempt++) {
    let endpoints
    try { endpoints = await vscode.commands.executeCommand('kiro.agentRegistry.getAgentEndpoints') }
    catch (error) {
      if (!waitForHostStartup) throw error
      if (attempt === attempts - 1) throw new NativeGateError('NATIVE_ENDPOINT_NOT_READY')
      await new Promise(resolve => setTimeout(resolve, 500)); continue
    }
    try { endpoint = uniqueWorkspaceEndpoint(endpoints, workspace); break }
    catch (error) {
      if (error?.code !== 'NATIVE_ENDPOINT_MISSING' || attempt === attempts - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  if (typeof WebSocket !== 'function') throw new NativeGateError('NATIVE_WEBSOCKET_UNAVAILABLE')
  const socket = new WebSocket(`ws://127.0.0.1:${endpoint.port}?token=${encodeURIComponent(endpoint.token)}`)
  const pending = new Map()
  const updates = new Map()
  const ownedSessions = new Set()
  const pendingCatalogs = new Map()
  let sessionCreations = 0
  const toolTargets = new Map()
  const userInputRequests = new Set()
  const toolKey = (sessionId, toolCallId) => `${sessionId}\u0000${toolCallId}`
  const classifyToolTarget = (rawInput) => {
    if (!rawInput || typeof rawInput.path !== 'string') return { targetClass: 'UNDETERMINED',
      pathForm: null, safeName: typeof rawInput?.name === 'string' &&
        /^[a-zA-Z0-9_./-]{1,80}$/.test(rawInput.name) ? rawInput.name : null }
    const canonical = realpathSync(workspace)
    const target = resolve(canonical, rawInput.path)
    const location = relative(canonical, target)
    const targetClass = location === 'src/native-event.ts' ? 'EXPECTED_SRC_FILE' :
      location === '.kiro' || location.startsWith(`.kiro${require('node:path').sep}`)
        ? 'PROTECTED_KIRO_PATH' :
      location === '..' || location.startsWith(`..${require('node:path').sep}`) || isAbsolute(location)
        ? 'OUTSIDE_SYNTHETIC_WORKSPACE' :
      location === 'src' || location.startsWith(`src${require('node:path').sep}`)
        ? 'OTHER_SRC_FILE' : 'OTHER_WORKSPACE_FILE'
    return { targetClass,
      relativeTarget: targetClass === 'OTHER_WORKSPACE_FILE' &&
        /^[a-zA-Z0-9_./-]{1,100}$/.test(location) ? location : null,
      pathForm: isAbsolute(rawInput.path) ? 'ABSOLUTE' : 'RELATIVE' }
  }
  let nextId = 1
  let closed = false
  const close = (reason = 'NATIVE_CONNECTION_CLOSED') => {
    if (closed) return
    closed = true
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(new NativeGateError(reason))
    }
    pending.clear()
    pendingCatalogs.clear()
    socket.close()
  }
  socket.addEventListener('close', close)
  socket.addEventListener('error', close)
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string' || Buffer.byteLength(event.data) > MAX_MESSAGE_BYTES) { close(); return }
    let message
    try { message = JSON.parse(event.data) } catch { close(); return }
    if (message?.jsonrpc !== '2.0') return
    if (Number.isInteger(message.id) && typeof message.method === 'string') {
      if (!ownedSessions.has(message.params?.sessionId)) {
        // Kiro 1.0.794 broadcasts permission requests to every observer.
        // Another owned client must answer its session; this client must not.
        return
      }
      if (message.method === '_kiro/userInput') {
        const params = message.params && typeof message.params === 'object' &&
          !Array.isArray(message.params) ? message.params : {}
        const known = new Set(['sessionId', 'toolCallId', 'question', 'options'])
        try { onProtocolTelemetry?.({ kind: 'USER_INPUT_REQUEST',
          sessionIdPresent: typeof params.sessionId === 'string',
          toolCallIdPresent: typeof params.toolCallId === 'string',
          questionType: typeof params.question === 'string' ? 'STRING' : 'OTHER',
          optionCount: Array.isArray(params.options) ? Math.min(params.options.length, 20) : -1,
          unknownKeyCount: Object.keys(params).filter(key => !known.has(key)).length,
        }) } catch { /* Diagnostics must not answer the user request. */ }
        if (onUserInputRequest) {
          if (typeof params.sessionId !== 'string' ||
            typeof params.toolCallId !== 'string' ||
            !params.toolCallId || typeof params.question !== 'string' ||
            !Array.isArray(params.options)) {
            close('NATIVE_USER_INPUT_REQUEST_INVALID')
            return
          }
          const key = toolKey(params.sessionId, params.toolCallId)
          if (userInputRequests.has(key)) return
          userInputRequests.add(key)
          void Promise.resolve().then(() => onUserInputRequest({
            sessionId: params.sessionId, toolCallId: params.toolCallId,
            question: params.question, options: params.options,
          })).then(async (answer) => {
            if (closed) return
            if (!answer || !['answered', 'dismissed'].includes(answer.action) ||
              (answer.action === 'answered' &&
                (typeof answer.answer !== 'string' || !answer.answer.trim() ||
                  answer.answer.length > 2048)) ||
              (answer.action === 'dismissed' && answer.answer !== undefined))
              throw new NativeGateError('NATIVE_USER_INPUT_RESPONSE_INVALID')
            const acknowledgement = await request('_kiro/userInput/respond', {
              toolCallId: params.toolCallId, action: answer.action,
              ...(answer.action === 'answered' ? { answer: answer.answer } : {}),
            }, 15000)
            if (acknowledgement?.success !== true ||
              acknowledgement.toolCallId !== params.toolCallId)
              throw new NativeGateError('NATIVE_USER_INPUT_ACK_INVALID')
            try { onProtocolTelemetry?.({ kind: 'USER_INPUT_ACKED',
              sessionId: params.sessionId, toolCallId: params.toolCallId }) } catch {}
          }).catch(() => { if (!closed) close('NATIVE_USER_INPUT_RESPONSE_FAILED') })
          return
        }
      }
      if (message.method === 'session/request_permission' && onPermissionRequest) {
        const params = message.params && typeof message.params === 'object' ? message.params : {}
        const call = params.toolCall && typeof params.toolCall === 'object' ? params.toolCall : {}
        const title = typeof call.title === 'string' ? call.title.toLowerCase() : ''
        const normalizedTitle = title.replaceAll('\\', '/')
        const canonicalWorkspace = realpathSync(workspace).toLowerCase()
        const titleTargetClass = normalizedTitle.includes('/private/tmp/') &&
          !normalizedTitle.includes(canonicalWorkspace) ? 'OUTSIDE_SYNTHETIC_WORKSPACE' :
          normalizedTitle.includes('src/native-event.ts') ? 'EXPECTED_SRC_FILE' :
          normalizedTitle.includes('.kiro/') ? 'PROTECTED_KIRO_PATH' : 'UNDETERMINED'
        const correlated = typeof call.toolCallId === 'string' ?
          toolTargets.get(toolKey(params.sessionId, call.toolCallId)) : null
        // The pinned IDE includes the concrete write tool ID on the owned
        // permission request. Pair it with the same toolCallId's structured
        // update; a title or an uncorrelated ID cannot grant file access.
        const permissionToolId = ['fs_write', 'str_replace', 'invoke_sub_agent']
          .includes(params?._meta?.kiro?.toolId) ?
          params._meta.kiro.toolId : null
        const nativeToolId = correlated && permissionToolId &&
          (correlated?.nativeToolId == null || correlated.nativeToolId === permissionToolId) ?
          permissionToolId : null
        const policySeedToolId = ['read_file', 'fs_write'].includes(params?._meta?.kiro?.toolId) ?
          params._meta.kiro.toolId : null
        const policySeedConsentCapability = ['all', 'fs_read', 'fs_write']
          .includes(params?._meta?.kiro?.consent?.capability) ?
          params._meta.kiro.consent.capability : null
        const safeToolName = correlated?.toolName ?? 'unknown'
        permissionTelemetry('REQUEST', safeToolName)
        const safeSummary = { method: message.method,
          paramKeys: Object.keys(params), toolCallKeys: Object.keys(call),
          kind: typeof call.kind === 'string' ? call.kind : null,
          targetClass: correlated?.targetClass ?? titleTargetClass,
          relativeTarget: correlated?.relativeTarget ?? null,
          safeName: correlated?.safeName ?? null,
          pathForm: correlated?.pathForm ?? null,
          titleClass: title.includes('decision') ? 'DECISION' :
            title.includes('write') || title.includes('edit') ? 'FILE_WRITE' :
            title.includes('shell') ? 'SHELL' : 'OTHER' }
        void Promise.resolve().then(async () => {
          let optionId = null
          try { optionId = await onPermissionRequest(safeSummary, {
            sessionId: params.sessionId,
            rawInput: correlated?.rawInput ?? null,
            toolName: correlated?.toolName ?? null,
            nativeToolId,
            policySeedToolId,
            policySeedConsentCapability,
            policySeedOperationIdFormat: typeof call.toolCallId === 'string' &&
              /^policy-check-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
                .test(call.toolCallId),
            options: Array.isArray(params.options) ? params.options.map(option => ({
              optionId: typeof option?.optionId === 'string' ? option.optionId : null,
              kind: typeof option?.kind === 'string' ? option.kind : null,
            })) : [],
          }) } catch { /* Fail closed. */ }
          if (closed) return
          const offered = Array.isArray(params.options) ? params.options : []
          const seedDecision = optionId && typeof optionId === 'object' &&
            optionId.kind === 'SESSION_DENY_SEED' &&
            typeof optionId.optionId === 'string' ?
            offered.find(option => option?.kind === 'reject_always' &&
              option.optionId === optionId.optionId) : null
          const allowedOption = offered.find(option => option?.kind === 'allow_once' &&
            option.optionId === optionId && typeof optionId === 'string')
          permissionTelemetry(allowedOption ? 'SELECTED' : 'DENIED', safeToolName)
          const selectedOption = seedDecision?.optionId ?? allowedOption?.optionId ?? offered.find(option =>
            option?.kind === 'reject_once' && typeof option.optionId === 'string')?.optionId
          if (typeof call.toolCallId !== 'string' || !call.toolCallId || !selectedOption) {
            close('NATIVE_PERMISSION_REJECT_UNAVAILABLE')
            return
          }
          // Kiro 1.0.794's MultiplexStream explicitly discards ordinary
          // JSON-RPC responses from observer clients. Its private permission
          // response method routes a bounded decision to the owned session.
          try {
            const acknowledgementPromise = request('_kiro/permission/respond', {
              toolCallId: call.toolCallId, optionId: selectedOption,
              ...(seedDecision ? { _meta: { kiro: { consent: {
                scope: 'session', resource: '', workspaceRoot: '',
              } } } } : {}),
            }, 15000)
            permissionTelemetry('SENT', safeToolName)
            const acknowledgement = await acknowledgementPromise
            if (acknowledgement?.success !== true ||
                acknowledgement.toolCallId !== call.toolCallId)
              throw new NativeGateError('NATIVE_PERMISSION_ACK_INVALID')
            permissionTelemetry('ACKED', safeToolName)
          } catch { close('NATIVE_PERMISSION_ACK_FAILED') }
        })
      }
      if (message.method === 'session/request_permission') {
        if (!onPermissionRequest) {
          const params = message.params && typeof message.params === 'object' ? message.params : {}
          const toolCallId = params.toolCall?.toolCallId
          const rejection = Array.isArray(params.options) ? params.options.find(option =>
            option?.kind === 'reject_once' && typeof option.optionId === 'string') : null
          if (typeof toolCallId !== 'string' || !rejection) close('NATIVE_PERMISSION_REJECT_UNAVAILABLE')
          else void request('_kiro/permission/respond', {
            toolCallId, optionId: rejection.optionId,
          }, 15000).then(acknowledgement => {
            if (acknowledgement?.success !== true || acknowledgement.toolCallId !== toolCallId)
              close('NATIVE_PERMISSION_ACK_FAILED')
          }).catch(() => close('NATIVE_PERMISSION_ACK_FAILED'))
        }
      } else {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id,
          error: { code: -32601, message: 'Not supported' } }))
      }
      return
    }
    if (Number.isInteger(message.id)) {
      if (!('result' in message || 'error' in message)) {
        close('NATIVE_RPC_RESPONSE_INVALID')
        return
      }
      const waiter = pending.get(message.id)
      if (!waiter) return
      pending.delete(message.id)
      clearTimeout(waiter.timer)
      if (message.error) waiter.reject(new NativeGateError('NATIVE_RPC_REJECTED'))
      else waiter.resolve(message.result)
    } else if (message.method === '_kiro/tools/didChange') {
      const sessionId = message.params?.sessionId
      if (typeof sessionId !== 'string' || sessionId.length > 1024 ||
          (!ownedSessions.has(sessionId) && sessionCreations === 0)) return
      const tags = message.params?.tags
      const valid = Array.isArray(tags) && tags.length <= 1024 && tags.every(item =>
        item && typeof item === 'object' && !Array.isArray(item) &&
        ['builtin', 'mcp'].includes(item.source) && typeof item.tag === 'string' &&
        typeof item.description === 'string')
      const builtin = valid ? tags.filter(item => item.source === 'builtin') : []
      const summary = { kind: 'TOOLS_DID_CHANGE', sessionId,
        valid,
        builtinRead: builtin.some(item => item.tag === 'read'),
        builtinWrite: builtin.some(item => item.tag === 'write'),
        builtinShell: builtin.some(item => item.tag === 'shell'),
        builtinWeb: builtin.some(item => item.tag === 'web'),
        builtinSubagent: builtin.some(item => item.tag === 'subagent'),
        builtinSpec: builtin.some(item => item.tag === 'spec'),
        builtinContext: builtin.some(item => item.tag === 'context'),
        mcpTagCount: valid ? tags.filter(item => item.source === 'mcp').length : -1,
        tagCount: valid ? tags.length : -1,
      }
      if (!ownedSessions.has(sessionId)) {
        // session/new may publish its initial catalog before returning its ID.
        // Retain bounded, sanitized metadata only; ownership and all permission
        // handling still require the session/new response from this client.
        if (pendingCatalogs.has(sessionId) || pendingCatalogs.size < 8)
          pendingCatalogs.set(sessionId, summary)
        return
      }
      try { onProtocolTelemetry?.(summary) }
      catch { /* Metadata must never change model or permission responses. */ }
    } else if (message.method === 'session/update') {
      const sessionId = message.params?.sessionId
      const update = message.params?.update
      if (typeof sessionId !== 'string' || !ownedSessions.has(sessionId)) return
      if (typeof update?.toolCallId === 'string') {
        const key = toolKey(sessionId, update.toolCallId)
        const previous = toolTargets.get(key)
        const rawInput = update.rawInput && typeof update.rawInput === 'object' &&
          !Array.isArray(update.rawInput) ? update.rawInput : previous?.rawInput
        const kind = typeof update.kind === 'string' ? update.kind : previous?.kind
        const nativeToolId = ['fs_write', 'str_replace', 'invoke_sub_agent']
          .includes(update?._meta?.kiro?.toolId) ?
          update._meta.kiro.toolId : previous?.nativeToolId ?? null
        if (rawInput) toolTargets.set(key, { ...classifyToolTarget(rawInput),
          rawInput, kind, nativeToolId, toolName: nativeToolName({ kind, rawInput }) })
      }
      updates.get(sessionId)?.(update)
    }
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new NativeGateError('NATIVE_CONNECT_TIMEOUT')), 5000)
    socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new NativeGateError('NATIVE_CONNECT_FAILED')) }, { once: true })
  }).catch((error) => { close(); throw error })
  const request = (method, params, timeoutMs = 15000) => {
    if (closed) return Promise.reject(new NativeGateError('NATIVE_CONNECTION_CLOSED'))
    const id = nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const operation = new Map([
          ['initialize', 'INITIALIZE'], ['session/new', 'SESSION_NEW'],
          ['session/set_config_option', 'SESSION_CONFIG'],
          ['_kiro/permissions/explain', 'PERMISSION_EXPLAIN'],
          ['_kiro/permissions/list', 'PERMISSION_LIST'], ['_kiro/policy/check', 'POLICY_CHECK'],
          ['session/prompt', 'PROMPT'], ['session/cancel', 'CANCEL'],
        ]).get(method) ?? 'OTHER'
        try { onProtocolTelemetry?.({ kind: 'RPC_TIMEOUT', operation }) } catch {}
        pending.delete(id)
        reject(new NativeGateError('NATIVE_RPC_TIMEOUT'))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
    })
  }
  const notify = (method, params) => {
    if (!closed) socket.send(JSON.stringify({ jsonrpc: '2.0', method, params }))
  }
  let initialized
  try {
    initialized = await request('initialize', {
      protocolVersion: 1,
      clientInfo: { name: 'vibe-helper-native-experiment', version: '0.1.0' },
      clientCapabilities: {},
    })
    if (initialized?.protocolVersion !== 1)
      throw new NativeGateError('NATIVE_PROTOCOL_UNVERIFIED')
  } catch (error) { close(); throw error }
  return {
    windowId: endpoint.windowId,
    isClosed: () => closed,
    ownsSession: (sessionId) => ownedSessions.has(sessionId),
    newSession: async (cwd, clientAgentMetadata) => {
      sessionCreations += 1
      try {
        const value = await request('session/new', { cwd, mcpServers: [],
          ...(clientAgentMetadata ? { _meta: { kiro: clientAgentMetadata } } : {}) }, 30000)
        if (typeof value?.sessionId !== 'string' || value.sessionId.length < 8)
          throw new NativeGateError('NATIVE_SESSION_ID_INVALID')
        ownedSessions.add(value.sessionId)
        const catalog = pendingCatalogs.get(value.sessionId)
        pendingCatalogs.delete(value.sessionId)
        if (catalog) {
          try { onProtocolTelemetry?.(catalog) }
          catch { /* Observation must not alter session ownership. */ }
        }
        return value
      } finally {
        sessionCreations -= 1
        if (sessionCreations === 0) pendingCatalogs.clear()
      }
    },
    selectMode: (sessionId, modeId) => request('session/set_config_option', { sessionId, configId: 'mode', value: modeId }),
    selectModel: (sessionId, modelId) => request('session/set_config_option', { sessionId, configId: 'model', value: modelId }),
    explainPermission: (sessionId, capability, resource) =>
      request('_kiro/permissions/explain', { sessionId, capability, resource }),
    listPermissions: (sessionId) => request('_kiro/permissions/list', { sessionId }),
    policyCheck: (sessionId, capability, toolId, paths) =>
      request('_kiro/policy/check', { sessionId, capability, toolId, paths }, 30000),
    prompt: (sessionId, text, onUpdate, timeoutMs = 240000) => {
      updates.set(sessionId, onUpdate)
      return request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] }, timeoutMs)
        .finally(() => updates.delete(sessionId))
    },
    cancel: (sessionId) => notify('session/cancel', { sessionId }),
    close,
  }
}

// Metadata-only stock ChatAgent policy probe. It joins the existing W mux,
// creates a session rooted at the already approved private H, and never prompts.
function fixedBuiltinHelperScope() {
  if (typeof __VIBE_PORTABLE_HOST__ !== 'undefined' && __VIBE_PORTABLE_HOST__)
    throw new NativeGateError('NATIVE_LEGACY_HELPER_SCOPE_NOT_PACKAGED')
  const projectId = D_WORKSPACE_NAME
  const runtimeWorkspaces = '/Users/hurdoo/Library/Application Support/VibeHelper/' +
    'NativeExperiment-20260913/runtime/workspaces'
  const workspace = join(runtimeWorkspaces, 'projects', projectId)
  const helper = join(runtimeWorkspaces,
    `__vibe-native-helper-${createHash('sha256').update(projectId).digest('hex').slice(0, 24)}`)
  for (const path of [workspace, helper]) {
    const stat = lstatSync(path)
    if (!stat.isDirectory() || stat.isSymbolicLink() ||
        realpathSync(path) !== path || stat.uid !== process.getuid() ||
        (stat.mode & 0o077) !== 0)
      throw new NativeGateError('NATIVE_BUILTIN_H_ROOT_UNSAFE')
  }
  if (basename(workspace) !== D_WORKSPACE_NAME ||
      !basename(helper).startsWith('__vibe-native-helper-'))
    throw new NativeGateError('NATIVE_BUILTIN_H_SCOPE_INVALID')
  assertNoProtectedCommandHooks(helper)
  return { workspace, helper }
}

function currentApprovedProductWorkspace(vscode) {
  if (typeof __VIBE_PORTABLE_HOST__ !== 'undefined' && __VIBE_PORTABLE_HOST__)
    throw new NativeGateError('NATIVE_WINDOWS_LIFECYCLE_NOT_VERIFIED')
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath
  if (vscode.workspace.workspaceFolders?.length !== 1 || typeof folder !== 'string')
    throw new NativeGateError('NATIVE_H_PREFLIGHT_WORKSPACE_INVALID')
  const workspace = realpathSync(folder)
  const projectId = basename(workspace)
  const generatedRoot = dirname(dirname(workspace))
  const approvedRoot = '/Users/hurdoo/Library/Application Support/VibeHelper/' +
    'NativeExperiment-20260913/runtime/workspaces'
  if (generatedRoot !== realpathSync(approvedRoot))
    throw new NativeGateError('NATIVE_H_PREFLIGHT_SCOPE_INVALID')
  if (!/^project_[0-9a-f-]{36}$/.test(projectId) ||
      workspace !== join(approvedRoot, 'projects', projectId))
    throw new NativeGateError('NATIVE_H_PREFLIGHT_SCOPE_INVALID')
  const info = lstatSync(workspace)
  if (!info.isDirectory() || info.isSymbolicLink() ||
      info.uid !== process.getuid() || (info.mode & 0o077) !== 0)
    throw new NativeGateError('NATIVE_H_PREFLIGHT_ROOT_UNSAFE')
  return { projectId, workspace }
}

function plannedApprovedBuiltinHelperScope(vscode) {
  const { projectId, workspace } = currentApprovedProductWorkspace(vscode)
  const generatedRoot = dirname(dirname(workspace))
  const helper = join(generatedRoot,
    `__vibe-native-helper-${createHash('sha256').update(projectId).digest('hex').slice(0, 24)}`)
  // Arming the next completed UI Helper happens before that Helper may have
  // provisioned H. The actual native opener still requires the canonical,
  // private H directory before any session/new or model prompt.
  try {
    lstatSync(helper)
    return { projectId, ...productBuiltinHScope(projectId, workspace, helper) }
  }
  catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return { projectId, workspace, helper }
}

function currentApprovedBuiltinHelperScope(vscode) {
  const { projectId, workspace, helper } = plannedApprovedBuiltinHelperScope(vscode)
  return { projectId, ...productBuiltinHScope(projectId, workspace, helper) }
}

function productBuiltinHScope(projectId, workspace, helper) {
  if (typeof projectId !== 'string' || !/^project_[0-9a-f-]{36}$/.test(projectId) ||
      typeof workspace !== 'string' || typeof helper !== 'string')
    throw new NativeGateError('NATIVE_BUILTIN_H_SCOPE_INVALID')
  const canonicalW = realpathSync(workspace)
  const canonicalH = realpathSync(helper)
  const generatedRoot = dirname(dirname(canonicalW))
  const expectedW = join(generatedRoot, 'projects', projectId)
  const expectedH = join(generatedRoot,
    `__vibe-native-helper-${createHash('sha256').update(projectId).digest('hex').slice(0, 24)}`)
  if (canonicalW !== workspace || canonicalH !== helper ||
      canonicalW !== expectedW || canonicalH !== expectedH)
    throw new NativeGateError('NATIVE_BUILTIN_H_SCOPE_INVALID')
  for (const path of [canonicalW, canonicalH]) {
    if (!privateNativeDirectory(path))
      throw new NativeGateError('NATIVE_BUILTIN_H_ROOT_UNSAFE')
  }
  return { workspace: canonicalW, helper: canonicalH }
}

function builtinHelperBootstrap() {
  const id = 'vibe-helper-policy-bootstrap'
  return { id,
    description: 'Token-free policy/catalog metadata bootstrap; no model turn',
    prompt: 'No model turn is permitted in this metadata bootstrap.',
    // A read tag in this no-model, all-ASK mode forces a didChange delta to
    // the final all-DENY vibe catalog. The bootstrap performs no tool call.
    tools: ['read'], mcpServers: {}, includeMcpJson: false, includePowers: false,
    resources: [], permissions: { rules: [{ capability: 'all', effect: 'ask' }] } }
}

function builtinHelperPolicyChecks(workspace, helper) {
  return [
    ['fs_read', 'H', join(helper, '.kiro', 'probe-never-created.txt')],
    ['fs_read', 'W', join(workspace, 'src', 'probe-never-created.txt')],
    ['fs_read', 'EXTERNAL', '/private/tmp/vibe-h-policy-external-sentinel'],
    ['fs_write', 'H', join(helper, '.kiro', 'probe-never-created.txt')],
    ['fs_write', 'W', join(workspace, 'src', 'probe-never-created.txt')],
    ['fs_write', 'EXTERNAL', '/private/tmp/vibe-h-policy-external-sentinel'],
    ['shell', 'COMMAND', 'pwd'],
    ['mcp', 'BUILDER_CORE', 'vibe-native-core/get_builder_task'],
    ['subagent', 'INVOKE', 'invoke_sub_agent'],
    ['web_fetch', 'NETWORK', 'https://example.invalid/'],
    ['web_search', 'NETWORK', 'policy probe'],
    ['power', 'POWER', 'example'],
  ]
}

async function explainBuiltinHelperPolicy(client, sessionId, checks) {
  const outcomes = []
  for (const [capability, scope, resource] of checks) {
    const result = await client.explainPermission(sessionId, capability, resource)
    outcomes.push({ capability, scope,
      effect: ['allow', 'ask', 'deny'].includes(result?.effect) ? result.effect : 'unknown' })
  }
  return outcomes
}

function hasNoMatchSessionAllDeny(value) {
  return Array.isArray(value?.rules) && value.rules.some(rule =>
    rule?.scope === 'session' && rule.capability === 'all' && rule.effect === 'deny' &&
    (rule.match === undefined ||
      (Array.isArray(rule.match) && rule.match.length === 0)) &&
    (rule.exclude === undefined ||
      (Array.isArray(rule.exclude) && rule.exclude.length === 0)))
}

async function probeBuiltinHelperPolicy(vscode) {
  const { workspace, helper } = fixedBuiltinHelperScope()
  const diagnostic = await diagnose(vscode, workspace)
  if (!diagnostic.trusted || diagnostic.extensionVersion !== '1.0.794')
    throw new NativeGateError('NATIVE_BUILTIN_H_IDE_UNVERIFIED')
  const bootstrap = builtinHelperBootstrap()
  const bootstrapId = bootstrap.id
  let permissionRequests = 0
  const client = await connectObserver(vscode, workspace,
    async () => { permissionRequests += 1; return null })
  let sessionId
  try {
    const session = await client.newSession(helper,
      { modeId: bootstrapId, customAgents: [bootstrap] })
    sessionId = session.sessionId
    const modes = session.configOptions?.find(option => option?.id === 'mode')?.options ?? []
    const currentMode = session.configOptions?.find(option => option?.id === 'mode')?.currentValue
    if (!Array.isArray(modes) || !modes.some(mode => mode?.value === 'vibe') ||
        !modes.some(mode => mode?.value === bootstrapId) || currentMode !== bootstrapId)
      throw new NativeGateError('NATIVE_BUILTIN_H_BOOTSTRAP_UNCONFIRMED')
    const permissions = await client.listPermissions(sessionId)
    const bootstrapAskObserved = Array.isArray(permissions?.rules) &&
      permissions.rules.some(rule => rule?.capability === 'all' &&
        rule.effect === 'ask' && rule.scope === 'agent')
    if (!bootstrapAskObserved)
      throw new NativeGateError('NATIVE_BUILTIN_H_ASK_RULE_UNCONFIRMED')
    const bootstrapChecks = builtinHelperPolicyChecks(workspace, helper).filter(
      ([capability, scope]) => ['fs_read', 'fs_write'].includes(capability) &&
        ['W', 'EXTERNAL'].includes(scope))
    const bootstrapOutcomes = await explainBuiltinHelperPolicy(client, sessionId,
      bootstrapChecks)
    const selected = await client.selectMode(sessionId, 'vibe')
    if (selected?.configOptions?.find(option => option?.id === 'mode')?.currentValue !== 'vibe')
      throw new NativeGateError('NATIVE_BUILTIN_H_MODE_UNCONFIRMED')
    if (permissionRequests !== 0)
      throw new NativeGateError('NATIVE_BUILTIN_H_EXPLAIN_PROMPTED')
    const outcomes = await explainBuiltinHelperPolicy(client, sessionId,
      builtinHelperPolicyChecks(workspace, helper))
    if (permissionRequests !== 0)
      throw new NativeGateError('NATIVE_BUILTIN_H_EXPLAIN_PROMPTED')
    return { windowId: client.windowId, bootstrapAskObserved,
      bootstrapOutcomes, mode: 'vibe', outcomes,
      sampledDeniesAll: outcomes.every(item => item.effect === 'deny') }
  } finally {
    if (sessionId) client.cancel(sessionId)
    client.close()
  }
}

// Deny-only session policy capability probe. A synthetic policy/check asks for
// no real file operation; the owned observer may answer exactly one matching
// request with reject_always at session scope. No model prompt is made.
async function probeBuiltinHelperDenySeed(vscode) {
  const { workspace, helper } = fixedBuiltinHelperScope()
  const diagnostic = await diagnose(vscode, workspace)
  if (!diagnostic.trusted || diagnostic.extensionVersion !== '1.0.794')
    throw new NativeGateError('NATIVE_BUILTIN_H_IDE_UNVERIFIED')
  const bootstrap = builtinHelperBootstrap()
  let sessionId
  let pendingSeed = false
  let permissionRequests = 0
  let seedResponses = 0
  let seedFailure = null
  const client = await connectObserver(vscode, workspace, async (_summary, details) => {
    permissionRequests += 1
    if (!pendingSeed || !sessionId || details.sessionId !== sessionId) {
      seedFailure = 'NATIVE_H_SEED_UNOWNED_OR_UNEXPECTED'
      return null
    }
    if (details.policySeedToolId !== 'read_file' ||
        details.policySeedOperationIdFormat !== true) {
      seedFailure = 'NATIVE_H_SEED_TOOL_UNVERIFIED'
      return null
    }
    if (details.policySeedConsentCapability &&
        details.policySeedConsentCapability !== 'all') {
      seedFailure = 'NATIVE_H_SEED_CAPABILITY_MISMATCH'
      return null
    }
    if (seedResponses !== 0 || permissionRequests !== 1) {
      seedFailure = 'NATIVE_H_SEED_DUPLICATE_REQUEST'
      return null
    }
    const rejection = details.options.find(option => option.kind === 'reject_always')
    if (!rejection?.optionId) {
      seedFailure = 'NATIVE_H_SEED_ALWAYS_REJECT_UNAVAILABLE'
      return null
    }
    seedResponses += 1
    return { kind: 'SESSION_DENY_SEED', optionId: rejection.optionId }
  })
  try {
    const session = await client.newSession(helper,
      { modeId: bootstrap.id, customAgents: [bootstrap] })
    sessionId = session.sessionId
    const policyErrors = session?._meta?.policyErrors
    if (policyErrors !== undefined &&
        (!Array.isArray(policyErrors) || policyErrors.length !== 0))
      throw new NativeGateError('NATIVE_H_SEED_POLICY_LOAD_ERROR')
    if (session.configOptions?.find(option => option?.id === 'mode')?.currentValue !==
        bootstrap.id)
      throw new NativeGateError('NATIVE_H_SEED_BOOTSTRAP_UNCONFIRMED')
    const before = await client.listPermissions(sessionId)
    if (!Array.isArray(before?.rules) || !before.rules.some(rule =>
      rule?.capability === 'all' && rule.effect === 'ask' && rule.scope === 'agent'))
      throw new NativeGateError('NATIVE_H_SEED_ASK_RULE_UNCONFIRMED')
    const target = join(workspace, 'src', 'probe-never-created.txt')
    const initial = await client.explainPermission(sessionId, 'fs_read', target)
    if (initial?.effect !== 'ask')
      throw new NativeGateError('NATIVE_H_SEED_INITIAL_NOT_ASK')
    pendingSeed = true
    let checked
    try { checked = await client.policyCheck(sessionId, 'fs_read', 'read_file', [target]) }
    finally { pendingSeed = false }
    if (seedFailure) throw new NativeGateError(seedFailure)
    if (permissionRequests !== 1 || seedResponses !== 1 || checked?.outcome !== 'deny')
      throw new NativeGateError('NATIVE_H_SEED_CHECK_UNCONFIRMED')
    const hasSessionAllDeny = async () => {
      const value = await client.listPermissions(sessionId)
      return hasNoMatchSessionAllDeny(value)
    }
    if (!(await hasSessionAllDeny()))
      throw new NativeGateError('NATIVE_H_SEED_SESSION_ALL_DENY_MISSING')
    const selected = await client.selectMode(sessionId, 'vibe')
    if (selected?.configOptions?.find(option => option?.id === 'mode')?.currentValue !== 'vibe')
      throw new NativeGateError('NATIVE_H_SEED_VIBE_MODE_UNCONFIRMED')
    if (!(await hasSessionAllDeny()))
      throw new NativeGateError('NATIVE_H_SEED_DENY_LOST_ON_MODE_SWITCH')
    const outcomes = await explainBuiltinHelperPolicy(client, sessionId,
      builtinHelperPolicyChecks(workspace, helper))
    if (!outcomes.every(item => item.effect === 'deny'))
      throw new NativeGateError('NATIVE_H_SEED_EFFECT_NOT_DENY')
    return { windowId: client.windowId, mode: 'vibe', sessionAllDeny: true,
      sampledDeniesAll: true, permissionRequests, seedResponses,
      capabilities: outcomes.map(item => `${item.capability}:${item.scope}`) }
  } finally {
    if (sessionId) client.cancel(sessionId)
    client.close()
  }
}

function protectedCatalogSourceBound(snapshot) {
  return snapshot?.valid === true && snapshot.tagCount === 1 &&
    snapshot.builtinShell === true && snapshot.builtinRead === false &&
    snapshot.builtinWrite === false && snapshot.builtinWeb === false &&
    snapshot.builtinSubagent === false && snapshot.builtinSpec === false &&
    snapshot.builtinContext === false && snapshot.mcpTagCount === 0
}

// A protected built-in ChatAgent session lives for the extension worker's
// project lifetime. The caller must open both H sessions before Builder's W
// custom Agent, then only call prompt() until Builder stops.
async function openProtectedBuiltinH(vscode, options) {
  if (typeof options?.redactText !== 'function')
    throw new NativeGateError('NATIVE_H_REDACTOR_REQUIRED')
  const { projectId, workspace, helper } = productBuiltinHScope(
    options.projectId, options.workspace, options.helper)
  assertNoProtectedCommandHooks(helper)
  const diagnostic = await diagnose(vscode, workspace, { productSource: true })
  if (!diagnostic.trusted || diagnostic.extensionVersion !== '1.0.794')
    throw new NativeGateError('NATIVE_BUILTIN_H_IDE_UNVERIFIED')
  if (!(await inspectProtectedBuiltinFlags(vscode)).safe)
    throw new NativeGateError('NATIVE_H_UNMAPPED_TOOL_FLAGS_UNVERIFIED')
  const bootstrap = builtinHelperBootstrap()
  let sessionId
  let pendingSeed = false
  let permissionRequests = 0
  let seedResponses = 0
  let unexpectedInteraction = false
  let unexpectedInteractionKind = null
  let catalogArmed = false
  let protectedCatalog = null
  let seedFailure = null
  let active = false
  let closed = false
  let barrierSessionId = null
  let createdBounds
  const client = await connectObserver(vscode, workspace, async (_summary, details) => {
    permissionRequests += 1
    if (!pendingSeed || !sessionId || details.sessionId !== sessionId) {
      unexpectedInteraction = true
      unexpectedInteractionKind ??= 'PERMISSION'
      return null
    }
    if (details.policySeedToolId !== 'read_file' ||
        details.policySeedOperationIdFormat !== true ||
        (details.policySeedConsentCapability &&
          details.policySeedConsentCapability !== 'all') ||
        permissionRequests !== 1 || seedResponses !== 0) {
      seedFailure = 'NATIVE_H_SEED_REQUEST_UNVERIFIED'
      return null
    }
    const rejection = details.options.find(option => option.kind === 'reject_always')
    if (!rejection?.optionId) {
      seedFailure = 'NATIVE_H_SEED_ALWAYS_REJECT_UNAVAILABLE'
      return null
    }
    seedResponses += 1
    return { kind: 'SESSION_DENY_SEED', optionId: rejection.optionId }
  }, undefined, summary => {
    if (summary?.kind === 'TOOLS_DID_CHANGE' && catalogArmed &&
        summary.sessionId === sessionId)
      protectedCatalog = summary
  }, async () => {
    unexpectedInteraction = true
    unexpectedInteractionKind ??= 'USER_INPUT'
    return { action: 'dismissed' }
  })
  const close = () => {
    if (closed) return
    closed = true
    if (sessionId) client.cancel(sessionId)
    client.close()
  }
  try {
    const newStarted = Date.now()
    const session = await client.newSession(helper,
      { modeId: bootstrap.id, customAgents: [bootstrap] })
    createdBounds = { notBefore: newStarted - 5000, notAfter: Date.now() + 5000 }
    sessionId = session.sessionId
    // session/new starts this deterministic pull in the IDE Agent. Its ACP
    // tool update may otherwise arrive after the H model prompt and trigger
    // the protected tool-call abort. Drain only the exact owned session and
    // require an unchanged, absent cloud config root before seeding policy.
    try { await waitForOwnedCloudPull(sessionId, helper, { notBefore: newStarted }) }
    catch (error) {
      throw new NativeGateError(error?.message || 'NATIVE_CLOUD_UNCONFIRMED')
    }
    assertNoProtectedCommandHooks(helper)
    if (!(await inspectProtectedBuiltinFlags(vscode)).safe)
      throw new NativeGateError('NATIVE_H_UNMAPPED_TOOL_FLAGS_CHANGED')
    let memoryAttested = false
    for (let attempt = 0; attempt < 10 && !memoryAttested; attempt++) {
      try { memoryAttested = attestSessionMemoryDisabled(sessionId, undefined, createdBounds) }
      catch (error) {
        if (!['NATIVE_H_MEMORY_LOG_UNCONFIRMED', 'NATIVE_H_MEMORY_LOG_INVALID']
          .includes(error?.message) || attempt === 9)
          throw new NativeGateError(error?.message || 'NATIVE_H_MEMORY_LOG_UNCONFIRMED')
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
    if (!memoryAttested) throw new NativeGateError('NATIVE_H_MEMORY_LOG_UNCONFIRMED')
    const policyErrors = session?._meta?.policyErrors
    if (policyErrors !== undefined &&
        (!Array.isArray(policyErrors) || policyErrors.length !== 0))
      throw new NativeGateError('NATIVE_H_SEED_POLICY_LOAD_ERROR')
    if (session.configOptions?.find(option => option?.id === 'mode')?.currentValue !==
        bootstrap.id)
      throw new NativeGateError('NATIVE_H_SEED_BOOTSTRAP_UNCONFIRMED')
    const before = await client.listPermissions(sessionId)
    if (!Array.isArray(before?.rules) || !before.rules.some(rule =>
      rule?.capability === 'all' && rule.effect === 'ask' && rule.scope === 'agent'))
      throw new NativeGateError('NATIVE_H_SEED_ASK_RULE_UNCONFIRMED')
    const target = join(workspace, 'src', 'probe-never-created.txt')
    const initial = await client.explainPermission(sessionId, 'fs_read', target)
    if (initial?.effect !== 'ask')
      throw new NativeGateError('NATIVE_H_SEED_INITIAL_NOT_ASK')
    // Arm before the policy change: it may refresh read→[] itself. A later
    // vibe refresh with the same [] is deduplicated, while any changed tags
    // replace this snapshot on the ordered observer stream.
    protectedCatalog = null
    catalogArmed = true
    pendingSeed = true
    let checked
    try { checked = await client.policyCheck(sessionId, 'fs_read', 'read_file', [target]) }
    finally { pendingSeed = false }
    if (seedFailure) throw new NativeGateError(seedFailure)
    if (unexpectedInteraction || permissionRequests !== 1 || seedResponses !== 1 ||
        checked?.outcome !== 'deny' ||
        !hasNoMatchSessionAllDeny(await client.listPermissions(sessionId)))
      throw new NativeGateError('NATIVE_H_SEED_CHECK_UNCONFIRMED')
    const selected = await client.selectMode(sessionId, 'vibe')
    if (selected?.configOptions?.find(option => option?.id === 'mode')?.currentValue !== 'vibe' ||
        !hasNoMatchSessionAllDeny(await client.listPermissions(sessionId)))
      throw new NativeGateError('NATIVE_H_SEED_VIBE_DENY_UNCONFIRMED')
    let modelId = null
    const analystModels = options.inspectAnalystModels === true ||
      options.analystModelId !== undefined ?
      availableBuiltinAnalystModels(selected.configOptions) : null
    if (options.analystHaiku === true && options.analystModelId !== undefined)
      throw new NativeGateError('NATIVE_H_ANALYST_MODEL_CONFLICT')
    if (options.analystModelId !== undefined) {
      modelId = await selectBuiltinAnalystModel({ client, sessionId,
        modeId: 'vibe', modeSelection: selected }, options.analystModelId)
    } else if (options.analystHaiku === true) {
      modelId = await selectBuiltinAnalystHaikuModel({ client, sessionId,
        modeId: 'vibe', modeSelection: selected })
    }
    for (let attempt = 0; attempt < 60 && !protectedCatalog; attempt++)
      await new Promise(resolve => setTimeout(resolve, 50))
    // In this pinned Kiro build, all-deny removes every executable shell
    // tool. The sole remaining shell category is the deduplicated tag of
    // list_processes/get_process_output, which read only this fresh H
    // session's process-manager maps. The read-only bootstrap cannot emit
    // that tag, so this observation also follows the vibe mode switch.
    // didChange has category tags, not tool IDs: require its *entire* final
    // category inventory and keep runtime tool_call fail-closed.
    const catalogSafe = () => protectedCatalogSourceBound(protectedCatalog)
    if (!catalogSafe()) {
      const reason = !protectedCatalog ? 'MISSING' :
        protectedCatalog.valid !== true ? 'INVALID' :
        protectedCatalog.tagCount !== 1 ? 'TAG_COUNT' :
        protectedCatalog.builtinShell !== true ? 'SHELL_INTROSPECTION_MISSING' :
        protectedCatalog.builtinRead ? 'BUILTIN_READ' :
        protectedCatalog.builtinWrite ? 'BUILTIN_WRITE' :
        protectedCatalog.builtinWeb ? 'BUILTIN_WEB' :
        protectedCatalog.builtinSubagent ? 'BUILTIN_SUBAGENT' :
        protectedCatalog.builtinSpec ? 'BUILTIN_SPEC' :
        protectedCatalog.builtinContext ? 'BUILTIN_CONTEXT' :
        protectedCatalog.mcpTagCount !== 0 ? 'MCP' : 'UNKNOWN'
      throw new NativeGateError(`NATIVE_H_CATALOG_${reason}`)
    }
    const policy = await explainBuiltinHelperPolicy(client, sessionId,
      builtinHelperPolicyChecks(workspace, helper))
    if (!policy.every(item => item.effect === 'deny'))
      throw new NativeGateError('NATIVE_H_SEED_EFFECT_NOT_DENY')
    // The transport has no source-supported way to turn off primary IDE
    // memory/knowledge here. The pre-prompt catalog/flag gate is separate.
    const attest = async () => {
      await assertCloudConfigAbsent().catch(error => {
        throw new NativeGateError(error?.message || 'NATIVE_CLOUD_CONFIG_UNVERIFIED')
      })
      assertNoProtectedCommandHooks(helper)
      if (!(await inspectProtectedBuiltinFlags(vscode)).safe)
        throw new NativeGateError('NATIVE_H_UNMAPPED_TOOL_FLAGS_CHANGED')
      if (!catalogSafe()) throw new NativeGateError('NATIVE_H_CATALOG_CHANGED')
      if (closed || client.isClosed() || unexpectedInteraction ||
          permissionRequests !== 1 || seedResponses !== 1)
        throw new NativeGateError('NATIVE_H_SESSION_UNTRUSTED')
      if (!hasNoMatchSessionAllDeny(await client.listPermissions(sessionId)))
        throw new NativeGateError('NATIVE_H_DENY_RULE_LOST')
      const current = await explainBuiltinHelperPolicy(client, sessionId,
        builtinHelperPolicyChecks(workspace, helper))
      if (!current.every(item => item.effect === 'deny'))
        throw new NativeGateError('NATIVE_H_DENY_EFFECT_LOST')
      try { attestSessionMemoryDisabled(sessionId, undefined,
        { ...createdBounds, ...(barrierSessionId ? { barrierSessionId } : {}) }) }
      catch (error) {
        throw new NativeGateError(error?.message || 'NATIVE_H_MEMORY_LOG_UNCONFIRMED')
      }
    }
    const attestAfterBarrier = async (builderSessionId) => {
      if (typeof builderSessionId !== 'string' ||
          !/^sess_[0-9a-f-]{36}$/.test(builderSessionId))
        throw new NativeGateError('NATIVE_H_MEMORY_BARRIER_INVALID')
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          attestSessionMemoryDisabled(sessionId, undefined,
            { ...createdBounds, barrierSessionId: builderSessionId })
          barrierSessionId = builderSessionId
          await attest()
          return
        } catch (error) {
          if (!['NATIVE_H_MEMORY_LOG_UNCONFIRMED', 'NATIVE_H_MEMORY_LOG_INVALID']
            .includes(error?.message) || attempt === 14)
            throw new NativeGateError(error?.message || 'NATIVE_H_MEMORY_BARRIER_UNCONFIRMED')
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
    }
    return {
      projectId, workspace, helper, windowId: client.windowId, modelId,
      analystModels,
      shellIntrospectionTag: true,
      attest, attestAfterBarrier,
      prompt: async (text, onUpdate, signal) => {
        if (active) throw new NativeGateError('NATIVE_H_SESSION_BUSY')
        active = true
        let raw = ''
        let line = ''
        let unsafeTool = false
        let confirmedCancel = false
        const abort = () => client.cancel(sessionId)
        try {
          if (!barrierSessionId)
            throw new NativeGateError('NATIVE_H_MEMORY_BARRIER_MISSING')
          if (signal?.aborted) throw new NativeGateError('NATIVE_H_CANCELLED')
          await attest()
          if (signal?.aborted) throw new NativeGateError('NATIVE_H_CANCELLED')
          if (typeof text !== 'string' || !text.trim() ||
              Buffer.byteLength(text, 'utf8') > 400000)
            throw new NativeGateError('NATIVE_H_PROMPT_INVALID')
          signal?.addEventListener('abort', abort, { once: true })
          if (signal?.aborted) throw new NativeGateError('NATIVE_H_CANCELLED')
          const response = await client.prompt(sessionId, text, update => {
            if (update?.sessionUpdate === 'agent_message_chunk' &&
                update?.content?.type === 'text') {
              if (typeof update.content.text !== 'string') {
                unsafeTool = true; unexpectedInteractionKind ??= 'TEXT_INVALID'; abort(); return
              }
              raw += update.content.text
              line += update.content.text
              if (Buffer.byteLength(raw, 'utf8') > 1024 * 1024 ||
                  Buffer.byteLength(line, 'utf8') > 65536) {
                unsafeTool = true; unexpectedInteractionKind ??= 'TEXT_LIMIT'; abort(); return
              }
              let end
              while ((end = line.indexOf('\n')) >= 0) {
                const chunk = line.slice(0, end + 1)
                if (SECRET_PREFIX.test(chunk)) break
                line = line.slice(end + 1)
                onUpdate?.({ kind: 'text_delta', text: options.redactText(
                  options.redactText(chunk, workspace), helper) })
              }
            } else if (update?.sessionUpdate === 'tool_call' ||
                       update?.sessionUpdate === 'tool_call_update') {
              unsafeTool = true
              unexpectedInteractionKind ??= protectedToolClass(update)
              abort()
            }
          }, 240000)
          if (line) onUpdate?.({ kind: 'text_delta', text: options.redactText(
            options.redactText(line, workspace), helper) })
          if (unsafeTool || unexpectedInteraction)
            throw new NativeGateError(
              `NATIVE_H_UNEXPECTED_${unexpectedInteractionKind ?? 'INTERACTION'}`)
          // Only a terminal response from this owned session confirms that
          // cancellation finished. Keep that exact session available for a
          // later question; an RPC error, raced end_turn, or unsafe tool
          // interaction still closes it below.
          if (signal?.aborted) {
            if (response?.stopReason === 'cancelled') {
              confirmedCancel = true
              throw new NativeGateError('NATIVE_H_CANCELLED_CONFIRMED')
            }
            throw new NativeGateError('NATIVE_H_CANCEL_RACED_OR_UNCONFIRMED')
          }
          if (response?.stopReason !== 'end_turn')
            throw new NativeGateError('NATIVE_H_TURN_INCOMPLETE')
          const safeText = options.redactText(options.redactText(raw, workspace), helper)
          if (!safeText.trim()) throw new NativeGateError('NATIVE_H_EMPTY_RESPONSE')
          return { text: safeText, stopReason: response.stopReason }
        } catch (error) {
          if (!confirmedCancel) { abort(); close() }
          throw error
        }
        finally { signal?.removeEventListener('abort', abort); active = false }
      },
      close,
    }
  } catch (error) { close(); throw error }
}

async function openProtectedHLogBarrier(vscode, options) {
  const { workspace, helper } = productBuiltinHScope(
    options.projectId, options.workspace, options.helper)
  assertNoProtectedCommandHooks(helper)
  const diagnostic = await diagnose(vscode, workspace, { productSource: true })
  if (!diagnostic.trusted || diagnostic.extensionVersion !== '1.0.794')
    throw new NativeGateError('NATIVE_H_BARRIER_IDE_UNVERIFIED')
  const client = await connectObserver(vscode, workspace)
  let sessionId
  try {
    const bootstrap = builtinHelperBootstrap()
    const newStarted = Date.now()
    const session = await client.newSession(helper,
      { modeId: bootstrap.id, customAgents: [bootstrap] })
    sessionId = session.sessionId
    try { await waitForOwnedCloudPull(sessionId, helper, { notBefore: newStarted }) }
    catch (error) {
      throw new NativeGateError(error?.message || 'NATIVE_CLOUD_UNCONFIRMED')
    }
    assertNoProtectedCommandHooks(helper)
    if (session.configOptions?.find(option => option?.id === 'mode')?.currentValue !==
        bootstrap.id)
      throw new NativeGateError('NATIVE_H_BARRIER_MODE_UNCONFIRMED')
    return { sessionIdForBarrier: sessionId, windowId: client.windowId }
  } finally {
    if (sessionId) client.cancel(sessionId)
    client.close()
  }
}

async function probeProtectedBuiltinPair(vscode) {
  const { projectId, workspace, helper } = currentApprovedBuiltinHelperScope(vscode)
  const options = { projectId, workspace, helper,
    redactText: (value, root) =>
      require('../../packages/application/dist/redaction.js').redactSensitiveText(value, root) }
  let first
  let second
  try {
    first = await openProtectedBuiltinH(vscode, options)
    second = await openProtectedBuiltinH(vscode, { ...options, analystHaiku: true })
    const barrier = await openProtectedHLogBarrier(vscode, options)
    if (first.windowId !== second.windowId || first.windowId !== barrier.windowId)
      throw new NativeGateError('NATIVE_H_PAIR_WINDOW_MISMATCH')
    await first.attestAfterBarrier(barrier.sessionIdForBarrier)
    await second.attestAfterBarrier(barrier.sessionIdForBarrier)
    if (second.modelId !== 'claude-haiku-4.5')
      throw new NativeGateError('NATIVE_H_ANALYST_MODEL_UNCONFIRMED')
    return { windowId: first.windowId, sessions: 2, memoryDefaultAttested: true,
      sessionAllDeny: true, catalogSafe: true, shellIntrospectionTags: 2,
      analystHaiku: true, modelTurns: 0 }
  } finally { first?.close(); second?.close() }
}

function toolLessRole(workspace, role) {
  if (!/^[a-z][a-z0-9-]{1,79}$/.test(role)) throw new NativeGateError('NATIVE_ROLE_INVALID')
  let config
  try { config = JSON.parse(readFileSync(join(workspace, '.kiro', 'agents', `${role}.json`), 'utf8')) }
  catch { throw new NativeGateError('NATIVE_ROLE_CONFIG_MISSING') }
  return config?.name === role && Array.isArray(config.tools) && config.tools.length === 0 &&
    Object.keys(config.mcpServers ?? {}).length === 0 && config.includeMcpJson === false &&
    config.includePowers === false && !Object.hasOwn(config, 'hooks')
}

function boundedCoreRole(workspace, role, binding, bindingFile, syntheticSrcWrite = false,
  productBuilder = false, bridgeScriptPath = null, runtimeDescriptor = null) {
  if (!binding || !Array.isArray(binding.toolNames) || binding.toolNames.length === 0 ||
      typeof binding.url !== 'string' || typeof binding.authorization !== 'string')
    throw new NativeGateError('NATIVE_CORE_BINDING_REQUIRED')
  const url = new URL(binding.url)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !/^\/mcp\/native-[0-9a-f-]{36}$/.test(url.pathname))
    throw new NativeGateError('NATIVE_CORE_BINDING_INVALID')
  let config
  try { config = JSON.parse(readFileSync(join(workspace, '.kiro', 'agents', `${role}.json`), 'utf8')) }
  catch { throw new NativeGateError('NATIVE_ROLE_CONFIG_MISSING') }
  if (syntheticSrcWrite && (!realpathSync(workspace).startsWith('/private/tmp/') || binding.role !== 'BUILDER'))
    throw new NativeGateError('NATIVE_SYNTHETIC_WRITE_SCOPE_INVALID')
  const expectedTools = [
    ...(productBuilder ? ['read', 'write', 'shell'] : syntheticSrcWrite ? ['read', 'write'] : []),
    ...binding.toolNames.map((name) => `@vibe-native-core/${name}`),
  ]
  const expectedRules = [
    ...binding.toolNames.map((tool) => ({
      capability: 'mcp', match: [`vibe-native-core/${tool}`], effect: 'allow',
    })),
    ...(productBuilder ? [
      { capability: 'fs_read', match: ['.kiro/**', `${realpathSync(workspace)}/.kiro/**`], effect: 'deny' },
      { capability: 'fs_write', match: ['.kiro/**', `${realpathSync(workspace)}/.kiro/**`], effect: 'deny' },
      { capability: 'fs_read', match: ['**'], effect: 'ask' },
      { capability: 'fs_write', match: ['**'], effect: 'ask' },
      { capability: 'shell', effect: 'ask' },
    ] : syntheticSrcWrite
      ? [
          { capability: 'fs_read', match: ['.kiro/**', `${realpathSync(workspace)}/.kiro/**`], effect: 'deny' },
          { capability: 'fs_read', match: ['src/**', `${realpathSync(workspace)}/src/**`], effect: 'allow' },
          { capability: 'fs_write', match: ['src/**', `${realpathSync(workspace)}/src/**`], effect: 'allow' },
        ]
      : [{ capability: 'fs_write', effect: 'deny' }, { capability: 'shell', effect: 'deny' }]),
    ...(runtimeDescriptor ? [
      ...(!productBuilder ? [{ capability: 'fs_read', effect: 'deny' }] : []),
      { capability: 'web_search', effect: 'deny' },
    ] : []),
  ]
  const server = config.mcpServers?.['vibe-native-core']
  const directHttp = server?.url === binding.url &&
    server?.headers?.Authorization === binding.authorization
  const bridgeScript = bridgeScriptPath ?? join(__dirname, '..', '..', 'scripts',
    'native-core-stdio-bridge.mjs')
  const stdioBridge = typeof bindingFile === 'string' &&
    server?.command === (runtimeDescriptor?.executable ?? '/opt/homebrew/opt/node@24/bin/node') &&
    JSON.stringify(server?.args) === JSON.stringify([
      ...(runtimeDescriptor?.args ?? []),
      bridgeScript, realpathSync(bindingFile), realpathSync(workspace),
    ]) &&
    Object.keys(server?.env ?? {}).every((name) => name === 'VIBE_NATIVE_BRIDGE_RECEIPT_FILE' ||
      Object.hasOwn(runtimeDescriptor?.env ?? {}, name) && server.env[name] === runtimeDescriptor.env[name]) &&
    Object.entries(runtimeDescriptor?.env ?? {}).every(([name, value]) => server?.env?.[name] === value)
  if (config.name !== role || config.includeMcpJson !== false || config.includePowers !== false ||
      'allowedTools' in config || 'toolsSettings' in config || 'hooks' in config ||
      JSON.stringify(config.tools) !== JSON.stringify(expectedTools) ||
      Object.keys(config.mcpServers ?? {}).join(',') !== 'vibe-native-core' ||
      !(directHttp || stdioBridge) ||
      JSON.stringify(config.permissions?.rules) !== JSON.stringify(expectedRules))
    throw new NativeGateError('NATIVE_CORE_ROLE_CONFIG_UNVERIFIED')
  return true
}

async function openNativeRole(vscode, options) {
  const { workspace, role, requireMcp = true } = options
  const builderDeadline = options.productBuilder === true ?
    builderLeaseDeadline(options.builderLeaseDeadlineAt) : null
  const diagnostic = await diagnose(vscode, workspace,
    { productSource: options.productMode === true, windowsProduct: options.windowsProduct === true,
      windows1170Diagnostic: options.windows1170Diagnostic === true })
  if (options.windowsProduct && !options.productMode) throw new NativeGateError('NATIVE_PRODUCT_MODE_REQUIRED')
  if (options.productMode && diagnostic.extensionVersion !== (options.windowsProduct
    ? diagnostic.cloudProofMode === 'WINDOWS_1170_DIAGNOSTIC' ? '1.1.158' : '1.1.28' : '1.0.794'))
    throw new NativeGateError('NATIVE_PERMISSION_ROUTE_VERSION_UNVERIFIED')
  if (!diagnostic.trusted) throw new NativeGateError('NATIVE_WORKSPACE_UNTRUSTED')
  if (diagnostic.agentIds && !diagnostic.agentIds.includes(role))
    throw new NativeGateError('NATIVE_ROLE_NOT_LOADED')
  // configureMCP and getCanEnableMCP are legacy/enterprise metadata. The
  // installed 1.0.794 IDE can initialize workspace MCP while both say false.
  // Actual role selection and Core tool receipt are checked separately.
  const probeMode = options.capabilityProbe === true || options.invokeCapabilityProbe === true
  if (options.capabilityProbe === true && options.invokeCapabilityProbe === true)
    throw new NativeGateError('NATIVE_PROBE_MODE_CONFLICT')
  let probe = null
  if (probeMode) {
    probe = loadCapabilityProbe(options.invokeCapabilityProbe === true)
    const expectedRole = probe.agents.parent
    if (role !== expectedRole ||
        require('node:path').basename(realpathSync(workspace)) !== D_WORKSPACE_NAME ||
        requireMcp ||
        process.env.ASBX_KIRO_MANDATORY_MCPS)
      throw new NativeGateError('NATIVE_PROBE_SCOPE_INVALID')
    probe.verify(workspace)
  } else if (requireMcp) boundedCoreRole(workspace, role, options.binding, options.bindingFile,
    options.syntheticSrcWrite === true, options.productBuilder === true,
    options.bridgeScriptPath, options.runtimeDescriptor)
  else if (!toolLessRole(workspace, role))
    throw new NativeGateError('NATIVE_TOOLLESS_ROLE_NOT_VERIFIED')
  let windowsCatalog = null
  const client = await connectObserver(vscode, workspace, options.onPermissionRequest,
    options.onPermissionTelemetry, event => {
      if (event.kind === 'TOOLS_DID_CHANGE') windowsCatalog = event
      options.onProtocolTelemetry?.(event)
    },
    options.onUserInputRequest, options.windowsProduct === true)
  let sessionId
  let modelId = null
  try {
    let newStarted
    let metadata
    if (options.windowsProduct) {
      assertNoProtectedCommandHooks(workspace)
      const { name, ...config } = JSON.parse(readFileSync(join(workspace, '.kiro/agents', `${role}.json`), 'utf8'))
      metadata = { modeId: role, customAgents: [{ id: name, ...config }] }
    }
    const createAndAttest = async () => {
      if (options.productMode === true) await assertCloudConfigAbsent()
      newStarted = Date.now()
      const created = await client.newSession(realpathSync(workspace), metadata)
      if (typeof created?.sessionId !== 'string' || created.sessionId.length < 8)
        throw new NativeGateError('NATIVE_SESSION_ID_INVALID')
      sessionId = created.sessionId
      if (options.productMode === true) {
        const attestCloud = diagnostic.cloudProofMode === 'WINDOWS_1170_DIAGNOSTIC'
          ? waitForOwnedSilentCloudPull : waitForOwnedCloudPull
        try { await attestCloud(sessionId, realpathSync(workspace),
          { notBefore: newStarted }) }
        catch (error) {
          throw new NativeGateError(error?.message || 'NATIVE_CLOUD_UNCONFIRMED')
        }
      }
      return created
    }
    const session = options.productMode === true && diagnostic.cloudProofMode === 'WINDOWS_1170_DIAGNOSTIC'
      ? await withScopedCloudDebug(createAndAttest) : await createAndAttest()
    modelId = session.configOptions?.find((option) => option?.id === 'model')?.currentValue ?? null
    const modes = session.configOptions?.find((option) => option?.id === 'mode')?.options ?? []
    if (!Array.isArray(modes) || !modes.some((mode) => mode?.value === role))
      throw new NativeGateError('NATIVE_ROLE_MODE_UNAVAILABLE')
    const selected = await client.selectMode(sessionId, role)
    const current = selected?.configOptions?.find((option) => option?.id === 'mode')?.currentValue
    if (current !== role) throw new NativeGateError('NATIVE_ROLE_SELECTION_UNCONFIRMED')
    if (options.windowsProduct) {
      const policyErrors = session._meta?.policyErrors
      if (policyErrors !== undefined && (!Array.isArray(policyErrors) || policyErrors.length))
        throw new NativeGateError('NATIVE_POLICY_ERRORS')
      attestSessionMemoryDisabled(sessionId)
      for (const capability of ['fs_read', 'fs_write', 'shell', 'web_search']) {
        const value = await client.explainPermission(sessionId, capability, '')
        const expected = options.productBuilder && capability !== 'web_search' ? 'ask' : 'deny'
        if (value.effect !== expected) throw new NativeGateError('NATIVE_ROLE_POLICY_UNVERIFIED')
      }
      for (const tool of options.binding?.toolNames ?? []) {
        const value = await client.explainPermission(sessionId, 'mcp', `vibe-native-core/${tool}`)
        if (value.effect !== 'allow') throw new NativeGateError('NATIVE_MCP_POLICY_UNVERIFIED')
      }
      for (let n = 0; n < 40 && (!windowsCatalog || requireMcp && !windowsCatalog.mcpTagCount); n++)
        await new Promise(resolve => setTimeout(resolve, 250))
      const allowedBuiltinCount = options.productBuilder ? 3 : 0
      if (!windowsCatalog?.valid || windowsCatalog.builtinWeb || windowsCatalog.builtinSubagent ||
          windowsCatalog.builtinSpec || windowsCatalog.builtinContext ||
          windowsCatalog.tagCount !== windowsCatalog.mcpTagCount + allowedBuiltinCount ||
          (options.productBuilder && !(windowsCatalog.builtinRead && windowsCatalog.builtinWrite && windowsCatalog.builtinShell)) ||
          (!requireMcp && windowsCatalog.mcpTagCount !== 0) ||
          (requireMcp && windowsCatalog.mcpTagCount < 1)) throw new NativeGateError('NATIVE_ROLE_CATALOG_UNVERIFIED')
    }
    if (probeMode)
      await probe.wait(probe.verify(workspace).markerDirectory)
    if (options.discoveryHaiku === true) {
      if (options.binding?.role !== 'DISCOVERY')
        throw new NativeGateError('NATIVE_DISCOVERY_MODEL_SCOPE_INVALID')
      modelId = await selectDiscoveryHaikuModel({
        client, sessionId, modeId: role, modeSelection: selected,
      })
    }
  } catch (error) { if (sessionId) client.cancel(sessionId); client.close(); throw error }
  let active = false
  let ended = false
  const cancel = () => {
    if (!ended) client.cancel(sessionId)
    return { requested: !ended, acknowledged: false }
  }
  const close = () => { if (active) cancel(); ended = true; client.close() }
  return {
    role,
    workspace: realpathSync(workspace),
    windowId: client.windowId,
    sessionIdForBarrier: sessionId,
    sessionTag: createHash('sha256').update(sessionId).digest('hex').slice(0, 16),
    textDelivery: options.redactText ? 'REDACTED_LINES' : 'AFTER_TURN',
    modelId: typeof modelId === 'string' ? modelId : null,
    async prompt(text, onEvent = () => {}, signal) {
      if (ended) throw new NativeGateError('NATIVE_SESSION_CLOSED')
      if (active) throw new NativeGateError('NATIVE_CONCURRENT_PROMPT_DENIED')
      if (typeof text !== 'string' || text.length === 0 || text.length > 65536)
        throw new NativeGateError('NATIVE_PROMPT_INVALID')
      if (signal?.aborted) throw new NativeGateError('NATIVE_CANCELLED')
      const builderSoftTimeoutMs = builderDeadline === null ? null :
        Math.min(BUILDER_PROMPT_SOFT_TIMEOUT_MS,
          builderDeadline - Date.now() - BUILDER_LEASE_HEADROOM_MS)
      if (builderSoftTimeoutMs !== null && builderSoftTimeoutMs <= 0) {
        close()
        throw new NativeGateError('NATIVE_BUILDER_LEASE_HEADROOM_EXHAUSTED')
      }
      active = true
      let rawText = ''
      let pendingLine = ''
      const toolSummaries = new Map()
      let aborted = false
      let budgetExpired = false
      let callbackError = false
      let cancelTimer
      let budgetTimer
      let rejectUnconfirmed
      const cancellation = new Promise((_, reject) => { rejectUnconfirmed = reject })
      const safeEvent = (event) => {
        try { onEvent(event) }
        catch { callbackError = true; abort() }
      }
      const abort = (reason) => {
        if (aborted) return
        aborted = true
        budgetExpired = reason === 'BUILDER_BUDGET'
        cancel()
        cancelTimer = setTimeout(() => rejectUnconfirmed(new NativeGateError('NATIVE_CANCEL_UNCONFIRMED')), 5000)
      }
      signal?.addEventListener('abort', abort, { once: true })
      try {
        if (options.windowsProduct) {
          await assertCloudConfigAbsent()
          assertNoProtectedCommandHooks(workspace)
        }
        if (builderSoftTimeoutMs !== null)
          budgetTimer = setTimeout(() => abort('BUILDER_BUDGET'), builderSoftTimeoutMs)
        const turn = client.prompt(sessionId, text, (update) => {
          const kind = update?.sessionUpdate
          if (kind === 'agent_message_chunk' && update?.content?.type === 'text') {
            if (typeof update.content.text !== 'string') { abort(); return }
            rawText += update.content.text
            if (Buffer.byteLength(rawText, 'utf8') > 1024 * 1024) { abort(); return }
            if (options.redactText) {
              pendingLine += update.content.text
              if (Buffer.byteLength(pendingLine, 'utf8') > 65536) { abort(); return }
              let end
              while ((end = pendingLine.indexOf('\n')) >= 0) {
                const line = pendingLine.slice(0, end + 1)
                // Assignment and Bearer patterns may cross newlines. Retain a
                // trailing sensitive prefix until the next non-whitespace
                // input arrives, then redact the whole bounded segment.
                if (SECRET_PREFIX.test(line)) break
                pendingLine = pendingLine.slice(end + 1)
                if (Buffer.byteLength(line, 'utf8') <= 65536)
                  safeEvent({ kind: 'text_delta', text: options.redactText(line, workspace) })
              }
            }
            safeEvent({ kind: 'text_pending' })
          } else if (kind === 'session_info_update' &&
              update?._meta?.kiro?.kind === 'queued') {
            const activeSessionId = update._meta.kiro.activeSessionId
            safeEvent({ kind: 'session_queued', activeSessionTag:
              typeof activeSessionId === 'string' && activeSessionId.length <= 256 ?
                createHash('sha256').update(activeSessionId).digest('hex').slice(0, 16) : null })
          } else if (kind === 'tool_call' || kind === 'tool_call_update') {
            const previous = typeof update?.toolCallId === 'string' ?
              toolSummaries.get(update.toolCallId) : null
            const rawInput = update?.rawInput && typeof update.rawInput === 'object' &&
              !Array.isArray(update.rawInput) ? update.rawInput : previous?.rawInput ?? {}
            const protocolKind = typeof update?.kind === 'string' ? update.kind : previous?.kind
            if (typeof update?.toolCallId === 'string')
              toolSummaries.set(update.toolCallId, { kind: protocolKind, rawInput,
                title: update?.title ?? previous?.title })
            const locations = Array.isArray(update?.locations) ? update.locations : []
            const title = typeof (update?.title ?? previous?.title) === 'string' ?
              (update?.title ?? previous.title).toLowerCase() : ''
            const path = typeof rawInput.path === 'string' ? rawInput.path : null
            const relativePath = path === null ? null : relative(realpathSync(workspace),
              resolve(realpathSync(workspace), path))
            const toolName = nativeToolName({ kind: protocolKind, rawInput })
            const rawOutput = typeof update?.rawOutput === 'string' ? update.rawOutput : null
            const outputObject = update?.rawOutput && typeof update.rawOutput === 'object' &&
              !Array.isArray(update.rawOutput) ? update.rawOutput : null
            const shellText = toolName === 'shell' && protocolKind === 'execute' ?
              typeof outputObject?.output === 'string' ? outputObject.output :
              typeof outputObject?.message === 'string' ? outputObject.message : null : null
            const visibleOutput = rawOutput ?? shellText
            const kiroOutputTransformation = toolName === 'shell' &&
              protocolKind === 'execute' &&
              ['clipped', 'offloaded'].includes(update?._meta?.kiro?.outputTransformation?.kind)
              ? update._meta.kiro.outputTransformation.kind.toUpperCase() : null
            const acpTruncationMarkerPresent = toolName === 'shell' &&
              protocolKind === 'execute' && typeof visibleOutput === 'string' &&
              /\n\.\.\.\[truncated [0-9]+ chars\]\.\.\.\n/.test(visibleOutput)
            const shellExitCode = toolName === 'shell' && protocolKind === 'execute' &&
              Number.isSafeInteger(outputObject?.exitCode) &&
              outputObject.exitCode >= -255 && outputObject.exitCode <= 255 ?
              outputObject.exitCode : null
            const structured = outputObject?.structuredContent &&
              typeof outputObject.structuredContent === 'object' ?
              outputObject.structuredContent : null
            const outputDiagnostic = update?.status === 'failed' && outputObject ?
              JSON.stringify(outputObject).slice(0, 65536) : ''
            const validationFieldMentions = [
              'activeDecisionIds', 'relatedFiles', 'stage', 'stageHints',
              'checkpoint', 'expectedPreviousVersion', '_meta',
            ].filter(field => outputDiagnostic.includes(field))
            const validationIssueKinds = [
              'invalid_type', 'required', 'unrecognized_keys', 'too_small', 'invalid_value',
            ].filter(kind => outputDiagnostic.includes(kind))
            const coreAction = protocolKind === 'other' && CORE_ACTIONS.has(rawInput.kind) ?
              rawInput.kind : null
            const bridgeErrorCode = protocolKind === 'other' &&
              update?.status === 'failed' && !coreAction &&
              Object.hasOwn(rawInput, 'inputJson') ?
              bridgeEnvelopeErrorCode(outputObject) : null
            // Kiro terminal redraw can prepend kilobytes of blank padding.
            // Remove only that padding before the bounded redaction preview.
            const outputPreview = visibleOutput?.trimStart() ?? null
            const redactedOutput = outputPreview && options.redactText ?
              options.redactText(outputPreview.slice(0, 4096), workspace) : null
            safeEvent({ kind: 'tool_activity', updateKeys: Object.keys(update ?? {}),
              rawInputKeys: Object.keys(rawInput), locationsCount: locations.length,
              protocolKind: ['read', 'edit', 'execute', 'search', 'think', 'fetch', 'other']
                .includes(protocolKind) ? protocolKind : 'unknown',
              nativeStatus: ['pending', 'in_progress', 'completed', 'failed']
                .includes(update?.status) ? update.status : 'unknown',
              nativeToolIdClass: update?._meta?.kiro?.toolId === 'user_input' ? 'USER_INPUT' :
                typeof update?._meta?.kiro?.toolId === 'string' ? 'OTHER' : null,
              ...(probeMode ? {
                probeToolId: [
                  'orchestrate_subagent', 'invoke_sub_agent', 'subagent_response',
                  'report_progress', 'user_input', 'vibe-single-host-probe-a/meet',
                  'vibe-single-host-probe-b/meet', 'vibe-single-invoke-probe-a/meet',
                  'vibe-single-invoke-probe-b/meet',
                ].includes(update?._meta?.kiro?.toolId) ? update._meta.kiro.toolId : null,
                subExecutionTag: typeof (update?.subExecutionId ??
                  update?._meta?.kiro?.subExecutionId) === 'string' ?
                  createHash('sha256').update(update.subExecutionId ??
                    update._meta.kiro.subExecutionId).digest('hex').slice(0, 12) : null,
                probeStageRoles: Array.isArray(rawInput.stages) ? rawInput.stages.map(stage =>
                  [ 'vibe-single-host-a', 'vibe-single-host-b' ].includes(stage?.role) ?
                    stage.role : 'OTHER').slice(0, 3) : null,
                probeRole: [INVOKE_AGENTS.a, INVOKE_AGENTS.b].includes(rawInput.name) ?
                  rawInput.name : rawInput.name == null ? null : 'OTHER',
                probeContextFilesPresent: 'contextFiles' in rawInput,
                probeResponseFilesPresent: Array.isArray(rawInput.files) &&
                  rawInput.files.length > 0,
                probeToolError: outputObject?.isError === true ||
                  (typeof rawOutput === 'string' &&
                    /PROBE_(?:BARRIER_TIMEOUT|DUPLICATE_CALL|FAILED)/.test(rawOutput)),
                probeAction: title.includes('orchestrate sub-agent') ||
                  title.includes('orchestrate_subagent') ? 'ORCHESTRATE' :
                  title.includes('invoke_sub_agent') ||
                  title.includes('invoke sub-agent') ||
                  update?._meta?.kiro?.toolId === 'invoke_sub_agent' ? 'INVOKE' :
                  title.includes('enter inert a barrier') ||
                  title.includes('@vibe-single-host-probe-a/meet') ||
                  title.includes('@vibe-single-invoke-probe-a/meet') ? 'MEET_A' :
                    title.includes('enter inert b barrier') ||
                    title.includes('@vibe-single-host-probe-b/meet') ||
                    title.includes('@vibe-single-invoke-probe-b/meet') ? 'MEET_B' : null,
              } : {}),
              toolId: typeof update?.toolCallId === 'string' ? createHash('sha256')
                .update(`${sessionId}\u0000${update.toolCallId}`).digest('hex').slice(0, 12) : null,
              toolName, relativePath: toolName === 'read' || toolName === 'search' ||
                toolName === 'write' ?
                safeRelativePath(workspace, rawInput.path) : null,
              coreAction,
              // A parsed wrapper is only a hint about model intent, never a
              // receipt that the bridge or deterministic Core accepted it.
              envelopeInputAction: protocolKind === 'other' ?
                envelopeInputAction(rawInput.inputJson) : null,
              coreIsError: coreAction && typeof outputObject?.isError === 'boolean' ?
                outputObject.isError : null,
              coreSuccess: coreAction && typeof structured?.success === 'boolean' ?
                structured.success : null,
              coreErrorCode: coreAction && typeof structured?.code === 'string' &&
                /^[A-Z0-9_]{1,100}$/.test(structured.code) ? structured.code : null,
              bridgeErrorCode,
              command: toolName === 'shell' ?
                safeNativeCommand(rawInput.command, options.redactText, workspace) : null,
              shellExitCode,
              kiroOutputTransformation,
              acpTruncationMarkerPresent,
              output: redactedOutput?.slice(0, 2048) ?? null,
              outputTruncated: outputPreview !== null && outputPreview.length > 2048,
              rawOutputType: rawOutput !== null ? 'string' : update?.rawOutput == null ?
                'none' : typeof update.rawOutput,
              validationFieldMentions, validationIssueKinds,
              candidateKeys: Array.isArray(rawInput.candidates) &&
                rawInput.candidates[0] && typeof rawInput.candidates[0] === 'object'
                ? Object.keys(rawInput.candidates[0]) : [],
              suggestedScopeKeys: Array.isArray(rawInput.candidates) &&
                rawInput.candidates[0]?.suggestedScope &&
                typeof rawInput.candidates[0].suggestedScope === 'object'
                ? Object.keys(rawInput.candidates[0].suggestedScope) : [],
              draftKeys: rawInput.draft && typeof rawInput.draft === 'object'
                ? Object.keys(rawInput.draft) : [],
              scopeCategories: Array.isArray(rawInput.draft?.scope)
                ? rawInput.draft.scope.map((item) => typeof item?.category === 'string' &&
                    /^[A-Z_]{1,40}$/.test(item.category) ? item.category : 'INVALID') : [],
              titleClass: title.includes('read') ? 'READ' :
                title.includes('write') || title.includes('edit') ? 'WRITE' :
                title.includes('decision') ? 'DECISION' : 'OTHER',
              srcPath: relativePath === 'src/native-event.ts' })
          }
        }, options.productBuilder ? 600000 : options.productMode ? 240000 :
          options.invokeCapabilityProbe ? 180000 :
          options.capabilityProbe ? 150000 : 90000)
        const response = await Promise.race([turn, cancellation])
        clearTimeout(cancelTimer)
        if (callbackError) throw new NativeGateError('NATIVE_EVENT_CALLBACK_FAILED')
        if (aborted) {
          if (response?.stopReason === 'cancelled')
            throw new NativeGateError(budgetExpired ?
              'NATIVE_BUILDER_BUDGET_TIMEOUT_CONFIRMED' : 'NATIVE_CANCELLED_CONFIRMED')
          throw new NativeGateError(budgetExpired ?
            'NATIVE_BUILDER_BUDGET_TIMEOUT_UNCONFIRMED' :
            'NATIVE_CANCEL_RACED_OR_UNCONFIRMED')
        }
        if (response?.stopReason !== 'end_turn')
          throw new NativeGateError('NATIVE_TURN_NOT_COMPLETE')
        // Keep raw chunks internal until the complete turn can be redacted.
        const safeText = options.redactText ? options.redactText(rawText, workspace) :
          (await import('../../packages/application/dist/redaction.js')).redactSensitiveText(rawText, workspace)
        if (options.redactText && pendingLine && Buffer.byteLength(pendingLine, 'utf8') <= 65536)
          safeEvent({ kind: 'text_delta', text: options.redactText(pendingLine, workspace) })
        safeEvent({ kind: 'text', text: safeText })
        if (callbackError) throw new NativeGateError('NATIVE_EVENT_CALLBACK_FAILED')
        ended = true
        return { text: safeText, stopReason: response.stopReason,
          ...(options.invokeCapabilityProbe ? {
            exactUnavailableSentinel: rawText.trim() === 'INVOKE_TOOL_UNAVAILABLE',
          } : {}) }
      } catch (error) {
        cancel()
        if (budgetExpired && error?.code !== 'NATIVE_BUILDER_BUDGET_TIMEOUT_CONFIRMED')
          throw new NativeGateError('NATIVE_BUILDER_BUDGET_TIMEOUT_UNCONFIRMED')
        if (error?.code === 'NATIVE_RPC_TIMEOUT')
          throw new NativeGateError('NATIVE_CANCEL_UNCONFIRMED')
        throw error
      } finally {
        clearTimeout(budgetTimer)
        clearTimeout(cancelTimer)
        signal?.removeEventListener('abort', abort)
        active = false
        close()
      }
    },
    cancel,
    close,
  }
}

module.exports = { EXPECTED, NativeGateError, boundedCoreRole, diagnose, openNativeRole,
  uniqueWorkspaceEndpoint, probeBuiltinHelperPolicy, probeBuiltinHelperDenySeed,
  hasNoMatchSessionAllDeny, openProtectedBuiltinH, openProtectedHLogBarrier,
  productBuiltinHScope, currentApprovedBuiltinHelperScope, currentApprovedProductWorkspace,
  plannedApprovedBuiltinHelperScope,
  probeProtectedBuiltinPair, protectedToolClass,
  assertNoProtectedCommandHooks, builtinHelperBootstrap, protectedCatalogSourceBound }
