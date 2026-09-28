const assert = require('node:assert/strict')
const { test } = require('node:test')
const { classifyNativeRpcError } = require('../../kiro-native-host/native-rpc-error.cjs')

const cases = [
  ['ServiceQuotaExceededException', 'NATIVE_QUOTA_EXCEEDED'],
  ['UsageLimitReachedError', 'NATIVE_QUOTA_EXCEEDED'],
  ['OverageLimitReachedError', 'NATIVE_QUOTA_EXCEEDED'],
  ['ModelRegistryUnauthenticatedError', 'NATIVE_AUTH_REQUIRED'],
  ['ModelRegistryAccessDeniedError', 'NATIVE_ACCESS_DENIED'],
  ['ModelRegistryUnavailableError', 'NATIVE_MODEL_UNAVAILABLE'],
  ['InvalidModelError', 'NATIVE_MODEL_UNAVAILABLE'],
  ['ThrottlingException', 'NATIVE_RATE_LIMITED'],
  ['ServiceUnavailableException', 'NATIVE_SERVICE_UNAVAILABLE'],
]
for (const [errorType, expected] of cases) test(`classifies only the known RPC type ${errorType}`, () => {
  assert.equal(classifyNativeRpcError({ code: -32603, message: 'token=synthetic-secret /private/path',
    data: { errorType, requestId: 'synthetic-private-request', userMessage: 'secret' } }), expected)
})
test('accepts bounded structured error serialization, not words in free text', () => {
  const data = { __type: 'com.amazon.kiro.runtimeservice#ServiceQuotaExceededException', reason: 'MONTHLY_REQUEST_COUNT' }
  for (const value of [data, JSON.stringify(data), { details: JSON.stringify(data) }])
    assert.equal(classifyNativeRpcError({ code: -32603, data: value }), 'NATIVE_QUOTA_EXCEEDED')
  for (const value of ['ServiceQuotaExceededException token=secret', { details: 'UsageLimitReachedError' },
    { message: 'ServiceQuotaExceededException' }, { errorType: 'attacker#ServiceQuotaExceededException' }])
    assert.equal(classifyNativeRpcError({ code: -32603, data: value }), 'NATIVE_RPC_REJECTED')
})
test('shared -32000 code is not sufficient to report an authentication error', () => {
  assert.equal(classifyNativeRpcError({ code: -32000, message: 'Other error' }), 'NATIVE_RPC_REJECTED')
  assert.equal(classifyNativeRpcError({ code: -32000, message: 'Authentication required: synthetic-private-detail' }), 'NATIVE_AUTH_REQUIRED')
  assert.equal(classifyNativeRpcError({ code: -32000, message: 'Other error',
    data: { errorType: 'ModelRegistryUnavailableError' } }), 'NATIVE_MODEL_UNAVAILABLE')
})
test('conflicting known categories remain generic and never expose either raw value', () => {
  assert.equal(classifyNativeRpcError({ code: -32603, data: {
    errorType: 'UsageLimitReachedError', name: 'ModelRegistryUnauthenticatedError',
  } }), 'NATIVE_RPC_REJECTED')
})
test('rejects malformed or unbounded structured input without walking arbitrary data', () => {
  const values = [null, [], 'error', { code: 'UsageLimitReachedError' },
    { code: -32603, data: { errorType: ['UsageLimitReachedError'] } },
    { code: -32603, data: '{' }, { code: -32603, data: ' '.repeat(4097) },
    { code: -32603, data: { errorType: 'UsageLimitReachedError'.repeat(50) } },
    { code: -32603, data: { nested: { errorType: 'UsageLimitReachedError' } } }]
  for (const value of values) assert.equal(classifyNativeRpcError(value), 'NATIVE_RPC_REJECTED')
  const value = { code: -32603 }
  Object.defineProperty(value, 'data', { get() { throw new Error('MUST_NOT_INVOKE_GETTER') } })
  assert.equal(classifyNativeRpcError(value), 'NATIVE_RPC_REJECTED')
})
