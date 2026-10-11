import { type NextMoveJob, nextMoveJobSchema } from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import { builderTaskFixture, ids, timestamp } from '../../contracts/test/fixtures.js'
import { clearNextMoveAnswer, nextMoveView, transitionNextMoveJob } from '../src/next-move.js'

const later = '2026-09-01T00:10:00.000Z'
const pending: NextMoveJob = nextMoveJobSchema.parse({
  schemaVersion: 1,
  id: 'next_move_job_00000000-0000-4000-8000-000000000001',
  projectId: ids.project,
  sourceTaskId: ids.task,
  correlationId: ids.correlation,
  revision: 1,
  status: 'PENDING',
  attempt: 0,
  maxAttempts: 2,
  timeoutMs: 120_000,
  createdAt: timestamp,
  updatedAt: timestamp,
  source: { kind: 'CORE' },
  redactionStatus: 'NOT_REQUIRED',
})
const running = {
  ...pending,
  revision: 2,
  status: 'RUNNING',
  attempt: 1,
  runtimeHandle: 'local-test',
  startedAt: later,
  deadlineAt: '2026-09-01T00:12:00.000Z',
  updatedAt: later,
} as const
const moves = [1, 2, 3].map((number) => ({
  number,
  title: `제안 ${number}`,
  summary: `제안 ${number}의 설명`,
  benefit: `좋아지는 점 ${number}`,
  size: 'SMALL' as const,
  concepts: ['caching'],
}))
const succeeded = nextMoveJobSchema.parse({
  ...running,
  revision: 3,
  status: 'SUCCEEDED',
  runtimeHandle: undefined,
  deadlineAt: undefined,
  moves,
  author: { kind: 'AGENT', role: 'DISCOVERY', promptVersion: '1.4.0' },
  completedAt: later,
})
const completedTask = { ...builderTaskFixture, status: 'COMPLETED' as const }

describe('Next Move job transitions', () => {
  it('follows the Analysis Job lease rules', () => {
    expect(transitionNextMoveJob({ current: pending, proposed: running }).outcome).toBe('APPLIED')
    expect(
      transitionNextMoveJob({ current: nextMoveJobSchema.parse(running), proposed: succeeded })
        .outcome,
    ).toBe('APPLIED')
    // A job cannot jump from waiting to done, or lose its Task.
    expect(
      transitionNextMoveJob({ current: pending, proposed: { ...succeeded, revision: 2 } }),
    ).toMatchObject({ outcome: 'REJECTED', reasonCode: 'NEXT_MOVE_JOB_TRANSITION_NOT_ALLOWED' })
    expect(
      transitionNextMoveJob({
        current: pending,
        proposed: { ...running, sourceTaskId: 'task_00000000-0000-4000-8000-000000000999' },
      }),
    ).toMatchObject({ outcome: 'REJECTED', reasonCode: 'NEXT_MOVE_JOB_REVISION_CONFLICT' })
  })

  it('keeps a retryable failure pending only while attempts remain', () => {
    const current = nextMoveJobSchema.parse({ ...running, attempt: 2, revision: 4 })
    const failure = { code: 'NEXT_MOVE_TIMEOUT', message: 'Timed out.', retryable: true }
    expect(
      transitionNextMoveJob({
        current,
        proposed: {
          ...current,
          revision: 5,
          status: 'PENDING',
          runtimeHandle: undefined,
          deadlineAt: undefined,
          lastFailure: failure,
        },
      }),
    ).toMatchObject({ outcome: 'REJECTED', reasonCode: 'NEXT_MOVE_RETRY_NOT_ALLOWED' })
  })

  it('requires numbered suggestions with their Agent author only on success', () => {
    expect(nextMoveJobSchema.safeParse({ ...succeeded, author: undefined }).success).toBe(false)
    expect(nextMoveJobSchema.safeParse({ ...succeeded, moves: [...moves].reverse() }).success).toBe(
      false,
    )
    expect(nextMoveJobSchema.safeParse({ ...pending, moves }).success).toBe(false)
  })
})

describe('Next Move view', () => {
  it('shows suggestions only for the latest finished Task', () => {
    expect(nextMoveView({ latestTask: completedTask, job: succeeded })).toMatchObject({
      status: 'READY',
      moves: [{ number: 1 }, { number: 2 }, { number: 3 }],
    })
    expect(
      JSON.stringify(nextMoveView({ latestTask: completedTask, job: succeeded })),
    ).not.toContain('caching')
    expect(nextMoveView({ latestTask: completedTask, job: pending }).status).toBe('GENERATING')
    expect(
      nextMoveView({ latestTask: { ...completedTask, status: 'ACTIVE' }, job: succeeded }).status,
    ).toBe('NONE')
    expect(
      nextMoveView({
        latestTask: { ...completedTask, id: 'task_00000000-0000-4000-8000-000000000999' },
        job: succeeded,
      }).status,
    ).toBe('NONE')
    expect(nextMoveView({ latestTask: null, job: null })).toEqual({ status: 'NONE', moves: [] })
  })
})

describe('clear Next Move answers', () => {
  it('reads only a plain numbered pick', () => {
    expect(clearNextMoveAnswer(moves, '2번 해 보자')).toBe(2)
    expect(clearNextMoveAnswer(moves, '3')).toBe(3)
    expect(clearNextMoveAnswer(moves, '1번 말고 다른 거')).toBeUndefined()
    expect(clearNextMoveAnswer(moves, '2번이랑 3번 중에 고민돼')).toBeUndefined()
    expect(clearNextMoveAnswer(moves, '사진도 붙이고 싶어')).toBeUndefined()
    expect(clearNextMoveAnswer(moves, '4번')).toBeUndefined()
  })
})
