'use strict'

// These failures are confined to one completed or never-started H turn.
// Unknown transport, permission, tool, catalog, and shared-policy failures
// invalidate both sessions until an idle restart.
const ROLE_LOCAL_H_FAILURES = new Set([
  'NATIVE_H_CANCELLED',
  'NATIVE_H_EMPTY_RESPONSE',
  'NATIVE_H_PROMPT_INVALID',
])

function protectedFailureDisposition(code) {
  if (code === 'NATIVE_H_CANCELLED_CONFIRMED') return 'REUSE_PAIR'
  if (code === 'NATIVE_H_ROLE_UNAVAILABLE_REQUIRES_IDLE_RESTART') return 'KEEP_PEER'
  if (ROLE_LOCAL_H_FAILURES.has(code)) return 'CLOSE_ROLE'
  return 'CLOSE_PAIR'
}

function builderFailureDisposition(code) {
  return code === 'NATIVE_H_PAIR_PARTIAL_REQUIRES_IDLE_RESTART' ? 'KEEP_PEER' : 'CLOSE_PAIR'
}

module.exports = { protectedFailureDisposition, builderFailureDisposition }
