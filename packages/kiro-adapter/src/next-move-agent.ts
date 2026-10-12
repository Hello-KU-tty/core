import type { ApplicationResult, NextMoveApplicationResponse } from '@vibe-helper/application'
import {
  NEXT_MOVE_CONCEPT_LIMIT,
  NEXT_MOVE_TEXT_LIMITS,
  type NextMoveContext,
  type NextMoveJob,
  type NextMoveRuntimeRequest,
  type NextMoveSemanticResult,
  nextMoveContextSchema,
  nextMoveJobSchema,
  nextMoveSemanticResultSchema,
} from '@vibe-helper/contracts'

/** The NEXT MOVE turn of `docs/agent-prompts/discovery.md` (a Discovery sub-agent, no tools). */
export const NEXT_MOVE_PROMPT_VERSION = '1.4.0' as const
export const NEXT_MOVE_PROMPT_SOURCE = 'docs/agent-prompts/discovery.md' as const

export interface NextMoveApplication {
  executeNextMove(input: unknown): Promise<ApplicationResult<NextMoveApplicationResponse>>
}

export interface NextMoveRunOptions {
  readonly runtimeHandle: string
  readonly invoke: (context: NextMoveContext) => Promise<unknown>
}

export type NextMoveRunOutcome =
  | { readonly status: 'SUCCEEDED'; readonly job: NextMoveJob }
  | { readonly status: 'RETRY_SCHEDULED' | 'FAILED' | 'SKIPPED'; readonly job: NextMoveJob }

export class NextMoveAdapterError extends Error {
  readonly code: 'INVALID_RESULT' | 'APPLICATION_ERROR' | 'TIMEOUT'

  constructor(code: NextMoveAdapterError['code'], message: string) {
    super(message)
    this.name = 'NextMoveAdapterError'
    this.code = code
  }
}

/** Exactly one JSON value or one fenced JSON block, as for the Evidence Analyst. */
/**
 * The suggestions are Agent-authored text shown in the panel. A line a little past its bound is
 * shortened with an ellipsis and extra concepts are dropped, instead of failing the attempt
 * (K17 live check). Everything else stays strict.
 */
function shortenOverlongMoves(value: unknown): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as { moves?: unknown }).moves)
  )
    return value
  const shorten = (text: unknown, max: number) =>
    typeof text === 'string' && text.trim().length > max
      ? `${text.trim().slice(0, max - 1)}…`
      : text
  return {
    ...value,
    moves: (value as { moves: unknown[] }).moves.map((move) => {
      if (typeof move !== 'object' || move === null) return move
      const item = move as Record<string, unknown>
      return {
        ...item,
        title: shorten(item.title, NEXT_MOVE_TEXT_LIMITS.title),
        summary: shorten(item.summary, NEXT_MOVE_TEXT_LIMITS.summary),
        benefit: shorten(item.benefit, NEXT_MOVE_TEXT_LIMITS.benefit),
        ...(Array.isArray(item.concepts)
          ? { concepts: item.concepts.slice(0, NEXT_MOVE_CONCEPT_LIMIT) }
          : {}),
      }
    }),
  }
}

export function parseNextMoveResult(value: unknown): NextMoveSemanticResult {
  let candidate = value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    try {
      candidate = JSON.parse(trimmed)
    } catch {
      const fenced = [...trimmed.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/gi)]
      if (fenced.length !== 1)
        throw new NextMoveAdapterError(
          'INVALID_RESULT',
          'Next Move result must contain exactly one JSON value or fenced JSON block.',
        )
      try {
        candidate = JSON.parse(fenced[0]?.[1]?.trim() ?? '')
      } catch {
        throw new NextMoveAdapterError(
          'INVALID_RESULT',
          'Next Move result fenced block is not valid JSON.',
        )
      }
    }
  }
  const parsed = nextMoveSemanticResultSchema.safeParse(shortenOverlongMoves(candidate))
  if (!parsed.success)
    throw new NextMoveAdapterError(
      'INVALID_RESULT',
      'Next Move result failed the strict suggestion contract.',
    )
  return parsed.data
}

/** The turn message: which Discovery turn this is, then Core's bounded context as JSON. */
export function createNextMoveMessage(context: NextMoveContext): string {
  return `NEXT MOVE turn. Core context:\n\n${JSON.stringify(nextMoveContextSchema.parse(context))}`
}

function unwrap<T>(result: ApplicationResult<T>): T {
  if (!result.success)
    throw new NextMoveAdapterError(
      'APPLICATION_ERROR',
      `Core rejected the Next Move operation: ${result.error.code}`,
    )
  return result.data
}

export class NextMoveJobAdapter {
  readonly #application: NextMoveApplication

  constructor(application: NextMoveApplication) {
    this.#application = application
  }

  async listPending(correlationId: string, limit = 100): Promise<readonly NextMoveJob[]> {
    return nextMoveJobSchema.array().parse(
      unwrap(
        await this.#application.executeNextMove({
          schemaVersion: 1,
          kind: 'NEXT_MOVE_LIST_PENDING',
          correlationId,
          actor: { kind: 'KIRO_ADAPTER' },
          limit,
        }),
      ),
    )
  }

  async recoverExpired(correlationId: string, limit = 100): Promise<readonly NextMoveJob[]> {
    return nextMoveJobSchema.array().parse(
      unwrap(
        await this.#application.executeNextMove({
          schemaVersion: 1,
          kind: 'NEXT_MOVE_RECOVER_EXPIRED',
          correlationId,
          actor: { kind: 'KIRO_ADAPTER' },
          limit,
        }),
      ),
    )
  }

  async runJob(pending: NextMoveJob, options: NextMoveRunOptions): Promise<NextMoveRunOutcome> {
    const claimed = await this.#job({
      ...this.#target(pending),
      kind: 'NEXT_MOVE_CLAIM_JOB',
      runtimeHandle: options.runtimeHandle,
    })
    // Core closes a job whose Task is no longer the latest one instead of running it.
    if (claimed.status !== 'RUNNING') return { status: 'SKIPPED', job: claimed }
    try {
      const context = nextMoveContextSchema.parse(
        unwrap(
          await this.#application.executeNextMove({
            ...this.#target(claimed),
            kind: 'NEXT_MOVE_GET_CONTEXT',
          }),
        ),
      )
      const raw = await this.#withSoftTimeout(options.invoke(context), claimed.timeoutMs)
      const job = await this.#job({
        ...this.#target(claimed),
        kind: 'NEXT_MOVE_SUBMIT_RESULT',
        attempt: claimed.attempt,
        promptVersion: NEXT_MOVE_PROMPT_VERSION,
        result: parseNextMoveResult(raw),
      })
      return { status: 'SUCCEEDED', job }
    } catch (error) {
      const code =
        error instanceof NextMoveAdapterError && error.code === 'TIMEOUT'
          ? 'NEXT_MOVE_TIMEOUT'
          : error instanceof NextMoveAdapterError && error.code === 'INVALID_RESULT'
            ? 'NEXT_MOVE_INVALID_RESULT'
            : 'NEXT_MOVE_RUNTIME_ERROR'
      const failed = await this.#job({
        ...this.#target(claimed),
        kind: 'NEXT_MOVE_FAIL_ATTEMPT',
        attempt: claimed.attempt,
        failure: {
          code,
          message:
            code === 'NEXT_MOVE_TIMEOUT'
              ? 'The Next Move soft deadline elapsed.'
              : code === 'NEXT_MOVE_INVALID_RESULT'
                ? 'The Next Move Agent returned an invalid result.'
                : 'The Next Move runtime failed before a result was accepted.',
          retryable: true,
        },
      })
      return { status: failed.status === 'PENDING' ? 'RETRY_SCHEDULED' : 'FAILED', job: failed }
    }
  }

  #target(job: NextMoveJob) {
    return {
      schemaVersion: 1 as const,
      correlationId: job.correlationId,
      actor: { kind: 'KIRO_ADAPTER' as const },
      projectId: job.projectId,
      nextMoveJobId: job.id,
      expectedJobRevision: job.revision,
    }
  }

  async #job(request: NextMoveRuntimeRequest): Promise<NextMoveJob> {
    return nextMoveJobSchema.parse(unwrap(await this.#application.executeNextMove(request)))
  }

  async #withSoftTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new NextMoveAdapterError('TIMEOUT', 'timeout')),
            timeoutMs,
          )
        }),
      ])
    } finally {
      if (timeout !== undefined) clearTimeout(timeout)
    }
  }
}
