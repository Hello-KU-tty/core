import { spawn } from 'node:child_process'
import { copyFile, lstat, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const panelRoot = resolve('examples/kiro-panel')
const packageJson = JSON.parse(await readFile(join(panelRoot, 'package.json'), 'utf8'))
const runtimeManifest = JSON.parse(
  await readFile(join(panelRoot, 'runtime', 'manifest.json'), 'utf8'),
)
const artifactRoot = process.platform === 'darwin' ? '/private/tmp' : tmpdir()
const assetNames = ['bridge', 'DISCOVERY', 'BUILDER', 'HELPER', 'EVIDENCE_ANALYST']
const productCommands = [
  { command: 'vibeHelper.localPanel', title: 'Vibe Helper: Open Local Integration Panel' },
  {
    command: 'vibeHelper.nativeCleanEvaluationRun',
    title: 'Vibe Helper: Run Bounded Synthetic Validation (7 Analyst cells)',
  },
]
if (
  JSON.stringify(packageJson.activationEvents) !==
    JSON.stringify([
      'onCommand:vibeHelper.localPanel',
      'onCommand:vibeHelper.nativeCleanEvaluationRun',
      'onStartupFinished',
    ]) ||
  JSON.stringify(packageJson.contributes?.commands) !== JSON.stringify(productCommands) ||
  Object.keys(runtimeManifest.assets ?? {})
    .sort()
    .join(',') !== assetNames.sort().join(',')
)
  throw new Error('KIRO_PANEL_PUBLISH_MANIFEST_UNSAFE')

const outputDirectory = await mkdtemp(join(artifactRoot, 'vibe-helper-kiro-panel-vsix-'))
const output = join(outputDirectory, `${packageJson.name}-${packageJson.version}.vsix`)
const staging = await mkdtemp(join(artifactRoot, 'vibe-helper-kiro-panel-stage-'))
const publishedFiles = [
  'extension/package.json',
  'extension/dist/extension.cjs',
  'extension/media/panel.html',
  'extension/media/panel.js',
  'extension/runtime/manifest.json',
]

async function publish(source, target) {
  const info = await lstat(source)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
    throw new Error('KIRO_PANEL_PUBLISH_ASSET_UNSAFE')
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target)
}

await publish(join(panelRoot, 'package.json'), join(staging, 'extension', 'package.json'))
await publish(
  join(panelRoot, 'dist', 'extension.cjs'),
  join(staging, 'extension', 'dist', 'extension.cjs'),
)
for (const name of ['panel.html', 'panel.js'])
  await publish(join(panelRoot, 'media', name), join(staging, 'extension', 'media', name))
await publish(
  join(panelRoot, 'runtime', 'manifest.json'),
  join(staging, 'extension', 'runtime', 'manifest.json'),
)
for (const name of assetNames) {
  const asset = runtimeManifest.assets[name]
  if (
    typeof asset?.path !== 'string' ||
    !/^[A-Za-z0-9._/-]{1,160}$/.test(asset.path) ||
    asset.path.split('/').includes('..')
  )
    throw new Error('KIRO_PANEL_PUBLISH_MANIFEST_UNSAFE')
  const archivePath = `extension/runtime/${asset.path}`
  if (publishedFiles.includes(archivePath)) throw new Error('KIRO_PANEL_PUBLISH_MANIFEST_UNSAFE')
  await publish(
    join(panelRoot, 'runtime', ...asset.path.split('/')),
    join(staging, 'extension', 'runtime', ...asset.path.split('/')),
  )
  publishedFiles.push(archivePath)
}

const xml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
await writeFile(
  join(staging, '[Content_Types].xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="cjs" ContentType="application/javascript" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="mjs" ContentType="application/javascript" />
  <Default Extension="html" ContentType="text/html" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
</Types>
`,
)
await writeFile(
  join(staging, 'extension.vsixmanifest'),
  `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xml(packageJson.name)}" Version="${xml(packageJson.version)}" Publisher="${xml(packageJson.publisher)}" />
    <DisplayName>${xml(packageJson.displayName)}</DisplayName>
    <Description xml:space="preserve">${xml(packageJson.description)}</Description>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(packageJson.engines.vscode)}" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" /></Assets>
</PackageManifest>
`,
)

const archiveFiles = ['[Content_Types].xml', 'extension.vsixmanifest', ...publishedFiles]
const run = (file, args, code) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(file, args, { cwd: staging, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (value) => {
      stdout += value
    })
    child.stderr.on('data', (value) => {
      stderr += value
    })
    child.once('error', reject)
    child.once('exit', (status) =>
      status === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${code}_${status}`)),
    )
  })

await run('/usr/bin/zip', ['-X', '-q', output, ...archiveFiles], 'KIRO_PANEL_ZIP_FAILED')
await run('/usr/bin/unzip', ['-tqq', output], 'KIRO_PANEL_ZIP_INVALID')
const listing = await run('/usr/bin/unzip', ['-Z1', output], 'KIRO_PANEL_ZIP_LIST_FAILED')
const actualFiles = listing.stdout.trim().split('\n').filter(Boolean).sort()
const expectedFiles = [...archiveFiles].sort()
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles))
  throw new Error('KIRO_PANEL_ZIP_CONTENT_UNEXPECTED')
console.log(
  JSON.stringify({
    status: 'KIRO_PANEL_VSIX_READY',
    file: output,
    name: basename(output),
    staging,
    files: expectedFiles,
    installParserValidation: 'PENDING_LIVE_KIRO_INSTALL',
    vsceEquivalent: false,
  }),
)
