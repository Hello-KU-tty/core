// Display-only evidence of a denied tool request. Never grants permission.
// The update uses Core's native TOOL event shape; the tool row ID is the same
// session-scoped hash native-client uses for that tool call's other updates.
const { createHash } = require('node:crypto')

const PROTOCOL_KIND = { read: 'read', search: 'search', write: 'edit', shell: 'execute' }

function permissionDenialEvent(detail, reason) {
  const code = typeof reason === 'string' && /^PERMISSION_GUARD_[A-Z0-9_]{1,80}$/.test(reason)
    ? reason : 'NATIVE_TOOL_PERMISSION_DENIED'
  const toolName = Object.hasOwn(PROTOCOL_KIND, detail?.toolName ?? '') ? detail.toolName : null
  const toolId = typeof detail?.sessionId === 'string' && detail.sessionId &&
    typeof detail?.toolCallId === 'string' && detail.toolCallId && detail.toolCallId.length <= 200
    ? createHash('sha256').update(`${detail.sessionId}\u0000${detail.toolCallId}`).digest('hex').slice(0, 12)
    : null
  return { kind: 'TOOL', update: {
    sessionUpdate: 'tool_call_update', titleClass: 'OTHER', srcPath: false,
    updateKeys: [], rawInputKeys: [], validationFieldMentions: [], validationIssueKinds: [],
    protocolKind: toolName ? PROTOCOL_KIND[toolName] : 'unknown', nativeStatus: 'failed',
    toolId, toolName, coreAction: null, coreIsError: null, coreSuccess: null, coreErrorCode: null,
    bridgeErrorCode: code, relativePath: null, command: null, output: null,
    outputTruncated: false, rawOutputType: 'none',
  } }
}
module.exports = { permissionDenialEvent }
