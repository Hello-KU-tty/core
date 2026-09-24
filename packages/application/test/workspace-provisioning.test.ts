import { mkdir, mkdtemp, realpath } from 'node:fs/promises'
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
