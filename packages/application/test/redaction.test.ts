import { describe, expect, it } from 'vitest'

import {
  redactContractText,
  redactSensitiveText,
  SensitiveReferencePathError,
} from '../src/redaction.js'

describe('cross-platform sensitive path redaction', () => {
  it.each([
    'C:\\Users\\Test User\\Desktop\\private project\\file.ts',
    'c:/users/Test User/Documents/private project/file.ts',
    'D:\\Documents and Settings\\Test User\\file.ts',
    '/home/test-user/private/file.ts',
    '/Users/test-user/private/file.ts',
    '/home/Test User/private folder/file.ts',
    '/Users/Test User/private folder/file.ts',
  ])('redacts %s without leaving a username or path suffix', (path) => {
    expect(redactSensitiveText(`Read "${path}" safely.`)).toBe('Read "[REDACTED_PATH]" safely.')
  })

  it('preserves text after an unquoted user path, including a redacted assignment', () => {
    expect(
      redactSensitiveText('Changed /Users/example/private/file.ts token=synthetic-secret safely.'),
    ).toBe('Changed [REDACTED_PATH] token=[REDACTED] safely.')
  })

  it('preserves Core-owned relative paths and redacts explicit workspace roots', () => {
    expect(redactSensitiveText('src/main.ts')).toBe('src/main.ts')
    expect(
      redactSensitiveText('D:\\workspaces\\project\\src\\main.ts', 'D:\\workspaces\\project'),
    ).toBe('[WORKSPACE]\\src\\main.ts')
  })
})

describe('structured contract redaction', () => {
  it('keeps unchanged subtrees and provenance, and never mutates the caller input', () => {
    const source = { kind: 'AGENT', role: 'BUILDER' }
    const reference = { kind: 'CODE', path: 'src/main.ts', lineRange: { start: 1, end: 2 } }
    const input = {
      source,
      codeReferences: [reference],
      summaries: ['token=fixture'],
      redactionStatus: 'NOT_REQUIRED',
    }
    const output = redactContractText(input) as typeof input
    expect(output).toMatchObject({
      summaries: ['token=[REDACTED]'],
      redactionStatus: 'VERIFIED_REDACTED',
    })
    expect(output.source).toBe(source)
    expect(output.codeReferences).toBe(input.codeReferences)
    expect(input.summaries).toEqual(['token=fixture'])
    expect(redactContractText(output)).toBe(output)
  })

  it.each(['path', 'paths', 'generatedWorkspacePath'])(
    'rejects sensitive %s instead of redirecting a reference',
    (field) => {
      const value = 'src/token=fixture-secret.ts'
      expect(() => redactContractText({ [field]: field === 'paths' ? [value] : value })).toThrow(
        SensitiveReferencePathError,
      )
    },
  )

  it.each(['RSA ', 'EC ', 'OPENSSH ', ''])('redacts a complete %sprivate key block', (prefix) => {
    expect(
      redactSensitiveText(
        `before\n-----BEGIN ${prefix}PRIVATE KEY-----\nsynthetic-key-body\n-----END ${prefix}PRIVATE KEY-----\nafter`,
      ),
    ).toBe('before\n[REDACTED_PRIVATE_KEY]\nafter')
  })

  it('redacts an unterminated private key block through the end of its bounded text', () => {
    expect(redactSensitiveText('-----BEGIN PRIVATE KEY-----\nsynthetic-key-body')).toBe(
      '[REDACTED_PRIVATE_KEY]',
    )
  })
})
