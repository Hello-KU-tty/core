import { analysisJobSchema } from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import { transitionAnalysisJob } from '../src/index.js'
import { analysisJobFixture, analysisJobPendingFixture } from '../../contracts/test/fixtures.js'

describe('Analysis Job reducer', () => {
  it('allows one automatic retry and makes the second retryable failure terminal', () => {
    const firstRunning = analysisJobSchema.parse(analysisJobFixture)
    const retryPending = analysisJobSchema.parse({
      ...firstRunning,
      revision: 3,
      status: 'PENDING',
      runtimeHandle: undefined,
      deadlineAt: undefined,
      lastFailure: { code: 'ANALYST_TIMEOUT', message: 'The deadline elapsed.', retryable: true },
    })
    expect(transitionAnalysisJob({ current: firstRunning, proposed: retryPending })).toMatchObject({
      outcome: 'APPLIED',
      value: { status: 'PENDING', attempt: 1 },
    })

    const secondRunning = analysisJobSchema.parse({
      ...retryPending,
      revision: 4,
      status: 'RUNNING',
      attempt: 2,
      runtimeHandle: 'analyst-slot-2',
      deadlineAt: '2026-08-25T03:00:30.000Z',
      lastFailure: undefined,
    })
    expect(transitionAnalysisJob({ current: retryPending, proposed: secondRunning }).outcome).toBe(
      'APPLIED',
    )
    const terminal = analysisJobSchema.parse({
      ...secondRunning,
      revision: 5,
      status: 'FAILED',
      runtimeHandle: undefined,
      deadlineAt: undefined,
      lastFailure: { code: 'ANALYST_TIMEOUT', message: 'The deadline elapsed.', retryable: true },
      completedAt: secondRunning.updatedAt,
    })
    expect(transitionAnalysisJob({ current: secondRunning, proposed: terminal })).toMatchObject({
      outcome: 'APPLIED',
      value: { status: 'FAILED', attempt: 2 },
    })
  })

  it('rejects stale transitions and permits an explicit manual retry with a new Episode revision', () => {
    const pending = analysisJobSchema.parse(analysisJobPendingFixture)
    expect(
      transitionAnalysisJob({ current: pending, proposed: { ...pending, revision: 3 } }),
    ).toMatchObject({
      outcome: 'REJECTED',
      trace: { reasonCode: 'ANALYSIS_JOB_REVISION_CONFLICT' },
    })

    const failed = analysisJobSchema.parse({
      ...analysisJobFixture,
      revision: 3,
      status: 'FAILED',
      attempt: 1,
      runtimeHandle: undefined,
      deadlineAt: undefined,
      lastFailure: { code: 'INVALID_RESULT', message: 'Output was invalid.', retryable: false },
      completedAt: analysisJobFixture.updatedAt,
    })
    const retried = analysisJobSchema.parse({
      ...failed,
      revision: 4,
      episodeRevision: 2,
      status: 'PENDING',
      attempt: 0,
      startedAt: undefined,
      completedAt: undefined,
      lastFailure: undefined,
    })
    expect(transitionAnalysisJob({ current: failed, proposed: retried })).toMatchObject({
      outcome: 'APPLIED',
      value: { status: 'PENDING', attempt: 0, episodeRevision: 2 },
    })
  })
})
