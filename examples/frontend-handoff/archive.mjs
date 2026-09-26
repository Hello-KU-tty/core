import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
export const sha256 = data => createHash('sha256').update(data).digest('hex')
export async function inventory(root) {
  const files = []
  async function walk(directory) {
    for (const item of await readdir(directory, {withFileTypes:true})) {
      const path=join(directory,item.name), stat=await lstat(path)
      if (stat.isSymbolicLink()) throw new Error('ARCHIVE_LINK_DENIED')
      if (item.isDirectory()) await walk(path)
      else {
        if (!stat.isFile() || stat.nlink!==1) throw new Error('ARCHIVE_FILE_DENIED')
        const data=await readFile(path)
        files.push({name:relative(root,path).split(sep).join('/'),bytes:data.length,sha256:sha256(data)})
      }
    }
  }
  await walk(root);return files.sort((a,b)=>a.name.localeCompare(b.name))
}
export async function archive(root, output) {
  const files=await inventory(root)
  const receipt=output+'.files.json'
  await writeFile(receipt,JSON.stringify(files,null,2))
  await promisify(execFile)(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),[
    '-NoProfile','-NonInteractive','-Command',`
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$files=Get-Content -LiteralPath $env:VIBE_ARCHIVE_FILES -Raw | ConvertFrom-Json
$zip=[IO.Compression.ZipFile]::Open($env:VIBE_ARCHIVE_OUT,[IO.Compression.ZipArchiveMode]::Create)
try { foreach($file in $files) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $env:VIBE_ARCHIVE_ROOT $file.name),$file.name,[IO.Compression.CompressionLevel]::Optimal) | Out-Null } } finally { $zip.Dispose() }
$zip=[IO.Compression.ZipFile]::OpenRead($env:VIBE_ARCHIVE_OUT)
try {
  if($zip.Entries.Count -ne $files.Count) { throw 'ARCHIVE_ENTRY_COUNT' }
  foreach($file in $files) {
    $entry=$zip.GetEntry($file.name)
    if($null -eq $entry -or $entry.Length -ne $file.bytes) { throw 'ARCHIVE_ENTRY_INVALID' }
    $stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create()
    try { $actual=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose();$hash.Dispose() }
    if($actual -ne $file.sha256) { throw 'ARCHIVE_HASH_MISMATCH' }
  }
} finally { $zip.Dispose() }
`],{windowsHide:true,timeout:60000,env:{...process.env,VIBE_ARCHIVE_FILES:receipt,VIBE_ARCHIVE_ROOT:root,VIBE_ARCHIVE_OUT:output}})
  return {file:output.split(sep).at(-1),bytes:(await lstat(output)).size,sha256:sha256(await readFile(output)),files:files.length}
}
