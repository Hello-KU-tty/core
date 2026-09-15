import { builderCompleteTaskToolInputSchema } from '../packages/contracts/dist/build.js'

const reportFields = new Set([
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
])
const nestedFields = new Set([
  'criterionKey',
  'status',
  'evidence',
  'name',
  'summary',
  'reference',
  'conceptName',
  'scope',
  'importance',
  'usageReason',
  'codeReferences',
  'path',
  'startLine',
  'endLine',
  'excerpt',
  'description',
])
const codes = new Set([
  'invalid_type',
  'invalid_value',
  'too_small',
  'too_big',
  'invalid_format',
  'unrecognized_keys',
  'custom',
])
const types = new Set(['undefined', 'null', 'string', 'number', 'boolean', 'array', 'object'])
const inputType = (value) =>
  value === undefined
    ? 'undefined'
    : value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : typeof value
const valueAt = (input, path) =>
  path.reduce(
    (value, segment) =>
      value !== null && typeof value === 'object' && Object.hasOwn(value, segment)
        ? value[segment]
        : undefined,
    input,
  )

// Field names come only from the declared Completion Report contract. Agent
// text, values, unknown keys and arbitrary issue messages never leave here.
export function describeCompletionInput(input) {
  const result = builderCompleteTaskToolInputSchema.safeParse(input)
  if (result.success) return { validShape: true, issueCount: 0, issues: [] }
  const issues = result.error.issues.slice(0, 16).map((issue) => {
    const path = issue.path
    const field =
      path[0] === 'report' && reportFields.has(path[1])
        ? path[1]
        : path[0] === 'report'
          ? 'report'
          : 'topLevel'
    const index = Number.isInteger(path[2]) && path[2] >= 0 && path[2] <= 50 ? path[2] : null
    const nested = index !== null && nestedFields.has(path[3]) ? path[3] : null
    const actual = inputType(valueAt(input, path))
    return {
      field,
      ...(index === null ? {} : { index }),
      ...(nested === null ? {} : { nested }),
      code: codes.has(issue.code) ? issue.code : 'OTHER',
      expected: types.has(issue.expected) ? issue.expected : null,
      actual: types.has(actual) ? actual : 'OTHER',
      ...(issue.code === 'unrecognized_keys' && Array.isArray(issue.keys)
        ? { unknownKeyCount: Math.min(issue.keys.length, 100) }
        : {}),
    }
  })
  return { validShape: false, issueCount: result.error.issues.length, issues }
}
