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
const helperConversation = 'conversation_00000000-0000-4000-8000-000000000902'

const createHarness = async (task: { readonly status?: 'PENDING' | 'ACTIVE' } = {}) => {
  let clock = Date.parse('2026-09-01T00:00:00.000Z')
  let generated = 0
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-kiro-chat-'))
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
    repository.appendTask(
      builderTaskSchema.parse({ ...builderTaskFixture, status: task.status ?? 'ACTIVE' }),
    )
  })
  let keys = 0
  const key = () => {
    keys += 1
    return `idem_00000000-0000-4000-8000-${String(500_000 + keys).padStart(12, '0')}`
  }
  const builder = {
    schemaVersion: 1,
    correlationId: ids.correlation,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    projectId: ids.project,
    taskId: ids.task,
  } as const
  const ui = { schemaVersion: 1, correlationId: ids.correlation, actor: { kind: 'UI' } } as const
  const ok = async <T>(result: Promise<{ success: boolean; data?: T; error?: unknown }>) => {
    const settled = await result
    if (!settled.success) throw new Error(JSON.stringify(settled.error))
    return settled.data as T
  }
  return {
    service,
    storage,
    check: () =>
      service.executeAgent('BUILDER', { ...builder, kind: 'BUILDER_CHAT_CHECK_PROGRESS' }),
    note: (note: Record<string, unknown>) =>
      service.executeAgent('BUILDER', {
        ...builder,
        kind: 'BUILDER_CHAT_SAVE_PROGRESS',
        idempotencyKey: key(),
        note,
      }),
    ask: (overrides: Record<string, unknown> = {}) =>
      service.executeAgent('BUILDER', {
        ...builder,
        kind: 'BUILDER_CHAT_ASK_CHOICE',
        idempotencyKey: key(),
        choice: {
          category: 'AUTHORIZATION',
          question: 'Who can read a memo?',
          whyNow: 'The memo query needs an access rule before it can be written.',
          options: [
            { label: 'Only the author', description: 'Read the user ID from the token; simple.' },
            {
              label: 'A public flag',
              description: 'Each memo gets isPublic; sharing is easy to add later.',
            },
          ],
          recommended: 1,
          recommendationReason: 'Nothing in the plan shares memos yet.',
          blocksWork: false,
          concepts: ['access control'],
          ...overrides,
        },
      }),
    save: (answer: Record<string, unknown>) =>
      service.executeAgent('BUILDER', {
        ...builder,
        kind: 'BUILDER_CHAT_SAVE_CHOICE',
        idempotencyKey: key(),
        answer,
      }),
    finish: (report: Record<string, unknown>) =>
      service.executeAgent('BUILDER', {
        ...builder,
        kind: 'BUILDER_CHAT_FINISH_TASK',
        idempotencyKey: key(),
        report,
      }),
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
    askHelper: (userMessage: string, helperResponseSummary: string) =>
      ok(
        service.executeUi({
          ...ui,
          kind: 'UI_RECORD_HELPER_EXCHANGE',
          idempotencyKey: key(),
          projectId: ids.project,
          taskId: ids.task,
          conversationId: helperConversation,
          userMessage,
          helperResponseSummary,
          origin: 'FREE_TEXT',
          closeConversation: false,
        }),
      ),
    builderTurn: (reply: string) =>
      ok(
        service.executeUi({
          ...ui,
          kind: 'UI_RECORD_BUILDER_CHAT_TURN',
          idempotencyKey: key(),
          projectId: ids.project,
          taskId: ids.task,
          conversationId: builderConversation,
          reply,
        }),
      ),
    aggregate: () => {
      const aggregate = storage.repository.readBuilderTaskAggregate(ids.project, ids.task)
      if (aggregate === null) throw new Error('missing task')
      return aggregate
    },
  }
}

type Harness = Awaited<ReturnType<typeof createHarness>>

const askedId = async (harness: Harness) => {
  const asked = await harness.ask()
  if (!asked.success) throw new Error(JSON.stringify(asked.error))
  return (asked.data as { decisionId: string }).decisionId
}

const completeReport = {
  implemented: ['Memo list that shows only the author memos.'],
  acceptance: [{ key: 'valid_event', passed: true }],
  checks: [{ name: 'unit tests', passed: true, summary: '12 passed.' }],
}

describe('Kiro chat Builder surface (K10)', () => {
  it('starts a pending Task on the first note and keeps the note as the start record', async () => {
    const harness = await createHarness({ status: 'PENDING' })
    const first = await harness.note({
      kind: 'PLAN',
      summary: 'Build the memo API, then the list.',
    })
    expect(first).toMatchObject({ success: true, data: { outcome: 'SAVED', contextVersion: 1 } })
    expect(harness.aggregate().task.status).toBe('ACTIVE')
    expect(harness.aggregate().liveContext).toMatchObject({
      checkpoint: 'TASK_STARTED',
      currentGoal: 'Build the memo API, then the list.',
      activeDecisionIds: [],
    })

    const second = await harness.note({ kind: 'DIRECTION_CHANGE', summary: 'Use SQLite first.' })
    expect(second).toMatchObject({ success: true, data: { outcome: 'SAVED', contextVersion: 2 } })
    expect(harness.aggregate().liveContext).toMatchObject({ checkpoint: 'DIRECTION_CHANGED' })
    // The same note again changes nothing.
    expect(
      await harness.note({ kind: 'DIRECTION_CHANGE', summary: 'Use SQLite first.' }),
    ).toMatchObject({ success: true, data: { outcome: 'UNCHANGED', contextVersion: 2 } })
  })

  it('asks a choice with numbered options and returns the open one when asked again', async () => {
    const harness = await createHarness()
    const asked = await harness.ask()
    expect(asked).toMatchObject({
      success: true,
      data: {
        outcome: 'ASKED',
        options: [
          { number: 1, label: 'Only the author' },
          { number: 2, label: 'A public flag' },
        ],
        recommendedNumber: 1,
      },
    })
    expect(await harness.ask()).toMatchObject({ success: true, data: { outcome: 'ALREADY_OPEN' } })
    expect(harness.aggregate().decisionRequests).toHaveLength(1)
    // The Task had no Live Context: Core recorded the start before the Decision gate.
    expect(harness.aggregate().liveContext).toMatchObject({ checkpoint: 'DECISION_REQUIRED' })

    const progress = await harness.check()
    expect(progress).toMatchObject({
      success: true,
      data: {
        task: { title: 'Implement event variant viewer', status: 'ACTIVE' },
        acceptanceCriteria: [{ key: 'valid_event' }],
        openChoices: [{ state: 'WAITING_FOR_LEARNER', recommendedNumber: 1 }],
      },
    })
  })

  it("links the learner's words from before the question and from the Helper tab", async () => {
    const harness = await createHarness()
    await harness.say('공유 기능은 안 넣을 거야')
    const decisionId = await askedId(harness)
    await harness.builderTurn('1번: 본인 메모만, 2번: 공개 여부 필드. 어느 쪽이 좋을까요?')
    await harness.askHelper(
      '혼자 쓸 거라 1번이 나을 것 같은데 맞아?',
      '혼자 쓰면 1번이 단순합니다.',
    )
    await harness.say('그럼 1번')

    const saved = await harness.save({ choice: 1 })
    expect(saved).toMatchObject({
      success: true,
      data: {
        outcome: 'SAVED',
        decisionId,
        chosen: { number: 1, label: 'Only the author', custom: false },
        linkedMessageCount: 3,
      },
    })
    const resolution = harness
      .aggregate()
      .decisionResolutions.find((item) => item.decisionId === decisionId)
    expect(resolution).toMatchObject({
      selectionKind: 'OPTION',
      helperUsed: true,
      source: { kind: 'USER' },
      chatSource: {
        mappedBy: 'BUILDER',
        linkedMessages: [
          { tab: 'BUILDER', timing: 'BEFORE_REQUEST' },
          { tab: 'HELPER', timing: 'AFTER_REQUEST' },
          { tab: 'BUILDER', timing: 'AFTER_REQUEST' },
        ],
      },
    })
    expect(resolution).not.toHaveProperty('rationale')

    // The Decision Episode now holds the linked messages and Agent replies in activity order.
    const episode = harness.storage.repository
      .readRecentEpisodeHistoryForProject(ids.project, 20)
      .find((history) => history.episode.decisionId === decisionId)
    expect(episode?.episode.status).toBe('PENDING_ANALYSIS')
    const kinds = episode?.events.map((event) => event.payload.type)
    expect(kinds).toEqual([
      'USER_MESSAGE',
      'DECISION_REQUESTED',
      'BUILDER_CHAT_TURN',
      'USER_MESSAGE',
      'HELPER_RESPONSE',
      'USER_MESSAGE',
      'DECISION_RESOLVED',
    ])
    const sequences = episode?.events.map((event) => event.sequence) ?? []
    expect([...sequences].sort((left, right) => left - right)).toEqual(sequences)
    expect(
      episode?.events.find((event) => event.payload.type === 'BUILDER_CHAT_TURN')?.actor,
    ).toEqual({ kind: 'AGENT', role: 'BUILDER' })

    const progress = await harness.check()
    expect(progress).toMatchObject({
      success: true,
      data: { openChoices: [{ state: 'CHOSEN', chosenNumber: 1 }] },
    })
  })

  it('records nothing until the learner answers in the Builder tab after the question', async () => {
    const harness = await createHarness()
    await harness.say('1번으로 할 생각이야')
    await askedId(harness)
    await harness.askHelper('1번으로 할래', 'Builder 탭에 말해 주세요.')
    const early = await harness.save({ choice: 1 })
    expect(early).toMatchObject({
      success: false,
      error: { code: 'CHAT_DECISION_NO_LEARNER_REPLY' },
    })
    expect(harness.aggregate().decisionResolutions).toHaveLength(0)
  })

  it('rejects only a record that contradicts a plain numbered answer', async () => {
    const plain = await createHarness()
    await askedId(plain)
    await plain.say('1번')
    expect(await plain.save({ choice: 2 })).toMatchObject({
      success: false,
      error: { code: 'CHAT_DECISION_CONTRADICTS_EXPLICIT_CHOICE' },
    })
    expect(await plain.save({ choice: 1 })).toMatchObject({ success: true })

    for (const reply of [
      '1번보다 2번이 낫네 아닌가 1번이 나은가? 아니다 2번이 낫네',
      '1번은 별로야',
      '1번 말고',
    ]) {
      const harness = await createHarness()
      await askedId(harness)
      await harness.say(reply)
      expect(await harness.save({ choice: 2 }), reply).toMatchObject({
        success: true,
        data: { outcome: 'SAVED', chosen: { number: 2 } },
      })
    }

    const custom = await createHarness()
    await askedId(custom)
    await custom.say('둘 다 말고, 기본은 본인만 보이고 고른 메모만 공유 링크로 열면?')
    await custom.say('응')
    expect(
      await custom.save({ choice: 'custom', customSummary: 'Private by default, share links.' }),
    ).toMatchObject({ success: true, data: { chosen: { custom: true } } })
    expect(custom.aggregate().decisionResolutions[0]).toMatchObject({
      selectionKind: 'CUSTOM',
      customProposal: '응',
      chatSource: { builderSummary: 'Private by default, share links.' },
    })
  })

  it('records a changed choice as a new Decision and keeps the first one as history', async () => {
    const harness = await createHarness()
    const first = await askedId(harness)
    await harness.say('1번')
    expect(await harness.save({ choice: 1 })).toMatchObject({ success: true })
    // Without a new learner message there is nothing to change.
    expect(await harness.save({ choice: 2 })).toMatchObject({
      success: false,
      error: { code: 'CHAT_DECISION_NO_LEARNER_REPLY' },
    })

    await harness.say('아 공개 필드로 바꿀래, 나중에 공유할 수도 있어서')
    const changed = await harness.save({ choice: 2, decisionId: first })
    expect(changed).toMatchObject({
      success: true,
      data: { outcome: 'CHANGED', chosen: { number: 2, label: 'A public flag' } },
    })
    if (!changed.success) return
    const replacement = (changed.data as { decisionId: string }).decisionId
    expect(replacement).not.toBe(first)
    const aggregate = harness.aggregate()
    expect(aggregate.decisionRequests.find((item) => item.id === replacement)).toMatchObject({
      replacesDecisionId: first,
      question: 'Who can read a memo?',
    })
    expect(aggregate.decisionResolutions).toHaveLength(2)
    expect(aggregate.liveContext?.activeDecisionIds).toEqual([replacement])
    // Saying the same again changes nothing, by either Decision ID.
    expect(await harness.save({ choice: 2, decisionId: first })).toMatchObject({
      success: true,
      data: { outcome: 'UNCHANGED', decisionId: replacement },
    })
    const progress = await harness.check()
    expect(progress).toMatchObject({
      success: true,
      data: { openChoices: [{ decisionId: replacement, chosenNumber: 2 }] },
    })
  })

  it('finishes only a Task whose report passes, applying every current choice', async () => {
    const harness = await createHarness()
    const first = await askedId(harness)
    expect(await harness.finish(completeReport)).toMatchObject({
      success: false,
      error: { code: 'TASK_DECISION_NOT_RESOLVED' },
    })
    await harness.say('1번')
    await harness.save({ choice: 1 })
    await harness.say('역시 2번으로 할래')
    const changed = await harness.save({ choice: 2 })
    if (!changed.success) throw new Error(JSON.stringify(changed.error))
    const replacement = (changed.data as { decisionId: string }).decisionId

    expect(await harness.finish(completeReport)).toMatchObject({
      success: false,
      error: { code: 'TASK_DECISION_APPLICATION_MISSING' },
    })
    const failing = await harness.finish({
      ...completeReport,
      acceptance: [{ key: 'valid_event', passed: false }],
      decisionsApplied: [{ decisionId: first, how: 'Added isPublic and filtered by it.' }],
    })
    expect(failing).toMatchObject({ success: false, error: { code: 'TASK_ACCEPTANCE_FAILED' } })
    // A rejected finish writes nothing; the Builder can keep working.
    expect(harness.aggregate().decisionApplications).toHaveLength(0)
    expect(harness.aggregate().liveContext?.checkpoint).not.toBe('TASK_COMPLETED')
    expect(
      await harness.finish({
        ...completeReport,
        acceptance: [{ key: 'valid_event', passed: false, changedByDecisionId: ids.decision }],
        decisionsApplied: [{ decisionId: first, how: 'Added isPublic and filtered by it.' }],
      }),
    ).toMatchObject({ success: false, error: { code: 'TASK_CRITERION_CHANGE_NOT_DECIDED' } })

    const finished = await harness.finish({
      ...completeReport,
      decisionsApplied: [{ decisionId: first, how: 'Added isPublic and filtered by it.' }],
      concepts: [
        { name: 'discriminated union', why: 'Memo events narrow on their type.' },
        { name: 'rate limiting', why: 'Not in the plan.' },
      ],
    })
    expect(finished).toMatchObject({
      success: true,
      data: { outcome: 'COMPLETED', ignoredConcepts: ['rate limiting'] },
    })
    const aggregate = harness.aggregate()
    expect(aggregate.task.status).toBe('COMPLETED')
    expect(aggregate.decisionApplications.map((item) => item.decisionId)).toEqual([replacement])
    expect(aggregate.liveContext).toMatchObject({
      checkpoint: 'TASK_COMPLETED',
      activeDecisionIds: [],
    })
    expect(aggregate.completionReport?.conceptUsage).toEqual([
      expect.objectContaining({ conceptName: 'discriminated union', scope: 'LEARNER_FOCUS' }),
    ])
    expect(await harness.finish(completeReport)).toMatchObject({
      success: true,
      data: { outcome: 'ALREADY_COMPLETED' },
    })
  })

  it('keeps asking after more than ten chosen choices wait to be built, up to a clear cap', async () => {
    // Chosen options are applied at finish (K10), so they stay active until then. A real Kiro
    // eval hit the old ten-item Live Context cap as an opaque storage failure.
    const harness = await createHarness()
    for (let index = 0; index < 30; index += 1) {
      const asked = await harness.ask({ question: `Choice ${index + 1}?` })
      expect(asked, `ask ${index + 1}`).toMatchObject({ success: true, data: { outcome: 'ASKED' } })
      await harness.say('1번')
      expect(await harness.save({ choice: 1 }), `save ${index + 1}`).toMatchObject({
        success: true,
      })
    }
    expect(harness.aggregate().liveContext?.activeDecisionIds).toHaveLength(30)
    expect(await harness.ask({ question: 'One too many?' })).toMatchObject({
      success: false,
      error: { code: 'CHAT_TOO_MANY_OPEN_CHOICES' },
    })
  })

  it('accepts a criterion the learner changed through a resolved Decision', async () => {
    const harness = await createHarness()
    const decisionId = await askedId(harness)
    await harness.say('2번')
    await harness.save({ choice: 2 })
    expect(
      await harness.finish({
        ...completeReport,
        acceptance: [{ key: 'valid_event', passed: false, changedByDecisionId: decisionId }],
        decisionsApplied: [{ decisionId, how: 'Added isPublic.' }],
      }),
    ).toMatchObject({ success: true, data: { outcome: 'COMPLETED' } })
    expect(harness.aggregate().completionReport?.acceptanceResults).toEqual([
      expect.objectContaining({ status: 'CHANGED_BY_DECISION', decisionId }),
    ])
  })
})
