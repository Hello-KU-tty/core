import { conversationIdSchema, uiRequestSchema } from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import {
  helperExchangeRequest,
  KIRO_MCP_SERVER_NAME,
  kiroConversationId,
  kiroSessionTranscriptPath,
  lastAssistantReply,
  mergeKiroMcpConfig,
  parseKiroHookInput,
  renderHelperSteering,
  renderKiroHooksConfig,
  renderKiroSpec,
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
    for (const event of ['PostToolUse', 'PreTaskExec', 'PostTaskExec']) {
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
        {
          name: 'vibe-helper-turn-end',
          trigger: 'Stop',
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

  it('copies a confirmed Learning Spec and Task into a Kiro Spec without rewriting them', () => {
    const source = {
      project: { id: binding.projectId, title: 'Campus Drop', learningGoal: '만료되는 공유 흐름' },
      learningSpec: {
        productPurpose: '공용 PC와 개인 기기 사이에서 파일을 주고받는다.',
        targetUsers: ['공용 PC를 쓰는 대학생'],
        primaryUsageMoment: '과제 파일을 옮길 때',
        successMoment: '시간이 지나면 링크가 막힌다.',
        mvpFeatures: ['파일 업로드', '만료되는 공유 링크'],
        scope: [
          {
            category: 'LEARNER_FOCUS' as const,
            title: '만료 링크',
            rationale: '핵심 판단이다.',
            conceptNames: ['link expiry'],
          },
          {
            category: 'EXCLUDED' as const,
            title: '로그인',
            rationale: '범위 밖.',
            conceptNames: [],
          },
        ],
        expectedDecisions: [
          {
            category: 'PRODUCT_BEHAVIOR' as const,
            description: '링크를 얼마 동안 열지 정한다.',
            whyUserInputMatters: '보안과 편의가 바뀐다.',
          },
        ],
        deploymentConstraints: ['로컬 실행'],
      },
      task: {
        title: '만료되는 공유 링크 만들기',
        productGoal: '파일마다 만료되는 링크를 만든다.',
        requirements: ['링크마다 만료 시각을 둔다.', '만료된 링크는 거절한다.'],
        acceptanceCriteria: [
          { key: 'expiring_link', description: '만료 시각이 지난 링크는 거절된다.' },
        ],
        excludedWork: ['로그인'],
      },
    }
    const spec = renderKiroSpec(source)
    expect(spec.directory).toBe('.kiro/specs/campus-drop')
    const requirements = spec.files['requirements.md']
    expect(requirements).toContain('### 학습자가 이해하고 판단할 부분')
    expect(requirements).toContain('- 만료 링크: 핵심 판단이다. (개념: link expiry)')
    expect(requirements).toContain('### 이번 MVP에서 하지 않는 부분')
    expect(requirements).not.toContain('Agent가 주로 구현할 부분')
    expect(requirements).toContain('- 링크를 얼마 동안 열지 정한다. 보안과 편의가 바뀐다.')
    expect(requirements).toContain('1. THE system SHALL satisfy: 만료 시각이 지난 링크는 거절된다.')
    expect(spec.files['tasks.md']).toContain('- [ ] 2. 만료된 링크는 거절한다.')
    expect(spec.files['design.md']).toContain('- 하지 않음: 로그인')
    expect(
      renderKiroSpec({ ...source, project: { ...source.project, title: '캠퍼스 드롭' } }).directory,
    ).toBe('.kiro/specs/vibe-helper-000000000001')
  })

  it('keeps a /vibe-helper prompt out of general chat and pairs it with the turn reply', () => {
    const question = translateKiroHook(
      binding,
      hook({ hook_event_name: 'UserPromptSubmit', prompt: '/vibe-helper reduce가 뭐야?' }),
    )
    expect(question).toEqual({
      kind: 'HELPER_QUESTION',
      sessionId: 'sess_abc',
      conversationId: kiroConversationId('sess_abc'),
      question: 'reduce가 뭐야?',
    })
    expect(
      translateKiroHook(
        binding,
        hook({ hook_event_name: 'UserPromptSubmit', prompt: '/vibe-helperx 질문' }),
      ).kind,
    ).toBe('COMMAND')
    expect(
      translateKiroHook(
        binding,
        hook({ hook_event_name: 'Stop', vibe_helper_reply: '  누적이야 ' }),
      ),
    ).toEqual({
      kind: 'TURN_ENDED',
      sessionId: 'sess_abc',
      reply: '누적이야',
    })
    const exchange = uiRequestSchema.parse(
      helperExchangeRequest(
        binding,
        { conversationId: kiroConversationId('sess_abc'), question: 'reduce가 뭐야?' },
        'x'.repeat(500),
      ),
    )
    expect(exchange).toMatchObject({
      kind: 'UI_RECORD_HELPER_EXCHANGE',
      userMessage: 'reduce가 뭐야?',
      origin: 'FREE_TEXT',
      closeConversation: false,
    })
    if (exchange.kind !== 'UI_RECORD_HELPER_EXCHANGE') return
    expect(exchange.helperResponseSummary).toHaveLength(240)
  })

  it('reads the reply after the last user message from a Kiro session record', () => {
    const record = [
      { payload: { type: 'user', content: '첫 질문' } },
      { payload: { type: 'assistant', operationType: 'Say', content: '첫 답' } },
      { payload: { type: 'user', content: '/vibe-helper 둘째 질문' } },
      { payload: { type: 'assistant', operationType: 'Reasoning', content: '...' } },
      { payload: { type: 'assistant', operationType: 'Say', content: '둘째 답 1' } },
      { payload: { type: 'tool_call', toolName: 'read_file' } },
      { payload: { type: 'assistant', operationType: 'Say', content: '둘째 답 2' } },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n')
    expect(lastAssistantReply(record)).toBe('둘째 답 1\n둘째 답 2')
    expect(lastAssistantReply('')).toBeNull()
    expect(
      kiroSessionTranscriptPath('/Users/me', '/w', 'sess_c9b023e7-578f-46a6-8708-a4c8190fd613'),
    ).toMatch(
      /^\/Users\/me\/\.kiro\/sessions\/[0-9a-f]{16}\/sess_c9b023e7-578f-46a6-8708-a4c8190fd613\/messages\.jsonl$/,
    )
    expect(() => kiroSessionTranscriptPath('/Users/me', '/w', '../../etc')).toThrow(
      'KIRO_SESSION_ID_INVALID',
    )
  })
})
