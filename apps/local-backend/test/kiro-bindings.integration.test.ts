import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { isPrivateDirectory } from '../src/private-files.js'
import { WorkspaceRegistry } from '../src/workspace-registry.js'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
// Only the owner can read the file. POSIX: its mode. Windows: modes are not permissions; a file
// inherits its folder's ACL, which the descriptor test checks with isPrivateDirectory.
const ownerOnly = async (file: string) =>
  process.platform === 'win32' || ((await lstat(file)).mode & 0o077) === 0

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
  const application = new ApplicationService({ storage, workspacePolicy: policy })
  // One Core process: a later call stands for the next Core on the same data (a restart).
  const startCore = (baseUrl: string) => {
    const handlers = new Map<string, LocalMcpHandler>()
    const manager = new KiroBindingManager({
      application,
      policy,
      root,
      handlers,
      baseUrl: () => baseUrl,
      nodeExecutable: '/opt/node/bin/node',
      bridgeScript: '/opt/vibe/bridge.mjs',
      hookScript: '/opt/vibe/kiro-hook.mjs',
      registry,
      steeringTemplate: join(repository, 'docs/agent-prompts/kiro-steering.md'),
      helperPrompt: join(repository, 'docs/agent-prompts/helper.md'),
      homeDirectory: home,
    })
    return { handlers, manager }
  }
  const { handlers, manager } = startCore('http://127.0.0.1:47831')
  const generated = join(workspaceRoot, 'projects', ids.project)
  return {
    base,
    root,
    home,
    handlers,
    manager,
    policy,
    registry,
    registryFile,
    generated,
    startCore,
  }
}

const descriptors = async (root: string) => {
  const directory = join(root, 'kiro-bindings', ids.project)
  const read = async (name: string) => JSON.parse(await readFile(join(directory, name), 'utf8'))
  return {
    builder: await read('builder-mcp.json'),
    helper: await read('helper-mcp.json'),
    hook: await read('hook.json'),
  }
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
    for (const name of ['builder-mcp.json', 'helper-mcp.json', 'hook.json'])
      expect(await ownerOnly(join(directory, name))).toBe(true)
    if (process.platform === 'win32') expect(await isPrivateDirectory(directory)).toBe(true)
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
    expect(steering).toContain('steering 0.5.2.')
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
    expect(await ownerOnly(registryFile)).toBe(true)
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
    expect(await ownerOnly(file)).toBe(true)
    expect((await manager.bind(ids.project, { allowCoreTools: true })).coreTools).toBe(
      'ALREADY_ALLOWED',
    )
    manager.close()
  })

  it('rewrites descriptors in place on a rebind and keeps them for the next Core', async () => {
    const { root, handlers, manager } = await setup()
    await manager.bind(ids.project)
    const before = await descriptors(root)
    await manager.bind(ids.project)
    // Nothing marks the descriptors revoked first, so a late write cannot undo the new binding.
    await new Promise((done) => setTimeout(done, 50))
    const after = await descriptors(root)
    for (const descriptor of [after.builder, after.helper, after.hook]) {
      expect(descriptor.status).toBeUndefined()
      expect(handlers.has(new URL(descriptor.url).pathname)).toBe(true)
    }
    expect(after.builder).toMatchObject({ lifecycle: 'PROJECT', role: 'BUILDER' })
    expect(after.helper).toMatchObject({ lifecycle: 'PROJECT', role: 'HELPER' })
    expect(after.builder.url).not.toBe(before.builder.url)
    manager.close()
    // Core stopping leaves the descriptors for the next Core to rewrite; hooks queue meanwhile.
    expect((await descriptors(root)).builder).toEqual(after.builder)
  })

  it('a new Core restores the Project connection, and leaves a removed folder alone', async () => {
    const { root, manager, generated, startCore } = await setup()
    await manager.bind(ids.project)
    manager.close()
    await writeFile(
      join(generated, '.kiro/settings/mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'x' } } }),
    )

    const next = startCore('http://127.0.0.1:47999')
    expect(await next.manager.restore()).toEqual([ids.project])
    expect(next.handlers.size).toBe(3)
    const restored = await descriptors(root)
    for (const descriptor of [restored.builder, restored.helper, restored.hook])
      expect(descriptor.url).toMatch(/^http:\/\/127\.0\.0\.1:47999\//)
    // The workspace files point at the current install again; other MCP servers are kept.
    const mcp = JSON.parse(await readFile(join(generated, '.kiro/settings/mcp.json'), 'utf8'))
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['other', 'vibe-helper'])
    next.manager.close()

    await rm(generated, { recursive: true, force: true })
    const third = startCore('http://127.0.0.1:48001')
    expect(await third.manager.restore()).toEqual([])
    expect(third.handlers.size).toBe(0)
    await expect(lstat(generated)).rejects.toThrow()
  })
})
