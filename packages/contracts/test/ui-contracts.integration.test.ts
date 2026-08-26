import { describe, expect, it } from 'vitest'

import {
  uiRequestSchema,
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
    } as const

    expect(uiUpdateLearningSpecCommandSchema.parse(update)).toEqual(update)
    expect(uiReturnToDiscoveryCommandSchema.parse(returned)).toEqual(returned)
    expect(uiRequestSchema.safeParse(update).success).toBe(true)
    expect(uiRequestSchema.safeParse(returned).success).toBe(true)
  })
})
