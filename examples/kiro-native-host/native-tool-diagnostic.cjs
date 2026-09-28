// Display-only metadata. Never use this to authorize a tool or change failure into success.
function nativeReadErrorCode(toolName, status, output) {
  if (toolName !== 'read' || status !== 'failed') return null
  if (output && typeof output === 'object' && !Array.isArray(output) &&
      Object.hasOwn(output, 'code') && output.code === 'ENOENT') return 'NATIVE_FILE_NOT_FOUND'
  const text = typeof output === 'string' ? output :
    output && typeof output === 'object' && typeof output.message === 'string' ? output.message : ''
  // Only a native error prefix, never a mention in ordinary file contents.
  return /^(?:(?:Error reading file[^\n]{0,240}:\s*)?ENOENT\b|File not found: )/.test(text.slice(0, 512)) ?
    'NATIVE_FILE_NOT_FOUND' : null
}
module.exports = { nativeReadErrorCode }
