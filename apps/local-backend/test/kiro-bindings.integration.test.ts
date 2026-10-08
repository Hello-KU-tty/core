import { lstat, mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import {
  builderTaskSchema,
  candidateRoundSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  learningSpecRevisionSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from '@vibe-helper/contracts'
import { openInMemorySqliteStorage } from '@vibe-helper/storage-sqlite'
import { describe, expect, it } from 'vitest'
import {
  builderTaskFixture,
  candidateFixture,
  candidateRoundFixture,
  confirmedLearningSpecFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  ids,
  projectFixture,
} from '../../../packages/contracts/test/fixtures.js'
import type { LocalMcpHandler } from '../src/agent-host.js'
import { KiroBindingManager } from '../src/kiro-bindings.js'

describe('Kiro binding manager', () => {
  it('connects a confirmed Project workspace with private descriptors and replaces an older binding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibe-kiro-bind-'))
    const workspaceRoot = join(root, 'workspaces')
    await mkdir(join(workspaceRoot, 'projects', ids.project), { recursive: true })
    const storage = await openInMemorySqliteStorage()
    storage.transaction((repository) => {
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          generatedWorkspacePath: `projects/${ids.project}`,
        }),
      )
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
      repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
      repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
      repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(confirmedLearningSpecFixture))
      repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
    })
    const policy = await WorkspacePathPolicy.create(workspaceRoot)
    const handlers = new Map<string, LocalMcpHandler>()
    const manager = new KiroBindingManager({
      application: new ApplicationService({ storage, workspacePolicy: policy }),
      policy,
      root,
      handlers,
      baseUrl: () => 'http://127.0.0.1:47831',
      nodeExecutable: '/opt/node/bin/node',
      bridgeScript: '/opt/vibe/bridge.mjs',
      hookScript: '/opt/vibe/kiro-hook.mjs',
    })
    const first = await manager.bind(ids.project)
    expect(first).toMatchObject({ projectId: ids.project, taskId: ids.task })
    expect(handlers.size).toBe(2)
    const directory = join(root, 'kiro-bindings', ids.project)
    for (const name of ['builder-mcp.json', 'hook.json']) {
      const info = await lstat(join(directory, name))
      expect(info.mode & 0o077).toBe(0)
    }
    const descriptor = JSON.parse(await readFile(join(directory, 'builder-mcp.json'), 'utf8'))
    expect(descriptor).toMatchObject({ role: 'BUILDER', workspace: first.workspace })
    expect(descriptor.url).toMatch(/^http:\/\/127\.0\.0\.1:47831\/mcp\/native-/)
    const steering = await readFile(
      join(first.workspace, '.kiro/steering/vibe-helper-learner.md'),
      'utf8',
    )
    expect(steering).toContain(ids.task)
    expect(steering).toContain('What the learner owns')
    const workspaceFiles = await readFile(join(first.workspace, '.kiro/settings/mcp.json'), 'utf8')
    expect(workspaceFiles).not.toContain('Bearer')

    await manager.bind(ids.project)
    expect(handlers.size).toBe(2)
    manager.close()
    expect(handlers.size).toBe(0)
  })
})
