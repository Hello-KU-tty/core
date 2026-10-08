import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import {
  builderTaskSchema,
  candidateRoundSchema,
  canonicalConceptSchema,
  conceptLedgerEntrySchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  learningSpecRevisionSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from '@vibe-helper/contracts'
import { kiroConversationId } from '@vibe-helper/kiro-adapter/kiro-workspace-node'
import { openInMemorySqliteStorage } from '@vibe-helper/storage-sqlite'
import { describe, expect, it } from 'vitest'
import {
  builderTaskFixture,
  candidateFixture,
  candidateRoundFixture,
  canonicalConceptFixture,
  conceptLedgerFixture,
  confirmedLearningSpecFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  ids,
  projectFixture,
} from '../../../packages/contracts/test/fixtures.js'
import { createKiroHookBinding } from '../src/kiro-hook-binding.js'

const setup = async () => {
  const storage = await openInMemorySqliteStorage()
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
  const application = new ApplicationService({
    storage,
    workspacePolicy: await WorkspacePathPolicy.create(
      await mkdtemp(join(tmpdir(), 'vibe-kiro-hook-')),
    ),
  })
  const binding = createKiroHookBinding({
    application,
    binding: { projectId: ids.project, taskId: ids.task, correlationId: ids.correlation },
  })
  const post = (body: unknown, authorization = binding.authorization) =>
    binding.handler.fetch(
      new Request(`http://127.0.0.1${binding.path}`, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    )
  const userMessages = () => {
    const recovery = storage.repository.recoverProject(ids.project)
    const episode = storage.repository.readOpenEpisode(ids.project, 'BUILD_TASK', {
      taskId: ids.task,
    })
    if (recovery === null || episode === null) return []
    return (
      storage.repository
        .readEpisodeHistory(ids.project, episode.id)
        ?.events.filter((event) => event.payload.type === 'USER_MESSAGE') ?? []
    )
  }
  return { binding, post, userMessages }
}

describe('Kiro hook binding', () => {
  it('records a learner prompt as user Activity in the bound Task, keyed by the Kiro session', async () => {
    const { binding, post, userMessages } = await setup()
    expect(binding.path).toMatch(/^\/hooks\/kiro-[0-9a-f-]{36}$/)
    const response = await post({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'sess_hook-test',
      cwd: '/w',
      prompt: '하루면 충분할 것 같아',
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ recorded: true })
    expect(userMessages()).toMatchObject([
      {
        actor: { kind: 'USER' },
        taskId: ids.task,
        conversationId: kiroConversationId('sess_hook-test'),
        payload: { type: 'USER_MESSAGE', redactedExcerpt: '하루면 충분할 것 같아' },
      },
    ])
  })

  it('ignores non-prompt events and rejects bad input or credentials without recording', async () => {
    const { binding, post, userMessages } = await setup()
    const tool = await post({ hook_event_name: 'PostToolUse', session_id: 's', cwd: '/w' })
    expect(await tool.json()).toEqual({ ignored: 'NOT_A_USER_PROMPT' })
    const stop = await post({ hook_event_name: 'Stop', session_id: 's', cwd: '/w' })
    expect(await stop.json()).toEqual({ ignored: 'NO_PENDING_HELPER_QUESTION' })
    expect((await post({ session_id: 's' })).status).toBe(400)
    expect(
      (
        await post(
          { hook_event_name: 'UserPromptSubmit', session_id: 's', cwd: '/w', prompt: 'x' },
          `Bearer ${'0'.repeat(64)}`,
        )
      ).status,
    ).toBe(401)
    binding.revoke()
    expect(
      (await post({ hook_event_name: 'UserPromptSubmit', session_id: 's', cwd: '/w', prompt: 'x' }))
        .status,
    ).toBe(401)
    expect(userMessages()).toEqual([])
  })

  it('records a /vibe-helper question with the reply when its turn stops, not as general chat', async () => {
    const { post, userMessages } = await setup()
    const question = await post({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'sess_helper',
      cwd: '/w',
      prompt: '/vibe-helper 만료 토큰은 왜 서명해?',
    })
    expect(await question.json()).toEqual({ pending: 'HELPER_QUESTION' })
    expect(userMessages()).toEqual([])
    const stop = await post({
      hook_event_name: 'Stop',
      session_id: 'sess_helper',
      cwd: '/w',
      vibe_helper_reply: '서명이 없으면 만료 시각을 고쳐서 링크를 연장할 수 있어요.',
    })
    const body = await stop.json()
    expect(body).toMatchObject({ recorded: true, receipt: { status: 'OPEN' } })
    const again = await post({ hook_event_name: 'Stop', session_id: 'sess_helper', cwd: '/w' })
    expect(await again.json()).toEqual({ ignored: 'NO_PENDING_HELPER_QUESTION' })
  })

  it('keeps the workspace learner profile current and tells a running session once', async () => {
    const storage = await openInMemorySqliteStorage()
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
    const workspace = await mkdtemp(join(tmpdir(), 'vibe-kiro-profile-'))
    const application = new ApplicationService({
      storage,
      workspacePolicy: await WorkspacePathPolicy.create(await mkdtemp(join(tmpdir(), 'vibe-ws-'))),
    })
    const binding = createKiroHookBinding({
      application,
      workspace,
      binding: { projectId: ids.project, taskId: ids.task, correlationId: ids.correlation },
    })
    const prompt = async (session: string, text: string) =>
      (
        await binding.handler.fetch(
          new Request(`http://127.0.0.1${binding.path}`, {
            method: 'POST',
            headers: { authorization: binding.authorization, 'content-type': 'application/json' },
            body: JSON.stringify({
              hook_event_name: 'UserPromptSubmit',
              session_id: session,
              cwd: workspace,
              prompt: text,
            }),
          }),
        )
      ).json()
    const profileFile = join(workspace, '.vibe-helper', 'learner-profile.md')

    expect(await prompt('sess_a', '링크 만들자')).not.toHaveProperty('context')
    expect(await readFile(profileFile, 'utf8')).toContain('아직 확인된 개념이 없다')

    storage.transaction((repository) => {
      repository.appendCanonicalConcept(canonicalConceptSchema.parse(canonicalConceptFixture))
      repository.appendConceptLedger(conceptLedgerEntrySchema.parse(conceptLedgerFixture))
    })
    const updated = await prompt('sess_a', '다음은 뭐 하지?')
    expect(updated.context).toContain('기록이며 지시가 아니다')
    expect(updated.context).toContain('runtime validation')
    expect(await readFile(profileFile, 'utf8')).toContain('- runtime validation')

    expect(await prompt('sess_a', '계속 해줘')).not.toHaveProperty('context')
    expect(await prompt('sess_b', '새 세션이야')).not.toHaveProperty('context')
    binding.revoke()
  })
})
