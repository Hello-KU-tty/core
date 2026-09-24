import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  activityEventSchema,
  analystSemanticResultSchema,
  baselineResultSchema,
  builderTaskSchema,
  candidatePreviewDraftSchema,
  candidateRoundSchema,
  decisionRequestSchema,
  discoveryInputSchema,
  type EvaluationCaseResult,
  episodeSchema,
  evaluationCriterionResultSchema,
  evaluationFixtureSchema,
  learningSpecDraftContentSchema,
  learningSpecRevisionSchema,
  liveProjectContextSchema,
  personalizationTraceSchema,
  projectCandidateRevisionSchema,
  taskCompletionReportSchema,
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

describe('T17 personalization A/B fixture', () => {
  it('uses accepted provenance when present and keeps the no-evidence fallback neutral', async () => {
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/t17-personalization-ab.json',
    )) as {
      helper: {
        evidenceAware: { trace: unknown; answer: string }
        noEvidence: { trace: unknown; answer: string }
      }
      discovery: {
        primarySignals: string[]
        tieBreakSignal: string
        evidenceAwareOrder: string[]
        noEvidenceOrder: string[]
      }
      stressCases: {
        unrelatedEvidence: Record<string, unknown>
        singleObserved: Record<string, unknown>
        multipleSources: Record<string, unknown>
        weakAnalogy: Record<string, unknown>
        stateInflation: Record<string, unknown>
        openIssue: Record<string, unknown>
        bounds: Record<string, unknown>
      }
    }
    const evidenceAware = personalizationTraceSchema.parse(fixture.helper.evidenceAware.trace)
    const noEvidence = personalizationTraceSchema.parse(fixture.helper.noEvidence.trace)

    expect(evidenceAware.mode).toBe('EVIDENCE_AWARE')
    expect(evidenceAware.basis).toHaveLength(1)
    expect(fixture.helper.evidenceAware.answer).toContain(
      evidenceAware.basis[0]?.sourceProjectTitles[0],
    )
    expect(noEvidence).toMatchObject({
      mode: 'NO_RELEVANT_EVIDENCE',
      basis: [],
      fallbackReason: 'NO_RELEVANT_CONCEPT',
    })
    expect(fixture.helper.noEvidence.answer).not.toContain('Webhook Lens')
    expect(fixture.helper.noEvidence.answer).not.toMatch(/\d+%/u)
    expect(fixture.discovery.primarySignals).toEqual(['interest', 'personal utility'])
    expect(fixture.discovery.tieBreakSignal).toBe('accepted prior-project evidence')
    expect(fixture.discovery.evidenceAwareOrder).not.toEqual(fixture.discovery.noEvidenceOrder)
    expect(fixture.stressCases).toMatchObject({
      unrelatedEvidence: {
        expectedMode: 'NO_RELEVANT_EVIDENCE',
        expectedBasisCount: 0,
        inventPriorExperience: false,
      },
      singleObserved: {
        expectedMode: 'EVIDENCE_AWARE',
        expectedBasisCount: 1,
        actualStates: ['OBSERVED'],
        claimTransferred: false,
      },
      multipleSources: {
        expectedBasisCount: 2,
        requiredDistinctSourceProjects: 2,
        keepSourcesSeparate: true,
      },
      weakAnalogy: {
        forceDirectMapping: false,
        requireCommonalityAndDifference: true,
      },
      stateInflation: {
        actualState: 'OBSERVED',
        requestedState: 'TRANSFERRED',
        allowRequestedStateClaim: false,
      },
      openIssue: {
        actualState: 'DEMONSTRATED',
        openIssueCount: 1,
        ignoreOpenIssue: false,
        allowMasteryClaim: false,
      },
      bounds: { maximumBasisCount: 5 },
    })
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

describe('T15 Discovery Agent Spec persistence recovery', () => {
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

    expect(prompt).toContain('Prompt version: `1.3.5`')
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

describe('T15 Discovery Agent v1.1.9 historical compact preview enrichment', () => {
  it('fixes ten preview identities before two recoverable enrichment batches', async () => {
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/discovery.md'),
      'utf8',
    )
    const performance = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.1.9-compact-enrichment.performance.json',
    )) as {
      readonly promptVersion: string
      readonly previewCount: number
      readonly enrichmentBatches: readonly { readonly name: string; readonly positions: number[] }[]
      readonly automatedVerification: Readonly<Record<string, boolean>>
      readonly targetMeasurement: { readonly status: string }
      readonly containsPersonalData: boolean
    }

    expect(prompt).toContain('Prompt version: `1.3.5`')
    expect(prompt).toContain('lightweight preview를 정확히 10개')
    expect(prompt).toContain('summary·coreInteraction·technologyNecessity는 각각 45자')
    expect(prompt).toContain('가장 잘 맞는 하나만 사용')
    expect(prompt).toContain('`SELECTED`는 사용자가 지금 선택하거나 수정 대상으로 참조한')
    expect(prompt).toContain('글자 하나도 바꾸지 말고 그대로 복사')
    expect(prompt).toContain('coreConcepts` 정확히 2개')
    expect(prompt).toContain('각각 정확히 1개')
    expect(performance).toMatchObject({
      promptVersion: '1.1.9',
      previewCount: 10,
      targetMeasurement: { status: 'PASSED', previewWithinThirtySecondGate: true },
      containsPersonalData: false,
    })
    expect(performance.enrichmentBatches).toEqual([
      { name: 'FIRST', positions: [1, 2, 3, 4, 5] },
      { name: 'SECOND', positions: [6, 7, 8, 9, 10] },
    ])
    expect(Object.values(performance.automatedVerification).every(Boolean)).toBe(true)
  })
})

describe('T15 Discovery Agent v1.2.0 just-in-time selected enrichment', () => {
  it('enriches and materializes only user-referenced previews before continuing', async () => {
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/discovery.md'),
      'utf8',
    )
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.2.0-jit-selection.json',
    )) as {
      readonly promptVersion: string
      readonly requestedBatch: string
      readonly requestedPreviewPositions: number[]
      readonly materializedCandidatePositions: number[]
      readonly waitsForRemainingBackground: boolean
      readonly provenance: Readonly<Record<string, string>>
      readonly automatedVerification: Readonly<Record<string, boolean>>
      readonly targetMeasurement: {
        readonly status: string
        readonly selectedCandidateCount: number
        readonly candidateEnrichmentCount: number
        readonly projectStatus: string
      }
      readonly containsPersonalData: boolean
    }

    expect(prompt).toContain('Prompt version: `1.3.5`')
    expect(prompt).toContain('`SELECTED`')
    expect(prompt).toContain('`requestedPreviews`에 있는 수만큼만 완성')
    expect(fixture).toMatchObject({
      promptVersion: '1.2.0',
      requestedBatch: 'SELECTED',
      requestedPreviewPositions: [3, 8],
      materializedCandidatePositions: [3, 8],
      waitsForRemainingBackground: false,
      provenance: { candidateMeaning: 'AGENT', selectionFeedback: 'USER' },
      targetMeasurement: {
        status: 'PASSED',
        selectedCandidateCount: 1,
        candidateEnrichmentCount: 1,
        projectStatus: 'SPEC_REVIEW',
      },
      containsPersonalData: false,
    })
    expect(Object.values(fixture.automatedVerification).every(Boolean)).toBe(true)
  })
})

describe('T19 native Discovery enrichment transport regression', () => {
  it('keeps Preview meaning immutable across the native and general MCP input variants', async () => {
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/discovery.md'),
      'utf8',
    )
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.3.1-native-enrichment.json',
    )) as {
      readonly promptVersion: string
      readonly immutablePreviewFields: readonly string[]
      readonly expected: Readonly<Record<string, boolean>>
      readonly liveNativeResult: string
      readonly containsPersonalData: boolean
    }
    expect(fixture.promptVersion).toBe('1.3.1')
    expect(prompt).toContain('Native IDE 도구가 `inputJson`의 enrichment-only schema를 광고하면')
    expect(prompt).toContain('위 여섯 preview 필드는 아예 넣지 마라')
    expect(prompt).toContain('전체 Candidate 필드를 요구하는 일반 MCP 도구에서는')
    expect(fixture.immutablePreviewFields).toEqual([
      'title',
      'summary',
      'coreInteraction',
      'appeal',
      'technologyNecessity',
      'generationTags',
    ])
    expect(fixture.expected).toMatchObject({
      coreStillValidatesOriginalCompleteCandidate: true,
      nativeMayInventMissingPreviewMeaning: false,
      nativeMaySilentlyOverwriteImmutableAgentFields: false,
      firstAndSecondRequireExactFivePreviewIds: true,
      emptyOptionalCollectionsPreservedByJsonString: true,
      cliToolContractChanged: false,
    })
    expect(fixture.liveNativeResult).toBe('PENDING')
    expect(fixture.containsPersonalData).toBe(false)
  })
})

describe('T19 native Discovery complete JSON envelope regression', () => {
  it('keeps original Core semantics across direct MCP and native scalar transport', async () => {
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/discovery.md'),
      'utf8',
    )
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.3.2-native-json-envelope.json',
    )) as {
      readonly promptVersion: string
      readonly expected: Readonly<Record<string, boolean>>
      readonly liveNativeResult: string
      readonly containsPersonalData: boolean
    }
    expect(fixture.promptVersion).toBe('1.3.2')
    expect(prompt).toContain('> Prompt version: `1.3.5`')
    expect(prompt).toContain('원래 전체 입력 객체')
    expect(prompt).toContain('`submit_candidate_merge`')
    expect(prompt).toContain('빈 배열·객체까지 명시')
    expect(prompt).toContain('누락된 의미값은 추측하거나 기본값으로 채우지 마라')
    expect(prompt).toContain('Enrichment-only `inputJson` 도구는 별도 계약')
    expect(prompt).toContain('`candidates`는 JSON 문자열이 아니라 실제 배열')
    expect(fixture.expected).toMatchObject({
      originalCoreSchemaStillValidates: true,
      requiredEmptyCollectionsAuthored: true,
      semanticDefaultsInserted: false,
      roundCandidatesRemainArrayInsideOriginalObject: true,
      enrichmentFacadeUnchanged: true,
      cliToolContractChanged: false,
    })
    expect(fixture.liveNativeResult).toBe('PENDING')
    expect(fixture.containsPersonalData).toBe(false)
  })
})

describe('T19 Discovery v1.3.3 product-first preview review', () => {
  it('preserves the native baseline and includes controls for useful feature-preserving technology', async () => {
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.3.3-product-first-preview.json',
    )) as {
      readonly promptVersion: string
      readonly baseline: {
        readonly promptVersion: string
        readonly reviewGranularity: string
        readonly normalizedTopics: readonly { readonly topic: string; readonly triage: string }[]
      }
      readonly humanReviewCriteria: readonly string[]
      readonly counterexamples: readonly { readonly kind: string }[]
      readonly generalizationChecks: readonly { readonly personalNeed: string | null }[]
      readonly revisedPromptNativeResult: string
      readonly containsPersonalData: boolean
      readonly redactionStatus: string
    }

    expect(fixture.promptVersion).toBe('1.3.3')
    expect(fixture.baseline.promptVersion).toBe('1.3.2')
    expect(fixture.baseline.reviewGranularity).toBe('NORMALIZED_TOPIC_ONLY')
    expect(fixture.baseline.normalizedTopics).toHaveLength(10)
    expect(new Set(fixture.baseline.normalizedTopics.map((item) => item.topic)).size).toBe(10)
    expect(new Set(fixture.baseline.normalizedTopics.map((item) => item.triage))).toEqual(
      new Set(['WEAK', 'CONDITIONAL', 'PROMISING']),
    )
    expect(fixture.humanReviewCriteria).toHaveLength(4)
    expect(fixture.counterexamples.map((item) => item.kind)).toEqual([
      'SHOULD_NOT_REJECT_FOR_EQUIVALENT_UI',
      'SHOULD_REQUEST_PRODUCT_REFRAME',
    ])
    expect(fixture.generalizationChecks.map((item) => item.personalNeed === null)).toEqual([
      false,
      true,
    ])
    expect(fixture.revisedPromptNativeResult).toBe('PENDING')
    expect(fixture.containsPersonalData).toBe(false)
    expect(fixture.redactionStatus).toBe('VERIFIED_REDACTED')
  })
})

describe('T19 Discovery v1.3.5 full-preview product-value review', () => {
  it('preserves all saved D preview fields and a goal-only utility contrast without claiming model quality', async () => {
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.3.5-full-preview-value.json',
    )) as {
      readonly promptVersion: string
      readonly containsPersonalData: boolean
      readonly source: {
        readonly kind: string
        readonly priorPromptVersion: string
        readonly reviewGranularity: string
        readonly personalNeedProvided: boolean
        readonly redactionStatus: string
      }
      readonly observedPreviews: readonly (Record<string, unknown> & {
        readonly position: number
      })[]
      readonly historicalRuleDelta: {
        readonly priorRule: string
        readonly revisedRule: string
      }
      readonly humanReviewFocus: readonly {
        readonly positions: readonly number[]
        readonly question: string
      }[]
      readonly unseenGoalOnlyContrast: {
        readonly learningGoal: string
        readonly personalNeed: string | null
        readonly useful: unknown
        readonly technologyDemo: unknown
        readonly reviewQuestion: string
      }
      readonly humanReviewCriteria: readonly string[]
      readonly revisedPromptNativeResult: string
      readonly automatedQualityVerdict: string
    }
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/discovery.md'),
      'utf8',
    )
    expect(fixture).toMatchObject({
      promptVersion: '1.3.5',
      containsPersonalData: false,
      source: {
        kind: 'SYNTHETIC_NATIVE_SAVED_PREVIEW',
        priorPromptVersion: '1.3.4',
        reviewGranularity: 'FULL_SIX_FIELD_PREVIEW',
        personalNeedProvided: false,
        redactionStatus: 'NOT_REQUIRED',
      },
      revisedPromptNativeResult: 'OBSERVED_MIXED',
      automatedQualityVerdict: 'NOT_ASSERTED',
    })
    expect(prompt).toContain('> Prompt version: `1.3.5`')
    expect(prompt).toContain(fixture.historicalRuleDelta.revisedRule)
    expect(prompt).not.toContain(fixture.historicalRuleDelta.priorRule)
    expect(fixture.observedPreviews).toHaveLength(10)
    for (const [index, preview] of fixture.observedPreviews.entries()) {
      const { position, ...fields } = preview
      expect(position).toBe(index + 1)
      expect(Object.keys(fields).sort()).toEqual(
        [
          'title',
          'summary',
          'coreInteraction',
          'appeal',
          'technologyNecessity',
          'generationTags',
        ].sort(),
      )
      expect(candidatePreviewDraftSchema.safeParse(fields).success).toBe(true)
    }
    expect(new Set(fixture.observedPreviews.map((preview) => preview.title)).size).toBe(10)
    expect(
      fixture.humanReviewFocus.flatMap((item) => item.positions).sort((a, b) => a - b),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(fixture.humanReviewFocus.every((item) => item.question.length > 0)).toBe(true)
    expect(fixture.unseenGoalOnlyContrast.personalNeed).toBeNull()
    expect(fixture.unseenGoalOnlyContrast.learningGoal.length).toBeGreaterThan(0)
    expect(
      candidatePreviewDraftSchema.safeParse(fixture.unseenGoalOnlyContrast.useful).success,
    ).toBe(true)
    expect(
      candidatePreviewDraftSchema.safeParse(fixture.unseenGoalOnlyContrast.technologyDemo).success,
    ).toBe(true)
    expect(fixture.unseenGoalOnlyContrast.reviewQuestion.length).toBeGreaterThan(0)
    expect(fixture.humanReviewCriteria).toHaveLength(4)
  })
})

describe('T19 Discovery v1.3.4 optional actual Decision forecast', () => {
  it('accepts a no-fork Spec without losing a real product fork or changing preview rules', async () => {
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.3.4-optional-spec-decisions.json',
    )) as {
      readonly promptVersion: string
      readonly noForkDraft: unknown
      readonly realForkSpecPath: string
      readonly realForkExpectedDecisionCount: number
      readonly previewRulesSha256: string
      readonly priorFreshPreviewObservation: {
        readonly promptVersion: string
        readonly status: string
        readonly observedPreviewCount: number
        readonly requiredPreviewCount: number
        readonly previewRuleChangedInThisRevision: boolean
      }
      readonly revisedPromptNativeSpecResult: string
      readonly containsPersonalData: boolean
    }
    const manifest = evaluationFixtureSchema.parse(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/discovery-v1.3.4-optional-spec-decisions.manifest.json',
      ),
    )
    const currentPreviewFixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/discovery-v1.3.5-full-preview-value.json',
    )) as {
      readonly historicalRuleDelta: { readonly priorRule: string; readonly revisedRule: string }
    }
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/discovery.md'),
      'utf8',
    )
    expect(fixture.promptVersion).toBe('1.3.4')
    expect(prompt).toContain('> Prompt version: `1.3.5`')
    expect(prompt).toContain('`expectedDecisions` 필드는 항상 제출하되')
    expect(prompt).toContain('갈림길이 없으면 빈 배열 `[]`')
    expect(prompt).toContain('교육을 위한 선택지나 정답이 정해진 구현 질문을 후보로 만들지 마라')
    expect(manifest.kind).toBe('SPEC_SCOPE')
    expect(manifest.fixtureVersion).toBe('1.3.4')
    const noFork = learningSpecDraftContentSchema.parse(fixture.noForkDraft)
    expect(noFork.expectedDecisions).toEqual([])
    const { expectedDecisions: _expectedDecisions, ...missingForecast } = noFork
    expect(learningSpecDraftContentSchema.safeParse(missingForecast).success).toBe(false)
    expect(fixture.realForkSpecPath).toBe(
      'tests/eval/fixtures/prompt-regressions/learning-spec-v1.1-webhook.json',
    )
    const realFork = (await loadInput(fixture.realForkSpecPath)) as {
      readonly learningSpec: unknown
    }
    expect(learningSpecRevisionSchema.parse(realFork.learningSpec).expectedDecisions).toHaveLength(
      fixture.realForkExpectedDecisionCount,
    )
    const canonicalPrompt = prompt.replace(/\r\n/g, '\n')
    const previewStart = canonicalPrompt.indexOf('\n## 빠른 PREVIEW turn\n')
    const previewEnd = canonicalPrompt.indexOf('\n## ENRICHMENT turn\n', previewStart)
    expect(previewStart).toBeGreaterThan(0)
    expect(previewEnd).toBeGreaterThan(previewStart)
    const currentPreview = canonicalPrompt.slice(previewStart, previewEnd)
    const { priorRule, revisedRule } = currentPreviewFixture.historicalRuleDelta
    expect(currentPreview.split(revisedRule)).toHaveLength(2)
    expect(currentPreview).not.toContain(priorRule)
    const historicalPreview = currentPreview.replace(revisedRule, priorRule)
    expect(createHash('sha256').update(historicalPreview).digest('hex')).toBe(
      fixture.previewRulesSha256,
    )
    expect(fixture.priorFreshPreviewObservation).toMatchObject({
      promptVersion: '1.3.3',
      status: 'FAILED',
      observedPreviewCount: 11,
      requiredPreviewCount: 10,
      previewRuleChangedInThisRevision: false,
    })
    expect(fixture.revisedPromptNativeSpecResult).toBe('NOT_RUN')
    expect(fixture.containsPersonalData).toBe(false)
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

  it('accepts the latest user direction as a Spec revision and gates only material impact', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/builder-v1.2-revisable-spec.manifest.json',
      ),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/prompt-regressions/builder-v1.1-decision-webhook.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput(
          'tests/eval/fixtures/prompt-regressions/builder-v1.2-revisable-spec.review.json',
        ),
      )
    const result = evaluateCalibrationCase({
      fixture,
      subject,
      humanReviews: new Map(reviews.map((review) => [review.criterionKey, review])),
    })
    const interaction = subject.specRevisionInteraction
    const response = String(interaction?.builderResponse ?? '')

    expect(interaction).toMatchObject({
      userMessage: '팀원과 같이 쓰고 싶으니 hosted 저장도 포함해서 배포해줘.',
      requiredAction: 'REQUEST_DECISION_AND_RECORD_SPEC_DEVIATION',
    })
    expect(response).toContain('사용자가 지금 방향을 바꿀 수 있습니다')
    expect(response).toMatch(/개인정보.*비용.*배포/u)
    expect(response).toContain('실제 Decision')
    expect(response).not.toMatch(/(?:Spec 범위 밖이라 불가|사용자가 결정할 범위가 아니)/u)
    expect(result.status).toBe('PASSED')
    expect(result.criterionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterionKey: 'contract_valid', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'context_fresh', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'latest_user_direction', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'material_change_decision', status: 'PASSED' }),
      ]),
    )
  })

  it('keeps runnable web output and the optional Final Upgrade inside conservative Evidence bounds', async () => {
    const prompt = await readFile(path.join(workspaceRoot, 'docs/agent-prompts/builder.md'), 'utf8')
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/t18-builder-result-final-upgrade.json',
    )) as {
      readonly promptVersion: string
      readonly initialTask: {
        readonly requiredResultManifest: string
        readonly bindHost: string
        readonly dynamicPortEnvironment: string
      }
      readonly finalUpgrade: {
        readonly automatic: boolean
        readonly requiresUserGoal: boolean
        readonly requiresEvidenceAwareTrace: boolean
        readonly mayClaimMastery: boolean
      }
      readonly evidenceBounds: {
        readonly builderCodeAndTestsMaximum: string
        readonly sameFlowMaximum: string
        readonly sameFlowMayReachTransferred: boolean
      }
      readonly containsPersonalData: boolean
    }
    const campusDrop = (await loadInput('tests/e2e/campus-drop-session.fixture.json')) as {
      readonly learningScope: {
        readonly learnerFocus: readonly string[]
        readonly agentSupport: readonly string[]
        readonly excluded: readonly string[]
      }
      readonly decision: { readonly acceptedOption: string }
      readonly finalUpgradeUserGoal: string
      readonly allowedEvidence: {
        readonly builderOutputMaximum: string
        readonly userExplanationMaximum: string
        readonly independentDecisionOrApplicationMaximum: string
        readonly sameSessionTransferredAllowed: boolean
      }
      readonly containsPersonalData: boolean
    }

    expect(prompt).toContain('Prompt version: `1.3.8`')
    expect(prompt).toContain('.vibe-helper/result.json')
    expect(prompt).toContain('HOST=127.0.0.1')
    expect(prompt).toContain('동적 `PORT`')
    expect(prompt).toContain('finalUpgrade')
    expect(fixture).toMatchObject({
      promptVersion: '1.3.0',
      initialTask: {
        requiredResultManifest: '.vibe-helper/result.json',
        bindHost: '127.0.0.1',
        dynamicPortEnvironment: 'PORT',
      },
      finalUpgrade: {
        automatic: false,
        requiresUserGoal: true,
        requiresEvidenceAwareTrace: true,
        mayClaimMastery: false,
      },
      evidenceBounds: {
        builderCodeAndTestsMaximum: 'OBSERVED',
        sameFlowMaximum: 'DEMONSTRATED',
        sameFlowMayReachTransferred: false,
      },
      containsPersonalData: false,
    })
    expect(campusDrop.learningScope.learnerFocus).toEqual([
      'TypeScript runtime boundary',
      'SQLite metadata and filesystem blob separation',
      'access token and expiry state transition',
    ])
    expect(campusDrop.learningScope.agentSupport).toContain('HTTP and upload parsing')
    expect(campusDrop.learningScope.excluded).toEqual(
      expect.arrayContaining(['login', 'object storage', 'hosted deployment']),
    )
    expect(campusDrop.decision.acceptedOption).toBe('CONSUME_AFTER_FIRST_DOWNLOAD')
    expect(campusDrop.finalUpgradeUserGoal).toContain('만료된 링크')
    expect(campusDrop.allowedEvidence).toEqual({
      builderOutputMaximum: 'OBSERVED',
      userExplanationMaximum: 'EXPLAINED',
      independentDecisionOrApplicationMaximum: 'DEMONSTRATED',
      sameSessionTransferredAllowed: false,
    })
    expect(campusDrop.containsPersonalData).toBe(false)
  })
})

describe('T19 Builder validation regression', () => {
  it('uses the prepared Windows tool entry without changing legacy commands or success criteria', async () => {
    const prompt = await readFile(path.join(workspaceRoot, 'docs/agent-prompts/builder.md'), 'utf8')
    expect(prompt).toContain('Prompt version: `1.3.8`')
    expect(prompt).toContain('.\\.kiro\\vibe-tools.cmd pnpm run build')
    expect(prompt).toContain('기존 macOS/CLI 경로에는 이 접두어를 붙이지 않는다')
    expect(prompt).toContain('진입점이 없거나 도구 준비에 실패하면 실패 상태를 보고한다')
    expect(prompt).toContain('esbuild/better-sqlite3에만 한정한다')
  })
  it('distinguishes a blocked command from a real passing validation', async () => {
    const prompt = await readFile(path.join(workspaceRoot, 'docs/agent-prompts/builder.md'), 'utf8')
    const fixture = await loadInput(
      'tests/eval/fixtures/prompt-regressions/t19-builder-validation.json',
    )
    expect(fixture).toMatchObject({
      promptVersion: '1.3.8',
      expected: {
        mayClaimPassed: false,
        mayComplete: false,
        noExecutionStatus: 'NOT_RUN',
        nextCommands: [
          'pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile',
          'pnpm install --frozen-lockfile',
          'pnpm run build',
          'pnpm test',
          'pnpm run smoke',
        ],
        coreWorkspacePathField: 'project.generatedWorkspacePath',
        coreWorkspacePathIsNativeCwd: false,
        mustNotPrependCoreWorkspacePath: true,
        nativeProjectRoot: '.',
        lockRefreshWithoutConfigAllowed: true,
        windowsApprovedConfigRefreshAllowed: true,
        unverifiedConfigRefreshAllowed: false,
        frozenInstallAfterRefreshRequired: true,
        smokeOwnsBoundedChild: true,
        smokeChecksLoopbackHttp: true,
        smokeUsesBackgroundController: false,
      },
      containsPersonalData: false,
    })
    expect(prompt).toContain('guard 거절은 실행 성공이 아니다')
    expect(prompt).toContain('Core 데이터 루트 기준의 식별 경로')
    expect(prompt).toContain('`get_builder_task`의 `project.generatedWorkspacePath`')
    expect(prompt).toContain('이 값을 native file 경로 앞에 다시 붙이지 마라')
    expect(prompt).toContain('루트의 `package.json`에는 `package.json`을 사용하고')
    expect(prompt).toContain('현재 프로젝트 루트 조회에는 `.`을')
    expect(prompt).toContain('`PASSED`는 실제 해당 명령의 성공 결과를 관찰한 경우')
    expect(prompt).toContain('`TASK_COMPLETED`/`complete_task`로 완료하지 말고')
    expect(prompt).toContain('pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile')
    expect(prompt).toContain('잠금 파일을 처음 만들거나 갱신한다')
    expect(prompt).toContain('잠금 파일이 현재 `package.json`과 맞은 뒤')
    expect(prompt).toContain('`pnpm install --frozen-lockfile`로 실제 설치한다')
    expect(prompt).toContain('Windows 보호 실행기에서는 pnpm-workspace.yaml이')
    expect(prompt).toContain('설정이나 명령이 거부되면 우회하지 말고')
    expect(prompt).toContain('별도의 foreground `pnpm run smoke`')
    expect(prompt).toContain('health path, 사용자 화면 path와 필요한 컴파일된 asset')
    expect(prompt).toContain('`finally`에서 자신이 띄운 child만 종료')
    expect(prompt).toContain('`control_bash_process`, `action`, `run_in_background`')
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

  it('treats a confirmed Spec as a revisable baseline and returns control to Builder chat', async () => {
    const fixture = evaluationFixtureSchema.parse(
      await loadInput(
        'tests/eval/fixtures/prompt-regressions/helper-v1.1-revisable-spec.manifest.json',
      ),
    )
    const subject = parseEvaluationSubject(
      await loadInput('tests/eval/fixtures/prompt-regressions/helper-v1.1-revisable-spec.json'),
    )
    const reviews = evaluationCriterionResultSchema
      .array()
      .parse(
        await loadInput(
          'tests/eval/fixtures/prompt-regressions/helper-v1.1-revisable-spec.review.json',
        ),
      )
    const result = evaluateCalibrationCase({
      fixture,
      subject,
      humanReviews: new Map(reviews.map((review) => [review.criterionKey, review])),
    })
    const interaction = subject.helperInteraction
    const answer = String(interaction?.answer ?? '')

    expect(interaction).toMatchObject({
      confirmedSpecBaseline: 'PostgreSQL 14+ database required',
      question: 'PostgreSQL보다 SQLite가 낫지 않나요?',
    })
    expect(answer).toContain('변경 권한을 막지는 않습니다')
    expect(answer).toMatch(/SQLite.*설치.*단순/u)
    expect(answer).toMatch(/PostgreSQL.*동시 쓰기/u)
    expect(answer).toContain('Builder 입력창')
    expect(answer).not.toMatch(/(?:사용자가 결정할 범위가 아니|Spec이므로 바꿀 수 없)/u)
    expect(result.status).toBe('PASSED')
    expect(result.criterionResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterionKey: 'contract_valid', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'spec_baseline_not_ceiling', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'alternative_tradeoffs', status: 'PASSED' }),
        expect.objectContaining({ criterionKey: 'builder_handoff', status: 'PASSED' }),
      ]),
    )
  })
})

describe('T13 Evidence Analyst prompt regression', () => {
  it('separates requests, plans, explanations, choices and performed application provenance', async () => {
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.6-clean-semantics.json',
    )) as {
      readonly promptVersion: string
      readonly containsPersonalData: boolean
      readonly fixtureProvenance: string
      readonly modelRunStatus: string
      readonly claimBoundary: string
      readonly cases: readonly {
        readonly id: string
        readonly observedKind: string
        readonly precedingAgentContribution: string | null
        readonly userMessage: string
        readonly userClaimExcerpt?: string
        readonly userEvidenceSources: readonly {
          readonly kind: string
          readonly eventId?: string
          readonly decisionId?: string
        }[]
        readonly decisionEvent?: { readonly rationaleProvided: boolean }
        readonly decisionResolution?: { readonly source: string; readonly rationale: string }
        readonly expected: {
          readonly proposalCount?: number
          readonly stateSupportingProposalCount?: number
          readonly allowedSignals?: readonly string[]
          readonly allowedPromptDependence?: readonly string[]
          readonly allowedMaximumSupportedStates?: readonly string[]
          readonly forbiddenSignals?: readonly string[]
          readonly maximumSupportedState?: string | null
          readonly currentCoreDisposition?: string
          readonly provenanceLimitation?: string
        }
      }[]
      readonly historicalRegressionBoundaries: readonly {
        readonly id: string
        readonly historicalMisclassification: string
        readonly requiredDisposition: string
        readonly mustNotUseExistingAcceptedEvidenceAsSuccess: boolean
      }[]
      readonly cleanPersonalizationEvaluation: {
        readonly provenance: string
        readonly liveModelStatus: string
        readonly humanLearningClaimAllowed: boolean
        readonly commonInput: {
          readonly helperQuestion: string
          readonly unseenDiscoveryInput: {
            readonly learningGoal: string
            readonly personalNeed: string
          }
          readonly modelAssumption: string
        }
        readonly cleanCuratedEvidence: {
          readonly sourceCaseId: string
          readonly promptDependence: string
          readonly requiredBeforeLive: boolean
          readonly acceptedByCore: boolean
          readonly acceptanceStatus: string
          readonly acceptanceEvidence: string
        }
        readonly recentEpisodeHistory: {
          readonly containsAcceptedEvidence: boolean
          readonly expectedDependenceIfRepeated: string
        }
        readonly helperMatrix: readonly {
          readonly id: string
          readonly curatedLedgerIncluded: boolean
          readonly recentEpisodesIncluded: boolean
          readonly expectedPersonalizationMode: string
          readonly mayReferenceAcceptedPastEvidence: boolean
          readonly mayUseRecentConversationContinuity: boolean
          readonly mustNotDescribeRecentHistoryAsAcceptedEvidence?: boolean
          readonly mustKeepLedgerAndEpisodeProvenanceSeparate?: boolean
        }[]
        readonly discoveryPair: readonly {
          readonly id: string
          readonly curatedLedgerIncluded: boolean
          readonly recentEpisodesIncluded: boolean
        }[]
        readonly reviewBoundary: {
          readonly deterministicChecks: readonly string[]
          readonly humanReviewRequired: readonly string[]
        }
      }
    }
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/evidence-analyst.md'),
      'utf8',
    )

    expect(fixture).toMatchObject({
      promptVersion: '1.0.6',
      containsPersonalData: false,
      fixtureProvenance: 'SYNTHETIC_UI_TRANSCRIPT',
      modelRunStatus: 'NOT_RUN',
    })
    expect(fixture.claimBoundary).toContain(
      'does not prove live model compliance or human learning',
    )
    expect(prompt).toContain('Prompt version: `1.0.7`')
    expect(prompt).toContain('미래 계획·조건부 해결책·Agent 지시는 수행이 아니다')
    expect(prompt).toContain('구조화된 `USER_DECISION` 근거')
    expect(prompt).toContain('자연어 자기 보고라는 provenance 한계')

    expect(fixture.cases.map((item) => item.id)).toEqual([
      'request_only',
      'future_plan_after_light_hint',
      'own_explanation_independent',
      'actual_reasoned_choice',
      'actual_performed_application',
      'directly_led_repeat',
      'unseen_cache_future_rule_not_application',
    ])
    for (const item of fixture.cases) {
      if (item.userClaimExcerpt !== undefined) {
        expect(item.userMessage).toContain(item.userClaimExcerpt)
      }
      expect(item.userEvidenceSources.length).toBeGreaterThan(0)
    }
    expect(fixture.cases.find((item) => item.id === 'request_only')?.expected).toMatchObject({
      proposalCount: 0,
      maximumSupportedState: null,
    })
    expect(
      fixture.cases.find((item) => item.id === 'future_plan_after_light_hint')?.expected,
    ).toMatchObject({
      allowedSignals: ['PREDICTION', 'REPHRASE'],
      allowedPromptDependence: ['LIGHT_HINT'],
      allowedMaximumSupportedStates: ['EXPLAINED'],
      forbiddenSignals: ['JUSTIFIED_DECISION', 'APPLICATION'],
    })
    expect(
      fixture.cases.find((item) => item.id === 'own_explanation_independent')?.expected,
    ).toMatchObject({
      allowedSignals: ['REPHRASE'],
      allowedPromptDependence: ['INDEPENDENT'],
      allowedMaximumSupportedStates: ['EXPLAINED'],
    })
    const choice = fixture.cases.find((item) => item.id === 'actual_reasoned_choice')
    expect(choice).toMatchObject({
      decisionEvent: { rationaleProvided: true },
      decisionResolution: { source: 'USER' },
      expected: {
        allowedSignals: ['JUSTIFIED_DECISION'],
        allowedMaximumSupportedStates: ['DEMONSTRATED'],
      },
    })
    expect(choice?.userEvidenceSources.map((source) => source.kind)).toEqual([
      'USER_MESSAGE',
      'USER_DECISION',
    ])
    expect(choice?.userClaimExcerpt).toBeDefined()
    expect(choice?.decisionResolution?.rationale).toContain(choice?.userClaimExcerpt ?? 'missing')
    const performed = fixture.cases.find((item) => item.id === 'actual_performed_application')
    expect(performed).toMatchObject({
      expected: {
        allowedSignals: ['APPLICATION'],
        allowedMaximumSupportedStates: ['DEMONSTRATED'],
        currentCoreDisposition: 'NATURAL_LANGUAGE_SELF_REPORT_ELIGIBLE',
      },
    })
    expect(performed?.userEvidenceSources.map((source) => source.kind)).toEqual(['USER_MESSAGE'])
    expect(performed?.expected.provenanceLimitation).toContain('self-report')
    expect(
      fixture.cases.find((item) => item.id === 'unseen_cache_future_rule_not_application')
        ?.expected,
    ).toMatchObject({
      allowedSignals: ['PREDICTION', 'REPHRASE'],
      allowedMaximumSupportedStates: ['EXPLAINED'],
      forbiddenSignals: ['JUSTIFIED_DECISION', 'APPLICATION'],
    })
    expect(fixture.historicalRegressionBoundaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          historicalMisclassification: 'JUSTIFIED_DECISION',
          requiredDisposition: 'REPHRASE_AT_MOST_EXPLAINED',
          mustNotUseExistingAcceptedEvidenceAsSuccess: true,
        }),
        expect.objectContaining({
          historicalMisclassification: 'APPLICATION',
          requiredDisposition: 'PREDICTION_OR_REPHRASE_AT_MOST_EXPLAINED',
          mustNotUseExistingAcceptedEvidenceAsSuccess: true,
        }),
      ]),
    )

    const evaluation = fixture.cleanPersonalizationEvaluation
    expect(evaluation).toMatchObject({
      provenance: 'SYNTHETIC_REDACTED_EVAL_INPUT',
      liveModelStatus: 'NOT_RUN',
      humanLearningClaimAllowed: false,
      cleanCuratedEvidence: {
        sourceCaseId: 'own_explanation_independent',
        promptDependence: 'INDEPENDENT',
        requiredBeforeLive: true,
        acceptedByCore: true,
        acceptanceStatus: 'VERIFIED_BY_EXACT_CLEAN_APPLICATION_FIXTURE',
      },
      recentEpisodeHistory: {
        containsAcceptedEvidence: false,
        expectedDependenceIfRepeated: 'DIRECTLY_LED',
      },
    })
    expect(evaluation.commonInput.helperQuestion.length).toBeGreaterThan(0)
    expect(evaluation.commonInput.unseenDiscoveryInput.learningGoal.length).toBeGreaterThan(0)
    expect(evaluation.commonInput.unseenDiscoveryInput.personalNeed.length).toBeGreaterThan(0)
    expect(evaluation.commonInput.modelAssumption).toContain('exact same model ID')
    expect(evaluation.cleanCuratedEvidence.acceptanceEvidence).toContain(
      'application-service.integration.test.ts',
    )
    expect(
      evaluation.helperMatrix.map((cell) => [
        cell.curatedLedgerIncluded,
        cell.recentEpisodesIncluded,
      ]),
    ).toEqual([
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ])
    for (const cell of evaluation.helperMatrix) {
      expect(cell.expectedPersonalizationMode).toBe(
        cell.curatedLedgerIncluded ? 'EVIDENCE_AWARE' : 'NO_RELEVANT_EVIDENCE',
      )
      expect(cell.mayReferenceAcceptedPastEvidence).toBe(cell.curatedLedgerIncluded)
      expect(cell.mayUseRecentConversationContinuity).toBe(cell.recentEpisodesIncluded)
    }
    expect(evaluation.helperMatrix.find((cell) => cell.id === 'L0_R1')).toMatchObject({
      mustNotDescribeRecentHistoryAsAcceptedEvidence: true,
    })
    expect(evaluation.helperMatrix.find((cell) => cell.id === 'L1_R1')).toMatchObject({
      mustKeepLedgerAndEpisodeProvenanceSeparate: true,
    })
    expect(evaluation.discoveryPair).toEqual([
      expect.objectContaining({ curatedLedgerIncluded: false, recentEpisodesIncluded: false }),
      expect.objectContaining({ curatedLedgerIncluded: true, recentEpisodesIncluded: false }),
    ])
    expect(evaluation.reviewBoundary.deterministicChecks.length).toBeGreaterThan(0)
    expect(evaluation.reviewBoundary.humanReviewRequired.length).toBeGreaterThan(0)
  })

  it('revises the clean semantic oracle by claim profile and claim temporality', async () => {
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.7-claim-temporality.json',
    )) as {
      readonly promptVersion: string
      readonly revisesFixture: string
      readonly modelRunStatus: string
      readonly claimBoundary: string
      readonly cases: readonly {
        readonly id: string
        readonly precedingAgentContribution: string | null
        readonly userMessage: string
        readonly decisionRequest?: {
          readonly recommendedOptionIndex: number
          readonly agentHintMustNotContain: readonly string[]
        } & Readonly<Record<string, unknown>>
        readonly decisionResolution?: {
          readonly selectedOptionIndex: number
          readonly rationale: string
        }
        readonly expected: {
          readonly oracleMode: string
          readonly minimumStateSupportingProposals?: number
          readonly maximumStateSupportingProposals?: number
          readonly forbiddenSignals?: readonly string[]
          readonly claimProfiles?: readonly {
            readonly id: string
            readonly claimExcerpts: readonly string[]
            readonly allowedSignals: readonly string[]
            readonly allowedStrengths: readonly string[]
            readonly allowedPromptDependence: readonly string[]
            readonly allowedMaximumSupportedStates: readonly (string | null)[]
          }[]
        }
      }[]
    }
    const prior = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.6-clean-semantics.json',
    )) as { readonly promptVersion: string; readonly modelRunStatus: string }
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/evidence-analyst.md'),
      'utf8',
    )

    expect(fixture).toMatchObject({
      promptVersion: '1.0.7',
      revisesFixture: 'evidence-analyst-v1.0.6-clean-semantics.json',
      modelRunStatus: 'NOT_RUN',
    })
    expect(prior).toEqual(
      expect.objectContaining({
        promptVersion: '1.0.6',
        modelRunStatus: 'NOT_RUN',
      }),
    )
    expect(fixture.claimBoundary).toContain('does not retcon the v1.0.6 fixture')
    expect(prompt).toContain('Prompt version: `1.0.7`')
    expect(prompt).toContain('발화 시점에 아직 관찰하지 않은')
    expect(prompt).toContain('일반 조건·정의나 이미 확인한 과거 관찰')

    expect(fixture.cases.map((item) => item.id)).toEqual([
      'request_only',
      'future_plan_after_light_hint',
      'own_explanation_independent',
      'actual_reasoned_choice',
      'actual_performed_application',
      'directly_led_repeat',
      'independent_future_prediction',
    ])
    for (const item of fixture.cases) {
      expect('proposalCount' in item.expected).toBe(false)
      for (const profile of item.expected.claimProfiles ?? []) {
        expect(profile.claimExcerpts.length).toBeGreaterThan(0)
        for (const excerpt of profile.claimExcerpts) expect(item.userMessage).toContain(excerpt)
      }
    }

    const choice = fixture.cases.find((item) => item.id === 'actual_reasoned_choice')
    expect(choice?.decisionRequest).toBeDefined()
    expect(choice?.decisionResolution).toBeDefined()
    const { agentHintMustNotContain = [], ...agentDecisionRequest } = choice?.decisionRequest ?? {}
    const agentChoiceContext = JSON.stringify({
      precedingAgentContribution: choice?.precedingAgentContribution,
      decisionRequest: agentDecisionRequest,
    })
    for (const forbidden of agentHintMustNotContain)
      expect(agentChoiceContext).not.toContain(forbidden)
    expect(choice?.decisionRequest?.recommendedOptionIndex).not.toBe(
      choice?.decisionResolution?.selectedOptionIndex,
    )

    expect(
      fixture.cases.find((item) => item.id === 'own_explanation_independent')?.expected,
    ).toMatchObject({ forbiddenSignals: expect.arrayContaining(['PREDICTION']) })
    expect(
      fixture.cases.find((item) => item.id === 'actual_performed_application')?.expected,
    ).toMatchObject({ forbiddenSignals: expect.arrayContaining(['PREDICTION']) })
    expect(
      fixture.cases.find((item) => item.id === 'independent_future_prediction')?.expected
        .claimProfiles,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          allowedSignals: ['PREDICTION'],
          allowedStrengths: ['STRONG'],
          allowedPromptDependence: ['INDEPENDENT'],
          allowedMaximumSupportedStates: ['DEMONSTRATED'],
        }),
      ]),
    )
  })

  it('withholds unverifiable prior-Agent claims and separates tentative plans from actual choices', async () => {
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.5-application-dependence.json',
    )) as {
      readonly promptVersion: string
      readonly containsPersonalData: boolean
      readonly redactionStatus: string
      readonly liveNativeResult: string
      readonly cases: readonly {
        readonly id: string
        readonly providedAgentReply: string | null
        readonly referencesPriorAgent: boolean
        readonly userMessage: string
        readonly userAuthoredClaimExcerpt: string
        readonly expected: {
          readonly stateSupportingProposalCount: number
          readonly allowedSignals?: readonly string[]
          readonly allowedStrengths?: readonly string[]
          readonly allowedPromptDependence?: readonly string[]
          readonly allowedMaximumSupportedStates?: readonly string[]
          readonly maximumSupportedState?: string | null
        }
      }[]
    }
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/evidence-analyst.md'),
      'utf8',
    )
    expect(fixture).toMatchObject({
      promptVersion: '1.0.5',
      containsPersonalData: false,
      redactionStatus: 'VERIFIED_REDACTED',
      liveNativeResult: 'PENDING',
    })
    expect(prompt).toContain('Prompt version: `1.0.7`')
    expect(prompt).toContain('실제로 선택한 이유 있는 제품·기술 방향')
    expect(prompt).toContain('그 답이 방향만 제시했는지 이미 결론을 제공했는지 확인할 수 없다')
    expect(prompt).toContain('같은 Task에서 방금 들은 설명을 바로 사용한 것은 Transfer가 아니다')
    expect(fixture.cases).toHaveLength(4)
    expect(new Set(fixture.cases.map((item) => item.id)).size).toBe(fixture.cases.length)
    for (const item of fixture.cases) {
      expect(item.userMessage).toContain(item.userAuthoredClaimExcerpt)
      if (item.providedAgentReply !== null)
        expect(item.providedAgentReply.length).toBeGreaterThan(0)
    }
    expect(fixture.cases.find((item) => item.id === 'unavailable_prior_answer')).toMatchObject({
      providedAgentReply: null,
      referencesPriorAgent: true,
      expected: { stateSupportingProposalCount: 0 },
    })
    expect(
      fixture.cases.find((item) => item.id === 'visible_direct_repeat')?.expected,
    ).toMatchObject({
      stateSupportingProposalCount: 0,
      allowedPromptDependence: ['DIRECTLY_LED'],
      maximumSupportedState: null,
    })
    expect(
      fixture.cases.find((item) => item.id === 'independent_tentative_plan')?.expected,
    ).toMatchObject({
      stateSupportingProposalCount: 1,
      allowedSignals: ['PREDICTION', 'REPHRASE'],
      allowedMaximumSupportedStates: ['EXPLAINED'],
    })
    expect(
      fixture.cases.find((item) => item.id === 'reasoned_project_choice_after_direction_only')
        ?.expected,
    ).toMatchObject({
      stateSupportingProposalCount: 1,
      allowedSignals: ['JUSTIFIED_DECISION'],
      allowedStrengths: ['STRONG'],
      allowedMaximumSupportedStates: ['DEMONSTRATED'],
    })
  })

  it('separates an analysis request from user-authored claims inside questions', async () => {
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.4-request-versus-claim.json',
    )) as {
      readonly promptVersion: string
      readonly containsPersonalData: boolean
      readonly redactionStatus: string
      readonly liveNativeResult: string
      readonly cases: readonly {
        readonly id: string
        readonly userMessage: string
        readonly userAuthoredClaimExcerpt: string | null
        readonly expected: {
          readonly proposalCount: number
          readonly allowedSignals?: readonly string[]
          readonly allowedStrengths?: readonly string[]
          readonly allowedMaximumSupportedStates?: readonly string[]
        }
      }[]
    }
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/evidence-analyst.md'),
      'utf8',
    )
    expect(fixture).toMatchObject({
      promptVersion: '1.0.4',
      containsPersonalData: false,
      redactionStatus: 'VERIFIED_REDACTED',
      liveNativeResult: 'PENDING',
    })
    expect(prompt).toContain('요청의 구체성, 신중한 표현, 좋은 질문 의도만으로')
    expect(prompt).toContain(
      '선택지들을 나열하거나 선택하면 어떻게 되는지 묻는 조건문은 선택이 아니다',
    )
    expect(prompt).toContain('질문형 안에 실제 사용자 주장이 있으면 그 주장만 별도로 평가하라')

    const request = fixture.cases.find((item) => item.id === 'analysis_request_only')
    expect(request).toMatchObject({
      userAuthoredClaimExcerpt: null,
      expected: { proposalCount: 0 },
    })
    const claimCases = fixture.cases.filter((item) => item.userAuthoredClaimExcerpt !== null)
    expect(claimCases).toHaveLength(2)
    for (const item of claimCases) {
      expect(item.userMessage).toContain(item.userAuthoredClaimExcerpt)
      expect(item.expected.proposalCount).toBe(1)
      expect(item.expected.allowedSignals?.length).toBeGreaterThan(0)
      expect(item.expected.allowedStrengths?.length).toBeGreaterThan(0)
      expect(item.expected.allowedMaximumSupportedStates?.length).toBeGreaterThan(0)
    }
    expect(
      fixture.cases.find((item) => item.id === 'prediction_inside_question')?.expected,
    ).toMatchObject({
      allowedSignals: ['PREDICTION', 'REPHRASE'],
    })
    expect(
      fixture.cases.find((item) => item.id === 'reasoned_choice_then_question')?.expected,
    ).toMatchObject({
      allowedSignals: ['JUSTIFIED_DECISION'],
    })
  })

  it('keeps a long synthetic utterance in a bounded concept phrase and exact user reference', async () => {
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.2-bounds.json',
    )) as {
      readonly promptVersion: string
      readonly containsPersonalData: boolean
      readonly longUserMessage: string
      readonly conceptPhrase: string
      readonly redactedExcerpt: string
      readonly userEvidenceSource: {
        readonly kind: 'USER_MESSAGE'
        readonly conversationId: string
        readonly messageId: string
      }
      readonly episodeId: string
      readonly correlationId: string
    }
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/evidence-analyst.md'),
      'utf8',
    )
    expect(fixture).toMatchObject({ promptVersion: '1.0.2', containsPersonalData: false })
    expect(prompt).toContain('Prompt version: `1.0.7`')
    expect(prompt).toContain('최대 120자')
    expect(fixture.longUserMessage.length).toBeGreaterThan(120)

    const semanticResult = {
      schemaVersion: 1,
      episodeId: fixture.episodeId,
      episodeRevision: 1,
      correlationId: fixture.correlationId,
      proposals: [
        {
          concept: {
            originalExpression: fixture.conceptPhrase,
            proposedCanonicalName: 'runtime validation',
          },
          signal: 'QUESTION',
          strength: 'WEAK',
          promptDependence: 'INDEPENDENT',
          userEvidenceSources: [fixture.userEvidenceSource],
          contextSources: [],
          redactedEvidenceExcerpt: fixture.redactedExcerpt,
          rationale: 'The user asks about runtime field checks but has not demonstrated use.',
          maximumSupportedState: null,
          misconception: { action: 'NONE' },
        },
      ],
    }
    expect(analystSemanticResultSchema.safeParse(semanticResult).success).toBe(true)
    expect(
      analystSemanticResultSchema.safeParse({
        ...semanticResult,
        proposals: [
          {
            ...semanticResult.proposals[0],
            concept: {
              ...semanticResult.proposals[0]?.concept,
              originalExpression: fixture.longUserMessage,
            },
            userEvidenceSources: [
              { ...fixture.userEvidenceSource, excerpt: fixture.redactedExcerpt },
            ],
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('requires a user-authored original expression in every Proposal or an empty result', async () => {
    const fixture = (await loadInput(
      'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.3-required-expression.json',
    )) as {
      readonly promptVersion: string
      readonly containsPersonalData: boolean
      readonly userMessage: string
      readonly conceptPhrase: string
      readonly episodeId: string
      readonly correlationId: string
      readonly userEvidenceSource: {
        readonly kind: 'USER_MESSAGE'
        readonly conversationId: string
        readonly messageId: string
      }
    }
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/evidence-analyst.md'),
      'utf8',
    )
    expect(fixture).toMatchObject({ promptVersion: '1.0.3', containsPersonalData: false })
    expect(fixture.userMessage).toContain(fixture.conceptPhrase)
    expect(prompt).toContain('Prompt version: `1.0.7`')
    expect(prompt).toContain('`concept.originalExpression`은 생략할 수 없는')

    const proposal = {
      concept: {
        originalExpression: fixture.conceptPhrase,
        proposedCanonicalName: '기준 날짜 주입',
      },
      signal: 'REPHRASE',
      strength: 'MEDIUM',
      promptDependence: 'INDEPENDENT',
      userEvidenceSources: [fixture.userEvidenceSource],
      contextSources: [],
      redactedEvidenceExcerpt: fixture.userMessage,
      rationale:
        'The user explains how an injected reference date makes a boundary test reproducible.',
      maximumSupportedState: 'EXPLAINED',
      misconception: { action: 'NONE' },
    }
    const result = {
      schemaVersion: 1,
      episodeId: fixture.episodeId,
      episodeRevision: 1,
      correlationId: fixture.correlationId,
      proposals: [proposal],
    }
    expect(analystSemanticResultSchema.safeParse(result).success).toBe(true)
    expect(
      analystSemanticResultSchema.safeParse({
        ...result,
        proposals: [{ ...proposal, concept: { proposedCanonicalName: '기준 날짜 주입' } }],
      }).success,
    ).toBe(false)
    expect(
      analystSemanticResultSchema.safeParse({
        ...result,
        proposals: [],
        noEvidenceReason: 'No direct USER phrase supports a Concept proposal in this Episode.',
      }).success,
    ).toBe(true)
  })

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
