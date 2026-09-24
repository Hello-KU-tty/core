import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreResources } from '../src/portable-core.js'
import {
  prepareProjectTools,
  verifyProjectTools,
  type ProjectToolchain,
} from '../src/project-toolchain.js'

// ACL behavior has separate real-Windows integration tests. These tests exercise
// the real file pair and rename/recovery logic without launching PowerShell.
vi.mock('../src/private-directory.js', () => ({
  isPrivateDirectory: async () => true,
  privateDirectory: async (path: string) => {
    await mkdir(path)
    return path
  },
}))
let root: string, workspace: string, tools: ProjectToolchain
const resources = (version: string) =>
  ({
    root: join(root, 'extensions', 'vibe-helper.vibe-helper-portable-core-' + version, 'portable'),
  }) as CoreResources
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-tool-upgrade-')))
  workspace = join(root, 'generated project')
  await mkdir(workspace)
  await mkdir(join(root, 'private-tools'))
  tools = {
    schemaVersion: 1,
    privateRoot: join(root, 'private-tools'),
    node: {
      schemaVersion: 1,
      source: 'MANAGED_NODE',
      executable: join(root, 'node.exe'),
      args: [],
      env: {},
      nodeVersion: '24.19.0',
      platform: 'win32',
      arch: 'x64',
      napi: 10,
    },
    pnpm: {
      source: 'MANAGED_PNPM',
      executable: join(root, 'pnpm.mjs'),
      kind: 'JS',
      version: '11.12.0',
    },
  }
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('Core-owned project launcher installation upgrade', () => {
  it('updates only package paths while preserving generated source and tools', async () => {
    await writeFile(join(workspace, 'user.ts'), 'user-owned source')
    await prepareProjectTools(workspace, tools, resources('0.3.2'))
    await prepareProjectTools(workspace, tools, resources('0.3.4'))
    const verified = await verifyProjectTools(workspace, resources('0.3.4'))
    expect(verified.toolchain).toEqual(tools)
    expect(await readFile(join(workspace, 'user.ts'), 'utf8')).toBe('user-owned source')
    await expect(verifyProjectTools(workspace, resources('0.3.2'))).rejects.toThrow(
      'PROJECT_DESCRIPTOR_INVALID',
    )
  })

  it('recovers a launcher-first interruption and serializes duplicate preparations', async () => {
    await prepareProjectTools(workspace, tools, resources('0.3.2'))
    const file = join(workspace, '.kiro/vibe-tools.cmd')
    const oldLauncher = await readFile(file, 'utf8')
    await writeFile(file, oldLauncher.replace(resources('0.3.2').root, resources('0.3.4').root))
    await expect(verifyProjectTools(workspace, resources('0.3.4'))).rejects.toThrow(
      'PROJECT_DESCRIPTOR_INVALID',
    )
    await Promise.all([
      prepareProjectTools(workspace, tools, resources('0.3.4')),
      prepareProjectTools(workspace, tools, resources('0.3.4')),
    ])
    expect((await verifyProjectTools(workspace, resources('0.3.4'))).toolchain).toEqual(tools)
  })

  it('refuses an edited launcher without overwriting it', async () => {
    await prepareProjectTools(workspace, tools, resources('0.3.2'))
    const file = join(workspace, '.kiro/vibe-tools.cmd')
    const original = await readFile(file, 'utf8')
    await writeFile(file, original + 'unexpected command')
    await expect(prepareProjectTools(workspace, tools, resources('0.3.4'))).rejects.toThrow(
      'PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED',
    )
    expect(await readFile(file, 'utf8')).toBe(original + 'unexpected command')
  })

  it('refuses a changed Node/pnpm choice and added descriptor fields', async () => {
    await prepareProjectTools(workspace, tools, resources('0.3.2'))
    await expect(
      prepareProjectTools(
        workspace,
        { ...tools, node: { ...tools.node, executable: join(root, 'different-node.exe') } },
        resources('0.3.4'),
      ),
    ).rejects.toThrow('PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED')
    const { descriptorFile } = await verifyProjectTools(workspace, resources('0.3.2'))
    const descriptor = JSON.parse(await readFile(descriptorFile, 'utf8'))
    await writeFile(descriptorFile, JSON.stringify({ ...descriptor, unexpected: true }))
    await expect(prepareProjectTools(workspace, tools, resources('0.3.4'))).rejects.toThrow(
      'PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED',
    )
  })

  it('refuses downgrade, another publisher or another installation directory', async () => {
    await prepareProjectTools(workspace, tools, resources('0.3.2'))
    for (const candidate of [
      resources('0.3.1'),
      { root: resources('0.3.4').root.replace('vibe-helper.vibe-helper-', 'other.product-') },
      { root: resources('0.3.4').root.replace('extensions', 'other-extensions') },
    ]) {
      await expect(
        prepareProjectTools(workspace, tools, candidate as CoreResources),
      ).rejects.toThrow('PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED')
    }
    await verifyProjectTools(workspace, resources('0.3.2'))
  })

  it('recovers initial descriptor creation only when the launcher is absent', async () => {
    await prepareProjectTools(workspace, tools, resources('0.3.2'))
    await rm(join(workspace, '.kiro/vibe-tools.cmd'))
    await prepareProjectTools(workspace, tools, resources('0.3.2'))
    await verifyProjectTools(workspace, resources('0.3.2'))
  })
})
