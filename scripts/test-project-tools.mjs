import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { link, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { writeToolchainFixture } from './project-toolchain-fixture.mjs'

const api = createRequire(import.meta.url)(resolve('dist/portable-core-win32-x64/bin/runtime.cjs'))
const resources = await api.loadCoreResources(
  await realpath(resolve('dist/portable-core-win32-x64')),
)
const root = await api.privateDirectory(await mkdtemp(join(tmpdir(), 'vibe-w4-tools-')))
const report = { target: 'win32-x64', provenance: 'SYNTHETIC_FIXTURE', cases: [], failures: [] }
await writeFile(resolve('dist/project-tools-location.json'), JSON.stringify({ root }))
const run = promisify(execFile)
const pnpm = process.argv[2]
if (!pnpm) throw new Error('EXISTING_PNPM_ENTRY_REQUIRED')
try {
  for (const mode of ['EXISTING', 'ABSENT']) {
    const tools = await api.ownedPrivateDirectory(join(root, `${mode} 도구`))
    const workspace = await api.ownedPrivateDirectory(join(root, `${mode} 생성 앱`))
    const tc = await api.selectProjectToolchain({
      resources,
      privateRoot: tools,
      nodeExecutables: mode === 'EXISTING' ? [process.execPath] : [],
      pnpmExecutables: mode === 'EXISTING' ? [pnpm] : [],
    })
    assert.equal(tc.node.source, mode === 'EXISTING' ? 'EXISTING_NODE' : 'MANAGED_NODE')
    assert.equal(tc.pnpm.source, mode === 'EXISTING' ? 'EXISTING_PNPM' : 'MANAGED_PNPM')
    await writeToolchainFixture(workspace)
    await api.prepareProjectTools(workspace, tc, resources)
    const initial = await api.verifyProjectTools(workspace, resources)
    const cell = {
      mode,
      node: tc.node.nodeVersion,
      nodeSource: tc.node.source,
      pnpm: tc.pnpm.version,
      pnpmSource: tc.pnpm.source,
      commands: [],
      http: false,
    }
    report.cases.push(cell)
    for (const command of [
      'pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile',
      'pnpm install --frozen-lockfile',
      'pnpm run build',
      'pnpm test',
      'pnpm run smoke',
    ]) {
      // Same PowerShell invocation as the pinned Kiro DefaultTerminal, empty developer PATH.
      const result = await run(
        join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        ['-NoProfile', '-Command', api.PROJECT_TOOL_COMMAND + command],
        {
          cwd: workspace,
          env: {
            SystemRoot: process.env.SystemRoot,
            COMSPEC: join(process.env.SystemRoot, 'System32/cmd.exe'),
            PATHEXT: '.COM;.EXE;.BAT;.CMD',
            PATH: join(process.env.SystemRoot, 'System32'),
            TEMP: tmpdir(),
            TMP: tmpdir(),
            VIBE_CORE_TOKEN: 'synthetic-must-not-leak',
            ELECTRON_RUN_AS_NODE: '1',
          },
          windowsHide: true,
          timeout: 180000,
          maxBuffer: 32768,
        },
      )
      if (command.endsWith('smoke')) assert.ok(result.stdout.includes('W4_HTTP_SMOKE_PASS'))
      cell.commands.push({ command, exitCode: 0 })
    }
    const supervisor = await api.ResultRuntimeSupervisor.create(root, {
      projectToolchain: async () => (await api.verifyProjectTools(workspace, resources)).toolchain,
    })
    try {
      const descriptor = {
        schemaVersion: 1,
        correlationId: 'corr_11111111-1111-4111-8111-111111111111',
        projectId: 'project_11111111-1111-4111-8111-111111111111',
        status: 'READY',
        workspacePath: workspace.slice(root.length + 1),
      }
      const launched = await supervisor.launch(descriptor)
      assert.equal(launched.status, 'RUNNING')
      const body = await fetch(launched.url).then((response) => response.json())
      assert.equal(body.node, tc.node.nodeVersion)
      assert.equal(body.electron, null)
      assert.equal(body.secretLeaked, false)
      assert.equal(await realpath(body.selectedNode), tc.node.executable)
      cell.http = true
      assert.equal((await supervisor.launch(descriptor)).reused, true)
    } finally {
      await supervisor.close()
    }
    const launcher = join(workspace, '.kiro/vibe-tools.cmd')
    const text = await readFile(launcher, 'utf8')
    await writeFile(launcher, text + 'echo unsafe\r\n')
    await assert.rejects(api.verifyProjectTools(workspace, resources), /PROJECT_LAUNCHER_CHANGED/)
    await writeFile(launcher, text)
    await link(initial.descriptorFile, join(root, `${mode}-descriptor-alias`))
    await assert.rejects(api.verifyProjectTools(workspace, resources), /PORTABLE_FILE_UNSAFE/)
    cell.tamperDenied = true
  }
  const failureRoot = await api.ownedPrivateDirectory(join(root, '실패 검증'))
  await assert.rejects(
    api.acquireProjectPnpm(failureRoot, { offline: true }),
    /PNPM_OFFLINE_UNAVAILABLE/,
  )
  await assert.rejects(
    api.acquireProjectPnpm(failureRoot, { download: async () => new Response('bad') }),
    /PNPM_DOWNLOAD_HASH_MISMATCH/,
  )
  await assert.rejects(
    api.acquireProjectPnpm(failureRoot, {
      download: async () => {
        throw new Error('offline')
      },
    }),
    /PNPM_DOWNLOAD_UNAVAILABLE/,
  )
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(api.acquireProjectPnpm(failureRoot, { signal: controller.signal }))
  report.failures = [
    'offline',
    'hash mismatch',
    'network unavailable',
    'cancel before acquisition',
    'launcher mutation',
    'descriptor hardlink',
  ]
  report.status = 'PASS'
} catch (error) {
  report.status = 'FAIL'
  report.errorCode = /^[A-Z_]{1,100}$/.test(error.message)
    ? error.message
    : 'PROJECT_TOOLS_CHECK_FAILED'
  // Synthetic output stays in ignored dist; never include environment or connection data.
  await writeFile(
    resolve('dist/project-tools-error.txt'),
    String(error.stack) + '\n' + String(error.stdout ?? '') + '\n' + String(error.stderr ?? ''),
  )
  process.exitCode = 1
} finally {
  await writeFile(resolve('dist/project-tools-receipt.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
}
