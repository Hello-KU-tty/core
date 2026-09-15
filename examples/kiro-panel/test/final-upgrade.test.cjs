const { test } = require('node:test')
const assert = require('node:assert/strict')
const { eligibleFinalUpgradeTraces } = require('../src/final-upgrade.cjs')

const snapshot = {
  project: { id: 'project_1', status: 'BUILDING' },
  currentTask: { id: 'task_1', status: 'COMPLETED', sequence: 1 },
  completionReport: { taskId: 'task_1' },
}
const trace = (id, target, mode = 'EVIDENCE_AWARE') => ({
  id, projectId: 'project_1', target, mode, basis: [{ conceptId: 'concept_1' }],
  createdAt: '2026-09-13T15:00:00.000Z',
})

test('offers only the completed source Task’s evidence-aware Helper trace', () => {
  const evidence = { personalization: [
    trace('trace_right', { kind: 'HELPER_TURN', taskId: 'task_1' }),
    trace('trace_other_task', { kind: 'HELPER_TURN', taskId: 'task_2' }),
    trace('trace_discovery', { kind: 'DISCOVERY_SESSION', discoverySessionId: 'session_1' }),
    trace('trace_fallback', { kind: 'HELPER_TURN', taskId: 'task_1' }, 'NO_RELEVANT_EVIDENCE'),
    { ...trace('trace_other_project', { kind: 'HELPER_TURN', taskId: 'task_1' }), projectId: 'project_2' },
  ] }
  assert.deepEqual(eligibleFinalUpgradeTraces(snapshot, evidence), [{
    id: 'trace_right', createdAt: '2026-09-13T15:00:00.000Z', basisCount: 1,
  }])
})

test('does not offer sequence 2 or an uncompleted source Task', () => {
  const evidence = { personalization: [trace('trace_right', { kind: 'HELPER_TURN', taskId: 'task_1' })] }
  assert.deepEqual(eligibleFinalUpgradeTraces({ ...snapshot, currentTask: { ...snapshot.currentTask, status: 'ACTIVE' } }, evidence), [])
  assert.deepEqual(eligibleFinalUpgradeTraces({ ...snapshot, currentTask: { ...snapshot.currentTask, sequence: 2 } }, evidence), [])
  assert.deepEqual(eligibleFinalUpgradeTraces({ ...snapshot, completionReport: null }, evidence), [])
})
