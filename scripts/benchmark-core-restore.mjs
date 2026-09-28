// Real SQLite/Application read-only restore comparison using synthetic conversations.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { ApplicationService, WorkspacePathPolicy } from '../packages/application/dist/index.js'
import { openInMemorySqliteStorage } from '../packages/storage-sqlite/dist/index.js'
import { requireUnusedBenchmarkReport } from './native-benchmark-prompt-metadata.mjs'

const output = process.argv[2]
if (output) await requireUnusedBenchmarkReport(resolve(output))
const counts = (process.argv[3] ?? '0,100,1000').split(',').map(Number)
if (counts.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 1000))
  throw new Error('BENCHMARK_CONCEPT_COUNT_INVALID')
const reconstructFullHelperReference = process.argv[4] === '--full-helper-reference'
let referencePath = process.argv[4] && !reconstructFullHelperReference && resolve(process.argv[4])
const deliveryPhase = process.argv[5] ?? 'before-delivery'
if (!['before-delivery', 'after-delivery'].includes(deliveryPhase))
  throw new Error('BENCHMARK_DELIVERY_PHASE_INVALID')
const hash = (value) => createHash('sha256').update(value).digest('hex')
const root = await mkdtemp(join(tmpdir(), 'vibe-restore-benchmark-'))
if (reconstructFullHelperReference) {
  const source = await readFile(
    new URL('../packages/application/src/application-service.ts', import.meta.url),
    'utf8',
  )
  const marker = '.readRecentHelperConversationHistoryForProject('
  if (source.split(marker).length !== 2) throw new Error('REFERENCE_CALLSITE_DRIFT')
  referencePath = join(root, 'reference-full-helper.mjs')
  await build({
    stdin: {
      contents: source.replace(marker, '.readRecentHelperConversationAggregatesForProject('),
      resolveDir: resolve('packages/application/src'),
      sourcefile: 'reference-full-helper.ts',
      loader: 'ts',
    },
    outfile: referencePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
  })
}
const ReferenceApplication =
  referencePath && (await import(pathToFileURL(referencePath).href)).ApplicationService
await build({
  entryPoints: [resolve('packages/contracts/test/fixtures.ts')],
  outfile: join(root, 'fixtures.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
})
const f = createRequire(import.meta.url)(join(root, 'fixtures.cjs'))
const Database = createRequire(new URL('../packages/storage-sqlite/package.json', import.meta.url))(
  'better-sqlite3',
)
const originalPrepare = Database.prototype.prepare
let prepares = 0
Database.prototype.prepare = function (sql) {
  prepares++
  return originalPrepare.call(this, sql)
}
const id = (prefix, n) => `${prefix}_00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const samples = 30
const results = []
const percentile = (values, p) => values.toSorted((a, b) => a - b)[Math.ceil(values.length * p) - 1]
try {
  for (const conceptCount of counts) {
    const storage = await openInMemorySqliteStorage()
    try {
      const r = storage.repository
      storage.transaction(() => {
        r.appendProject(f.projectFixture)
        r.appendDiscoverySession(f.discoverySessionFixture)
        r.appendCandidate(f.candidateFixture)
        r.appendCandidateRound(f.candidateRoundFixture)
        r.appendDiscoveryFeedback(f.discoveryFeedbackFixture)
        r.appendLearningSpec(f.draftLearningSpecFixture)
        r.appendLearningSpec(f.confirmedLearningSpecFixture)
        r.appendTask(f.builderTaskFixture)
        r.appendLiveContext(f.liveContextFixture)
        r.appendDecisionRequest(f.decisionRequestFixture)
        r.appendActivityEvent(f.activityEventFixture)
        r.appendEpisode(f.episodeFixture)
        for (let n = 1; n <= conceptCount; n++) {
          const suffix = 10000 + n
          const at = new Date(Date.parse(f.timestamp) + n * 1000).toISOString()
          const concept = {
            ...f.canonicalConceptFixture,
            id: id('concept', suffix),
            canonicalName: `Synthetic restore concept ${n}`,
          }
          const proposal = {
            ...f.evidenceProposalFixture,
            id: id('evidence_proposal', suffix),
            concept: {
              ...f.evidenceProposalFixture.concept,
              canonicalConceptId: concept.id,
              proposedCanonicalName: concept.canonicalName,
            },
          }
          const decision = {
            schemaVersion: 1,
            id: id('evidence_decision', suffix),
            evidenceProposalId: proposal.id,
            correlationId: f.ids.correlation,
            outcome: 'ACCEPTED',
            reasonCode: 'VALID_USER_EVIDENCE',
            explanation: 'Synthetic benchmark only, not human Evidence.',
            decidedAt: at,
            source: { kind: 'CORE' },
          }
          const evidence = {
            ...f.acceptedEvidenceFixture,
            id: id('evidence', suffix),
            conceptId: concept.id,
            evidenceProposalId: proposal.id,
            evidenceDecisionId: decision.id,
            acceptedAt: at,
          }
          r.appendCanonicalConcept(concept)
          r.appendEvidenceProposal(proposal)
          r.appendEvidenceDecision(decision)
          r.appendAcceptedEvidence(evidence)
          r.appendConceptLedger({
            ...f.conceptLedgerFixture,
            id: id('concept_ledger', suffix),
            concept,
            acceptedAliases: [],
            updatedAt: at,
            state: {
              ...f.conceptLedgerFixture.state,
              conceptId: concept.id,
              acceptedEvidenceIds: [evidence.id],
              updatedAt: at,
            },
          })
        }
      })
      const workspace = join(root, `workspace-${conceptCount}`)
      await mkdir(join(workspace, f.projectFixture.generatedWorkspacePath), { recursive: true })
      const workspacePolicy = await WorkspacePathPolicy.create(workspace)
      let sequence = 800000
      let timestamp = Date.parse('2026-09-28T00:00:00Z')
      const options = {
        storage,
        workspacePolicy,
        now: () => new Date(timestamp),
        generateId: (prefix) => id(prefix, ++sequence),
      }
      const app = new ApplicationService(options)
      for (let conversation = 1; conversation <= 20; conversation++) {
        timestamp += 1000
        const exchange = await app.executeUi({
          schemaVersion: 1,
          kind: 'UI_RECORD_HELPER_EXCHANGE',
          actor: { kind: 'UI' },
          correlationId: id('corr', 900000 + conversation),
          idempotencyKey: id('idem', 900000 + conversation),
          projectId: f.ids.project,
          taskId: f.ids.task,
          conversationId: id('conversation', 900000 + conversation),
          userMessage: `Synthetic restore question ${conversation}.`,
          helperResponseSummary: `Synthetic response ${conversation}; not user learning.`,
          closeConversation: false,
        })
        assert.equal(exchange.success, true)
      }
      const variants = [['current', app]]
      if (ReferenceApplication)
        variants.push(['reference-application', new ReferenceApplication(options)])
      const request = {
        schemaVersion: 1,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        actor: { kind: 'UI' },
        correlationId: id('corr', 990000),
        projectId: f.ids.project,
        helperConversationLimit: 20,
      }
      if (deliveryPhase === 'after-delivery') {
        const delivered = await app.executeUi({
          ...request,
          kind: 'UI_PREPARE_DISCOVERY_AGENT_CONTEXT',
        })
        assert.equal(delivered.success, true)
      }
      const expected = await app.executeUi(request)
      assert.equal(expected.success, true)
      assert.equal(expected.data.helperConversations.length, 20)
      const measurements = new Map(variants.map(([name]) => [name, { times: [], queries: [] }]))
      const before = storage.checkIntegrity()
      for (let iteration = 0; iteration < samples + 5; iteration++) {
        for (const [name, service] of iteration % 2 ? variants.toReversed() : variants) {
          prepares = 0
          const began = performance.now()
          const result = await service.executeUi(request)
          const elapsed = performance.now() - began
          assert.deepEqual(result, expected)
          if (iteration >= 5) {
            measurements.get(name).times.push(elapsed)
            measurements.get(name).queries.push(prepares)
          }
        }
      }
      assert.deepEqual(storage.checkIntegrity(), before)
      assert.deepEqual(before, { quickCheck: 'ok', foreignKeyViolations: 0 })
      for (const [variant, { times, queries }] of measurements)
        results.push({
          variant,
          deliveryPhase,
          conceptCount,
          helperConversationCount: 20,
          samples,
          snapshotSha256: hash(JSON.stringify(expected)),
          medianMs: percentile(times, 0.5),
          p95Ms: percentile(times, 0.95),
          minMs: Math.min(...times),
          maxMs: Math.max(...times),
          prepareCount: [...new Set(queries)],
        })
    } finally {
      storage.close()
    }
  }
} finally {
  Database.prototype.prepare = originalPrepare
}
const report = {
  kind: 'SYNTHETIC_SQLITE_RESTORE_BENCHMARK',
  at: new Date().toISOString(),
  modelCalls: 0,
  node: process.version,
  samples,
  currentApplicationModuleSha256: hash(
    await readFile(new URL('../packages/application/dist/application-service.js', import.meta.url)),
  ),
  currentStorageModuleSha256: hash(
    await readFile(new URL('../packages/storage-sqlite/dist/repository.js', import.meta.url)),
  ),
  ...(referencePath
    ? {
        referenceModuleSha256: hash(await readFile(referencePath)),
        referenceScope: reconstructFullHelperReference
          ? 'CURRENT_APPLICATION_WITH_FULL_HELPER_AGGREGATE_CALL'
          : 'FROZEN_APPLICATION_WITH_CURRENT_SQLITE_ADAPTER',
        sameDatabaseReadOnlyComparison: true,
        alternatingOrder: true,
      }
    : {}),
  exactSnapshotEquality: true,
  results,
}
if (output)
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  })
console.log(JSON.stringify(report, null, 2))
