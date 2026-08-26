import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import {
  evaluationCriterionResultSchema,
  evaluationFixtureSchema,
  type EvaluationCriterionResult,
  type EvaluationFixture,
} from '@vibe-helper/contracts'

import { parseEvaluationSubject } from './subject.js'
import type { LoadedCalibrationCase } from './types.js'

async function readJson(location: string): Promise<unknown> {
  return JSON.parse(await readFile(location, 'utf8')) as unknown
}

export async function loadEvaluationFixtures(
  workspaceRoot: string,
): Promise<readonly EvaluationFixture[]> {
  const manifestsDirectory = path.join(workspaceRoot, 'tests/eval/fixtures/manifests')
  const entries = (await readdir(manifestsDirectory))
    .filter((entry) => entry.endsWith('.json'))
    .sort()
  return Promise.all(
    entries.map(async (entry) =>
      evaluationFixtureSchema.parse(await readJson(path.join(manifestsDirectory, entry))),
    ),
  )
}

function parseHumanReviews(value: unknown): readonly EvaluationCriterionResult[] {
  if (!Array.isArray(value)) throw new Error('Human review file must contain an array')
  return value.map((review) => evaluationCriterionResultSchema.parse(review))
}

function indexHumanReviews(
  fixture: EvaluationFixture,
  reviews: readonly EvaluationCriterionResult[],
): ReadonlyMap<string, EvaluationCriterionResult> {
  const indexed = new Map<string, EvaluationCriterionResult>()
  for (const review of reviews) {
    const criterion = fixture.criteria.find((candidate) => candidate.key === review.criterionKey)
    if (
      criterion === undefined ||
      criterion.reviewMode !== 'HUMAN' ||
      review.reviewMode !== 'HUMAN' ||
      review.dimension !== criterion.dimension ||
      !['PASSED', 'FAILED'].includes(review.status) ||
      indexed.has(review.criterionKey)
    ) {
      throw new Error(`Invalid human review ${review.criterionKey} for fixture ${fixture.id}`)
    }
    indexed.set(review.criterionKey, review)
  }
  return indexed
}

export async function loadCalibrationCases(
  workspaceRoot: string,
): Promise<readonly LoadedCalibrationCase[]> {
  const fixtures = await loadEvaluationFixtures(workspaceRoot)
  return Promise.all(
    fixtures.flatMap((fixture) => {
      const subjectPath = fixture.calibrationSubjectPath
      const reviewPath = fixture.calibrationReviewPath
      return subjectPath === undefined
        ? []
        : [
            (async (): Promise<LoadedCalibrationCase> => {
              const subject = parseEvaluationSubject(
                await readJson(path.join(workspaceRoot, subjectPath)),
              )
              const reviews =
                reviewPath === undefined
                  ? []
                  : parseHumanReviews(await readJson(path.join(workspaceRoot, reviewPath)))
              return {
                fixture,
                subject,
                humanReviews: indexHumanReviews(fixture, reviews),
              }
            })(),
          ]
    }),
  )
}
