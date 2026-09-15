import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  advertiseNativeEnrichment,
  bindNativeEnrichment,
  nativeInputSchema,
} from './native-discovery-enrichment.mjs'

const id = (prefix, number) =>
  `${prefix}_00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const binding = {
  role: 'DISCOVERY',
  mode: 'ENRICH_SECOND',
  requestedCandidateIds: [],
  projectId: id('project', 1),
  discoverySessionId: id('discovery_session', 1),
  correlationId: id('corr', 1),
}
const previewRoundId = id('candidate_preview_round', 1)
const previews = Array.from({ length: 10 }, (_, index) => ({
  candidateId: id('candidate', index + 1),
  position: index + 1,
  title: `Preview ${index + 1}`,
  summary: `Summary ${index + 1}`,
  coreInteraction: `Interaction ${index + 1}`,
  appeal: `Appeal ${index + 1}`,
  technologyNecessity: `Technology ${index + 1}`,
  generationTags: ['DIRECT'],
}))
const context = {
  project: { id: binding.projectId, status: 'DISCOVERY' },
  session: {
    id: binding.discoverySessionId,
    correlationId: binding.correlationId,
    status: 'ACTIVE',
    revision: 1,
  },
  rounds: [],
  previewRound: {
    id: previewRoundId,
    discoverySessionId: binding.discoverySessionId,
    correlationId: binding.correlationId,
    previews,
  },
}
const details = (candidateId) => ({
  candidateId,
  targetUsers: ['Learner'],
  usageMoment: 'A local exercise',
  coreConcepts: ['TypeScript', 'Async'],
  mvpFeatures: ['Request list'],
  suggestedScope: { learnerFocus: ['Ordering'], agentSupport: ['UI shell'], excluded: [] },
  risks: [],
})
const second = {
  schemaVersion: 1,
  projectId: binding.projectId,
  discoverySessionId: binding.discoverySessionId,
  correlationId: binding.correlationId,
  idempotencyKey: id('idem', 1),
  expectedSessionRevision: 1,
  previewRoundId,
  batch: 'SECOND',
  candidates: previews.slice(5).map((p) => details(p.candidateId)),
}
const envelope = (value) => ({ inputJson: JSON.stringify(value) })
const bind = (value, current = context) =>
  bindNativeEnrichment(
    binding,
    'submit_candidate_enrichments',
    envelope(value),
    async () => current,
  )

test('advertises a scalar envelope with the complete derived enrichment-only schema', () => {
  const tool = advertiseNativeEnrichment('DISCOVERY', {
    name: 'submit_candidate_enrichments',
    description: 'Submit enrichments',
    inputSchema: { type: 'object' },
  })
  assert.deepEqual(Object.keys(tool.inputSchema.properties), ['inputJson'])
  const schema = JSON.parse(tool.description.split('Native enrichment input JSON Schema: ')[1])
  const candidate = schema.properties.candidates.items
  assert.deepEqual(
    Object.keys(candidate.properties).sort(),
    Object.keys(nativeInputSchema.shape.candidates.element.shape).sort(),
  )
  for (const field of [
    'title',
    'summary',
    'coreInteraction',
    'appeal',
    'technologyNecessity',
    'generationTags',
  ])
    assert(!Object.hasOwn(candidate.properties, field))
})

test('copies only exact staged Preview meaning; preserves Agent-authored empty arrays', async () => {
  const result = await bind(second)
  assert.equal(result.bound, true)
  assert.equal(result.batch, 'SECOND')
  assert.equal(result.candidateCount, 5)
  assert.deepEqual(
    result.input.candidates.map((candidate) => candidate.candidateId),
    previews.slice(5).map((preview) => preview.candidateId),
  )
  for (const [index, candidate] of result.input.candidates.entries()) {
    const preview = previews[index + 5]
    for (const field of [
      'title',
      'summary',
      'coreInteraction',
      'appeal',
      'technologyNecessity',
      'generationTags',
    ])
      assert.deepEqual(candidate[field], preview[field])
    assert.deepEqual(candidate.risks, [])
    assert.deepEqual(candidate.suggestedScope.excluded, [])
    assert.equal(candidate.usageMoment, 'A local exercise')
  }
  assert.equal(second.candidates[0].title, undefined)
})

test('rejects immutable fields instead of silently replacing Agent text', async () => {
  for (const field of [
    'title',
    'summary',
    'coreInteraction',
    'appeal',
    'technologyNecessity',
    'generationTags',
  ]) {
    const candidate = {
      ...second.candidates[0],
      [field]: field === 'generationTags' ? [] : 'rewrite',
    }
    await assert.rejects(
      bind({ ...second, candidates: [candidate, ...second.candidates.slice(1)] }),
      { message: 'BRIDGE_ENRICHMENT_IMMUTABLE_FIELDS_FORBIDDEN' },
    )
  }
})

test('preserves post-finalization Core replay while rejecting foreign Preview provenance', async () => {
  const finalized = {
    ...context,
    project: { ...context.project, status: 'SPEC_REVIEW' },
    session: { ...context.session, status: 'CLOSED', revision: 2 },
    rounds: [{ id: id('candidate_round', 1) }],
  }
  const replayInput = await bind(second, finalized)
  assert.deepEqual(replayInput.input, (await bind(second)).input)
  assert.equal(replayInput.input.expectedSessionRevision, 1)
  assert.equal(replayInput.input.idempotencyKey, second.idempotencyKey)
  for (const changed of [
    { project: { ...context.project, id: id('project', 2) } },
    { previewRound: { ...context.previewRound, id: id('candidate_preview_round', 2) } },
    { previewRound: { ...context.previewRound, correlationId: id('corr', 2) } },
  ])
    await assert.rejects(bind(second, { ...context, ...changed }), {
      message: 'BRIDGE_ENRICHMENT_CONTEXT_STALE',
    })
  for (const changed of [
    { projectId: id('project', 2) },
    { discoverySessionId: id('discovery_session', 2) },
    { correlationId: id('corr', 2) },
  ])
    await assert.rejects(bind({ ...second, ...changed }), {
      message: 'BRIDGE_ENRICHMENT_SCOPE_MISMATCH',
    })
})

test('rejects duplicate, wrong-batch and malformed Agent detail fields', async () => {
  for (const candidates of [
    [second.candidates[0], ...second.candidates.slice(0, 4)],
    [details(previews[0].candidateId), ...second.candidates.slice(1)],
    second.candidates.slice(1),
  ])
    await assert.rejects(bind({ ...second, candidates }), {
      message: 'BRIDGE_ENRICHMENT_BATCH_INVALID',
    })
  await assert.rejects(
    bind({
      ...second,
      candidates: second.candidates.map((candidate, index) =>
        index === 0 ? { ...candidate, arbitraryField: 'untrusted' } : candidate,
      ),
    }),
    { message: 'BRIDGE_ENRICHMENT_INPUT_INVALID' },
  )
  await assert.rejects(
    bindNativeEnrichment(
      binding,
      'submit_candidate_enrichments',
      { inputJson: 'x'.repeat(131_073) },
      async () => context,
    ),
    { message: 'BRIDGE_ENVELOPE_JSON_TOO_LARGE' },
  )
})

test('SELECTED stays limited to unique currently staged Preview identities', async () => {
  const selected = { ...second, batch: 'SELECTED', candidates: [details(previews[2].candidateId)] }
  const selectedBinding = {
    ...binding,
    mode: 'ENRICH_SELECTED',
    requestedCandidateIds: [previews[2].candidateId],
  }
  const selectedBind = (value) =>
    bindNativeEnrichment(
      selectedBinding,
      'submit_candidate_enrichments',
      envelope(value),
      async () => context,
    )
  const result = await selectedBind(selected)
  assert.equal(result.input.candidates[0].title, previews[2].title)
  await assert.rejects(selectedBind({ ...selected, candidates: [details(id('candidate', 99))] }), {
    message: 'BRIDGE_ENRICHMENT_BATCH_INVALID',
  })
  await assert.rejects(
    selectedBind({ ...selected, candidates: [details(previews[3].candidateId)] }),
    {
      message: 'BRIDGE_ENRICHMENT_BATCH_INVALID',
    },
  )
  await assert.rejects(bind(selected), { message: 'BRIDGE_ENRICHMENT_MODE_MISMATCH' })
  await assert.rejects(selectedBind({ ...selected, batch: 'SECOND' }), {
    message: 'BRIDGE_ENRICHMENT_MODE_MISMATCH',
  })
})
