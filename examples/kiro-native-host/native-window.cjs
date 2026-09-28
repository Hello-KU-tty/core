const { realpathSync } = require('node:fs')
const { relative } = require('node:path')

// Pinned desktop Kiro builds derive windowN/exthost from the native windowId;
// ExtensionContext.logUri appends this extension's identifier. Read only the
// host-provided URI, never log contents, an environment variable or a job field.
// Unknown layouts retain the legacy unique-workspace selection rule.
function extensionWindowId(context) {
  const uri = context?.logUri
  const id = context?.extension?.id
  if (uri?.scheme !== 'file' || (uri.authority && uri.authority !== '') ||
      typeof uri.path !== 'string' || uri.path.length > 8192 ||
      !uri.path.startsWith('/') || /[\\\0]/.test(uri.path) ||
      uri.path.split('/').some(part => part === '.' || part === '..') ||
      typeof id !== 'string' || !id) return null
  const match = /\/window([1-9][0-9]*)\/exthost\/([^/]+)$/.exec(uri.path)
  if (!match || match[2] !== id) return null
  const windowId = Number(match[1])
  return Number.isSafeInteger(windowId) ? windowId : null
}

function matchingWorkspaceEndpoints(endpoints, workspace) {
  if (!Array.isArray(endpoints)) return []
  const canonical = realpathSync(workspace)
  return endpoints.filter(endpoint => {
    if (!Array.isArray(endpoint?.folders) || endpoint.folders.length !== 1) return false
    const folder = endpoint.folders[0]?.path
    if (typeof folder !== 'string') return false
    try { return relative(realpathSync(folder), canonical) === '' } catch { return false }
  })
}

function validWorkspaceEndpoint(endpoint) {
  return Number.isInteger(endpoint?.port) && endpoint.port > 0 && endpoint.port <= 65535 &&
    Number.isSafeInteger(endpoint.windowId) && endpoint.windowId > 0 &&
    typeof endpoint.token === 'string' && endpoint.token.length >= 16
}

module.exports = { extensionWindowId, matchingWorkspaceEndpoints, validWorkspaceEndpoint }
