import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { inventory } from '../examples/frontend-handoff/archive.mjs'
import { loadCoreResources } from '../packages/runtime/dist/portable-core.js'
import { archiveMacos } from './archive-macos.mjs'
import { sourceProvenance } from './source-provenance.mjs'

if (process.platform !== 'darwin' || process.arch !== 'arm64' || process.version !== 'v24.19.0')
  throw new Error('MAC_BUILD_TOOLCHAIN_REQUIRED')
if (!process.argv[2]) throw new Error('EXPLICIT_FRONTEND_CHECKOUT_REQUIRED')
const program = await realpath(resolve(process.argv[2]))
const sources = {
  backend: await sourceProvenance(resolve('.')),
  frontend: await sourceProvenance(program),
}
const product = JSON.parse(await readFile(join(program, 'package.json'), 'utf8'))
if (product.name !== 'builder-helper-agent-panel') throw new Error('PROGRAM_CHECKOUT_REQUIRED')
const portable = await loadCoreResources(resolve('dist/portable-core-darwin-arm64'))
if (portable.manifest.target !== 'darwin-arm64') throw new Error('MAC_PACKAGE_TARGET_INVALID')
await mkdir(resolve('dist'), { recursive: true })
const output = await mkdtemp(resolve('dist/macos-vsix-'))
const stage = join(output, 'stage')
const extension = join(stage, 'extension')
await mkdir(extension, { recursive: true })
await cp(portable.root, join(extension, 'portable'), { recursive: true })
await cp(join(program, 'media'), join(extension, 'media'), { recursive: true })
const pkg = {
  ...product,
  version: '0.1.1',
  displayName: 'Hello Vibe',
  description: 'Kiro 1.1.70 extension for Apple Silicon Mac with local Core.',
  engines: { vscode: '^1.131.0' },
}
delete pkg.scripts
delete pkg.devDependencies
delete pkg.dependencies
delete pkg.allowScripts
await writeFile(join(extension, 'package.json'), JSON.stringify(pkg, null, 2))
await build({
  absWorkingDir: program,
  entryPoints: [join(program, 'src/extension.ts')],
  outfile: join(extension, 'dist/extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['vscode'],
  legalComments: 'eof',
})
await build({
  absWorkingDir: program,
  entryPoints: [join(program, 'src/webview/main.ts')],
  outfile: join(extension, 'dist/webview/main.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  legalComments: 'eof',
})
const xml = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
await writeFile(
  join(stage, '[Content_Types].xml'),
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="vsixmanifest" ContentType="text/xml"/>${['cjs', 'mjs', 'node', 'sql', 'md', 'svg', 'png', 'html'].map((ext) => `<Default Extension="${ext}" ContentType="application/octet-stream"/>`).join('')}<Override PartName="/extension/portable/bin/node" ContentType="application/octet-stream"/></Types>`,
)
await writeFile(
  join(stage, 'extension.vsixmanifest'),
  `<?xml version="1.0"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}" TargetPlatform="darwin-arm64"/><DisplayName>${xml(pkg.displayName)}</DisplayName><Description xml:space="preserve">${xml(pkg.description)}</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.131.0"/><Property Id="Microsoft.VisualStudio.Code.TargetPlatform" Value="darwin-arm64"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>`,
)
const files = await inventory(stage)
for (const item of files) {
  if (
    /\.(?:db|sqlite|log|map)$|(?:^|\/)(?:\.env|connection\.json|dev-config\.json|test|tests)(?:$|\/)/.test(
      item.name,
    )
  )
    throw new Error('MAC_PACKAGE_PRIVATE_FILE_DENIED')
  const bytes = await readFile(join(stage, item.name))
  if (bytes.includes(Buffer.from(resolve('.'))) || bytes.includes(Buffer.from(program)))
    throw new Error('MAC_PACKAGE_DEVELOPER_PATH_LEAK')
}
const path = join(output, `${pkg.name}-${pkg.version}-darwin-arm64.vsix`)
const archive = await archiveMacos(stage, path)
const report = {
  file: path,
  version: pkg.version,
  frontendVersion: product.version,
  sources,
  target: 'darwin-arm64',
  bytes: archive.bytes,
  sha256: archive.sha256,
  files: files.length,
  sourceCheckoutRequired: false,
  installParser: 'PENDING',
  nativePaidCalls: 0,
}
await writeFile(join(output, 'files.json'), JSON.stringify(files, null, 2))
await writeFile(join(output, 'receipt.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
