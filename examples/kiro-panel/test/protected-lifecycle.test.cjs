const assert = require('node:assert/strict')
const { test } = require('node:test')
const {
  protectedFailureDisposition,
  builderFailureDisposition,
} = require('../src/protected-lifecycle.cjs')

test('reuses an H pair only after an owned cancelled turn is confirmed', () => {
  assert.equal(protectedFailureDisposition('NATIVE_H_CANCELLED_CONFIRMED'), 'REUSE_PAIR')
  assert.equal(protectedFailureDisposition('NATIVE_H_CANCEL_RACED_OR_UNCONFIRMED'), 'CLOSE_PAIR')
  assert.equal(protectedFailureDisposition('NATIVE_RPC_TIMEOUT'), 'CLOSE_PAIR')
  assert.equal(protectedFailureDisposition('NATIVE_H_TURN_INCOMPLETE'), 'CLOSE_PAIR')
  assert.equal(protectedFailureDisposition('NATIVE_H_UNEXPECTED_TOOL_ID_MISSING'), 'CLOSE_PAIR')
  assert.equal(protectedFailureDisposition('NATIVE_H_CATALOG_CHANGED'), 'CLOSE_PAIR')
  assert.equal(protectedFailureDisposition('UNKNOWN'), 'CLOSE_PAIR')
})

test('Builder budget timeout invalidates both protected sessions', () => {
  assert.equal(builderFailureDisposition('NATIVE_BUILDER_BUDGET_TIMEOUT_UNCONFIRMED'), 'CLOSE_PAIR')
  assert.equal(builderFailureDisposition('NATIVE_BUILDER_BUDGET_TIMEOUT_CONFIRMED'), 'CLOSE_PAIR')
  assert.equal(builderFailureDisposition('NATIVE_H_PAIR_PARTIAL_REQUIRES_IDLE_RESTART'), 'KEEP_PEER')
})

test('keeps the other H role when a completed role-local turn fails', () => {
  assert.equal(protectedFailureDisposition('NATIVE_H_EMPTY_RESPONSE'), 'CLOSE_ROLE')
  assert.equal(protectedFailureDisposition('NATIVE_H_ROLE_UNAVAILABLE_REQUIRES_IDLE_RESTART'),
    'KEEP_PEER')
})
