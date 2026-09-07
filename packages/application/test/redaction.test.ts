import { describe, expect, it } from 'vitest'

import { redactSensitiveText } from '../src/redaction.js'

describe('cross-platform sensitive path redaction', () => {
  it.each([
    'C:\\Users\\Test User\\Desktop\\private project\\file.ts',
    'c:/users/Test User/Documents/private project/file.ts',
    'D:\\Documents and Settings\\Test User\\file.ts',
    '/home/test-user/private/file.ts',
    '/Users/test-user/private/file.ts',
  ])('redacts %s without leaving a username or path suffix', (path) => {
    expect(redactSensitiveText(`Read "${path}" safely.`)).toBe('Read "[REDACTED_PATH]" safely.')
  })

  it('preserves Core-owned relative paths and redacts explicit workspace roots', () => {
    expect(redactSensitiveText('src/main.ts')).toBe('src/main.ts')
    expect(
      redactSensitiveText('D:\\workspaces\\project\\src\\main.ts', 'D:\\workspaces\\project'),
    ).toBe('[WORKSPACE]\\src\\main.ts')
  })
})
