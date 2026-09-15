import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  advertiseJsonEnvelope,
  decodeJsonEnvelope,
  envelopeFailureReceipt,
} from './native-json-envelope.mjs'

const coreTool = {
  name: 'complete_task',
  description: 'Complete a Task with a validated acceptance report.',
  inputSchema: {
    type: 'object',
    properties: { report: { type: 'object', properties: { diffReferences: { type: 'array' } } } },
    required: ['report'],
  },
}

test('Builder mutation tools advertise original schemas behind scalar JSON envelopes', () => {
  for (const name of [
    'update_build_context',
    'request_user_decision',
    'apply_decision_result',
    'complete_task',
  ]) {
    const original = { ...coreTool, name }
    const tool = advertiseJsonEnvelope('BUILDER', original)
    assert.equal(tool.name, name)
    assert.deepEqual(tool.inputSchema.required, ['inputJson'])
    assert.equal(tool.inputSchema.properties.inputJson.type, 'string')
    assert(tool.description.includes(JSON.stringify(original.inputSchema)))
  }
  assert.deepEqual(advertiseJsonEnvelope('DISCOVERY', coreTool), coreTool)
  assert.deepEqual(advertiseJsonEnvelope('BUILDER', { ...coreTool, name: 'get_builder_task' }), {
    ...coreTool,
    name: 'get_builder_task',
  })
})

test('selected Discovery mutations advertise their exact original Core schemas', () => {
  for (const name of [
    'submit_candidate_previews',
    'submit_candidate_round',
    'submit_candidate_merge',
    'submit_learning_spec',
  ]) {
    const original = { ...coreTool, name }
    const tool = advertiseJsonEnvelope('DISCOVERY', original)
    assert.deepEqual(tool.inputSchema.required, ['inputJson'])
    assert.equal(tool.inputSchema.properties.inputJson.type, 'string')
    assert(tool.description.includes(JSON.stringify(original.inputSchema)))
    assert.equal(tool.name, name)
  }
  assert.deepEqual(
    advertiseJsonEnvelope('DISCOVERY', { ...coreTool, name: 'submit_candidate_enrichments' }),
    {
      ...coreTool,
      name: 'submit_candidate_enrichments',
    },
  )
  assert.deepEqual(advertiseJsonEnvelope('HELPER', coreTool), coreTool)
})

test('preserves Agent-authored empty arrays and objects across each Builder mutation', () => {
  const input = {
    schemaVersion: 1,
    context: { relatedFiles: [], activeConceptNames: [], nested: { empty: {} } },
    report: { diffReferences: [], specDeviations: [] },
  }
  for (const name of [
    'update_build_context',
    'request_user_decision',
    'apply_decision_result',
    'complete_task',
  ]) {
    const parsed = decodeJsonEnvelope('BUILDER', name, {
      inputJson: JSON.stringify(input),
      __tool_use_purpose: 'Submit the original input',
      _meta: {},
    })
    assert.equal(parsed.decoded, true)
    assert.deepEqual(parsed.input, input)
  }
  assert.deepEqual(
    decodeJsonEnvelope('BUILDER', 'complete_task', {
      inputJson: JSON.stringify({ report: {} }),
    }).input,
    { report: {} },
  )
  const direct = { report: { diffReferences: [] } }
  assert.deepEqual(decodeJsonEnvelope('BUILDER', 'get_builder_task', direct), {
    input: direct,
    decoded: false,
  })
})

test('Discovery envelope preserves authored empty nested scope, concept names and carry without defaults', () => {
  const inputs = {
    submit_candidate_previews: { schemaVersion: 1, previews: [], generationRationale: {} },
    submit_candidate_round: { schemaVersion: 1, candidates: [], carriedCandidates: [], scope: {} },
    submit_candidate_merge: {
      schemaVersion: 1,
      candidate: {
        suggestedScope: { learnerFocus: [], agentSupport: [], excluded: [] },
        risks: [],
      },
      diversityCheck: { dimensionsReviewed: [] },
    },
    submit_learning_spec: { schemaVersion: 1, draft: { scope: [], conceptNames: [], nested: {} } },
  }
  for (const [name, input] of Object.entries(inputs)) {
    assert.deepEqual(decodeJsonEnvelope('DISCOVERY', name, { inputJson: JSON.stringify(input) }), {
      input,
      decoded: true,
    })
    assert.deepEqual(decodeJsonEnvelope('DISCOVERY', name, { inputJson: '{}' }), {
      input: {},
      decoded: true,
    })
  }
  const direct = { draft: { scope: [] } }
  assert.deepEqual(decodeJsonEnvelope('DISCOVERY', 'submit_candidate_enrichments', direct), {
    input: direct,
    decoded: false,
  })
})

test('Discovery byte bound admits the existing 512 KiB candidate field plus metadata', () => {
  const supported = {
    schemaVersion: 1,
    candidates: 'x'.repeat(512 * 1024),
    expectedSessionRevision: 2,
    carriedCandidates: [],
  }
  assert.deepEqual(
    decodeJsonEnvelope('DISCOVERY', 'submit_candidate_round', {
      inputJson: JSON.stringify(supported),
    }),
    { input: supported, decoded: true },
  )
  const oversized = { inputJson: JSON.stringify({ candidates: 'x'.repeat(1_048_576) }) }
  assert.throws(
    () => decodeJsonEnvelope('DISCOVERY', 'submit_candidate_round', oversized),
    /BRIDGE_ENVELOPE_JSON_TOO_LARGE/,
  )
  assert.throws(
    () =>
      decodeJsonEnvelope('BUILDER', 'complete_task', {
        inputJson: JSON.stringify({ padding: 'x'.repeat(131_072) }),
      }),
    /BRIDGE_ENVELOPE_JSON_TOO_LARGE/,
  )
})

test('rejects malformed, mixed, oversized and nonobject envelopes before Core dispatch', () => {
  for (const argumentsValue of [
    null,
    [],
    {},
    { inputJson: 3 },
    { inputJson: '{' },
    { inputJson: '[]' },
    { inputJson: 'null' },
    { inputJson: '{}', report: {} },
    { inputJson: '{}', __tool_use_purpose: 3 },
    { inputJson: '{}', _meta: null },
    { inputJson: 'x'.repeat(131_073) },
  ])
    for (const [role, names] of [
      [
        'BUILDER',
        ['update_build_context', 'request_user_decision', 'apply_decision_result', 'complete_task'],
      ],
      [
        'DISCOVERY',
        [
          'submit_candidate_previews',
          'submit_candidate_round',
          'submit_candidate_merge',
          'submit_learning_spec',
        ],
      ],
    ])
      for (const name of names)
        assert.throws(
          () => decodeJsonEnvelope(role, name, argumentsValue),
          /^Error: BRIDGE_ENVELOPE_/,
        )
})

test('classifies pre-Core envelope failures without recording the JSON payload', () => {
  const payload = '{"private":"synthetic-value"}'
  const receipt = envelopeFailureReceipt(
    'BUILDER',
    'request_user_decision',
    { inputJson: payload },
    new Error('BRIDGE_ENVELOPE_JSON_INVALID'),
  )
  assert.deepEqual(receipt, {
    event: 'NATIVE_JSON_ENVELOPE_REJECTED',
    role: 'BUILDER',
    toolName: 'request_user_decision',
    code: 'BRIDGE_ENVELOPE_JSON_INVALID',
    inputJsonType: 'string',
    inputJsonBytes: Buffer.byteLength(payload, 'utf8'),
  })
  assert.equal(JSON.stringify(receipt).includes('synthetic-value'), false)
  assert.deepEqual(
    envelopeFailureReceipt('BUILDER', 'request_user_decision', {}, new Error('arbitrary secret')),
    {
      event: 'NATIVE_JSON_ENVELOPE_REJECTED',
      role: 'BUILDER',
      toolName: 'request_user_decision',
      code: 'BRIDGE_ENVELOPE_UNKNOWN',
      inputJsonType: 'missing',
      inputJsonBytes: null,
    },
  )
})
