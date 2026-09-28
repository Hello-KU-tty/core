import { describe, expect, it } from 'vitest'
import { redactSensitiveText, SensitiveTextStream } from '../src/redaction.js'

describe('split-delta redaction', () => {
  it.each([
    'prefix token=synthetic-stream-secret after\n',
    'prefix password="a secret with spaces and\na newline" after\n',
    `prefix api_key${' '.repeat(160)}=${'\n '.repeat(80)}synthetic-key-value after\n`,
    `prefix Bearer${' '.repeat(140)}synthetic-bearer-token-value after\n`,
    'prefix sk-abcdefghijklmnopqrstuvwxyz123456789 after\n',
    'prefix ghp_abcdefghijklmnopqrstuvwxyz123456789 after\n',
    'prefix AKIAABCDEFGHIJKLMNOP after\n',
    'read "/Users/Test User/private folder/file.txt" after\n',
    'read "/home/Test User/private folder/file.txt" after\n',
    `read '/Users/Test User/${'private folder/'.repeat(12)}file.txt' safely\n`,
    'Changed /Users/example/private/file.ts token=synthetic-secret safely.\n',
    'read "C:\\Users\\Test User\\private folder\\file.txt" after\n',
    'before\n-----BEGIN RSA PRIVATE KEY-----\nsynthetic-private-key-body\n-----END RSA PRIVATE KEY-----\nafter',
  ])('matches whole-text redaction at every two-part and one-character boundary: %s', (raw) => {
    const expected = redactSensitiveText(raw)
    for (let at = 0; at <= raw.length; at++) {
      const stream = new SensitiveTextStream()
      expect(stream.push(raw.slice(0, at)) + stream.push(raw.slice(at)) + stream.finish()).toBe(
        expected,
      )
    }
    const stream = new SensitiveTextStream()
    expect([...raw].map((char) => stream.push(char)).join('') + stream.finish()).toBe(expected)
  })

  it('keeps ordinary long progress live while retaining only the look-behind', () => {
    const raw = 'Normal progress without credentials. '.repeat(30)
    const stream = new SensitiveTextStream()
    const ready = stream.push(raw)
    expect(ready).toBe(raw.slice(0, -64))
    expect(ready + stream.finish()).toBe(raw)
  })

  it('handles a workspace root longer than the default look-behind across every split', () => {
    const root = `/private/tmp/${'generated-project-'.repeat(8)}`
    const raw = `Reading ${root}/src/main.ts now. ${'Done. '.repeat(30)}`
    for (let at = 0; at < raw.length; at++) {
      const stream = new SensitiveTextStream([root])
      expect(stream.push(raw.slice(0, at)) + stream.push(raw.slice(at)) + stream.finish()).toBe(
        raw.replace(root, '[WORKSPACE]'),
      )
    }
  })

  it('fails closed for an over-limit unfinished secret and does not leak a later continuation', () => {
    const stream = new SensitiveTextStream()
    expect(stream.push(`token=${'x'.repeat(65_536)}`)).toBe('[REDACTED_STREAM_LIMIT]')
    expect(stream.push('remaining-secret now normal text')).toBe('')
    expect(stream.finish()).toBe('')
  })

  it('discards a cancelled tail without exposing or retaining it', () => {
    const stream = new SensitiveTextStream()
    expect(stream.push('token=unfinished')).toBe('')
    stream.discard()
    expect(stream.finish()).toBe('')
  })
})
