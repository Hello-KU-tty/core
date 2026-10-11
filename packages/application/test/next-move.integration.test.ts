import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import {
  builderTaskSchema,
  candidateRoundSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  learningSpecRevisionSchema,
  type NextMoveJob,
  projectCandidateRevisionSchema,
  projectSchema,
} from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import {
  builderTaskFixture,
  candidateFixture,
  candidateRoundFixture,
  confirmedLearningSpecFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  ids,
  projectFixture,
} from '../../contracts/test/fixtures.js'
import { openInMemorySqliteStorage } from '../../storage-sqlite/src/index.js'

const builderConversation = 'conversation_00000000-0000-4000-8000-000000000901'

const suggestions = {
  moves: [
    {
      title: '지운 메모 되살리기',
      summary: '지운 메모를 휴지통에 두고 다시 꺼낼 수 있게 해요',
      benefit: '실수로 지워도 걱정 없어요',
      size: 'SMALL',
      concepts: ['soft delete'],
    },
    {
      title: '가족과 메모 함께 보기',
      summary: '같은 메모를 가족 기기에서도 볼 수 있게 해요',
      benefit: '장보기 목록을 함께 채워요',
      size: 'MEDIUM',
      concepts: ['access control'],
    },
    {
      title: '자주 쓰는 메모 추천',
      summary: '지난 메모에서 자주 쓴 항목을 먼저 보여 줘요',
      benefit: '매번 다시 쓰지 않아도 돼요',
      size: 'MEDIUM',
      concepts: [],
    },
  ],
} as const

const completeReport = {
  implemented: ['Memo list that shows only the author memos.'],
  acceptance: [{ key: 'valid_event', passed: true }],
  checks: [{ name: 'unit tests', passed: true, summary: '12 passed.' }],
}

const createHarness = async () => {
  let clock = Date.parse('2026-09-01T00:00:00.000Z')
  let generated = 0
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-next-move-'))
  const storage = await openInMemorySqliteStorage()
  const service = new ApplicationService({
    storage,
    workspacePolicy: await WorkspacePathPolicy.create(workspaceRoot),
    now: () => {
      clock += 1_000
      return new Date(clock)
    },
    generateId: (prefix) => {
      generated += 1
      return `${prefix}_00000000-0000-4000-8000-${String(generated).padStart(12, '0')}`
    },
  })
  storage.transaction((repository) => {
    repository.appendProject(projectSchema.parse(projectFixture))
    repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
    repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
    repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
    repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
    repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
    repository.appendLearningSpec(learningSpecRevisionSchema.parse(confirmedLearningSpecFixture))
    repository.appendTask(builderTaskSchema.parse({ ...builderTaskFixture, status: 'ACTIVE' }))
  })
  let keys = 0
  const key = () => {
    keys += 1
    return `idem_00000000-0000-4000-8000-${String(700_000 + keys).padStart(12, '0')}`
  }
  const builder = {
    schemaVersion: 1,
    correlationId: ids.correlation,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    projectId: ids.project,
    taskId: ids.task,
  } as const
  const ui = { schemaVersion: 1, correlationId: ids.correlation, actor: { kind: 'UI' } } as const
  const runtime = {
    schemaVersion: 1,
    correlationId: ids.correlation,
    actor: { kind: 'KIRO_ADAPTER' },
  } as const
  const ok = async <T>(result: Promise<{ success: boolean; data?: unknown; error?: unknown }>) => {
    const settled = await result
    if (!settled.success) throw new Error(JSON.stringify(settled.error))
    return settled.data as T
  }
  const target = (job: NextMoveJob) => ({
    ...runtime,
    projectId: job.projectId,
    nextMoveJobId: job.id,
    expectedJobRevision: job.revision,
  })
  const harness = {
    service,
    storage,
    advance: (ms: number) => {
      clock += ms
    },
    say: (message: string) =>
      ok(
        service.executeUi({
          ...ui,
          kind: 'UI_RECORD_CHAT_MESSAGE',
          idempotencyKey: key(),
          projectId: ids.project,
          taskId: ids.task,
          conversationId: builderConversation,
          message,
        }),
      ),
    check: () =>
      service.executeAgent('BUILDER', { ...builder, kind: 'BUILDER_CHAT_CHECK_PROGRESS' }),
    note: (note: Record<string, unknown>) =>
      service.executeAgent('BUILDER', {
        ...builder,
        kind: 'BUILDER_CHAT_SAVE_PROGRESS',
        idempotencyKey: key(),
        note,
      }),
    finish: (report: Record<string, unknown> = completeReport, taskId: string = ids.task) =>
      service.executeAgent('BUILDER', {
        ...builder,
        taskId,
        kind: 'BUILDER_CHAT_FINISH_TASK',
        idempotencyKey: key(),
        report,
      }),
    read: () =>
      ok<Record<string, unknown>>(
        service.executeUi({ ...ui, kind: 'UI_READ_NEXT_MOVE', projectId: ids.project }),
      ),
    retry: (job: NextMoveJob) =>
      service.executeUi({
        ...ui,
        kind: 'UI_RETRY_NEXT_MOVE',
        idempotencyKey: key(),
        projectId: job.projectId,
        nextMoveJobId: job.id,
        expectedJobRevision: job.revision,
      }),
    pending: () =>
      ok<NextMoveJob[]>(
        service.executeNextMove({ ...runtime, kind: 'NEXT_MOVE_LIST_PENDING', limit: 10 }),
      ),
    claim: (job: NextMoveJob) =>
      ok<NextMoveJob>(
        service.executeNextMove({
          ...target(job),
          kind: 'NEXT_MOVE_CLAIM_JOB',
          runtimeHandle: 'local-test',
        }),
      ),
    context: (job: NextMoveJob) =>
      ok<Record<string, unknown>>(
        service.executeNextMove({ ...target(job), kind: 'NEXT_MOVE_GET_CONTEXT' }),
      ),
    submit: (job: NextMoveJob, result: unknown = suggestions, attempt = job.attempt) =>
      service.executeNextMove({
        ...target(job),
        kind: 'NEXT_MOVE_SUBMIT_RESULT',
        attempt,
        promptVersion: '1.4.0',
        result,
      }),
    fail: (job: NextMoveJob) =>
      ok<NextMoveJob>(
        service.executeNextMove({
          ...target(job),
          kind: 'NEXT_MOVE_FAIL_ATTEMPT',
          attempt: job.attempt,
          failure: {
            code: 'NEXT_MOVE_RUNTIME_ERROR',
            message: 'kiro-cli exited.',
            retryable: true,
          },
        }),
      ),
    recover: () =>
      ok<NextMoveJob[]>(
        service.executeNextMove({ ...runtime, kind: 'NEXT_MOVE_RECOVER_EXPIRED', limit: 10 }),
      ),
    ledgers: () => storage.repository.readRecentConceptLedgers(100).length,
  }
  return harness
}

type Harness = Awaited<ReturnType<typeof createHarness>>

/** Finishes the Task and stores the three suggestions, returning the succeeded job. */
const readySuggestions = async (harness: Harness): Promise<NextMoveJob> => {
  await harness.say('메모 목록부터 만들어 줘')
  expect(await harness.finish()).toMatchObject({ success: true })
  const [pending] = await harness.pending()
  if (pending === undefined) throw new Error('missing job')
  const claimed = await harness.claim(pending)
  const stored = await harness.submit(claimed)
  if (!stored.success) throw new Error(JSON.stringify(stored.error))
  return stored.data as NextMoveJob
}

describe('Next Move suggestions (SPEC 5.8.1)', () => {
  it('queues one job when a Task finishes and shows it as generating everywhere', async () => {
    const harness = await createHarness()
    expect(await harness.read()).toEqual({ status: 'NONE', moves: [] })
    await harness.say('메모 목록부터 만들어 줘')
    const finished = await harness.finish()
    // The Builder does not wait: the receipt already says the suggestions are on their way.
    expect(finished).toMatchObject({
      success: true,
      data: { outcome: 'COMPLETED', nextMove: { status: 'GENERATING', moves: [] } },
    })
    const jobs = await harness.pending()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ sourceTaskId: ids.task, status: 'PENDING', attempt: 0 })
    expect(await harness.read()).toMatchObject({
      status: 'GENERATING',
      sourceTaskId: ids.task,
      nextMoveJobId: jobs[0]?.id,
    })
    expect(await harness.check()).toMatchObject({
      success: true,
      data: { task: { status: 'COMPLETED' }, nextMove: { status: 'GENERATING' } },
    })
    // Finishing again does not queue a second job.
    expect(await harness.finish()).toMatchObject({
      success: true,
      data: { outcome: 'ALREADY_COMPLETED' },
    })
    expect(await harness.pending()).toHaveLength(1)
  })

  it('reads a bounded context, stores three numbered suggestions and shows them without concepts', async () => {
    const harness = await createHarness()
    await harness.say('메모 목록부터 만들어 줘')
    await harness.finish()
    const [pending] = await harness.pending()
    if (pending === undefined) throw new Error('missing job')
    const claimed = await harness.claim(pending)
    expect(claimed).toMatchObject({ status: 'RUNNING', attempt: 1, runtimeHandle: 'local-test' })
    const context = await harness.context(claimed)
    expect(context).toMatchObject({
      nextMoveJobId: claimed.id,
      projectTitle: projectFixture.title,
      tasks: [{ sequence: builderTaskFixture.sequence, implemented: completeReport.implemented }],
    })
    const ledgers = harness.ledgers()
    const stored = await harness.submit(claimed)
    expect(stored).toMatchObject({
      success: true,
      data: {
        status: 'SUCCEEDED',
        author: { kind: 'AGENT', role: 'DISCOVERY', promptVersion: '1.4.0' },
        moves: [{ number: 1 }, { number: 2 }, { number: 3 }],
      },
    })
    const view = await harness.read()
    expect(view).toMatchObject({
      status: 'READY',
      moves: [
        { number: 1, title: '지운 메모 되살리기', size: 'SMALL' },
        { number: 2, title: '가족과 메모 함께 보기', size: 'MEDIUM' },
        { number: 3, title: '자주 쓰는 메모 추천' },
      ],
    })
    expect(JSON.stringify(view)).not.toContain('concepts')
    expect(await harness.check()).toMatchObject({
      success: true,
      data: { nextMove: { status: 'READY', moves: [{ number: 1 }, { number: 2 }, { number: 3 }] } },
    })
    const helper = await harness.service.executeAgent('HELPER', {
      schemaVersion: 1,
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'HELPER' },
      kind: 'HELPER_GET_CONTEXT',
      projectId: ids.project,
      taskId: ids.task,
      question: '1번이랑 2번 중 뭐가 나아?',
      relatedConceptNames: [],
    })
    expect(helper).toMatchObject({ success: true, data: { nextMove: { status: 'READY' } } })
    // Suggestions are Agent proposals: nothing about the learner's understanding changed.
    expect(harness.ledgers()).toBe(ledgers)
  })

  it('rejects malformed, repeated or stale results without storing them', async () => {
    const harness = await createHarness()
    await harness.say('메모 목록부터 만들어 줘')
    await harness.finish()
    const [pending] = await harness.pending()
    if (pending === undefined) throw new Error('missing job')
    const claimed = await harness.claim(pending)
    expect(await harness.submit(claimed, { moves: suggestions.moves.slice(0, 2) })).toMatchObject({
      success: false,
    })
    const repeated = { moves: [suggestions.moves[0], suggestions.moves[0], suggestions.moves[1]] }
    expect(await harness.submit(claimed, repeated)).toMatchObject({
      success: false,
      error: { code: 'NEXT_MOVE_DUPLICATE_SUGGESTION' },
    })
    expect(await harness.submit(claimed, suggestions, 2)).toMatchObject({
      success: false,
      error: { code: 'NEXT_MOVE_RESULT_STALE' },
    })
    expect(await harness.read()).toMatchObject({ status: 'GENERATING' })
  })

  it('retries once on its own, then waits for an explicit retry', async () => {
    const harness = await createHarness()
    await harness.say('메모 목록부터 만들어 줘')
    await harness.finish()
    const [pending] = await harness.pending()
    if (pending === undefined) throw new Error('missing job')
    const retrying = await harness.fail(await harness.claim(pending))
    expect(retrying).toMatchObject({ status: 'PENDING', attempt: 1 })
    expect(await harness.read()).toMatchObject({ status: 'GENERATING' })
    const failed = await harness.fail(await harness.claim(retrying))
    expect(failed).toMatchObject({ status: 'FAILED', attempt: 2 })
    expect(await harness.read()).toMatchObject({
      status: 'FAILED',
      failureCode: 'NEXT_MOVE_RUNTIME_ERROR',
    })
    expect(await harness.pending()).toHaveLength(0)
    expect(await harness.retry(failed)).toMatchObject({
      success: true,
      data: { status: 'GENERATING' },
    })
    expect(await harness.pending()).toMatchObject([{ status: 'PENDING', attempt: 0 }])
  })

  it('recovers an attempt whose deadline passed', async () => {
    const harness = await createHarness()
    await harness.say('메모 목록부터 만들어 줘')
    await harness.finish()
    const [pending] = await harness.pending()
    if (pending === undefined) throw new Error('missing job')
    await harness.claim(pending)
    expect(await harness.recover()).toHaveLength(0)
    harness.advance(121_000)
    expect(await harness.recover()).toMatchObject([
      { status: 'PENDING', attempt: 1, lastFailure: { code: 'NEXT_MOVE_TIMEOUT' } },
    ])
  })

  it('starts a follow-up from the chosen suggestion and checks the number against the learner', async () => {
    const harness = await createHarness()
    const job = await readySuggestions(harness)
    const ledgers = harness.ledgers()
    await harness.say('2번 해 보자')
    // The learner clearly picked 2: the Builder must say so, and must not record another one.
    expect(await harness.note({ kind: 'PLAN', summary: 'Share memos.' })).toMatchObject({
      success: false,
      error: { code: 'NEXT_MOVE_NUMBER_REQUIRED' },
    })
    expect(
      await harness.note({ kind: 'PLAN', summary: 'Share memos.', nextMove: 1 }),
    ).toMatchObject({ success: false, error: { code: 'NEXT_MOVE_NUMBER_CONFLICT' } })
    expect(
      await harness.note({ kind: 'PLAN', summary: 'Share memos.', nextMove: '2' }),
    ).toMatchObject({ success: true, data: { outcome: 'SAVED', followUpTask: {} } })
    const followUp = harness.storage.repository.readLatestTaskForProject(ids.project)
    expect(followUp).toMatchObject({
      prerequisiteTaskIds: [ids.task],
      nextMove: {
        nextMoveJobId: job.id,
        number: 2,
        title: '가족과 메모 함께 보기',
        source: { kind: 'AGENT', role: 'DISCOVERY' },
      },
    })
    expect(followUp?.productGoal).toContain('가족과 메모 함께 보기')
    expect(followUp?.productGoal).toContain('2번 해 보자')
    // Once another Task is under way the old suggestions are past.
    expect(await harness.read()).toEqual({ status: 'NONE', moves: [] })
    expect(harness.ledgers()).toBe(ledgers)

    // Finishing the follow-up queues new suggestions that know which one was already built.
    if (followUp === null) throw new Error('missing follow-up')
    expect(
      await harness.finish(
        {
          implemented: ['Family members can open the same memo list.'],
          acceptance: [
            { key: 'user_request', passed: true },
            { key: 'verified_outcome', passed: true },
          ],
          checks: [{ name: 'unit tests', passed: true, summary: '15 passed.' }],
        },
        followUp.id,
      ),
    ).toMatchObject({ success: true, data: { outcome: 'COMPLETED' } })
    const [next] = await harness.pending()
    if (next === undefined) throw new Error('missing second job')
    expect(next.sourceTaskId).toBe(followUp.id)
    const context = await harness.context(await harness.claim(next))
    expect(context).toMatchObject({
      tasks: [
        { sequence: builderTaskFixture.sequence },
        { fromNextMove: { title: '가족과 메모 함께 보기' } },
      ],
    })
  })

  it("follows the learner's own request after ready suggestions without a number", async () => {
    const harness = await createHarness()
    await readySuggestions(harness)
    await harness.say('사진도 붙일 수 있으면 좋겠어')
    expect(await harness.note({ kind: 'PLAN', summary: 'Attach photos.' })).toMatchObject({
      success: true,
      data: { outcome: 'SAVED' },
    })
    const followUp = harness.storage.repository.readLatestTaskForProject(ids.project)
    expect(followUp?.productGoal).toBe('사진도 붙일 수 있으면 좋겠어')
    expect(followUp).not.toHaveProperty('nextMove')
  })

  it('refuses a suggestion number while the suggestions are not ready', async () => {
    const harness = await createHarness()
    await harness.say('메모 목록부터 만들어 줘')
    await harness.finish()
    await harness.say('2번 해 보자')
    expect(
      await harness.note({ kind: 'PLAN', summary: 'Share memos.', nextMove: 2 }),
    ).toMatchObject({ success: false, error: { code: 'NEXT_MOVE_NOT_READY' } })
  })

  it('closes a job instead of running it when the learner already started another Task', async () => {
    const harness = await createHarness()
    await harness.say('메모 목록부터 만들어 줘')
    await harness.finish()
    const [pending] = await harness.pending()
    if (pending === undefined) throw new Error('missing job')
    await harness.say('검색 기능도 넣어 줘')
    expect(await harness.note({ kind: 'PLAN', summary: 'Add search.' })).toMatchObject({
      success: true,
    })
    expect(await harness.claim(pending)).toMatchObject({
      status: 'FAILED',
      lastFailure: { code: 'NEXT_MOVE_SOURCE_NOT_CURRENT', retryable: false },
    })
    expect(await harness.pending()).toHaveLength(0)
  })
})
