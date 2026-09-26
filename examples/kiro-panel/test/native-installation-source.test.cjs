const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { test } = require('node:test')

const { PINNED_AGENT, PINNED_PRODUCT, WINDOWS_1170_SOURCE, attestPinnedKiroInstallation,
  attestWindowsKiroInstallation } =
  require('../../kiro-native-host/native-installation-source.cjs')

function stageKiroInstallation(overrides = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-helper-pinned-kiro-')))
  const agent = join(root, 'extensions', 'kiro.kiro-agent')
  mkdirSync(agent, { recursive: true })
  writeFileSync(join(root, 'product.json'), JSON.stringify({
    ...PINNED_PRODUCT,
    ...overrides.product,
  }))
  writeFileSync(join(agent, 'package.json'), JSON.stringify({
    ...PINNED_AGENT,
    ...overrides.agent,
  }))
  return root
}

const vscode = appRoot => ({ version: '1.109.5', env: { appRoot } })

test('the running app root proves exact pinned Kiro and isolated Agent metadata', () => {
  const root = stageKiroInstallation()
  assert.deepEqual(attestPinnedKiroInstallation(vscode(root), undefined, root), {
    appVersion: '1.0.437',
    vscodeVersion: '1.109.5',
    commit: '5349479558af37fecbfcdb58c199ee59d86d4dd3',
    quality: 'stable',
    agentExtensionVersion: '1.0.794',
  })
})

test('wrong product or Agent metadata fails closed without an extension API fallback', () => {
  for (const root of [
    stageKiroInstallation({ product: { version: '1.0.438' } }),
    stageKiroInstallation({ agent: { version: '1.0.795' } }),
    stageKiroInstallation({ agent: { publisher: 'fixture-other' } }),
  ]) assert.throws(() => attestPinnedKiroInstallation(vscode(root), undefined, root), error =>
    error.code === 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED')
})

test('matching copied manifests outside the pinned application root fail closed', () => {
  const copiedRoot = stageKiroInstallation()
  assert.throws(() => attestPinnedKiroInstallation(vscode(copiedRoot)), error =>
    error.code === 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED')
})

test('a product override fails closed even when both base manifests match', () => {
  const root = stageKiroInstallation()
  writeFileSync(join(root, 'product.overrides.json'), '{}')
  assert.throws(() => attestPinnedKiroInstallation(vscode(root), undefined, root), error =>
    error.code === 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED')
})

test('a symlinked app or Agent source cannot escape the running app root', () => {
  const root = stageKiroInstallation()
  const rootAlias = `${root}-alias`
  symlinkSync(root, rootAlias, 'junction')
  assert.throws(() => attestPinnedKiroInstallation(vscode(rootAlias), undefined, root), error =>
    error.code === 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED')

  const escapedRoot = realpathSync(
    mkdtempSync(join(tmpdir(), 'vibe-helper-pinned-kiro-escape-')),
  )
  writeFileSync(join(escapedRoot, 'package.json'), JSON.stringify(PINNED_AGENT))
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-helper-pinned-kiro-parent-')))
  writeFileSync(join(parent, 'product.json'), JSON.stringify(PINNED_PRODUCT))
  mkdirSync(join(parent, 'extensions'))
  symlinkSync(escapedRoot, join(parent, 'extensions', 'kiro.kiro-agent'), 'junction')
  assert.throws(() => attestPinnedKiroInstallation(vscode(parent), undefined, parent), error =>
    error.code === 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED')
})

test('Windows 1.1.70 requires exact metadata and pinned source bytes in ordinary and diagnostic mode',
  { skip: process.platform !== 'win32' || process.arch !== 'x64' }, () => {
    const fs = require('node:fs')
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-windows-source-')))
    const root = join(parent, 'resources', 'app')
    const agent = join(root, 'extensions', 'kiro.kiro-agent')
    mkdirSync(join(agent, 'dist'), { recursive: true })
    const product = { nameShort: 'Kiro', applicationName: 'kiro',
      version: WINDOWS_1170_SOURCE.version, vsCodeVersion: WINDOWS_1170_SOURCE.vsCodeVersion,
      commit: WINDOWS_1170_SOURCE.commit, quality: 'stable' }
    writeFileSync(join(root, 'product.json'), JSON.stringify(product))
    writeFileSync(join(agent, 'package.json'), JSON.stringify({
      ...PINNED_AGENT, version: WINDOWS_1170_SOURCE.agentVersion,
    }))
    const entry = join(agent, 'dist', 'extension.js')
    writeFileSync(entry, '// synthetic untrusted Agent bytes')
    let entryReads = 0
    const filesystem = { ...fs, readFileSync(file, ...args) {
      if (file === entry) entryReads++
      return fs.readFileSync(file, ...args)
    } }
    const host = { version: '1.131.0', env: { appRoot: root } }
    const executable = join(parent, 'Kiro.exe')
    assert.throws(() => attestWindowsKiroInstallation(host, filesystem, executable),
      /NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED/)
    assert.equal(entryReads, 1)
    assert.throws(() => attestWindowsKiroInstallation(host, filesystem, executable,
      { diagnostic1170: true }), /NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED/)
    assert.equal(entryReads, 2)
    writeFileSync(join(root, 'product.json'), JSON.stringify({ ...product, commit: 'unknown' }))
    assert.throws(() => attestWindowsKiroInstallation(host, filesystem, executable,
      { diagnostic1170: true }), /NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED/)
    assert.equal(entryReads, 2)
  })
