import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
const { nativeReadErrorCode } = createRequire(import.meta.url)(
  '../../examples/kiro-native-host/native-tool-diagnostic.cjs',
)
describe('display-only native missing-file diagnostics', () => {
  it.each([
    { code: 'ENOENT' },
    'ENOENT: no such file',
    'File not found: synthetic.ts',
    { message: 'ENOENT: open synthetic.ts' },
  ])('classifies a failed native read: %j', (output) => {
    expect(nativeReadErrorCode('read', 'failed', output)).toBe('NATIVE_FILE_NOT_FOUND')
    expect(nativeReadErrorCode('read', 'completed', output)).toBeNull()
    expect(nativeReadErrorCode('shell', 'failed', output)).toBeNull()
  })
  it.each([null, { code: 'EACCES' }, 'This file mentions ENOENT', { code: 'private-secret' }])(
    'does not guess or leak an unrelated error: %j',
    (output) => {
      expect(nativeReadErrorCode('read', 'failed', output)).toBeNull()
    },
  )
})
