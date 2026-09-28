// Deterministic real SQLite/Application benchmark. No Agent/model calls or user data.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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
import { replaceEvidenceMethodWithBaseline } from './benchmark-reference-source.mjs'
import { requireUnusedBenchmarkReport } from './native-benchmark-prompt-metadata.mjs'

const output = process.argv[2]
if (output) await requireUnusedBenchmarkReport(resolve(output))
const currentApplicationModuleSha256 = createHash('sha256')
  .update(
    await readFile(new URL('../packages/application/dist/application-service.js', import.meta.url)),
  )
  .digest('hex')
const counts = (process.argv[3] ?? '0,10,100').split(',').map(Number)
if (counts.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 1000))
  throw new Error('BENCHMARK_CONCEPT_COUNT_INVALID')
const samples = 30
const root = await mkdtemp(join(tmpdir(), 'vibe-context-benchmark-'))
const referenceInput = process.argv[4]
const referenceRevision = /^[0-9a-f]{40}$/.test(referenceInput ?? '') ? referenceInput : undefined
const reconstructEpisodeReference = referenceInput === '--full-episode-reference'
const reconstructEvidenceReference = referenceInput === '--uncached-evidence-reference'
const evidenceReferenceRevision = '04117c520c10e732af709b0d064c020d1d001e55'
const helperHistoryCount = Number(process.argv[5] ?? 0)
const measureEvidence = process.argv[6] === '--evidence-trace'
const episodeLayout = process.argv[7] ?? 'shared'
if (!['shared', 'one-per-concept'].includes(episodeLayout))
  throw new Error('BENCHMARK_EPISODE_LAYOUT_INVALID')
if (process.argv[6] !== undefined && !measureEvidence)
  throw new Error('BENCHMARK_MEASUREMENT_MODE_INVALID')
if (!Number.isSafeInteger(helperHistoryCount) || helperHistoryCount < 0 || helperHistoryCount > 50)
  throw new Error('BENCHMARK_HELPER_HISTORY_COUNT_INVALID')
let ReferenceApplication
let referenceModule
let referenceScope
if (referenceRevision || reconstructEpisodeReference || reconstructEvidenceReference) {
  let contents
  if (referenceRevision) {
    contents = execFileSync(
      'git',
      ['show', `${referenceRevision}:packages/application/src/application-service.ts`],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    )
    referenceScope = 'APPLICATION_SOURCE_WITH_CURRENT_SQLITE_ADAPTER'
  } else {
    contents = await readFile(
      new URL('../packages/application/src/application-service.ts', import.meta.url),
      'utf8',
    )
    if (reconstructEvidenceReference) {
      const original = execFileSync(
        'git',
        ['show', `${evidenceReferenceRevision}:packages/application/src/application-service.ts`],
        { encoding: 'utf8', maxBuffer: 1024 * 1024 },
      )
      contents = replaceEvidenceMethodWithBaseline(contents, original)
      referenceScope = 'CURRENT_APPLICATION_WITH_BASELINE_EVIDENCE_METHOD'
    } else {
      const marker = '.readRecentEpisodeHistoryForProject('
      if (contents.split(marker).length !== 2) throw new Error('REFERENCE_CALLSITE_DRIFT')
      contents = contents.replace(marker, '.readRecentEpisodeAggregatesForProject(')
      referenceScope = 'CURRENT_APPLICATION_WITH_FULL_EPISODE_CALL_RECONSTRUCTED'
    }
  }
  referenceModule = join(root, 'reference-application.mjs')
  await build({
    stdin: {
      contents,
      resolveDir: resolve('packages/application/src'),
      sourcefile: 'reference-application.ts',
      loader: 'ts',
    },
    outfile: referenceModule,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
  })
} else if (referenceInput) {
  if (!referenceInput.endsWith('.mjs')) throw new Error('BENCHMARK_REFERENCE_MODULE_INVALID')
  referenceModule = resolve(referenceInput)
  referenceScope = 'FROZEN_APPLICATION_MODULE_WITH_CURRENT_SQLITE_ADAPTER'
}
if (referenceModule)
  ReferenceApplication = (await import(pathToFileURL(referenceModule).href)).ApplicationService
await build({
  entryPoints: [resolve('packages/contracts/test/fixtures.ts')],
  outfile: join(root, 'fixtures.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
})
const require = createRequire(import.meta.url)
const fixture = require(join(root, 'fixtures.cjs'))
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
const percentile = (values, fraction) =>
  values.toSorted((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]
const results = []
try {
  for (const conceptCount of counts) {
    const storage = await openInMemorySqliteStorage()
    const referenceStorage = ReferenceApplication && (await openInMemorySqliteStorage())
    try {
      for (const currentStorage of referenceStorage ? [storage, referenceStorage] : [storage]) {
        const r = currentStorage.repository
        currentStorage.transaction(() => {
          r.appendProject(fixture.projectFixture)
          r.appendDiscoverySession(fixture.discoverySessionFixture)
          r.appendCandidate(fixture.candidateFixture)
          r.appendCandidateRound(fixture.candidateRoundFixture)
          r.appendDiscoveryFeedback(fixture.discoveryFeedbackFixture)
          r.appendLearningSpec(fixture.draftLearningSpecFixture)
          r.appendLearningSpec(fixture.confirmedLearningSpecFixture)
          r.appendTask(fixture.builderTaskFixture)
          r.appendLiveContext(fixture.liveContextFixture)
          r.appendDecisionRequest(fixture.decisionRequestFixture)
          r.appendActivityEvent(fixture.activityEventFixture)
          r.appendEpisode(fixture.episodeFixture)
          for (let n = 1; n <= conceptCount; n++) {
            const suffix = 10000 + n
            const at = new Date(Date.parse(fixture.timestamp) + n * 1000).toISOString()
            const concept = {
              ...fixture.canonicalConceptFixture,
              id: id('concept', suffix),
              canonicalName: `Synthetic concept ${n}`,
            }
            const episodeId =
              episodeLayout === 'one-per-concept' ? id('episode', suffix) : fixture.ids.episode
            const proposal = {
              ...fixture.evidenceProposalFixture,
              id: id('evidence_proposal', suffix),
              episodeId,
              concept: {
                ...fixture.evidenceProposalFixture.concept,
                canonicalConceptId: concept.id,
                proposedCanonicalName: concept.canonicalName,
              },
            }
            const decision = {
              schemaVersion: 1,
              id: id('evidence_decision', suffix),
              evidenceProposalId: proposal.id,
              correlationId: fixture.ids.correlation,
              outcome: 'ACCEPTED',
              reasonCode: 'VALID_USER_EVIDENCE',
              explanation: 'Synthetic fixture only, not evidence of any real learner.',
              decidedAt: at,
              source: { kind: 'CORE' },
            }
            const evidence = {
              ...fixture.acceptedEvidenceFixture,
              id: id('evidence', suffix),
              episodeId,
              conceptId: concept.id,
              evidenceProposalId: proposal.id,
              evidenceDecisionId: decision.id,
              acceptedAt: at,
            }
            r.appendCanonicalConcept(concept)
            if (episodeLayout === 'one-per-concept') {
              const event = {
                ...fixture.activityEventFixture,
                id: id('event', suffix),
                sequence: n + 1,
                occurredAt: at,
              }
              r.appendActivityEvent(event)
              r.appendEpisode({
                ...fixture.episodeFixture,
                id: episodeId,
                eventIds: [event.id],
                endedAt: at,
                conceptCandidates: [
                  { conceptId: concept.id, originalExpression: concept.canonicalName },
                ],
              })
            }
            r.appendEvidenceProposal(proposal)
            r.appendEvidenceDecision(decision)
            r.appendAcceptedEvidence(evidence)
            r.appendConceptLedger({
              ...fixture.conceptLedgerFixture,
              id: id('concept_ledger', suffix),
              concept,
              acceptedAliases: [],
              updatedAt: at,
              state: {
                ...fixture.conceptLedgerFixture.state,
                conceptId: concept.id,
                acceptedEvidenceIds: [evidence.id],
                updatedAt: at,
              },
            })
          }
        })
      }
      const workspace = join(root, `workspace-${conceptCount}`)
      await mkdir(workspace)
      await mkdir(join(workspace, fixture.projectFixture.generatedWorkspacePath), {
        recursive: true,
      })
      let sequence = 910000
      const app = new ApplicationService({
        storage,
        workspacePolicy: await WorkspacePathPolicy.create(workspace),
        now: () => new Date('2026-09-28T00:00:00Z'),
        generateId: (prefix) => id(prefix, ++sequence),
      })
      // Both implementations use identical synthetic SQLite state and current storage adapter.
      // The reference isolates Application changes; it is not a claim about an old binary.
      let referenceSequence = 910000
      const reference =
        ReferenceApplication &&
        new ReferenceApplication({
          storage: referenceStorage,
          workspacePolicy: await WorkspacePathPolicy.create(workspace),
          now: () => new Date('2026-09-28T00:00:00Z'),
          generateId: (prefix) => id(prefix, ++referenceSequence),
        })
      const variants = reference
        ? [
            ['current', app],
            ['reference-application', reference],
          ]
        : [['current', app]]
      const metadata = {
        schemaVersion: 1,
        actor: { kind: 'UI' },
        correlationId: id('corr', 900000),
      }
      const projectId = id('project', 900000)
      for (const [, service] of variants) {
        for (let n = 1; n <= helperHistoryCount; n++) {
          const recorded = await service.executeUi({
            ...metadata,
            kind: 'UI_RECORD_HELPER_EXCHANGE',
            idempotencyKey: id('idem', 980000 + n),
            projectId: fixture.ids.project,
            taskId: fixture.ids.task,
            conversationId: id('conversation', 980000 + n),
            userMessage: `Synthetic bounded history question ${n}.`,
            helperResponseSummary: `Synthetic bounded history answer ${n}.`,
            closeConversation: true,
          })
          assert.equal(recorded.success, true)
        }
        const started = await service.executeUi({
          ...metadata,
          kind: 'UI_START_DISCOVERY',
          projectId,
          idempotencyKey: id('idem', 900000),
          input: {
            learningGoal: 'TypeScript discriminated unions for a useful local application',
            currentLevel: 'BEGINNER',
            interestAreas: [],
          },
        })
        assert.equal(started.success, true)
      }
      const request = {
        ...metadata,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        projectId,
        helperConversationLimit: 20,
      }
      const first = await app.executeUi(request)
      assert.equal(first.success, true)
      assert.equal(
        first.data.discoveryContext.personalization.basis.length,
        Math.min(5, conceptCount),
      )
      for (const phase of ['before-delivery', 'after-delivery']) {
        if (phase === 'after-delivery') {
          for (const [, service] of variants) {
            const delivered = await service.executeUi({
              ...request,
              kind: 'UI_PREPARE_DISCOVERY_AGENT_CONTEXT',
            })
            assert.equal(delivered.success, true)
          }
        }
        const measurements = new Map(
          variants.map(([name]) => [name, { timings: [], statements: [] }]),
        )
        for (let n = 0; n < samples + 5; n++) {
          for (const [name, service] of n % 2 === 0 ? variants : variants.toReversed()) {
            prepares = 0
            const began = performance.now()
            const restored = await service.executeUi(request)
            const elapsed = performance.now() - began
            assert.deepEqual(restored, first)
            if (n >= 5) {
              measurements.get(name).timings.push(elapsed)
              measurements.get(name).statements.push(prepares)
            }
          }
        }
        for (const [variant, { timings, statements }] of measurements)
          results.push({
            variant,
            conceptCount,
            phase,
            samples,
            snapshotSha256: createHash('sha256').update(JSON.stringify(first)).digest('hex'),
            medianMs: percentile(timings, 0.5),
            p95Ms: percentile(timings, 0.95),
            minMs: Math.min(...timings),
            maxMs: Math.max(...timings),
            prepareCount: [...new Set(statements)],
          })
      }
      const helperMeasurements = new Map(
        variants.map(([name]) => [name, { timings: [], statements: [] }]),
      )
      for (let n = 0; n < samples + 5; n++) {
        const request = {
          schemaVersion: 1,
          actor: { kind: 'AGENT', role: 'HELPER' },
          kind: 'HELPER_GET_CONTEXT',
          projectId: fixture.ids.project,
          taskId: fixture.ids.task,
          correlationId: id('corr', 950000 + n),
          question: `How can Synthetic concept ${conceptCount} help this task?`,
          relatedConceptNames: [],
        }
        let expected
        for (const [name, service] of n % 2 === 0 ? variants : variants.toReversed()) {
          prepares = 0
          const began = performance.now()
          const result = await service.executeAgent('HELPER', request)
          const elapsed = performance.now() - began
          assert.equal(result.success, true)
          assert.equal(
            result.data.recentEpisodes.length,
            Math.min(
              5,
              helperHistoryCount + 1 + (episodeLayout === 'one-per-concept' ? conceptCount : 0),
            ),
          )
          if (expected) assert.deepEqual(result, expected)
          expected = result
          if (n >= 5) {
            helperMeasurements.get(name).timings.push(elapsed)
            helperMeasurements.get(name).statements.push(prepares)
          }
        }
      }
      for (const [variant, { timings, statements }] of helperMeasurements)
        results.push({
          variant,
          conceptCount,
          phase: 'new-helper-turn',
          samples,
          medianMs: percentile(timings, 0.5),
          p95Ms: percentile(timings, 0.95),
          minMs: Math.min(...timings),
          maxMs: Math.max(...timings),
          prepareCount: [...new Set(statements)],
        })
      if (measureEvidence) {
        // The public full-view contract allows at most 100 Concepts. Do not
        // broaden it for a benchmark; large registries use the concept filter.
        const phases = [
          ...(conceptCount <= 100 ? ['evidence-project'] : []),
          ...(conceptCount > 0 ? ['evidence-concept'] : []),
        ]
        for (const phase of phases) {
          const evidenceRequest = {
            ...metadata,
            kind: 'UI_READ_EVIDENCE_TRACE',
            projectId: fixture.ids.project,
            ...(phase === 'evidence-concept'
              ? { conceptId: id('concept', 10000 + conceptCount) }
              : {}),
          }
          const expected = await app.executeUi(evidenceRequest)
          assert.equal(expected.success, true)
          assert.equal(
            expected.data.concepts.length,
            phase === 'evidence-concept' ? 1 : conceptCount,
          )
          const measurements = new Map(
            variants.map(([name]) => [name, { timings: [], statements: [] }]),
          )
          for (let n = 0; n < samples + 5; n++) {
            for (const [name, service] of n % 2 === 0 ? variants : variants.toReversed()) {
              prepares = 0
              const began = performance.now()
              const response = await service.executeUi(evidenceRequest)
              const elapsed = performance.now() - began
              assert.deepEqual(response, expected)
              if (n >= 5) {
                measurements.get(name).timings.push(elapsed)
                measurements.get(name).statements.push(prepares)
              }
            }
          }
          for (const [variant, { timings, statements }] of measurements)
            results.push({
              variant,
              conceptCount,
              phase,
              samples,
              responseSha256: createHash('sha256').update(JSON.stringify(expected)).digest('hex'),
              medianMs: percentile(timings, 0.5),
              p95Ms: percentile(timings, 0.95),
              minMs: Math.min(...timings),
              maxMs: Math.max(...timings),
              prepareCount: [...new Set(statements)],
            })
        }
      }
      assert.deepEqual(storage.checkIntegrity(), { quickCheck: 'ok', foreignKeyViolations: 0 })
      if (referenceStorage)
        assert.deepEqual(referenceStorage.checkIntegrity(), {
          quickCheck: 'ok',
          foreignKeyViolations: 0,
        })
    } finally {
      storage.close()
      referenceStorage?.close()
    }
  }
} finally {
  Database.prototype.prepare = originalPrepare
}
const report = {
  kind: 'SYNTHETIC_SQLITE_CORE_CONTEXT_BENCHMARK',
  node: process.version,
  at: new Date().toISOString(),
  samples,
  helperHistoryCount,
  measureEvidence,
  episodeLayout,
  currentApplicationModuleSha256,
  currentStorageModuleSha256: createHash('sha256')
    .update(
      await readFile(new URL('../packages/storage-sqlite/dist/repository.js', import.meta.url)),
    )
    .digest('hex'),
  ...(referenceModule
    ? {
        ...(referenceRevision ? { referenceRevision } : {}),
        ...(reconstructEvidenceReference ? { evidenceReferenceRevision } : {}),
        referenceScope,
        referenceModuleSha256: createHash('sha256')
          .update(await readFile(referenceModule))
          .digest('hex'),
        exactSnapshotEquality: true,
        exactHelperContextEquality: true,
        ...(measureEvidence ? { exactEvidenceTraceEquality: true } : {}),
        independentEquivalentDatabases: true,
        alternatingOrder: true,
      }
    : {}),
  results,
}
if (output)
  await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  })
console.log(JSON.stringify(report, null, 2))
