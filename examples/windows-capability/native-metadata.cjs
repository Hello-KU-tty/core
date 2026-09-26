// Metadata by default. A separately opted-in Helper turn is tool-less and bounded.
const assert = require('node:assert/strict')
const { realpath, mkdir, writeFile, lstat, readFile } = require('node:fs/promises')
const { homedir } = require('node:os')
const { join } = require('node:path')
const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? value : null

exports.probe = async (vscode, workspace, helper = null) => {
  assert.equal(process.platform, 'win32')
  assert.equal(vscode.workspace.isTrusted, true)
  const sessionWorkspace = helper?.sessionWorkspace ?? workspace
  const role = helper?.name ?? (helper ? 'vibe-w1-helper' : 'vibe-w1-metadata-only')
  await mkdir(join(workspace, '.kiro/agents'), { recursive: true })
  const agentConfig = {
    name: role, description: helper ? 'W1 canonical Helper with Core context' : 'W1 metadata only, never prompted',
    prompt: helper ? helper.rolePrompt : 'No model turn is authorized in this metadata probe.',
    tools: [], resources: [], mcpServers: {}, includeMcpJson: false, includePowers: false,
    permissions: { rules: [{ capability: 'all', effect: 'deny' }] },
    ...(helper?.configuration ?? {}),
  }
  await writeFile(join(workspace, '.kiro/agents', `${role}.json`), JSON.stringify(agentConfig))
  const candidates = []
  for (const endpoint of await vscode.commands.executeCommand('kiro.agentRegistry.getAgentEndpoints')) {
    if (endpoint.folders?.length !== 1) continue
    try { if (await realpath(endpoint.folders[0].path) === workspace) candidates.push(endpoint) } catch {}
  }
  assert.equal(candidates.length, 1)
  const endpoint = candidates[0]
  assert.ok(Number.isInteger(endpoint.port) && endpoint.port > 0 && endpoint.port < 65536)
  assert.equal(typeof endpoint.token, 'string')
  const socket = new WebSocket(`ws://127.0.0.1:${endpoint.port}?token=${encodeURIComponent(endpoint.token)}`)
  const pending = new Map()
  const catalog = new Map()
  let nextId = 1
  let sessionId
  let active = false
  let text = ''
  let unexpectedTool = false
  const chunks = []
  const toolInputs = new Map()
  const permissionReceipts = []
  let streamBuffer = ''
  const flushText = final => {
    const boundary = final ? streamBuffer.length : streamBuffer.lastIndexOf('\n') + 1
    if (boundary > 0) {
      const ready = streamBuffer.slice(0, boundary)
      streamBuffer = streamBuffer.slice(boundary)
      helper?.onEvent?.({ kind: 'TEXT', text: helper.redact ? helper.redact(ready) : ready })
    }
  }
  const request = (method, params, timeoutMs = 15000) => new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('RPC_TIMEOUT')) }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
  })
  socket.addEventListener('message', event => {
    if (typeof event.data !== 'string' || Buffer.byteLength(event.data) > 2_000_000) { socket.close(); return }
    let msg
    try { msg = JSON.parse(event.data) } catch { socket.close(); return }
    if (msg.method === '_kiro/tools/didChange' && typeof msg.params?.sessionId === 'string') {
      catalog.set(msg.params.sessionId, (msg.params.tags ?? []).map(item => ({
        source: ['builtin', 'mcp'].includes(item.source) ? item.source : 'UNKNOWN', tag: safeId(item.tag),
      })))
      if (active && msg.params.sessionId === sessionId && (helper?.allowBuilder
        ? msg.params.tags?.some(item => item.source !== 'mcp' && !['read', 'write', 'shell'].includes(item.tag))
        : helper?.allowMcp ? msg.params.tags?.some(item => item.source !== 'mcp') : msg.params.tags?.length)) {
        unexpectedTool = true
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } }))
      }
    }
    if (active && msg.method === 'session/update' && msg.params?.sessionId === sessionId) {
      const update = msg.params.update
      if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
        text += update.content.text
        streamBuffer += update.content.text
        flushText(false)
        chunks.push({ at: Date.now(), bytes: Buffer.byteLength(update.content.text) })
      }
      if (typeof update?.toolCallId === 'string') {
        toolInputs.set(update.toolCallId, { ...toolInputs.get(update.toolCallId), ...update })
        helper?.onEvent?.({ kind: 'TOOL', update: {
          sessionUpdate: update.sessionUpdate, kind: safeId(update.kind), status: safeId(update.status),
        } })
      }
      if (update?.sessionUpdate === 'tool_call' && !helper?.allowMcp && !helper?.allowBuilder) {
        unexpectedTool = true
        socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } }))
      }
    }
    if (msg.method && msg.id !== undefined) {
      if (msg.method === 'session/request_permission' && msg.params?.sessionId === sessionId) {
        const params = msg.params
        const callId = params.toolCall?.toolCallId
        const correlated = toolInputs.get(callId)
        void Promise.resolve().then(async () => {
          let selected = null
          if (helper?.allowBuilder && active && !helper.signal?.aborted && correlated) {
            selected = await helper.permission({ ...correlated, nativeToolId: params._meta?.kiro?.toolId,
              options: params.options ?? [] })
          }
          if (helper?.signal?.aborted) selected = null
          const option = (params.options ?? []).find(item => item.optionId === selected && item.kind === 'allow_once') ??
            (params.options ?? []).find(item => item.kind === 'reject_once')
          assert.ok(option && typeof callId === 'string')
          const ack = await request('_kiro/permission/respond', { toolCallId: callId, optionId: option.optionId })
          assert.equal(ack.success, true)
          permissionReceipts.push({ kind: safeId(correlated?.kind), decision: option.kind, ack: true })
        }).catch(() => { unexpectedTool = true; socket.close() })
        return
      }
      // Unexpected permission or input is never approved by metadata inspection.
      socket.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Not supported' } }))
    } else if (pending.has(msg.id)) {
      const waiter = pending.get(msg.id)
      pending.delete(msg.id); clearTimeout(waiter.timer)
      if (msg.error) waiter.reject(Object.assign(new Error('RPC_REJECTED'), { rpcCode: msg.error.code }))
      else waiter.resolve(msg.result)
    }
  })
  const report = { modelTurns: 0, stage: 'CONNECT', status: 'NOT_TESTED', windowId: endpoint.windowId }
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CONNECT_TIMEOUT')), 5000)
      socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CONNECT_FAILED')) }, { once: true })
    })
    report.stage = 'INITIALIZE'
    const init = await request('initialize', { protocolVersion: 1,
      clientInfo: { name: 'vibe-helper-w1-metadata', version: '0.1.0' }, clientCapabilities: {} })
    report.protocolVersion = init?.protocolVersion
    assert.equal(init?.protocolVersion, 1)
    report.stage = 'SESSION_NEW'
    const newStarted = Date.now()
    const { name: _name, ...clientAgent } = agentConfig
    const session = await request('session/new', { cwd: sessionWorkspace, mcpServers: [],
      ...(helper ? { _meta: { kiro: { modeId: role, customAgents: [{ id: role, ...clientAgent }] } } } : {}) })
    assert.equal(typeof session.sessionId, 'string')
    sessionId = session.sessionId
    report.config = (session.configOptions ?? []).map(option => ({
      id: safeId(option.id), currentValue: safeId(option.currentValue),
      values: (option.options ?? []).map(item => safeId(item.value)).filter(Boolean),
    }))
    report.policyErrorCount = Array.isArray(session._meta?.policyErrors) ? session._meta.policyErrors.length : null
    report.stage = 'SELECT_CUSTOM_MODE'
    const selected = await request('session/set_config_option', { sessionId, configId: 'mode', value: role })
    assert.equal(selected?.configOptions?.find(option => option.id === 'mode')?.currentValue, role)
    report.customModeSelected = true
    report.stage = 'PERMISSIONS'
    const permissions = await request('_kiro/permissions/list', { sessionId })
    report.rules = (permissions.rules ?? []).map(rule => ({ capability: safeId(rule.capability), effect: safeId(rule.effect) }))
    report.policy = []
    for (const capability of ['fs_read', 'fs_write', 'shell', 'web_search', 'mcp']) {
      const value = await request('_kiro/permissions/explain', { sessionId, capability, resource: '' })
      report.policy.push({ capability, effect: safeId(value.effect) })
    }
    report.catalog = catalog.get(sessionId) ?? null
    report.liveEligibility = {}
    for (const [name, check] of [
      ['cloudPull', () => helper?.cloudProofMode === 'WINDOWS_1170_DIAGNOSTIC'
        ? require('../kiro-native-host/native-cloud-silent-attestation.cjs')
          .waitForOwnedSilentCloudPull(sessionId, sessionWorkspace, { notBefore: newStarted })
        : require('../kiro-native-host/native-cloud-pull-attestation.cjs')
          .waitForOwnedCloudPull(sessionId, sessionWorkspace, { notBefore: newStarted })],
      ['memoryDisabled', () => require('../kiro-native-host/native-memory-attestation.cjs')
        .attestSessionMemoryDisabled(sessionId)],
      ['commandHooksAbsent', async () => {
        for (const path of [join(workspace, '.kiro/hooks'), join(homedir(), '.kiro/hooks'),
          join(homedir(), '.kiro/cloud-cache/user/config/hooks')]) {
          try { await lstat(path) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
          throw new Error('COMMAND_HOOKS_PRESENT')
        }
      }],
    ]) {
      try { await check(); report.liveEligibility[name] = 'PASS' }
      catch (error) { report.liveEligibility[name] = safeId(error.message) ?? 'UNVERIFIED' }
    }
    if (report.liveEligibility.cloudPull !== 'PASS') {
      const { cloudStoreHash } = require('../kiro-native-host/native-cloud-pull-attestation.cjs')
      const bucket = join(homedir(), '.kiro/sessions', cloudStoreHash(workspace))
      const directory = join(bucket, sessionId)
      report.cloudStore = {}
      for (const [name, path] of [['bucket', bucket], ['session', directory],
        ['metadata', join(directory, 'session.json')], ['messages', join(directory, 'messages.jsonl')]]) {
        try { report.cloudStore[name] = (await lstat(path)).size >= 0 } catch { report.cloudStore[name] = false }
      }
      if (report.cloudStore.messages) {
        const info = await lstat(join(directory, 'messages.jsonl'))
        if (!info.isSymbolicLink() && info.size < 262144) {
          const lines = (await readFile(join(directory, 'messages.jsonl'), 'utf8')).trim().split(/\r?\n/).filter(Boolean)
          report.cloudStore.events = lines.slice(0, 20).map(line => {
            try { const p = JSON.parse(line)?.payload; return { type: safeId(p?.type), tool: safeId(p?.toolName), action: safeId(p?.actionType) } }
            catch { return { type: 'UNPARSEABLE' } }
          })
        }
      }
    }
    if (helper) {
      report.stage = 'HELPER_PREFLIGHT'
      assert.ok(Object.values(report.liveEligibility).every(value => value === 'PASS'))
      assert.ok(report.policy.filter(item => !(helper.allowMcp && item.capability === 'mcp'))
        .every(item => item.effect === (helper.allowBuilder && ['fs_read', 'fs_write', 'shell'].includes(item.capability) ? 'ask' : 'deny')))
      if (helper.allowMcp) {
        report.mcpPolicy = []
        for (const tool of helper.toolNames) {
          const permission = await request('_kiro/permissions/explain', { sessionId, capability: 'mcp', resource: `vibe-native-core/${tool}` })
          report.mcpPolicy.push({ tool, effect: safeId(permission.effect) })
          assert.equal(permission.effect, 'allow')
        }
        for (let n = 0; n < 40 && !catalog.get(sessionId)?.some(item => item.source === 'mcp'); n++) await new Promise(done => setTimeout(done, 500))
        report.catalog = catalog.get(sessionId) ?? []
        assert.ok(report.catalog.some(item => item.source === 'mcp') && report.catalog.every(item => item.source === 'mcp' ||
          helper.allowBuilder && ['read', 'write', 'shell'].includes(item.tag)))
      } else assert.deepEqual(report.catalog, [])
      if (helper.metadataOnly) {
        report.status = 'PASS'; report.stage = 'COMPLETE'
        return report
      }
      await helper.beforeTurn()
      report.modelTurns = 1
      report.stage = 'HELPER_PROMPT'
      active = true
      const started = Date.now()
      const abort = () => socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } }))
      helper.signal?.addEventListener('abort', abort, { once: true })
      const turn = request('session/prompt', { sessionId, prompt: [{ type: 'text', text: helper.message }] }, 120000)
      helper.onPromptStart?.()
      let result
      try { result = await turn } finally { helper.signal?.removeEventListener('abort', abort) }
      active = false
      const finished = Date.now()
      flushText(true)
      helper.onComplete?.({ text, stopReason: result.stopReason })
      report.permissionReceipts = permissionReceipts
      report.toolReceipts = [...toolInputs.values()].map(update => {
        const output = JSON.stringify({ rawOutput: update.rawOutput, content: update.content })
        const exit = update.kind === 'execute' ? output.match(/(?:Exit Code|exit code|exitCode)["\s:=\\n]*(-?\d+)/i) : null
        return { kind: safeId(update.kind), status: safeId(update.status),
          ...(update.kind === 'execute' ? { exitCode: exit ? Number(exit[1]) : null } : {}) }
      })
      if (helper.signal?.aborted) {
        report.cancel = { stopReason: safeId(result.stopReason), elapsedMs: finished - started }
        assert.equal(result.stopReason, 'cancelled')
        report.status = 'CANCELLED'; report.stage = 'COMPLETE'
        return report
      }
      assert.equal(unexpectedTool, false)
      assert.equal(result.stopReason, 'end_turn')
      assert.ok(text.trim().length > 0)
      report[helper.role?.toLowerCase() ?? 'helper'] = { stopReason: result.stopReason, started, finished, elapsedMs: finished - started,
        chunks: chunks.length, firstChunkMs: chunks.length ? chunks[0].at - started : null,
        lastChunkBeforeTerminalMs: chunks.length ? finished - chunks.at(-1).at : null,
        receipt: await helper.record(text) }
    }
    report.status = 'PASS'; report.stage = 'COMPLETE'
  } catch (error) {
    report.status = 'FAIL'
    report.permissionReceipts = permissionReceipts
    report.error = { code: safeId(error.message) ?? 'PROBE_FAILED', rpcCode: Number.isInteger(error.rpcCode) ? error.rpcCode : null }
  } finally {
    if (sessionId && socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } }))
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('PROBE_CLOSED')) }
    socket.close()
  }
  return report
}
