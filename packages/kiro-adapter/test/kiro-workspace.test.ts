import { conversationIdSchema, uiRequestSchema } from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import {
  KIRO_MCP_SERVER_NAME,
  kiroConversationId,
  mergeKiroMcpConfig,
  parseKiroHookInput,
  renderHelperSteering,
  renderKiroHooksConfig,
  renderLearnerSteering,
  translateKiroHook,
} from '../src/kiro-workspace-node.ts'

const binding = {
  projectId: 'project_00000000-0000-4000-8000-000000000001',
  taskId: 'task_00000000-0000-4000-8000-000000000002',
  correlationId: 'corr_00000000-0000-4000-8000-000000000003',
}
const hook = (input: Record<string, unknown>) =>
  parseKiroHookInput({ session_id: 'sess_abc', cwd: '/tmp/w', ...input })

describe('Kiro-native workspace adapter', () => {
  it('maps a Kiro session to a stable, schema-valid Core conversation ID', () => {
    const first = kiroConversationId('sess_c9b023e7-578f-46a6-8708-a4c8190fd613')
    expect(conversationIdSchema.safeParse(first).success).toBe(true)
    expect(kiroConversationId('sess_c9b023e7-578f-46a6-8708-a4c8190fd613')).toBe(first)
    expect(kiroConversationId('sess_other')).not.toBe(first)
  })

  it('records only learner prompts, verbatim and never truncated', () => {
    const translated = translateKiroHook(
      binding,
      hook({ hook_event_name: 'UserPromptSubmit', prompt: '  2번 24시간으로 할게  ' }),
      'idem_00000000-0000-4000-8000-000000000009',
    )
    expect(translated.kind).toBe('COMMAND')
    if (translated.kind !== 'COMMAND') return
    expect(uiRequestSchema.parse(translated.request)).toMatchObject({
      kind: 'UI_RECORD_CHAT_MESSAGE',
      projectId: binding.projectId,
      taskId: binding.taskId,
      conversationId: kiroConversationId('sess_abc'),
      message: '2번 24시간으로 할게',
    })
    for (const event of ['Stop', 'PostToolUse', 'PreTaskExec', 'PostTaskExec']) {
      expect(translateKiroHook(binding, hook({ hook_event_name: event, prompt: 'x' }))).toEqual({
        kind: 'IGNORED',
        reason: 'NOT_A_USER_PROMPT',
      })
    }
    expect(
      translateKiroHook(binding, hook({ hook_event_name: 'UserPromptSubmit', prompt: ' ' })),
    ).toEqual({
      kind: 'IGNORED',
      reason: 'EMPTY_PROMPT',
    })
    expect(
      translateKiroHook(
        binding,
        hook({ hook_event_name: 'UserPromptSubmit', prompt: 'a'.repeat(4_001) }),
      ),
    ).toEqual({ kind: 'IGNORED', reason: 'PROMPT_TOO_LONG' })
  })

  it('rejects hook input without the fields Vibe Helper relies on', () => {
    expect(() => parseKiroHookInput(null)).toThrow('KIRO_HOOK_INPUT_INVALID')
    expect(() => parseKiroHookInput({ hook_event_name: 'UserPromptSubmit', cwd: '/w' })).toThrow()
    expect(() =>
      parseKiroHookInput({
        hook_event_name: 'UserPromptSubmit',
        session_id: 's',
        cwd: '/w',
        prompt: 3,
      }),
    ).toThrow()
  })

  it('renders a non-blocking UserPromptSubmit hook with quoted paths', () => {
    expect(
      renderKiroHooksConfig({
        nodeExecutable: '/opt/node/bin/node',
        hookScript: '/Users/a b/vibe/kiro-hook.mjs',
        hookDescriptor: '/Users/a b/.data/kiro-hook.json',
      }),
    ).toEqual({
      version: 'v1',
      hooks: [
        {
          name: 'vibe-helper-learner-chat',
          trigger: 'UserPromptSubmit',
          action: {
            type: 'command',
            command:
              '"/opt/node/bin/node" "/Users/a b/vibe/kiro-hook.mjs" "/Users/a b/.data/kiro-hook.json"',
            timeout: 5,
          },
        },
      ],
    })
  })

  it('adds only the Vibe Helper MCP server and refuses to overwrite an unreadable config', () => {
    const merged = JSON.parse(
      mergeKiroMcpConfig(
        JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } }, other: true }),
        { command: 'node', args: ['bridge.mjs'] },
      ),
    )
    expect(merged).toEqual({
      other: true,
      mcpServers: {
        github: { command: 'gh-mcp' },
        [KIRO_MCP_SERVER_NAME]: { command: 'node', args: ['bridge.mjs'] },
      },
    })
    expect(JSON.parse(mergeKiroMcpConfig(null, { command: 'node' }))).toEqual({
      mcpServers: { [KIRO_MCP_SERVER_NAME]: { command: 'node' } },
    })
    expect(() => mergeKiroMcpConfig('{ broken', { command: 'node' })).toThrow()
    expect(() => mergeKiroMcpConfig('[]', { command: 'node' })).toThrow(
      'KIRO_MCP_CONFIG_NOT_OBJECT',
    )
  })

  it('binds the learner steering to one Core scope and keeps Helper mode manual', () => {
    const learner = renderLearnerSteering(binding)
    expect(learner.startsWith('---\ninclusion: always\n---')).toBe(true)
    for (const value of Object.values(binding)) expect(learner).toContain(value)
    expect(learner).toContain('resolve_decision_from_chat')
    expect(learner).toContain('#[[file:.vibe-helper/learner-profile.md]]')
    const helper = renderHelperSteering()
    expect(helper.startsWith('---\ninclusion: manual\n---')).toBe(true)
    expect(helper).toContain('Do not edit files')
  })
})
