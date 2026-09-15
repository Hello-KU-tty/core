// Fail-closed metadata attestation for the one Kiro installation supported by
// the packaged native panel. This reads only manifests below the canonical
// running app root; it does not activate or reach into the isolated Agent host.
const fs = require('node:fs')
const path = require('node:path')

const PINNED_PRODUCT = Object.freeze({
  nameShort: 'Kiro',
  nameLong: 'Kiro',
  applicationName: 'kiro',
  dataFolderName: '.kiro',
  version: '1.0.437',
  vsCodeVersion: '1.109.5',
  commit: '5349479558af37fecbfcdb58c199ee59d86d4dd3',
  quality: 'stable',
})
const PINNED_APP_ROOT = '/Applications/Kiro.app/Contents/Resources/app'
const PINNED_AGENT = Object.freeze({
  publisher: 'kiro',
  name: 'kiroAgent',
  displayName: 'kiroAgent',
  version: '1.0.794',
  main: './dist/extension.js',
})

function sourceError() {
  return Object.assign(new Error('NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED'),
    { code: 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED' })
}

function inside(root, target) {
  const location = path.relative(root, target)
  return location === '' || (location !== '..' && !location.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(location))
}

function exactMetadata(actual, expected) {
  return actual && typeof actual === 'object' && !Array.isArray(actual) &&
    Object.entries(expected).every(([name, value]) => actual[name] === value)
}

function readManifest(root, relativePath, maximumBytes, filesystem) {
  const candidate = path.resolve(root, relativePath)
  if (!inside(root, candidate)) throw sourceError()
  let info
  let canonical
  try {
    info = filesystem.lstatSync(candidate)
    canonical = filesystem.realpathSync(candidate)
  } catch { throw sourceError() }
  if (!info.isFile() || info.isSymbolicLink?.() || info.nlink !== 1 ||
      info.size < 1 || info.size > maximumBytes || canonical !== candidate ||
      !inside(root, canonical)) throw sourceError()
  let text
  try { text = filesystem.readFileSync(canonical, 'utf8') }
  catch { throw sourceError() }
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') !== info.size)
    throw sourceError()
  try { return JSON.parse(text) }
  catch { throw sourceError() }
}

function attestPinnedKiroInstallation(vscode, filesystem = fs,
  pinnedAppRoot = PINNED_APP_ROOT) {
  const appRoot = vscode?.env?.appRoot
  if (typeof appRoot !== 'string' || !path.isAbsolute(appRoot) ||
      vscode.version !== PINNED_PRODUCT.vsCodeVersion) throw sourceError()
  let rootInfo
  let root
  try {
    rootInfo = filesystem.lstatSync(appRoot)
    root = filesystem.realpathSync(appRoot)
  } catch { throw sourceError() }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink?.() ||
      path.resolve(appRoot) !== root) throw sourceError()
  let pinnedRoot
  try { pinnedRoot = filesystem.realpathSync(pinnedAppRoot) }
  catch { throw sourceError() }
  if (root !== pinnedRoot || path.resolve(pinnedAppRoot) !== pinnedRoot)
    throw sourceError()
  try {
    filesystem.lstatSync(path.join(root, 'product.overrides.json'))
    throw sourceError()
  }
  catch (error) {
    if (error?.code === 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED') throw error
    if (error?.code !== 'ENOENT') throw sourceError()
  }
  try {
    const product = readManifest(root, 'product.json', 128 * 1024, filesystem)
    const agent = readManifest(root,
      path.join('extensions', 'kiro.kiro-agent', 'package.json'), 128 * 1024, filesystem)
    if (!exactMetadata(product, PINNED_PRODUCT) || !exactMetadata(agent, PINNED_AGENT))
      throw sourceError()
    return Object.freeze({
      appVersion: product.version,
      vscodeVersion: product.vsCodeVersion,
      commit: product.commit,
      quality: product.quality,
      agentExtensionVersion: agent.version,
    })
  } catch (error) {
    if (error?.code === 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED') throw error
    throw sourceError()
  }
}

module.exports = {
  PINNED_APP_ROOT,
  PINNED_PRODUCT,
  PINNED_AGENT,
  attestPinnedKiroInstallation,
}
