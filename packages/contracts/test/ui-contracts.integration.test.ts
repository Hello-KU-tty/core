import { describe, expect, it } from 'vitest'

import {
  uiRequestSchema,
  uiResolveDecisionCommandSchema,
  uiStartDiscoveryCommandSchema,
} from '../src/index.ts'
import { decisionResolutionFixture, discoveryInputFixture, ids } from './fixtures.js'

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
})
