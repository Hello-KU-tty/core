import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  analystSemanticResultSchema,
  activityEventSchema,
  baselineResultSchema,
  builderTaskSchema,
  candidateRoundSchema,
  decisionRequestSchema,
  discoveryInputSchema,
  evaluationCriterionResultSchema,
  evaluationFixtureSchema,
  episodeSchema,
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

describe('T15 Discovery Agent v1.1.2 starter regression', () => {
  it('keeps four concise Candidates valid and diverse while deferring evaluation detail', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/discovery-v1.1.2-starter-webhook.manifest.json',
      ),
    )
    const subject = parseEvaluationSubject(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/discovery-v1.1.2-starter-webhook.json',
      ),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput(
          'tests/eval/fixtures/prompt-regressions/discovery-v1.1.2-starter-webhook.review.json',
        ),
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

    expect(round.candidates).toHaveLength(4)
    expect(candidates).toHaveLength(4)
    expect(
      candidates?.every(
        (candidate) => candidate.evaluation === undefined && candidate.risks === undefined,
      ),
    ).toBe(true)
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

describe('T15 Discovery Agent v1.1.4 ephemeral context regression', () => {
  it('stores one concise valid round without a context tool round trip', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/discovery-v1.1.4-fast-context.manifest.json',
      ),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/prompt-regressions/discovery-v1.1.4-fast-context.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput(
          'tests/eval/fixtures/prompt-regressions/discovery-v1.1.4-fast-context.review.json',
        ),
      )
    const performance = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.1.4-fast-context.performance.json',
    )) as Record<string, unknown>
    const result = evaluateCalibrationCase({
      fixture,
      subject,
      humanReviews: new Map(reviews.map((review) => [review.criterionKey, review])),
    })
    const round = candidateRoundSchema.parse(subject.discovery?.round)
    const candidates = subject.discovery?.candidates.map((candidate) =>
      projectCandidateRevisionSchema.parse(candidate),
    )

    expect(round.candidates).toHaveLength(4)
    expect(candidates).toHaveLength(4)
    expect(
      candidates?.every(
        (candidate) => candidate.evaluation === undefined && candidate.risks === undefined,
      ),
    ).toBe(true)
    expect(performance).toMatchObject({
      promptVersion: '1.1.4',
      model: 'claude-haiku-4.5',
      providedContext: true,
      candidateCount: 4,
      getContextCalls: 0,
      submitCalls: 1,
      containsPersonalData: false,
    })
    expect(performance.durableMilliseconds).toEqual(expect.any(Number))
    expect(Number(performance.durableMilliseconds)).toBeLessThan(30_000)
    expect(result.status).toBe('PASSED')
  })
})

describe('T15 Discovery Agent v1.1.5 phase split regression', () => {
  it('keeps ROUND, Core-derived MERGE and tool-first SPEC valid under the target latency budget', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/discovery-v1.1.5-fast-phases.manifest.json',
      ),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/prompt-regressions/discovery-v1.1.5-fast-phases.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput(
          'tests/eval/fixtures/prompt-regressions/discovery-v1.1.5-fast-phases.review.json',
        ),
      )
    const performance = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.1.5-fast-phases.performance.json',
    )) as {
      readonly promptVersion: string
      readonly model: string
      readonly sampleCount: number
      readonly successfulRuns: number
      readonly failedRuns: number
      readonly providedContext: boolean
      readonly contextInjectionSuccesses: number
      readonly submitSuccesses: number
      readonly containsPersonalData: boolean
      readonly phases: Readonly<
        Record<
          'initial' | 'merge' | 'spec',
          {
            readonly durableP95Milliseconds: number
            readonly interactionP95Milliseconds: number
          }
        >
      >
    }
    const result = evaluateCalibrationCase({
      fixture,
      subject,
      humanReviews: new Map(reviews.map((review) => [review.criterionKey, review])),
    })
    const round = candidateRoundSchema.parse(subject.discovery?.round)
    const candidate = projectCandidateRevisionSchema.parse(subject.discovery?.candidates[0])
    const spec = learningSpecRevisionSchema.parse(subject.learningSpec)

    expect(round.roundIndex).toBe(2)
    expect(round.appliedFeedbackIds).toHaveLength(1)
    expect(round.candidates).toEqual([{ candidateId: candidate.id, revision: 2 }])
    expect(candidate.parentRevisions).toHaveLength(2)
    expect(spec.selectedCandidate).toEqual({ candidateId: candidate.id, revision: 2 })
    expect(performance).toMatchObject({
      promptVersion: '1.1.5',
      model: 'claude-haiku-4.5',
      sampleCount: 5,
      successfulRuns: 5,
      failedRuns: 0,
      providedContext: true,
      contextInjectionSuccesses: 15,
      submitSuccesses: 15,
      containsPersonalData: false,
    })
    expect(
      Object.values(performance.phases).every(
        (phase) =>
          phase.durableP95Milliseconds < 30_000 && phase.interactionP95Milliseconds < 30_000,
      ),
    ).toBe(true)
    expect(result.status).toBe('PASSED')
  })
})

describe('T15 Discovery Agent v1.1.6 Spec persistence recovery', () => {
  it('keeps the normal Spec surface submit-only and records the bounded recovery evidence', async () => {
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/discovery.md'),
      'utf8',
    )
    const performance = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.1.6-spec-recovery.performance.json',
    )) as {
      readonly promptVersion: string
      readonly selectedModel: string
      readonly normalSpecTools: readonly string[]
      readonly recoverySpecTools: readonly string[]
      readonly boundedUiRecoveryAttempts: number
      readonly durableRevisionAfterUiRecoveryE2e: number
      readonly haikuRawRefinement: {
        readonly samples: number
        readonly durableSuccesses: number
        readonly noToolCompletions: number
      }
      readonly modelComparisons: Readonly<
        Record<string, { readonly firstSpecMilliseconds: number; readonly bothDurable: boolean }>
      >
      readonly finalHaikuUserFlowSample: {
        readonly refinedSpecRevision: number
        readonly refinedSpecMilliseconds: number
      }
      readonly userApprovedFinalGateRerun: {
        readonly firstCandidateMilliseconds: number
        readonly mergeMilliseconds: number
        readonly firstSpecMilliseconds: number
        readonly refinedSpecMilliseconds: number
        readonly refinedSpecRevision: number
        readonly allRequiredPhasesWithinGate: boolean
      }
      readonly latencyGateFullyMet: boolean
      readonly containsPersonalData: boolean
    }

    expect(prompt).toContain('Prompt version: `1.1.6`')
    expect(prompt).toContain('확인 질문이나 설명으로 끝내지 마라')
    expect(performance).toMatchObject({
      promptVersion: '1.1.6',
      selectedModel: 'claude-haiku-4.5',
      normalSpecTools: ['submit_learning_spec'],
      recoverySpecTools: ['get_discovery_context', 'submit_learning_spec'],
      boundedUiRecoveryAttempts: 2,
      durableRevisionAfterUiRecoveryE2e: 2,
      containsPersonalData: false,
      latencyGateFullyMet: false,
    })
    expect(performance.haikuRawRefinement).toMatchObject({
      samples: 2,
      durableSuccesses: 1,
      noToolCompletions: 1,
    })
    expect(performance.finalHaikuUserFlowSample).toMatchObject({
      refinedSpecRevision: 2,
      refinedSpecMilliseconds: 23_384,
    })
    expect(performance.userApprovedFinalGateRerun).toMatchObject({
      firstCandidateMilliseconds: 50_132,
      mergeMilliseconds: 13_226,
      firstSpecMilliseconds: 18_860,
      refinedSpecMilliseconds: 23_097,
      refinedSpecRevision: 2,
      allRequiredPhasesWithinGate: false,
    })
    expect(
      Object.values(performance.modelComparisons).every(
        (comparison) => comparison.bothDurable && comparison.firstSpecMilliseconds > 30_000,
      ),
    ).toBe(true)
  })
})

describe('T15 first-Candidate performance alternatives', () => {
  it('records failed low-risk variants and leaves the contract-changing recommendation unshipped', async () => {
    const performance = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.1.6-first-candidate-alternatives.performance.json',
    )) as {
      readonly baseline: { readonly durableMilliseconds: number }
      readonly singleBatchVariants: readonly {
        readonly variant: string
        readonly attempts?: number
        readonly durableSuccesses?: number
      }[]
      readonly otherStrategies: readonly {
        readonly variant: string
        readonly atomicCombinedRound?: boolean
      }[]
      readonly conclusion: {
        readonly existingSingleRoundVariantMeetsLatencyAndReliability: boolean
        readonly recommendedNextDesign: string
        readonly recommendationDirectlyValidated: boolean
        readonly requiresContractAndStorageChange: boolean
        readonly productionVariantChanged: boolean
        readonly stablePackageRestored: boolean
      }
      readonly containsPersonalData: boolean
    }

    expect(performance.baseline.durableMilliseconds).toBe(50_132)
    expect(
      performance.singleBatchVariants.find(
        (variant) => variant.variant === 'luna-6-compact-explicit-envelope',
      ),
    ).toMatchObject({ attempts: 4, durableSuccesses: 3 })
    expect(
      performance.otherStrategies.find(
        (variant) => variant.variant === 'haiku-5x2-parallel-unpartitioned',
      ),
    ).toMatchObject({ atomicCombinedRound: false })
    expect(performance.conclusion).toEqual({
      existingSingleRoundVariantMeetsLatencyAndReliability: false,
      recommendedNextDesign: 'TEN_PREVIEWS_THEN_FIXED_PREVIEW_ENRICHMENT',
      recommendationDirectlyValidated: false,
      requiresContractAndStorageChange: true,
      productionVariantChanged: false,
      stablePackageRestored: true,
    })
    expect(performance.containsPersonalData).toBe(false)
  })
})

describe('T15 Discovery Agent v1.1.3 selection narrowing regression', () => {
  it('keeps only the merged result current while preserving both selected parents as lineage', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/discovery-v1.1.3-narrow-merge.manifest.json',
      ),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/prompt-regressions/discovery-v1.1.3-narrow-merge.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput(
          'tests/eval/fixtures/prompt-regressions/discovery-v1.1.3-narrow-merge.review.json',
        ),
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

    expect(round.roundIndex).toBe(2)
    expect(round.appliedFeedbackIds).toHaveLength(1)
    expect(round.candidates).toEqual([
      { candidateId: 'candidate_00000000-0000-4000-8000-000000000915', revision: 2 },
    ])
    expect(candidates).toHaveLength(1)
    expect(candidates?.[0]?.parentRevisions).toHaveLength(2)
    expect(result.status).toBe('PASSED')
    expect(result.criterionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterionKey: 'contract_valid', status: 'PASSED' }),
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

describe('T11 Builder prompt regression', () => {
  it('keeps a material Decision in the durable apply lifecycle without a false mastery claim', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/builder-v1.1-decision-webhook.manifest.json',
      ),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/prompt-regressions/builder-v1.1-decision-webhook.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput(
          'tests/eval/fixtures/prompt-regressions/builder-v1.1-decision-webhook.review.json',
        ),
      )
    const result = evaluateCalibrationCase({
      fixture,
      subject,
      humanReviews: new Map(reviews.map((review) => [review.criterionKey, review])),
    })
    const task = builderTaskSchema.parse(subject.builderTask)
    const context = liveProjectContextSchema.parse(subject.liveContext)
    const report = taskCompletionReportSchema.parse(subject.completionReport)
    const decision = decisionRequestSchema.parse(subject.decision)

    expect(task.expectedConcepts).toEqual(['discriminated union', 'runtime validation'])
    expect(task.excludedWork).toEqual(['Live provider credentials and hosted payload storage'])
    expect(decision).toMatchObject({
      category: 'PRODUCT_BEHAVIOR',
      independentWorkCanContinue: false,
    })
    expect(context).toMatchObject({ checkpoint: 'TASK_COMPLETED', contextVersion: 5 })
    expect(context.activeDecisionIds).toEqual([])
    expect(report.appliedDecisionIds).toEqual([decision.id])
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
        expect.objectContaining({ criterionKey: 'decision_necessity', status: 'PASSED' }),
      ]),
    )
  })
})

describe('T12 Helper prompt regression', () => {
  it('keeps current Decision help concise, claim-level and available at a high Concept State', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput('tests/eval/fixtures/prompt-regressions/helper-v1.0-analogy.manifest.json'),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/prompt-regressions/helper-v1.0-analogy.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput('tests/eval/fixtures/prompt-regressions/helper-v1.0-analogy.review.json'),
      )
    const result = evaluateCalibrationCase({
      fixture,
      subject,
      humanReviews: new Map(reviews.map((review) => [review.criterionKey, review])),
    })
    const decision = decisionRequestSchema.parse(subject.decision)
    const interaction = subject.helperInteraction

    expect(decision.relatedConceptNames).toEqual(['runtime validation'])
    expect(interaction).toMatchObject({
      freshness: 'CURRENT',
      conceptState: 'DEMONSTRATED',
      quickActions: ['더 쉽게', '더 자세히', '현재 코드로 예시', '선택지 비교'],
    })
    expect(interaction?.analogyAnswer).toContain('행에 대응시킨 부분은 맞아요')
    expect(interaction?.analogyAnswer).toContain('각 필드가 열에 더 가깝습니다')
    expect(`${interaction?.firstAnswer} ${interaction?.highStateAnswer}`).not.toMatch(
      /(?:반드시|퀴즈|다시 말해|정답을 제출)/u,
    )
    expect(result.status).toBe('PASSED')
    expect(result.criterionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterionKey: 'contract_valid', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'redaction_no_leak', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'helper_relevance', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'analogy_claims', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'helper_non_coercive', status: 'PASSED' }),
      ]),
    )
  })
})

describe('T13 Evidence Analyst prompt regression', () => {
  it('separates directly led NONE from independent STRONG Evidence in one Episode', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0-mixed.manifest.json',
      ),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0-mixed.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput(
          'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0-mixed.review.json',
        ),
      )
    const evaluation = evaluateCalibrationCase({
      fixture,
      subject,
      humanReviews: new Map(reviews.map((review) => [review.criterionKey, review])),
    })
    const episode = episodeSchema.parse(subject.episode)
    const events = activityEventSchema.array().parse(subject.analystInteraction?.events)
    const result = analystSemanticResultSchema.parse(subject.analystInteraction?.result)

    expect(result).toMatchObject({
      episodeId: episode.id,
      episodeRevision: episode.revision,
      correlationId: episode.correlationId,
      proposals: [
        {
          concept: { proposedCanonicalName: 'discriminated union' },
          signal: 'REPHRASE',
          strength: 'NONE',
          promptDependence: 'DIRECTLY_LED',
          maximumSupportedState: null,
        },
        {
          concept: { proposedCanonicalName: 'runtime validation' },
          signal: 'APPLICATION',
          strength: 'STRONG',
          promptDependence: 'INDEPENDENT',
          maximumSupportedState: 'DEMONSTRATED',
        },
      ],
    })
    const userMessageIds = new Set(
      events.flatMap((event) =>
        event.actor.kind === 'USER' && event.payload.type === 'USER_MESSAGE'
          ? [event.payload.messageId]
          : [],
      ),
    )
    expect(
      result.proposals.every((proposal) =>
        proposal.userEvidenceSources.every(
          (reference) =>
            reference.kind === 'USER_MESSAGE' && userMessageIds.has(reference.messageId),
        ),
      ),
    ).toBe(true)
    expect(evaluation.status).toBe('PASSED')
    expect(evaluation.criterionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterionKey: 'contract_valid', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'redaction_no_leak', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'analyst_provenance', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'analyst_mixed_strength', status: 'PASSED' }),
      ]),
    )
  })
})
