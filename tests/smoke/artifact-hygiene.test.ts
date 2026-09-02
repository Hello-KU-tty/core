import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd()

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const location = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(location)))
    } else {
      files.push(location)
    }
  }

  return files
}

describe('artifact and local-data hygiene', () => {
  it('does not emit source maps or absolute workspace paths', async () => {
    const buildDirectories = [
      'apps/crew-app/dist',
      'apps/crew-app/dist-types',
      'apps/crew-backend/dist',
      'apps/mcp-server/dist',
      'packages/contracts/dist',
      'packages/domain/dist',
      'packages/application/dist',
      'packages/storage-sqlite/dist',
      'packages/kiro-adapter/dist',
      'tests/eval/dist',
    ]
    const files = (
      await Promise.all(
        buildDirectories.map((directory) => collectFiles(path.join(workspaceRoot, directory))),
      )
    ).flat()

    expect(files.some((file) => file.endsWith('.map'))).toBe(false)

    for (const file of files.filter((candidate) => /\.(?:js|mjs|d\.ts)$/.test(candidate))) {
      expect(await readFile(file, 'utf8')).not.toContain(workspaceRoot)
    }
  })

  it('keeps environment files, logs, and local databases out of Git by default', async () => {
    const gitignore = await readFile(path.join(workspaceRoot, '.gitignore'), 'utf8')
    const baseTsconfig = JSON.parse(
      await readFile(path.join(workspaceRoot, 'tsconfig.base.json'), 'utf8'),
    ) as { compilerOptions: Record<string, unknown> }
    const viteConfig = await readFile(
      path.join(workspaceRoot, 'apps/crew-app/vite.config.ts'),
      'utf8',
    )

    expect(gitignore).toContain('.env.*')
    expect(gitignore).toContain('*.log')
    expect(gitignore).toContain('.data/')
    expect(baseTsconfig.compilerOptions.sourceMap).toBe(false)
    expect(baseTsconfig.compilerOptions.inlineSources).toBe(false)
    expect(baseTsconfig.compilerOptions.declarationMap).toBe(false)
    expect(viteConfig).toContain('sourcemap: false')
  })

  it('keeps the Crew manifest narrow and test fallbacks out of the production UI bundle', async () => {
    const manifest = JSON.parse(await readFile(path.join(workspaceRoot, 'app.json'), 'utf8')) as {
      ui: { entry: string }
      backend: { entryPoint: string; type: string; healthCheck: string }
      permissions: { api: string[]; storage: boolean; network: boolean }
    }
    const bundle = await readFile(path.join(workspaceRoot, manifest.ui.entry), 'utf8')

    expect(manifest.backend).toMatchObject({
      entryPoint: 'apps/crew-backend/dist/main.js',
      type: 'node',
      healthCheck: '/health',
    })
    expect(manifest.permissions).toEqual({
      api: ['/apps/vibe-helper/api', '/api/chat/slots', '/api/chat/slots/*'],
      storage: false,
      network: false,
      events: [],
    })
    expect(bundle).not.toContain('vibe-helper.test')
    expect(bundle).not.toContain('test-proxy-secret')
    expect(bundle).not.toContain('synthetic-browser-secret')
  })
})
