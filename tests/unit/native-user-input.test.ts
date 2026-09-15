import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
  createNativeUserInputQueue,
} = require('../../examples/kiro-panel/src/native-user-input.cjs')
const redact = (value: string) => value.replaceAll('fixture-secret', '[REDACTED]')
const job = {
  id: 'native_11111111-1111-4111-8111-111111111111',
  projectId: 'project_11111111-1111-4111-8111-111111111111',
  taskId: 'task_11111111-1111-4111-8111-111111111111',
  discoverySessionId: null,
  role: 'BUILDER',
  workspace: '/private/tmp/synthetic-workspace',
}
const request = (
  queue: ReturnType<typeof createNativeUserInputQueue>,
  signal = new AbortController().signal,
) =>
  queue.request({
    job,
    sessionId: 'session_111',
    toolCallId: 'tool_111',
    question: 'Use fixture-secret?',
    options: [
      {
        title: 'Yes fixture-secret',
        description: 'A fixture-secret detail',
        recommended: true,
        subOptions: [{ title: 'One' }, { title: 'Two' }],
      },
      { title: 'No' },
    ],
    signal,
  })

describe('transient native user-input queue', () => {
  it('redacts display, binds one request, and formats selected options exactly once', async () => {
    const queue = createNativeUserInputQueue(redact)
    const notify = vi.fn()
    queue.subscribe(notify)
    const pending = request(queue)
    const item = queue.list(job.projectId)[0]
    expect(item).toMatchObject({
      projectId: job.projectId,
      taskId: job.taskId,
      role: 'BUILDER',
      question: 'Use [REDACTED]?',
      nativeJobId: job.id,
    })
    expect(JSON.stringify(item)).not.toContain('fixture-secret')
    expect(queue.list('project_elsewhere')).toEqual([])
    expect(request(queue)).toBe(pending)
    const submission = {
      projectId: job.projectId,
      nativeJobId: job.id,
      requestId: item.requestId,
      action: 'answered',
      optionIndex: 0,
      subOptionIndices: [0, 1],
    }
    expect(queue.submit(submission)).toBe('SUBMITTED')
    await expect(pending).resolves.toEqual({
      action: 'answered',
      answer: 'Yes [REDACTED] [One, Two]',
    })
    expect(queue.list(job.projectId)[0].status).toBe('RESPONDING')
    expect(queue.submit(submission)).toBe('ALREADY_SUBMITTED')
    expect(() => queue.submit({ ...submission, optionIndex: 1 })).toThrow('NATIVE_USER_INPUT_STALE')
    expect(queue.acknowledge(job.id, 'session_111', 'tool_111')).toBe(true)
    expect(queue.submit(submission)).toBe('ALREADY_HANDLED')
    expect(queue.list(job.projectId)).toEqual([])
    expect(notify).toHaveBeenCalledTimes(3)
  })

  it('rejects cross-project, malformed selections, sensitive free text, and stale cancellation', async () => {
    const queue = createNativeUserInputQueue(redact)
    const controller = new AbortController()
    const pending = request(queue, controller.signal)
    const item = queue.list(job.projectId)[0]
    const base = {
      projectId: job.projectId,
      nativeJobId: job.id,
      requestId: item.requestId,
      action: 'answered',
    }
    expect(() =>
      queue.submit({ ...base, projectId: 'project_foreign', optionIndex: 0, subOptionIndices: [] }),
    ).toThrow('NATIVE_USER_INPUT_STALE')
    expect(() => queue.submit({ ...base, optionIndex: 0, subOptionIndices: [0, 0] })).toThrow(
      'NATIVE_USER_INPUT_RESPONSE_INVALID',
    )
    expect(() => queue.submit({ ...base, optionIndex: 9, subOptionIndices: [] })).toThrow(
      'NATIVE_USER_INPUT_RESPONSE_INVALID',
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'NATIVE_USER_INPUT_CANCELLED' })
    expect(() => queue.submit({ ...base, optionIndex: 0, subOptionIndices: [] })).toThrow(
      'NATIVE_USER_INPUT_STALE',
    )
    expect(queue.list(job.projectId)).toEqual([])

    const free = queue.request({
      job,
      sessionId: 'session_222',
      toolCallId: 'tool_222',
      question: 'Your answer?',
      options: [],
    })
    const freeItem = queue.list(job.projectId)[0]
    const freeBase = {
      projectId: job.projectId,
      nativeJobId: job.id,
      requestId: freeItem.requestId,
      action: 'answered',
    }
    expect(() => queue.submit({ ...freeBase, answer: 'fixture-secret' })).toThrow(
      'NATIVE_USER_INPUT_RESPONSE_INVALID',
    )
    expect(() => queue.submit({ ...freeBase, answer: '   ' })).toThrow(
      'NATIVE_USER_INPUT_RESPONSE_INVALID',
    )
    expect(queue.submit({ ...freeBase, answer: '  User chose to continue  ' })).toBe('SUBMITTED')
    await expect(free).resolves.toEqual({ action: 'answered', answer: 'User chose to continue' })
    expect(queue.acknowledge(job.id, 'session_222', 'tool_222')).toBe(true)

    const other = queue.request({
      job,
      sessionId: 'session_333',
      toolCallId: 'tool_333',
      question: 'Choose?',
      options: [{ title: 'Yes' }, { title: 'No' }],
    })
    const otherItem = queue.list(job.projectId)[0]
    expect(() =>
      queue.submit({
        projectId: job.projectId,
        nativeJobId: job.id,
        requestId: otherItem.requestId,
        action: 'answered',
        optionIndex: 0,
        subOptionIndices: [],
        answer: 'No',
      }),
    ).toThrow('NATIVE_USER_INPUT_RESPONSE_INVALID')
    expect(
      queue.submit({
        projectId: job.projectId,
        nativeJobId: job.id,
        requestId: otherItem.requestId,
        action: 'answered',
        answer: 'Need to fix validation first',
      }),
    ).toBe('SUBMITTED')
    await expect(other).resolves.toEqual({
      action: 'answered',
      answer: 'Need to fix validation first',
    })
    queue.clearJob(job.id)
  })

  it('dismisses explicitly and fails closed on unknown option fields', async () => {
    const queue = createNativeUserInputQueue(redact)
    await expect(
      queue.request({
        job,
        sessionId: 's',
        toolCallId: 't',
        question: 'Question',
        options: [{ title: 'Yes', token: 'fixture-secret' }],
      }),
    ).rejects.toMatchObject({ code: 'NATIVE_USER_INPUT_INVALID' })
    const pending = queue.request({
      job,
      sessionId: 's2',
      toolCallId: 't2',
      question: 'Question',
      options: [],
    })
    const item = queue.list(job.projectId)[0]
    expect(
      queue.submit({
        projectId: job.projectId,
        nativeJobId: job.id,
        requestId: item.requestId,
        action: 'dismissed',
      }),
    ).toBe('SUBMITTED')
    await expect(pending).resolves.toEqual({ action: 'dismissed' })
    expect(queue.acknowledge(job.id, 's2', 't2')).toBe(true)
    queue.clearJob(job.id)
    expect(() =>
      queue.submit({
        projectId: job.projectId,
        nativeJobId: job.id,
        requestId: item.requestId,
        action: 'dismissed',
      }),
    ).toThrow('NATIVE_USER_INPUT_STALE')
  })
})
