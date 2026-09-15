const assert = require('node:assert/strict')
const { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { test } = require('node:test')

const { PINNED_AGENT, PINNED_PRODUCT, attestPinnedKiroInstallation } =
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
  symlinkSync(root, rootAlias)
  assert.throws(() => attestPinnedKiroInstallation(vscode(rootAlias), undefined, root), error =>
    error.code === 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED')

  const escapedRoot = realpathSync(
    mkdtempSync(join(tmpdir(), 'vibe-helper-pinned-kiro-escape-')),
  )
  writeFileSync(join(escapedRoot, 'package.json'), JSON.stringify(PINNED_AGENT))
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-helper-pinned-kiro-parent-')))
  writeFileSync(join(parent, 'product.json'), JSON.stringify(PINNED_PRODUCT))
  mkdirSync(join(parent, 'extensions'))
  symlinkSync(escapedRoot, join(parent, 'extensions', 'kiro.kiro-agent'))
  assert.throws(() => attestPinnedKiroInstallation(vscode(parent), undefined, parent), error =>
    error.code === 'NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED')
})
