import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { expect, it } from 'vitest'
import { stopOwnedProcessTree } from '../src/process-tree.js'

it.skipIf(process.platform === 'win32')(
  'stops its POSIX descendants even after the owned root exits',
  async () => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        `
    const {spawn} = require('node:child_process');
    const worker = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {stdio:'ignore'});
    process.stdout.write(String(worker.pid)+'\\n');
    setTimeout(()=>process.exit(0),100);
  `,
      ],
      { detached: true, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const [chunk] = (await once(child.stdout, 'data')) as [Buffer]
    const workerPid = Number(chunk.toString().trim())
    expect(workerPid).toBeGreaterThan(0)
    try {
      await once(child, 'exit')
      await stopOwnedProcessTree(child)
      await expect
        .poll(() => {
          try {
            process.kill(workerPid, 0)
            return 'alive'
          } catch {
            return 'exited'
          }
        })
        .toBe('exited')
    } finally {
      await stopOwnedProcessTree(child)
    }
  },
)
