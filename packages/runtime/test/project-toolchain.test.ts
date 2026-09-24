import { describe, expect, it } from 'vitest'
import {
  type ProjectToolchain,
  projectCommandArgs,
  projectEnvironment,
  unpackPnpm,
} from '../src/project-toolchain.js'

describe('generated project tool boundary', () => {
  it('keeps the native command vocabulary finite', () => {
    for (const command of [
      'pnpm install --frozen-lockfile',
      'pnpm run smoke',
      'pnpm test',
      'node --test',
      'pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile',
    ])
      expect(projectCommandArgs(command)).not.toBeNull()
    for (const command of [
      'pnpm install',
      'pnpm add bad',
      'pnpm run build & whoami',
      'node --test ../test.js',
      'node -e x',
      'pnpm run build\nwhoami',
      'pnpm run build -- %PATH%',
      'pnpm run build -- C:\\escape',
    ])
      expect(projectCommandArgs(command)).toBeNull()
  })
  it('does not pass Core credentials, Node injection or user config into generated apps', () => {
    const tc = {
      node: { executable: 'C:\\tools\\node.exe' },
      privateRoot: 'C:\\tools',
    } as ProjectToolchain
    const env = projectEnvironment(tc, {
      PATH: 'C:\\untrusted',
      SystemRoot: 'C:\\Windows',
      NODE_OPTIONS: '--require evil',
      ELECTRON_RUN_AS_NODE: '1',
      VIBE_CORE_TOKEN: 'synthetic-private-value',
      NPM_CONFIG_USERCONFIG: 'C:\\user.npmrc',
      USERPROFILE: 'C:\\user',
    })
    expect(env.NODE_OPTIONS).toBeUndefined()
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
    expect(env.VIBE_CORE_TOKEN).toBeUndefined()
    expect(env.PATH).not.toContain('untrusted')
    expect(env.npm_config_userconfig).not.toContain('user.npmrc')
    expect(env.USERPROFILE).not.toBe('C:\\user')
  })
  it('rejects unverified archives before decompression or extraction', () => {
    expect(() => unpackPnpm(Buffer.from('not a trusted package'))).toThrow(
      'PNPM_DOWNLOAD_HASH_MISMATCH',
    )
  })
})
