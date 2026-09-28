import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { extensionWindowId } = require('../../examples/kiro-native-host/native-window.cjs')
const extension = { id: 'vibe-helper.synthetic-panel' }
const localContext = (path: string) => ({
  extension,
  logUri: { scheme: 'file', authority: '', path },
})

describe('native window identity from extension-owned log URI', () => {
  it.each([
    ['/synthetic/logs/20260929/window7/exthost/vibe-helper.synthetic-panel', 7],
    ['/c:/synthetic/logs/20260929/window28/exthost/vibe-helper.synthetic-panel', 28],
    ['/synthetic/window99/logs/window8/exthost/vibe-helper.synthetic-panel', 8],
  ])('reads the immediate window ancestor in %s', (path, expected) => {
    expect(extensionWindowId(localContext(path))).toBe(expected)
  })

  it.each([
    undefined,
    {},
    { logUri: localContext('/logs/window7/exthost/vibe-helper.synthetic-panel').logUri },
    {
      ...localContext('/logs/window7/exthost/vibe-helper.synthetic-panel'),
      extension: { id: 'other' },
    },
    {
      ...localContext('/logs/window7/exthost/vibe-helper.synthetic-panel'),
      logUri: {
        scheme: 'vscode-remote',
        path: '/logs/window7/exthost/vibe-helper.synthetic-panel',
      },
    },
    localContext('/logs/window0/exthost/vibe-helper.synthetic-panel'),
    localContext('/logs/window07/exthost/vibe-helper.synthetic-panel'),
    localContext('/logs/window9007199254740992/exthost/vibe-helper.synthetic-panel'),
    localContext('/logs/window7/other/vibe-helper.synthetic-panel'),
    localContext('/logs/window7/exthost/vibe-helper.synthetic-panel/nested'),
    localContext('/logs/../window7/exthost/vibe-helper.synthetic-panel'),
    localContext('C:\\logs\\window7\\exthost\\vibe-helper.synthetic-panel'),
  ])('does not invent a window identity for unknown context %#', (context) => {
    expect(extensionWindowId(context)).toBeNull()
  })
})
