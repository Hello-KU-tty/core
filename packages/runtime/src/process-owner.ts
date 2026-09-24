import { execFile } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
function alive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 2147483647)
    throw new Error('LOCK_OWNER_INVALID_MANUAL_REVIEW_REQUIRED')
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw new Error('LOCK_OWNER_INSPECTION_UNAVAILABLE')
  }
}

/** A later Windows process reusing a PID cannot own an older private lock file. */
export async function isLockOwnerAlive(pid: number, ownerFile: string): Promise<boolean> {
  if (!alive(pid)) return false
  if (process.platform !== 'win32') return true
  const before = await lstat(ownerFile)
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1)
    throw new Error('LOCK_OWNER_FILE_UNSAFE')
  let started: number
  try {
    const result = await execute(
      join(
        process.env.SystemRoot ?? 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$ErrorActionPreference="Stop"; $p=[Diagnostics.Process]::GetProcessById(' +
          pid +
          '); ([DateTimeOffset]($p.StartTime.ToUniversalTime())).ToUnixTimeMilliseconds()',
      ],
      { windowsHide: true, timeout: 30_000, maxBuffer: 4096 },
    )
    const output = result.stdout.trim()
    if (!/^[0-9]{12,16}$/.test(output) || result.stderr.trim())
      throw new Error('INVALID_PROCESS_START_TIME')
    started = Number(output)
    if (!Number.isSafeInteger(started) || started > Date.now() + 1000)
      throw new Error('INVALID_PROCESS_START_TIME')
  } catch {
    if (!alive(pid)) return false
    throw new Error('LOCK_OWNER_INSPECTION_UNAVAILABLE')
  }
  const after = await lstat(ownerFile)
  if (
    after.ino !== before.ino ||
    after.dev !== before.dev ||
    after.mtimeMs !== before.mtimeMs ||
    after.size !== before.size
  )
    throw new Error('LOCK_OWNER_CHANGED')
  // Allow timestamp precision differences. Ambiguity stays fail closed.
  return started <= before.mtimeMs + 1000
}
