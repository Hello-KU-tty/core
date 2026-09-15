import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const filesystem = require('node:fs')
const {
  inspectProtectedBuiltinFlags,
} = require('../../examples/kiro-native-host/native-protected-tools.cjs')
const {
  PINNED_AGENT,
  PINNED_PRODUCT,
} = require('../../examples/kiro-native-host/native-installation-source.cjs')

function installation(quality = 'stable', version = '1.0.794', override = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-helper-protected-source-')))
  const agent = join(root, 'extensions', 'kiro.kiro-agent')
  mkdirSync(agent, { recursive: true })
  writeFileSync(join(root, 'product.json'), JSON.stringify({ ...PINNED_PRODUCT, quality }))
  writeFileSync(join(agent, 'package.json'), JSON.stringify({ ...PINNED_AGENT, version }))
  if (override) writeFileSync(join(root, 'product.overrides.json'), '{}')
  return root
}

const vscode = (value: unknown, appRoot = installation()) => ({
  env: { appRoot },
  version: '1.109.5',
  commands: {
    executeCommand: async (name: string) => {
      expect(name).toBe('kiroAgent.experiments.getExperiments')
      return value
    },
  },
})
const inspect = (value: unknown, env = {}, appRoot = installation()) =>
  inspectProtectedBuiltinFlags(vscode(value, appRoot), env, filesystem, appRoot)

describe('protected built-in tool feature gate', () => {
  it('rejects nonempty stable experiment metadata even with explicit false fields', async () => {
    await expect(inspect({ agentArtifacts: false, taskTracking: false })).resolves.toEqual({
      artifacts: 'UNKNOWN',
      tasks: 'UNKNOWN',
      screenshot: 'OFF',
      remoteAll: 'OFF',
      quality: 'stable',
      safe: false,
    })
  })

  it('accepts an exact empty stable catalog only under the pinned source contract', async () => {
    expect((await inspect({})).safe).toBe(true)
    expect((await inspect({}, {}, installation('rc'))).safe).toBe(false)
    expect((await inspect({}, {}, installation('stable', '1.0.795'))).safe).toBe(false)
    expect((await inspect({}, {}, installation('stable', '1.0.794', true))).safe).toBe(false)
    expect((await inspect(undefined)).safe).toBe(false)
    expect((await inspect({ unexpected: false })).safe).toBe(false)
    expect(
      (await inspect({ agentArtifacts: false, taskTracking: false, unexpected: true })).safe,
    ).toBe(false)
  })

  it.each([
    { flags: { agentArtifacts: true, taskTracking: false }, env: {} },
    { flags: { agentArtifacts: false, taskTracking: true }, env: {} },
    {
      flags: { agentArtifacts: false, taskTracking: false },
      env: { KIRO_SCREENSHOT_PORT: 'synthetic-port' },
    },
    {
      flags: { agentArtifacts: false, taskTracking: false },
      env: { KIRO_LOAD_ALL_REMOTE_TOOLS: 'true' },
    },
  ])('fails closed for absent or enabled unmapped tools', async ({ flags, env }) => {
    const value = await inspect(flags, env)
    expect(value.safe).toBe(false)
    expect(JSON.stringify(value)).not.toContain('synthetic-port')
  })
})
