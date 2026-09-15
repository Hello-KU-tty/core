// Metadata-only probe for the existing Kiro extension host. No model request,
// tool execution, Core request, or persistent output is made here.
const { readFile } = require('node:fs/promises')
const { join } = require('node:path')
const { createHash } = require('node:crypto')
const fingerprint = value => typeof value === 'string'
  ? `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 12)}` : 'unknown'
const knownVendor = value => ['kiro', 'copilot', 'openai', 'anthropic', 'google', 'microsoft']
  .includes(value) ? value : fingerprint(value)
const knownFamily = value => ['claude', 'gpt', 'gemini', 'llama', 'qwen']
  .includes(value) ? value : fingerprint(value)
const safeVersion = value => typeof value === 'string' && /^[0-9]+(?:\.[0-9]+){0,3}$/.test(value)
  ? value : fingerprint(value)

async function readLanguageModelMetadata(vscode) {
  if (typeof vscode.lm?.selectChatModels !== 'function')
    return { apiAvailable: false, allCount: 0, kiroCount: 0, models: [] }
  const all = await vscode.lm.selectChatModels()
  const kiro = await vscode.lm.selectChatModels({ vendor: 'kiro' })
  return {
    apiAvailable: true,
    allCount: all.length,
    kiroCount: kiro.length,
    models: all.slice(0, 12).map(model => ({
      vendor: knownVendor(model.vendor),
      id: fingerprint(model.id),
      family: knownFamily(model.family),
      version: safeVersion(model.version),
    })),
  }
}

function formatLanguageModelMetadata(result) {
  if (!result.apiAvailable) return 'LM_API_UNAVAILABLE'
  return `LM_MODELS all=${result.allCount} kiro=${result.kiroCount} ` +
    JSON.stringify(result.models).slice(0, 1600)
}

async function readProbeMarkers(directory) {
  const record = async (side, phase) => {
    try {
      const value = JSON.parse(await readFile(join(directory, `${side}.${phase}.json`), 'utf8'))
      const key = phase === 'entered' ? 'enteredAt' : 'returnedAt'
      return value?.side === side && Number.isSafeInteger(value[key]) ? value[key] : null
    } catch { return null }
  }
  const [aEnter, bEnter, aReturn, bReturn] = await Promise.all([
    record('a', 'entered'), record('b', 'entered'),
    record('a', 'returned'), record('b', 'returned'),
  ])
  return { aEnter, bEnter, aReturn, bReturn,
    overlapped: [aEnter, bEnter, aReturn, bReturn].every(Number.isSafeInteger) &&
      Math.max(aEnter, bEnter) <= Math.min(aReturn, bReturn) }
}

function evaluateSubagentProbe(markers, activities, permissionRequests,
  userInputRequests, eventOverflow) {
  const completed = action => activities.filter(event =>
    event.action === action && event.status === 'completed' && event.error === false)
  const orchestrate = completed('ORCHESTRATE')
  const meetA = completed('MEET_A')
  const meetB = completed('MEET_B')
  const parentStages = activities.some(event => event.action === 'ORCHESTRATE' &&
    Array.isArray(event.stages) && event.stages.length === 2 &&
    event.stages.includes('vibe-single-host-a') &&
    event.stages.includes('vibe-single-host-b'))
  const childA = meetA.map(event => event.subExecutionTag).find(Boolean)
  const childB = meetB.map(event => event.subExecutionTag).find(Boolean)
  const childIdsObserved = Boolean(childA && childB && childA !== childB)
  const unsafe = activities.some(event => ['read', 'edit', 'execute', 'search']
    .includes(event.protocolKind) || event.tool === 'user_input')
  return { passed: markers.overlapped && parentStages && orchestrate.length > 0 &&
      meetA.length > 0 && meetB.length > 0 && childIdsObserved && !unsafe &&
      permissionRequests === 0 && userInputRequests === 0 && !eventOverflow,
    orchestrate: orchestrate.length > 0, meetA: meetA.length > 0,
    meetB: meetB.length > 0,
    childIdsObserved, unsafe }
}

function evaluateInvokeProbe(markers, activities, permissionRequests,
  userInputRequests, eventOverflow, exactUnavailableSentinel, stopReason,
  unexpectedPermissionRequests = 0, permittedRoles = []) {
  const completed = action => activities.filter(event =>
    event.action === action && event.status === 'completed' && event.error === false)
  const invoked = completed('INVOKE')
  const invokeA = invoked.filter(event => event.role === 'vibe-single-invoke-a')
  const invokeB = invoked.filter(event => event.role === 'vibe-single-invoke-b')
  const meetA = completed('MEET_A')
  const meetB = completed('MEET_B')
  const distinctCalls = invokeA.some(a => invokeB.some(b =>
    a.toolCallTag && b.toolCallTag && a.toolCallTag !== b.toolCallTag))
  const childA = meetA.map(event => event.subExecutionTag).find(Boolean)
  const childB = meetB.map(event => event.subExecutionTag).find(Boolean)
  const childIdsObserved = Boolean(childA && childB && childA !== childB)
  const unsafe = activities.some(event => ['read', 'edit', 'execute', 'search', 'fetch']
    .includes(event.protocolKind) || event.tool === 'user_input' ||
    (!event.action && !['subagent_response', 'report_progress'].includes(event.tool)) ||
    event.contextFilesPresent || event.responseFilesPresent || event.role === 'OTHER')
  const overlapObserved = stopReason === 'end_turn' && markers.overlapped && distinctCalls &&
    invokeA.length > 0 && invokeB.length > 0 && meetA.length > 0 && meetB.length > 0 &&
    childIdsObserved && !unsafe &&
    userInputRequests === 0 && !eventOverflow && !exactUnavailableSentinel
  const permissionAttested = permissionRequests === 2 &&
    unexpectedPermissionRequests === 0 && permittedRoles.length === 2 &&
    permittedRoles.includes('vibe-single-invoke-a') &&
    permittedRoles.includes('vibe-single-invoke-b')
  const permissionRoute = permissionAttested ? 'EXACT_ALLOW_ONCE' :
    unexpectedPermissionRequests > 0 ? 'UNEXPECTED_DENIED' : 'AUTO_OR_UNOBSERVED'
  return { passed: overlapObserved, overlapObserved, permissionAttested,
    permissionRoute, invokedA: invokeA.length > 0, invokedB: invokeB.length > 0,
    distinctCalls, meetA: meetA.length > 0, meetB: meetB.length > 0,
    childIdsObserved, unsafe, exactUnavailableSentinel, stopReason }
}

module.exports = { readLanguageModelMetadata, formatLanguageModelMetadata,
  readProbeMarkers, evaluateSubagentProbe, evaluateInvokeProbe }
