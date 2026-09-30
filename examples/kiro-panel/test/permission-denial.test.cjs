const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { permissionDenialEvent } = require('../src/permission-denial.cjs')

test('binds a denied request to its tool row without retaining input or private paths', () => {
  const event = permissionDenialEvent({toolCallId: 'call-1', toolName: 'shell',
    rawInput: {command: 'synthetic-private-command'}, sessionId: 'private-session'},
    'PERMISSION_GUARD_BUILDER_SHELL_PROJECT_COMMAND_NODE')
  assert.equal(event.kind, 'TOOL')
  assert.equal(event.update.toolId,
    createHash('sha256').update('private-session\u0000call-1').digest('hex').slice(0, 12))
  assert.equal(event.update.nativeStatus, 'failed')
  assert.equal(event.update.protocolKind, 'execute')
  assert.equal(event.update.bridgeErrorCode, 'PERMISSION_GUARD_BUILDER_SHELL_PROJECT_COMMAND_NODE')
  assert.equal(JSON.stringify(event).includes('private'), false)
})

test('matches the Core native TOOL event shape for every tool kind', () => {
  for (const [toolName, protocolKind] of [['read', 'read'], ['search', 'search'],
    ['write', 'edit'], ['shell', 'execute']]) {
    const { update } = permissionDenialEvent({toolName, toolCallId: 'c', sessionId: 's'})
    assert.equal(update.toolName, toolName)
    assert.equal(update.protocolKind, protocolKind)
    assert.match(update.toolId, /^[a-f0-9]{12}$/)
    for (const key of ['coreAction', 'coreIsError', 'coreSuccess', 'coreErrorCode',
      'relativePath', 'command', 'output']) assert.equal(update[key], null)
    assert.deepEqual([update.updateKeys, update.rawInputKeys, update.validationFieldMentions,
      update.validationIssueKinds], [[], [], [], []])
    assert.equal(update.outputTruncated, false)
    assert.equal(update.rawOutputType, 'none')
  }
})

test('uses a fixed safe code for missing or untrusted permission details', () => {
  for (const detail of [null, {}, {toolCallId: 'x'.repeat(201), toolName: 'private tool title'}]) {
    const event = permissionDenialEvent(detail, 'unsafe: private path')
    assert.equal(event.update.toolId, null)
    assert.equal(event.update.toolName, null)
    assert.equal(event.update.protocolKind, 'unknown')
    assert.equal(event.update.bridgeErrorCode, 'NATIVE_TOOL_PERMISSION_DENIED')
  }
})
