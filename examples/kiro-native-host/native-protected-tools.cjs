// Pinned Kiro 1.0.794 has a few built-ins that do not enter the session
// permission mapper. Query only effective feature booleans; never enumerate
// user content or expose the experiment object to model/panel telemetry.
const fs = require('node:fs')
const { attestPinnedKiroInstallation } = require('./native-installation-source.cjs')

async function inspectProtectedBuiltinFlags(vscode, env = process.env, filesystem = fs,
  pinnedAppRoot) {
  // Kiro assigns kiroAgent to a dedicated extension host. Public appRoot is
  // the cross-host product identity boundary; proposed extensionsAny is not
  // available to this panel extension.
  let installedSource
  try {
    installedSource = attestPinnedKiroInstallation(vscode, filesystem, pinnedAppRoot)
  }
  catch { installedSource = null }
  const quality = installedSource?.quality ?? 'UNKNOWN'
  const sourcePinned = installedSource?.agentExtensionVersion === '1.0.794' &&
    quality === 'stable'
  let experiments
  try { experiments = await vscode.commands.executeCommand('kiroAgent.experiments.getExperiments') }
  catch { experiments = null }
  const object = experiments && typeof experiments === 'object' &&
    !Array.isArray(experiments) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(experiments)) ? experiments : null
  // In pinned Kiro, stable/rc hides insider definitions from getExperiments.
  // The same service's isEnabled(id), used to construct these tools, returns
  // false when a definition is not visible. Require the *entire* returned
  // object to be empty; an omitted single key in any other shape is UNKNOWN.
  const stableHidden = sourcePinned &&
    object && Object.keys(object).length === 0
  const artifacts = stableHidden ? 'OFF' :
    object?.agentArtifacts === true ? 'ON' : 'UNKNOWN'
  const tasks = stableHidden ? 'OFF' :
    object?.taskTracking === true ? 'ON' : 'UNKNOWN'
  const screenshot = typeof env.KIRO_SCREENSHOT_PORT === 'string' &&
    env.KIRO_SCREENSHOT_PORT.length > 0 ?
    'ON' : 'OFF'
  const remoteAll = env.KIRO_LOAD_ALL_REMOTE_TOOLS === 'true' ? 'ON' : 'OFF'
  return { artifacts, tasks, screenshot, remoteAll, quality,
    safe: sourcePinned && artifacts === 'OFF' && tasks === 'OFF' && screenshot === 'OFF' &&
      remoteAll === 'OFF' }
}

module.exports = { inspectProtectedBuiltinFlags }
