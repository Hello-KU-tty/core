// Recover observations after a synthetic driver's read failure. Never start/replay an Agent run.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

async function main() {
  if (process.argv[2] !== '--kiro-child') {
    const kiro = process.argv[2]
    assert.ok(kiro && process.platform === 'win32')
    const child = spawn(kiro, [import.meta.filename, '--kiro-child'], {
      env: {
        SystemRoot: process.env.SystemRoot,
        PATH: join(process.env.SystemRoot, 'System32'),
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PATHEXT: '.COM;.EXE;.BAT;.CMD',
        ELECTRON_RUN_AS_NODE: '1',
      },
      windowsHide: true,
      stdio: 'inherit',
    })
    process.exitCode = await new Promise((done, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => done(code ?? 1))
    })
  } else {
    assert.ok(process.versions.electron, 'KIRO_CHILD_RUNTIME_REQUIRED')
    const location = JSON.parse(await readFile('dist/managed-host-location.json', 'utf8'))
    const root = await realpath(location.root)
    assert.equal(dirname(root), await realpath(tmpdir()))
    assert.match(basename(root), /^vibe-w3-host-[A-Za-z0-9]+$/)
    assert.equal(dirname(location.receiptFile), root)
    const prior = JSON.parse(await readFile(location.receiptFile, 'utf8'))
    const config = JSON.parse(await readFile(join(root, 'driver/config.json'), 'utf8'))
    assert.equal(config.withoutProjectTools, true)
    assert.equal(config.report, location.receiptFile)
    assert.equal(prior.errorCode, 'CORE_CONNECTION_UNAVAILABLE')
    assert.match(prior.builder.runId, /^run_[0-9a-f-]{36}$/)
    const extensions = join(root, 'extensions')
    const names = (await readdir(extensions)).filter((name) =>
      /^vibe-helper\.vibe-helper-portable-core-0\.3\.0(?:-win32-x64)?$/.test(name),
    )
    assert.equal(names.length, 1)
    const resourceRoot = await realpath(join(extensions, names[0], 'portable'))
    const require = createRequire(import.meta.url)
    const runtime = require(join(resourceRoot, 'bin/runtime.cjs'))
    const resources = await runtime.loadCoreResources(resourceRoot)
    assert.equal(await runtime.isPrivateDirectory(root), true)
    const sdk = require(join(resourceRoot, 'bin/client.cjs'))
    const client = await sdk.connectLocalCore(config.connectionFile)
    assert.equal((await client.health()).backendInstanceId, prior.lifecycle.backendInstanceId)
    const run = await client.getRun(prior.builder.runId)
    assert.equal(run.projectId, config.builderTask.projectId)
    assert.equal(run.status, 'SUCCEEDED')
    const expected = [
      'pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile',
      'pnpm install --frozen-lockfile',
      'pnpm run build',
      'pnpm test',
      'pnpm run smoke',
    ]
    const commands = new Map()
    let httpSmoke = false
    await client.watchRun(
      run.id,
      (event) => {
        const update = event.update
        if (event.kind !== 'TOOL' || update?.toolName !== 'shell') return
        const command = update.command?.replace(/^\.\\\.kiro\\vibe-tools\.cmd /, '')
        if (expected.includes(command) && update.shellExitCode === 0)
          commands.set(command, { command, exitCode: 0 })
        if (command === 'pnpm run smoke' && String(update.output).includes('W4_HTTP_SMOKE_PASS'))
          httpSmoke = true
      },
      { signal: AbortSignal.timeout(15000) },
    )
    assert.equal(commands.size, expected.length)
    assert.equal(httpSmoke, true)
    const workspace = await realpath(
      join(dirname(config.connectionFile), 'workspaces/projects', run.projectId),
    )
    const { toolchain } = await runtime.verifyProjectTools(workspace, resources)
    assert.equal(toolchain.node.source, 'MANAGED_NODE')
    assert.equal(toolchain.pnpm.source, 'MANAGED_PNPM')
    const supervisor = await runtime.ResultRuntimeSupervisor.create(dirname(workspace), {
      projectToolchain: async () => toolchain,
    })
    try {
      const result = await supervisor.launch({
        schemaVersion: 1,
        correlationId: `corr_${randomUUID()}`,
        projectId: run.projectId,
        workspacePath: basename(workspace),
        status: 'READY',
      })
      assert.equal(result.status, 'RUNNING')
      const body = await fetch(result.url).then((response) => response.json())
      assert.equal(await realpath(body.selectedNode), toolchain.node.executable)
      assert.equal(body.electron, null)
      const report = {
        status: 'PASS',
        nativeRequests: prior.nativeRequests,
        builderRun: { status: run.status, outcome: run.outcome, errorCode: run.errorCode },
        nativeShell: [...commands.values()],
        nativeHttpSmokeObserved: true,
        projectTools: {
          node: toolchain.node.nodeVersion,
          nodeSource: toolchain.node.source,
          pnpm: toolchain.pnpm.version,
          pnpmSource: toolchain.pnpm.source,
        },
        resultHttpViaPackagedSupervisor: true,
        resultSupervisorHost: 'KIRO_CHILD',
        originalDriverError: prior.errorCode,
        observationRecovery: 'READ_ONLY_SAME_RUN',
        coreInstanceUnchanged: true,
        replayedAgentRequests: 0,
      }
      await writeFile(
        resolve('dist/w4-native-absent-receipt.json'),
        JSON.stringify(report, null, 2),
      )
      console.log(JSON.stringify(report))
    } finally {
      await supervisor.close()
    }
  }
}
await main().catch((error) => {
  const code = error.code ?? error.message
  process.stderr.write(
    `${/^[A-Z][A-Z_]{1,90}$/.test(code) ? code : 'PROJECT_OBSERVATION_FAILED'}\n`,
  )
  process.exitCode = 1
})
