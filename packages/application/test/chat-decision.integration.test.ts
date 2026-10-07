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
  decisionResolutionFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  ids,
  liveContextFixture,
  projectFixture,
} from '../../contracts/test/fixtures.js'
import { openInMemorySqliteStorage } from '../../storage-sqlite/src/index.js'

const chatConversationId = 'conversation_00000000-0000-4000-8000-000000000701'
const startedAt = Date.parse('2026-09-01T00:00:00.000Z')

const createHarness = async () => {
  let clock = startedAt
  let optionSequence = 0
  let generated = 700
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-chat-decision-'))
  const storage = await openInMemorySqliteStorage()
  const service = new ApplicationService({
    storage,
    workspacePolicy: await WorkspacePathPolicy.create(workspaceRoot),
    now: () => {
      clock += 1_000
      return new Date(clock)
    },
    generateId: (prefix) => {
      if (prefix === 'decision') return ids.decision
      if (prefix === 'decision_option') {
        optionSequence += 1
        return optionSequence === 1 ? ids.optionA : ids.optionB
      }
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
    repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
  })
  storage.repository.appendLiveContext({
    ...liveContextFixture,
    checkpoint: 'TASK_STARTED',
    activeDecisionIds: [],
  })
  let idempotency = 750
  const nextKey = () => {
    idempotency += 1
    return `idem_00000000-0000-4000-8000-${String(idempotency).padStart(12, '0')}`
  }
  const sendChat = (message: string) =>
    service.executeUi({
      schemaVersion: 1,
      kind: 'UI_RECORD_CHAT_MESSAGE',
      correlationId: ids.correlation,
      actor: { kind: 'UI' },
      idempotencyKey: nextKey(),
      projectId: ids.project,
      taskId: ids.task,
      conversationId: chatConversationId,
      message,
    })
  const requestDecision = () =>
    service.executeAgent('BUILDER', {
      schemaVersion: 1,
      kind: 'BUILDER_REQUEST_DECISION',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: nextKey(),
      projectId: ids.project,
      taskId: ids.task,
      expectedTaskRevision: 1,
      expectedContextVersion: 1,
      decision: {
        category: 'PRODUCT_BEHAVIOR',
        question: 'How long should a share link stay valid?',
        reasonRequiredNow: 'The link generator needs an expiry before it can be written.',
        options: [
          {
            key: 'one_hour',
            label: '1 hour',
            description: 'Short-lived links for sensitive files.',
            impacts: ['Links must be re-sent more often.'],
            tradeoffs: ['Less convenient for slow recipients.'],
          },
          {
            key: 'one_day',
            label: '24 hours',
            description: 'A full day before the link expires.',
            impacts: ['Recipients can open it within a day.'],
            tradeoffs: ['Longer exposure if the link leaks.'],
          },
        ],
        recommendedOptionKey: 'one_day',
        recommendationRationale: 'A day fits typical sharing between friends.',
        relatedConceptNames: ['link expiry'],
        sourceReferences: [],
        independentWorkCanContinue: true,
      },
      context: {
        stage: 'Writing the link generator',
        currentGoal: 'Generate expiring share links.',
        recentChanges: ['Identified the expiry Decision.'],
        activeConceptNames: ['link expiry'],
        relatedFiles: [],
        nextActions: ['Implement expiry after the learner decides.'],
      },
    })
  const resolveFromChat = (input: Record<string, unknown>) =>
    service.executeAgent('BUILDER', {
      schemaVersion: 1,
      kind: 'BUILDER_RESOLVE_DECISION_FROM_CHAT',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'BUILDER' },
      idempotencyKey: nextKey(),
      projectId: ids.project,
      taskId: ids.task,
      decisionId: ids.decision,
      ...input,
    })
  return { service, storage, sendChat, requestDecision, resolveFromChat }
}

const resolutionOf = (storage: Awaited<ReturnType<typeof openInMemorySqliteStorage>>) =>
  storage.repository
    .readBuilderTaskAggregate(ids.project, ids.task)
    ?.decisionResolutions.find((resolution) => resolution.decisionId === ids.decision)

describe('Kiro-native chat Evidence and chat Decision resolution', () => {
  it('stores host chat messages as user Activity in the build Episode, then in the single open Decision Episode', async () => {
    const { storage, sendChat, requestDecision } = await createHarness()

    const before = await sendChat('공유 링크 기능부터 만들어 보자')
    if (!before.success) throw new Error(JSON.stringify(before.error))
    expect(before.data).toMatchObject({ episode: { type: 'BUILD_TASK' } })
    expect(before.data).not.toHaveProperty('episode.decisionId')

    expect(await requestDecision()).toMatchObject({ success: true })
    const during = await sendChat('하루면 충분할 것 같아')
    if (!during.success) throw new Error(JSON.stringify(during.error))
    expect(during.data).toMatchObject({ episode: { type: 'DECISION', decisionId: ids.decision } })

    if (!('episode' in during.data) || during.data.episode === undefined) {
      throw new Error('missing episode')
    }
    const history = storage.repository.readEpisodeHistory(ids.project, during.data.episode.id)
    const userEvent = history?.events.find((event) => event.payload.type === 'USER_MESSAGE')
    expect(userEvent).toMatchObject({
      actor: { kind: 'USER' },
      decisionId: ids.decision,
      conversationId: chatConversationId,
      payload: { type: 'USER_MESSAGE', redactedExcerpt: '하루면 충분할 것 같아' },
    })
  })

  it('accepts a natural-language choice only through verbatim learner quotes and keeps the rationale as the learner wrote it', async () => {
    const { storage, sendChat, requestDecision, resolveFromChat } = await createHarness()
    expect(await requestDecision()).toMatchObject({ success: true })
    expect(await sendChat('음 그 차이가 뭐야?')).toMatchObject({ success: true })
    expect(
      await sendChat('그럼 하루짜리로 하자. 친구들이 보통 그날 안에는 열어보니까'),
    ).toMatchObject({ success: true })

    const result = await resolveFromChat({
      selection: { kind: 'OPTION', optionNumber: 2 },
      citedUserMessages: [{ quote: '그럼 하루짜리로 하자' }],
      rationaleQuote: '친구들이 보통 그날 안에는 열어보니까',
    })
    expect(result).toMatchObject({ success: true, data: { decisionId: ids.decision } })
    const resolution = resolutionOf(storage)
    expect(resolution).toMatchObject({
      selectionKind: 'OPTION',
      selectedOptionId: ids.optionB,
      rationale: '친구들이 보통 그날 안에는 열어보니까',
      source: { kind: 'USER' },
      chatSource: { mappedBy: 'BUILDER', userMessageIds: [expect.any(String)] },
    })
    const decisionEpisode = storage.repository.readOpenEpisode(ids.project, 'DECISION', {
      decisionId: ids.decision,
    })
    expect(decisionEpisode).toBeNull()
  })

  it('rejects quotes that are not in a learner message, including the Agent question text', async () => {
    const { storage, sendChat, requestDecision, resolveFromChat } = await createHarness()
    expect(await requestDecision()).toMatchObject({ success: true })
    expect(await sendChat('24시간으로 하자')).toMatchObject({ success: true })

    for (const quote of ['24시간이 좋겠다', 'A day fits typical sharing between friends.']) {
      expect(
        await resolveFromChat({
          selection: { kind: 'OPTION', optionNumber: 2 },
          citedUserMessages: [{ quote }],
        }),
      ).toMatchObject({ success: false, error: { code: 'CHAT_DECISION_QUOTE_NOT_FOUND' } })
    }
    expect(resolutionOf(storage)).toBeUndefined()
  })

  it('rejects a learner message sent before the Decision was requested', async () => {
    const { storage, sendChat, requestDecision, resolveFromChat } = await createHarness()
    expect(await sendChat('링크는 1시간이면 될 듯')).toMatchObject({ success: true })
    expect(await requestDecision()).toMatchObject({ success: true })

    expect(
      await resolveFromChat({
        selection: { kind: 'OPTION', optionNumber: 1 },
        citedUserMessages: [{ quote: '1시간이면 될 듯' }],
      }),
    ).toMatchObject({ success: false, error: { code: 'CHAT_DECISION_QUOTE_NOT_FOUND' } })
    expect(resolutionOf(storage)).toBeUndefined()
  })

  it('rejects a mapping that contradicts the single option number the learner named', async () => {
    const { storage, sendChat, requestDecision, resolveFromChat } = await createHarness()
    expect(await requestDecision()).toMatchObject({ success: true })
    expect(await sendChat('2시간(1번)으로 할게. 민감한 파일이 많아서')).toMatchObject({
      success: true,
    })

    expect(
      await resolveFromChat({
        selection: { kind: 'OPTION', optionNumber: 2 },
        citedUserMessages: [{ quote: '2시간(1번)으로 할게' }],
      }),
    ).toMatchObject({
      success: false,
      error: { code: 'CHAT_DECISION_CONTRADICTS_EXPLICIT_CHOICE' },
    })
    expect(resolutionOf(storage)).toBeUndefined()

    expect(
      await resolveFromChat({
        selection: { kind: 'OPTION', optionNumber: 1 },
        citedUserMessages: [{ quote: '2시간(1번)으로 할게' }],
        rationaleQuote: '민감한 파일이 많아서',
      }),
    ).toMatchObject({ success: true })
    expect(resolutionOf(storage)).toMatchObject({ selectedOptionId: ids.optionA })
  })

  it('requires rationale and custom proposals to be quoted from the cited learner messages', async () => {
    const { storage, sendChat, requestDecision, resolveFromChat } = await createHarness()
    expect(await requestDecision()).toMatchObject({ success: true })
    expect(await sendChat('다운로드 한 번 하면 바로 만료되게 해줘')).toMatchObject({
      success: true,
    })

    expect(
      await resolveFromChat({
        selection: { kind: 'CUSTOM', proposalQuote: '다운로드 한 번 하면 바로 만료되게' },
        citedUserMessages: [{ quote: '다운로드 한 번 하면 바로 만료되게 해줘' }],
        rationaleQuote: '보안이 중요해서',
      }),
    ).toMatchObject({ success: false, error: { code: 'CHAT_DECISION_RATIONALE_NOT_QUOTED' } })
    expect(
      await resolveFromChat({
        selection: { kind: 'CUSTOM', proposalQuote: '한 번만 열리는 링크' },
        citedUserMessages: [{ quote: '다운로드 한 번 하면 바로 만료되게 해줘' }],
      }),
    ).toMatchObject({ success: false, error: { code: 'CHAT_DECISION_PROPOSAL_NOT_QUOTED' } })
    expect(resolutionOf(storage)).toBeUndefined()

    expect(
      await resolveFromChat({
        selection: { kind: 'CUSTOM', proposalQuote: '다운로드 한 번 하면 바로 만료되게' },
        citedUserMessages: [{ quote: '다운로드 한 번 하면 바로 만료되게 해줘' }],
      }),
    ).toMatchObject({ success: true })
    expect(resolutionOf(storage)).toMatchObject({
      selectionKind: 'CUSTOM',
      customProposal: '다운로드 한 번 하면 바로 만료되게',
    })
  })

  it('rejects an option number the Decision does not have', async () => {
    const { storage, sendChat, requestDecision, resolveFromChat } = await createHarness()
    expect(await requestDecision()).toMatchObject({ success: true })
    expect(await sendChat('세 번째 거로 할게')).toMatchObject({ success: true })
    expect(
      await resolveFromChat({
        selection: { kind: 'OPTION', optionNumber: 3 },
        citedUserMessages: [{ quote: '세 번째 거로 할게' }],
      }),
    ).toMatchObject({ success: false, error: { code: 'CHAT_DECISION_OPTION_NOT_FOUND' } })
    expect(resolutionOf(storage)).toBeUndefined()
  })

  it('does not let the UI path claim a Builder chat mapping', async () => {
    const { service, requestDecision } = await createHarness()
    expect(await requestDecision()).toMatchObject({ success: true })
    expect(
      await service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESOLVE_DECISION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000799',
        resolution: {
          ...decisionResolutionFixture,
          chatSource: {
            mappedBy: 'BUILDER',
            userMessageIds: ['message_00000000-0000-4000-8000-000000000798'],
          },
        },
      }),
    ).toMatchObject({ success: false, error: { code: 'DECISION_CHAT_SOURCE_NOT_ALLOWED' } })
  })
})
