import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  baselineResultSchema,
  builderTaskSchema,
  candidateRoundSchema,
  discoveryInputSchema,
  evaluationCriterionResultSchema,
  evaluationFixtureSchema,
  learningSpecRevisionSchema,
  liveProjectContextSchema,
  projectCandidateRevisionSchema,
  taskCompletionReportSchema,
  type EvaluationCaseResult,
} from '@vibe-helper/contracts'
import { requiredEvidenceConceptNames } from '@vibe-helper/domain'
import { describe, expect, it } from 'vitest'

import {
  createCalibrationArtifacts,
  evaluateCalibrationCase,
  evaluateCalibrationCorpus,
  loadCalibrationCases,
  loadEvaluationFixtures,
  parseEvaluationSubject,
  validateFixtureScorerCoverage,
} from './src/index.js'

const workspaceRoot = process.cwd()

async function loadInput(inputPath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(workspaceRoot, inputPath), 'utf8')) as unknown
}

function resultByFixtureSuffix(
  results: readonly EvaluationCaseResult[],
  suffix: string,
): EvaluationCaseResult {
  const result = results.find((candidate) => candidate.fixtureId.endsWith(suffix))
  if (result === undefined) throw new Error(`Missing Evaluation result ${suffix}`)
  return result
}

describe('T07 Evaluation fixture corpus', () => {
  it('keeps Campus Drop plus diverse unseen goals with and without a Personal Need', async () => {
    const fixtures = await loadEvaluationFixtures(workspaceRoot)
    const inputs = await Promise.all(fixtures.map((fixture) => loadInput(fixture.inputPath)))
    const uniqueInputs = new Map(
      fixtures.map((fixture, index) => [fixture.inputPath, inputs[index]]),
    )

    expect(fixtures).toHaveLength(11)
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length)
    expect(fixtures.some((fixture) => fixture.kind === 'GOLDEN_PATH')).toBe(true)
    expect(fixtures.filter((fixture) => fixture.kind === 'UNSEEN_DISCOVERY')).toHaveLength(3)
    expect([...uniqueInputs.values()]).toHaveLength(4)

    const parsedInputs = [...uniqueInputs.values()].map((input) =>
      discoveryInputSchema.parse(input),
    )
    expect(parsedInputs.filter((input) => input.personalNeed !== undefined)).toHaveLength(2)
    expect(parsedInputs.filter((input) => input.personalNeed === undefined)).toHaveLength(2)
    expect(parsedInputs.every((input) => !('availableTime' in input))).toBe(true)
    expect(fixtures.every((fixture) => fixture.containsPersonalData === false)).toBe(true)
  })

  it('registers an automated scorer for every automated criterion', async () => {
    const fixtures = await loadEvaluationFixtures(workspaceRoot)

    expect(fixtures.flatMap(validateFixtureScorerCoverage)).toEqual([])
  })
})

describe('T07 deterministic calibration', () => {
  it('reproduces good and deliberately bad quality cases without exact-answer scoring', async () => {
    const cases = await loadCalibrationCases(workspaceRoot)
    const first = evaluateCalibrationCorpus(cases)
    const second = evaluateCalibrationCorpus(cases)

    expect(cases).toHaveLength(8)
    expect(second).toEqual(first)
    expect(first.every((result) => result.status !== 'ERROR')).toBe(true)
    expect(resultByFixtureSuffix(first, '102').status).toBe('PASSED')
    expect(resultByFixtureSuffix(first, '105').status).toBe('FAILED')
    expect(resultByFixtureSuffix(first, '106').status).toBe('FAILED')
    expect(resultByFixtureSuffix(first, '107').status).toBe('FAILED')
    expect(resultByFixtureSuffix(first, '108').status).toBe('FAILED')
    expect(resultByFixtureSuffix(first, '109').status).toBe('PASSED')
    expect(resultByFixtureSuffix(first, '110').status).toBe('FAILED')
    expect(resultByFixtureSuffix(first, '111').status).toBe('FAILED')

    const collapsed = resultByFixtureSuffix(first, '105').criterionResults.find(
      (criterion) => criterion.criterionKey === 'no_structural_mode_collapse',
    )
    expect(collapsed?.metrics).toContainEqual(
      expect.objectContaining({ name: 'distinct structural signatures', value: 1 / 3 }),
    )

    const falseMisconception = resultByFixtureSuffix(first, '110')
    expect(
      falseMisconception.criterionResults.find(
        (criterion) => criterion.criterionKey === 'evidence_policy',
      )?.status,
    ).toBe('PASSED')
    expect(
      falseMisconception.criterionResults.find(
        (criterion) => criterion.criterionKey === 'misconception_semantics',
      )?.status,
    ).toBe('FAILED')
  })

  it('does not convert a missing semantic review into an automated pass', async () => {
    const cases = await loadCalibrationCases(workspaceRoot)
    const reviewedCase = cases.find((candidate) => candidate.fixture.id.endsWith('102'))
    if (reviewedCase === undefined) throw new Error('Missing reviewed calibration case')

    const result = evaluateCalibrationCase({ ...reviewedCase, humanReviews: new Map() })

    expect(result.status).toBe('NEEDS_REVIEW')
    expect(result.criterionResults.filter((criterion) => criterion.reviewMode === 'HUMAN')).toEqual(
      [
        expect.objectContaining({ criterionKey: 'semantic_diversity', status: 'NEEDS_REVIEW' }),
        expect.objectContaining({ criterionKey: 'concept_necessity', status: 'NEEDS_REVIEW' }),
      ],
    )
  })

  it('matches the committed, redacted calibration baseline exactly', async () => {
    const cases = await loadCalibrationCases(workspaceRoot)
    const committed = baselineResultSchema.parse(
      await loadInput('tests/eval/baselines/calibration-v1.json'),
    )
    const { run, baseline } = createCalibrationArtifacts(cases, {
      evaluationRunId: 'evaluation_run_00000000-0000-4000-8000-000000000701',
      baselineResultId: 'baseline_result_00000000-0000-4000-8000-000000000702',
      correlationId: 'corr_00000000-0000-4000-8000-000000000703',
      evaluatorVersion: '1.0.0',
      systemUnderTestVersion: '0.0.0',
      baselineName: 'T07 scorer calibration',
      baselineVersion: '1.0.0',
      startedAt: '2026-08-26T00:00:00.000Z',
      completedAt: '2026-08-26T00:00:01.000Z',
    })

    expect(run.status).toBe('COMPLETED')
    expect(run.results.some((result) => result.status === 'FAILED')).toBe(true)
    expect(baseline).toEqual(committed)
  })
})

describe('T08 Discovery Agent regression', () => {
  it('replays the redacted eight-Candidate Kiro output through strict quality scorers', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput('tests/eval/fixtures/agent-runs/discovery-agent-v1-webhook.manifest.json'),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/agent-runs/discovery-agent-v1-webhook.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput('tests/eval/fixtures/agent-runs/discovery-agent-v1-webhook.review.json'),
      )
    const result = evaluateCalibrationCase({
      fixture,
      subject,
      humanReviews: new Map(reviews.map((review) => [review.criterionKey, review])),
    })

    const round = candidateRoundSchema.parse(subject.discovery?.round)
    const candidates = subject.discovery?.candidates.map((candidate) =>
      projectCandidateRevisionSchema.parse(candidate),
    )

    expect(round.source).toEqual({ kind: 'AGENT', role: 'DISCOVERY' })
    expect(round.inputSnapshot).not.toHaveProperty('availableTime')
    expect(round.candidates).toHaveLength(8)
    expect(candidates).toHaveLength(8)
    expect(candidates?.every((candidate) => candidate.source.role === 'DISCOVERY')).toBe(true)
    expect(result.status).toBe('PASSED')
    expect(result.criterionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterionKey: 'contract_valid', status: 'PASSED' }),
        expect.objectContaining({
          criterionKey: 'no_structural_mode_collapse',
          status: 'PASSED',
        }),
        expect.objectContaining({ criterionKey: 'semantic_diversity', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'concept_necessity', status: 'PASSED' }),
      ]),
    )
  })
})

describe('T09 Learning Spec prompt regression', () => {
  it('keeps all scope boundaries while deriving required Evidence from Learner Focus only', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/learning-spec-v1.1-webhook.manifest.json',
      ),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/prompt-regressions/learning-spec-v1.1-webhook.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput(
          'tests/eval/fixtures/prompt-regressions/learning-spec-v1.1-webhook.review.json',
        ),
      )
    const result = evaluateCalibrationCase({
      fixture,
      subject,
      humanReviews: new Map(reviews.map((review) => [review.criterionKey, review])),
    })
    const spec = learningSpecRevisionSchema.parse(subject.learningSpec)

    expect(new Set(spec.scope.map((item) => item.category))).toEqual(
      new Set(['LEARNER_FOCUS', 'AGENT_SUPPORT', 'EXCLUDED']),
    )
    expect(requiredEvidenceConceptNames(spec)).toEqual([
      'discriminated union',
      'runtime validation',
    ])
    expect(result.status).toBe('PASSED')
    expect(result.criterionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterionKey: 'contract_valid', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'scope_boundaries', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'scope_appropriateness', status: 'PASSED' }),
      ]),
    )
  })
})

describe('T10 Builder prompt regression', () => {
  it('keeps Task scope, current completion Context, redaction, and no false mastery claim', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput('tests/eval/fixtures/prompt-regressions/builder-v1.0-webhook.manifest.json'),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/prompt-regressions/builder-v1.0-webhook.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput('tests/eval/fixtures/prompt-regressions/builder-v1.0-webhook.review.json'),
      )
    const result = evaluateCalibrationCase({
      fixture,
      subject,
      humanReviews: new Map(reviews.map((review) => [review.criterionKey, review])),
    })
    const task = builderTaskSchema.parse(subject.builderTask)
    const context = liveProjectContextSchema.parse(subject.liveContext)
    const report = taskCompletionReportSchema.parse(subject.completionReport)

    expect(task.expectedConcepts).toEqual(['discriminated union', 'runtime validation'])
    expect(task.excludedWork).toEqual(['Live provider credentials and hosted payload storage'])
    expect(context).toMatchObject({ checkpoint: 'TASK_COMPLETED', contextVersion: 3 })
    expect(report.conceptUsage.map((usage) => usage.scope)).toEqual([
      'LEARNER_FOCUS',
      'LEARNER_FOCUS',
      'AGENT_SUPPORT',
    ])
    expect(JSON.stringify(report)).not.toMatch(/user.*(?:learned|understands|mastered)/iu)
    expect(result.status).toBe('PASSED')
    expect(result.criterionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterionKey: 'contract_valid', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'context_fresh', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'redaction_no_leak', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'builder_semantics', status: 'PASSED' }),
      ]),
    )
  })
})
