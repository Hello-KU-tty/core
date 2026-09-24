import { execFile } from 'node:child_process'
import { chmod, link, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { isPrivateDirectory, privateDirectory } from '../../apps/local-backend/src/private-files.js'

const require = createRequire(import.meta.url)
const {
  privateNativeDirectory,
  privateNativeFile,
} = require('../../examples/kiro-native-host/native-private-directory.cjs')

describe('actual native private paths', () => {
  it(
    'accepts a private descriptor and rejects aliases and a foreign-readable descriptor',
    async () => {
      const root = await privateDirectory(await mkdtemp(join(tmpdir(), 'vibe-private-paths-')))
      expect(await isPrivateDirectory(root)).toBe(true)
      expect(privateNativeDirectory(root)).toBe(true)
      const file = join(root, 'descriptor.json')
      await writeFile(file, '{"synthetic":true}', { mode: 0o600 })
      expect(privateNativeFile(file)).toBe(true)
      await symlink(root, `${root}-junction`, 'junction')
      expect(await isPrivateDirectory(`${root}-junction`)).toBe(false)
      expect(privateNativeDirectory(`${root}-junction`)).toBe(false)
      await link(file, join(root, 'alias.json'))
      expect(privateNativeFile(file)).toBe(false)
      const publicFile = join(root, 'public.json')
      await writeFile(publicFile, '{"synthetic":true}', { mode: 0o600 })
      if (process.platform === 'win32')
        await promisify(execFile)('icacls.exe', [publicFile, '/grant', '*S-1-1-0:R'], {
          windowsHide: true,
        })
      else await chmod(publicFile, 0o644)
      expect(privateNativeFile(publicFile)).toBe(false)
    },
    process.platform === 'win32' ? 150000 : 15000,
  )
})
