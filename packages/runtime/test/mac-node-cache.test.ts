import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acquireCoreNode, type CoreResources, sha256 } from '../src/portable-core.js'

describe.skipIf(process.platform !== 'darwin' || process.arch !== 'arm64')(
  'persistent Mac Node cache',
  () => {
    async function fixture() {
      const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-mac-cache-')))
      const installed = join(root, 'portable')
      await mkdir(join(installed, 'bin'), { recursive: true })
      await mkdir(join(installed, 'licenses'))
      const files: Record<string, { sha256: string; bytes: number }> = {}
      for (const name of ['bin/node', 'licenses/node-LICENSE']) {
        const bytes = Buffer.from('synthetic ' + name)
        await writeFile(join(installed, name), bytes)
        files[name] = { sha256: sha256(bytes), bytes: bytes.length }
      }
      return {
        root,
        resources: {
          root: installed,
          manifest: { target: 'darwin-arm64', files },
        } as CoreResources,
        cache: join(root, 'cache'),
      }
    }
    it('atomically copies verified bytes, survives old install removal and handles concurrent acquisition', async () => {
      const { resources, cache } = await fixture()
      const paths = await Promise.all([
        acquireCoreNode(cache, resources, { offline: true }),
        acquireCoreNode(cache, resources, { offline: true }),
      ])
      expect(paths[0]).toBe(paths[1])
      expect((await lstat(paths[0]!)).mode & 0o777).toBe(0o700)
      await rename(resources.root, resources.root + '-preserved')
      expect(await acquireCoreNode(cache, resources, { offline: true })).toBe(paths[0])
      expect(await readFile(paths[0]!, 'utf8')).toBe('synthetic bin/node')
    })
    it.each(['node', 'LICENSE'])(
      'rejects changed cached %s without executing or overwriting it',
      async (name) => {
        const { resources, cache } = await fixture()
        const path = join(dirname(await acquireCoreNode(cache, resources)), name)
        await writeFile(path, 'tampered')
        await expect(acquireCoreNode(cache, resources)).rejects.toThrow('RUNTIME_CACHE_CORRUPT')
        expect(await readFile(path, 'utf8')).toBe('tampered')
      },
    )
    it('rejects a linked cache destination', async () => {
      const { resources, cache } = await fixture()
      const directory = dirname(await acquireCoreNode(cache, resources))
      await rename(directory, directory + '-preserved')
      await symlink(directory + '-preserved', directory, 'dir')
      await expect(acquireCoreNode(cache, resources)).rejects.toThrow('RUNTIME_CACHE_UNSAFE')
    })
    it('rejects installation bytes not matching the manifest', async () => {
      const { resources, cache } = await fixture()
      await writeFile(join(resources.root, 'bin/node'), 'wrong')
      await expect(acquireCoreNode(cache, resources)).rejects.toThrow('RUNTIME_CACHE_CORRUPT')
    })
  },
)
