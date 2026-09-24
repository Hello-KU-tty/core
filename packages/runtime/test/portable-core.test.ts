import { describe, expect, it } from 'vitest'
import {
  CORE_NODE_VERSIONS,
  currentCoreRuntime,
  MANAGED_NODE,
  runtimeEnvironment,
  sameRuntimePath,
} from '../src/portable-core.js'

describe('portable Core runtime boundaries', () => {
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
  it('keeps runtime compatibility and downloads restricted to the measured Windows combination', () => {
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
    } else expect(() => currentCoreRuntime()).toThrow('CORE_RUNTIME_UNSUPPORTED')
  })
})
