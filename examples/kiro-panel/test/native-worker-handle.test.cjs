const assert = require('node:assert/strict')
const { test } = require('node:test')
const { createNativeWorkerHandle } = require('../src/native-worker-handle.cjs')

test('panel opened before trust receives late worker requests without replaying an input', async () => {
  const handle = createNativeWorkerHandle()
  const statuses = [], notices = [], submitted = []
  const statusListeners = new Set(), inputListeners = new Set()
  const pending = [{ projectId: 'project_synthetic', nativeJobId: 'native_synthetic' }]
  const stopStatus = handle.subscribeStatus(value => statuses.push(value))
  const stopInputs = handle.subscribeUserInputs(() => notices.push(handle.listUserInputs('project_synthetic')))
  assert.deepEqual(handle.listUserInputs('project_synthetic'), [])
  await assert.rejects(handle.submitUserInput({}), /NATIVE_NOT_READY/)
  const worker = {
    getStatus: () => 'READY',
    listUserInputs: id => pending.filter(value => value.projectId === id),
    submitUserInput: async value => { submitted.push(value); return true },
    subscribeStatus: listener => { statusListeners.add(listener); return () => statusListeners.delete(listener) },
    subscribeUserInputs: listener => { inputListeners.add(listener); return () => inputListeners.delete(listener) },
  }
  handle.attach(worker)
  handle.attach(worker)
  assert.deepEqual(statuses, ['READY'])
  assert.deepEqual(notices, [pending])
  assert.equal(statusListeners.size, 1)
  assert.deepEqual(submitted, [])
  const response = { ...pending[0], response: 'synthetic response' }
  await handle.submitUserInput(response)
  assert.deepEqual(submitted, [response])
  stopStatus(); stopInputs()
  for (const listener of statusListeners) listener('LATER')
  for (const listener of inputListeners) listener()
  assert.equal(notices.length, 1)
  assert.equal(statuses.length, 1)
  handle.attach(null)
  assert.equal(statusListeners.size, 0)
  assert.equal(inputListeners.size, 0)
  assert.deepEqual(handle.listUserInputs('project_synthetic'), [])
})
