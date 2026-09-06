import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { CampusDropStore } from './core.js'

test('stores blobs outside SQLite metadata and consumes a token only once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'campus-drop-store-'))
  const store = await CampusDropStore.open(directory)
  try {
    const created = await store.create({
      filename: 'typescript-notes.txt',
      bytes: Buffer.from('state transitions'),
      ttlSeconds: 300,
      now: 1_000,
    })
    const first = await store.consume(created.token, 2_000)
    assert.equal(first.ok, true)
    if (first.ok) assert.equal(Buffer.from(first.bytes).toString('utf8'), 'state transitions')
    assert.deepEqual(await store.consume(created.token, 3_000), { ok: false, reason: 'CONSUMED' })
  } finally {
    store.close()
  }
})

test('distinguishes expiry from a missing token without returning bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'campus-drop-expiry-'))
  const store = await CampusDropStore.open(directory)
  try {
    const created = await store.create({
      filename: 'small.txt',
      bytes: Buffer.from('small'),
      ttlSeconds: 30,
      now: 1_000,
    })
    assert.deepEqual(await store.consume(created.token, created.expiresAt), {
      ok: false,
      reason: 'EXPIRED',
    })
    assert.deepEqual(await store.consume('x'.repeat(32), 2_000), {
      ok: false,
      reason: 'NOT_FOUND',
    })
  } finally {
    store.close()
  }
})
