import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { conversationIdSchema, idempotencyKeySchema, uiRequestSchema } from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import {
  applyKiroCommandApproval,
  helperExchangeRequest,
  interruptedKiroTurn,
  KIRO_HELPER_AGENT_NAME,
  KIRO_HELPER_MCP_SERVER_NAME,
  KIRO_MCP_SERVER_NAME,
  KIRO_PREAPPROVED_RULES,
  kiroConversationId,
  kiroPermissionsFile,
  kiroSessionAgentMode,
  kiroSessionTranscriptPath,
  kiroTurnIdempotencyKey,
  kiroWorkspaceHash,
  lastAssistantReply,
  mergeKiroMcpConfig,
  parseKiroHookInput,
  parseKiroSteeringTemplates,
  renderHelperSteering,
  renderKiroHelperAgent,
  renderKiroHooksConfig,
  renderKiroSessionActivity,
  renderKiroSpec,
  renderLearnerSteering,
  summarizeKiroSessionActivity,
  translateKiroHook,
} from '../src/kiro-workspace-node.ts'

const steeringDocument = readFileSync(
  new URL('../../../docs/agent-prompts/kiro-steering.md', import.meta.url),
  'utf8',
)
const templates = parseKiroSteeringTemplates(steeringDocument)

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

  it('hashes a workspace root the way Kiro names its per-workspace folders', () => {
    const sha = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16)
    expect(kiroWorkspaceHash('/Users/me/memo app', 'darwin')).toBe(sha('/Users/me/memo app'))
    expect(kiroWorkspaceHash('/Users/me/memo app/', 'darwin')).toBe(sha('/Users/me/memo app'))
    // Windows: forward slashes and lower case, whatever casing the folder URI or realpath has.
    for (const root of [
      'C:\\Users\\Me\\Memo App\\',
      'c:\\users\\me\\memo app',
      'C:/Users/Me/Memo App',
    ])
      expect(kiroWorkspaceHash(root, 'win32')).toBe(sha('c:/users/me/memo app'))
    expect(kiroWorkspaceHash('C:\\', 'win32')).toBe(sha('c:/'))
  })

  it('quotes hook paths for cmd.exe on Windows without doubling backslashes', () => {
    const config = renderKiroHooksConfig(
      {
        nodeExecutable: 'C:\\Users\\Me\\AppData\\Local\\node.exe',
        hookScript: 'C:\\Users\\Me\\.kiro\\extensions\\vibe\\kiro-hook.mjs',
        hookDescriptor: 'C:\\Users\\Me Kim\\AppData\\hook.json',
      },
      'win32',
    ) as { hooks: { action: { command: string } }[] }
    expect(config.hooks[0]?.action.command).toBe(
      '"C:\\Users\\Me\\AppData\\Local\\node.exe" "C:\\Users\\Me\\.kiro\\extensions\\vibe\\kiro-hook.mjs" "C:\\Users\\Me Kim\\AppData\\hook.json"',
    )
    // cmd.exe would expand %NAME% even inside quotes.
    expect(() =>
      renderKiroHooksConfig(
        {
          nodeExecutable: 'C:\\a\\node.exe',
          hookScript: 'C:\\%TEMP%\\h.mjs',
          hookDescriptor: 'C:\\h.json',
        },
        'win32',
      ),
    ).toThrow('KIRO_HOOK_PATH_UNSUPPORTED')
  })

  it('renders a non-blocking UserPromptSubmit hook with quoted paths', () => {
    expect(
      renderKiroHooksConfig(
        {
          nodeExecutable: '/opt/node/bin/node',
          hookScript: '/Users/a b/vibe/kiro-hook.mjs',
          hookDescriptor: '/Users/a b/.data/kiro-hook.json',
        },
        'darwin',
      ),
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

  it('names the Kiro chat tools without Core identifiers and keeps Helper mode manual', () => {
    const learner = renderLearnerSteering(templates, binding)
    expect(learner.startsWith('---\ninclusion: always\n---')).toBe(true)
    expect(learner).toContain(`steering ${templates.version}.`)
    // K10: the Builder MCP binding carries the scope; the Agent never copies IDs or keys.
    for (const value of Object.values(binding)) expect(learner).not.toContain(value)
    expect(learner).not.toMatch(/idempotencyKey|expectedTaskRevision|idem_/)
    for (const tool of [
      'check_progress',
      'save_progress',
      'ask_choice',
      'save_choice',
      'finish_task',
    ])
      expect(learner).toContain(`\`${tool}\``)
    expect(learner).not.toContain('resolve_decision_from_chat')
    expect(learner).toContain('#[[file:.vibe-helper/learner-profile.md]]')
    expect(learner).not.toContain('{{')
    expect(learner).not.toContain('What the learner owns')
    const scoped = renderLearnerSteering(templates, binding, {
      learnerFocus: [{ title: '만료되는 공유 링크와 접근 토큰', conceptNames: ['link expiry'] }],
      agentSupport: [{ title: '화면 꾸미기' }],
      expectedDecisions: [{ description: '공유 링크를 얼마 동안 열 수 있게 할지 정한다.' }],
    })
    expect(scoped).toContain(
      'Learner focus (ask real choices here):\n- 만료되는 공유 링크와 접근 토큰 (link expiry)',
    )
    expect(scoped).toContain('Agent support (decide here and state what you chose):\n- 화면 꾸미기')
    expect(scoped).toContain(
      'Expected decisions (ask each when the work reaches it):\n- 공유 링크를 얼마 동안 열 수 있게 할지 정한다.',
    )
    expect(scoped).toContain('making it a configurable option')
    expect(scoped).not.toContain('{{')
    const helper = renderHelperSteering(templates)
    expect(helper.startsWith('---\ninclusion: manual\n---')).toBe(true)
    expect(helper).toContain('Stay read-only in this turn')
    expect(helper).toContain('even if the learner asks')
  })

  it('steers decisions to the moment they arise, recorded before they are asked (since 0.5.0)', () => {
    expect(templates.version).toBe('0.9.2')
    const scoped = renderLearnerSteering(templates, binding, {
      learnerFocus: [],
      agentSupport: [],
      expectedDecisions: [{ description: '메모를 누가 볼 수 있게 할지 정한다.' }],
    })
    // Expected decisions are asked one at a time when the work reaches them, never up front.
    expect(scoped).toContain('Ask each one when the implementation reaches it')
    expect(scoped).toContain('Ask one decision at a time')
    expect(scoped).toContain('Do not ask them up front, together or in the Spec')
    expect(scoped).toContain('Never ask several choices together or at the start of a task')
    // Record first, then show; context right after start_task and before complete_task.
    expect(scoped.indexOf('Record it first')).toBeLessThan(
      scoped.indexOf('In chat, list the options'),
    )
    expect(scoped).toContain('Save your plan when you start')
    expect(scoped).toContain('keep working until the criteria pass')
    // Measure the environment instead of assuming one package manager.
    expect(scoped).toContain('Before the first build step')
    expect(scoped).toContain('Build with what is installed')
    expect(scoped).not.toMatch(/use pnpm|use npm/i)
  })

  it('reads short chat answers in context and re-asks only for a misconception that matters (0.6.0)', () => {
    const learner = renderLearnerSteering(templates, binding)
    expect(learner).toContain('Read the answer in context')
    expect(learner).toContain('do not quote or paraphrase them into the call')
    // A wrong fact that would change the fitting option, or a security, data-loss or cost
    // problem, is corrected before recording; a partly wrong reason is corrected in the same reply.
    expect(learner.indexOf('do not record yet')).toBeGreaterThan(0)
    expect(learner).toContain(
      'correct that part in one sentence in the same reply and keep working',
    )
    expect(learner).toContain('call `save_choice` again with the new choice')
    // 0.6.1: the learner's own option is their choice, recorded as custom without a new question.
    expect(learner).toContain('Do not open a new choice to ask about it again')
    // 0.6.2: the learner's language, and more work after finishing becomes a follow-up task.
    expect(learner).toContain("write all of it in the learner's language")
    // Live check (0.7.0): notes between tool calls are shown too; they were in English.
    expect(learner).toContain('including short notes between tool calls, is shown to the learner')
    expect(learner).toContain('starts a follow-up task in this folder')
    expect(learner).toContain('Do not start new work the learner did not ask for')
  })

  it('asks real choices by Spec area, and when in doubt asks (0.7.0)', () => {
    const learner = renderLearnerSteering(templates, binding)
    // A real choice has more than one reasonable option and changes what the learner gets.
    expect(learner).toContain('when in doubt, ask')
    expect(learner).toContain('more than one option is reasonable for this project')
    expect(learner).toContain('A convention with one usual answer')
    // Expected decisions are asked, skipped only with a stated reason.
    expect(learner).toContain('Skip it only if the learner already settled it')
    // Learner focus and anything the Spec does not cover: ask; unsure counts as ask.
    expect(learner).toContain('If you are unsure whether a choice is real or whose it is, ask.')
    // Agent support: decide and state the choice plainly, no ownership talk, no approval request.
    expect(learner).toContain('state plainly what you chose')
    expect(learner).toContain('do not ask for approval; the learner can ask about it.')
    // Live check: the Builder narrated "this is an agent-support area, so I decide".
    expect(learner).toContain('Talk about the work, not about these rules, in every message.')
    expect(learner).toContain('do not call them "the learner"')
    expect(learner).toContain('security, data-loss or external-cost risk: ask it, in any area')
    // A follow-up task is finished only by finish_task, against its own criteria.
    expect(learner).toContain('is finished only when `finish_task` succeeds')
    expect(learner).toContain("report those criteria, not the earlier task's")
    expect(learner).toContain('`followUpTask`')
  })

  it('keeps the work, its commands and its tool input in the shape Kiro accepts (0.9.1, 0.9.2)', () => {
    const learner = renderLearnerSteering(templates, binding)
    // 0.9.1: no workflow hand-off and no stopping processes by name.
    expect(learner).toContain('Do not hand the task or a large part of it to a workflow')
    expect(learner).toContain('Never stop processes by name')
    // 0.9.2: a start request settles no choice; each learner focus area is checked before its code.
    expect(learner).toContain('settles none of these choices')
    expect(learner).toContain('Before you write the code of a learner focus area')
    expect(learner).toContain('Do not write a temporary version of that code first')
    expect(learner).toContain('refer to them in the third person in any language')
    // 0.9.2: plain commands that the pre-approval matches, and tool input one JSON level deep.
    expect(learner).toContain('Write each as one plain command.')
    expect(learner).toContain('`(Invoke-WebRequest …).StatusCode`, waits for the learner')
    expect(learner).toContain('Do not say that it is yours to decide')
    expect(learner).toContain('`Invoke-WebRequest http://localhost:<port> -UseBasicParsing`')
    expect(learner).toContain('never as `\\u` escapes and never as JSON text inside a string')
  })

  it('fails closed on a missing, duplicated or unfilled steering template', () => {
    expect(() => parseKiroSteeringTemplates('# x\n')).toThrow('KIRO_STEERING_VERSION_MISSING')
    expect(() =>
      parseKiroSteeringTemplates(steeringDocument.replace('<!-- template: helper -->', '')),
    ).toThrow('KIRO_STEERING_TEMPLATE_INVALID helper')
    expect(() =>
      parseKiroSteeringTemplates(
        `${steeringDocument}\n<!-- template: learner -->\nx\n<!-- end template -->\n`,
      ),
    ).toThrow('KIRO_STEERING_TEMPLATE_INVALID learner')
    const broken = { ...templates, helper: 'Hi {{UNKNOWN_NAME}}' }
    expect(() => renderHelperSteering(broken)).toThrow(
      'KIRO_STEERING_PLACEHOLDER_UNFILLED UNKNOWN_NAME',
    )
  })

  it('renders a read-only Helper chat agent with only its own Helper-role Core server', () => {
    const agent = JSON.parse(
      renderKiroHelperAgent(templates, {
        helperPrompt: '# Helper canonical\n\n{{NOT_A_PLACEHOLDER}} stays literal.',
        nodeExecutable: '/opt/node',
        bridgeScript: '/x/bridge.mjs',
        helperDescriptor: '/private/helper-mcp.json',
        workspace: '/Users/me/memo app',
        binding,
      }),
    )
    expect(agent.name).toBe(KIRO_HELPER_AGENT_NAME)
    // Kiro 1.2.56 gives a custom agent no tools at all when `tools` is missing (live K09 check).
    expect(agent.tools).toEqual(['read', `@${KIRO_HELPER_MCP_SERVER_NAME}`])
    expect(agent.includeMcpJson).toBe(false)
    expect(Object.keys(agent.mcpServers)).toEqual([KIRO_HELPER_MCP_SERVER_NAME])
    expect(agent.mcpServers[KIRO_HELPER_MCP_SERVER_NAME].args).toEqual([
      '/x/bridge.mjs',
      '/private/helper-mcp.json',
      '/Users/me/memo app',
    ])
    expect(agent.prompt).toContain('`get_helper_context`')
    // The Helper Core server rejects a call whose taskId is missing (AGENT_RUN_SCOPE_MISMATCH).
    expect(agent.prompt).toContain(`taskId \`${binding.taskId}\``)
    expect(agent.prompt).toContain(`projectId \`${binding.projectId}\``)
    expect(agent.prompt).toContain(`correlationId \`${binding.correlationId}\``)
    expect(agent.prompt).toContain('You cannot edit files or run commands.')
    expect(agent.prompt).not.toContain('Where it says you are read-only')
    expect(agent.prompt).toContain('{{NOT_A_PLACEHOLDER}} stays literal.')
    expect(agent.prompt).not.toContain('{{HELPER')
    expect(JSON.stringify(agent)).not.toMatch(/Bearer|authorization/i)
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

  it('reads back the last turn the Stop hook did not capture (K17)', () => {
    const line = (payload: unknown) => JSON.stringify({ payload })
    const turn = (executionId: string, stopReason: string, said: string[], captured = false) => [
      line({ type: 'turn_start', executionId }),
      ...said.map((content) =>
        line({ type: 'assistant', operationType: 'Say', executionId, content }),
      ),
      line({ type: 'assistant', operationType: 'Reasoning', executionId, content: '...' }),
      ...(captured
        ? [line({ type: 'ContextualHookInvoked', name: 'vibe-helper-turn-end', executionId })]
        : []),
      line({ type: 'turn_end', stopReason, executionId }),
    ]
    const done = turn('e1', 'end_turn', ['끝난 답'], true)
    const cancelled = turn('e2', 'cancelled', ['ACK와 닮은 점은', 'user2번으로 가자'])
    const next = [
      line({ type: 'user', content: '왜 맘대로 선택함?' }),
      line({ type: 'turn_start', executionId: 'e3' }),
    ]
    expect(interruptedKiroTurn([...done, ...cancelled, ...next].join('\n'))).toEqual({
      executionId: 'e2',
      stopReason: 'cancelled',
      reply: 'ACK와 닮은 점은\nuser2번으로 가자',
    })
    // A line Kiro is still writing does not hide the finished turns.
    expect(
      interruptedKiroTurn([...cancelled, '{"payload":{"type":"us'].join('\n'))?.executionId,
    ).toBe('e2')
    expect(interruptedKiroTurn([...cancelled, ...done].join('\n'))).toBeNull()
    expect(interruptedKiroTurn(turn('e4', 'cancelled', ['x'], true).join('\n'))).toBeNull()
    expect(interruptedKiroTurn(turn('e5', 'cancelled', []).join('\n'))).toEqual({
      executionId: 'e5',
      stopReason: 'cancelled',
      reply: null,
    })
    expect(interruptedKiroTurn('')).toBeNull()
    const key = kiroTurnIdempotencyKey('bb7ea481-6149-4941-94f0-f92694eea937')
    expect(idempotencyKeySchema.safeParse(key).success).toBe(true)
    expect(kiroTurnIdempotencyKey('bb7ea481-6149-4941-94f0-f92694eea937')).toBe(key)
    expect(kiroTurnIdempotencyKey('other')).not.toBe(key)
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
      /^[\\/]Users[\\/]me[\\/]\.kiro[\\/]sessions[\\/][0-9a-f]{16}[\\/]sess_c9b023e7-578f-46a6-8708-a4c8190fd613[\\/]messages\.jsonl$/,
    )
    expect(() => kiroSessionTranscriptPath('/Users/me', '/w', '../../etc')).toThrow(
      'KIRO_SESSION_ID_INVALID',
    )
  })

  it('treats every prompt in a Helper agent tab as a Helper question, verbatim', () => {
    const translated = translateKiroHook(
      binding,
      hook({ hook_event_name: 'UserPromptSubmit', prompt: '  결정 1이 정확히 뭐야?  ' }),
      undefined,
      { helperSession: true },
    )
    expect(translated).toMatchObject({
      kind: 'HELPER_QUESTION',
      question: '결정 1이 정확히 뭐야?',
      conversationId: kiroConversationId('sess_abc'),
    })
    expect(
      translateKiroHook(
        binding,
        hook({ hook_event_name: 'UserPromptSubmit', prompt: '/vibe-helper 이거 뭐야' }),
        undefined,
        { helperSession: true },
      ),
    ).toMatchObject({ kind: 'HELPER_QUESTION', question: '이거 뭐야' })
    expect(kiroSessionAgentMode('{"agentMode":"vibe-helper"}')).toBe('vibe-helper')
    expect(kiroSessionAgentMode('{"agentMode":""}')).toBeNull()
    expect(kiroSessionAgentMode('not json')).toBeNull()
  })

  it('summarizes the Builder session, including a turn still running, for the Helper', () => {
    const line = (timestamp: string, payload: Record<string, unknown>) =>
      JSON.stringify({ id: 'x', timestamp, payload })
    const record = [
      line('2026-10-08T17:09:00Z', { type: 'user', content: '이전 요청' }),
      line('2026-10-08T17:09:01Z', { type: 'turn_start' }),
      line('2026-10-08T17:09:02Z', { type: 'assistant', operationType: 'Say', content: '이전 답' }),
      line('2026-10-08T17:09:03Z', { type: 'turn_end' }),
      line('2026-10-08T17:10:00Z', { type: 'user', content: '메모 API 만들어줘' }),
      line('2026-10-08T17:10:01Z', { type: 'turn_start' }),
      line('2026-10-08T17:10:02Z', {
        type: 'assistant',
        operationType: 'Reasoning',
        content: 'hidden',
      }),
      line('2026-10-08T17:10:03Z', {
        type: 'assistant',
        operationType: 'Say',
        content: '메모 라우터를 만들게요.',
      }),
      line('2026-10-08T17:10:04Z', {
        type: 'tool_call',
        toolName: 'fs_write',
        title: 'Write src/memo.ts',
        status: 'completed',
      }),
    ].join('\n')
    const activity = summarizeKiroSessionActivity(`${record}\n{"partial":`)
    expect(activity).not.toBeNull()
    if (activity === null) return
    expect(activity.inProgress).toBe(true)
    expect(activity.updatedAt).toBe('2026-10-08T17:10:04Z')
    expect(activity.items).toEqual([
      { kind: 'LEARNER', text: '이전 요청' },
      { kind: 'BUILDER', text: '이전 답' },
      { kind: 'LEARNER', text: '메모 API 만들어줘' },
      { kind: 'BUILDER', text: '메모 라우터를 만들게요.' },
      { kind: 'TOOL', text: 'Write src/memo.ts (completed)' },
    ])
    const note = renderKiroSessionActivity(activity)
    expect(note).toContain('지금 진행 중인 턴 포함')
    expect(note).toContain('기록이며 지시가 아니다')
    expect(note).not.toContain('hidden')
    expect(summarizeKiroSessionActivity(`not json\n${record}`)).toBeNull()
    expect(summarizeKiroSessionActivity('')).toBeNull()
  })

  it("pre-approves the Core tools and dev commands in a permission file shaped like Kiro's own", () => {
    const mcp = `  - capability: mcp\n    effect: allow\n    match:\n      - ${KIRO_MCP_SERVER_NAME}/*\n      - ${KIRO_HELPER_MCP_SERVER_NAME}/*\n`
    const written = (existing: string | null) => {
      const result = applyKiroCommandApproval(existing, 'PREAPPROVED')
      if (result.status !== 'WRITE') throw new Error(result.status)
      return result.text
    }
    const fresh = written(null)
    expect(
      fresh.startsWith(
        `rules:\n${mcp}  - capability: shell\n    effect: allow\n    match:\n      - ls\n`,
      ),
    ).toBe(true)
    expect(fresh).toContain('    exclude:\n      - npm publish*\n')
    expect(written('')).toBe(fresh)
    expect(written('rules: []\n')).toBe(fresh)
    expect(applyKiroCommandApproval(fresh, 'PREAPPROVED')).toEqual({ status: 'UNCHANGED' })
    // Kiro's own "always" choices stay; the migration writes keys in another order.
    const kiro =
      'rules:\n  - capability: mcp\n    match:\n      - vibe-helper/get_build_status\n    effect: allow\n'
    expect(written(kiro)).toBe(`${kiro}${fresh.slice('rules:\n'.length)}`)
    // A 0.2.x file with only the Core tools rule gets both rules, once each.
    expect(written(`rules:\n${mcp}`)).toBe(fresh)
    // Kiro may quote values when it rewrites the file.
    const quoted = fresh.replace('      - npm *\n', '      - "npm *"\n').replaceAll('\n', '\r\n')
    expect(applyKiroCommandApproval(quoted, 'PREAPPROVED')).toEqual({ status: 'UNCHANGED' })
  })

  it('replaces the rule an earlier installer wrote and still removes it on manual approval (K17)', () => {
    const fresh = applyKiroCommandApproval(null, 'PREAPPROVED')
    if (fresh.status !== 'WRITE') throw new Error(fresh.status)
    expect(fresh.text).toContain('      - open http://localhost:*\n')
    expect(fresh.text).toContain('      - Start-Process http://localhost:*\n')
    expect(fresh.text).toContain('      - open *@*\n')
    expect(fresh.text).toContain('      - curl -s -X POST http://localhost:*\n')
    expect(fresh.text).toContain('      - lsof *\n')
    // 0.2.7–0.2.8 wrote the same rule without the browser commands (nor the K20 quoted forms).
    const browser =
      /^ {6}- (open|Start-Process|start|lsof|curl(\.exe)? (-s )?(-X |["'])|Invoke-(WebRequest|RestMethod) -Uri )/
    const earlier = fresh.text
      .split('\n')
      .filter((line) => !browser.test(line))
      .join('\n')
    expect(earlier).not.toBe(fresh.text)
    expect(applyKiroCommandApproval(earlier, 'PREAPPROVED')).toEqual({
      status: 'WRITE',
      text: fresh.text,
    })
    expect(applyKiroCommandApproval(earlier, 'MANUAL')).toEqual({
      status: 'WRITE',
      text: 'rules: []\n',
    })
    // An "always allow" Kiro added inside the earlier rule stays.
    const merged = earlier.replace('      - git *\n', '      - git *\n      - rm -rf dist\n')
    const upgraded = applyKiroCommandApproval(merged, 'PREAPPROVED')
    if (upgraded.status !== 'WRITE') throw new Error(upgraded.status)
    expect(upgraded.text).toContain('      - rm -rf dist\n')
    expect(upgraded.text.match(/- npm \*\n/g)).toHaveLength(1)
    // Reconnecting without a new choice upgrades only a pre-approved folder.
    expect(applyKiroCommandApproval(earlier, 'UPGRADE')).toEqual({
      status: 'WRITE',
      text: fresh.text,
    })
    expect(applyKiroCommandApproval(fresh.text, 'UPGRADE')).toEqual({ status: 'UNCHANGED' })
    expect(applyKiroCommandApproval(null, 'UPGRADE')).toEqual({ status: 'UNCHANGED' })
    expect(applyKiroCommandApproval('rules: []\n', 'UPGRADE')).toEqual({ status: 'UNCHANGED' })
  })

  it('allows the quoted address forms and upgrades the 0.2.9–0.2.10 rule (K20)', () => {
    const fresh = applyKiroCommandApproval(null, 'PREAPPROVED')
    if (fresh.status !== 'WRITE') throw new Error(fresh.status)
    for (const entry of [
      'Start-Process "http://localhost:*"',
      "Start-Process 'http://127.0.0.1:*'",
      'open "http://localhost:*"',
      'curl -s "http://localhost:*',
      'curl.exe "http://127.0.0.1:*',
      'Invoke-WebRequest -Uri "http://localhost:*',
      'Invoke-WebRequest -Uri http://localhost:*',
      "Invoke-RestMethod -Uri 'http://127.0.0.1:*",
    ])
      expect(fresh.text).toContain(`      - ${entry}\n`)
    // Other hosts stay excluded in every form.
    for (const entry of ['open *@*', 'Start-Process *@*', 'curl *@*', 'Invoke-WebRequest *@*'])
      expect(fresh.text).toContain(`      - ${entry}\n`)
    // 0.2.9–0.2.10 wrote the rule without the quoted forms.
    const quoted =
      /^ {6}- ((open|Start-Process|start|curl(\.exe)?( -s)?) ["']|Invoke-(WebRequest|RestMethod) -Uri )/
    const earlier = fresh.text
      .split('\n')
      .filter((line) => !quoted.test(line))
      .join('\n')
    expect(earlier).toContain('      - Start-Process http://localhost:*\n')
    expect(earlier).not.toBe(fresh.text)
    for (const choice of ['PREAPPROVED', 'UPGRADE'] as const)
      expect(applyKiroCommandApproval(earlier, choice)).toEqual({
        status: 'WRITE',
        text: fresh.text,
      })
    expect(applyKiroCommandApproval(earlier, 'MANUAL')).toEqual({
      status: 'WRITE',
      text: 'rules: []\n',
    })
    // An "always allow" Kiro added inside the 0.2.9–0.2.10 rule outlives the upgrade.
    const merged = earlier.replace('      - lsof *\n', '      - lsof *\n      - rm -rf dist\n')
    const upgraded = applyKiroCommandApproval(merged, 'UPGRADE')
    if (upgraded.status !== 'WRITE') throw new Error(upgraded.status)
    expect(upgraded.text).toContain('      - rm -rf dist\n')
    expect(upgraded.text.match(/- lsof \*\n/g)).toHaveLength(1)
    expect(upgraded.text.match(/- Start-Process http:\/\/localhost:\*\n/g)).toHaveLength(1)
  })

  it("manual approval removes only the Vibe Helper entries and keeps the learner's own", () => {
    const fresh = applyKiroCommandApproval(null, 'PREAPPROVED')
    if (fresh.status !== 'WRITE') throw new Error(fresh.status)
    expect(applyKiroCommandApproval(fresh.text, 'MANUAL')).toEqual({
      status: 'WRITE',
      text: 'rules: []\n',
    })
    const other = '  - capability: shell\n    effect: deny\n    match:\n      - sudo *\n'
    expect(applyKiroCommandApproval(`${fresh.text}${other}`, 'MANUAL')).toEqual({
      status: 'WRITE',
      text: `rules:\n${other}`,
    })
    // An "always allow" Kiro added inside our shell rule outlives it.
    const merged = fresh.text.replace('      - git *\n', '      - git *\n      - rm -rf dist\n')
    const manual = applyKiroCommandApproval(merged, 'MANUAL')
    if (manual.status !== 'WRITE') throw new Error(manual.status)
    expect(manual.text).toContain(
      '    match:\n      - rm -rf dist\n    exclude:\n      - npm publish*',
    )
    expect(manual.text).not.toContain('- npm *\n')
    expect(manual.text).not.toContain(`- ${KIRO_MCP_SERVER_NAME}/*`)
    expect(applyKiroCommandApproval(manual.text, 'MANUAL')).toEqual({ status: 'UNCHANGED' })
    // A learner rule that happens to share one entry is not ours.
    const own = 'rules:\n  - capability: shell\n    effect: allow\n    match:\n      - npm *\n'
    expect(applyKiroCommandApproval(own, 'MANUAL')).toEqual({ status: 'UNCHANGED' })
    expect(applyKiroCommandApproval(null, 'MANUAL')).toEqual({ status: 'UNCHANGED' })
  })

  it('leaves permission files it does not recognise alone', () => {
    for (const text of [
      'rules:\n  - capability: shell\npolicy: strict\n',
      '{"rules":[]}',
      'rules:\n  - capability: shell\n    effect: allow\n    match: ["npm *"]\n',
      'rules:\n  - capability: shell\n    effect: allow\n    match:\n      nested: true\n',
      'rules:\n- capability: shell\n',
      'rules: []\n  - capability: shell\n',
    ])
      for (const approval of ['PREAPPROVED', 'MANUAL'] as const)
        expect(applyKiroCommandApproval(text, approval)).toEqual({ status: 'UNRECOGNIZED' })
    expect(kiroPermissionsFile('/Users/me', '/Users/me/memo')).toMatch(
      /^[\\/]Users[\\/]me[\\/]\.kiro[\\/]workspace-roots[\\/][0-9a-f]{16}[\\/]permissions\.yaml$/,
    )
  })

  it('keeps every pre-approved pattern a plain YAML string and the risky commands out', () => {
    const shell = KIRO_PREAPPROVED_RULES.find((rule) => rule.capability === 'shell')
    for (const rule of KIRO_PREAPPROVED_RULES) {
      const values = [...rule.match, ...rule.exclude]
      expect(new Set(values).size).toBe(values.length)
      for (const value of values) expect(value).not.toMatch(/^[-?:,[\]{}#&*!|>'"%@`\s]|: | #|\s$/)
    }
    for (const risky of ['rm', 'sudo', 'kill', 'pkill', 'chmod', 'bash', 'sh', 'eval', 'xargs'])
      expect(shell?.match.some((value) => value.split(' ')[0] === risky)).toBe(false)
    expect(shell?.exclude).toEqual(expect.arrayContaining(['npm publish*', 'git push*']))
  })
})
