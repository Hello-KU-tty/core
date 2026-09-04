import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  type DependencyRule,
  findBoundaryViolations,
  type WorkspaceManifest,
} from '../support/workspace-boundaries.js'

const workspaceRoot = process.cwd()

const packageLocations = [
  'apps/crew-app',
  'apps/crew-backend',
  'apps/mcp-server',
  'packages/contracts',
  'packages/domain',
  'packages/application',
  'packages/storage-sqlite',
  'packages/kiro-adapter',
  'tests/eval',
] as const

const dependencyRules: readonly DependencyRule[] = [
  {
    packageName: '@vibe-helper/crew-app',
    allowedInternalDependencies: ['@vibe-helper/contracts', '@vibe-helper/kiro-adapter'],
  },
  {
    packageName: '@vibe-helper/crew-backend',
    allowedInternalDependencies: [
      '@vibe-helper/application',
      '@vibe-helper/contracts',
      '@vibe-helper/mcp-server',
      '@vibe-helper/storage-sqlite',
    ],
  },
  {
    packageName: '@vibe-helper/mcp-server',
    allowedInternalDependencies: [
      '@vibe-helper/contracts',
      '@vibe-helper/application',
      '@vibe-helper/storage-sqlite',
    ],
  },
  { packageName: '@vibe-helper/contracts', allowedInternalDependencies: [] },
  {
    packageName: '@vibe-helper/domain',
    allowedInternalDependencies: ['@vibe-helper/contracts'],
  },
  {
    packageName: '@vibe-helper/application',
    allowedInternalDependencies: ['@vibe-helper/contracts', '@vibe-helper/domain'],
  },
  {
    packageName: '@vibe-helper/storage-sqlite',
    allowedInternalDependencies: [
      '@vibe-helper/contracts',
      '@vibe-helper/domain',
      '@vibe-helper/application',
    ],
  },
  {
    packageName: '@vibe-helper/kiro-adapter',
    allowedInternalDependencies: ['@vibe-helper/contracts', '@vibe-helper/application'],
  },
  {
    packageName: '@vibe-helper/eval',
    allowedInternalDependencies: ['@vibe-helper/contracts', '@vibe-helper/domain'],
  },
]

async function readWorkspaceManifest(location: string): Promise<WorkspaceManifest> {
  const contents = await readFile(path.join(workspaceRoot, location, 'package.json'), 'utf8')
  return JSON.parse(contents) as WorkspaceManifest
}

async function readSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const location = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await readSourceFiles(location)))
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(await readFile(location, 'utf8'))
    }
  }

  return files
}

describe('workspace package boundaries', () => {
  it('matches the approved package dependency graph', async () => {
    const manifests = await Promise.all(packageLocations.map(readWorkspaceManifest))

    expect(manifests.map((manifest) => manifest.name).sort()).toEqual(
      dependencyRules.map((rule) => rule.packageName).sort(),
    )
    expect(findBoundaryViolations(manifests, dependencyRules)).toEqual([])
  })

  it('keeps storage and Kiro transport details out of Crew UI source', async () => {
    const sources = await readSourceFiles(path.join(workspaceRoot, 'apps/crew-app/src'))
    const combinedSource = sources.join('\n')

    expect(combinedSource).not.toMatch(/@vibe-helper\/storage-sqlite/)
    expect(combinedSource).not.toMatch(/better-sqlite3|drizzle-orm/)
    expect(combinedSource).not.toMatch(/\/api\/chat|ChatEmbed/)
    expect(combinedSource).not.toMatch(/\.\.\/\.\.\/\.\.\/packages\//)
  })
})
