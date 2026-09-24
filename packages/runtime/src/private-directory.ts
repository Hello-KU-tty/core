import { execFile } from 'node:child_process'
import { chmod, lstat, mkdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, parse, resolve } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)

/** Inspect existing owned roots without silently repairing permissive ACLs. */
export async function isPrivateDirectory(path: string): Promise<boolean> {
  try {
    const info = await lstat(path)
    const canonical = await realpath(path)
    const same =
      process.platform === 'win32'
        ? canonical.toLowerCase() === resolve(path).toLowerCase()
        : canonical === resolve(path)
    if (!info.isDirectory() || info.isSymbolicLink() || !same) return false
    if (process.platform !== 'win32')
      return info.uid === process.getuid?.() && (info.mode & 0o077) === 0
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
    if (!systemRoot) return false
    const { stdout } = await execute(
      join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `
$ErrorActionPreference = 'Stop'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$acl = [System.IO.Directory]::GetAccessControl($env:VIBE_HELPER_PRIVATE_DIRECTORY)
$allow = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | Where-Object { $_.AccessControlType -eq 'Allow' })
$foreign = @($allow | Where-Object { $_.IdentityReference.Value -notin @($sid, 'S-1-5-18', 'S-1-5-32-544') })
$full = [Security.AccessControl.FileSystemRights]::FullControl
$ownerAccess = @($allow | Where-Object { $_.IdentityReference.Value -eq $sid -and (($_.FileSystemRights -band $full) -eq $full) })
if ($acl.AreAccessRulesProtected -and $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -eq $sid -and $foreign.Count -eq 0 -and $ownerAccess.Count -gt 0) { 'PRIVATE' } else { 'UNSAFE' }
`,
      ],
      {
        env: { ...process.env, VIBE_HELPER_PRIVATE_DIRECTORY: path },
        windowsHide: true,
        timeout: 30_000,
        maxBuffer: 4096,
      },
    ).catch(() => {
      throw new Error('PRIVATE_DIRECTORY_CHECK_UNAVAILABLE')
    })
    if (!['PRIVATE', 'UNSAFE'].includes(stdout.trim()))
      throw new Error('PRIVATE_DIRECTORY_CHECK_UNAVAILABLE')
    return stdout.trim() === 'PRIVATE'
  } catch (error) {
    if (error instanceof Error && error.message === 'PRIVATE_DIRECTORY_CHECK_UNAVAILABLE')
      throw error
    return false
  }
}
/** Restrict a newly created application-owned directory. Never a user home/root. */
export async function privateDirectory(path: string): Promise<string> {
  if (process.platform === 'win32' && !/^[A-Za-z]:[\\/]/.test(path))
    throw new Error('LOCAL_DRIVE_REQUIRED')
  if (!isAbsolute(path) || resolve(path) === parse(resolve(path)).root)
    throw new Error('PRIVATE_PATH_REQUIRED')
  await mkdir(path, { recursive: true, mode: 0o700 })
  const stats = await lstat(path)
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('PRIVATE_DIRECTORY_INVALID')
  const canonical = await realpath(path)
  if (process.platform === 'win32') {
    const { stdout } = await execute('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
      windowsHide: true,
      timeout: 5_000,
    })
    const sid = stdout.match(/S-1-5-[0-9-]+/)?.[0]
    if (!sid) throw new Error('WINDOWS_OWNER_SID_UNAVAILABLE')
    await execute('icacls.exe', [canonical, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], {
      windowsHide: true,
      timeout: 5_000,
    })
  } else await chmod(canonical, 0o700)
  return canonical
}
