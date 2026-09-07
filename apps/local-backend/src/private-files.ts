import { execFile } from 'node:child_process'
import { chmod, lstat, mkdir, realpath } from 'node:fs/promises'
import { isAbsolute, parse, resolve, win32 } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
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

/** Quote only backend-owned paths in a Kiro preToolUse command. */
export function guardCommand(
  node: string,
  script: string,
  workspace: string,
  platform = process.platform,
): string {
  for (const value of [node, script, workspace]) {
    if (
      !(platform === 'win32' ? win32.isAbsolute(value) : isAbsolute(value)) ||
      /[\r\n\0]/.test(value)
    )
      throw new Error('GUARD_PATH_INVALID')
  }
  if (platform === 'win32') {
    // Kiro v2 invokes shell hooks. Avoid cmd/PowerShell expansion in path components.
    if ([node, script, workspace].some((value) => /["%$`!&|<>^]/.test(value)))
      throw new Error('WINDOWS_GUARD_PATH_UNSUPPORTED')
    return `"${node}" "${script}" --workspace "${workspace}"`
  }
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  return `${quote(node)} ${quote(script)} --workspace ${quote(workspace)}`
}
