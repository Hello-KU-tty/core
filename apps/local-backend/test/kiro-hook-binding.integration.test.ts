import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  utimes,
  writeFile,
} from 'node:fs/promises'
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
import {
  kiroConversationId,
  kiroSessionsDirectory,
} from '@vibe-helper/kiro-adapter/kiro-workspace-node'
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

const repository = new URL('../../../', import.meta.url).pathname

const setup = async (
  paths: { workspace?: string; homeDirectory?: string; queueFile?: string } = {},
) => {
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
    ...paths,
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

  it("adds the Builder tab's live activity to a Helper tab question, not to the Builder's own", async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'vibe-kiro-activity-')))
    const workspace = join(base, 'memo app')
    const homeDirectory = join(base, 'home')
    await mkdir(workspace)
    const builderSession = 'sess_00000000-0000-4000-8000-0000000000aa'
    const helperSession = 'sess_00000000-0000-4000-8000-0000000000bb'
    const sessions = kiroSessionsDirectory(homeDirectory, workspace)
    const writeSession = async (id: string, agentMode: string, records: unknown[]) => {
      await mkdir(join(sessions, id), { recursive: true })
      await writeFile(join(sessions, id, 'session.json'), JSON.stringify({ id, agentMode }))
      await writeFile(
        join(sessions, id, 'messages.jsonl'),
        records
          .map((payload, index) =>
            JSON.stringify({ id: `r${index}`, timestamp: `2026-10-08T17:10:0${index}Z`, payload }),
          )
          .join('\n'),
      )
    }
    await writeSession(builderSession, 'vibe', [
      { type: 'user', content: '메모 API 만들어줘' },
      { type: 'turn_start' },
      {
        type: 'assistant',
        operationType: 'Say',
        content: `메모 라우터를 ${workspace}/src/memo.ts 에 만들게요.`,
      },
      { type: 'tool_call', title: 'Write src/memo.ts', status: 'completed' },
    ])
    await writeSession(helperSession, 'vibe-helper', [{ type: 'user', content: 'x' }])
    const { binding, post, userMessages } = await setup({ workspace, homeDirectory })
    const chat = await post({
      hook_event_name: 'UserPromptSubmit',
      session_id: builderSession,
      cwd: workspace,
      prompt: '메모 API 만들어줘',
    })
    expect(await chat.json()).toMatchObject({ recorded: true })
    expect(userMessages()).toHaveLength(1)

    const question = await post({
      hook_event_name: 'UserPromptSubmit',
      session_id: helperSession,
      cwd: workspace,
      prompt: '지금 Builder가 뭐 하고 있어?',
    })
    const body = await question.json()
    expect(body.pending).toBe('HELPER_QUESTION')
    expect(body.context).toContain('지금 진행 중인 턴 포함')
    expect(body.context).toContain('Builder: 메모 라우터를 [WORKSPACE]/src/memo.ts 에 만들게요.')
    expect(body.context).toContain('도구: Write src/memo.ts (completed)')
    expect(body.context).not.toContain(workspace)
    // A Helper tab question is not general chat Evidence.
    expect(userMessages()).toHaveLength(1)

    // `/vibe-helper` inside the Builder session already has its own context.
    const inline = await post({
      hook_event_name: 'UserPromptSubmit',
      session_id: builderSession,
      cwd: workspace,
      prompt: '/vibe-helper 라우터가 뭐야?',
    })
    expect(await inline.json()).toEqual({ pending: 'HELPER_QUESTION' })
    binding.revoke()

    // After a restart the latest non-Helper session is used.
    await utimes(join(sessions, helperSession, 'messages.jsonl'), new Date(), new Date())
    const restarted = await setup({ workspace, homeDirectory })
    expect(await restarted.binding.builderActivity()).toContain('메모 API 만들어줘')
    restarted.binding.revoke()
  })

  it('records prompts queued while Core was away once and in order, then removes the queue', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vibe-kiro-queue-'))
    const queueFile = join(directory, 'hook-queue.jsonl')
    const { binding, post, userMessages } = await setup({ queueFile })
    const prompt = (deliveryId: string, text: string) => ({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'sess_queue-test',
      cwd: '/w',
      prompt: text,
      vibe_helper_delivery_id: deliveryId,
    })
    const first = randomUUID()
    const second = randomUUID()
    await writeFile(
      queueFile,
      [
        { input: prompt(first, '먼저 보낸 말') },
        { input: prompt(second, '그다음 말') },
        // The same prompt queued twice (a timed-out send that did reach Core) is recorded once.
        { input: prompt(first, '먼저 보낸 말') },
        { input: { hook_event_name: 'Stop', session_id: 'sess_queue-test', cwd: '/w' } },
        { input: { hook_event_name: 'UserPromptSubmit', session_id: 's', cwd: '/w', prompt: 'x' } },
      ]
        .map((entry) => JSON.stringify(entry))
        .concat('not json')
        .join('\n'),
      { mode: 0o600 },
    )
    expect(await binding.drainQueue()).toBe(2)
    expect(userMessages().map((event) => event.payload)).toMatchObject([
      { redactedExcerpt: '먼저 보낸 말' },
      { redactedExcerpt: '그다음 말' },
    ])
    await expect(lstat(queueFile)).rejects.toThrow()
    // The live request that Core already recorded keeps the same delivery ID: still one record.
    expect((await post(prompt(first, '먼저 보낸 말'))).status).toBe(200)
    expect(userMessages()).toHaveLength(2)

    // A queue written before the next live prompt is recorded ahead of it.
    await writeFile(
      queueFile,
      `${JSON.stringify({ input: prompt(randomUUID(), '끊긴 동안') })}\n`,
      {
        mode: 0o600,
      },
    )
    await post(prompt(randomUUID(), '다시 연결된 뒤'))
    expect(userMessages().map((event) => event.payload.redactedExcerpt)).toEqual([
      '먼저 보낸 말',
      '그다음 말',
      '끊긴 동안',
      '다시 연결된 뒤',
    ])

    // A queue other users could read is discarded without recording.
    await writeFile(queueFile, `${JSON.stringify({ input: prompt(randomUUID(), '노출') })}\n`)
    await chmod(queueFile, 0o644)
    expect(await binding.drainQueue()).toBe(0)
    await expect(lstat(queueFile)).rejects.toThrow()
    expect(userMessages()).toHaveLength(4)
    binding.revoke()
  })

  it('the hook runner queues a learner prompt it cannot deliver, and only prompts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vibe-kiro-runner-'))
    const descriptor = join(directory, 'hook.json')
    const queueFile = join(directory, 'hook-queue.jsonl')
    // A port with nothing listening: the Core this descriptor names is gone.
    const port = await new Promise<number>((done) => {
      const probe = createServer().listen(0, '127.0.0.1', () => {
        const address = probe.address()
        probe.close(() => done(typeof address === 'object' && address ? address.port : 0))
      })
    })
    await writeFile(
      descriptor,
      JSON.stringify({
        projectId: ids.project,
        taskId: ids.task,
        url: `http://127.0.0.1:${port}/hooks/kiro-${randomUUID()}`,
        authorization: `Bearer ${'a'.repeat(64)}`,
      }),
      { mode: 0o600 },
    )
    const run = (input: unknown) => {
      const child = execFile(process.execPath, [
        join(repository, 'scripts/kiro-hook.mjs'),
        descriptor,
      ])
      child.stdin?.end(JSON.stringify(input))
      return new Promise<void>((done) => child.once('exit', () => done()))
    }
    await run({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'sess_r',
      cwd: '/w',
      prompt: '첫 말',
    })
    await writeFile(descriptor, JSON.stringify({ status: 'REVOKED' }), { mode: 0o600 })
    await run({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'sess_r',
      cwd: '/w',
      prompt: '둘째 말',
    })
    await run({ hook_event_name: 'Stop', session_id: 'sess_r', cwd: '/w' })
    expect((await lstat(queueFile)).mode & 0o077).toBe(0)
    const queued = (await readFile(queueFile, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(queued.map((entry) => entry.input.prompt)).toEqual(['첫 말', '둘째 말'])
    for (const entry of queued)
      expect(entry.input.vibe_helper_delivery_id).toMatch(/^[0-9a-f-]{36}$/)

    const { binding, userMessages } = await setup({ queueFile })
    expect(await binding.drainQueue()).toBe(2)
    expect(userMessages().map((event) => event.payload.redactedExcerpt)).toEqual([
      '첫 말',
      '둘째 말',
    ])
    binding.revoke()
  })
})
