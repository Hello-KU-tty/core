// Host-owned entry point reached by the generated workspace's protected launcher.
import { spawn } from 'node:child_process'
import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import {
  loadCoreResources,
  plainFile,
  pnpmInvocation,
  projectCommandArgs,
  projectEnvironment,
  verifyProjectTools,
} from '../packages/runtime/dist/index.js'

async function checkInstallPolicy(workspace) {
  const exists = async (name) =>
    Boolean(
      await lstat(join(workspace, name)).catch((error) => {
        if (error.code === 'ENOENT') return null
        throw error
      }),
    )
  for (const file of ['.npmrc', '.pnpmfile.cjs', '.pnpmfile.mjs'])
    if (await exists(file)) throw new Error('PROJECT_PACKAGE_CONFIG_DENIED')
  const pkg = JSON.parse((await plainFile(join(workspace, 'package.json'), 262144)).toString())
  if (
    pkg.pnpm ||
    pkg.devEngines ||
    pkg.workspaces ||
    (pkg.packageManager && pkg.packageManager !== 'pnpm@11.12.0')
  )
    throw new Error('PROJECT_PACKAGE_CONFIG_DENIED')
  if (
    Object.keys(pkg.scripts ?? {}).some((name) =>
      ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish'].includes(name),
    )
  )
    throw new Error('PROJECT_INSTALL_SCRIPT_DENIED')
  const config = join(workspace, 'pnpm-workspace.yaml')
  if (await exists('pnpm-workspace.yaml')) {
    const text = (await plainFile(config, 8192)).toString()
    let section = ''
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue
      if (/^(packages|allowBuilds|onlyBuiltDependencies):\s*$/.test(line)) {
        section = line.split(':')[0]
        continue
      }
      const valid =
        section === 'packages'
          ? /^\s+-\s+['"]?\.['"]?\s*$/
          : section === 'allowBuilds'
            ? /^\s+(esbuild|better-sqlite3):\s+(true|false)\s*$/
            : section === 'onlyBuiltDependencies'
              ? /^\s+-\s+(esbuild|better-sqlite3)\s*$/
              : null
      if (!valid?.test(line)) throw new Error('PROJECT_INSTALL_ALLOWLIST_DENIED')
    }
  }
  if (await exists('pnpm-lock.yaml'))
    await plainFile(join(workspace, 'pnpm-lock.yaml'), 4 * 1024 * 1024)
}

try {
  const descriptorFile = process.argv[2]
  if (!descriptorFile) throw new Error('PROJECT_DESCRIPTOR_REQUIRED')
  const descriptor = JSON.parse((await plainFile(descriptorFile, 32768)).toString())
  const resources = await loadCoreResources(descriptor.resourceRoot)
  const workspace = await realpath(process.cwd())
  const verified = await verifyProjectTools(workspace, resources)
  if (
    verified.descriptorFile !== descriptorFile ||
    (await realpath(process.execPath)) !== verified.toolchain.node.executable ||
    process.versions.electron
  )
    throw new Error('PROJECT_RUNTIME_MISMATCH')
  const args = projectCommandArgs(process.argv.slice(3).join(' '))
  if (!args || JSON.stringify(args) !== JSON.stringify(process.argv.slice(3)))
    throw new Error('PROJECT_COMMAND_DENIED')
  await checkInstallPolicy(workspace)
  const tool = args.shift()
  const invocation =
    tool === 'pnpm'
      ? pnpmInvocation(verified.toolchain, args)
      : { executable: verified.toolchain.node.executable, args }
  const child = spawn(invocation.executable, invocation.args, {
    cwd: workspace,
    env: projectEnvironment(verified.toolchain),
    shell: false,
    windowsHide: true,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments ?? false,
    stdio: 'inherit',
  })
  process.exitCode = await new Promise((resolve) => {
    child.once('error', () => resolve(1))
    child.once('exit', (code) => resolve(code ?? 1))
  })
} catch (error) {
  const code =
    error instanceof Error && /^[A-Z][A-Z_]{1,90}$/.test(error.message)
      ? error.message
      : 'PROJECT_TOOL_FAILED'
  process.stderr.write(`${code}\n`)
  process.exitCode = 1
}
