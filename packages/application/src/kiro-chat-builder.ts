import type {
  BuilderTask,
  DecisionRequest,
  DecisionResolution,
  KiroChatProgressNote,
  KiroChatSaveChoice,
  LiveProjectContext,
} from '@vibe-helper/contracts'

import type { BuilderTaskAggregate } from './storage-ports.js'

/**
 * Pure rules of the Kiro chat Builder surface (K10). The application service owns storage and
 * events; these functions only read a Task aggregate and shape what the Agent sends.
 */

/** Learner messages linked to one chat-resolved Decision, newest kept. */
export const CHAT_LINKED_MESSAGE_LIMIT = 20
/** Agent replies (Builder chat turns, Helper answers) linked as context, newest kept. */
export const CHAT_LINKED_AGENT_EVENT_LIMIT = 20

const DEFAULT_STAGE: Readonly<Record<KiroChatProgressNote['kind'] | 'START' | 'FINISH', string>> = {
  START: '시작',
  PLAN: '계획',
  DIRECTION_CHANGE: '방향 변경',
  ERROR_REPLAN: '오류 뒤 계획 변경',
  TEST_START: '검증',
  FINISH: '완료',
}

export function defaultStage(kind: keyof typeof DEFAULT_STAGE): string {
  return DEFAULT_STAGE[kind]
}

export function progressCheckpoint(
  kind: KiroChatProgressNote['kind'],
): LiveProjectContext['checkpoint'] {
  switch (kind) {
    case 'PLAN':
    case 'DIRECTION_CHANGE':
      return 'DIRECTION_CHANGED'
    case 'ERROR_REPLAN':
      return 'PLAN_CHANGED_AFTER_ERROR'
    case 'TEST_START':
      return 'VALIDATION_STARTED'
  }
}

/** Decisions a later one replaced when the learner changed their choice in chat. */
export function supersededDecisionIds(decisions: readonly DecisionRequest[]): ReadonlySet<string> {
  return new Set(
    decisions.flatMap((decision) =>
      decision.replacesDecisionId === undefined ? [] : [decision.replacesDecisionId],
    ),
  )
}

/** The Task's Decisions that still count: every one not replaced by a later choice. */
export function currentDecisions(aggregate: BuilderTaskAggregate): readonly DecisionRequest[] {
  const superseded = supersededDecisionIds(aggregate.decisionRequests)
  return aggregate.decisionRequests.filter((decision) => !superseded.has(decision.id))
}

/** Current Decisions not applied yet: waiting for the learner, or chosen and being built. */
export function activeChatDecisionIds(aggregate: BuilderTaskAggregate): readonly string[] {
  const applied = new Set(aggregate.decisionApplications.map((item) => item.decisionId))
  return currentDecisions(aggregate)
    .filter((decision) => !applied.has(decision.id))
    .map((decision) => decision.id)
}

/** Follows a replaced Decision to the one that holds the learner's latest choice. */
export function latestDecisionInChain(
  decisions: readonly DecisionRequest[],
  decisionId: string,
): DecisionRequest | undefined {
  let current = decisions.find((decision) => decision.id === decisionId)
  for (let step = 0; current !== undefined && step < decisions.length; step += 1) {
    const replacement = decisions.find((decision) => decision.replacesDecisionId === current?.id)
    if (replacement === undefined) return current
    current = replacement
  }
  return current
}

/** The first Decision of a chain: when the learner was first asked this question. */
export function firstDecisionInChain(
  decisions: readonly DecisionRequest[],
  decision: DecisionRequest,
): DecisionRequest {
  let current = decision
  for (let step = 0; step < decisions.length; step += 1) {
    const previous = decisions.find((candidate) => candidate.id === current.replacesDecisionId)
    if (previous === undefined) return current
    current = previous
  }
  return current
}

export function optionNumber(decision: DecisionRequest, optionId: string | undefined): number {
  return decision.options.findIndex((option) => option.id === optionId) + 1
}

export function numberedOptions(
  decision: DecisionRequest,
): readonly { readonly number: number; readonly label: string }[] {
  return decision.options.map((option, index) => ({ number: index + 1, label: option.label }))
}

export interface ChatSelection {
  readonly selectionKind: DecisionResolution['selectionKind']
  readonly optionIndex?: number
}

/** Maps the Agent's choice onto the Decision's options; undefined when the number is out of range. */
export function chatSelection(
  decision: DecisionRequest,
  choice: KiroChatSaveChoice['choice'],
): ChatSelection | undefined {
  if (choice === 'custom') return { selectionKind: 'CUSTOM' }
  if (choice === 'recommended') {
    return {
      selectionKind: 'RECOMMENDATION',
      optionIndex: optionNumber(decision, decision.recommendedOptionId) - 1,
    }
  }
  if (choice > decision.options.length) return undefined
  return { selectionKind: 'OPTION', optionIndex: choice - 1 }
}

/** True when the learner's new answer repeats the stored one, so nothing changes. */
export function sameChatChoice(
  decision: DecisionRequest,
  resolution: DecisionResolution,
  selection: ChatSelection,
): boolean {
  if (selection.selectionKind === 'CUSTOM') return resolution.selectionKind === 'CUSTOM'
  const optionId =
    selection.optionIndex === undefined ? undefined : decision.options[selection.optionIndex]?.id
  return resolution.selectionKind !== 'CUSTOM' && resolution.selectedOptionId === optionId
}

/**
 * Where the learner's words about a Decision begin: after the previous choice in this Task made
 * before the question was asked, or at the start of the Task.
 */
export function chatWindowStart(aggregate: BuilderTaskAggregate, firstAskedAt: string): string {
  const earlier = aggregate.decisionResolutions
    .map((resolution) => resolution.resolvedAt)
    .filter((resolvedAt) => Date.parse(resolvedAt) <= Date.parse(firstAskedAt))
    .sort((left, right) => Date.parse(left) - Date.parse(right))
  return earlier.at(-1) ?? aggregate.task.createdAt
}

export function truncateText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

/** A Live Context snapshot from a chat progress note; Core fills identity and active Decisions. */
export function chatLiveContext(input: {
  readonly aggregate: BuilderTaskAggregate
  readonly id: string
  readonly correlationId: string
  readonly checkpoint: LiveProjectContext['checkpoint']
  readonly stage: string
  readonly summary: string
  readonly note?: Omit<KiroChatProgressNote, 'kind' | 'summary' | 'stage'>
  readonly updatedAt: string
}): Omit<LiveProjectContext, 'blockingReason'> {
  const current = input.aggregate.liveContext
  return {
    schemaVersion: 1,
    id: input.id,
    projectId: input.aggregate.task.projectId,
    taskId: input.aggregate.task.id,
    correlationId: input.correlationId,
    contextVersion: (current?.contextVersion ?? 0) + 1,
    expectedPreviousVersion: current?.contextVersion ?? 0,
    checkpoint: input.checkpoint,
    stage: input.stage,
    currentGoal: input.summary,
    recentChanges: input.note?.changes ?? [],
    activeDecisionIds: [...activeChatDecisionIds(input.aggregate)],
    activeConceptNames: input.note?.concepts ?? current?.activeConceptNames ?? [],
    relatedFiles: (input.note?.files ?? []).map((path) => ({ kind: 'CODE' as const, path })),
    nextActions: input.note?.nextSteps ?? [],
    updatedAt: input.updatedAt,
    source: { kind: 'AGENT', role: 'BUILDER' },
    redactionStatus: 'VERIFIED_REDACTED',
  }
}

/** True when a progress note would store the same snapshot as the current one. */
export function sameProgress(
  current: LiveProjectContext,
  next: Omit<LiveProjectContext, 'blockingReason'>,
): boolean {
  const same = (left: readonly unknown[], right: readonly unknown[]) =>
    JSON.stringify(left) === JSON.stringify(right)
  return (
    current.checkpoint === next.checkpoint &&
    current.stage === next.stage &&
    current.currentGoal === next.currentGoal &&
    same(current.recentChanges, next.recentChanges) &&
    same(current.activeConceptNames, next.activeConceptNames) &&
    same(current.relatedFiles, next.relatedFiles) &&
    same(current.nextActions, next.nextActions) &&
    same(current.activeDecisionIds, next.activeDecisionIds)
  )
}

export function taskGoal(task: BuilderTask): string {
  return task.productGoal
}
