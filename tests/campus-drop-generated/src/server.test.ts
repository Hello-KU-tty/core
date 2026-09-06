import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('port unavailable'))
        return
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)))
    })
  })
}

async function waitForHealth(child: ChildProcess, url: string): Promise<void> {
  const deadline = Date.now() + 3_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Campus Drop exited during startup')
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // The fixture server may still be starting.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Campus Drop health check timed out')
}

test('builds, runs, uploads, downloads once, and reports the consumed state', async () => {
  const port = await availablePort()
  const dataDirectory = await mkdtemp(join(tmpdir(), 'campus-drop-server-'))
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: process.cwd(),
    env: {
      CAMPUS_DROP_DATA_DIR: dataDirectory,
      HOST: '127.0.0.1',
      PATH: process.env.PATH,
      PORT: String(port),
    },
    stdio: 'ignore',
  })
  try {
    await waitForHealth(child, `http://127.0.0.1:${String(port)}/health`)
    const invalidUpload = await fetch(`http://127.0.0.1:${String(port)}/api/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: 'invalid.txt',
        contentBase64: '**not-base64**',
        ttlSeconds: 300,
      }),
    })
    assert.equal(invalidUpload.status, 400)
    assert.deepEqual(await invalidUpload.json(), { error: 'INVALID_BASE64' })
    const upload = await fetch(`http://127.0.0.1:${String(port)}/api/uploads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: 'campus.txt',
        contentBase64: Buffer.from('typescript boundary').toString('base64'),
        ttlSeconds: 300,
      }),
    })
    assert.equal(upload.status, 201)
    const payload = (await upload.json()) as {
      readonly downloadUrl: string
      readonly policy: string
    }
    assert.equal(payload.policy, 'ONE_TIME')
    const first = await fetch(`http://127.0.0.1:${String(port)}${payload.downloadUrl}`)
    assert.equal(first.status, 200)
    assert.equal(await first.text(), 'typescript boundary')
    const second = await fetch(`http://127.0.0.1:${String(port)}${payload.downloadUrl}`)
    assert.equal(second.status, 410)
    assert.deepEqual(await second.json(), { error: 'CONSUMED' })
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await once(child, 'exit')
    }
  }
})
