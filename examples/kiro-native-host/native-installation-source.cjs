// Fail-closed metadata attestation for the one Kiro installation supported by
// the packaged native panel. This reads only manifests below the canonical
// running app root; it does not activate or reach into the isolated Agent host.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

const WINDOWS_SOURCE = Object.freeze({
  version: '1.1.14', vsCodeVersion: '1.131.0',
  commit: 'f694ef1b025756b1ae27ae7c3d9ed4215b0160fe', quality: 'stable',
  agentVersion: '1.1.28',
  agentSha256: 'af4e05df0677587e689883ccbbb19bb853517d8127c5caaec66511408e4ca5da',
})
const WINDOWS_1170_SOURCE = Object.freeze({
  version: '1.1.70', vsCodeVersion: '1.131.0',
  commit: '8ce1870416c7dc7e51fffb01765d93ef7ad55102', quality: 'stable',
  agentVersion: '1.1.158',
  agentSha256: 'cf6a5124f2fed75144b9d4236e0ffff85a5b22732d739807070783323c071b87',
})

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

function attestWindowsKiroInstallation(vscode, filesystem = fs, executable = process.execPath,
  options = {}) {
  const suppliedRoot = vscode?.env?.appRoot
  if (process.platform !== 'win32' || process.arch !== 'x64' ||
      vscode.version !== WINDOWS_SOURCE.vsCodeVersion || typeof suppliedRoot !== 'string') throw sourceError()
  const root = filesystem.realpathSync(suppliedRoot)
  const expectedRoot = path.join(path.dirname(executable), 'resources', 'app')
  if (filesystem.lstatSync(suppliedRoot).isSymbolicLink() ||
      root.toLowerCase() !== path.resolve(suppliedRoot).toLowerCase() ||
      filesystem.realpathSync(expectedRoot).toLowerCase() !== root.toLowerCase()) throw sourceError()
  const product = readManifest(root, 'product.json', 128 * 1024, filesystem)
  const agent = readManifest(root, 'extensions/kiro.kiro-agent/package.json', 128 * 1024, filesystem)
  // Both supported profiles require their exact metadata and source bytes.
  const source = product.version === WINDOWS_1170_SOURCE.version
    ? WINDOWS_1170_SOURCE : WINDOWS_SOURCE
  if (!exactMetadata(product, { nameShort: 'Kiro', applicationName: 'kiro',
      version: source.version, vsCodeVersion: source.vsCodeVersion,
      commit: source.commit, quality: source.quality }) ||
      !exactMetadata(agent, { ...PINNED_AGENT, version: source.agentVersion })) throw sourceError()
  try { filesystem.lstatSync(path.join(root, 'product.overrides.json')); throw sourceError() }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const entry = path.join(root, 'extensions/kiro.kiro-agent/dist/extension.js')
  const info = filesystem.lstatSync(entry)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
      info.size > 128 * 1024 * 1024 || filesystem.realpathSync(entry) !== entry ||
      createHash('sha256').update(filesystem.readFileSync(entry)).digest('hex') !== source.agentSha256)
    throw sourceError()
  return Object.freeze({ appVersion: product.version, vscodeVersion: product.vsCodeVersion,
    commit: product.commit, agentExtensionVersion: agent.version,
    cloudProofMode: source === WINDOWS_1170_SOURCE ? 'WINDOWS_1170_DIAGNOSTIC' : 'SESSION_RECEIPT' })
}

module.exports = {
  PINNED_APP_ROOT,
  PINNED_PRODUCT,
  PINNED_AGENT,
  attestPinnedKiroInstallation,
  attestWindowsKiroInstallation,
  WINDOWS_SOURCE,
  WINDOWS_1170_SOURCE,
}
