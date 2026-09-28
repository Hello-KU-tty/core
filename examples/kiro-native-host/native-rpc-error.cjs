// Only bounded, known error metadata crosses the native RPC diagnostic boundary.
// Never return provider messages, request IDs, paths, tokens, or arbitrary type names.
const TYPES = new Map([
  ['ServiceQuotaExceededException', 'NATIVE_QUOTA_EXCEEDED'],
  ['UsageLimitReachedError', 'NATIVE_QUOTA_EXCEEDED'],
  ['OverageLimitReachedError', 'NATIVE_QUOTA_EXCEEDED'],
  ['InsufficientQuotaError', 'NATIVE_QUOTA_EXCEEDED'],
  ['ModelRegistryUnauthenticatedError', 'NATIVE_AUTH_REQUIRED'],
  ['ExpiredTokenException', 'NATIVE_AUTH_REQUIRED'],
  ['InvalidBearerTokenException', 'NATIVE_AUTH_REQUIRED'],
  ['ModelRegistryAccessDeniedError', 'NATIVE_ACCESS_DENIED'],
  ['AccessDeniedException', 'NATIVE_ACCESS_DENIED'],
  ['ModelRegistryUnavailableError', 'NATIVE_MODEL_UNAVAILABLE'],
  ['InvalidModelError', 'NATIVE_MODEL_UNAVAILABLE'],
  ['InvalidModelIdentifierError', 'NATIVE_MODEL_UNAVAILABLE'],
  ['ThrottlingException', 'NATIVE_RATE_LIMITED'],
  ['ServiceUnavailableException', 'NATIVE_SERVICE_UNAVAILABLE'],
])
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (value, key) => record(value) ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined
function structured(value) {
  if (record(value)) return value
  if (typeof value !== 'string' || value.length > 4096 || !value.trimStart().startsWith('{')) return null
  try { const parsed = JSON.parse(value); return record(parsed) ? parsed : null }
  catch { return null }
}
function classifyNativeRpcError(error) {
  if (!record(error) || !Number.isInteger(own(error, 'code'))) return 'NATIVE_RPC_REJECTED'
  const data = structured(own(error, 'data'))
  const records = [error, data, structured(own(data, 'details'))]
  const categories = new Set()
  for (const value of records) for (const key of ['name', 'errorType', '__type', 'code']) {
    let name = own(value, key)
    if (typeof name !== 'string' || name.length > 160) continue
    const namespace = 'com.amazon.kiro.runtimeservice#'
    if (name.startsWith(namespace)) name = name.slice(namespace.length)
    const category = TYPES.get(name)
    if (category) categories.add(category)
  }
  if (categories.size > 1) return 'NATIVE_RPC_REJECTED'
  if (categories.size === 1) return categories.values().next().value
  // ACP authRequired uses -32000, but Kiro model-registry failures also use it.
  // The number alone therefore cannot identify authentication failure.
  const message = own(error, 'message')
  if (own(error, 'code') === -32000 && typeof message === 'string' && message.length <= 2048 &&
      (message === 'Authentication required' || message.startsWith('Authentication required: ')))
    return 'NATIVE_AUTH_REQUIRED'
  return 'NATIVE_RPC_REJECTED'
}
module.exports = { classifyNativeRpcError }
