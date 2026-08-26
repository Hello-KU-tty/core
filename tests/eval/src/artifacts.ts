import {
  baselineResultSchema,
  evaluationRunSchema,
  type BaselineResult,
  type EvaluationCaseResult,
  type EvaluationRun,
} from '@vibe-helper/contracts'

import { evaluateCalibrationCorpus } from './harness.js'
import type { LoadedCalibrationCase } from './types.js'

export interface CalibrationArtifactOptions {
  readonly evaluationRunId: string
  readonly baselineResultId: string
  readonly correlationId: string
  readonly evaluatorVersion: string
  readonly systemUnderTestVersion: string
  readonly baselineName: string
  readonly baselineVersion: string
  readonly startedAt: string
  readonly completedAt: string
}

function runStatus(results: readonly EvaluationCaseResult[]): EvaluationRun['status'] {
  if (results.some((result) => result.status === 'ERROR')) return 'FAILED'
  if (results.some((result) => result.status === 'NEEDS_REVIEW')) return 'NEEDS_REVIEW'
  return 'COMPLETED'
}

export function createCalibrationArtifacts(
  cases: readonly LoadedCalibrationCase[],
  options: CalibrationArtifactOptions,
): { readonly run: EvaluationRun; readonly baseline: BaselineResult } {
  const results = evaluateCalibrationCorpus(cases)
  const run = evaluationRunSchema.parse({
    schemaVersion: 1,
    id: options.evaluationRunId,
    correlationId: options.correlationId,
    revision: 1,
    evaluatorVersion: options.evaluatorVersion,
    systemUnderTestVersion: options.systemUnderTestVersion,
    fixtureIds: results.map((result) => result.fixtureId),
    status: runStatus(results),
    startedAt: options.startedAt,
    completedAt: options.completedAt,
    results,
    redactionStatus: 'VERIFIED_REDACTED',
  })
  const baseline = baselineResultSchema.parse({
    schemaVersion: 1,
    id: options.baselineResultId,
    evaluationRunId: run.id,
    correlationId: options.correlationId,
    kind: 'CALIBRATION',
    baselineName: options.baselineName,
    baselineVersion: options.baselineVersion,
    results,
    recordedAt: options.completedAt,
    redactionStatus: 'VERIFIED_REDACTED',
  })
  return { run, baseline }
}
