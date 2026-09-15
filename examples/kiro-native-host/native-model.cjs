// Kiro 1.0.794 returns session-scoped configOptions after mode/model selection.
// Keep the Discovery model policy exact; an unavailable option must not fall
// back to Auto or a display-name match.
const DISCOVERY_MODEL_ID = 'claude-haiku-4.5'
const ANALYST_MODEL_IDS = Object.freeze(['claude-haiku-4.5', 'claude-sonnet-4.5'])
const DISCOVERY_MODE = /^vibe-native-discovery(?:-[0-9a-f]{8})?$/

class NativeModelError extends Error {
  constructor(code) {
    super(code)
    this.name = 'NativeModelError'
    this.code = code
  }
}

function exactlyOneConfigOption(configOptions, id, code) {
  if (!Array.isArray(configOptions)) throw new NativeModelError(code)
  const matching = configOptions.filter((option) => option?.id === id)
  if (matching.length !== 1) throw new NativeModelError(code)
  return matching[0]
}

function modelOption(configOptions, targetId) {
  const option = exactlyOneConfigOption(configOptions, 'model', 'NATIVE_MODEL_OPTIONS_MALFORMED')
  if (option.type !== 'select' || !Array.isArray(option.options) ||
      option.options.some((entry) => typeof entry?.value !== 'string' || !entry.value))
    throw new NativeModelError('NATIVE_MODEL_OPTIONS_MALFORMED')
  const matches = option.options.filter((entry) => entry.value === targetId)
  if (matches.length > 1) throw new NativeModelError('NATIVE_MODEL_OPTION_AMBIGUOUS')
  if (matches.length === 0) throw new NativeModelError('NATIVE_MODEL_UNAVAILABLE')
  return matches[0]
}

function availableBuiltinAnalystModels(configOptions) {
  const option = exactlyOneConfigOption(configOptions, 'model', 'NATIVE_MODEL_OPTIONS_MALFORMED')
  if (option.type !== 'select' || !Array.isArray(option.options) ||
      option.options.some((entry) => typeof entry?.value !== 'string' || !entry.value))
    throw new NativeModelError('NATIVE_MODEL_OPTIONS_MALFORMED')
  return ANALYST_MODEL_IDS.filter((id) => {
    const count = option.options.filter((entry) => entry.value === id).length
    if (count > 1) throw new NativeModelError('NATIVE_MODEL_OPTION_AMBIGUOUS')
    return count === 1
  })
}

async function selectExactModel({ client, sessionId, modeId, modeSelection }, modeAllowed, targetId) {
  if (typeof sessionId !== 'string' || sessionId.length < 8 ||
      typeof modeId !== 'string' || !modeAllowed(modeId) ||
      typeof client?.ownsSession !== 'function' ||
      typeof client?.selectModel !== 'function' ||
      client.ownsSession(sessionId) !== true)
    throw new NativeModelError('NATIVE_MODEL_SESSION_UNOWNED')

  const mode = exactlyOneConfigOption(modeSelection?.configOptions, 'mode',
    'NATIVE_MODEL_MODE_UNCONFIRMED')
  if (mode.currentValue !== modeId) throw new NativeModelError('NATIVE_MODEL_MODE_UNCONFIRMED')
  const selectedOption = modelOption(modeSelection.configOptions, targetId)

  let modelSelection
  try { modelSelection = await client.selectModel(sessionId, selectedOption.value) }
  catch { throw new NativeModelError('NATIVE_MODEL_SELECTION_FAILED') }

  const confirmedMode = exactlyOneConfigOption(modelSelection?.configOptions, 'mode',
    'NATIVE_MODEL_SELECTION_UNCONFIRMED')
  const confirmedModel = exactlyOneConfigOption(modelSelection?.configOptions, 'model',
    'NATIVE_MODEL_SELECTION_UNCONFIRMED')
  if (confirmedMode.currentValue !== modeId ||
      confirmedModel.currentValue !== targetId)
    throw new NativeModelError('NATIVE_MODEL_SELECTION_UNCONFIRMED')
  try { modelOption(modelSelection.configOptions, targetId) }
  catch { throw new NativeModelError('NATIVE_MODEL_SELECTION_UNCONFIRMED') }
  return targetId
}

async function selectDiscoveryHaikuModel(input) {
  return selectExactModel(input, modeId => DISCOVERY_MODE.test(modeId), DISCOVERY_MODEL_ID)
}

// The protected Analyst is a separate built-in vibe session. Its model is
// selected before Builder's W session/new and cannot silently fall back.
async function selectBuiltinAnalystHaikuModel(input) {
  return selectExactModel(input, modeId => modeId === 'vibe', DISCOVERY_MODEL_ID)
}

async function selectBuiltinAnalystModel(input, targetId) {
  if (!ANALYST_MODEL_IDS.includes(targetId))
    throw new NativeModelError('NATIVE_MODEL_UNSUPPORTED')
  return selectExactModel(input, modeId => modeId === 'vibe', targetId)
}

module.exports = { DISCOVERY_MODEL_ID, ANALYST_MODEL_IDS, NativeModelError,
  availableBuiltinAnalystModels, selectDiscoveryHaikuModel,
  selectBuiltinAnalystHaikuModel, selectBuiltinAnalystModel }
