import { describe, expect, it } from 'vitest'
import { planFollowUpTask } from '../src/task-planner.js'
import {
  builderTaskFixture,
  confirmedLearningSpecFixture,
  projectFixture,
  timestamp,
} from '../../contracts/test/fixtures.js'

const source = { ...builderTaskFixture, status: 'COMPLETED' as const }
const input = {
  project: projectFixture,
  spec: confirmedLearningSpecFixture,
  sourceTask: source,
  taskId: 'task_00000000-0000-4000-8000-000000000901',
  now: timestamp,
  userGoal: 'Explain how the existing implementation handles retries.',
}

describe('ordinary project follow-ups', () => {
  it('preserves the completed source and accepts explanation requests without an Evidence gate', () => {
    const before = structuredClone(source)
    const next = planFollowUpTask(input)
    expect(next.outcome).toBe('APPLIED')
    if (next.outcome !== 'APPLIED') throw new Error('FOLLOW_UP_NOT_CREATED')
    expect(next.value).toMatchObject({
      status: 'PENDING',
      revision: 1,
      sequence: 2,
      productGoal: input.userGoal,
      prerequisiteTaskIds: [source.id],
    })
    expect(next.value.finalUpgrade).toBeUndefined()
    expect(source).toEqual(before)
  })
  it('continues beyond sequence two, including after an optional Final Upgrade', () => {
    const next = planFollowUpTask({
      ...input,
      sourceTask: {
        ...source,
        sequence: 8,
        finalUpgrade: {
          sourceTaskId: source.id,
          personalizationTraceId: 'personalization_00000000-0000-4000-8000-000000000902',
          userGoal: 'Earlier goal',
        },
      },
    })
    expect(next).toMatchObject({ outcome: 'APPLIED', value: { sequence: 9 } })
    if (next.outcome === 'APPLIED') expect(next.value.finalUpgrade).toBeUndefined()
  })
  it.each(['ACTIVE', 'PENDING', 'CANCELLED'] as const)(
    'refuses an unfinished %s source',
    (status) => {
      expect(planFollowUpTask({ ...input, sourceTask: { ...source, status } })).toMatchObject({
        outcome: 'REJECTED',
      })
    },
  )
  it('rejects cross-project provenance and empty goals', () => {
    expect(
      planFollowUpTask({
        ...input,
        sourceTask: { ...source, projectId: 'project_00000000-0000-4000-8000-000000000903' },
      }),
    ).toMatchObject({ outcome: 'REJECTED' })
    expect(planFollowUpTask({ ...input, userGoal: '   ' })).toMatchObject({ outcome: 'REJECTED' })
  })
})
