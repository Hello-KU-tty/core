// Display-only evidence of a denied tool request. Never grants permission.
function permissionDenialEvent(detail, reason) {
  const code = typeof reason === 'string' && /^PERMISSION_GUARD_[A-Z0-9_]{1,80}$/.test(reason)
    ? reason : 'NATIVE_TOOL_PERMISSION_DENIED'
  return { kind: 'TOOL', update: {
    sessionUpdate: 'tool_call_update', nativeStatus: 'failed',
    toolId: typeof detail?.toolCallId === 'string' && detail.toolCallId.length <= 80
      ? detail.toolCallId : null,
    toolName: ['read', 'search', 'write', 'shell'].includes(detail?.toolName)
      ? detail.toolName : 'unknown',
    bridgeErrorCode: code,
  } }
}
module.exports = { permissionDenialEvent }
