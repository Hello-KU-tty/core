import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreResources } from '../src/portable-core.js'
import {
  type ProjectToolchain,
  prepareProjectTools,
  verifyProjectTools,
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
  workspace = join(root, '한글 generated project')
  await mkdir(workspace)
  await mkdir(join(root, '한글 private-tools'))
  tools = {
    schemaVersion: 1,
    privateRoot: join(root, '한글 private-tools'),
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
  it('migrates only the exact legacy launcher during a verified product upgrade', async () => {
    await prepareProjectTools(workspace, tools, resources('0.3.10'))
    const { descriptorFile } = await verifyProjectTools(workspace, resources('0.3.10'))
    const legacy = [
      '@echo off',
      'setlocal',
      'set "NODE_OPTIONS="',
      'set "NODE_PATH="',
      'set "NODE_REPL_EXTERNAL_MODULE="',
      'set "ELECTRON_RUN_AS_NODE="',
      'set "ELECTRON_EXTRA_LAUNCH_ARGS="',
      `"${tools.node.executable}" "${join(resources('0.3.10').root, 'bin/project-tools.mjs')}" "${descriptorFile}" %*`,
      'exit /b %errorlevel%',
      '',
    ].join('\r\n')
    const launcher = join(workspace, '.kiro/vibe-tools.cmd')
    await writeFile(launcher, legacy + 'echo altered\r\n')
    await expect(prepareProjectTools(workspace, tools, resources('0.3.11'))).rejects.toThrow(
      'PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED',
    )
    await writeFile(launcher, legacy)
    await expect(prepareProjectTools(workspace, tools, resources('0.3.10'))).rejects.toThrow(
      'PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED',
    )
    await prepareProjectTools(workspace, tools, resources('0.3.11'))
    expect((await verifyProjectTools(workspace, resources('0.3.11'))).toolchain).toEqual(tools)
  })

  it.skipIf(process.platform !== 'win32')(
    'executes Unicode paths from CP949 and restores codepage and failed exit status',
    async () => {
      tools = { ...tools, node: { ...tools.node, executable: await realpath(process.execPath) } }
      const installed = resources('0.3.11')
      await mkdir(join(installed.root, 'bin'), { recursive: true })
      await writeFile(
        join(installed.root, 'bin/project-tools.mjs'),
        "import {readFileSync} from 'node:fs'; JSON.parse(readFileSync(process.argv[2], 'utf8')); console.log('UNICODE_LAUNCHER_PASS'); process.exit(7)",
      )
      await prepareProjectTools(workspace, tools, installed)
      const harness = join(root, 'check.cmd')
      await writeFile(
        harness,
        [
          '@echo off',
          'chcp 949 >nul',
          'call "%VIBE_TEST_LAUNCHER%" pnpm run build',
          'set "VIBE_TEST_EXIT=%errorlevel%"',
          'chcp',
          'exit /b %VIBE_TEST_EXIT%',
          '',
        ].join('\r\n'),
      )
      const result = await promisify(execFile)(
        join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/cmd.exe'),
        ['/d', '/s', '/c', `""${harness}""`],
        {
          windowsHide: true,
          windowsVerbatimArguments: true,
          env: { ...process.env, VIBE_TEST_LAUNCHER: join(workspace, '.kiro/vibe-tools.cmd') },
          timeout: 10000,
          encoding: 'utf8',
        },
      ).then(
        (value) => ({ ...value, code: 0 }),
        (error) => ({ stdout: String(error.stdout), code: error.code }),
      )
      expect(result.code).toBe(7)
      expect(result.stdout).toContain('UNICODE_LAUNCHER_PASS')
      expect(result.stdout.trim()).toMatch(/949$/)
    },
  )

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
