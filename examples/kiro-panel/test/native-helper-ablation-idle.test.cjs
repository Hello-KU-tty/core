const test = require('node:test')
const assert = require('node:assert/strict')
const { assertNativeHelperAblationIdle } =
  require('../src/native-helper-ablation-idle.cjs')

const projectId = 'project_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const taskId = 'task_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const fixture = () => {
  const state = { workerIdle: true, taskId, runStatus: 'SUCCEEDED',
    pendingAnalyst: false, runningAnalyst: false }
  const client = {
    health: async () => ({}),
    listProjects: async () => ({ projects: [{ project: { id: projectId } }] }),
    restoreProject: async () => ({ currentTask: { id: state.taskId } }),
    listRuns: async () => [{ status: state.runStatus }],
    execute: async request => request.status === 'PENDING' && state.pendingAnalyst ||
      request.status === 'RUNNING' && state.runningAnalyst ? [{}] : [],
  }
  const lease = { assertIdle: () => state.workerIdle }
  return { state, client, lease }
}

test('idle attestation checks exact Task and both backend queues', async () => {
  const { client, lease } = fixture()
  assert.deepEqual(await assertNativeHelperAblationIdle(client, lease,
    projectId, taskId, () => ({})), { workerIdle: true, backendIdle: true })
})

test('Task drift, pending run, Analyst work and worker activity fail closed', async () => {
  const { state, client, lease } = fixture()
  const check = () => assertNativeHelperAblationIdle(client, lease,
    projectId, taskId, () => ({}))
  state.taskId = 'task_other'
  await assert.rejects(check(), /HELPER_ABLATION_TASK_DRIFT/)
  state.taskId = taskId
  state.runStatus = 'RUNNING'
  await assert.rejects(check(), /HELPER_ABLATION_BACKEND_RUN_ACTIVE/)
  state.runStatus = 'SUCCEEDED'
  state.pendingAnalyst = true
  await assert.rejects(check(), /HELPER_ABLATION_ANALYST_ACTIVE/)
  state.pendingAnalyst = false
  state.runningAnalyst = true
  await assert.rejects(check(), /HELPER_ABLATION_ANALYST_ACTIVE/)
  state.runningAnalyst = false
  state.workerIdle = false
  await assert.rejects(check(), /HELPER_ABLATION_WORKER_NOT_IDLE/)
})
