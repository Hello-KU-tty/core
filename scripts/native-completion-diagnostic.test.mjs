import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { describeCompletionInput } from './native-completion-diagnostic.mjs'

test('Completion shape diagnostics report only known field paths, indices and types', () => {
  const report = {
    implementedFeatures: ['Synthetic feature'],
    acceptanceResults: [
      { criterionKey: 'criterion_1', status: 'PASSED', evidence: 'fixture-secret' },
    ],
    validationResults: [],
    conceptUsage: [],
    appliedDecisionIds: [],
    codeReferences: [],
    diffReferences: [],
    specDeviations: [],
    remainingIssues: [],
    limitations: [],
  }
  const result = describeCompletionInput({
    schemaVersion: 1,
    projectId: 'project_11111111-1111-4111-8111-111111111111',
    taskId: 'task_11111111-1111-4111-8111-111111111111',
    correlationId: 'corr_11111111-1111-4111-8111-111111111111',
    idempotencyKey: 'idem_11111111-1111-4111-8111-111111111111',
    expectedTaskRevision: 2,
    report,
  })
  assert.equal(result.validShape, false)
  assert(
    result.issues.some(
      (issue) =>
        issue.field === 'acceptanceResults' &&
        issue.index === 0 &&
        issue.nested === 'evidence' &&
        issue.expected === 'array' &&
        issue.actual === 'string',
    ),
  )
  assert(!JSON.stringify(result).includes('fixture-secret'))
})

test('Completion diagnostics do not reveal unknown keys or report values', () => {
  const result = describeCompletionInput({
    report: {
      implementedFeatures: ['fixture-secret'],
      payloadPrivateName: 'fixture-secret',
    },
  })
  assert.equal(result.validShape, false)
  assert(result.issueCount > 0)
  assert(!JSON.stringify(result).includes('fixture-secret'))
  assert(!JSON.stringify(result).includes('payloadPrivateName'))
  assert(
    result.issues.every((issue) =>
      [
        'report',
        'topLevel',
        'implementedFeatures',
        'acceptanceResults',
        'validationResults',
        'conceptUsage',
        'appliedDecisionIds',
        'codeReferences',
        'diffReferences',
        'specDeviations',
        'remainingIssues',
        'limitations',
      ].includes(issue.field),
    ),
  )
})
