import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreResources } from '../src/portable-core.js'
import {
  type ProjectToolchain,
  preparePnpmShim,
  prepareProjectTools,
  selectProjectToolchain,
  verifyProjectTools,
} from '../src/project-toolchain.js'

// Real child processes and file pairs; packaged checks cover SQLite and Windows ACLs.
vi.mock('../src/private-directory.js', () => ({
  isPrivateDirectory: async () => true,
  privateDirectory: async (path: string) => {
    await mkdir(path)
    return path
  },
}))

let root: string, workspace: string, privateRoot: string, pnpm: string, resources: CoreResources
const probeText = (napi = 10) =>
  `console.log(JSON.stringify({node:process.versions.node,platform:'win32',arch:'x64',napi:${napi},sqlite:'ok',api:true,electron:null}))`

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vibe-reuse-')))
  workspace = join(root, '한글 project')
  privateRoot = join(root, 'private tools')
  const resourceRoot = join(
    root,
    'extensions/vibe-helper.builder-helper-agent-panel-0.0.16/portable',
  )
  await mkdir(resourceRoot, { recursive: true })
  await mkdir(workspace)
  resources = { root: resourceRoot, probe: join(resourceRoot, 'probe.cjs') } as CoreResources
  await writeFile(resources.probe, probeText())
  pnpm = join(root, 'pnpm.cjs')
  await writeFile(pnpm, "console.log('11.13.1')")
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

async function firstSelection(): Promise<ProjectToolchain> {
  const tools = await selectProjectToolchain({
    resources,
    privateRoot,
    nodeExecutables: [process.execPath],
    pnpmExecutables: [pnpm],
    offline: true,
  })
  await prepareProjectTools(workspace, tools, resources)
  return tools
}

describe.skipIf(process.platform !== 'win32')(
  'recorded project tools across launch environments',
  () => {
    it('keeps the recorded tools after restart with no developer PATH', async () => {
      const original = await firstSelection()
      vi.stubEnv('PATH', join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'))
      const restarted = await selectProjectToolchain({ resources, privateRoot, offline: true })
      expect(restarted).toEqual(original)
      await prepareProjectTools(workspace, restarted, resources)
      expect((await verifyProjectTools(workspace, resources)).toolchain).toEqual(original)
    })

    it('does not replace recorded tools with different available candidates or mutate the workspace', async () => {
      const original = await firstSelection()
      await writeFile(join(workspace, 'user.ts'), 'user source')
      const descriptor = await verifyProjectTools(workspace, resources)
      const before = await readFile(descriptor.descriptorFile, 'utf8')
      const next = await selectProjectToolchain({
        resources,
        privateRoot,
        nodeExecutables: [join(root, 'different-node.exe')],
        pnpmExecutables: [join(root, 'different-pnpm.cmd')],
        offline: true,
      })
      expect(next).toEqual(original)
      expect(await readFile(descriptor.descriptorFile, 'utf8')).toBe(before)
      expect(await readFile(join(workspace, 'user.ts'), 'utf8')).toBe('user source')
    })

    it('reuses the same Node/pnpm across a product upgrade, a new project, and another restart', async () => {
      const original = await firstSelection()
      const upgraded = {
        ...resources,
        root: join(root, 'extensions/vibe-helper.builder-helper-agent-panel-0.0.17/portable'),
      }
      await mkdir(upgraded.root, { recursive: true })
      const next = await selectProjectToolchain({
        resources: upgraded,
        privateRoot,
        nodeExecutables: [],
        pnpmExecutables: [],
        offline: true,
      })
      expect(next).toEqual(original)
      await prepareProjectTools(workspace, next, upgraded)
      const second = join(root, 'second project')
      await mkdir(second)
      await prepareProjectTools(second, next, upgraded)
      expect((await verifyProjectTools(workspace, upgraded)).toolchain).toEqual(original)
      expect(
        await selectProjectToolchain({ resources: upgraded, privateRoot, offline: true }),
      ).toEqual(original)
    })

    it.each(['launcher', 'shim', 'descriptor', 'downgrade'] as const)(
      'rejects %s changes before selecting a replacement',
      async (kind) => {
        await firstSelection()
        if (kind === 'launcher') await writeFile(join(workspace, '.kiro/vibe-tools.cmd'), 'edited')
        if (kind === 'shim') await writeFile(join(privateRoot, 'bin/pnpm.cmd'), 'edited')
        if (kind === 'descriptor') {
          const { descriptorFile } = await verifyProjectTools(workspace, resources)
          const data = JSON.parse(await readFile(descriptorFile, 'utf8'))
          data.toolchain.privateRoot = root
          await writeFile(descriptorFile, JSON.stringify(data))
        }
        const selectedResources =
          kind === 'downgrade'
            ? { ...resources, root: resources.root.replace('0.0.16', '0.0.15') }
            : resources
        await expect(
          selectProjectToolchain({ resources: selectedResources, privateRoot, offline: true }),
        ).rejects.toThrow('PROJECT_RECORDED_TOOLCHAIN_INVALID')
      },
    )

    it('reports an unavailable recorded Node without falling back to the working Node on PATH', async () => {
      const available = await selectProjectToolchain({
        resources,
        privateRoot,
        nodeExecutables: [process.execPath],
        pnpmExecutables: [pnpm],
        offline: true,
      })
      // Synthetic previously selected executable that has since disappeared.
      const old = {
        ...available,
        node: { ...available.node, executable: join(root, 'removed-node.exe') },
      }
      await rm(join(privateRoot, 'bin/pnpm.cmd'))
      await preparePnpmShim(old, resources)
      await prepareProjectTools(workspace, old, resources)
      await expect(
        selectProjectToolchain({
          resources,
          privateRoot,
          nodeExecutables: [process.execPath],
          offline: true,
        }),
      ).rejects.toThrow('PROJECT_RECORDED_NODE_UNAVAILABLE')
    })

    it('reprobes the recorded Node and refuses changed runtime metadata', async () => {
      await firstSelection()
      await writeFile(resources.probe, probeText(11))
      await expect(
        selectProjectToolchain({ resources, privateRoot, offline: true }),
      ).rejects.toThrow('PROJECT_RECORDED_NODE_UNAVAILABLE')
    })

    it.each(['missing', 'wrong-version'] as const)(
      'reports %s recorded pnpm without replacement',
      async (kind) => {
        await firstSelection()
        if (kind === 'missing') await rm(pnpm)
        else await writeFile(pnpm, "console.log('11.19.0')")
        await expect(
          selectProjectToolchain({ resources, privateRoot, offline: true }),
        ).rejects.toThrow('PROJECT_RECORDED_PNPM_UNAVAILABLE')
      },
    )
  },
)
