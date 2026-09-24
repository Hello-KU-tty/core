const { execFileSync } = require('node:child_process')
const { lstatSync, realpathSync } = require('node:fs')
const { join, resolve } = require('node:path')

// Read-only DACL inspection. The path is data in a child-only environment
// variable, never interpolated into PowerShell source. Do not expose SID/ACLs.
const ACL_CHECK = `
$ErrorActionPreference = 'Stop'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$directory = $env:VIBE_HELPER_PRIVATE_KIND -eq 'directory'
$acl = if ($directory) { [System.IO.Directory]::GetAccessControl($env:VIBE_HELPER_PRIVATE_DIRECTORY) } else { [System.IO.File]::GetAccessControl($env:VIBE_HELPER_PRIVATE_DIRECTORY) }
$rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
$allow = @($rules | Where-Object { $_.AccessControlType -eq 'Allow' })
$trusted = @($sid, 'S-1-5-18', 'S-1-5-32-544')
$foreign = @($allow | Where-Object { $_.IdentityReference.Value -notin $trusted })
$full = [Security.AccessControl.FileSystemRights]::FullControl
$ownerAccess = @($allow | Where-Object {
  $_.IdentityReference.Value -eq $sid -and (($_.FileSystemRights -band $full) -eq $full)
})
if ((-not $directory -or $acl.AreAccessRulesProtected) -and
    $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $sid -and
    $foreign.Count -eq 0 -and $ownerAccess.Count -gt 0) { 'PRIVATE' } else { 'UNSAFE' }
`

function privateNativePath(path, directory) {
  try {
    const stat = lstatSync(path)
    if ((directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) ||
        stat.isSymbolicLink() || realpathSync(path) !== resolve(path))
      return false
    if (process.platform !== 'win32')
      return stat.uid === process.getuid() && (stat.mode & 0o077) === 0
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
    if (!systemRoot) return false
    let result
    try { result = execFileSync(join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-Command', ACL_CHECK], {
        env: { ...process.env, VIBE_HELPER_PRIVATE_DIRECTORY: path,
          VIBE_HELPER_PRIVATE_KIND: directory ? 'directory' : 'file' },
        encoding: 'utf8', timeout: 30_000, windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 4096,
      }).trim() }
    catch { throw new Error('NATIVE_PRIVATE_PATH_CHECK_UNAVAILABLE') }
    if (!['PRIVATE', 'UNSAFE'].includes(result)) throw new Error('NATIVE_PRIVATE_PATH_CHECK_UNAVAILABLE')
    return result === 'PRIVATE'
  } catch (error) {
    if (error?.message === 'NATIVE_PRIVATE_PATH_CHECK_UNAVAILABLE') throw error
    return false
  }
}
module.exports = {
  privateNativeDirectory: path => privateNativePath(path, true),
  privateNativeFile: path => privateNativePath(path, false),
}
