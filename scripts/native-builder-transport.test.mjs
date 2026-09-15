import assert from 'node:assert/strict'
import { test } from 'node:test'
import { restoreCoreProvenEmptyActiveDecisions } from './native-builder-transport.mjs'

const binding = {
  role: 'BUILDER',
  projectId: 'project-p',
  taskId: 'task-t',
  correlationId: 'corr-c',
}
const input = {
  schemaVersion: 1,
  projectId: binding.projectId,
  taskId: binding.taskId,
  correlationId: binding.correlationId,
  expectedPreviousVersion: 0,
  checkpoint: 'TASK_STARTED',
  relatedFiles: [],
  currentGoal: 'Build the confirmed task.',
}
const state = {
  correlationId: binding.correlationId,
  project: { id: binding.projectId },
  learningSpec: { status: 'CONFIRMED' },
  task: {
    id: binding.taskId,
    projectId: binding.projectId,
    correlationId: binding.correlationId,
    status: 'ACTIVE',
  },
  liveContext: null,
  decisionRequests: [],
  decisionResolutions: [],
  decisionApplications: [],
}

test('restores only a missing initial empty decision list proven by Core', async () => {
  const result = await restoreCoreProvenEmptyActiveDecisions(
    binding,
    'update_build_context',
    input,
    async () => state,
  )
  assert.deepEqual(result.restored, ['activeDecisionIds'])
  assert.deepEqual(result.input.activeDecisionIds, [])
  assert.equal(result.input.relatedFiles, input.relatedFiles)
  assert.equal(result.input.currentGoal, input.currentGoal)
  assert.equal(input.activeDecisionIds, undefined)
})

test('does not repair explicit values, unrelated fields, or another scope', async () => {
  let reads = 0
  const read = async () => {
    reads += 1
    return state
  }
  for (const changed of [
    { activeDecisionIds: null },
    { activeDecisionIds: '[]' },
    { activeDecisionIds: [] },
    { relatedFiles: undefined },
    { relatedFiles: null },
    { expectedPreviousVersion: 1 },
    { checkpoint: 'VALIDATION_STARTED' },
    { projectId: 'project-other' },
    { taskId: 'task-other' },
    { correlationId: 'corr-other' },
  ]) {
    const original = { ...input, ...changed }
    const result = await restoreCoreProvenEmptyActiveDecisions(
      binding,
      'update_build_context',
      original,
      read,
    )
    assert.equal(result.input, original)
    assert.deepEqual(result.restored, [])
  }
  for (const name of ['get_builder_task', 'request_user_decision']) {
    const result = await restoreCoreProvenEmptyActiveDecisions(binding, name, input, read)
    assert.equal(result.input, input)
  }
  // Version/checkpoint validity requires a bounded Core read; wrong scope and
  // explicitly present fields are rejected before that read.
  assert.equal(reads, 2)
})

test('does not repair when the exact active initial Task state is unverified', async () => {
  for (const changed of [
    { correlationId: 'corr-other' },
    { project: { id: 'project-other' } },
    { learningSpec: { status: 'DRAFT' } },
    { task: { ...state.task, id: 'task-other' } },
    { task: { ...state.task, status: 'BLOCKED' } },
    { liveContext: { contextVersion: 1 } },
    { decisionRequests: [{ id: 'decision-d' }] },
    { decisionResolutions: [{ id: 'resolution-r' }] },
    { decisionApplications: [{ id: 'application-a' }] },
  ]) {
    const result = await restoreCoreProvenEmptyActiveDecisions(
      binding,
      'update_build_context',
      input,
      async () => ({ ...state, ...changed }),
    )
    assert.equal(result.input, input)
    assert.deepEqual(result.restored, [])
  }
})

const decision = {
  id: 'decision-d',
  projectId: binding.projectId,
  taskId: binding.taskId,
  correlationId: binding.correlationId,
}
const resolution = {
  id: 'resolution-r',
  decisionId: decision.id,
  projectId: binding.projectId,
  taskId: binding.taskId,
  correlationId: binding.correlationId,
}
const application = {
  decisionId: decision.id,
  resolutionId: resolution.id,
  projectId: binding.projectId,
  taskId: binding.taskId,
  correlationId: binding.correlationId,
}
const laterInput = {
  ...input,
  expectedPreviousVersion: 4,
  checkpoint: 'VALIDATION_STARTED',
}
const laterState = {
  ...state,
  liveContext: {
    id: 'context-c',
    projectId: binding.projectId,
    taskId: binding.taskId,
    correlationId: binding.correlationId,
    contextVersion: 4,
    // Historical Agent output can reintroduce an already applied Decision.
    activeDecisionIds: [decision.id],
  },
  decisionRequests: [decision],
  decisionResolutions: [resolution],
  decisionApplications: [application],
}

test('restores an omitted later empty list from requested-minus-applied Core history', async () => {
  const result = await restoreCoreProvenEmptyActiveDecisions(
    binding,
    'update_build_context',
    laterInput,
    async () => laterState,
  )
  assert.deepEqual(result.restored, ['activeDecisionIds'])
  assert.deepEqual(result.input.activeDecisionIds, [])
  assert.equal(result.input.relatedFiles, laterInput.relatedFiles)
  assert.equal(laterInput.activeDecisionIds, undefined)
})

test('does not repair stale, foreign, malformed, explicitly present, or unresolved decisions', async () => {
  for (const [changedInput, changedState] of [
    [{ expectedPreviousVersion: 3 }, {}],
    [{ expectedPreviousVersion: 5 }, {}],
    [{ checkpoint: 'TASK_STARTED' }, {}],
    [{ projectId: 'project-other' }, {}],
    [{ taskId: 'task-other' }, {}],
    [{ correlationId: 'corr-other' }, {}],
    [{ activeDecisionIds: null }, {}],
    [{ activeDecisionIds: [] }, {}],
    [{ activeDecisionIds: [decision.id] }, {}],
    [{ relatedFiles: undefined }, {}],
    [{}, { decisionApplications: [] }],
    [{}, { decisionApplications: [application, application] }],
    [{}, { decisionApplications: [{ ...application, decisionId: 'decision-other' }] }],
    [{}, { decisionApplications: [{ ...application, resolutionId: 'resolution-other' }] }],
    [{}, { decisionRequests: [{ ...decision, projectId: 'project-other' }] }],
    [{}, { decisionResolutions: [{ ...resolution, correlationId: 'corr-other' }] }],
    [{}, { decisionApplications: [{ ...application, taskId: 'task-other' }] }],
    [{}, { liveContext: { ...laterState.liveContext, contextVersion: 5 } }],
    [{}, { task: { ...state.task, status: 'COMPLETED' } }],
  ]) {
    const original = { ...laterInput, ...changedInput }
    const result = await restoreCoreProvenEmptyActiveDecisions(
      binding,
      'update_build_context',
      original,
      async () => ({ ...laterState, ...changedState }),
    )
    assert.equal(result.input, original)
    assert.deepEqual(result.restored, [])
  }
})
