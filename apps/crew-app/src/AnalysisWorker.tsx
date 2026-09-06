import type {
  CrewAnalysisApplicationClient,
  CrewAgentModeClient,
} from '@vibe-helper/kiro-adapter/crew-app'
import { EvidenceAnalystJobAdapter } from '@vibe-helper/kiro-adapter/evidence-analyst'
import { useEffect } from 'react'

const POLL_INTERVAL_MS = import.meta.env.MODE === 'test' ? 250 : 2_000

function entityId(prefix: 'corr' | 'idem'): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function AnalysisWorker({
  application,
  agentClient,
}: {
  readonly application: CrewAnalysisApplicationClient
  readonly agentClient: CrewAgentModeClient
}) {
  useEffect(() => {
    const adapter = new EvidenceAnalystJobAdapter(application)
    let stopped = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const schedule = (): void => {
      if (!stopped) timer = setTimeout(() => void tick(), POLL_INTERVAL_MS)
    }
    const tick = async (): Promise<void> => {
      if (stopped || running) return
      running = true
      try {
        await adapter.recoverExpired(entityId('corr'))
        const pending = await adapter.listPending(entityId('corr'), 10)
        const job = pending[0]
        if (job !== undefined) {
          await adapter.runJob(job, {
            runtimeHandle: `crew-slot:${job.id}:attempt-${String(job.attempt + 1)}`,
            idempotencyKey: entityId('idem'),
            invoke: async (context) => {
              const receipt = await agentClient.dispatchEvidenceAnalyst({
                projectId: job.projectId,
                analysisJobId: job.id,
                attempt: job.attempt + 1,
                context: JSON.stringify(context),
              })
              const completion = await receipt.completion
              if (completion.status !== 'DONE' || completion.assistantText.length === 0) {
                throw new Error('Evidence Analyst did not return a complete JSON result.')
              }
              return completion.assistantText
            },
          })
        }
      } catch {
        // Durable job state and the Evidence panel expose retryable failures. The worker stays quiet.
      } finally {
        running = false
        schedule()
      }
    }

    void tick()
    return () => {
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [agentClient, application])

  return null
}
