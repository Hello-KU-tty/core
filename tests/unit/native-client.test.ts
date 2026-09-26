import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const filesystem = require('node:fs')
const {
  PINNED_AGENT,
  PINNED_PRODUCT,
} = require('../../examples/kiro-native-host/native-installation-source.cjs')
const {
  diagnose,
  openNativeRole,
  uniqueWorkspaceEndpoint,
  hasNoMatchSessionAllDeny,
  productBuiltinHScope,
  protectedToolClass,
  assertNoProtectedCommandHooks,
  builtinHelperBootstrap,
  protectedCatalogSourceBound,
} = require('../../examples/kiro-native-host/native-client.cjs')
const role = 'vibe-native-test'

it('classifies protected native tool interaction without copying a tool title', () => {
  expect(
    protectedToolClass({
      title: 'fixture-private-title',
      _meta: { kiro: { toolId: 'todo_list' } },
    }),
  ).toBe('TOOL_TODO_LIST')
  expect(
    protectedToolClass({
      title: 'fixture-private-title',
      _meta: { kiro: { toolId: '__proto__' } },
    }),
  ).toBe('TOOL_ID_PRESENT_OTHER')
  expect(protectedToolClass({ title: 'fixture-private-title' })).toBe('TOOL_ID_MISSING')
  expect(protectedToolClass({ _meta: { kiro: { toolId: 'list_processes' } } })).toBe(
    'TOOL_PROCESS_INTROSPECTION',
  )
})

it('refuses a protected H session before SessionStart when command hooks exist', () => {
  const helper = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-h-hook-gate-')))
  mkdirSync(join(helper, '.kiro', 'hooks'), { recursive: true })
  expect(() => assertNoProtectedCommandHooks(helper)).toThrow('NATIVE_H_HOOKS_PRESENT')
})

it('keeps the no-model catalog bootstrap token-free and permission ASK only', () => {
  const profile = builtinHelperBootstrap()
  expect(profile.tools).toEqual(['read'])
  expect(profile.permissions.rules).toEqual([{ capability: 'all', effect: 'ask' }])
  expect(profile.mcpServers).toEqual({})
  expect(profile.includeMcpJson).toBe(false)
  expect(profile.includePowers).toBe(false)
  expect(profile).not.toHaveProperty('hooks')
})

it('accepts only the pinned read-only process-introspection category after H deny', () => {
  const finalCatalog = {
    valid: true,
    tagCount: 1,
    mcpTagCount: 0,
    builtinShell: true,
    builtinRead: false,
    builtinWrite: false,
    builtinWeb: false,
    builtinSubagent: false,
    builtinSpec: false,
    builtinContext: false,
  }
  expect(protectedCatalogSourceBound(finalCatalog)).toBe(true)
  for (const changed of [
    { builtinRead: true },
    { builtinWrite: true },
    { builtinWeb: true },
    { builtinSubagent: true },
    { builtinSpec: true },
    { builtinContext: true },
    { mcpTagCount: 1 },
    { tagCount: 2 },
    { builtinShell: false },
    { valid: false },
  ])
    expect(protectedCatalogSourceBound({ ...finalCatalog, ...changed })).toBe(false)
})

it(
  'binds a private built-in Helper cwd to its canonical Project workspace',
  async () => {
    const projectId = 'project_00000000-0000-4000-8000-000000000001'
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-h-scope-')))
    const projects = join(root, 'projects')
    mkdirSync(projects, { mode: 0o700 })
    const workspace = join(projects, projectId)
    mkdirSync(workspace, { mode: 0o700 })
    const helper = join(
      root,
      `__vibe-native-helper-${createHash('sha256').update(projectId).digest('hex').slice(0, 24)}`,
    )
    mkdirSync(helper, { mode: 0o700 })
    if (process.platform === 'win32') {
      expect(() => productBuiltinHScope(projectId, workspace, helper)).toThrow(
        'NATIVE_BUILTIN_H_ROOT_UNSAFE',
      )
      const { privateDirectory } = await import('../../apps/local-backend/src/private-files.js')
      await privateDirectory(workspace)
      await privateDirectory(helper)
    }
    expect(productBuiltinHScope(projectId, workspace, helper)).toEqual({ workspace, helper })
    expect(() => productBuiltinHScope(projectId, workspace, projects)).toThrow(
      'NATIVE_BUILTIN_H_SCOPE_INVALID',
    )
  },
  process.platform === 'win32' ? 30_000 : 10_000,
)
const {
  attestSessionMemoryDisabled,
} = require('../../examples/kiro-native-host/native-memory-attestation.cjs')

function memoryLog(activeExperiments: string, extra = '') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-h-memory-log-')))
  const directory = join(root, '20260914T160102521')
  mkdirSync(directory)
  const sessionId = 'sess_63629d67-504f-47c8-b00c-584b58068b88'
  const line = (message: string) =>
    JSON.stringify({
      timestamp: '2026-09-14T16:01:02.576Z',
      level: 'INFO',
      message,
    })
  writeFileSync(
    join(directory, 'kiro.log'),
    [
      line(`[KiroAgent] Active experiments changed ${JSON.stringify({ activeExperiments })}`),
      line(
        `[KiroAgent] ACP session/new sessionId=${sessionId} modeId=vibe-helper-policy-bootstrap idempotent=false`,
      ),
      extra,
    ].join('\n'),
  )
  return { root, sessionId }
}

it('attests memory defaults only for the exact owned session and complete snapshot', () => {
  const value = memoryLog('')
  expect(attestSessionMemoryDisabled(value.sessionId, value.root)).toBe(true)
  const barrier = 'sess_00000000-0000-4000-8000-000000000001'
  expect(() =>
    attestSessionMemoryDisabled(value.sessionId, value.root, { barrierSessionId: barrier }),
  ).toThrow('NATIVE_H_MEMORY_LOG_UNCONFIRMED')
  expect(() =>
    attestSessionMemoryDisabled('sess_00000000-0000-4000-8000-000000000000', value.root),
  ).toThrow('NATIVE_H_MEMORY_LOG_UNCONFIRMED')
})

it('requires a later same-process Builder marker and ordered metadata', () => {
  const barrier = 'sess_00000000-0000-4000-8000-000000000001'
  const line = (timestamp: string, message: string) =>
    JSON.stringify({
      timestamp,
      level: 'INFO',
      message,
    })
  const value = memoryLog(
    '',
    line(
      '2026-09-14T16:01:03.576Z',
      `[KiroAgent] ACP session/new sessionId=${barrier} modeId=vibe idempotent=false`,
    ),
  )
  expect(
    attestSessionMemoryDisabled(value.sessionId, value.root, {
      barrierSessionId: barrier,
      notBefore: Date.parse('2026-09-14T16:01:00Z'),
      notAfter: Date.parse('2026-09-14T16:01:05Z'),
    }),
  ).toBe(true)
  const outOfOrder = memoryLog(
    '',
    line(
      '2026-09-14T16:01:01.576Z',
      `[KiroAgent] ACP session/new sessionId=${barrier} modeId=vibe idempotent=false`,
    ),
  )
  expect(() =>
    attestSessionMemoryDisabled(outOfOrder.sessionId, outOfOrder.root, {
      barrierSessionId: barrier,
    }),
  ).toThrow('NATIVE_H_MEMORY_LOG_OUT_OF_ORDER')
  expect(() =>
    attestSessionMemoryDisabled(value.sessionId, value.root, {
      barrierSessionId: barrier,
      notBefore: Date.parse('2026-09-14T16:02:00Z'),
      notAfter: Date.parse('2026-09-14T16:03:00Z'),
    }),
  ).toThrow('NATIVE_H_MEMORY_SESSION_TIME_MISMATCH')
})

it('fails closed on memory overrides and truncated experiment metadata', () => {
  for (const active of [
    'memory_external_enabled=true',
    'memory_internal_enabled=all',
    'other_flag=true,...',
  ]) {
    const value = memoryLog(active)
    expect(() => attestSessionMemoryDisabled(value.sessionId, value.root)).toThrow()
  }
})

it('fails closed on duplicate H marker and malformed matching log metadata', () => {
  const sessionId = 'sess_63629d67-504f-47c8-b00c-584b58068b88'
  const duplicate = memoryLog(
    '',
    JSON.stringify({
      timestamp: '2026-09-14T16:01:03.576Z',
      level: 'INFO',
      message: `[KiroAgent] ACP session/new sessionId=${sessionId} modeId=vibe idempotent=false`,
    }),
  )
  expect(() => attestSessionMemoryDisabled(duplicate.sessionId, duplicate.root)).toThrow(
    'NATIVE_H_MEMORY_SESSION_LOG_AMBIGUOUS',
  )
  const malformed = memoryLog('', `[KiroAgent] ACP session/new sessionId=${sessionId} broken-json`)
  expect(() => attestSessionMemoryDisabled(malformed.sessionId, malformed.root)).toThrow(
    'NATIVE_H_MEMORY_LOG_INVALID',
  )
})

it('attests only an unrestricted session all-deny rule', () => {
  const rule = { scope: 'session', capability: 'all', effect: 'deny' }
  expect(hasNoMatchSessionAllDeny({ rules: [rule] })).toBe(true)
  expect(hasNoMatchSessionAllDeny({ rules: [{ ...rule, match: ['src/**'] }] })).toBe(false)
  expect(hasNoMatchSessionAllDeny({ rules: [{ ...rule, exclude: ['**'] }] })).toBe(false)
  expect(hasNoMatchSessionAllDeny({ rules: [{ ...rule, match: 'src/**' }] })).toBe(false)
  expect(hasNoMatchSessionAllDeny({ rules: [{ ...rule, scope: 'agent' }] })).toBe(false)
  expect(hasNoMatchSessionAllDeny({ rules: [{ ...rule, capability: 'fs_read' }] })).toBe(false)
})

function workspace(tools = []) {
  const root = mkdtempSync(join(tmpdir(), 'vibe-native-client-unit-'))
  mkdirSync(join(root, '.kiro', 'agents'), { recursive: true })
  writeFileSync(
    join(root, '.kiro', 'agents', `${role}.json`),
    JSON.stringify({
      name: role,
      tools,
      mcpServers: {},
      includeMcpJson: false,
      includePowers: false,
    }),
  )
  return root
}

function pinnedKiroInstallation() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-native-client-kiro-')))
  const agent = join(root, 'extensions', 'kiro.kiro-agent')
  mkdirSync(agent, { recursive: true })
  writeFileSync(join(root, 'product.json'), JSON.stringify(PINNED_PRODUCT))
  writeFileSync(join(agent, 'package.json'), JSON.stringify(PINNED_AGENT))
  return root
}

function fakeVscode(root, overrides = {}) {
  return {
    version: overrides.version ?? '1.109.5',
    ...(overrides.appRoot ? { env: { appRoot: overrides.appRoot } } : {}),
    workspace: {
      workspaceFolders: [{ uri: { fsPath: root } }],
      isTrusted: overrides.trusted ?? true,
      getConfiguration: () => ({ get: () => overrides.mcpSetting ?? 'Disabled' }),
    },
    extensions: {
      getExtension:
        overrides.getExtension ??
        (() => ({
          packageJSON: { version: overrides.kiroExtensionVersion ?? '1.0.653' },
          activate: async () => undefined,
        })),
    },
    commands: {
      executeCommand: async (name) => {
        if (name === 'kiroAgent.customAgents.listCustomAgents') return [{ id: role }]
        if (name === 'kiroAgent.mcp.getCanEnableMCP') return overrides.canEnableMcp ?? false
        if (name === 'kiro.agentRegistry.getAgentEndpoints')
          return (
            overrides.endpoints ?? [
              {
                port: 49731,
                token: 'synthetic-endpoint-token',
                windowId: 7,
                folders: [{ path: root }],
              },
            ]
          )
        throw new Error('UNEXPECTED_COMMAND')
      },
    },
  }
}

class FakeWebSocket {
  static responses = 'complete'
  static silentRpc: string | null = null
  static discoveryMode = false
  static editUpdateToolId = null
  static editPermissionToolId = 'str_replace'
  static created = 0
  static closed = 0
  static sent = []
  static permissionAck = true
  static userInputAck = true
  constructor() {
    FakeWebSocket.created++
    this.listeners = new Map()
    queueMicrotask(() => this.emit('open', {}))
  }
  addEventListener(name, handler) {
    const handlers = this.listeners.get(name) ?? []
    handlers.push(handler)
    this.listeners.set(name, handlers)
  }
  emit(name, event) {
    for (const handler of this.listeners.get(name) ?? []) handler(event)
  }
  response(id, result) {
    queueMicrotask(() =>
      this.emit('message', { data: JSON.stringify({ jsonrpc: '2.0', id, result }) }),
    )
  }
  send(raw) {
    const message = JSON.parse(raw)
    FakeWebSocket.sent.push(message)
    if (message.method === FakeWebSocket.silentRpc) return
    if (message.method === 'session/new' && FakeWebSocket.responses === 'earlyToolCatalog') {
      for (const sessionId of ['session_foreign_0002', 'session_synthetic_0001'])
        this.emit('message', {
          data: JSON.stringify({
            jsonrpc: '2.0',
            method: '_kiro/tools/didChange',
            params: {
              sessionId,
              tags: [{ source: 'mcp', tag: '@fixture/private', description: 'fixture-secret' }],
            },
          }),
        })
    }
    if (message.method === 'initialize') this.response(message.id, { protocolVersion: 1 })
    if (message.method === 'session/new')
      this.response(message.id, {
        sessionId: 'session_synthetic_0001',
        configOptions: [
          {
            id: 'mode',
            options: [
              { value: FakeWebSocket.discoveryMode ? 'vibe-native-discovery-deadbeef' : role },
            ],
          },
        ],
      })
    if (message.method === 'session/set_config_option')
      this.response(message.id, {
        configOptions: FakeWebSocket.discoveryMode
          ? [
              {
                id: 'mode',
                type: 'select',
                currentValue: 'vibe-native-discovery-deadbeef',
                options: [{ value: 'vibe-native-discovery-deadbeef' }],
              },
              {
                id: 'model',
                type: 'select',
                currentValue: message.params.configId === 'model' ? 'claude-haiku-4.5' : 'auto',
                options: [{ value: 'auto' }, { value: 'claude-haiku-4.5' }],
              },
            ]
          : [{ id: 'mode', currentValue: role }],
      })
    if (
      message.method === 'session/prompt' &&
      ['complete', 'splitNewline'].includes(FakeWebSocket.responses)
    ) {
      const chunks =
        FakeWebSocket.responses === 'splitNewline'
          ? ['A safe line\n', 'token=\n', 'fixture-sensitive-value\n']
          : ['Bearer abc', 'def123456789']
      for (const text of chunks)
        queueMicrotask(() =>
          this.emit('message', {
            data: JSON.stringify({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId: 'session_synthetic_0001',
                update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
              },
            }),
          }),
        )
      this.response(message.id, { stopReason: 'end_turn' })
    }
    if (
      message.method === 'session/prompt' &&
      ['cancel', 'ignoreCancel', 'lateEndTurn'].includes(FakeWebSocket.responses)
    )
      this.promptId = message.id
    if (message.method === 'session/prompt' && FakeWebSocket.responses === 'queued') {
      for (const sessionId of ['session_foreign_0002', 'session_synthetic_0001'])
        queueMicrotask(() =>
          this.emit('message', {
            data: JSON.stringify({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId,
                update: {
                  sessionUpdate: 'session_info_update',
                  _meta: { kiro: { kind: 'queued', activeSessionId: 'session_private_builder' } },
                },
              },
            }),
          }),
        )
      this.response(message.id, { stopReason: 'end_turn' })
    }
    if (message.method === 'session/prompt' && FakeWebSocket.responses === 'toolCatalog') {
      for (const sessionId of ['session_foreign_0002', 'session_synthetic_0001'])
        queueMicrotask(() =>
          this.emit('message', {
            data: JSON.stringify({
              jsonrpc: '2.0',
              method: '_kiro/tools/didChange',
              params: {
                sessionId,
                tags: [
                  { source: 'builtin', tag: 'read', description: 'fixture-secret-built-in' },
                  { source: 'mcp', tag: '@fixture/tool', description: 'fixture-secret-mcp' },
                ],
              },
            }),
          }),
        )
      this.response(message.id, { stopReason: 'end_turn' })
    }
    if (message.method === 'session/prompt' && FakeWebSocket.responses === 'failedValidation') {
      queueMicrotask(() =>
        this.emit('message', {
          data: JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'session_synthetic_0001',
              update: {
                sessionUpdate: 'tool_call_update',
                toolCallId: 'validation_1',
                kind: 'other',
                status: 'failed',
                rawInput: { schemaVersion: 1, projectId: 'project_synthetic' },
                rawOutput: {
                  content: [
                    {
                      type: 'text',
                      text: 'invalid_type: activeDecisionIds is required. fixture-private-detail',
                    },
                  ],
                },
              },
            },
          }),
        }),
      )
      this.response(message.id, { stopReason: 'end_turn' })
    }
    if (
      message.method === 'session/prompt' &&
      ['failedEnvelope', 'ambiguousEnvelope'].includes(FakeWebSocket.responses)
    ) {
      const diagnostic =
        FakeWebSocket.responses === 'failedEnvelope'
          ? 'BRIDGE_ENVELOPE_JSON_INVALID'
          : 'BRIDGE_ENVELOPE_JSON_INVALID BRIDGE_ENVELOPE_WRAPPER_INVALID'
      queueMicrotask(() =>
        this.emit('message', {
          data: JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'session_synthetic_0001',
              update: {
                sessionUpdate: 'tool_call_update',
                toolCallId: 'envelope_1',
                kind: 'other',
                status: 'failed',
                rawInput: {
                  inputJson:
                    FakeWebSocket.responses === 'failedEnvelope'
                      ? '{not-json'
                      : JSON.stringify({
                          kind: 'BUILDER_REQUEST_DECISION',
                          private: 'fixture-secret',
                        }),
                  _meta: { private: 'fixture-secret' },
                },
                rawOutput: {
                  content: [{ type: 'text', text: `Error: ${diagnostic}; token=fixture-secret` }],
                },
              },
            },
          }),
        }),
      )
      this.response(message.id, { stopReason: 'end_turn' })
    }
    if (message.method === 'session/prompt' && FakeWebSocket.responses === 'ownedUserInput') {
      queueMicrotask(() =>
        this.emit('message', {
          data: JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'session_synthetic_0001',
              update: {
                sessionUpdate: 'tool_call_update',
                toolCallId: 'user_input_1',
                kind: 'other',
                status: 'pending',
                _meta: { kiro: { toolId: 'user_input', userInputOptions: [] } },
              },
            },
          }),
        }),
      )
      queueMicrotask(() =>
        this.emit('message', {
          data: JSON.stringify({
            jsonrpc: '2.0',
            id: 910,
            method: '_kiro/userInput',
            params: {
              sessionId: 'session_synthetic_0001',
              toolCallId: 'user_input_1',
              question: 'fixture-private-question',
              options: [{ title: 'fixture-private-option', recommended: true }],
            },
          }),
        }),
      )
      this.response(message.id, { stopReason: 'end_turn' })
    }
    if (message.method === 'session/prompt' && FakeWebSocket.responses === 'ownedUserInputAwait') {
      this.promptId = message.id
      for (let index = 0; index < 2; index++)
        queueMicrotask(() =>
          this.emit('message', {
            data: JSON.stringify({
              jsonrpc: '2.0',
              id: 920 + index,
              method: '_kiro/userInput',
              params: {
                sessionId: 'session_synthetic_0001',
                toolCallId: 'user_input_2',
                question: 'fixture-private-question',
                options: [{ title: 'Continue', recommended: true }, { title: 'Stop' }],
              },
            }),
          }),
        )
    }
    if (message.method === '_kiro/userInput/respond') {
      this.response(message.id, {
        success: FakeWebSocket.userInputAck,
        toolCallId: message.params.toolCallId,
      })
      if (this.promptId && FakeWebSocket.userInputAck)
        this.response(this.promptId, { stopReason: 'end_turn' })
    }
    if (
      message.method === 'session/prompt' &&
      ['ownedShellOutput', 'ownedShellOutputPadded', 'ownedShellOutputTruncated'].includes(
        FakeWebSocket.responses,
      )
    ) {
      queueMicrotask(() =>
        this.emit('message', {
          data: JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'session_synthetic_0001',
              update: {
                sessionUpdate: 'tool_call_update',
                toolCallId: 'shell_1',
                kind: 'execute',
                status: 'completed',
                rawInput: { command: 'npm test', cwd: '.' },
                rawOutput: {
                  output:
                    FakeWebSocket.responses === 'ownedShellOutputTruncated'
                      ? 'first\n...[truncated 30000 chars]...\nlast'
                      : (FakeWebSocket.responses === 'ownedShellOutputPadded'
                          ? ' '.repeat(8192)
                          : '') + 'token=fixture-secret\n10 tests passed',
                  message: 'fixture-private-duplicate-message',
                  exitCode: 0,
                },
                ...(FakeWebSocket.responses === 'ownedShellOutputTruncated'
                  ? {
                      _meta: {
                        kiro: {
                          outputTransformation: {
                            kind: 'offloaded',
                            absFilePath: '/private/tmp/fixture-secret-path',
                            totalChars: 31000,
                          },
                        },
                      },
                    }
                  : {}),
              },
            },
          }),
        }),
      )
      this.response(message.id, { stopReason: 'end_turn' })
    }
    if (message.method === 'session/prompt' && FakeWebSocket.responses === 'serverRequest') {
      queueMicrotask(() =>
        this.emit('message', {
          data: JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            method: 'session/request_permission',
            params: { sessionId: 'session_foreign_0002', toolCall: { toolCallId: 'foreign_1' } },
          }),
        }),
      )
      this.response(message.id, { stopReason: 'end_turn' })
    }
    if (
      message.method === 'session/prompt' &&
      [
        'serverRequestOwned',
        'foreignToolCollision',
        'ownedStructuredTool',
        'ownedSearchTool',
        'ownedEditTool',
        'ownedSeedRequest',
      ].includes(FakeWebSocket.responses)
    ) {
      this.promptId = message.id
      if (!['serverRequestOwned', 'ownedSeedRequest'].includes(FakeWebSocket.responses))
        queueMicrotask(() =>
          this.emit('message', {
            data: JSON.stringify({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId:
                  FakeWebSocket.responses === 'foreignToolCollision'
                    ? 'session_foreign_0002'
                    : 'session_synthetic_0001',
                update: {
                  sessionUpdate: 'tool_call',
                  toolCallId: 'call_1',
                  kind:
                    FakeWebSocket.responses === 'ownedSearchTool'
                      ? 'search'
                      : FakeWebSocket.responses === 'ownedEditTool'
                        ? 'edit'
                        : 'execute',
                  title: 'Read then write',
                  ...(FakeWebSocket.responses === 'ownedEditTool' && FakeWebSocket.editUpdateToolId
                    ? { _meta: { kiro: { toolId: FakeWebSocket.editUpdateToolId } } }
                    : {}),
                  rawInput:
                    FakeWebSocket.responses === 'ownedSearchTool'
                      ? { path: '.', explanation: null, depth: 1 }
                      : FakeWebSocket.responses === 'ownedEditTool'
                        ? { path: 'package.json', oldStr: 'old', newStr: 'new' }
                        : { command: 'npm test' },
                },
              },
            }),
          }),
        )
      if (
        ['ownedStructuredTool', 'ownedSearchTool', 'ownedEditTool'].includes(
          FakeWebSocket.responses,
        )
      )
        queueMicrotask(() =>
          this.emit('message', {
            data: JSON.stringify({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId: 'session_synthetic_0001',
                update: {
                  sessionUpdate: 'tool_call_update',
                  toolCallId: 'call_1',
                  status: 'in_progress',
                  rawInput:
                    FakeWebSocket.responses === 'ownedSearchTool'
                      ? { path: '.', explanation: null, depth: 1 }
                      : FakeWebSocket.responses === 'ownedEditTool'
                        ? { path: 'package.json', oldStr: 'old', newStr: 'new', replace_all: false }
                        : { command: 'npm test' },
                },
              },
            }),
          }),
        )
      queueMicrotask(() =>
        this.emit('message', {
          data: JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            method: 'session/request_permission',
            params: {
              sessionId: 'session_synthetic_0001',
              toolCall: { toolCallId: 'call_1' },
              ...(FakeWebSocket.responses === 'ownedEditTool'
                ? { _meta: { kiro: { toolId: FakeWebSocket.editPermissionToolId } } }
                : FakeWebSocket.responses === 'ownedSeedRequest'
                  ? { _meta: { kiro: { toolId: 'read_file', consent: { capability: 'all' } } } }
                  : {}),
              options: [
                { kind: 'allow_once', optionId: 'once_1' },
                { kind: 'reject_once', optionId: 'reject_1' },
                ...(FakeWebSocket.responses === 'ownedSeedRequest'
                  ? [{ kind: 'reject_always', optionId: 'always-reject' }]
                  : []),
              ],
            },
          }),
        }),
      )
    }
    if (message.method === '_kiro/permission/respond' && this.promptId) {
      this.response(message.id, {
        success: FakeWebSocket.permissionAck,
        toolCallId: message.params.toolCallId,
      })
      if (FakeWebSocket.permissionAck) this.response(this.promptId, { stopReason: 'end_turn' })
    }
    if (message.method === 'session/cancel' && this.promptId) {
      if (FakeWebSocket.responses === 'cancel')
        this.response(this.promptId, { stopReason: 'cancelled' })
      if (FakeWebSocket.responses === 'lateEndTurn')
        this.response(this.promptId, { stopReason: 'end_turn' })
    }
  }
  close() {
    FakeWebSocket.closed++
    this.emit('close', {})
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  FakeWebSocket.created = 0
  FakeWebSocket.closed = 0
  FakeWebSocket.responses = 'complete'
  FakeWebSocket.silentRpc = null
  FakeWebSocket.discoveryMode = false
  FakeWebSocket.editUpdateToolId = null
  FakeWebSocket.editPermissionToolId = 'str_replace'
  FakeWebSocket.sent = []
  FakeWebSocket.permissionAck = true
  FakeWebSocket.userInputAck = true
})

describe('private Kiro native connection gate', () => {
  it.each([
    ['initialize', 'INITIALIZE', 15_000],
    ['session/new', 'SESSION_NEW', 30_000],
  ] as const)(
    'reports only the operation when %s times out before a prompt',
    async (method, operation, timeout) => {
      const root = workspace()
      FakeWebSocket.silentRpc = method
      vi.stubGlobal('WebSocket', FakeWebSocket)
      vi.useFakeTimers()
      const telemetry: unknown[] = []
      const opening = openNativeRole(fakeVscode(root), {
        workspace: root,
        role,
        requireMcp: false,
        onProtocolTelemetry: (value: unknown) => telemetry.push(value),
      })
      const failed = expect(opening).rejects.toMatchObject({ code: 'NATIVE_RPC_TIMEOUT' })
      await vi.advanceTimersByTimeAsync(timeout)
      await failed
      expect(telemetry).toEqual([{ kind: 'RPC_TIMEOUT', operation }])
      expect(FakeWebSocket.sent.some((value) => value.method === 'session/prompt')).toBe(false)
      expect(FakeWebSocket.closed).toBe(1)
    },
  )

  it('selects Discovery Haiku only after owned mode and model ACKs', async () => {
    const root = workspace()
    const discoveryRole = 'vibe-native-discovery-deadbeef'
    writeFileSync(
      join(root, '.kiro', 'agents', `${discoveryRole}.json`),
      JSON.stringify({
        name: discoveryRole,
        tools: [],
        mcpServers: {},
        includeMcpJson: false,
        includePowers: false,
      }),
    )
    FakeWebSocket.discoveryMode = true
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root, { kiroExtensionVersion: '1.0.794' }), {
      workspace: root,
      role: discoveryRole,
      requireMcp: false,
      binding: { role: 'DISCOVERY' },
      discoveryHaiku: true,
    })
    expect(session.modelId).toBe('claude-haiku-4.5')
    expect(
      FakeWebSocket.sent
        .filter((message) => message.method === 'session/set_config_option')
        .map((message) => message.params),
    ).toEqual([
      { sessionId: 'session_synthetic_0001', configId: 'mode', value: discoveryRole },
      { sessionId: 'session_synthetic_0001', configId: 'model', value: 'claude-haiku-4.5' },
    ])
    session.close()
  })

  it('rejects unsupported version, untrusted workspace and missing Core binding before connecting', async () => {
    const root = workspace()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    await expect(diagnose(fakeVscode(root, { version: '1.999.0' }), root)).rejects.toMatchObject({
      code: 'NATIVE_KIRO_VERSION_UNVERIFIED',
    })
    await expect(
      openNativeRole(fakeVscode(root, { trusted: false }), {
        workspace: root,
        role,
        requireMcp: false,
      }),
    ).rejects.toMatchObject({ code: 'NATIVE_WORKSPACE_UNTRUSTED' })
    await expect(
      openNativeRole(fakeVscode(root), {
        workspace: root,
        role,
        requireMcp: true,
      }),
    ).rejects.toMatchObject({ code: 'NATIVE_CORE_BINDING_REQUIRED' })
    await expect(
      openNativeRole(fakeVscode(root), {
        workspace: root,
        role,
        requireMcp: false,
        productMode: true,
      }),
    ).rejects.toMatchObject({ code: 'NATIVE_KIRO_VERSION_UNVERIFIED' })
    expect(FakeWebSocket.created).toBe(0)
  })

  it('attests product mode from the pinned running app without cross-host extension API access', async () => {
    const root = workspace()
    const appRoot = pinnedKiroInstallation()
    const source = fakeVscode(root, {
      appRoot,
      getExtension: () => {
        throw new Error('CROSS_HOST_API_MUST_NOT_BE_USED')
      },
    })
    await expect(
      diagnose(source, root, { productSource: true, filesystem, pinnedAppRoot: appRoot }),
    ).resolves.toMatchObject({ extensionVersion: '1.0.794', agentIds: null })
  })

  it('uses mode response to prove a custom role when the 1.0.794 list command is absent', async () => {
    const root = workspace()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const diagnostic = await diagnose(
      fakeVscode(root, { kiroExtensionVersion: '1.0.794', mcpSetting: 'Disabled' }),
      root,
    )
    expect(diagnostic.agentIds).toBeNull()
    expect(diagnostic.mcpReady).toBe(false)
    const session = await openNativeRole(
      fakeVscode(root, { kiroExtensionVersion: '1.0.794', mcpSetting: 'Disabled' }),
      { workspace: root, role, requireMcp: false },
    )
    expect(session.role).toBe(role)
    expect(session.windowId).toBe(7)
    session.close()
  })

  it('rejects foreign and ambiguous endpoint mappings', () => {
    const root = workspace()
    const other = workspace()
    const endpoint = {
      port: 49731,
      token: 'synthetic-endpoint-token',
      windowId: 7,
      folders: [{ path: root }],
    }
    expect(() =>
      uniqueWorkspaceEndpoint([{ ...endpoint, folders: [{ path: other }] }], root),
    ).toThrow('NATIVE_ENDPOINT_MISSING')
    expect(() => uniqueWorkspaceEndpoint([endpoint, endpoint], root)).toThrow(
      'NATIVE_ENDPOINT_AMBIGUOUS',
    )
  })

  it.skipIf(process.platform !== 'win32')(
    'binds the same Windows folder when Kiro lowercases its drive letter',
    async () => {
      const root = workspace()
      const lowerDrive = root[0]?.toLowerCase() + root.slice(1)
      await expect(diagnose(fakeVscode(lowerDrive), root)).resolves.toMatchObject({ trusted: true })
      const endpoint = {
        port: 49731,
        token: 'synthetic-endpoint-token',
        windowId: 7,
        folders: [{ path: lowerDrive }],
      }
      expect(uniqueWorkspaceEndpoint([endpoint], root).windowId).toBe(7)
      expect(() =>
        uniqueWorkspaceEndpoint([endpoint, { ...endpoint, folders: [{ path: root }] }], root),
      ).toThrow('NATIVE_ENDPOINT_AMBIGUOUS')
    },
  )

  it('denies tool-bearing configs on the tool-less path', async () => {
    const root = workspace(['fs_write'])
    vi.stubGlobal('WebSocket', FakeWebSocket)
    await expect(
      openNativeRole(fakeVscode(root), { workspace: root, role, requireMcp: false }),
    ).rejects.toMatchObject({ code: 'NATIVE_TOOLLESS_ROLE_NOT_VERIFIED' })
    expect(FakeWebSocket.created).toBe(0)
  })

  it('withholds split raw chunks and redacts the complete text', async () => {
    const root = workspace()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
    })
    const events = []
    const result = await session.prompt('Synthetic prompt', (event) => events.push(event))
    expect(session.textDelivery).toBe('AFTER_TURN')
    expect(result).toEqual({ text: 'Bearer [REDACTED]', stopReason: 'end_turn' })
    expect(events.filter((event) => event.kind === 'text')).toEqual([
      { kind: 'text', text: 'Bearer [REDACTED]' },
    ])
    expect(JSON.stringify(events)).not.toContain('abcdef123456789')
  })

  it('holds sensitive prefixes across line boundaries before progressive delivery', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'splitNewline'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      redactText: (text) => text.replace(/token\s*=\s*[^\s,;]+/gi, 'token=[REDACTED]'),
    })
    const events = []
    const result = await session.prompt('Synthetic prompt', (event) => events.push(event))
    expect(session.textDelivery).toBe('REDACTED_LINES')
    expect(result.text).toBe('A safe line\ntoken=[REDACTED]\n')
    expect(events.filter((event) => event.kind === 'text_delta')).toEqual([
      { kind: 'text_delta', text: 'A safe line\n' },
      { kind: 'text_delta', text: 'token=[REDACTED]\n' },
    ])
    expect(JSON.stringify(events)).not.toContain('fixture-sensitive-value')
  })

  it('reports only a hashed active-session tag for an owned queued update', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'queued'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
    })
    const events = []
    await session.prompt('Synthetic prompt', (event) => events.push(event))
    expect(events.filter((event) => event.kind === 'session_queued')).toEqual([
      {
        kind: 'session_queued',
        activeSessionTag: createHash('sha256')
          .update('session_private_builder')
          .digest('hex')
          .slice(0, 16),
      },
    ])
    expect(JSON.stringify(events)).not.toContain('session_private_builder')
    expect(JSON.stringify(events)).not.toContain('session_foreign_0002')
  })

  it('retains an early catalog only after session/new establishes its ownership', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'earlyToolCatalog'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const metadata = []
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onProtocolTelemetry: (value) => metadata.push(value),
    })
    expect(metadata).toHaveLength(1)
    expect(metadata[0]).toMatchObject({
      kind: 'TOOLS_DID_CHANGE',
      sessionId: 'session_synthetic_0001',
      valid: true,
      tagCount: 1,
      mcpTagCount: 1,
    })
    expect(JSON.stringify(metadata)).not.toContain('fixture-secret')
    expect(JSON.stringify(metadata)).not.toContain('@fixture/private')
    expect(JSON.stringify(metadata)).not.toContain('session_foreign_0002')
    expect(FakeWebSocket.sent.some((value) => value.method === 'session/prompt')).toBe(false)
    session.close()
  })

  it('reports only owned tool catalog categories without descriptions or MCP names', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'toolCatalog'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const metadata = []
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onProtocolTelemetry: (value) => metadata.push(value),
    })
    await session.prompt('Synthetic prompt')
    expect(metadata).toEqual([
      {
        kind: 'TOOLS_DID_CHANGE',
        sessionId: 'session_synthetic_0001',
        valid: true,
        builtinRead: true,
        builtinWrite: false,
        builtinShell: false,
        builtinWeb: false,
        builtinSubagent: false,
        builtinSpec: false,
        builtinContext: false,
        mcpTagCount: 1,
        tagCount: 2,
      },
    ])
    expect(JSON.stringify(metadata)).not.toContain('fixture-secret')
    expect(JSON.stringify(metadata)).not.toContain('@fixture/tool')
    expect(JSON.stringify(metadata)).not.toContain('session_foreign_0002')
  })

  it('reports only allowlisted validation hints from failed native output', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'failedValidation'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
    })
    const events = []
    await session.prompt('Synthetic prompt', (event) => events.push(event))
    const activity = events.find((event) => event.kind === 'tool_activity')
    expect(activity.validationFieldMentions).toEqual(['activeDecisionIds'])
    expect(activity.validationIssueKinds).toEqual(['invalid_type', 'required'])
    expect(JSON.stringify(events)).not.toContain('fixture-private-detail')
  })

  it('reports one exact bridge envelope code without its raw object or input', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'failedEnvelope'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
    })
    const events = []
    await session.prompt('Synthetic prompt', (event) => events.push(event))
    const activity = events.find((event) => event.kind === 'tool_activity')
    expect(activity).toMatchObject({
      protocolKind: 'other',
      nativeStatus: 'failed',
      rawOutputType: 'object',
      bridgeErrorCode: 'BRIDGE_ENVELOPE_JSON_INVALID',
      coreAction: null,
    })
    expect(JSON.stringify(events)).not.toContain('fixture-secret')
    FakeWebSocket.responses = 'ambiguousEnvelope'
    const secondSession = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
    })
    const next = []
    await secondSession.prompt('Synthetic prompt', (event) => next.push(event))
    expect(next.find((event) => event.kind === 'tool_activity')).toMatchObject({
      bridgeErrorCode: null,
      envelopeInputAction: 'BUILDER_REQUEST_DECISION',
      coreAction: null,
    })
    expect(JSON.stringify(next)).not.toContain('fixture-secret')
  })

  it('only calls cancellation confirmed when the native turn returns cancelled', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'cancel'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
    })
    const controller = new AbortController()
    const turn = session.prompt('Synthetic long prompt', () => undefined, controller.signal)
    queueMicrotask(() => controller.abort())
    await expect(turn).rejects.toMatchObject({ code: 'NATIVE_CANCELLED_CONFIRMED' })
  })

  it('requests Builder budget cancellation before the hard RPC and requires an owned terminal ACK', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'cancel'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      productBuilder: true,
      builderLeaseDeadlineAt: new Date(Date.now() + 660_000).toISOString(),
    })
    vi.useFakeTimers()
    const turn = session.prompt('Synthetic Builder turn')
    const verdict = expect(turn).rejects.toMatchObject({
      code: 'NATIVE_BUILDER_BUDGET_TIMEOUT_CONFIRMED',
    })
    await vi.advanceTimersByTimeAsync(590_000)
    await verdict
    expect(FakeWebSocket.sent.some((message) => message.method === 'session/cancel')).toBe(true)
    expect(FakeWebSocket.closed).toBe(1)
  })

  it('closes an unacknowledged Builder budget cancellation and never accepts a late end_turn', async () => {
    for (const mode of ['ignoreCancel', 'lateEndTurn']) {
      const root = workspace()
      FakeWebSocket.responses = mode
      vi.stubGlobal('WebSocket', FakeWebSocket)
      const session = await openNativeRole(fakeVscode(root), {
        workspace: root,
        role,
        requireMcp: false,
        productBuilder: true,
        builderLeaseDeadlineAt: new Date(Date.now() + 660_000).toISOString(),
      })
      const closedBefore = FakeWebSocket.closed
      vi.useFakeTimers()
      const turn = session.prompt('Synthetic Builder turn')
      const verdict = expect(turn).rejects.toMatchObject({
        code: 'NATIVE_BUILDER_BUDGET_TIMEOUT_UNCONFIRMED',
      })
      await vi.advanceTimersByTimeAsync(mode === 'ignoreCancel' ? 595_000 : 590_000)
      await verdict
      expect(FakeWebSocket.closed).toBe(closedBefore + 1)
      vi.useRealTimers()
    }
  })

  it('keeps an explicit user cancellation distinct from a Builder run-budget timeout', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'cancel'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      productBuilder: true,
      builderLeaseDeadlineAt: new Date(Date.now() + 660_000).toISOString(),
    })
    const controller = new AbortController()
    const turn = session.prompt('Synthetic Builder turn', () => undefined, controller.signal)
    queueMicrotask(() => controller.abort())
    await expect(turn).rejects.toMatchObject({ code: 'NATIVE_CANCELLED_CONFIRMED' })
  })

  it('bounds Builder prompt time by the remaining lease and does not start without headroom', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'cancel'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      productBuilder: true,
      builderLeaseDeadlineAt: new Date(Date.now() + 30_000).toISOString(),
    })
    vi.useFakeTimers()
    const turn = session.prompt('Synthetic short-lease turn')
    const verdict = expect(turn).rejects.toMatchObject({
      code: 'NATIVE_BUILDER_BUDGET_TIMEOUT_CONFIRMED',
    })
    await vi.advanceTimersByTimeAsync(15_000)
    await verdict
    vi.useRealTimers()

    const tooLate = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      productBuilder: true,
      builderLeaseDeadlineAt: new Date(Date.now() + 10_000).toISOString(),
    })
    const promptsBefore = FakeWebSocket.sent.filter(
      (message) => message.method === 'session/prompt',
    ).length
    await expect(tooLate.prompt('Synthetic expired-lease turn')).rejects.toMatchObject({
      code: 'NATIVE_BUILDER_LEASE_HEADROOM_EXHAUSTED',
    })
    expect(
      FakeWebSocket.sent.filter((message) => message.method === 'session/prompt'),
    ).toHaveLength(promptsBefore)
  })

  it('rejects a Builder role without a strict relay lease deadline before opening an observer', async () => {
    const root = workspace()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    await expect(
      openNativeRole(fakeVscode(root), {
        workspace: root,
        role,
        requireMcp: false,
        productBuilder: true,
      }),
    ).rejects.toMatchObject({ code: 'NATIVE_BUILDER_LEASE_DEADLINE_INVALID' })
    expect(FakeWebSocket.created).toBe(0)
  })

  it('ignores a same-id permission request broadcast from another session', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'serverRequest'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const onPermissionRequest = vi.fn()
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onPermissionRequest,
    })
    await expect(session.prompt('Synthetic prompt')).resolves.toEqual({
      text: '',
      stopReason: 'end_turn',
    })
    expect(onPermissionRequest).not.toHaveBeenCalled()
    expect(
      FakeWebSocket.sent.some((message) => message.method === '_kiro/permission/respond'),
    ).toBe(false)
  })
  it('denies an owned same-id permission request without resolving the pending prompt', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'serverRequestOwned'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
    })
    await expect(session.prompt('Synthetic prompt')).resolves.toEqual({
      text: '',
      stopReason: 'end_turn',
    })
    expect(
      FakeWebSocket.sent.find((message) => message.method === '_kiro/permission/respond')?.params,
    ).toEqual({
      toolCallId: 'call_1',
      optionId: 'reject_1',
    })
  })

  it('routes a session-only always-reject seed with empty resource and root', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'ownedSeedRequest'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onPermissionRequest: async (_summary, detail) => {
        expect(detail.sessionId).toBe('session_synthetic_0001')
        expect(detail.policySeedToolId).toBe('read_file')
        expect(detail.policySeedConsentCapability).toBe('all')
        return { kind: 'SESSION_DENY_SEED', optionId: 'always-reject' }
      },
    })
    await session.prompt('Synthetic policy request')
    expect(
      FakeWebSocket.sent.find((message) => message.method === '_kiro/permission/respond')?.params,
    ).toEqual({
      toolCallId: 'call_1',
      optionId: 'always-reject',
      _meta: { kiro: { consent: { scope: 'session', resource: '', workspaceRoot: '' } } },
    })
  })

  it('ignores foreign tool updates with a colliding call id', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'foreignToolCollision'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const onPermissionRequest = vi.fn(async (_summary, detail) => {
      expect(detail.rawInput).toBeNull()
      expect(detail.toolName).toBeNull()
      return null
    })
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onPermissionRequest,
    })
    await expect(session.prompt('Synthetic prompt')).resolves.toEqual({
      text: '',
      stopReason: 'end_turn',
    })
    expect(onPermissionRequest).toHaveBeenCalledOnce()
    expect(
      FakeWebSocket.sent.find((message) => message.method === '_kiro/permission/respond')?.params,
    ).toEqual({
      toolCallId: 'call_1',
      optionId: 'reject_1',
    })
  })

  it('uses structured kind and input instead of a misleading tool title', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'ownedStructuredTool'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const onPermissionRequest = vi.fn(async (_summary, detail) => {
      expect(detail.toolName).toBe('shell')
      expect(detail.rawInput).toEqual({ command: 'npm test' })
      return 'once_1'
    })
    const telemetry = []
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onPermissionRequest,
      onPermissionTelemetry: (phase, toolName) => telemetry.push({ phase, toolName }),
    })
    await expect(session.prompt('Synthetic prompt')).resolves.toEqual({
      text: '',
      stopReason: 'end_turn',
    })
    expect(onPermissionRequest).toHaveBeenCalledOnce()
    expect(
      FakeWebSocket.sent.find((message) => message.method === '_kiro/permission/respond')?.params,
    ).toEqual({
      toolCallId: 'call_1',
      optionId: 'once_1',
    })
    expect(telemetry).toEqual([
      { phase: 'REQUEST', toolName: 'shell' },
      { phase: 'SELECTED', toolName: 'shell' },
      { phase: 'SENT', toolName: 'shell' },
      { phase: 'ACKED', toolName: 'shell' },
    ])
  })

  it('correlates the pinned str_replace tool ID with the edit permission request', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'ownedEditTool'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const onPermissionRequest = vi.fn(async (_summary, detail) => {
      expect(detail.toolName).toBe('write')
      expect(detail.nativeToolId).toBe('str_replace')
      expect(detail.rawInput).toEqual({
        path: 'package.json',
        oldStr: 'old',
        newStr: 'new',
        replace_all: false,
      })
      return 'once_1'
    })
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onPermissionRequest,
    })
    await expect(session.prompt('Synthetic prompt')).resolves.toMatchObject({
      stopReason: 'end_turn',
    })
    expect(onPermissionRequest).toHaveBeenCalledOnce()
  })

  it('does not trust a permission tool ID that conflicts with its same-call update', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'ownedEditTool'
    FakeWebSocket.editUpdateToolId = 'fs_write'
    FakeWebSocket.editPermissionToolId = 'str_replace'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const onPermissionRequest = vi.fn(async (_summary, detail) => {
      expect(detail.toolName).toBe('write')
      expect(detail.nativeToolId).toBeNull()
      return null
    })
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onPermissionRequest,
    })
    await expect(session.prompt('Synthetic prompt')).resolves.toMatchObject({
      stopReason: 'end_turn',
    })
    expect(onPermissionRequest).toHaveBeenCalledOnce()
    expect(
      FakeWebSocket.sent.find((message) => message.method === '_kiro/permission/respond')?.params
        .optionId,
    ).toBe('reject_1')
  })

  it('fails closed when the observer permission route does not acknowledge selection', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'ownedStructuredTool'
    FakeWebSocket.permissionAck = false
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onPermissionRequest: async () => 'once_1',
    })
    await expect(session.prompt('Synthetic prompt')).rejects.toMatchObject({
      code: 'NATIVE_PERMISSION_ACK_FAILED',
    })
  })

  it('correlates the installed directory-search kind across updates', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'ownedSearchTool'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const onPermissionRequest = vi.fn(async (_summary, detail) => {
      expect(detail.toolName).toBe('search')
      expect(detail.rawInput).toEqual({ path: '.', explanation: null, depth: 1 })
      return 'once_1'
    })
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onPermissionRequest,
    })
    const events = []
    await expect(
      session.prompt('Synthetic prompt', (event) => events.push(event)),
    ).resolves.toEqual({
      text: '',
      stopReason: 'end_turn',
    })
    expect(onPermissionRequest).toHaveBeenCalledOnce()
    expect(events.find((event) => event.kind === 'tool_activity')?.relativePath).toBe('.')
  })

  it('classifies an owned native user-input request without copying question or option text', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'ownedUserInput'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const telemetry = []
    const events = []
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onProtocolTelemetry: (summary) => telemetry.push(summary),
    })
    await expect(
      session.prompt('Synthetic prompt', (event) => events.push(event)),
    ).resolves.toEqual({
      text: '',
      stopReason: 'end_turn',
    })
    expect(telemetry).toEqual([
      {
        kind: 'USER_INPUT_REQUEST',
        sessionIdPresent: true,
        toolCallIdPresent: true,
        questionType: 'STRING',
        optionCount: 1,
        unknownKeyCount: 0,
      },
    ])
    expect(events.find((event) => event.kind === 'tool_activity')).toMatchObject({
      protocolKind: 'other',
      nativeStatus: 'pending',
      nativeToolIdClass: 'USER_INPUT',
    })
    expect(JSON.stringify({ telemetry, events })).not.toContain('fixture-private-')
    expect(FakeWebSocket.sent.some((item) => item.method === '_kiro/userInput/respond')).toBe(false)
  })

  it('routes one explicit owned user-input answer through the installed response method', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'ownedUserInputAwait'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const onUserInputRequest = vi.fn(async (request) => {
      expect(request).toMatchObject({
        sessionId: 'session_synthetic_0001',
        toolCallId: 'user_input_2',
        question: 'fixture-private-question',
      })
      return { action: 'answered', answer: 'Continue' }
    })
    const telemetry = []
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onUserInputRequest,
      onProtocolTelemetry: (summary) => telemetry.push(summary),
    })
    await expect(session.prompt('Synthetic prompt')).resolves.toEqual({
      text: '',
      stopReason: 'end_turn',
    })
    expect(onUserInputRequest).toHaveBeenCalledOnce()
    expect(FakeWebSocket.sent.filter((item) => item.method === '_kiro/userInput/respond')).toEqual([
      expect.objectContaining({
        params: {
          toolCallId: 'user_input_2',
          action: 'answered',
          answer: 'Continue',
        },
      }),
    ])
    expect(telemetry.filter((item) => item.kind === 'USER_INPUT_ACKED')).toHaveLength(1)
  })

  it('fails closed when the user-input response is not acknowledged', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'ownedUserInputAwait'
    FakeWebSocket.userInputAck = false
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      onUserInputRequest: async () => ({ action: 'dismissed' }),
    })
    await expect(session.prompt('Synthetic prompt')).rejects.toMatchObject({
      code: expect.stringMatching(/^NATIVE_/),
    })
    expect(
      FakeWebSocket.sent.filter((item) => item.method === '_kiro/userInput/respond'),
    ).toHaveLength(1)
  })

  it.each(['ownedShellOutput', 'ownedShellOutputPadded'])(
    'preserves redacted shell output and exit status with %s',
    async (response) => {
      const root = workspace()
      FakeWebSocket.responses = response
      vi.stubGlobal('WebSocket', FakeWebSocket)
      const events = []
      const session = await openNativeRole(fakeVscode(root), {
        workspace: root,
        role,
        requireMcp: false,
        redactText: (value) => value.replaceAll('fixture-secret', '[REDACTED]'),
      })
      await session.prompt('Synthetic prompt', (event) => events.push(event))
      expect(events.find((event) => event.kind === 'tool_activity')).toMatchObject({
        protocolKind: 'execute',
        nativeStatus: 'completed',
        toolName: 'shell',
        shellExitCode: 0,
        output: 'token=[REDACTED]\n10 tests passed',
        rawOutputType: 'object',
      })
      expect(JSON.stringify(events)).not.toContain('fixture-secret')
      expect(JSON.stringify(events)).not.toContain('fixture-private-duplicate-message')
    },
  )

  it('reports Kiro and ACP output truncation without exposing offload paths', async () => {
    const root = workspace()
    FakeWebSocket.responses = 'ownedShellOutputTruncated'
    vi.stubGlobal('WebSocket', FakeWebSocket)
    const events = []
    const session = await openNativeRole(fakeVscode(root), {
      workspace: root,
      role,
      requireMcp: false,
      redactText: (value) => value,
    })
    await session.prompt('Synthetic prompt', (event) => events.push(event))
    expect(events.find((event) => event.kind === 'tool_activity')).toMatchObject({
      kiroOutputTransformation: 'OFFLOADED',
      acpTruncationMarkerPresent: true,
      shellExitCode: 0,
    })
    expect(JSON.stringify(events)).not.toContain('fixture-secret-path')
  })
})
