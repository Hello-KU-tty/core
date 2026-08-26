import {
  evaluationCaseResultSchema,
  evaluationCriterionResultSchema,
  type EvaluationCaseResult,
  type EvaluationCriterionResult,
} from '@vibe-helper/contracts'

import { scoreAutomatedCriterion } from './scorers.js'
import type { LoadedCalibrationCase } from './types.js'

function caseStatus(results: readonly EvaluationCriterionResult[]): EvaluationCaseResult['status'] {
  if (results.some((result) => result.status === 'ERROR')) return 'ERROR'
  if (results.some((result) => result.status === 'FAILED')) return 'FAILED'
  if (results.some((result) => result.status === 'NEEDS_REVIEW')) return 'NEEDS_REVIEW'
  return 'PASSED'
}

function pendingHumanReview(
  loaded: LoadedCalibrationCase,
  criterionIndex: number,
): EvaluationCriterionResult {
  const criterion = loaded.fixture.criteria[criterionIndex]
  if (criterion === undefined) {
    throw new Error('Evaluation criterion index is invalid')
  }
  return evaluationCriterionResultSchema.parse({
    criterionKey: criterion.key,
    dimension: criterion.dimension,
    reviewMode: 'HUMAN',
    status: 'NEEDS_REVIEW',
    explanation: 'This semantic criterion requires a recorded human review.',
    evidenceReferences: [],
    metrics: [],
  })
}

export function evaluateCalibrationCase(loaded: LoadedCalibrationCase): EvaluationCaseResult {
  const criterionResults = loaded.fixture.criteria.map((criterion, index) => {
    if (criterion.reviewMode === 'AUTOMATED') {
      return scoreAutomatedCriterion({
        fixture: loaded.fixture,
        criterion,
        subject: loaded.subject,
      })
    }
    const reviewed = loaded.humanReviews.get(criterion.key)
    if (
      reviewed === undefined ||
      reviewed.reviewMode !== 'HUMAN' ||
      reviewed.dimension !== criterion.dimension
    ) {
      return pendingHumanReview(loaded, index)
    }
    return reviewed
  })
  return evaluationCaseResultSchema.parse({
    fixtureId: loaded.fixture.id,
    fixtureVersion: loaded.fixture.fixtureVersion,
    status: caseStatus(criterionResults),
    criterionResults,
    metrics: criterionResults.flatMap((criterion) => criterion.metrics),
    notes: [],
  })
}

export function evaluateCalibrationCorpus(
  cases: readonly LoadedCalibrationCase[],
): readonly EvaluationCaseResult[] {
  return [...cases]
    .sort((left, right) => left.fixture.id.localeCompare(right.fixture.id))
    .map(evaluateCalibrationCase)
}
