const test = require('node:test')
const assert = require('node:assert/strict')
const { permissionDenialEvent } = require('../src/permission-denial.cjs')

test('binds a denied request to its tool row without retaining input or private paths', () => {
  const event = permissionDenialEvent({toolCallId: 'call-1', toolName: 'shell',
    rawInput: {command: 'synthetic-private-command'}, sessionId: 'private-session'},
    'PERMISSION_GUARD_BUILDER_SHELL_PROJECT_COMMAND_NODE')
  assert.equal(event.kind, 'TOOL')
  assert.equal(event.update.toolId, 'call-1')
  assert.equal(event.update.nativeStatus, 'failed')
  assert.equal(event.update.bridgeErrorCode, 'PERMISSION_GUARD_BUILDER_SHELL_PROJECT_COMMAND_NODE')
  assert.equal(JSON.stringify(event).includes('private'), false)
})

test('uses a fixed safe code for missing or untrusted permission details', () => {
  for (const detail of [null, {}, {toolCallId: 'x'.repeat(81), toolName: 'private tool title'}]) {
    const event = permissionDenialEvent(detail, 'unsafe: private path')
    assert.equal(event.update.toolId, null)
    assert.equal(event.update.toolName, 'unknown')
    assert.equal(event.update.bridgeErrorCode, 'NATIVE_TOOL_PERMISSION_DENIED')
  }
})
