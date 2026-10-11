// K10 Evidence Analyst evaluation: synthetic Kiro chat Decisions recorded through the real Core
// chat commands, judged by the real Core Evidence policy. The Core part always runs. The model
// part runs only with VIBE_LIVE_ANALYST_MODEL (for example `claude-sonnet-5.5` or `auto`) and a
// logged-in kiro-cli; it spends real model credits. VIBE_LIVE_ANALYST_OUT writes the results.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  analysisJobSchema,
  builderTaskSchema,
  candidateRoundSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  type EpisodeContext,
  episodeContextSchema,
  learningSpecRevisionSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import { ApplicationService, WorkspacePathPolicy } from '../../packages/application/src/index.js'
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
} from '../../packages/contracts/test/fixtures.js'
import { loadEvidenceAnalystAgentDefinition } from '../../packages/kiro-adapter/src/evidence-analyst-prompt-node.js'
import { openInMemorySqliteStorage } from '../../packages/storage-sqlite/src/index.js'

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url))
const corpusPath = path.join(
  workspaceRoot,
  'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.1.0-k10-chat.json',
)
const STATE_RANK = { NONE: 0, EXPLAINED: 1, DEMONSTRATED: 2, TRANSFERRED: 3 } as const
type StateName = keyof typeof STATE_RANK

interface Step {
  readonly after?: 'start' | 'question' | 'choice'
  readonly tab?: 'BUILDER' | 'HELPER' | 'AGENT'
  readonly text?: string
  readonly reply?: string
  readonly save?: { readonly choice: number | 'recommended' | 'custom' }
}

interface Case {
  readonly id: string
  readonly decision: {
    readonly category: string
    readonly question: string
    readonly options: readonly { readonly label: string; readonly description: string }[]
    readonly recommended: number
  }
  readonly steps: readonly Step[]
  readonly answer: {
    readonly choice: number | 'recommended' | 'custom'
    readonly customSummary?: string
  }
  readonly expected: {
    readonly minimumState: StateName
    readonly maximumState: StateName
    readonly misconception: boolean
  }
}

const builderConversation = 'conversation_00000000-0000-4000-8000-000000000a01'
const helperConversation = 'conversation_00000000-0000-4000-8000-000000000a02'

async function recordCase(item: Case) {
  let clock = Date.parse('2026-09-01T00:00:00.000Z')
  let generated = 0
  const storage = await openInMemorySqliteStorage()
  const service = new ApplicationService({
    storage,
    workspacePolicy: await WorkspacePathPolicy.create(
      await mkdtemp(path.join(tmpdir(), 'vibe-k10-eval-')),
    ),
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
    repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
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
  const must = async (pending: Promise<{ success: boolean; error?: unknown }>) => {
    const result = await pending
    if (!result.success) throw new Error(`${item.id}: ${JSON.stringify(result.error)}`)
    return result
  }
  const perform = async (step: Step) => {
    if (step.save !== undefined) {
      await must(
        service.executeAgent('BUILDER', {
          ...builder,
          kind: 'BUILDER_CHAT_SAVE_CHOICE',
          idempotencyKey: key(),
          answer: step.save,
        }),
      )
      return
    }
    if (step.tab === 'BUILDER')
      await must(
        service.executeUi({
          ...ui,
          kind: 'UI_RECORD_CHAT_MESSAGE',
          idempotencyKey: key(),
          projectId: ids.project,
          taskId: ids.task,
          conversationId: builderConversation,
          message: step.text,
        }),
      )
    if (step.tab === 'AGENT')
      await must(
        service.executeUi({
          ...ui,
          kind: 'UI_RECORD_BUILDER_CHAT_TURN',
          idempotencyKey: key(),
          projectId: ids.project,
          taskId: ids.task,
          conversationId: builderConversation,
          reply: step.text,
        }),
      )
    if (step.tab === 'HELPER')
      await must(
        service.executeUi({
          ...ui,
          kind: 'UI_RECORD_HELPER_EXCHANGE',
          idempotencyKey: key(),
          projectId: ids.project,
          taskId: ids.task,
          conversationId: helperConversation,
          userMessage: step.text,
          helperResponseSummary: step.reply,
          origin: 'FREE_TEXT',
          closeConversation: false,
        }),
      )
  }
  for (const step of item.steps.filter((candidate) => candidate.after === 'start'))
    await perform(step)
  await must(
    service.executeAgent('BUILDER', {
      ...builder,
      kind: 'BUILDER_CHAT_ASK_CHOICE',
      idempotencyKey: key(),
      choice: {
        ...item.decision,
        whyNow: 'The next code depends on this choice.',
        recommendationReason: 'It fits the current plan.',
        blocksWork: false,
      },
    }),
  )
  for (const step of item.steps.filter((candidate) => candidate.after !== 'start'))
    await perform(step)
  await must(
    service.executeAgent('BUILDER', {
      ...builder,
      kind: 'BUILDER_CHAT_SAVE_CHOICE',
      idempotencyKey: key(),
      answer: item.answer,
    }),
  )
  const aggregate = storage.repository.readBuilderTaskAggregate(ids.project, ids.task)
  const decision = aggregate?.decisionRequests.at(-1)
  if (decision === undefined) throw new Error(`${item.id}: no Decision`)
  const pendingResult = await service.executeAnalysis({
    schemaVersion: 1,
    kind: 'ANALYSIS_LIST_PENDING',
    correlationId: ids.correlation,
    actor: { kind: 'KIRO_ADAPTER' },
    limit: 20,
  })
  if (!pendingResult.success) throw new Error(`${item.id}: pending jobs`)
  const jobs = analysisJobSchema.array().parse(pendingResult.data)
  const job = jobs.find(
    (candidate) =>
      storage.repository.readEpisodeHistory(ids.project, candidate.episodeId)?.episode
        .decisionId === decision.id,
  )
  if (job === undefined) throw new Error(`${item.id}: no Decision analysis job`)
  const claimed = await service.executeAnalysis({
    schemaVersion: 1,
    kind: 'ANALYSIS_CLAIM_JOB',
    correlationId: ids.correlation,
    actor: { kind: 'KIRO_ADAPTER' },
    projectId: ids.project,
    analysisJobId: job.id,
    expectedJobRevision: job.revision,
    runtimeHandle: `k10-eval-${item.id}`,
  })
  if (!claimed.success) throw new Error(`${item.id}: claim`)
  const running = analysisJobSchema.parse(claimed.data)
  const contextResult = await service.executeAgent('EVIDENCE_ANALYST', {
    schemaVersion: 1,
    kind: 'ANALYST_GET_EPISODE_CONTEXT',
    correlationId: ids.correlation,
    actor: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
    projectId: ids.project,
    episodeId: running.episodeId,
    expectedEpisodeRevision: running.episodeRevision,
  })
  if (!contextResult.success) throw new Error(`${item.id}: context`)
  const context = episodeContextSchema.parse(contextResult.data)
  const submit = async (result: unknown) => {
    const submitted = await service.executeAnalysis({
      schemaVersion: 1,
      kind: 'ANALYSIS_SUBMIT_RESULT',
      correlationId: ids.correlation,
      actor: { kind: 'KIRO_ADAPTER' },
      idempotencyKey: key(),
      projectId: ids.project,
      analysisJobId: running.id,
      expectedJobRevision: running.revision,
      attempt: running.attempt,
      result,
    })
    if (!submitted.success) return { error: submitted.error }
    const outcomes = (submitted.data as { outcomes: readonly Record<string, unknown>[] }).outcomes
    // Outcomes name the accepted Evidence; its kind and state are read back from Core.
    const accepted = outcomes.flatMap((outcome) => {
      const id = outcome.acceptedEvidenceId
      const conceptId = outcome.conceptId
      if (typeof id !== 'string' || typeof conceptId !== 'string') return []
      const evidence = storage.repository
        .readEvidenceTrace(conceptId)
        ?.acceptedEvidence.find((candidate) => candidate.id === id)
      return evidence === undefined ? [] : [evidence]
    })
    return { outcomes, accepted }
  }
  return { context, submit }
}

/** The highest Concept State the Core accepted, and whether a misconception issue opened. */
function judged(
  accepted: readonly { readonly kind: string; readonly supportsState?: StateName }[],
) {
  let best: StateName = 'NONE'
  let misconception = false
  for (const evidence of accepted) {
    if (evidence.kind === 'MISCONCEPTION_SIGNAL') misconception = true
    const state = evidence.supportsState
    if (state !== undefined && STATE_RANK[state] > STATE_RANK[best]) best = state
  }
  return { best, misconception }
}

function runKiroCli(
  args: readonly string[],
  cwd: string,
): Promise<{ code: number | null; stdout: string }> {
  const executable = process.env.VIBE_KIRO_CLI ?? path.join(homedir(), '.local', 'bin', 'kiro-cli')
  return new Promise((done, fail) => {
    const child = spawn(executable, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const timer = setTimeout(() => child.kill('SIGTERM'), 300_000)
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.once('error', fail)
    child.once('close', (code) => {
      clearTimeout(timer)
      done({ code, stdout: Buffer.concat(out).toString('utf8') })
    })
  })
}

function parseAnswer(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const blocks = [...trimmed.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/gi)]
    return blocks.length === 1 ? JSON.parse(blocks[0]?.[1] ?? '') : null
  }
}

const corpus = JSON.parse(await readFile(corpusPath, 'utf8')) as {
  readonly promptVersion: string
  readonly containsPersonalData: boolean
  readonly cases: readonly Case[]
}

describe('K10 Evidence Analyst corpus (Kiro chat Decisions)', () => {
  it('records every case through the Core chat commands with the learner words linked', async () => {
    expect(corpus).toMatchObject({ promptVersion: '1.1.0', containsPersonalData: false })
    expect(corpus.cases).toHaveLength(11)
    for (const item of corpus.cases) {
      const { context, submit } = await recordCase(item)
      expect(context.episode.type, item.id).toBe('DECISION')
      const learnerWords = context.events.filter(
        (event) => event.actor.kind === 'USER' && event.payload.type === 'USER_MESSAGE',
      )
      const said = item.steps.filter(
        (step) =>
          (step.tab === 'BUILDER' || step.tab === 'HELPER') &&
          (item.id !== 'changed_choice_reason' || step.after === 'choice'),
      )
      expect(learnerWords.length, item.id).toBe(said.length)
      expect(context.decisionContext?.resolution?.chatSource?.linkedMessages?.length, item.id).toBe(
        said.length,
      )
      // An empty result is a valid submission: the Core part of the loop closes cleanly.
      const empty = await submit({
        schemaVersion: 1,
        episodeId: context.episode.id,
        episodeRevision: context.episode.revision,
        correlationId: context.correlationId,
        proposals: [],
        noEvidenceReason: 'Core-only corpus check without a model.',
      })
      expect(empty, item.id).toMatchObject({ outcomes: [] })
    }
  })

  it('scores a hand-written ideal answer through the real submit path and Core policy', async () => {
    const item = corpus.cases.find((candidate) => candidate.id === 'concept_not_named')
    if (item === undefined) throw new Error('missing case')
    const { context, submit } = await recordCase(item)
    const decisionId = context.decisionContext?.request.id
    const reply = context.events.find(
      (event) => event.actor.kind === 'USER' && event.payload.type === 'USER_MESSAGE',
    )
    if (decisionId === undefined || reply?.payload.type !== 'USER_MESSAGE')
      throw new Error('missing Decision context')
    const proposal = {
      concept: { originalExpression: '20개씩 나눠서', proposedCanonicalName: 'pagination' },
      signal: 'JUSTIFIED_DECISION',
      strength: 'STRONG',
      promptDependence: 'LIGHT_HINT',
      userEvidenceSources: [
        { kind: 'USER_DECISION', decisionId },
        {
          kind: 'USER_MESSAGE',
          conversationId: reply.payload.conversationId,
          messageId: reply.payload.messageId,
        },
      ],
      contextSources: [],
      rationale:
        'The learner tied the choice to load time as the list grows, which the options did not state.',
      maximumSupportedState: 'DEMONSTRATED',
      misconception: { action: 'NONE' },
    }
    const result = (excerpt: string) => ({
      schemaVersion: 1,
      episodeId: context.episode.id,
      episodeRevision: context.episode.revision,
      correlationId: context.correlationId,
      proposals: [{ ...proposal, redactedEvidenceExcerpt: excerpt }],
    })
    // The learner never said "pagination"; the chosen option names the Concept.
    const accepted = await submit(result('글이 수천 개 쌓이면 처음 여는 데 한참 걸릴 테니까'))
    if ('error' in accepted) throw new Error(JSON.stringify(accepted.error))
    expect(judged(accepted.accepted).best).toBe('DEMONSTRATED')
  })

  it('accepts the live answer shape that quoted a reason across two messages', async () => {
    // Sonnet 5.5 (2026-10-11) joined the earlier and the later message with " / "; each part is
    // the learner's own words, so the reason must not be dropped for its quoting form.
    const item = corpus.cases.find((candidate) => candidate.id === 'short_contextual_reference')
    if (item === undefined) throw new Error('missing case')
    const { context, submit } = await recordCase(item)
    const decisionId = context.decisionContext?.request.id
    const learner = context.events.flatMap((event) =>
      event.actor.kind === 'USER' && event.payload.type === 'USER_MESSAGE' ? [event.payload] : [],
    )
    if (decisionId === undefined || learner.length !== 2) throw new Error('missing messages')
    const accepted = await submit({
      schemaVersion: 1,
      episodeId: context.episode.id,
      episodeRevision: context.episode.revision,
      correlationId: context.correlationId,
      proposals: [
        {
          concept: {
            originalExpression: '자주 안 바뀌니까 2번',
            proposedCanonicalName: 'client caching and data freshness',
          },
          signal: 'JUSTIFIED_DECISION',
          strength: 'STRONG',
          promptDependence: 'LIGHT_HINT',
          userEvidenceSources: [
            { kind: 'USER_DECISION', decisionId },
            ...learner.map((message) => ({
              kind: 'USER_MESSAGE',
              conversationId: message.conversationId,
              messageId: message.messageId,
            })),
          ],
          contextSources: [],
          redactedEvidenceExcerpt:
            '공지사항은 하루에 한 번 바뀔까 말까야 / 아까 말한 대로 자주 안 바뀌니까 2번',
          rationale: 'The learner chose by their own update frequency, said before the question.',
          maximumSupportedState: 'DEMONSTRATED',
          misconception: { action: 'NONE' },
        },
      ],
    })
    if ('error' in accepted) throw new Error(JSON.stringify(accepted.error))
    expect(judged(accepted.accepted).best).toBe('DEMONSTRATED')
  })

  const model = process.env.VIBE_LIVE_ANALYST_MODEL
  it.skipIf(model === undefined)(
    `judges each case within the expected states (live ${model ?? 'model'})`,
    { timeout: 3_600_000 },
    async () => {
      const definition = await loadEvidenceAnalystAgentDefinition(workspaceRoot)
      expect(definition.promptVersion).toBe('1.1.0')
      const workspace = await mkdtemp(path.join(tmpdir(), 'vibe-k10-analyst-'))
      await mkdir(path.join(workspace, '.kiro', 'agents'), { recursive: true })
      const name = `${definition.name}-k10-eval`
      await writeFile(
        path.join(workspace, '.kiro', 'agents', `${name}.json`),
        `${JSON.stringify({
          name,
          description: definition.description,
          prompt: definition.prompt,
          tools: definition.tools,
          allowedTools: definition.allowedTools,
          ...(model === 'auto' ? {} : { model }),
        })}\n`,
      )
      const results: Record<string, unknown>[] = []
      const only = new Set((process.env.VIBE_LIVE_ANALYST_ONLY ?? '').split(',').filter(Boolean))
      for (const item of corpus.cases) {
        if (only.size > 0 && !only.has(item.id)) continue
        const { context, submit } = await recordCase(item)
        const turn = [
          '다음 bounded EpisodeContext를 Evidence Analyst prompt에 따라 한 번 분석하세요.',
          '다른 정보나 도구를 사용하지 말고 strict JSON 하나만 반환하세요.',
          JSON.stringify(context satisfies EpisodeContext),
        ].join('\n')
        const started = Date.now()
        const outcome = await runKiroCli(
          [
            'chat',
            '--agent',
            name,
            '--no-interactive',
            '--output-format',
            'stream-json',
            '--verbose',
            turn,
          ],
          workspace,
        )
        let answer = ''
        let credits = 0
        for (const line of outcome.stdout.split(/\r?\n/u).filter(Boolean)) {
          let event: { data?: { update?: Record<string, unknown>; meteringUsage?: unknown[] } }
          try {
            event = JSON.parse(line)
          } catch {
            continue
          }
          const update = event.data?.update as
            | { sessionUpdate?: string; content?: { type?: string; text?: string } }
            | undefined
          if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text')
            answer += update.content.text ?? ''
          for (const usage of event.data?.meteringUsage ?? [])
            credits += Number((usage as { value?: unknown }).value) || 0
        }
        let verdict: Record<string, unknown>
        try {
          const submitted = await submit(parseAnswer(answer))
          if ('error' in submitted) {
            verdict = { status: 'FAILED', failure: 'SUBMIT_REJECTED', error: submitted.error }
          } else {
            const { best, misconception } = judged(submitted.accepted)
            const inRange =
              STATE_RANK[best] >= STATE_RANK[item.expected.minimumState] &&
              STATE_RANK[best] <= STATE_RANK[item.expected.maximumState] &&
              (!item.expected.misconception || misconception)
            verdict = {
              status: inRange ? 'PASSED' : 'FAILED',
              acceptedState: best,
              misconception,
              reasonCodes: submitted.outcomes.map(
                (entry) => (entry.decision as { reasonCode?: string } | undefined)?.reasonCode,
              ),
            }
          }
        } catch (error) {
          verdict = { status: 'FAILED', failure: 'ANSWER_NOT_JSON', message: String(error) }
        }
        results.push({
          case: item.id,
          expected: item.expected,
          ...verdict,
          // Synthetic input only; the raw answer explains a Core rejection.
          ...(verdict.status === 'PASSED' ? {} : { answer: answer.slice(0, 6_000) }),
          exitCode: outcome.code,
          ms: Date.now() - started,
          credits,
        })
        if (process.env.VIBE_LIVE_ANALYST_OUT !== undefined)
          await writeFile(
            process.env.VIBE_LIVE_ANALYST_OUT,
            `${JSON.stringify({ model, promptVersion: definition.promptVersion, results }, null, 2)}\n`,
          )
      }
      const passed = results.filter((result) => result.status === 'PASSED').length
      console.log(`K10 Analyst ${model}: ${passed}/${results.length}`)
      // The verdict is recorded, not asserted: a live model run is a measurement.
      expect(results).toHaveLength(only.size > 0 ? only.size : corpus.cases.length)
    },
  )
})
