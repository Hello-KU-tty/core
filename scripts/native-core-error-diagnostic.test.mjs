import assert from 'node:assert/strict'
import test from 'node:test'
import { describeNativeCoreError } from './native-core-error-diagnostic.mjs'

test('classifies unknown decision fields without retaining the error payload', () => {
  const result = {
    isError: true,
    content: [
      {
        type: 'text',
        text: 'unrecognized_keys actor kind recommendedOptionKey private-token-value',
      },
    ],
  }
  const summary = describeNativeCoreError(result)
  assert.deepEqual(summary, {
    errorMentions: ['actor', 'kind', 'recommendedOptionKey'],
    errorKind: 'SCHEMA_UNKNOWN_FIELDS',
  })
  assert.equal(JSON.stringify(summary).includes('private-token-value'), false)
})

test('keeps field diagnostics finite for unrelated Core errors', () => {
  assert.deepEqual(
    describeNativeCoreError({
      isError: true,
      content: [{ type: 'text', text: 'revision stale while checking expectedContextVersion' }],
    }),
    {
      errorMentions: ['expectedContextVersion'],
      errorKind: 'STALE',
    },
  )
  assert.deepEqual(
    describeNativeCoreError({
      isError: false,
      content: [{ type: 'text', text: 'unrecognized_keys actor' }],
    }),
    { errorMentions: [], errorKind: 'OTHER' },
  )
})
