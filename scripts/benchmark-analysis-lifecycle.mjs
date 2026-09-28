// Real SQLite/Core mutations, synthetic inputs only. No Agent or model calls.
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
assert.ok(output, 'NEW_REPORT_REQUIRED')
await requireUnusedBenchmarkReport(resolve(output))
const counts = (process.argv[3] ?? '0,100,1000').split(',').map(Number)
assert.ok(counts.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 1000))
const referenceInput = process.argv[4] ?? '--full-lifecycle-reference'
const root = await mkdtemp(join(tmpdir(), 'vibe-analysis-lifecycle-benchmark-'))
const applicationSource = await readFile('packages/application/src/application-service.ts', 'utf8')
let referenceModule
if (referenceInput === '--full-lifecycle-reference') {
  let contents = applicationSource
  for (const method of [
    'retryAnalysis',
    'recoverExpiredAnalysisJobs',
    'failAnalysisAttempt',
    'submitAnalysisResult',
    'closeEpisodeAndQueue',
  ]) {
    const startPattern = new RegExp(`^  (?:async )?#${method}\\(`, 'gm')
    const starts = [...contents.matchAll(startPattern)]
    assert.equal(starts.length, 1, `REFERENCE_METHOD_DRIFT:${method}`)
    const start = starts[0].index
    const next = /^ {2}(?:async )?#/gm
    next.lastIndex = start + starts[0][0].length
    const end = next.exec(contents)?.index
    assert.ok(end !== undefined, `REFERENCE_END_DRIFT:${method}`)
    const body = contents.slice(start, end)
    assert.equal(body.split('.readEpisodeHistory(').length, 2, `REFERENCE_CALLSITE_DRIFT:${method}`)
    contents =
      contents.slice(0, start) +
      body.replace('.readEpisodeHistory(', '.readEpisodeAggregate(') +
      contents.slice(end)
  }
  referenceModule = join(root, 'reference-application.mjs')
  await build({
    stdin: {
      contents,
      resolveDir: resolve('packages/application/src'),
      sourcefile: 'reference.ts',
      loader: 'ts',
    },
    outfile: referenceModule,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    // SQLite's transaction boundary uses instanceof for these errors. Keep the
    // same class identities as the real adapter, including negative requests.
    plugins: [
      {
        name: 'shared-application-error-identity',
        setup(build) {
          build.onResolve({ filter: /^\.\/(errors|storage-ports)\.js$/ }, (args) => {
            if (args.resolveDir !== resolve('packages/application/src')) return undefined
            return {
              path: pathToFileURL(resolve('packages/application/dist', args.path)).href,
              external: true,
            }
          })
        },
      },
    ],
  })
} else {
  assert.ok(referenceInput.endsWith('.mjs'), 'REFERENCE_MODULE_INVALID')
  referenceModule = resolve(referenceInput)
}
const ReferenceApplication = (await import(pathToFileURL(referenceModule).href)).ApplicationService
await build({
  entryPoints: ['packages/contracts/test/fixtures.ts'],
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
let lastDatabase
Database.prototype.prepare = function (sql) {
  prepares++
  lastDatabase = this
  return originalPrepare.call(this, sql)
}
const id = (prefix, n) => `${prefix}_00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const hash = (value) => createHash('sha256').update(value).digest('hex')
const percentile = (values, fraction) =>
  values.toSorted((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]
const results = []
const meta = { schemaVersion: 1, correlationId: f.ids.correlation }
const ui = { ...meta, actor: { kind: 'UI' }, projectId: f.ids.project }
const runtime = { ...meta, actor: { kind: 'KIRO_ADAPTER' } }
const snapshot = (database) =>
  database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map(({ name }) => ({
      name,
      rows: database
        .prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    }))

async function harness(App, conceptCount, workspacePolicy) {
  const storage = await openInMemorySqliteStorage()
  const database = lastDatabase
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
      const concept = {
        ...f.canonicalConceptFixture,
        id: id('concept', 10000 + n),
        canonicalName: `Synthetic concept ${n}`,
      }
      const at = new Date(Date.parse(f.timestamp) + n * 1000).toISOString()
      const proposal = {
        ...f.evidenceProposalFixture,
        id: id('evidence_proposal', 10000 + n),
        concept: {
          ...f.evidenceProposalFixture.concept,
          canonicalConceptId: concept.id,
          proposedCanonicalName: concept.canonicalName,
        },
      }
      const decision = {
        schemaVersion: 1,
        id: id('evidence_decision', 10000 + n),
        evidenceProposalId: proposal.id,
        correlationId: f.ids.correlation,
        outcome: 'ACCEPTED',
        reasonCode: 'VALID_USER_EVIDENCE',
        explanation: 'Synthetic fixture only; not real user learning.',
        decidedAt: at,
        source: { kind: 'CORE' },
      }
      const evidence = {
        ...f.acceptedEvidenceFixture,
        id: id('evidence', 10000 + n),
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
        id: id('concept_ledger', 10000 + n),
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
  let sequence = 900000
  let now = Date.parse(f.timestamp)
  const app = new App({
    storage,
    workspacePolicy,
    generateId: (prefix) => id(prefix, ++sequence),
    now: () => new Date(now),
  })
  return {
    storage,
    database,
    app,
    advance: (ms) => {
      now += ms
    },
  }
}

async function cycle(h, sample) {
  const observations = []
  const times = {}
  async function invoke(label, kind, request, success = true) {
    const beforePrepares = prepares
    const started = performance.now()
    const response = await h.app[kind](request)
    const elapsed = performance.now() - started
    const statements = prepares - beforePrepares
    assert.equal(response.success, success, `${label}:${JSON.stringify(response)}`)
    observations.push({ label, response })
    times[label] = { ms: elapsed, prepares: statements }
    return response.data
  }
  const base = 950000 + sample * 10
  const record = {
    ...ui,
    kind: 'UI_RECORD_HELPER_EXCHANGE',
    taskId: f.ids.task,
    conversationId: id('conversation', base),
    idempotencyKey: id('idem', base),
    userMessage: 'Why validate the runtime input?',
    helperResponseSummary: 'Validation rejects malformed external input.',
    origin: sample % 2 === 0 ? 'FREE_TEXT' : 'QUICK_ACTION',
    closeConversation: true,
  }
  const recorded = await invoke('closeEpisode', 'executeUi', record)
  await invoke('recordReplay', 'executeUi', record)
  let job = h.storage.repository.readAnalysisJobForEpisode(f.ids.project, recorded.episodeId)
  const jobScope = () => ({
    ...runtime,
    projectId: f.ids.project,
    analysisJobId: job.id,
    expectedJobRevision: job.revision,
  })
  const claim = async (label) => {
    job = await invoke(label, 'executeAnalysis', {
      ...jobScope(),
      kind: 'ANALYSIS_CLAIM_JOB',
      runtimeHandle: 'synthetic-lifecycle',
    })
  }
  const retry = async (label, suffix) => {
    job = await invoke(label, 'executeUi', {
      ...ui,
      kind: 'UI_RETRY_ANALYSIS',
      analysisJobId: job.id,
      expectedJobRevision: job.revision,
      idempotencyKey: id('idem', base + suffix),
    })
  }
  await claim('claimFirst')
  await invoke(
    'rejectStaleFailure',
    'executeAnalysis',
    {
      ...jobScope(),
      expectedJobRevision: job.revision - 1,
      kind: 'ANALYSIS_FAIL_ATTEMPT',
      attempt: job.attempt,
      failure: {
        code: 'ANALYST_INVALID_OUTPUT',
        message: 'Synthetic terminal failure.',
        retryable: false,
      },
    },
    false,
  )
  job = await invoke('terminalFailure', 'executeAnalysis', {
    ...jobScope(),
    kind: 'ANALYSIS_FAIL_ATTEMPT',
    attempt: job.attempt,
    failure: {
      code: 'ANALYST_INVALID_OUTPUT',
      message: 'Synthetic terminal failure.',
      retryable: false,
    },
  })
  assert.equal(job.status, 'FAILED')
  await retry('manualRetry', 1)
  await invoke(
    'rejectRunningRetry',
    'executeUi',
    {
      ...ui,
      kind: 'UI_RETRY_ANALYSIS',
      analysisJobId: job.id,
      expectedJobRevision: job.revision,
      idempotencyKey: id('idem', base + 2),
    },
    false,
  )
  for (let attempt = 1; attempt <= 2; attempt++) {
    await claim(`claimTimeout${attempt}`)
    h.advance(job.timeoutMs + 1)
    const recovered = await invoke(
      attempt === 1 ? 'recoverPending' : 'recoverTerminal',
      'executeAnalysis',
      { ...runtime, kind: 'ANALYSIS_RECOVER_EXPIRED', limit: 100 },
    )
    assert.equal(recovered.length, 1)
    job = recovered[0]
    assert.equal(job.status, attempt === 1 ? 'PENDING' : 'FAILED')
  }
  await retry('retryAfterTimeout', 3)
  await claim('claimSuccess')
  const result = {
    schemaVersion: 1,
    episodeId: job.episodeId,
    episodeRevision: job.episodeRevision,
    correlationId: job.correlationId,
    proposals: [],
    noEvidenceReason: 'A synthetic explanation request is not independent evidence.',
  }
  await invoke(
    'rejectStaleResult',
    'executeAnalysis',
    {
      ...jobScope(),
      kind: 'ANALYSIS_SUBMIT_RESULT',
      attempt: job.attempt,
      idempotencyKey: id('idem', base + 4),
      result: { ...result, episodeRevision: job.episodeRevision - 1 },
    },
    false,
  )
  await invoke('submitEmptyResult', 'executeAnalysis', {
    ...jobScope(),
    kind: 'ANALYSIS_SUBMIT_RESULT',
    attempt: job.attempt,
    idempotencyKey: id('idem', base + 5),
    result,
  })
  assert.equal(h.storage.repository.readAnalysisJob(f.ids.project, job.id).status, 'SUCCEEDED')
  assert.equal(
    h.storage.repository.readEpisodeHistory(f.ids.project, job.episodeId).episode.status,
    'ANALYZED',
  )
  return { observations, times }
}

try {
  for (const conceptCount of counts) {
    const workspace = join(root, `workspace-${conceptCount}`)
    await mkdir(join(workspace, f.projectFixture.generatedWorkspacePath), { recursive: true })
    const workspacePolicy = await WorkspacePathPolicy.create(workspace)
    const current = await harness(ApplicationService, conceptCount, workspacePolicy)
    const reference = await harness(ReferenceApplication, conceptCount, workspacePolicy)
    assert.notEqual(current.database, reference.database)
    const timings = { current: {}, reference: {} }
    try {
      assert.deepEqual(snapshot(current.database), snapshot(reference.database))
      for (let sample = 0; sample < 35; sample++) {
        const order =
          sample % 2 === 0
            ? [
                ['current', current],
                ['reference', reference],
              ]
            : [
                ['reference', reference],
                ['current', current],
              ]
        const measured = {}
        for (const [name, h] of order) measured[name] = await cycle(h, sample)
        assert.deepEqual(measured.current.observations, measured.reference.observations)
        assert.deepEqual(snapshot(current.database), snapshot(reference.database))
        if (sample >= 5)
          for (const name of ['current', 'reference'])
            for (const [label, value] of Object.entries(measured[name].times)) {
              timings[name][label] ??= []
              timings[name][label].push(value)
            }
      }
      const summarize = (rows) =>
        Object.fromEntries(
          Object.entries(rows).map(([label, values]) => [
            label,
            {
              p50Ms: percentile(
                values.map((v) => v.ms),
                0.5,
              ),
              p95Ms: percentile(
                values.map((v) => v.ms),
                0.95,
              ),
              minPrepares: Math.min(...values.map((v) => v.prepares)),
              maxPrepares: Math.max(...values.map((v) => v.prepares)),
            },
          ]),
        )
      results.push({
        conceptCount,
        observationsAndAllTablesEqual: true,
        finalDatabaseSha256: hash(JSON.stringify(snapshot(current.database))),
        integrity: [current.storage.checkIntegrity(), reference.storage.checkIntegrity()],
        current: summarize(timings.current),
        reference: summarize(timings.reference),
      })
      console.log(
        JSON.stringify({
          conceptCount,
          equality: true,
          closeEpisode: [
            results.at(-1).reference.closeEpisode.p50Ms,
            results.at(-1).current.closeEpisode.p50Ms,
          ],
          manualRetry: [
            results.at(-1).reference.manualRetry.p50Ms,
            results.at(-1).current.manualRetry.p50Ms,
          ],
        }),
      )
    } finally {
      current.storage.close()
      reference.storage.close()
    }
  }
} finally {
  Database.prototype.prepare = originalPrepare
}
await writeFile(
  resolve(output),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      scope: 'SYNTHETIC_SQLITE_APPLICATION_MUTATIONS_NO_MODELS_NO_HTTP',
      referenceScope:
        referenceInput === '--full-lifecycle-reference'
          ? 'FIVE_FULL_AGGREGATE_CALLS_RECONSTRUCTED'
          : 'FROZEN_APPLICATION_MODULE',
      samples: 30,
      warmup: 5,
      order: 'ALTERNATING',
      percentile: 'NEAREST_RANK',
      fixtureSha256: hash(await readFile('packages/contracts/test/fixtures.ts')),
      currentSourceSha256: hash(applicationSource),
      currentModuleSha256: hash(await readFile('packages/application/dist/application-service.js')),
      referenceModuleSha256: hash(await readFile(referenceModule)),
      storageModuleSha256: hash(await readFile('packages/storage-sqlite/dist/repository.js')),
      results,
    },
    null,
    2,
  ) + '\n',
  { flag: 'wx', mode: 0o600 },
)
