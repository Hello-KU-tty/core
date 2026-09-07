import { spawn, type ChildProcess } from 'node:child_process'

/** Only pass a child created/owned by this backend, with detached=true on POSIX. */
export async function stopOwnedProcessTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return
  const signal = (name: NodeJS.Signals): void => {
    try {
      if (process.platform !== 'win32') process.kill(-Number(child.pid), name)
      else if (child.exitCode === null && child.signalCode === null) child.kill(name)
    } catch {
      /* Owned tree already exited. */
    }
  }
  if (process.platform === 'win32' && child.exitCode === null && child.signalCode === null) {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
    })
    await new Promise<void>((done) => {
      const timeout = setTimeout(() => {
        killer.kill()
        signal('SIGKILL')
        done()
      }, 2_000)
      const finish = () => {
        clearTimeout(timeout)
        signal('SIGKILL')
        done()
      }
      killer.once('exit', finish)
      killer.once('error', finish)
    })
    return
  }
  signal('SIGTERM')
  await new Promise<void>((done) => setTimeout(done, 200))
  // The original group may still have descendants after the root exits.
  signal('SIGKILL')
}
