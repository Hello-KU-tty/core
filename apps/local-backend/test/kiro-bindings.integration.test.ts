import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
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
import { kiroPermissionsFile } from '@vibe-helper/kiro-adapter/kiro-workspace-node'
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
import { WorkspaceRegistry } from '../src/workspace-registry.js'

const repository = new URL('../../../', import.meta.url).pathname

async function setup() {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'vibe-kiro-bind-')))
  const root = join(base, 'core')
  const home = join(base, 'home')
  const workspaceRoot = join(root, 'workspaces')
  await mkdir(join(workspaceRoot, 'projects', ids.project), { recursive: true })
  await mkdir(home, { recursive: true })
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
  const registryFile = join(root, 'registered-workspaces.json')
  const registry = await WorkspaceRegistry.open({ file: registryFile, coreRoot: root })
  const policy = await WorkspacePathPolicy.create(workspaceRoot, {
    registeredWorkspace: (projectId) => registry.get(projectId),
  })
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
    registry,
    steeringTemplate: join(repository, 'docs/agent-prompts/kiro-steering.md'),
    helperPrompt: join(repository, 'docs/agent-prompts/helper.md'),
    homeDirectory: home,
  })
  const generated = join(workspaceRoot, 'projects', ids.project)
  return { base, root, home, handlers, manager, policy, registry, registryFile, generated }
}

describe('Kiro binding manager', () => {
  it('connects a confirmed Project workspace with private descriptors and replaces an older binding', async () => {
    const { root, handlers, manager, generated } = await setup()
    const first = await manager.bind(ids.project)
    expect(first).toMatchObject({
      projectId: ids.project,
      taskId: ids.task,
      workspace: generated,
      registered: false,
      coreTools: 'NOT_REQUESTED',
    })
    expect(handlers.size).toBe(3)
    const directory = join(root, 'kiro-bindings', ids.project)
    for (const name of ['builder-mcp.json', 'helper-mcp.json', 'hook.json']) {
      const info = await lstat(join(directory, name))
      expect(info.mode & 0o077).toBe(0)
    }
    const descriptor = JSON.parse(await readFile(join(directory, 'builder-mcp.json'), 'utf8'))
    expect(descriptor).toMatchObject({ role: 'BUILDER', workspace: first.workspace })
    expect(descriptor.url).toMatch(/^http:\/\/127\.0\.0\.1:47831\/mcp\/native-/)
    const helper = JSON.parse(await readFile(join(directory, 'helper-mcp.json'), 'utf8'))
    expect(helper).toMatchObject({ role: 'HELPER', toolNames: ['get_helper_context'] })
    const steering = await readFile(
      join(first.workspace, '.kiro/steering/vibe-helper-learner.md'),
      'utf8',
    )
    expect(steering).toContain(ids.task)
    expect(steering).toContain('What the learner owns')
    expect(steering).toContain('steering 0.5.0.')
    const agent = await readFile(join(first.workspace, '.kiro/agents/vibe-helper.json'), 'utf8')
    expect(JSON.parse(agent).mcpServers['vibe-helper-helper'].args[1]).toBe(
      join(directory, 'helper-mcp.json'),
    )
    for (const file of ['.kiro/settings/mcp.json', '.kiro/agents/vibe-helper.json'])
      expect(await readFile(join(first.workspace, file), 'utf8')).not.toContain('Bearer')

    await manager.bind(ids.project)
    expect(handlers.size).toBe(3)
    manager.close()
    expect(handlers.size).toBe(0)
  })

  it("registers the learner's empty open folder as the Project folder and keeps it", async () => {
    const { base, manager, registry, registryFile } = await setup()
    const folder = join(base, 'memo app')
    await mkdir(join(folder, '.git'), { recursive: true })
    const bound = await manager.bind(ids.project, { workspace: folder })
    expect(bound).toMatchObject({ workspace: folder, registered: true })
    expect(registry.get(ids.project)).toBe(folder)
    expect((await lstat(registryFile)).mode & 0o077).toBe(0)
    expect(await readFile(join(folder, '.kiro/steering/vibe-helper-learner.md'), 'utf8')).toContain(
      ids.project,
    )
    // Work in the folder does not block rebinding the same Project to it.
    await writeFile(join(folder, 'index.ts'), 'export {}\n')
    expect(await manager.bind(ids.project, { workspace: folder })).toMatchObject({
      workspace: folder,
      registered: true,
    })
    // Without a folder, the Project still resolves to its registered one.
    expect((await manager.bind(ids.project)).workspace).toBe(folder)
    const reopened = await WorkspaceRegistry.open({
      file: registryFile,
      coreRoot: join(base, 'core'),
    })
    expect(reopened.get(ids.project)).toBe(folder)
    manager.close()
  })

  it('refuses folders that are not empty, not canonical or overlap Core data', async () => {
    const { base, root, manager, registry } = await setup()
    const busy = join(base, 'busy')
    await mkdir(busy)
    await writeFile(join(busy, 'README.md'), '# existing\n')
    await expect(manager.bind(ids.project, { workspace: busy })).rejects.toThrow(
      'WORKSPACE_FOLDER_NOT_EMPTY',
    )
    await expect(lstat(join(busy, '.kiro'))).rejects.toThrow()
    const empty = join(base, 'empty')
    await mkdir(empty)
    const link = join(base, 'link')
    await symlink(empty, link)
    await expect(manager.bind(ids.project, { workspace: link })).rejects.toThrow(
      'WORKSPACE_FOLDER_NOT_CANONICAL',
    )
    const insideCore = join(root, 'inside')
    await mkdir(insideCore)
    await expect(manager.bind(ids.project, { workspace: insideCore })).rejects.toThrow(
      'WORKSPACE_FOLDER_OVERLAPS_CORE',
    )
    await expect(manager.bind(ids.project, { workspace: 'relative/path' })).rejects.toThrow(
      'WORKSPACE_FOLDER_INVALID',
    )
    expect(registry.get(ids.project)).toBeUndefined()
    manager.close()
  })

  it('keeps a Project in the folder where its work already is', async () => {
    const first = await setup()
    const folder = join(first.base, 'a')
    const other = join(first.base, 'b')
    await mkdir(folder)
    await mkdir(other)
    await first.manager.bind(ids.project, { workspace: folder })
    await expect(first.manager.bind(ids.project, { workspace: other })).rejects.toThrow(
      'PROJECT_REGISTERED_ELSEWHERE',
    )
    first.manager.close()

    const second = await setup()
    await writeFile(join(second.generated, 'server.ts'), 'export {}\n')
    const empty = join(second.base, 'empty')
    await mkdir(empty)
    await expect(second.manager.bind(ids.project, { workspace: empty })).rejects.toThrow(
      'PROJECT_HAS_GENERATED_FOLDER',
    )
    expect(second.registry.get(ids.project)).toBeUndefined()
    second.manager.close()
  })

  it('fails closed when a registered folder disappears', async () => {
    const { base, manager } = await setup()
    const folder = join(base, 'gone')
    await mkdir(folder)
    await manager.bind(ids.project, { workspace: folder })
    await rm(folder, { recursive: true })
    await expect(manager.bind(ids.project)).rejects.toThrow(
      'The registered Project folder is missing, moved or no longer canonical.',
    )
    manager.close()
  })

  it("writes the Core tools rule into Kiro's permission file only with consent", async () => {
    const { home, manager, generated } = await setup()
    const file = kiroPermissionsFile(home, generated)
    expect((await manager.bind(ids.project)).coreTools).toBe('NOT_REQUESTED')
    await expect(lstat(file)).rejects.toThrow()
    expect((await manager.bind(ids.project, { allowCoreTools: true })).coreTools).toBe('WRITTEN')
    const text = await readFile(file, 'utf8')
    expect(text).toContain('- vibe-helper/*')
    expect(text).toContain('- vibe-helper-helper/*')
    expect((await lstat(file)).mode & 0o077).toBe(0)
    expect((await manager.bind(ids.project, { allowCoreTools: true })).coreTools).toBe(
      'ALREADY_ALLOWED',
    )
    manager.close()
  })
})
