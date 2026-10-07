import { createHash, randomUUID } from 'node:crypto'

import type { UiRequest } from '@vibe-helper/contracts'

/** Kiro-native intervention files are versioned so an installer can recognise its own output. */
export const KIRO_NATIVE_STEERING_VERSION = '0.2.0'
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
  if (prompt !== undefined && typeof prompt !== 'string') {
    throw new TypeError('KIRO_HOOK_INPUT_INVALID')
  }
  return {
    hook_event_name: text('hook_event_name', 64),
    session_id: text('session_id', 200),
    cwd: text('cwd', 4_096),
    ...(prompt === undefined ? {} : { prompt }),
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

export type KiroHookTranslation =
  | {
      readonly kind: 'COMMAND'
      readonly request: Extract<UiRequest, { kind: 'UI_RECORD_CHAT_MESSAGE' }>
    }
  | {
      readonly kind: 'IGNORED'
      readonly reason: 'NOT_A_USER_PROMPT' | 'EMPTY_PROMPT' | 'PROMPT_TOO_LONG'
    }

/**
 * Turns one Kiro hook event into a Core command. Only UserPromptSubmit carries learner-authored
 * text: Kiro does not fire it for Spec task runs or Stop-hook continuations (K01 spike).
 */
export function translateKiroHook(
  binding: KiroCoreBinding,
  input: KiroHookInput,
  idempotencyKey: string = `idem_${randomUUID()}`,
): KiroHookTranslation {
  if (input.hook_event_name !== 'UserPromptSubmit') {
    return { kind: 'IGNORED', reason: 'NOT_A_USER_PROMPT' }
  }
  const message = (input.prompt ?? '').trim()
  if (message.length === 0) return { kind: 'IGNORED', reason: 'EMPTY_PROMPT' }
  // Long pastes are not truncated: a shortened learner message would misquote them.
  if (message.length > MAX_CHAT_MESSAGE_CHARS) return { kind: 'IGNORED', reason: 'PROMPT_TOO_LONG' }
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

/** Always-included steering: Core binding, the real-Decision protocol and the learner profile. */
export function renderLearnerSteering(binding: KiroCoreBinding): string {
  return `${steeringHeader('always')}
# Vibe Helper: building with a learner

You are building this project together with a coding learner. Keep the product moving; do not turn the chat into a lesson or a quiz.

## Vibe Helper Core binding

Call the \`${KIRO_MCP_SERVER_NAME}\` MCP tools with exactly these values:

- projectId: \`${binding.projectId}\`
- taskId: \`${binding.taskId}\`
- correlationId: \`${binding.correlationId}\`

Read \`get_builder_task\` when a tool needs the current \`expectedTaskRevision\` (task revision), \`expectedContextVersion\` (Live Context version) or the open Decisions. The task is already started; call \`start_task\` only if its status is PENDING.

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
