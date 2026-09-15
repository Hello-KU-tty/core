import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  restoreDiscoveryEmptyCollections,
  restoreInitialDiscoveryEmptyCollections,
} from './native-discovery-transport.mjs'

const binding = {
  role: 'DISCOVERY',
  projectId: 'project-p',
  discoverySessionId: 'session-s',
  correlationId: 'corr-c',
}
const initial = {
  schemaVersion: 1,
  projectId: binding.projectId,
  discoverySessionId: binding.discoverySessionId,
  correlationId: binding.correlationId,
  expectedSessionRevision: 1,
  candidates: ['candidate-json'],
}
const state = {
  project: { id: binding.projectId },
  session: {
    id: binding.discoverySessionId,
    correlationId: binding.correlationId,
    revision: 1,
    status: 'ACTIVE',
  },
  rounds: [],
  feedback: [],
}

test('restores only omitted initial empty collections after Core state verification', async () => {
  const output = await restoreInitialDiscoveryEmptyCollections(
    binding,
    'submit_candidate_round',
    initial,
    async () => state,
  )
  assert.deepEqual(output.restored, ['appliedFeedbackIds', 'carriedCandidates'])
  assert.deepEqual(output.input.appliedFeedbackIds, [])
  assert.deepEqual(output.input.carriedCandidates, [])
  assert.equal(output.input.candidates, initial.candidates)
  assert.equal(initial.appliedFeedbackIds, undefined)
})

test('never masks explicit malformed values, another scope, or later revisions', async () => {
  let reads = 0
  const read = async () => {
    reads += 1
    return state
  }
  for (const value of [null, '[]', ['feedback']]) {
    const input = { ...initial, appliedFeedbackIds: value, carriedCandidates: [] }
    const result = await restoreInitialDiscoveryEmptyCollections(
      binding,
      'submit_candidate_round',
      input,
      read,
    )
    assert.equal(result.input.appliedFeedbackIds, value)
    assert.deepEqual(result.restored, [])
  }
  for (const input of [
    { ...initial, expectedSessionRevision: 2 },
    { ...initial, projectId: 'foreign-project' },
    { ...initial, discoverySessionId: 'foreign-session' },
    { ...initial, correlationId: 'foreign-correlation' },
  ]) {
    const result = await restoreInitialDiscoveryEmptyCollections(
      binding,
      'submit_candidate_round',
      input,
      read,
    )
    assert.equal(result.input, input)
    assert.deepEqual(result.restored, [])
  }
  assert.equal(reads, 0)
})

test('refuses to infer emptiness from a stale or mismatched Core state', async () => {
  for (const changed of [
    { rounds: [{}] },
    { feedback: [{}] },
    { session: { ...state.session, revision: 2 } },
    { project: { id: 'foreign-project' } },
  ]) {
    await assert.rejects(
      restoreInitialDiscoveryEmptyCollections(
        binding,
        'submit_candidate_round',
        initial,
        async () => ({ ...state, ...changed }),
      ),
      { message: 'BRIDGE_INITIAL_DISCOVERY_STATE_UNVERIFIED' },
    )
  }
})

test('restores only an omitted empty carry list for a verified pending-feedback Round', async () => {
  const feedbackId = 'feedback-f'
  const later = {
    ...initial,
    expectedSessionRevision: 3,
    appliedFeedbackIds: [feedbackId],
  }
  const current = {
    ...state,
    session: { ...state.session, revision: 3 },
    rounds: [{ id: 'round-r', appliedFeedbackIds: [] }],
    feedback: [{ id: feedbackId, roundId: 'round-r', intent: 'REVISE' }],
  }
  const result = await restoreDiscoveryEmptyCollections(
    binding,
    'submit_candidate_round',
    later,
    async () => current,
  )
  assert.deepEqual(result.restored, ['carriedCandidates'])
  assert.deepEqual(result.input.carriedCandidates, [])
  assert.equal(result.input.candidates, later.candidates)
  assert.equal(result.input.appliedFeedbackIds, later.appliedFeedbackIds)
  assert.equal(later.carriedCandidates, undefined)
})

test('preserves an eligible once-stringified Candidate array for Core validation', async () => {
  const candidates = JSON.stringify(['candidate-json'])
  const input = {
    ...initial,
    expectedSessionRevision: 3,
    appliedFeedbackIds: ['feedback-f'],
    candidates,
  }
  const context = {
    ...state,
    session: { ...state.session, revision: 3 },
    rounds: [{ id: 'round-r', appliedFeedbackIds: [] }],
    feedback: [{ id: 'feedback-f', roundId: 'round-r', intent: 'REVISE' }],
  }
  const result = await restoreDiscoveryEmptyCollections(
    binding,
    'submit_candidate_round',
    input,
    async () => context,
  )
  assert.deepEqual(result.restored, ['carriedCandidates'])
  assert.equal(result.input.candidates, candidates)
  assert.deepEqual(result.input.carriedCandidates, [])
})

test('does not repair a later Round without exact Core scope and pending feedback', async () => {
  const later = { ...initial, expectedSessionRevision: 3, appliedFeedbackIds: ['feedback-f'] }
  const current = {
    ...state,
    session: { ...state.session, revision: 3 },
    rounds: [{ id: 'round-r', appliedFeedbackIds: [] }],
    feedback: [{ id: 'feedback-f', roundId: 'round-r', intent: 'REVISE' }],
  }
  for (const input of [
    { ...later, carriedCandidates: null },
    { ...later, appliedFeedbackIds: [] },
    { ...later, appliedFeedbackIds: ['feedback-other'] },
    { ...later, candidates: [] },
    { ...later, candidates: JSON.stringify([]) },
    { ...later, candidates: JSON.stringify(JSON.stringify(['candidate-json'])) },
    { ...later, candidates: 'not-json' },
    { ...later, candidates: 'x'.repeat(512 * 1024 + 1) },
    { ...later, projectId: 'foreign-project' },
  ]) {
    const result = await restoreDiscoveryEmptyCollections(
      binding,
      'submit_candidate_round',
      input,
      async () => current,
    )
    assert.equal(result.input, input)
    assert.deepEqual(result.restored, [])
  }
  for (const changed of [
    { session: { ...current.session, revision: 4 } },
    { session: { ...current.session, status: 'CLOSED' } },
    { rounds: [] },
    { feedback: [] },
    { rounds: [{ id: 'round-r', appliedFeedbackIds: ['feedback-f'] }] },
    { feedback: [{ id: 'feedback-f', roundId: 'round-r', intent: 'MORE' }] },
    { feedback: [{ id: 'feedback-f', roundId: 'round-r', intent: 'PIN' }] },
    { feedback: [{ id: 'feedback-f', roundId: 'another-round', intent: 'REVISE' }] },
  ]) {
    const result = await restoreDiscoveryEmptyCollections(
      binding,
      'submit_candidate_round',
      later,
      async () => ({ ...current, ...changed }),
    )
    assert.equal(result.input, later)
    assert.deepEqual(result.restored, [])
  }
  const withPin = {
    ...later,
    appliedFeedbackIds: ['feedback-f', 'feedback-pin'],
  }
  const pinState = {
    ...current,
    feedback: [...current.feedback, { id: 'feedback-pin', roundId: 'round-r', intent: 'PIN' }],
  }
  const pinResult = await restoreDiscoveryEmptyCollections(
    binding,
    'submit_candidate_round',
    withPin,
    async () => pinState,
  )
  assert.equal(pinResult.input, withPin)
  assert.deepEqual(pinResult.restored, [])
})
