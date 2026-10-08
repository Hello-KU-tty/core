import { mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { WorkspacePathPolicy } from '../src/security.js'

it('applies host permissions only to newly provisioned generated workspaces', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-workspace-acl-')))
  const prepared: string[] = []
  const policy = await WorkspacePathPolicy.create(root, {
    prepareNewWorkspace: async (path) => {
      prepared.push(path)
    },
  })
  const project = await policy.provisionProjectWorkspace('projects/project_new', 'corr_test')
  expect(prepared).toEqual([project])
  await policy.provisionProjectWorkspace('projects/project_new', 'corr_test')
  await mkdir(join(root, 'existing'))
  await policy.provisionProjectWorkspace('existing', 'corr_test')
  expect(prepared).toEqual([project])
  await expect(policy.provisionProjectWorkspace('../escape', 'corr_test')).rejects.toThrow()
  expect(prepared).toEqual([project])
})

it('resolves a registered Project folder only while it stays canonical and outside the root', async () => {
  const correlation = 'corr_00000000-0000-4000-8000-000000000001'
  const base = await realpath(await mkdtemp(join(tmpdir(), 'vibe-workspace-registered-')))
  const root = join(base, 'generated')
  const folder = join(base, 'memo app')
  await mkdir(join(root, 'projects', 'project_a'), { recursive: true })
  await mkdir(folder)
  const registered = new Map<string, string>([['project_registered', folder]])
  const policy = await WorkspacePathPolicy.create(root, {
    registeredWorkspace: (projectId) => registered.get(projectId),
  })
  const project = (id: string) =>
    ({ id, generatedWorkspacePath: 'projects/project_a' }) as Parameters<
      typeof policy.resolveProjectWorkspace
    >[0]
  expect(await policy.resolveProjectWorkspace(project('project_registered'), correlation)).toBe(
    folder,
  )
  expect(await policy.resolveProjectWorkspace(project('project_other'), correlation)).toBe(
    join(root, 'projects', 'project_a'),
  )
  expect(policy.isGeneratedWorkspace(join(root, 'projects', 'project_a'))).toBe(true)
  expect(policy.isGeneratedWorkspace(folder)).toBe(false)
  // Code references stay inside the registered folder.
  await expect(
    policy.validateReferences(
      project('project_registered'),
      { kind: 'CODE', path: '../generated/secret.ts' },
      correlation,
    ),
  ).rejects.toThrow()
  // A swapped symlink, a folder inside the generated root or a missing folder fails closed.
  const link = join(base, 'link')
  await symlink(folder, link)
  for (const path of [link, join(root, 'projects', 'project_a'), join(base, 'missing')]) {
    registered.set('project_registered', path)
    await expect(
      policy.resolveProjectWorkspace(project('project_registered'), correlation),
    ).rejects.toThrow('The registered Project folder is missing, moved or no longer canonical.')
  }
})
