import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'

import type { BuilderTask, LearningSpecRevision, Project, UiRequest } from '@vibe-helper/contracts'

/** Kiro-native intervention files are versioned so an installer can recognise its own output. */
export const KIRO_NATIVE_STEERING_VERSION = '0.4.0'
export const KIRO_MCP_SERVER_NAME = 'vibe-helper'
export const KIRO_HOOK_FILE = '.kiro/hooks/vibe-helper.json'
export const KIRO_LEARNER_STEERING_FILE = '.kiro/steering/vibe-helper-learner.md'
export const KIRO_HELPER_STEERING_FILE = '.kiro/steering/vibe-helper.md'
export const KIRO_MCP_CONFIG_FILE = '.kiro/settings/mcp.json'
export const LEARNER_PROFILE_FILE = '.vibe-helper/learner-profile.md'

const MAX_CHAT_MESSAGE_CHARS = 4_000

/** The JSON Kiro writes to a command hook's stdin (Kiro IDE 1.2.4, hooks v1 files). */
export interface KiroHookInput {
  readonly hook_event_name: string
  readonly session_id: string
  readonly cwd: string
  readonly prompt?: string
  /** Added by the Vibe Helper hook runner on Stop: the Agent's reply for the finished turn. */
  readonly vibe_helper_reply?: string
}

/** Validates the fields Vibe Helper reads; other Kiro fields are ignored. */
export function parseKiroHookInput(value: unknown): KiroHookInput {
  if (typeof value !== 'object' || value === null) throw new TypeError('KIRO_HOOK_INPUT_INVALID')
  const record = value as Record<string, unknown>
  const text = (key: string, max: number): string => {
    const field = record[key]
    if (typeof field !== 'string' || field.length === 0 || field.length > max) {
      throw new TypeError('KIRO_HOOK_INPUT_INVALID')
    }
    return field
  }
  const prompt = record.prompt
  const reply = record.vibe_helper_reply
  if (
    (prompt !== undefined && typeof prompt !== 'string') ||
    (reply !== undefined && typeof reply !== 'string')
  ) {
    throw new TypeError('KIRO_HOOK_INPUT_INVALID')
  }
  return {
    hook_event_name: text('hook_event_name', 64),
    session_id: text('session_id', 200),
    cwd: text('cwd', 4_096),
    ...(prompt === undefined ? {} : { prompt }),
    ...(reply === undefined ? {} : { vibe_helper_reply: reply }),
  }
}

export interface KiroCoreBinding {
  readonly projectId: string
  readonly taskId: string
  readonly correlationId: string
}

/** Maps a Kiro chat session to a stable Core conversation ID without storing a lookup table. */
export function kiroConversationId(sessionId: string): string {
  const hex = createHash('sha256').update(`kiro-session:${sessionId}`).digest('hex')
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16)
  return `conversation_${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export const HELPER_SLASH_COMMAND = '/vibe-helper'
const MAX_HELPER_SUMMARY_CHARS = 240

export type KiroHookTranslation =
  | {
      readonly kind: 'COMMAND'
      readonly request: Extract<UiRequest, { kind: 'UI_RECORD_CHAT_MESSAGE' }>
    }
  | {
      readonly kind: 'HELPER_QUESTION'
      readonly sessionId: string
      readonly conversationId: string
      readonly question: string
    }
  | { readonly kind: 'TURN_ENDED'; readonly sessionId: string; readonly reply: string | null }
  | {
      readonly kind: 'IGNORED'
      readonly reason: 'NOT_A_USER_PROMPT' | 'EMPTY_PROMPT' | 'PROMPT_TOO_LONG'
    }

/**
 * Turns one Kiro hook event into Core work. Only UserPromptSubmit carries learner-authored
 * text: Kiro does not fire it for Spec task runs or Stop-hook continuations (K01 spike).
 * A `/vibe-helper` prompt is a Helper question, recorded with the reply when the turn stops.
 */
export function translateKiroHook(
  binding: KiroCoreBinding,
  input: KiroHookInput,
  idempotencyKey: string = `idem_${randomUUID()}`,
): KiroHookTranslation {
  if (input.hook_event_name === 'Stop') {
    const reply = input.vibe_helper_reply?.trim()
    return { kind: 'TURN_ENDED', sessionId: input.session_id, reply: reply ? reply : null }
  }
  if (input.hook_event_name !== 'UserPromptSubmit') {
    return { kind: 'IGNORED', reason: 'NOT_A_USER_PROMPT' }
  }
  const message = (input.prompt ?? '').trim()
  if (message.length === 0) return { kind: 'IGNORED', reason: 'EMPTY_PROMPT' }
  // Long pastes are not truncated: a shortened learner message would misquote them.
  if (message.length > MAX_CHAT_MESSAGE_CHARS) return { kind: 'IGNORED', reason: 'PROMPT_TOO_LONG' }
  if (message === HELPER_SLASH_COMMAND || message.startsWith(`${HELPER_SLASH_COMMAND} `)) {
    const question = message.slice(HELPER_SLASH_COMMAND.length).trim()
    if (question.length === 0) return { kind: 'IGNORED', reason: 'EMPTY_PROMPT' }
    return {
      kind: 'HELPER_QUESTION',
      sessionId: input.session_id,
      conversationId: kiroConversationId(input.session_id),
      question,
    }
  }
  return {
    kind: 'COMMAND',
    request: {
      schemaVersion: 1,
      kind: 'UI_RECORD_CHAT_MESSAGE',
      correlationId: binding.correlationId,
      actor: { kind: 'UI' },
      idempotencyKey,
      projectId: binding.projectId,
      taskId: binding.taskId,
      conversationId: kiroConversationId(input.session_id),
      message,
    },
  }
}

/** Builds the Helper exchange for a `/vibe-helper` question once its turn has stopped. */
export function helperExchangeRequest(
  binding: KiroCoreBinding,
  pending: { readonly conversationId: string; readonly question: string },
  reply: string | null,
  idempotencyKey: string = `idem_${randomUUID()}`,
): Extract<UiRequest, { kind: 'UI_RECORD_HELPER_EXCHANGE' }> {
  const text = (reply ?? '').replace(/\s+/g, ' ').trim()
  const summary =
    text.length === 0
      ? 'Helper reply was not available from the Kiro session record.'
      : text.length <= MAX_HELPER_SUMMARY_CHARS
        ? text
        : `${text.slice(0, MAX_HELPER_SUMMARY_CHARS - 1)}…`
  return {
    schemaVersion: 1,
    kind: 'UI_RECORD_HELPER_EXCHANGE',
    correlationId: binding.correlationId,
    actor: { kind: 'UI' },
    idempotencyKey,
    projectId: binding.projectId,
    taskId: binding.taskId,
    conversationId: pending.conversationId,
    userMessage: pending.question,
    helperResponseSummary: summary,
    origin: 'FREE_TEXT',
    closeConversation: false,
  }
}

/** Kiro IDE 1.2.4 session record location (private format; verified in the K01 spike). */
export function kiroSessionTranscriptPath(
  homeDirectory: string,
  workspaceRoot: string,
  sessionId: string,
): string {
  if (!/^sess_[0-9a-f-]{36}$/.test(sessionId)) throw new TypeError('KIRO_SESSION_ID_INVALID')
  const workspaceHash = createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 16)
  return join(homeDirectory, '.kiro', 'sessions', workspaceHash, sessionId, 'messages.jsonl')
}

/** The Agent's spoken reply after the last user message in a Kiro session record. */
export function lastAssistantReply(messagesJsonl: string): string | null {
  const payloads: Array<Record<string, unknown>> = []
  for (const line of messagesJsonl.split('\n')) {
    if (line.trim().length === 0) continue
    try {
      const record = JSON.parse(line) as { payload?: unknown }
      if (typeof record.payload === 'object' && record.payload !== null)
        payloads.push(record.payload as Record<string, unknown>)
    } catch {
      return null
    }
  }
  let lastUser = -1
  payloads.forEach((payload, index) => {
    if (payload.type === 'user') lastUser = index
  })
  if (lastUser < 0) return null
  const said = payloads
    .slice(lastUser + 1)
    .filter(
      (payload) =>
        payload.type === 'assistant' &&
        payload.operationType === 'Say' &&
        typeof payload.content === 'string',
    )
    .map((payload) => payload.content as string)
  return said.length === 0 ? null : said.join('\n')
}

export interface KiroCommandPaths {
  readonly nodeExecutable: string
  readonly hookScript: string
  readonly hookDescriptor: string
}

function shellArgument(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

/** Kiro hooks v1 file. Hooks only report to Core; they never block or rewrite the learner prompt. */
export function renderKiroHooksConfig(paths: KiroCommandPaths): unknown {
  const command = `${shellArgument(paths.nodeExecutable)} ${shellArgument(paths.hookScript)} ${shellArgument(paths.hookDescriptor)}`
  return {
    version: 'v1',
    hooks: [
      {
        name: 'vibe-helper-learner-chat',
        trigger: 'UserPromptSubmit',
        action: { type: 'command', command, timeout: 5 },
      },
      {
        name: 'vibe-helper-turn-end',
        trigger: 'Stop',
        action: { type: 'command', command, timeout: 5 },
      },
    ],
  }
}

export function renderKiroMcpServerEntry(options: {
  readonly nodeExecutable: string
  readonly bridgeScript: string
  readonly bindingDescriptor: string
  readonly workspace: string
}): Record<string, unknown> {
  return {
    command: options.nodeExecutable,
    args: [options.bridgeScript, options.bindingDescriptor, options.workspace],
    disabled: false,
  }
}

/** Adds or replaces only the Vibe Helper server; other MCP servers stay untouched. */
export function mergeKiroMcpConfig(
  existing: string | null,
  entry: Record<string, unknown>,
): string {
  const parsed: unknown = existing === null || existing.trim() === '' ? {} : JSON.parse(existing)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('KIRO_MCP_CONFIG_NOT_OBJECT')
  }
  const servers = (parsed as { mcpServers?: unknown }).mcpServers ?? {}
  if (typeof servers !== 'object' || servers === null || Array.isArray(servers)) {
    throw new TypeError('KIRO_MCP_SERVERS_NOT_OBJECT')
  }
  return `${JSON.stringify(
    { ...parsed, mcpServers: { ...servers, [KIRO_MCP_SERVER_NAME]: entry } },
    null,
    2,
  )}\n`
}

const steeringHeader = (inclusion: 'always' | 'manual') =>
  `---\ninclusion: ${inclusion}\n---\n\n<!-- vibe-helper kiro-native steering ${KIRO_NATIVE_STEERING_VERSION}. Managed by Vibe Helper; local edits are replaced. -->\n`

/** What the confirmed Learning Spec says the learner owns; copied, not reworded. */
export interface KiroLearnerScope {
  readonly learnerFocus: readonly {
    readonly title: string
    readonly conceptNames: readonly string[]
  }[]
  readonly expectedDecisions: readonly { readonly description: string }[]
}

function renderScope(scope: KiroLearnerScope | undefined): string {
  if (
    scope === undefined ||
    (scope.learnerFocus.length === 0 && scope.expectedDecisions.length === 0)
  )
    return ''
  const one = (value: string) => value.replace(/\s+/g, ' ').trim()
  const focus = scope.learnerFocus.map(
    (item) =>
      `- ${one(item.title)}${item.conceptNames.length > 0 ? ` (${item.conceptNames.map(one).join(', ')})` : ''}`,
  )
  const decisions = scope.expectedDecisions.map((item) => `- ${one(item.description)}`)
  return `
## What the learner owns in this project

From the confirmed Learning Spec. Choices inside these areas are the learner's real decisions: ask with \`request_user_decision\` before implementing them. Do not sidestep one by choosing a default yourself and making it a configurable option.

${focus.length > 0 ? `Learner focus:\n${focus.join('\n')}\n` : ''}${decisions.length > 0 ? `\nDecisions expected:\n${decisions.join('\n')}\n` : ''}`
}

/** Always-included steering: Core binding, the real-Decision protocol and the learner profile. */
export function renderLearnerSteering(binding: KiroCoreBinding, scope?: KiroLearnerScope): string {
  return `${steeringHeader('always')}
# Vibe Helper: building with a learner

You are building this project together with a coding learner. Keep the product moving; do not turn the chat into a lesson or a quiz.

## Vibe Helper Core binding

Call the \`${KIRO_MCP_SERVER_NAME}\` MCP tools with exactly these values:

- projectId: \`${binding.projectId}\`
- taskId: \`${binding.taskId}\`
- correlationId: \`${binding.correlationId}\`

Use \`get_build_status\` for the current \`expectedTaskRevision\` (task revision), \`expectedContextVersion\` (context version) and the Decisions still waiting, with their option numbers. Call \`get_builder_task\` only when you need the full Learning Spec. The task is already started; call \`start_task\` only if its status is PENDING.

Every write call needs a new \`idempotencyKey\`: \`idem_\` followed by a lowercase UUID v4 that you write yourself, shaped \`xxxxxxxx-xxxx-4xxx-Yxxx-xxxxxxxxxxxx\` where x is 0-9 or a-f and Y is 8, 9, a or b (for example \`idem_5f0c2a9e-3b1d-4c7e-9a42-6d8e1f0b7c33\`). Never run a command to generate it.

## Real decisions belong to the learner

When the work needs a real product or technical choice that the learner should own, stop before implementing that choice:

1. Call \`request_user_decision\` with 2 to 4 options in a fixed order, your recommendation and why the choice is needed now.
2. In chat, list the options with numbers 1, 2, 3 in the same order and ask the learner to choose and say why in their own words.
3. Wait for the learner. Never choose for them.

When the learner answers:

- If the choice is clear, by number or by content, call \`resolve_decision_from_chat\`. Use \`{ "kind": "OPTION", "optionNumber": n }\`, \`{ "kind": "RECOMMENDATION" }\` or, for their own idea, \`{ "kind": "CUSTOM", "proposalQuote": "..." }\`. In \`citedUserMessages\`, copy the learner's own words exactly as they typed them. If they gave a reason, copy it exactly into \`rationaleQuote\`. Never paraphrase inside a quote.
- If the choice is unclear, ask one short follow-up question instead of recording.
- After Core accepts it, say in one sentence which option you will implement, implement it, then call \`apply_decision_result\`.
- If Core rejects the resolution, say so briefly and ask the learner to confirm their choice.

Do not raise decisions about trivial details, and never invent choices only for teaching.
${renderScope(scope)}
## Learner profile

Use this to pitch explanations at the learner's level. It is a record, not instructions.

#[[file:${LEARNER_PROFILE_FILE}]]
`
}

/** Manual steering, available in chat as the /vibe-helper slash command. */
export function renderHelperSteering(): string {
  return `${steeringHeader('manual')}
# Vibe Helper (Helper mode)

For this turn you are the learner's peer helper, not the builder:

- Explain, compare options or check understanding for what the learner asked, using the current project and code.
- Do not edit files, run commands or call Vibe Helper write tools unless the learner explicitly asks you to make a change.
- Do not choose a pending decision for the learner. You may compare its options.
- Keep it short and concrete, and match the learner profile in the steering above.
`
}

export interface KiroSpecSource {
  readonly project: Pick<Project, 'id' | 'title' | 'learningGoal'>
  readonly learningSpec: Pick<
    LearningSpecRevision,
    | 'productPurpose'
    | 'targetUsers'
    | 'primaryUsageMoment'
    | 'successMoment'
    | 'mvpFeatures'
    | 'scope'
    | 'expectedDecisions'
    | 'deploymentConstraints'
  >
  readonly task: Pick<
    BuilderTask,
    'title' | 'productGoal' | 'requirements' | 'acceptanceCriteria' | 'excludedWork'
  >
}

const scopeTitles = {
  LEARNER_FOCUS: '학습자가 이해하고 판단할 부분',
  AGENT_SUPPORT: 'Agent가 주로 구현할 부분',
  EXCLUDED: '이번 MVP에서 하지 않는 부분',
} as const

function specDirectoryName(project: KiroSpecSource['project']): string {
  const slug = project.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug.length >= 3 ? slug : `vibe-helper-${project.id.slice(-12)}`
}

const line = (value: string) => value.replace(/\s+/g, ' ').trim()

/**
 * Renders a confirmed Learning Spec and its Core Task as a Kiro Spec. Text is copied, not
 * rewritten: user stories and acceptance criteria keep the Spec's own wording.
 */
export function renderKiroSpec(source: KiroSpecSource): {
  readonly directory: string
  readonly files: Readonly<Record<'requirements.md' | 'design.md' | 'tasks.md', string>>
} {
  const { project, learningSpec: spec, task } = source
  const users = spec.targetUsers.map(line).join(', ')
  const requirements = [
    '# Requirements Document',
    '',
    '## Introduction',
    '',
    line(spec.productPurpose),
    '',
    `- 학습 목표: ${line(project.learningGoal)}`,
    `- 주로 쓰는 순간: ${line(spec.primaryUsageMoment)}`,
    `- 성공 순간: ${line(spec.successMoment)}`,
    '',
    '## 학습 범위 (Vibe Helper)',
    '',
    ...(['LEARNER_FOCUS', 'AGENT_SUPPORT', 'EXCLUDED'] as const).flatMap((category) => {
      const items = spec.scope.filter((item) => item.category === category)
      if (items.length === 0) return []
      return [
        `### ${scopeTitles[category]}`,
        '',
        ...items.map(
          (item) =>
            `- ${line(item.title)}: ${line(item.rationale)}${item.conceptNames.length > 0 ? ` (개념: ${item.conceptNames.map(line).join(', ')})` : ''}`,
        ),
        '',
      ]
    }),
    ...(spec.expectedDecisions.length === 0
      ? []
      : [
          '### 학습자에게 물을 실제 결정',
          '',
          ...spec.expectedDecisions.map(
            (decision) => `- ${line(decision.description)} ${line(decision.whyUserInputMatters)}`,
          ),
          '',
        ]),
    '## Requirements',
    '',
    ...spec.mvpFeatures.flatMap((feature, index) => [
      `### Requirement ${index + 1}`,
      '',
      `**User Story:** As ${users}, I want ${line(feature)}, so that ${line(spec.productPurpose)}`,
      '',
    ]),
    `### Requirement ${spec.mvpFeatures.length + 1}: ${line(task.title)}`,
    '',
    `**User Story:** As ${users}, I want ${line(task.productGoal)}`,
    '',
    '#### Acceptance Criteria',
    '',
    ...task.acceptanceCriteria.map(
      (criterion, index) =>
        `${index + 1}. THE system SHALL satisfy: ${line(criterion.description)}`,
    ),
    '',
  ].join('\n')

  const design = [
    '# Design Document',
    '',
    '## Overview',
    '',
    line(task.productGoal),
    '',
    '## Constraints',
    '',
    ...spec.deploymentConstraints.map((constraint) => `- ${line(constraint)}`),
    ...task.excludedWork.map((work) => `- 하지 않음: ${line(work)}`),
    '',
    '## Learner decisions',
    '',
    '학습 범위에 속한 실제 결정은 구현 전에 Vibe Helper Decision으로 학습자에게 묻는다.',
    '',
  ].join('\n')

  const tasks = [
    '# Implementation Plan',
    '',
    ...task.requirements.map(
      (requirement, index) =>
        `- [ ] ${index + 1}. ${line(requirement)}\n  - _Requirements: ${spec.mvpFeatures.length + 1}_`,
    ),
    '',
  ].join('\n')

  return {
    directory: `.kiro/specs/${specDirectoryName(project)}`,
    files: { 'requirements.md': requirements, 'design.md': design, 'tasks.md': tasks },
  }
}
