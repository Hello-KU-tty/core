// Build the real frontend source with the attested Mac source host, only into
// an ignored, isolated development directory. No product manifest is changed.
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { build } from 'esbuild'
import environment from '../examples/program-macos-dev/isolated-environment.cjs'

if (
  process.platform !== 'darwin' ||
  process.arch !== 'arm64' ||
  process.versions.node.split('.')[0] !== '24'
)
  throw new Error('MAC_DEVELOPMENT_TOOLCHAIN_REQUIRED')
const program = await realpath(resolve(process.argv[2] ?? ''))
const product = JSON.parse(await readFile(join(program, 'package.json'), 'utf8'))
if (product.name !== 'builder-helper-agent-panel') throw new Error('PROGRAM_CHECKOUT_REQUIRED')
const parent = resolve('.data/frontend-macos')
await mkdir(parent, { recursive: true, mode: 0o700 })
const stage = process.argv[3]
  ? await realpath(resolve(process.argv[3]))
  : await mkdtemp(join(parent, 'program-'))
let previous
if (process.argv[3]) {
  previous = JSON.parse(await readFile(join(stage, 'development-receipt.json'), 'utf8'))
  if (
    dirname(stage) !== (await realpath(parent)) ||
    !/^program-[a-zA-Z0-9]+$/.test(basename(stage)) ||
    previous.mode !== 'MAC_DEVELOPMENT_ONLY' ||
    previous.programSource !== program ||
    previous.stage !== stage
  )
    throw new Error('DEVELOPMENT_STAGE_REUSE_DENIED')
}
const extension = join(stage, 'extension')
const selectedCoreRoot = process.argv[4] ?? previous?.coreRoot ?? join(stage, 'core')
const isolated = selectedCoreRoot !== join(stage, 'core')
const coreRoot = isolated ? await environment.isolatedCoreRoot(selectedCoreRoot) : selectedCoreRoot
await mkdir(extension, { recursive: true, mode: 0o700 })
if ((await realpath(extension)) !== extension)
  throw new Error('DEVELOPMENT_EXTENSION_SYMLINK_DENIED')
const config = {
  connectionFile: join(coreRoot, 'connection.json'),
  ...(isolated ? { isolatedCoreRoot: coreRoot } : {}),
  budgetFile: join(stage, 'credit-observation.json'),
  admissionsFile: join(stage, 'model-admissions.jsonl'),
}
await writeFile(join(extension, 'dev-config.json'), JSON.stringify(config, null, 2), {
  mode: 0o600,
})
await writeFile(
  join(extension, 'package.json'),
  JSON.stringify(
    {
      ...product,
      name: 'program-macos-development',
      displayName: 'Vibe Helper Program (Mac verification only)',
      main: './dist/extension.cjs',
      engines: { vscode: '^1.109.0' },
    },
    null,
    2,
  ),
)
await cp(join(program, 'media'), join(extension, 'media'), { recursive: true })
await cp(resolve('examples/kiro-panel/runtime'), join(extension, 'runtime'), { recursive: true })
await build({
  entryPoints: ['examples/program-macos-dev/extension.cjs'],
  outfile: join(extension, 'dist/extension.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  alias: {
    '@vibe-helper/program-panel': join(program, 'src/agent-panel-view-provider.ts'),
    '@vibe-helper/frontend-client/node': resolve('packages/frontend-client/dist/node.js'),
    '@vibe-helper/frontend-client': resolve('packages/frontend-client/dist/index.js'),
    '@vibe-helper/application/redaction': resolve('packages/application/dist/redaction.js'),
    '@vibe-helper/kiro-adapter/builder-tool-guard': resolve(
      'packages/kiro-adapter/dist/builder-tool-guard.js',
    ),
  },
})
await build({
  entryPoints: [join(program, 'src/webview/main.ts')],
  outfile: join(extension, 'dist/webview/main.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
})
await writeFile(
  join(stage, 'development-receipt.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      mode: 'MAC_DEVELOPMENT_ONLY',
      programSource: program,
      stage,
      extension,
      coreRoot,
      modelCallsDuringBuild: 0,
      windowsPackageChanged: false,
      windowsCompatibilityClaimed: false,
    },
    null,
    2,
  ),
  { mode: 0o600 },
)
console.log(JSON.stringify({ status: 'BUILT_MODEL_0', stage, extension, coreRoot }))
