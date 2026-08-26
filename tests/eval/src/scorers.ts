import {
  acceptedEvidenceSchema,
  activityEventSchema,
  auditRecordSchema,
  candidateRoundSchema,
  canonicalConceptSchema,
  conceptLedgerEntrySchema,
  decisionRequestSchema,
  episodeSchema,
  evaluationCriterionResultSchema,
  evidenceProposalSchema,
  learningSpecRevisionSchema,
  liveProjectContextSchema,
  projectCandidateRevisionSchema,
  type EvaluationCriterionResult,
  type EvaluationDimension,
  type EvaluationFixture,
} from '@vibe-helper/contracts'
import { evaluateEvidenceProposal, type EvidenceDecisionMetadata } from '@vibe-helper/domain'

import { asRecord } from './subject.js'
import type { EvaluationScorer, EvaluationScorerContext, EvaluationSubject } from './types.js'

type CriterionStatus = EvaluationCriterionResult['status']

function result(
  context: EvaluationScorerContext,
  status: CriterionStatus,
  explanation: string,
  evidenceReferences: readonly string[] = [],
  metrics: EvaluationCriterionResult['metrics'] = [],
): EvaluationCriterionResult {
  return evaluationCriterionResultSchema.parse({
    criterionKey: context.criterion.key,
    dimension: context.criterion.dimension,
    reviewMode: 'AUTOMATED',
    status,
    explanation,
    evidenceReferences,
    metrics,
  })
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function contractFailure(
  context: EvaluationScorerContext,
  domain: string,
): EvaluationCriterionResult {
  return result(context, 'FAILED', `${domain} payload failed its strict runtime contract.`)
}

function scoreContractIntegrity(context: EvaluationScorerContext): EvaluationCriterionResult {
  const { fixture, subject } = context
  for (const domain of fixture.expectedContractDomains) {
    if (domain === 'DISCOVERY') {
      if (subject.discovery === undefined) return contractFailure(context, domain)
      const round = candidateRoundSchema.safeParse(subject.discovery.round)
      const candidates = subject.discovery.candidates.map((candidate) =>
        projectCandidateRevisionSchema.safeParse(candidate),
      )
      if (!round.success || candidates.some((candidate) => !candidate.success)) {
        return contractFailure(context, domain)
      }
      const submitted = new Set(
        candidates
          .filter((candidate) => candidate.success)
          .map((candidate) => `${candidate.data.id}:${candidate.data.revision}`),
      )
      if (
        round.data.candidates.some(
          (candidate) => !submitted.has(`${candidate.candidateId}:${candidate.revision}`),
        )
      ) {
        return result(
          context,
          'FAILED',
          'Candidate Round references a Candidate revision missing from the subject.',
        )
      }
    } else if (
      domain === 'LEARNING_SPEC' &&
      !learningSpecRevisionSchema.safeParse(subject.learningSpec).success
    ) {
      return contractFailure(context, domain)
    } else if (
      domain === 'BUILD' &&
      !liveProjectContextSchema.safeParse(subject.liveContext).success
    ) {
      return contractFailure(context, domain)
    } else if (
      domain === 'DECISION' &&
      !decisionRequestSchema.safeParse(subject.decision).success
    ) {
      return contractFailure(context, domain)
    } else if (
      domain === 'ACTIVITY' &&
      !activityEventSchema.safeParse(subject.activityEvent).success
    ) {
      return contractFailure(context, domain)
    } else if (domain === 'EPISODE' && !episodeSchema.safeParse(subject.episode).success) {
      return contractFailure(context, domain)
    } else if (
      domain === 'EVIDENCE' &&
      !evidenceProposalSchema.safeParse(subject.evidence?.proposal).success
    ) {
      return contractFailure(context, domain)
    } else if (
      domain === 'CONCEPT_LEDGER' &&
      !conceptLedgerEntrySchema.safeParse(subject.conceptLedger).success
    ) {
      return contractFailure(context, domain)
    } else if (domain === 'AUDIT' && !auditRecordSchema.safeParse(subject.audit).success) {
      return contractFailure(context, domain)
    }
  }
  return result(
    context,
    'PASSED',
    'All contract domains requested by the fixture passed strict runtime validation.',
    fixture.expectedContractDomains,
  )
}

function scoreModeCollapse(context: EvaluationScorerContext): EvaluationCriterionResult {
  const parsed = context.subject.discovery?.candidates.map((candidate) =>
    projectCandidateRevisionSchema.safeParse(candidate),
  )
  if (parsed === undefined || parsed.length < 2 || parsed.some((candidate) => !candidate.success)) {
    return result(context, 'ERROR', 'Mode-collapse scoring requires at least two valid Candidates.')
  }
  const candidates = parsed.flatMap((candidate) => (candidate.success ? [candidate.data] : []))
  const signatures = candidates.map((candidate) =>
    normalize(
      [
        candidate.targetUsers.join(' '),
        candidate.coreInteraction,
        [...candidate.mvpFeatures].sort().join(' '),
      ].join(' | '),
    ),
  )
  const distinctCount = new Set(signatures).size
  const ratio = distinctCount / signatures.length
  return result(
    context,
    distinctCount === signatures.length ? 'PASSED' : 'FAILED',
    distinctCount === signatures.length
      ? 'No exact structural Candidate signature was repeated.'
      : 'At least two Candidates repeat the same target-user, interaction and feature structure.',
    ['discovery.candidates'],
    [
      {
        name: 'distinct structural signatures',
        value: ratio,
        unit: 'RATIO',
        interpretation:
          'Exact normalized target-user, core-interaction and MVP-feature signatures only; semantic diversity still requires human review.',
      },
    ],
  )
}

function scopeContains(
  scope: ReadonlyArray<{
    readonly category: string
    readonly title: string
    readonly conceptNames: readonly string[]
  }>,
  category: string,
  term: string,
): boolean {
  const normalizedTerm = normalize(term)
  return scope
    .filter((item) => item.category === category)
    .some((item) =>
      normalize([item.title, ...item.conceptNames].join(' ')).includes(normalizedTerm),
    )
}

function scoreScopeBoundaries(context: EvaluationScorerContext): EvaluationCriterionResult {
  const spec = learningSpecRevisionSchema.safeParse(context.subject.learningSpec)
  const expectation = context.subject.scopeExpectation
  if (!spec.success || expectation === undefined) {
    return result(context, 'ERROR', 'Scope scoring requires a valid Learning Spec and expectation.')
  }
  const missingLearnerFocus = expectation.learnerFocusConcepts.filter(
    (term) => !scopeContains(spec.data.scope, 'LEARNER_FOCUS', term),
  )
  const missingAgentSupport = expectation.agentSupportConcepts.filter(
    (term) => !scopeContains(spec.data.scope, 'AGENT_SUPPORT', term),
  )
  const includedExcluded = expectation.excludedFeatureTerms.filter((term) => {
    const normalizedTerm = normalize(term)
    return spec.data.mvpFeatures.some((feature) => normalize(feature).includes(normalizedTerm))
  })
  const failures = [
    ...missingLearnerFocus.map((term) => `missing LEARNER_FOCUS ${term}`),
    ...missingAgentSupport.map((term) => `missing AGENT_SUPPORT ${term}`),
    ...includedExcluded.map((term) => `EXCLUDED feature included in MVP ${term}`),
  ]
  return result(
    context,
    failures.length === 0 ? 'PASSED' : 'FAILED',
    failures.length === 0
      ? 'Fixture-declared scope boundaries are preserved.'
      : `Scope boundary violations: ${failures.join('; ')}.`,
    ['learningSpec.scope', 'learningSpec.mvpFeatures'],
  )
}

function scoreContextFreshness(context: EvaluationScorerContext): EvaluationCriterionResult {
  const liveContext = liveProjectContextSchema.safeParse(context.subject.liveContext)
  const expectation = context.subject.contextExpectation
  if (!liveContext.success || expectation === undefined) {
    return result(
      context,
      'ERROR',
      'Context scoring requires a valid Live Context and expectation.',
    )
  }
  const missingDecisions = expectation.requiredActiveDecisionIds.filter(
    (id) => !liveContext.data.activeDecisionIds.includes(id),
  )
  const normalizedConcepts = new Set(liveContext.data.activeConceptNames.map(normalize))
  const missingConcepts = expectation.requiredConceptNames.filter(
    (concept) => !normalizedConcepts.has(normalize(concept)),
  )
  const stale = liveContext.data.contextVersion < expectation.latestContextVersion
  const incomplete = missingDecisions.length > 0 || missingConcepts.length > 0
  return result(
    context,
    stale || incomplete ? 'FAILED' : 'PASSED',
    stale || incomplete
      ? `Context is stale or incomplete: latest=${expectation.latestContextVersion}, actual=${liveContext.data.contextVersion}, missing decisions=${missingDecisions.length}, missing concepts=${missingConcepts.length}.`
      : 'Live Context is current and includes fixture-required Decisions and Concepts.',
    [
      'liveContext.contextVersion',
      'liveContext.activeDecisionIds',
      'liveContext.activeConceptNames',
    ],
  )
}

function evidenceMetadata(value: unknown): EvidenceDecisionMetadata | null {
  const record = asRecord(value)
  if (record === null) return null
  const values = [
    record.proposalId,
    record.decisionId,
    record.acceptedEvidenceId,
    record.decidedAt,
    record.acceptedAt,
  ]
  if (!values.every((item) => typeof item === 'string')) return null
  return {
    proposalId: record.proposalId as string,
    decisionId: record.decisionId as string,
    acceptedEvidenceId: record.acceptedEvidenceId as string,
    decidedAt: record.decidedAt as string,
    acceptedAt: record.acceptedAt as string,
  }
}

function scoreEvidencePolicy(context: EvaluationScorerContext): EvaluationCriterionResult {
  const subject = context.subject.evidence
  if (subject === undefined || !Number.isInteger(subject.episodeRevision)) {
    return result(context, 'ERROR', 'Evidence policy scoring requires a complete Evidence subject.')
  }
  const episode = episodeSchema.safeParse(subject.episode)
  const events = subject.events.map((event) => activityEventSchema.safeParse(event))
  const concept = canonicalConceptSchema.safeParse(subject.concept)
  const prior = subject.priorAcceptedEvidence.map((evidence) =>
    acceptedEvidenceSchema.safeParse(evidence),
  )
  const metadata = evidenceMetadata(subject.metadata)
  if (
    !episode.success ||
    events.some((event) => !event.success) ||
    !concept.success ||
    prior.some((evidence) => !evidence.success) ||
    metadata === null
  ) {
    return result(context, 'ERROR', 'Evidence policy context failed strict validation.')
  }
  try {
    const outcome = evaluateEvidenceProposal({
      proposal: subject.proposal,
      episode: episode.data,
      episodeRevision: subject.episodeRevision as number,
      events: events.flatMap((event) => (event.success ? [event.data] : [])),
      concept: concept.data,
      existingProposalIds: [],
      priorAcceptedEvidence: prior.flatMap((evidence) => (evidence.success ? [evidence.data] : [])),
      metadata,
    })
    const matches =
      outcome.outcome === subject.expectedOutcome &&
      outcome.decision.reasonCode === subject.expectedReasonCode
    return result(
      context,
      matches ? 'PASSED' : 'FAILED',
      matches
        ? `Core reproduced ${outcome.outcome}/${outcome.decision.reasonCode}.`
        : `Expected ${subject.expectedOutcome}/${subject.expectedReasonCode}, received ${outcome.outcome}/${outcome.decision.reasonCode}.`,
      ['evidence.proposal', 'evidence.episode', 'evidence.events'],
    )
  } catch {
    return result(context, 'ERROR', 'Evidence policy scorer threw while applying the fixture.')
  }
}

function scoreRedaction(context: EvaluationScorerContext): EvaluationCriterionResult {
  const probe = context.subject.redaction
  if (probe === undefined || probe.forbiddenSentinels.length === 0) {
    return result(context, 'ERROR', 'Redaction scoring requires at least one synthetic sentinel.')
  }
  const serialized = JSON.stringify(probe.output)
  const leaked = probe.forbiddenSentinels.filter((sentinel) => serialized.includes(sentinel))
  const absolutePathLeak = /(?:\/Users\/|[A-Za-z]:\\Users\\)/u.test(serialized)
  return result(
    context,
    leaked.length === 0 && !absolutePathLeak ? 'PASSED' : 'FAILED',
    leaked.length === 0 && !absolutePathLeak
      ? 'No synthetic sentinel or user-home path remains in the scored output.'
      : `Redaction output leaked ${leaked.length} sentinel(s) or a user-home path.`,
    ['redaction.output'],
    [
      {
        name: 'redaction leaks',
        value: leaked.length + (absolutePathLeak ? 1 : 0),
        unit: 'COUNT',
        interpretation: 'Synthetic sentinel and user-home path occurrences in the output.',
      },
    ],
  )
}

const SCORERS: readonly EvaluationScorer[] = [
  { key: 'contract_valid', score: scoreContractIntegrity },
  { key: 'no_structural_mode_collapse', score: scoreModeCollapse },
  { key: 'scope_boundaries', score: scoreScopeBoundaries },
  { key: 'context_fresh', score: scoreContextFreshness },
  { key: 'evidence_policy', score: scoreEvidencePolicy },
  { key: 'redaction_no_leak', score: scoreRedaction },
]

const scorersByKey = new Map(SCORERS.map((scorer) => [scorer.key, scorer]))

export function scoreAutomatedCriterion(
  context: EvaluationScorerContext,
): EvaluationCriterionResult {
  const scorer = scorersByKey.get(context.criterion.key)
  return scorer === undefined
    ? result(context, 'ERROR', `No automated scorer is registered for ${context.criterion.key}.`)
    : scorer.score(context)
}

export function supportedAutomatedCriterionKeys(): readonly string[] {
  return [...scorersByKey.keys()].sort()
}

export function validateFixtureScorerCoverage(fixture: EvaluationFixture): readonly string[] {
  return fixture.criteria
    .filter((criterion) => criterion.reviewMode === 'AUTOMATED' && !scorersByKey.has(criterion.key))
    .map((criterion) => criterion.key)
}

export function fixtureDimensions(fixture: EvaluationFixture): readonly EvaluationDimension[] {
  return [...new Set(fixture.criteria.map((criterion) => criterion.dimension))]
}

export function redactionSubject(subject: EvaluationSubject): EvaluationSubject['redaction'] {
  return subject.redaction
}
