import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { sourceProvenance } from './source-provenance.mjs'

test('extracted source requires an explicit valid provenance receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hello-vibe-provenance-'))
  await assert.rejects(sourceProvenance(root), /ENOENT/)
  await writeFile(join(root, 'source-info.json'), JSON.stringify({ baseCommit: 'unknown' }))
  await assert.rejects(sourceProvenance(root), /SOURCE_PROVENANCE_REQUIRED/)
  const expected = { baseCommit: 'a'.repeat(40), workingTreeChangesIncluded: false }
  await writeFile(join(root, 'source-info.json'), JSON.stringify(expected))
  assert.deepEqual(await sourceProvenance(root), { ...expected, kind: 'developer-snapshot' })
})
