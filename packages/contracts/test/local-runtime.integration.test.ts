import { describe, expect, it } from 'vitest'
import { localRunRequestSchema } from '../src/index.js'
import { ids } from './fixtures.js'

describe('Builder explicit resume input', () => {
  const builder = {
    kind: 'BUILDER',
    projectId: ids.project,
    taskId: ids.task,
    expectedTaskRevision: 2,
    idempotencyKey: ids.idempotency,
    message: '',
  }

  it('accepts no extra message without inventing user-authored instructions', () => {
    expect(localRunRequestSchema.parse(builder)).toEqual(builder)
    expect(localRunRequestSchema.parse({ ...builder, message: ' \n ' })).toEqual(builder)
    expect(
      localRunRequestSchema.parse({ ...builder, message: ' Keep the local scope. ' }),
    ).toMatchObject({ message: 'Keep the local scope.' })
  })

  it('keeps message typing, payload bounds and Task binding strict', () => {
    for (const patch of [
      { message: undefined },
      { message: null },
      { message: 1 },
      { message: 'a'.repeat(4_001) },
      { taskId: undefined },
      { expectedTaskRevision: undefined },
      { expectedTaskRevision: -1 },
      { extra: true },
    ])
      expect(localRunRequestSchema.safeParse({ ...builder, ...patch }).success).toBe(false)
  })

  it('still rejects an empty Helper question', () => {
    const { expectedTaskRevision: _revision, ...helper } = builder
    for (const message of ['', ' \n '])
      expect(localRunRequestSchema.safeParse({ ...helper, kind: 'HELPER', message }).success).toBe(
        false,
      )
  })
})
