import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  discoverySubmitCandidatePreviewsToolInputSchema,
  operationErrorSchema,
} from '../packages/contracts/dist/index.js'
import { previewInputFailure } from './native-discovery-preview-validation.mjs'

const id = (prefix, number) =>
  `${prefix}_00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const binding = {
  role: 'DISCOVERY',
  projectId: id('project', 1),
  discoverySessionId: id('discovery_session', 2),
  correlationId: id('corr', 3),
}
const previews = Array.from({ length: 10 }, (_, index) => ({
  title: `Preview ${index + 1}`,
  summary: `Distinct useful direction ${index + 1}.`,
  coreInteraction: `Run interaction ${index + 1} and inspect its result.`,
  appeal: `Makes direction ${index + 1} tangible.`,
  technologyNecessity: `Input types affect direction ${index + 1}.`,
  generationTags: ['DIRECT'],
}))
const validInput = {
  schemaVersion: 1,
  projectId: binding.projectId,
  discoverySessionId: binding.discoverySessionId,
  correlationId: binding.correlationId,
  idempotencyKey: id('idem', 4),
  expectedSessionRevision: 1,
  previews,
  generationRationale: 'Ten useful directions with distinct interactions.',
}

test('an eleven-preview envelope yields bounded retry guidance, preserving all ten-contract data', () => {
  assert.equal(discoverySubmitCandidatePreviewsToolInputSchema.safeParse(validInput).success, true)
  const marker = 'DO_NOT_ECHO_PREVIEW_TEXT'
  const invalidInput = {
    ...validInput,
    previews: [...previews, { ...previews[0], title: marker }],
  }
  const failure = previewInputFailure(binding, invalidInput)
  assert(failure)
  assert.equal(failure.result.isError, true)
  assert.deepEqual(operationErrorSchema.parse(failure.result.structuredContent).issues, [
    {
      path: ['previews'],
      code: 'TOO_MANY',
      message: 'Exactly 10 previews are required; received 11.',
    },
  ])
  assert.deepEqual(failure.receipt, {
    event: 'DISCOVERY_PREVIEW_INPUT_REJECTED',
    role: 'DISCOVERY',
    code: 'DISCOVERY_PREVIEW_COUNT_INVALID',
    issuePaths: [['previews']],
    issueCodes: ['TOO_MANY'],
    expectedCount: 10,
    actualCount: 11,
  })
  assert.equal(JSON.stringify(failure).includes(marker), false)
  assert.equal(failure.result.structuredContent.disposition, 'RETRYABLE')
  assert.equal(previewInputFailure(binding, validInput), null)
})

test('other field errors reveal only known schema paths, never Agent-authored values', () => {
  const marker = 'DO_NOT_ECHO_BAD_FIELD'
  const failure = previewInputFailure(binding, {
    ...validInput,
    previews: previews.map((preview, index) => (index === 0 ? { ...preview, title: '' } : preview)),
    generationRationale: marker,
    extraField: marker,
  })
  assert(failure)
  assert.equal(failure.result.structuredContent.code, 'DISCOVERY_PREVIEW_INPUT_INVALID')
  assert(failure.result.structuredContent.issues.length > 0)
  assert(failure.result.structuredContent.issues.length <= 8)
  assert.equal(JSON.stringify(failure).includes(marker), false)
  assert.equal(previewInputFailure({ ...binding, projectId: id('project', 99) }, validInput), null)
})
