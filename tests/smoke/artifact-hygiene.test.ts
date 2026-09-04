import { readdir, readFile } from 'node:fs/promises'
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
      agents: string[]
      mcpServers: Record<string, { url: string }>
    }
    const bundle = await readFile(path.join(workspaceRoot, 'apps/crew-app/dist/index.mjs'), 'utf8')
    const prompt = await readFile(
      path.join(workspaceRoot, 'docs/agent-prompts/discovery.md'),
      'utf8',
    )
    const discoveryAgents = (await Promise.all(
      manifest.agents.map(async (agentPath) =>
        JSON.parse(await readFile(path.join(workspaceRoot, agentPath), 'utf8')),
      ),
    )) as {
      name: string
      prompt: string
      tools: string[]
      allowedTools: string[]
      includeMcpJson: boolean
    }[]

    expect(manifest.backend).toMatchObject({
      entryPoint: 'apps/crew-backend/dist/main.js',
      type: 'node',
      healthCheck: '/health',
    })
    expect(manifest.ui.entry).toBe('dist/index-0.1.3.mjs')
    expect(manifest.permissions).toEqual({
      api: ['/apps/vibe-helper/api', '/api/chat', '/api/chat/slots', '/api/chat/slots/*'],
      storage: false,
      network: false,
      events: [],
    })
    expect(manifest.mcpServers).toEqual({
      'discovery-preview-core': { url: 'http://127.0.0.1:9100/mcp/discovery-preview' },
      'discovery-enrichment-core': {
        url: 'http://127.0.0.1:9100/mcp/discovery-enrichment',
      },
      'discovery-round-core': { url: 'http://127.0.0.1:9100/mcp/discovery-round' },
      'discovery-merge-core': { url: 'http://127.0.0.1:9100/mcp/discovery-merge' },
      'discovery-spec-core': { url: 'http://127.0.0.1:9100/mcp/discovery-spec' },
      'discovery-spec-recovery-core': {
        url: 'http://127.0.0.1:9100/mcp/discovery-spec-recovery',
      },
    })
    expect(discoveryAgents).toHaveLength(6)
    const previewAgent = discoveryAgents.find((agent) => agent.name.endsWith('-preview'))
    const enrichmentAgent = discoveryAgents.find((agent) => agent.name.endsWith('-enrichment'))
    const roundAgent = discoveryAgents.find((agent) => agent.name.endsWith('-round'))
    const mergeAgent = discoveryAgents.find((agent) => agent.name.endsWith('-merge'))
    const specAgent = discoveryAgents.find((agent) => agent.name.endsWith('-spec'))
    const specRecoveryAgent = discoveryAgents.find((agent) => agent.name.endsWith('-spec-recovery'))
    expect(previewAgent).toMatchObject({
      name: 'vibe-helper-discovery-preview',
      tools: ['@vibe-helper:discovery-preview-core'],
      allowedTools: ['@vibe-helper:discovery-preview-core'],
      includeMcpJson: false,
    })
    expect(previewAgent?.prompt).toContain('submit_candidate_previews')
    expect(previewAgent?.prompt).not.toContain('submit_candidate_enrichments')
    expect(enrichmentAgent).toMatchObject({
      name: 'vibe-helper-discovery-enrichment',
      tools: ['@vibe-helper:discovery-enrichment-core'],
      allowedTools: ['@vibe-helper:discovery-enrichment-core'],
      includeMcpJson: false,
    })
    expect(enrichmentAgent?.prompt).toContain('submit_candidate_enrichments')
    expect(enrichmentAgent?.prompt).not.toContain('submit_candidate_previews')
    expect(roundAgent).toMatchObject({
      name: 'vibe-helper-discovery-round',
      tools: ['@vibe-helper:discovery-round-core'],
      allowedTools: ['@vibe-helper:discovery-round-core'],
      includeMcpJson: false,
    })
    expect(roundAgent?.prompt).toContain('submit_candidate_round')
    expect(roundAgent?.prompt).not.toContain('submit_learning_spec')
    expect(mergeAgent).toMatchObject({
      name: 'vibe-helper-discovery-merge',
      tools: ['@vibe-helper:discovery-merge-core'],
      allowedTools: ['@vibe-helper:discovery-merge-core'],
      includeMcpJson: false,
    })
    expect(mergeAgent?.prompt).toContain('submit_candidate_merge')
    expect(mergeAgent?.prompt).not.toContain('submit_candidate_round')
    expect(mergeAgent?.prompt).not.toContain('submit_learning_spec')
    expect(specAgent).toMatchObject({
      name: 'vibe-helper-discovery-spec',
      tools: ['@vibe-helper:discovery-spec-core'],
      allowedTools: ['@vibe-helper:discovery-spec-core'],
      includeMcpJson: false,
    })
    expect(specAgent?.prompt).toContain('submit_learning_spec')
    expect(specAgent?.prompt).not.toContain('submit_candidate_round')
    expect(specAgent?.prompt).not.toContain('get_discovery_context')
    expect(specRecoveryAgent).toMatchObject({
      name: 'vibe-helper-discovery-spec-recovery',
      tools: ['@vibe-helper:discovery-spec-recovery-core'],
      allowedTools: ['@vibe-helper:discovery-spec-recovery-core'],
      includeMcpJson: false,
    })
    expect(specRecoveryAgent?.prompt).toContain('get_discovery_context')
    expect(specRecoveryAgent?.prompt).toContain('submit_learning_spec')
    expect(roundAgent?.prompt.length).toBeLessThan(prompt.length)
    expect(specAgent?.prompt.length).toBeLessThan(prompt.length)
    expect(bundle).not.toContain('vibe-helper.test')
    expect(bundle).not.toContain('test-proxy-secret')
    expect(bundle).not.toContain('synthetic-browser-secret')
  })

  it('stages a minimal self-contained Crew package with one exact native runtime dependency', async () => {
    const packageRoot = path.join(workspaceRoot, 'dist/crew-package')
    const files = (await collectFiles(packageRoot))
      .map((file) => path.relative(packageRoot, file))
      .sort()
    const runtimeManifest = JSON.parse(
      await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> }
    const appManifest = JSON.parse(await readFile(path.join(packageRoot, 'app.json'), 'utf8')) as {
      ui: { entry: string }
    }
    const backend = await readFile(path.join(packageRoot, 'apps/crew-backend/dist/main.js'), 'utf8')

    expect(files).toContain('agents/vibe-helper-discovery-round.json')
    expect(files).toContain('agents/vibe-helper-discovery-preview.json')
    expect(files).toContain('agents/vibe-helper-discovery-enrichment.json')
    expect(files).toContain('agents/vibe-helper-discovery-merge.json')
    expect(files).toContain('agents/vibe-helper-discovery-spec.json')
    expect(files).toContain('agents/vibe-helper-discovery-spec-recovery.json')
    expect(files).toContain('app.json')
    expect(files).toContain(path.join('ui', appManifest.ui.entry))
    expect(files).toContain('apps/crew-backend/dist/main.js')
    expect(files).toContain('apps/crew-backend/drizzle/meta/_journal.json')
    expect(files).toContain('package.json')
    expect(
      files.every(
        (file) =>
          /^(?:agents|apps|ui)\//.test(file) || file === 'app.json' || file === 'package.json',
      ),
    ).toBe(true)
    expect(runtimeManifest.dependencies).toEqual({
      'better-sqlite3': '12.11.1',
      'drizzle-orm': '0.45.2',
    })
    expect(backend).not.toMatch(/from\s+["']@vibe-helper\//)
    expect(backend).not.toContain(workspaceRoot)
  })
})
