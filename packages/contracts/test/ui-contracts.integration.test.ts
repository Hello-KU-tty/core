import { describe, expect, it } from 'vitest'

import {
  builderSessionBindingDescriptorSchema,
  uiPrepareBuilderSessionQuerySchema,
  uiRecordHelperExchangeCommandSchema,
  uiRequestSchema,
  uiPrepareBuilderTaskCommandSchema,
  uiListProjectsQuerySchema,
  uiRestoreProjectSessionQuerySchema,
  uiResolveDecisionCommandSchema,
  uiReturnToDiscoveryCommandSchema,
  uiStartDiscoveryCommandSchema,
  uiUpdateLearningSpecCommandSchema,
} from '../src/index.ts'
import {
  decisionResolutionFixture,
  discoveryInputFixture,
  ids,
  learningSpecDraftContentFixture,
} from './fixtures.js'

describe('UI external input contracts', () => {
  const startDiscoveryCommand = {
    schemaVersion: 1,
    kind: 'UI_START_DISCOVERY',
    correlationId: ids.correlation,
    actor: { kind: 'UI' },
    idempotencyKey: ids.idempotency,
    projectId: ids.project,
    input: discoveryInputFixture,
  } as const

  it('accepts a strict Discovery command without availableTime', () => {
    expect(uiStartDiscoveryCommandSchema.parse(startDiscoveryCommand)).toEqual(
      startDiscoveryCommand,
    )
    expect(uiRequestSchema.safeParse(startDiscoveryCommand).success).toBe(true)
    expect(
      uiStartDiscoveryCommandSchema.safeParse({
        ...startDiscoveryCommand,
        input: { ...discoveryInputFixture, availableTime: 'two weeks' },
      }).success,
    ).toBe(false)
  })

  it('accepts a user-authored Decision resolution with matching correlation', () => {
    const command = {
      schemaVersion: 1,
      kind: 'UI_RESOLVE_DECISION',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: ids.idempotency,
      resolution: decisionResolutionFixture,
    } as const

    expect(uiResolveDecisionCommandSchema.parse(command)).toEqual(command)
    expect(
      uiResolveDecisionCommandSchema.safeParse({
        ...command,
        correlationId: 'corr_00000000-0000-4000-8000-000000000099',
      }).success,
    ).toBe(false)
  })

  it('accepts direct Spec editing and new-session Discovery return commands', () => {
    const update = {
      schemaVersion: 1,
      kind: 'UI_UPDATE_LEARNING_SPEC',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: ids.idempotency,
      projectId: ids.project,
      learningSpecId: ids.learningSpec,
      expectedSessionRevision: 3,
      expectedSpecRevision: 1,
      draft: learningSpecDraftContentFixture,
    } as const
    const returned = {
      schemaVersion: 1,
      kind: 'UI_RETURN_TO_DISCOVERY',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: ids.idempotency,
      projectId: ids.project,
      discoverySessionId: ids.discoverySession,
      expectedSessionRevision: 3,
      expectedSpecRevision: 1,
      input: { ...discoveryInputFixture, learningGoal: 'Build a smaller runtime validator' },
    } as const

    expect(uiUpdateLearningSpecCommandSchema.parse(update)).toEqual(update)
    expect(uiReturnToDiscoveryCommandSchema.parse(returned)).toEqual(returned)
    expect(uiRequestSchema.safeParse(update).success).toBe(true)
    expect(uiRequestSchema.safeParse(returned).success).toBe(true)
  })

  it('accepts a separate retryable Builder Task preparation command', () => {
    const prepare = {
      schemaVersion: 1,
      kind: 'UI_PREPARE_BUILDER_TASK',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: ids.idempotency,
      projectId: ids.project,
      learningSpecId: ids.learningSpec,
      expectedSpecRevision: 2,
    } as const
    expect(uiPrepareBuilderTaskCommandSchema.parse(prepare)).toEqual(prepare)
    expect(uiRequestSchema.safeParse(prepare).success).toBe(true)
    expect(
      uiPrepareBuilderTaskCommandSchema.safeParse({ ...prepare, workspacePath: '/tmp/owned-by-ui' })
        .success,
    ).toBe(false)
  })

  it('keeps the one-time Builder binding and Helper input provenance explicit', () => {
    const prepareSession = {
      schemaVersion: 1,
      kind: 'UI_PREPARE_BUILDER_SESSION',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      projectId: ids.project,
      taskId: ids.task,
    } as const
    expect(uiPrepareBuilderSessionQuerySchema.parse(prepareSession)).toEqual(prepareSession)
    expect(uiRequestSchema.safeParse(prepareSession).success).toBe(true)
    expect(
      builderSessionBindingDescriptorSchema.safeParse({
        schemaVersion: 1,
        correlationId: ids.correlation,
        projectId: ids.project,
        taskId: ids.task,
        workspaceDirectory: '/private/tmp/vibe-helper/projects/project-safe',
        status: 'READY',
      }).success,
    ).toBe(true)
    expect(
      builderSessionBindingDescriptorSchema.safeParse({
        schemaVersion: 1,
        correlationId: ids.correlation,
        projectId: ids.project,
        taskId: ids.task,
        workspaceDirectory: 'projects/project-safe',
        status: 'READY',
      }).success,
    ).toBe(false)

    const exchange = {
      schemaVersion: 1,
      kind: 'UI_RECORD_HELPER_EXCHANGE',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: ids.idempotency,
      projectId: ids.project,
      taskId: ids.task,
      userMessage: '선택지를 비교해줘',
      helperResponseSummary: '두 선택지의 차이를 설명했습니다.',
      origin: 'QUICK_ACTION',
      closeConversation: false,
    } as const
    expect(uiRecordHelperExchangeCommandSchema.parse(exchange)).toEqual(exchange)
    expect(
      uiRecordHelperExchangeCommandSchema.safeParse({ ...exchange, origin: 'AGENT_SUGGESTED' })
        .success,
    ).toBe(false)
  })

  it('accepts bounded Project History and session restore queries', () => {
    const list = {
      schemaVersion: 1,
      kind: 'UI_LIST_PROJECTS',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      limit: 25,
    } as const
    const restore = {
      schemaVersion: 1,
      kind: 'UI_RESTORE_PROJECT_SESSION',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      projectId: ids.project,
      helperConversationLimit: 10,
    } as const

    expect(uiListProjectsQuerySchema.parse(list)).toEqual(list)
    expect(uiRestoreProjectSessionQuerySchema.parse(restore)).toEqual(restore)
    expect(uiRequestSchema.safeParse(list).success).toBe(true)
    expect(uiRequestSchema.safeParse(restore).success).toBe(true)
    expect(uiListProjectsQuerySchema.safeParse({ ...list, limit: 101 }).success).toBe(false)
    expect(
      uiRestoreProjectSessionQuerySchema.safeParse({
        ...restore,
        helperConversationLimit: 0,
      }).success,
    ).toBe(false)
  })
})
