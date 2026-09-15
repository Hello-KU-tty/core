import { fileURLToPath } from 'node:url'

import { analysisJobSchema } from '@vibe-helper/contracts'
import { describe, expect, it, vi } from 'vitest'
import {
  activityEventFixture,
  analysisJobFixture,
  analysisJobPendingFixture,
  decisionRequestFixture,
  decisionResolutionFixture,
  episodeFixture,
  ids,
} from '../../contracts/test/fixtures.js'
import {
  createEvidenceAnalystAgentDefinition,
  EVIDENCE_ANALYST_AGENT_NAME,
  EVIDENCE_ANALYST_PROMPT_SOURCE,
  EVIDENCE_ANALYST_PROMPT_VERSION,
  type EvidenceAnalystAdapterError,
  type EvidenceAnalystApplication,
  EvidenceAnalystJobAdapter,
  parseEvidenceAnalystResult,
} from '../src/evidence-analyst-agent.js'
import { loadEvidenceAnalystAgentDefinition } from '../src/evidence-analyst-prompt-node.js'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))

const emptySemanticResult = {
  schemaVersion: 1,
  episodeId: ids.episode,
  episodeRevision: 1,
  correlationId: ids.correlation,
  proposals: [],
  noEvidenceReason: 'The Episode contains no independently expressed user understanding.',
} as const

describe('Evidence Analyst adapter', () => {
  it('loads the canonical prompt as a hidden no-tool Agent definition', async () => {
    const definition = await loadEvidenceAnalystAgentDefinition(repositoryRoot)

    expect(definition).toMatchObject({
      name: EVIDENCE_ANALYST_AGENT_NAME,
      promptVersion: EVIDENCE_ANALYST_PROMPT_VERSION,
      promptSource: EVIDENCE_ANALYST_PROMPT_SOURCE,
      tools: [],
      allowedTools: [],
    })
    expect(definition.prompt).toContain('빈 `proposals`')
    expect(definition.prompt).toContain('strict JSON')
    expect(definition.prompt).toContain('미래 계획·조건부 해결책·Agent 지시는 수행이 아니다')
    expect(definition.prompt).toContain('구조화된 `USER_DECISION`')
    expect(definition.prompt).toContain('발화 시점에 아직 관찰하지 않은')
    expect(definition.prompt).toContain('일반 조건·정의나 이미 확인한 과거 관찰')
  })

  it('rejects prompt drift and non-contract semantic output', () => {
    expect(() =>
      createEvidenceAnalystAgentDefinition('# Analyst\n\n> Prompt version: `9.9.9`'),
    ).toThrowError(
      expect.objectContaining<Partial<EvidenceAnalystAdapterError>>({ code: 'INVALID_PROMPT' }),
    )
    expect(() => parseEvidenceAnalystResult('{"proposals":[]}')).toThrowError(
      expect.objectContaining<Partial<EvidenceAnalystAdapterError>>({ code: 'INVALID_RESULT' }),
    )
    expect(() =>
      parseEvidenceAnalystResult({ ...emptySemanticResult, noEvidenceReason: undefined }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_RESULT' }))
    expect(
      parseEvidenceAnalystResult(`\`\`\`json\n${JSON.stringify(emptySemanticResult)}\n\`\`\``),
    ).toEqual(emptySemanticResult)
    expect(
      parseEvidenceAnalystResult(
        `No user-authored evidence was present.\n\n\`\`\`json\n${JSON.stringify(emptySemanticResult)}\n\`\`\``,
      ),
    ).toEqual(emptySemanticResult)
    expect(() =>
      parseEvidenceAnalystResult(
        `\`\`\`json\n${JSON.stringify(emptySemanticResult)}\n\`\`\`\n\`\`\`json\n${JSON.stringify(emptySemanticResult)}\n\`\`\``,
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_RESULT' }))
  })

  it('claims a durable job, reads bounded context and submits Core-owned metadata', async () => {
    const calls: unknown[] = []
    const application: EvidenceAnalystApplication = {
      executeAgent: async (_role, input) => {
        calls.push(input)
        return {
          success: true,
          data: {
            schemaVersion: 1,
            correlationId: ids.correlation,
            episode: episodeFixture,
            events: [activityEventFixture],
            relevantLedgerEntries: [],
            analysisJob: analysisJobFixture,
            decisionContext: {
              request: decisionRequestFixture,
              resolution: decisionResolutionFixture,
            },
          },
        }
      },
      executeAnalysis: async (input) => {
        calls.push(input)
        const kind =
          typeof input === 'object' && input !== null && 'kind' in input ? input.kind : undefined
        if (kind === 'ANALYSIS_SUBMIT_RESULT') {
          return {
            success: true,
            data: {
              schemaVersion: 1,
              episodeId: ids.episode,
              episodeRevision: 1,
              correlationId: ids.correlation,
              outcomes: [],
            },
          }
        }
        return { success: true, data: analysisJobFixture }
      },
    }
    const adapter = new EvidenceAnalystJobAdapter(application)

    const claimed = await adapter.claim(analysisJobPendingFixture, 'analyst-runtime-1')
    await expect(adapter.getEpisodeContext(claimed)).resolves.toMatchObject({
      episode: { id: ids.episode },
      analysisJob: { status: 'RUNNING' },
    })
    await expect(
      adapter.submit(claimed, emptySemanticResult, ids.idempotency),
    ).resolves.toMatchObject({ outcomes: [] })
    expect(calls).toEqual([
      expect.objectContaining({
        kind: 'ANALYSIS_CLAIM_JOB',
        expectedJobRevision: 1,
        runtimeHandle: 'analyst-runtime-1',
      }),
      expect.objectContaining({
        kind: 'ANALYST_GET_EPISODE_CONTEXT',
        expectedEpisodeRevision: 1,
      }),
      expect.objectContaining({
        kind: 'ANALYSIS_SUBMIT_RESULT',
        analysisJobId: ids.analysisJob,
        expectedJobRevision: 2,
        attempt: 1,
        result: emptySemanticResult,
      }),
    ])
  })

  it('turns the 30 second soft timeout into the single automatic retry state', async () => {
    vi.useFakeTimers()
    try {
      const retryPending = analysisJobSchema.parse({
        ...analysisJobFixture,
        revision: 3,
        status: 'PENDING',
        runtimeHandle: undefined,
        deadlineAt: undefined,
        lastFailure: {
          code: 'ANALYST_TIMEOUT',
          message: 'The Evidence Analyst soft deadline elapsed.',
          retryable: true,
        },
      })
      const application: EvidenceAnalystApplication = {
        executeAgent: async () => ({
          success: true,
          data: {
            schemaVersion: 1,
            correlationId: ids.correlation,
            episode: episodeFixture,
            events: [activityEventFixture],
            relevantLedgerEntries: [],
            analysisJob: analysisJobFixture,
            decisionContext: {
              request: decisionRequestFixture,
              resolution: decisionResolutionFixture,
            },
          },
        }),
        executeAnalysis: async (input) => {
          const kind =
            typeof input === 'object' && input !== null && 'kind' in input ? input.kind : undefined
          return {
            success: true,
            data: kind === 'ANALYSIS_FAIL_ATTEMPT' ? retryPending : analysisJobFixture,
          }
        },
      }
      const adapter = new EvidenceAnalystJobAdapter(application)
      const run = adapter.runJob(analysisJobPendingFixture, {
        runtimeHandle: 'analyst-runtime-timeout',
        idempotencyKey: ids.idempotency,
        invoke: async () => new Promise<unknown>(() => undefined),
      })

      await vi.advanceTimersByTimeAsync(30_000)
      await expect(run).resolves.toMatchObject({
        status: 'RETRY_SCHEDULED',
        job: {
          status: 'PENDING',
          attempt: 1,
          lastFailure: { code: 'ANALYST_TIMEOUT', retryable: true },
        },
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('lists only strict pending jobs for the product background worker', async () => {
    const executeAnalysis = vi.fn(async () => ({
      success: true as const,
      data: [analysisJobPendingFixture],
    }))
    const adapter = new EvidenceAnalystJobAdapter({
      executeAgent: vi.fn(),
      executeAnalysis,
    })

    await expect(adapter.listPending(ids.correlation, 10)).resolves.toEqual([
      analysisJobPendingFixture,
    ])
    expect(executeAnalysis).toHaveBeenCalledWith({
      schemaVersion: 1,
      kind: 'ANALYSIS_LIST_PENDING',
      correlationId: ids.correlation,
      actor: { kind: 'KIRO_ADAPTER' },
      limit: 10,
    })
  })
})
