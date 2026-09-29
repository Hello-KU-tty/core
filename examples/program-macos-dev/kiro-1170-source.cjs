// Mac verification host only. The IDE 1.1.70 / Agent 1.1.158 product protocol was
// attested on Windows. This accepts the Mac build only when its product commit and
// Agent entry bytes equal that Windows source; Windows attestation is unchanged.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const source = require('../kiro-native-host/native-installation-source.cjs')

const MAC_APP_ROOT = '/Applications/Kiro.app/Contents/Resources/app'
const MAC_1170_SOURCE = source.WINDOWS_1170_SOURCE

function sourceError() {
  return Object.assign(new Error('NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED'),
    { code: 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED' })
}

function exactFile(root, relativePath, maximumBytes, filesystem) {
  const candidate = path.join(root, relativePath)
  let info
  try { info = filesystem.lstatSync(candidate) } catch { throw sourceError() }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 ||
      info.size < 1 || info.size > maximumBytes ||
      filesystem.realpathSync(candidate) !== candidate) throw sourceError()
  return filesystem.readFileSync(candidate)
}

function attestMacKiro1170Installation(vscode, filesystem = fs, appRoot = MAC_APP_ROOT) {
  const supplied = vscode?.env?.appRoot
  if (process.platform !== 'darwin' || process.arch !== 'arm64' ||
      vscode?.version !== MAC_1170_SOURCE.vsCodeVersion || typeof supplied !== 'string')
    throw sourceError()
  let root
  try {
    if (filesystem.lstatSync(supplied).isSymbolicLink()) throw sourceError()
    root = filesystem.realpathSync(supplied)
  } catch { throw sourceError() }
  if (root !== path.resolve(supplied) || root !== appRoot) throw sourceError()
  try {
    filesystem.lstatSync(path.join(root, 'product.overrides.json'))
    throw sourceError()
  } catch (error) {
    if (error?.code !== 'ENOENT') throw sourceError()
  }
  let product
  let agent
  try {
    product = JSON.parse(exactFile(root, 'product.json', 128 * 1024, filesystem).toString('utf8'))
    agent = JSON.parse(exactFile(root, 'extensions/kiro.kiro-agent/package.json', 128 * 1024,
      filesystem).toString('utf8'))
  } catch { throw sourceError() }
  const expectedProduct = { nameShort: 'Kiro', applicationName: 'kiro',
    version: MAC_1170_SOURCE.version, vsCodeVersion: MAC_1170_SOURCE.vsCodeVersion,
    commit: MAC_1170_SOURCE.commit, quality: MAC_1170_SOURCE.quality }
  const expectedAgent = { ...source.PINNED_AGENT, version: MAC_1170_SOURCE.agentVersion }
  const exact = (actual, expected) => actual && typeof actual === 'object' &&
    Object.entries(expected).every(([name, value]) => actual[name] === value)
  if (!exact(product, expectedProduct) || !exact(agent, expectedAgent)) throw sourceError()
  const entry = exactFile(root, 'extensions/kiro.kiro-agent/dist/extension.js',
    128 * 1024 * 1024, filesystem)
  if (createHash('sha256').update(entry).digest('hex') !== MAC_1170_SOURCE.agentSha256)
    throw sourceError()
  return Object.freeze({ appVersion: product.version, vscodeVersion: product.vsCodeVersion,
    commit: product.commit, agentExtensionVersion: agent.version,
    cloudProofMode: 'WINDOWS_1170_DIAGNOSTIC' })
}

// Bundled in place of the product module for this development host only.
module.exports = {
  ...source,
  MAC_APP_ROOT,
  attestMacKiro1170Installation,
  attestWindowsKiroInstallation(vscode, filesystem, executable, options) {
    return process.platform === 'darwin'
      ? attestMacKiro1170Installation(vscode, filesystem ?? fs)
      : source.attestWindowsKiroInstallation(vscode, filesystem, executable, options)
  },
}
