import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { ApplicationService, WorkspacePathPolicy } from '../packages/application/dist/index.js'
import { analystSemanticResultSchema } from '../packages/contracts/dist/index.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'
import { EvidenceAnalystJobAdapter } from '../packages/kiro-adapter/dist/evidence-analyst-agent.js'
import { LocalAgentHost } from '../apps/local-backend/dist/agent-host.js'

const root = await realpath(process.argv[2] ?? '')
if (
  dirname(root) !== (await realpath(tmpdir())) ||
  !/^vibe-helper-t19-discovery-[A-Za-z0-9]+$/.test(basename(root))
)
  throw new Error('SYNTHETIC_ROOT_REQUIRED')
const storage = await openSqliteStorage({ dataDirectory: join(root, 'data') })
const policy = await WorkspacePathPolicy.create(join(root, 'workspaces'))
const application = new ApplicationService({ storage, workspacePolicy: policy })
const adapter = new EvidenceAnalystJobAdapter(application)
const host = new LocalAgentHost({
  application,
  policy,
  agentRoot: join(root, 'analyst-diagnostic'),
  definitionsRoot: resolve('agents'),
  guardPath: resolve('packages/kiro-adapter/dist/builder-tool-guard-node.js'),
  executable: 'kiro-cli',
  model: 'claude-haiku-4.5',
})
host.setBaseUrl('http://127.0.0.1:1') // No MCP/tools for Analyst; never contacted.
const controller = new AbortController()
try {
  const pending = await adapter.listPending(`corr_${randomUUID()}`)
  const job = pending[0]
  if (!job) throw new Error('NO_PENDING_JOB')
  const outcome = await adapter.runJob(job, {
    runtimeHandle: `local-spike-${randomUUID()}`,
    idempotencyKey: `idem_${randomUUID()}`,
    invoke: async (context) => {
      const result = await host.invoke({
        mode: 'EVIDENCE_ANALYST',
        projectId: job.projectId,
        correlationId: job.correlationId,
        signal: controller.signal,
        onEvent: () => {},
        message: JSON.stringify(context),
      })
      let value
      try {
        value = JSON.parse(result.text.trim())
      } catch {
        const block = [...result.text.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/gi)]
        if (block.length === 1) {
          try {
            value = JSON.parse(block[0][1])
          } catch {}
        }
      }
      const check = analystSemanticResultSchema.safeParse(value)
      console.log(
        JSON.stringify({
          phase: 'ANALYST_RESPONSE',
          stopReason: result.stopReason,
          characters: result.text.length,
          valid: check.success,
          ...(check.success
            ? {}
            : {
                issues: check.error.issues.map((i) => ({ path: i.path, code: i.code })),
                contextKinds: value?.proposals
                  ?.flatMap((p) => p.contextSources ?? [])
                  .map((s) =>
                    typeof s.kind === 'string' && /^[A-Z_]{1,30}$/.test(s.kind)
                      ? s.kind
                      : 'INVALID_KIND',
                  ),
              }),
        }),
      )
      return result.text
    },
  })
  console.log(
    JSON.stringify({
      phase: 'ANALYST_FINISHED',
      status: outcome.status,
      ...('job' in outcome ? { failure: outcome.job.lastFailure?.code } : {}),
    }),
  )
  if (outcome.status !== 'SUCCEEDED') process.exitCode = 1
} finally {
  controller.abort()
  storage.close()
}
