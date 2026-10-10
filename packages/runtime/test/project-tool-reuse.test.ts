import { execFile } from 'node:child_process'
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type CoreResources, sha256 } from '../src/portable-core.js'
import {
  type ProjectToolchain,
  preparePnpmShim,
  prepareProjectTools,
  projectEnvironment,
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
  `console.log(JSON.stringify({node:process.versions.node,platform:process.platform,arch:process.arch,napi:${napi},sqlite:'ok',api:true,electron:null}))`
const shimName = process.platform === 'darwin' ? 'bin/pnpm' : 'bin/pnpm.cmd'

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
  resources = {
    root: resourceRoot,
    probe: join(resourceRoot, 'probe.cjs'),
    manifest: { target: `${process.platform}-${process.arch}` },
  } as CoreResources
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

describe.skipIf(
  process.platform !== 'win32' && !(process.platform === 'darwin' && process.arch === 'arm64'),
)('recorded project tools across launch environments', () => {
  it('creates the home folders projectEnvironment points to', async () => {
    const env = projectEnvironment(await firstSelection(), {})
    for (const name of ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA'] as const)
      expect((await lstat(env[name] ?? '')).isDirectory()).toBe(true)
  })

  it.skipIf(process.platform !== 'win32')(
    'Windows PowerShell in a Project terminal keeps its cache out of the Project folder',
    async () => {
      const env = projectEnvironment(await firstSelection(), process.env)
      const powershell = join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      )
      const { stdout } = await promisify(execFile)(
        powershell,
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "[Environment]::GetFolderPath('LocalApplicationData'); Get-Command vibe-missing-command -ErrorAction SilentlyContinue; exit 0",
        ],
        { cwd: workspace, env, windowsHide: true, timeout: 60_000 },
      )
      expect(stdout.trim().toLowerCase()).toBe((env.LOCALAPPDATA ?? '').toLowerCase())
      expect((await readdir(workspace)).filter((name) => name === 'Microsoft')).toEqual([])
    },
    90_000,
  )

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

  it('reuses exact tool records when the only workspace is moved, without recreating it', async () => {
    const original = await firstSelection()
    const moved = workspace + '-moved'
    await rename(workspace, moved)
    expect(await selectProjectToolchain({ resources, privateRoot, offline: true })).toEqual(
      original,
    )
    const next = join(root, 'new project')
    await mkdir(next)
    await prepareProjectTools(next, original, resources)
    expect((await verifyProjectTools(next, resources)).toolchain).toEqual(original)
    await expect(realpath(workspace)).rejects.toMatchObject({ code: 'ENOENT' })
    await rename(moved, workspace)
    expect((await verifyProjectTools(workspace, resources)).toolchain).toEqual(original)
  })

  it.each(['shim', 'descriptor', 'symlink', 'ancestor-symlink'] as const)(
    'does not use an absent workspace to bypass %s validation',
    async (kind) => {
      const original = await firstSelection()
      const { descriptorFile } = await verifyProjectTools(workspace, resources)
      await rename(workspace, workspace + '-moved')
      if (kind === 'shim') await writeFile(join(privateRoot, shimName), 'edited')
      if (kind === 'descriptor') {
        const data = JSON.parse(await readFile(descriptorFile, 'utf8'))
        data.toolchain.node.executable = join(root, 'injected-node')
        await writeFile(descriptorFile, JSON.stringify(data))
      }
      if (kind === 'symlink') await symlink(workspace + '-moved', workspace, 'dir')
      if (kind === 'ancestor-symlink') {
        const parent = join(root, 'linked-parent')
        await symlink(workspace + '-moved', parent, 'dir')
        const absent = join(parent, 'absent')
        const data = {
          schemaVersion: 1,
          workspace: absent,
          toolchain: original,
          resourceRoot: resources.root,
        }
        await rename(descriptorFile, descriptorFile + '.preserved')
        await writeFile(
          join(privateRoot, 'projects', sha256(Buffer.from(absent)) + '.json'),
          JSON.stringify(data),
        )
      }
      await expect(
        selectProjectToolchain({ resources, privateRoot, offline: true }),
      ).rejects.toThrow('PROJECT_RECORDED_TOOLCHAIN_INVALID')
    },
  )

  it
    .skipIf(process.platform !== 'darwin')
    .each(['removed-install', 'shim-interruption', 'launcher-interruption', 'moved-project'])(
    'migrates only product-bundled Mac Node into persistent cache: %s',
    async (scenario) => {
      await mkdir(join(resources.root, 'bin'))
      await mkdir(join(resources.root, 'licenses'))
      // Homebrew Node is dynamically linked relative to its install directory;
      // packaged tests separately use the real self-contained distribution.
      await writeFile(
        join(resources.root, 'bin/node'),
        `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`,
        { mode: 0o700 },
      )
      await writeFile(join(resources.root, 'licenses/node-LICENSE'), 'synthetic license')
      const files: Record<string, { sha256: string; bytes: number }> = {}
      for (const file of ['bin/node', 'licenses/node-LICENSE']) {
        const bytes = await readFile(join(resources.root, file))
        files[file] = { sha256: sha256(bytes), bytes: bytes.length }
      }
      resources = { ...resources, manifest: { ...resources.manifest, files } }
      const old = await selectProjectToolchain({
        resources,
        privateRoot,
        nodeExecutables: [join(resources.root, 'bin/node')],
        pnpmExecutables: [pnpm],
      })
      await prepareProjectTools(workspace, old, resources)
      await writeFile(join(workspace, 'user.ts'), 'unchanged source')
      const oldDescriptor = await verifyProjectTools(workspace, resources)
      const oldText = await readFile(oldDescriptor.descriptorFile, 'utf8')
      const newRoot = resources.root.replace('0.0.16', '0.0.17')
      const upgraded = { ...resources, root: newRoot, probe: join(newRoot, 'probe.cjs') }
      await mkdir(join(newRoot, 'bin'), { recursive: true })
      await mkdir(join(newRoot, 'licenses'))
      await copyFile(join(resources.root, 'bin/node'), join(newRoot, 'bin/node'))
      await writeFile(join(newRoot, 'licenses/node-LICENSE'), 'synthetic license')
      await writeFile(upgraded.probe, probeText())
      await rename(resources.root, resources.root + '-preserved')
      if (scenario === 'moved-project') await rename(workspace, workspace + '-moved')
      const next = await selectProjectToolchain({
        resources: upgraded,
        privateRoot,
        nodeExecutables: [],
        pnpmExecutables: [],
        offline: true,
      })
      expect(next.node.source).toBe('MANAGED_NODE')
      expect(next.node.executable).toContain(join(privateRoot, 'node-cache'))
      expect(next.pnpm).toEqual(old.pnpm)
      // The shared shim is already new, while every project record is still old.
      expect(
        await selectProjectToolchain({ resources: upgraded, privateRoot, offline: true }),
      ).toEqual(next)
      if (scenario === 'moved-project') await rename(workspace + '-moved', workspace)
      await prepareProjectTools(workspace, next, upgraded)
      if (scenario === 'launcher-interruption') {
        await writeFile(oldDescriptor.descriptorFile, oldText)
        expect(
          await selectProjectToolchain({ resources: upgraded, privateRoot, offline: true }),
        ).toEqual(next)
        await prepareProjectTools(workspace, next, upgraded)
      }
      const second = join(root, 'second new project')
      await mkdir(second)
      await prepareProjectTools(second, next, upgraded)
      expect((await verifyProjectTools(workspace, upgraded)).toolchain).toEqual(next)
      expect(
        await selectProjectToolchain({ resources: upgraded, privateRoot, offline: true }),
      ).toEqual(next)
      expect(await readFile(join(workspace, 'user.ts'), 'utf8')).toBe('unchanged source')
    },
  )

  it.each(['launcher', 'shim', 'descriptor', 'downgrade'] as const)(
    'rejects %s changes before selecting a replacement',
    async (kind) => {
      await firstSelection()
      if (kind === 'launcher') await writeFile(join(workspace, '.kiro/vibe-tools.cmd'), 'edited')
      if (kind === 'shim') await writeFile(join(privateRoot, shimName), 'edited')
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
    await rm(join(privateRoot, shimName))
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
    await expect(selectProjectToolchain({ resources, privateRoot, offline: true })).rejects.toThrow(
      'PROJECT_RECORDED_NODE_UNAVAILABLE',
    )
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
})
