import { execFile } from 'node:child_process'
import { cp, lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { loadCoreResources, sha256 } from '../packages/runtime/dist/portable-core.js'

if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('VSIX_TARGET_UNVERIFIED')
const repository = resolve('.')
const artifact = join(repository, 'dist/portable-win32-x64')
if (!artifact.startsWith(`${join(repository, 'dist')}${sep}`)) throw new Error('OUTPUT_PATH_UNSAFE')
if ((await realpath(join(repository, 'dist'))) !== join(repository, 'dist'))
  throw new Error('OUTPUT_PARENT_UNSAFE')
await loadCoreResources(join(repository, 'dist/portable-core-win32-x64'))
await rm(artifact, { recursive: true, force: true })
const staging = join(artifact, 'stage')
await mkdir(join(staging, 'extension/dist'), { recursive: true })
await cp(join(repository, 'dist/portable-core-win32-x64'), join(staging, 'extension/portable'), {
  recursive: true,
})
await cp(
  'dist/portable-core-win32-x64/bin/extension.cjs',
  join(staging, 'extension/dist/extension.cjs'),
)
await cp('examples/kiro-panel/media', join(staging, 'extension/media'), { recursive: true })
const manifest = {
  name: 'vibe-helper-portable-core',
  displayName: 'Vibe Helper',
  description: 'Local Discovery, Builder, Helper and History with managed Windows Core runtime.',
  version: '0.3.7',
  publisher: 'vibe-helper',
  private: true,
  engines: { vscode: '^1.131.0' },
  main: './dist/extension.cjs',
  activationEvents: ['onStartupFinished', 'onCommand:vibeHelper.localPanel'],
  capabilities: {
    untrustedWorkspaces: {
      supported: 'limited',
      description: 'History is available; native Agent requires workspace trust.',
    },
  },
  contributes: {
    commands: [
      {
        command: 'vibeHelper.localPanel',
        title: 'Vibe Helper: Open',
      },
      { command: 'vibeHelper.retryCore', title: 'Vibe Helper: Retry Core Connection' },
    ],
  },
}
await writeFile(join(staging, 'extension/package.json'), JSON.stringify(manifest, null, 2))
await writeFile(
  join(staging, '[Content_Types].xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/>
<Default Extension="mjs" ContentType="application/javascript"/><Default Extension="js" ContentType="application/javascript"/>
<Default Extension="node" ContentType="application/octet-stream"/><Default Extension="sql" ContentType="text/plain"/>
<Default Extension="md" ContentType="text/markdown"/><Default Extension="html" ContentType="text/html"/>
<Default Extension="vsixmanifest" ContentType="text/xml"/>
</Types>`,
)
await writeFile(
  join(staging, 'extension.vsixmanifest'),
  `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}" TargetPlatform="win32-x64"/>
<DisplayName>${manifest.displayName}</DisplayName><Description xml:space="preserve">${manifest.description}</Description>
<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${manifest.engines.vscode}"/>
<Property Id="Microsoft.VisualStudio.Code.TargetPlatform" Value="win32-x64"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>`,
)
const expected = []
async function walk(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isSymbolicLink()) throw new Error('VSIX_LINK_DENIED')
    if (item.isDirectory()) await walk(path)
    else {
      const name = relative(staging, path).split(sep).join('/')
      if ((await lstat(path)).nlink !== 1) throw new Error('VSIX_HARDLINK_DENIED')
      expected.push({ name, bytes: (await lstat(path)).size, sha256: sha256(await readFile(path)) })
    }
  }
}
await walk(staging)
const allowed = new Set([
  '[Content_Types].xml',
  'extension.vsixmanifest',
  'extension/package.json',
  'extension/dist/extension.cjs',
  'extension/media/panel.html',
  'extension/media/panel.js',
  'extension/portable/manifest.json',
  ...Object.keys((await loadCoreResources(join(staging, 'extension/portable'))).manifest.files).map(
    (name) => `extension/portable/${name}`,
  ),
])
if (expected.length !== allowed.size || expected.some((file) => !allowed.has(file.name)))
  throw new Error('VSIX_INVENTORY_UNEXPECTED')
const archive = join(artifact, `${manifest.name}-${manifest.version}-win32-x64.vsix`)
const archiveManifest = join(artifact, 'archive-input.json')
await writeFile(archiveManifest, JSON.stringify(expected))
// Fixed script; every path/name is data. Reopen and verify every compressed entry.
const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$files = Get-Content -LiteralPath $env:VIBE_VSIX_INVENTORY -Raw | ConvertFrom-Json
$zip = [IO.Compression.ZipFile]::Open($env:VIBE_VSIX_OUTPUT, [IO.Compression.ZipArchiveMode]::Create)
try { foreach ($file in $files) {
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $env:VIBE_VSIX_STAGE $file.name), $file.name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
} } finally { $zip.Dispose() }
$zip = [IO.Compression.ZipFile]::OpenRead($env:VIBE_VSIX_OUTPUT)
try {
  if ($zip.Entries.Count -ne $files.Count) { throw 'VSIX_ENTRY_COUNT_INVALID' }
  foreach ($file in $files) {
    $entry = $zip.GetEntry($file.name)
    if ($null -eq $entry -or $entry.Length -ne $file.bytes) { throw 'VSIX_ENTRY_INVALID' }
    $stream = $entry.Open()
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $actual = [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hash.Dispose() }
    if ($actual -ne $file.sha256) { throw 'VSIX_ENTRY_HASH_MISMATCH' }
  }
} finally { $zip.Dispose() }
`
await promisify(execFile)(
  join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
  ['-NoProfile', '-NonInteractive', '-Command', script],
  {
    windowsHide: true,
    timeout: 30_000,
    env: {
      ...process.env,
      VIBE_VSIX_INVENTORY: archiveManifest,
      VIBE_VSIX_OUTPUT: archive,
      VIBE_VSIX_STAGE: staging,
    },
  },
)
const report = {
  status: 'WINDOWS_VSIX_VERIFIED',
  target: 'win32-x64',
  files: expected.length,
  vsixBytes: (await lstat(archive)).size,
  installedBytes: expected
    .filter((f) => f.name.startsWith('extension/'))
    .reduce((n, f) => n + f.bytes, 0),
  sha256: sha256(await readFile(archive)),
  nativeWindowsLifecycle: 'W3_IMPLEMENTED_REQUIRES_RECEIPT',
  cleanInstallation: 'W5_PENDING',
  file: relative(repository, archive),
}
await writeFile(join(artifact, 'receipt.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
