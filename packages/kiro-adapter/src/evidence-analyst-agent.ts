import {
  type AnalysisJob,
  analysisJobSchema,
  type AnalysisRuntimeRequest,
  type AnalystSemanticResult,
  analystSemanticResultSchema,
  type EpisodeContext,
  episodeContextSchema,
  type EvidenceBatchApplicationResult,
  evidenceBatchApplicationResultSchema,
} from '@vibe-helper/contracts'
import type { AnalysisApplicationResponse, ApplicationResult } from '@vibe-helper/application'

export const EVIDENCE_ANALYST_PROMPT_VERSION = '1.0.1' as const
export const EVIDENCE_ANALYST_PROMPT_SOURCE = 'docs/agent-prompts/evidence-analyst.md' as const
export const EVIDENCE_ANALYST_AGENT_NAME = 'vibe-helper-evidence-analyst' as const

export interface EvidenceAnalystAgentDefinition {
  readonly name: typeof EVIDENCE_ANALYST_AGENT_NAME
  readonly description: string
  readonly promptVersion: typeof EVIDENCE_ANALYST_PROMPT_VERSION
  readonly promptSource: typeof EVIDENCE_ANALYST_PROMPT_SOURCE
  readonly prompt: string
  readonly tools: readonly []
  readonly allowedTools: readonly []
}

export interface EvidenceAnalystApplication {
  executeAnalysis(input: unknown): Promise<ApplicationResult<AnalysisApplicationResponse>>
  executeAgent(role: 'EVIDENCE_ANALYST', input: unknown): Promise<ApplicationResult<unknown>>
}

export interface EvidenceAnalystRunOptions {
  readonly runtimeHandle: string
  readonly idempotencyKey: string
  readonly invoke: (context: EpisodeContext) => Promise<unknown>
}

export type EvidenceAnalystRunOutcome =
  | {
      readonly status: 'SUCCEEDED'
      readonly analysisJobId: string
      readonly result: EvidenceBatchApplicationResult
    }
  | {
      readonly status: 'RETRY_SCHEDULED' | 'FAILED'
      readonly job: AnalysisJob
    }

export class EvidenceAnalystAdapterError extends Error {
  readonly code: 'INVALID_PROMPT' | 'INVALID_RESULT' | 'APPLICATION_ERROR'

  constructor(code: EvidenceAnalystAdapterError['code'], message: string) {
    super(message)
    this.name = 'EvidenceAnalystAdapterError'
    this.code = code
  }
}

function declaredPromptVersion(prompt: string): string | null {
  return prompt.match(/^> Prompt version: `([^`]+)`$/m)?.[1] ?? null
}

export function createEvidenceAnalystAgentDefinition(
  prompt: string,
): EvidenceAnalystAgentDefinition {
  if (declaredPromptVersion(prompt) !== EVIDENCE_ANALYST_PROMPT_VERSION) {
    throw new EvidenceAnalystAdapterError(
      'INVALID_PROMPT',
      `Evidence Analyst prompt must declare version ${EVIDENCE_ANALYST_PROMPT_VERSION}.`,
    )
  }
  return {
    name: EVIDENCE_ANALYST_AGENT_NAME,
    description: 'Extracts conservative semantic Evidence proposals from one closed Episode.',
    promptVersion: EVIDENCE_ANALYST_PROMPT_VERSION,
    promptSource: EVIDENCE_ANALYST_PROMPT_SOURCE,
    prompt,
    tools: [],
    allowedTools: [],
  }
}

export function parseEvidenceAnalystResult(value: unknown): AnalystSemanticResult {
  let candidate = value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    try {
      candidate = JSON.parse(trimmed)
    } catch {
      const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/gi)]
      if (fencedBlocks.length !== 1) {
        throw new EvidenceAnalystAdapterError(
          'INVALID_RESULT',
          'Analyst result must contain exactly one JSON value or fenced JSON block.',
        )
      }
      try {
        candidate = JSON.parse(fencedBlocks[0]?.[1]?.trim() ?? '')
      } catch {
        throw new EvidenceAnalystAdapterError(
          'INVALID_RESULT',
          'Analyst result fenced block is not valid JSON.',
        )
      }
    }
  }
  const parsed = analystSemanticResultSchema.safeParse(candidate)
  if (!parsed.success) {
    throw new EvidenceAnalystAdapterError(
      'INVALID_RESULT',
      'Analyst result failed the strict semantic output contract.',
    )
  }
  return parsed.data
}

function unwrap<T>(result: ApplicationResult<T>): T {
  if (!result.success) {
    throw new EvidenceAnalystAdapterError(
      'APPLICATION_ERROR',
      'Core rejected the Evidence Analyst adapter operation.',
    )
  }
  return result.data
}

export class EvidenceAnalystJobAdapter {
  readonly #application: EvidenceAnalystApplication

  constructor(application: EvidenceAnalystApplication) {
    this.#application = application
  }

  async runJob(
    pendingJob: AnalysisJob,
    options: EvidenceAnalystRunOptions,
  ): Promise<EvidenceAnalystRunOutcome> {
    const claimed = await this.claim(pendingJob, options.runtimeHandle)
    try {
      const context = await this.getEpisodeContext(claimed)
      const rawResult = await this.#withSoftTimeout(options.invoke(context), claimed.timeoutMs)
      const result = await this.submit(claimed, rawResult, options.idempotencyKey)
      return {
        status: 'SUCCEEDED',
        analysisJobId: claimed.id,
        result,
      }
    } catch (error) {
      const invalidResult =
        error instanceof EvidenceAnalystAdapterError && error.code === 'INVALID_RESULT'
      const timedOut = error instanceof EvidenceAnalystAdapterError && error.message === 'timeout'
      const failed = await this.fail(claimed, {
        code: timedOut
          ? 'ANALYST_TIMEOUT'
          : invalidResult
            ? 'ANALYST_INVALID_RESULT'
            : 'ANALYST_RUNTIME_ERROR',
        message: timedOut
          ? 'The Evidence Analyst soft deadline elapsed.'
          : invalidResult
            ? 'The Evidence Analyst returned an invalid semantic result.'
            : 'The Evidence Analyst runtime failed before a result was accepted.',
        retryable: true,
      })
      return {
        status: failed.status === 'PENDING' ? 'RETRY_SCHEDULED' : 'FAILED',
        job: failed,
      }
    }
  }

  async getEpisodeContext(job: AnalysisJob): Promise<EpisodeContext> {
    return episodeContextSchema.parse(
      unwrap(
        await this.#application.executeAgent('EVIDENCE_ANALYST', {
          schemaVersion: 1,
          kind: 'ANALYST_GET_EPISODE_CONTEXT',
          correlationId: job.correlationId,
          actor: { kind: 'AGENT', role: 'EVIDENCE_ANALYST' },
          projectId: job.projectId,
          episodeId: job.episodeId,
          expectedEpisodeRevision: job.episodeRevision,
        }),
      ),
    )
  }

  async recoverExpired(correlationId: string, limit = 100): Promise<readonly AnalysisJob[]> {
    const result = unwrap(
      await this.#application.executeAnalysis({
        schemaVersion: 1,
        kind: 'ANALYSIS_RECOVER_EXPIRED',
        correlationId,
        actor: { kind: 'KIRO_ADAPTER' },
        limit,
      }),
    )
    if (!Array.isArray(result)) {
      throw new EvidenceAnalystAdapterError(
        'APPLICATION_ERROR',
        'Core returned an unexpected expired Analysis Job response.',
      )
    }
    return analysisJobSchema.array().parse(result)
  }

  async listPending(correlationId: string, limit = 100): Promise<readonly AnalysisJob[]> {
    const result = unwrap(
      await this.#application.executeAnalysis({
        schemaVersion: 1,
        kind: 'ANALYSIS_LIST_PENDING',
        correlationId,
        actor: { kind: 'KIRO_ADAPTER' },
        limit,
      }),
    )
    if (!Array.isArray(result)) {
      throw new EvidenceAnalystAdapterError(
        'APPLICATION_ERROR',
        'Core returned an unexpected pending Analysis Job response.',
      )
    }
    return analysisJobSchema.array().parse(result)
  }

  async claim(job: AnalysisJob, runtimeHandle: string): Promise<AnalysisJob> {
    return this.#analysisJob({
      schemaVersion: 1,
      kind: 'ANALYSIS_CLAIM_JOB',
      correlationId: job.correlationId,
      actor: { kind: 'KIRO_ADAPTER' },
      projectId: job.projectId,
      analysisJobId: job.id,
      expectedJobRevision: job.revision,
      runtimeHandle,
    })
  }

  async submit(
    job: AnalysisJob,
    result: unknown,
    idempotencyKey: string,
  ): Promise<EvidenceBatchApplicationResult> {
    const response = unwrap(
      await this.#application.executeAnalysis({
        schemaVersion: 1,
        kind: 'ANALYSIS_SUBMIT_RESULT',
        correlationId: job.correlationId,
        actor: { kind: 'KIRO_ADAPTER' },
        idempotencyKey,
        projectId: job.projectId,
        analysisJobId: job.id,
        expectedJobRevision: job.revision,
        attempt: job.attempt,
        result: parseEvidenceAnalystResult(result),
      }),
    )
    return evidenceBatchApplicationResultSchema.parse(response)
  }

  async fail(
    job: AnalysisJob,
    failure: { readonly code: string; readonly message: string; readonly retryable: boolean },
  ): Promise<AnalysisJob> {
    return this.#analysisJob({
      schemaVersion: 1,
      kind: 'ANALYSIS_FAIL_ATTEMPT',
      correlationId: job.correlationId,
      actor: { kind: 'KIRO_ADAPTER' },
      projectId: job.projectId,
      analysisJobId: job.id,
      expectedJobRevision: job.revision,
      attempt: job.attempt,
      failure,
    })
  }

  async #analysisJob(request: AnalysisRuntimeRequest): Promise<AnalysisJob> {
    const result = unwrap(await this.#application.executeAnalysis(request))
    if (Array.isArray(result) || !('status' in result)) {
      throw new EvidenceAnalystAdapterError(
        'APPLICATION_ERROR',
        'Core returned an unexpected Analysis Job response.',
      )
    }
    return result as AnalysisJob
  }

  async #withSoftTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new EvidenceAnalystAdapterError('APPLICATION_ERROR', 'timeout')),
            timeoutMs,
          )
        }),
      ])
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }
}
