import { describe, expect, it } from 'vitest'
import { builderSessionBindingDescriptorSchema } from '@vibe-helper/contracts'
import { guardCommand } from '../src/private-files.js'

describe('Windows path contract (not a native Windows execution proof)', () => {
  it('quotes drive paths with spaces and rejects shell expansion and relative paths', () => {
    expect(
      guardCommand(
        'C:\\Program Files\\nodejs\\node.exe',
        'C:\\dev folder\\guard.js',
        'C:\\dev folder\\project_a',
        'win32',
      ),
    ).toBe(
      '"C:\\Program Files\\nodejs\\node.exe" "C:\\dev folder\\guard.js" --workspace "C:\\dev folder\\project_a"',
    )
    for (const path of ['C:\\a%PATH%\\x', 'C:\\a&b\\x', 'C:\\a"b\\x', 'relative\\x']) {
      expect(() => guardCommand('C:\\node.exe', 'C:\\guard.js', path, 'win32')).toThrow()
    }
  })
  it('exposes absolute native workspace paths without accepting relative or control characters', () => {
    const schema = builderSessionBindingDescriptorSchema.shape.workspaceDirectory
    for (const path of ['C:\\Users\\Example User\\project_a', 'D:/dev/project_a', '/tmp/project_a'])
      expect(schema.safeParse(path).success).toBe(true)
    for (const path of ['projects/a', 'C:relative', 'C:\\a\nsecret', '\\\\server\\share'])
      expect(schema.safeParse(path).success).toBe(false)
  })
})
