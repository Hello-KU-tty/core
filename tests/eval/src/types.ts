import type {
  EvaluationCriterion,
  EvaluationCriterionResult,
  EvaluationFixture,
} from '@vibe-helper/contracts'

export interface EvaluationSubject {
  readonly schemaVersion: 1
  readonly discovery?: {
    readonly round: unknown
    readonly candidates: readonly unknown[]
  }
  readonly learningSpec?: unknown
  readonly builderTask?: unknown
  readonly liveContext?: unknown
  readonly completionReport?: unknown
  readonly decision?: unknown
  readonly activityEvent?: unknown
  readonly episode?: unknown
  readonly evidence?: {
    readonly proposal: unknown
    readonly episode: unknown
    readonly episodeRevision: unknown
    readonly events: readonly unknown[]
    readonly decisionResolutions?: readonly unknown[]
    readonly concept: unknown
    readonly priorAcceptedEvidence: readonly unknown[]
    readonly metadata: unknown
    readonly expectedOutcome: 'ACCEPTED' | 'REJECTED'
    readonly expectedReasonCode: string
  }
  readonly conceptLedger?: unknown
  readonly audit?: unknown
  readonly scopeExpectation?: {
    readonly learnerFocusConcepts: readonly string[]
    readonly agentSupportConcepts: readonly string[]
    readonly excludedFeatureTerms: readonly string[]
  }
  readonly contextExpectation?: {
    readonly latestContextVersion: number
    readonly requiredActiveDecisionIds: readonly string[]
    readonly requiredConceptNames: readonly string[]
  }
  readonly redaction?: {
    readonly output: unknown
    readonly forbiddenSentinels: readonly string[]
  }
  readonly helperInteraction?: {
    readonly freshness?: 'CURRENT' | 'STALE' | 'MISSING'
    readonly conceptState?: 'OBSERVED' | 'EXPLAINED' | 'DEMONSTRATED' | 'TRANSFERRED'
    readonly quickActions?: readonly string[]
    readonly firstAnswer?: string
    readonly analogyQuestion?: string
    readonly analogyAnswer?: string
    readonly highStateAnswer?: string
    readonly confirmedSpecBaseline?: string
    readonly question?: string
    readonly answer?: string
    readonly builderMessage?: string
  }
  readonly specRevisionInteraction?: {
    readonly confirmedScope: string
    readonly userMessage: string
    readonly builderResponse: string
    readonly requiredAction: 'REQUEST_DECISION_AND_RECORD_SPEC_DEVIATION'
  }
  readonly analystInteraction?: {
    readonly result: unknown
    readonly events: readonly unknown[]
  }
}

export interface EvaluationScorerContext {
  readonly fixture: EvaluationFixture
  readonly criterion: EvaluationCriterion
  readonly subject: EvaluationSubject
}

export interface EvaluationScorer {
  readonly key: string
  score(context: EvaluationScorerContext): EvaluationCriterionResult
}

export type HumanReviewMap = ReadonlyMap<string, EvaluationCriterionResult>

export interface LoadedCalibrationCase {
  readonly fixture: EvaluationFixture
  readonly subject: EvaluationSubject
  readonly humanReviews: HumanReviewMap
}
