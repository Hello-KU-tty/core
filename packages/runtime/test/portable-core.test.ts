import { describe, expect, it } from 'vitest'
import {
  CORE_NODE_VERSIONS,
  coreInstallationIdentity,
  currentCoreRuntime,
  MANAGED_NODE,
  runtimeEnvironment,
  sameRuntimePath,
} from '../src/portable-core.js'

describe('portable Core runtime boundaries', () => {
  it('binds a shared Core to the exact verified installation and role runtime', () => {
    const resources = { root: 'C:\\extensions\\panel-0.0.3\\portable' }
    const runtime = { executable: 'C:\\tools\\node.exe', args: [] as string[], env: {} }
    const identity = coreInstallationIdentity(resources, runtime)
    expect(identity).toMatch(/^[a-f0-9]{64}$/)
    expect(coreInstallationIdentity({ ...resources }, { ...runtime })).toBe(identity)
    expect(
      coreInstallationIdentity({ root: 'C:\\extensions\\panel-0.0.2\\portable' }, runtime),
    ).not.toBe(identity)
    expect(
      coreInstallationIdentity(resources, { ...runtime, executable: 'C:\\other\\node.exe' }),
    ).not.toBe(identity)
    expect(coreInstallationIdentity(resources, { ...runtime, args: ['--different'] })).not.toBe(
      identity,
    )
    expect(
      coreInstallationIdentity(resources, { ...runtime, env: { ELECTRON_RUN_AS_NODE: '1' } }),
    ).not.toBe(identity)
    expect(coreInstallationIdentity(resources, { ...runtime, env: { A: '1', B: '2' } })).toBe(
      coreInstallationIdentity(resources, { ...runtime, env: { B: '2', A: '1' } }),
    )
  })
  it('accepts Windows case differences without accepting another directory', () => {
    expect(sameRuntimePath('C:/Data/Core', 'C:/Data/Other')).toBe(false)
    if (process.platform === 'win32')
      expect(sameRuntimePath('C:/Data/Core', 'c:/data/core')).toBe(true)
  })
  it('removes inherited Node injection and Electron modes before applying the selected runtime', () => {
    const inherited = {
      Path: 'synthetic-path',
      SystemRoot: 'synthetic-system',
      NODE_OPTIONS: '--require unsafe.cjs',
      Node_Path: 'unsafe',
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_EXTRA_LAUNCH_ARGS: '--inspect',
      KEEP: 'value',
    }
    expect(runtimeEnvironment({ env: {} }, inherited)).toEqual({
      Path: 'synthetic-path',
      SystemRoot: 'synthetic-system',
      KEEP: 'value',
    })
    expect(runtimeEnvironment({ env: { ELECTRON_RUN_AS_NODE: '1' } }, inherited)).toEqual({
      Path: 'synthetic-path',
      SystemRoot: 'synthetic-system',
      KEEP: 'value',
      ELECTRON_RUN_AS_NODE: '1',
    })
    expect(inherited.NODE_OPTIONS).toBe('--require unsafe.cjs')
  })
  it('keeps runtime compatibility restricted to Windows x64 and Mac arm64', () => {
    expect(CORE_NODE_VERSIONS).toEqual(['24.18.0', '24.19.0'])
    expect(MANAGED_NODE.url).toBe('https://nodejs.org/dist/v24.19.0/win-x64/node.exe')
    if (process.platform === 'win32' && process.arch === 'x64') {
      expect(currentCoreRuntime()).toMatchObject({
        executable: process.execPath,
        args: [],
        platform: 'win32',
        arch: 'x64',
        napi: 10,
      })
    } else if (process.platform === 'darwin' && process.arch === 'arm64') {
      expect(currentCoreRuntime()).toMatchObject({ platform: 'darwin', arch: 'arm64', napi: 10 })
    } else expect(() => currentCoreRuntime()).toThrow('CORE_RUNTIME_UNSUPPORTED')
  })
})
