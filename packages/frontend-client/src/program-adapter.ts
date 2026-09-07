import { randomUUID } from 'node:crypto'
import type { LocalCoreClient } from './index.js'

/** Structural compatibility with Hello-KU-tty/program c639a59 AgentAdapter. */
export type ProgramAgentId = 'builder' | 'helper'
export type ProgramEvent =
  | { kind: 'started'; turnId: string }
  | { kind: 'message_chunk'; text: string }
  | {
      kind: 'work_item'
      item: {
        id: string
        seq: number
        itemType: 'tool_call' | 'file_change' | 'command' | 'test'
        title: string
        detail: string
        lineCount: number
        status: 'running' | 'succeeded' | 'failed'
        expanded: boolean
      }
    }
  | { kind: 'work_item_result'; itemId: string; failed: boolean }
  | { kind: 'completed' }
  | {
      kind: 'failed'
      error: {
        code: 'start_timeout' | 'stream_error' | 'stalled' | 'unavailable' | 'unknown'
        message: string
      }
    }

export class LocalProgramAdapter {
  constructor(
    readonly client: LocalCoreClient,
    readonly getProjectId: () => string,
  ) {}
  async isAvailable(agent: ProgramAgentId): Promise<boolean> {
    try {
      await this.client.health()
      const projectId = this.getProjectId()
      const s = await this.client.restoreProject(projectId)
      const runs = await this.client.listRuns(projectId)
      return (
        s.currentTask !== null &&
        (agent === 'helper' || s.currentTask.status !== 'COMPLETED') &&
        !runs.some(
          (run) => run.kind === agent.toUpperCase() && ['ACCEPTED', 'RUNNING'].includes(run.status),
        )
      )
    } catch {
      return false
    }
  }
  async startTurn(
    request: { agent: ProgramAgentId; text: string; allowWorkStream: boolean },
    onEvent: (event: ProgramEvent) => void,
  ): Promise<{ readonly turnId: string; cancel(): void }> {
    const projectId = this.getProjectId()
    const snapshot = await this.client.restoreProject(projectId)
    if (snapshot.currentTask === null)
      throw new Error('Confirm Spec and prepare a Core Task first.')
    if (!['builder', 'helper'].includes(request.agent)) throw new Error('Unknown Agent role.')
    // Display hint never chooses permissions; the explicit role determines the bounded run.
    const run = await this.client.startRun({
      projectId,
      taskId: snapshot.currentTask.id,
      message: request.text,
      idempotencyKey: `idem_${randomUUID()}`,
      ...(request.agent === 'builder'
        ? { kind: 'BUILDER', expectedTaskRevision: snapshot.currentTask.revision }
        : { kind: 'HELPER' }),
    })
    let terminal = false
    let sequence = 0
    const seen = new Set<string>()
    const emit = (event: ProgramEvent) => {
      if (terminal) return
      if (event.kind === 'completed' || event.kind === 'failed') terminal = true
      onEvent(event)
    }
    emit({ kind: 'started', turnId: run.id })
    void this.client
      .watchRun(run.id, (event) => {
        if (event.kind === 'TEXT' && event.text) emit({ kind: 'message_chunk', text: event.text })
        if (
          event.kind !== 'TOOL' ||
          request.agent !== 'builder' ||
          !request.allowWorkStream ||
          !event.update
        )
          return
        const update = event.update
        const id =
          typeof update.toolCallId === 'string' ? update.toolCallId : `tool-${event.sequence}`
        const done = update.status === 'completed' || update.status === 'failed'
        const failed = update.status === 'failed'
        const detail = JSON.stringify(update, null, 2).slice(0, 16_000)
        if (!seen.has(id) || done) {
          const resultId = seen.has(id) ? `${id}:result:${event.sequence}` : id
          const lineCount = detail.split('\n').length
          emit({
            kind: 'work_item',
            item: {
              id: resultId,
              seq: sequence++,
              itemType:
                update.kind === 'edit'
                  ? 'file_change'
                  : update.kind === 'execute'
                    ? 'command'
                    : update.kind === 'test'
                      ? 'test'
                      : 'tool_call',
              title:
                typeof update.title === 'string'
                  ? update.title
                  : done
                    ? 'Tool result'
                    : 'Tool call',
              detail,
              lineCount,
              status: done ? (failed ? 'failed' : 'succeeded') : 'running',
              expanded: lineCount <= 3,
            },
          })
          seen.add(id)
        }
        if (done) emit({ kind: 'work_item_result', itemId: id, failed })
      })
      .then((result) => {
        if (result.status === 'SUCCEEDED') emit({ kind: 'completed' })
        else
          emit({
            kind: 'failed',
            error: { code: 'stream_error', message: result.errorCode ?? result.status },
          })
      })
      .catch(() =>
        emit({
          kind: 'failed',
          error: { code: 'stream_error', message: 'CORE_STREAM_DISCONNECTED_RESTORE_PROJECT' },
        }),
      )
    return {
      turnId: run.id,
      cancel: () => {
        void this.client
          .cancelRun(run.id)
          .then(() => emit({ kind: 'failed', error: { code: 'unknown', message: 'CANCELLED' } }))
          .catch(() =>
            emit({
              kind: 'failed',
              error: { code: 'unavailable', message: 'CANCEL_FAILED_RESTORE_PROJECT' },
            }),
          )
      },
    }
  }
}
