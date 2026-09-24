import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

export async function packageHostDriver(root, driver) {
  const stage = join(root, `driver-package-${randomUUID()}`)
  await mkdir(stage)
  await cp(driver, join(stage, 'extension'), { recursive: true })
  await writeFile(
    join(stage, '[Content_Types].xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="json" ContentType="application/json"/><Default Extension="cjs" ContentType="application/javascript"/>
<Default Extension="vsixmanifest" ContentType="text/xml"/></Types>`,
  )
  await writeFile(
    join(stage, 'extension.vsixmanifest'),
    `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="vibe-w3-host-driver" Version="0.0.1" Publisher="vibe-helper"/>
<DisplayName>W3 synthetic host verification</DisplayName><Description xml:space="preserve">Temporary verification driver</Description>
<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.131.0"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>`,
  )
  const archive = join(root, `driver-${randomUUID()}.vsix`)
  await promisify(execFile)(
    join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$zip = [IO.Compression.ZipFile]::Open($env:VIBE_DRIVER_ARCHIVE, [IO.Compression.ZipArchiveMode]::Create)
try { foreach ($name in @('[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json', 'extension/extension.cjs', 'extension/config.json')) {
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $env:VIBE_DRIVER_STAGE $name), $name) | Out-Null
} } finally { $zip.Dispose() }
`,
    ],
    {
      env: { ...process.env, VIBE_DRIVER_STAGE: stage, VIBE_DRIVER_ARCHIVE: archive },
      windowsHide: true,
      timeout: 30000,
    },
  )
  return archive
}
