const test = require('node:test')
const assert = require('node:assert/strict')
const { createProtectedHelperCapture, ARM_TTL_MS, CAPTURE_TTL_MS } =
  require('../src/protected-helper-capture.cjs')

const scope = {
  projectId: 'project_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  taskId: 'task_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  workspace: '/private/tmp/synthetic-w',
  helper: '/private/tmp/synthetic-h',
}
const job = {
  id: 'native_synthetic', projectId: scope.projectId,
  taskId: 'task_bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  correlationId: 'corr_cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  projectWorkspace: scope.workspace, helperHostWorkspace: scope.helper,
  workspace: scope.helper,
}

test('captures only the armed completed Helper prompt once with exact scope', () => {
  let clock = 1_000_000
  const store = createProtectedHelperCapture(() => clock)
  try {
    assert.equal(store.begin(job, 4), null)
    store.arm(scope)
    const token = store.begin(job, 4)
    assert.equal(typeof token, 'string')
    assert.equal(store.available(scope.projectId), false)
    assert.equal(store.complete(token, 'exact Core-owned prompt'), true)
    assert.equal(store.available(scope.projectId), true)
    const result = store.take(scope.projectId)
    assert.deepEqual({
      projectId: result.projectId, taskId: result.taskId,
      correlationId: result.correlationId, nativeJobId: result.nativeJobId,
      uiWindowId: result.uiWindowId, prompt: result.prompt,
    }, {
      projectId: job.projectId, taskId: job.taskId,
      correlationId: job.correlationId, nativeJobId: job.id,
      uiWindowId: 4, prompt: 'exact Core-owned prompt',
    })
    assert.equal(Date.parse(result.expiresAt) - Date.parse(result.capturedAt),
      CAPTURE_TTL_MS)
    assert.throws(() => store.take(scope.projectId),
      /NATIVE_HELPER_CAPTURE_UNAVAILABLE/)
  } finally { store.clear() }
})

test('failed, mismatched and expired Helper turns cannot supply an ablation capture', () => {
  let clock = 2_000_000
  const store = createProtectedHelperCapture(() => clock)
  try {
    store.arm(scope)
    const failed = store.begin(job, 4)
    store.abort(failed)
    assert.equal(store.complete(failed, 'late prompt'), false)
    store.arm(scope)
    assert.equal(store.begin({ ...job, taskId:
      'task_dddddddd-dddd-4ddd-8ddd-dddddddddddd' }, 4), null)
    store.arm(scope)
    assert.equal(store.begin({ ...job, projectId:
      'project_dddddddd-dddd-4ddd-8ddd-dddddddddddd' }, 4), null)
    assert.equal(store.available(scope.projectId), false)
    store.arm(scope)
    clock += ARM_TTL_MS
    assert.equal(store.begin(job, 4), null)
    store.arm(scope)
    const token = store.begin(job, 4)
    assert.equal(store.complete(token, 'bounded prompt'), true)
    clock += CAPTURE_TTL_MS
    assert.equal(store.available(scope.projectId), false)
  } finally { store.clear() }
})

test('oversize prompt never enters retained memory', () => {
  const store = createProtectedHelperCapture()
  try {
    store.arm(scope)
    const token = store.begin(job, 4)
    assert.equal(store.complete(token, 'x'.repeat(400_001)), false)
    assert.equal(store.available(scope.projectId), false)
  } finally { store.clear() }
})
