import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { link, mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  copySourceFile,
  documentCopy,
  inspectContent,
  safeName,
  selectedSource,
} from './create-source-candidate.mjs'

test('source selection excludes private state, old packages and unreviewed experiments', () => {
  for (const name of [
    '../package.json',
    '/package.json',
    'src/../../token',
    'src\\file.ts',
    'src/.git/config',
    'src/node_modules/a.js',
    'src/.env.example',
    'src/connection.json',
    'src/state.sqlite-wal',
    'src/trace.jsonl',
    'src/credit-observation.json',
    'src/model-admissions.jsonl.claim',
    'portable/bin/core.js',
    'releases/old.vsix',
  ])
    assert.equal(safeName(name), false, name)
  assert.equal(selectedSource('backend', 'packages/contracts/src/index.ts'), true)
  assert.equal(selectedSource('backend', 'docs/agent-prompts/discovery.md'), true)
  assert.equal(selectedSource('backend', 'docs/MAC_NATIVE_VERIFICATION_20260930.md'), true)
  for (const version of ['1.0.8', '1.0.9'])
    assert.equal(
      selectedSource(
        'backend',
        `docs/spikes/t19-analyst-prompt-experiments/evidence-analyst-v${version}.md`,
      ),
      true,
    )
  assert.equal(selectedSource('backend', 'examples/windows-capability/core-probe.cjs'), false)
  assert.equal(selectedSource('backend', 'CONVERSATION_RECORD.md'), false)
  assert.equal(selectedSource('backend', 'examples/frontend-handoff/archive.mjs'), true)
  assert.equal(selectedSource('backend', 'examples/program-macos-dev/kiro-1170-source.cjs'), true)
  assert.equal(selectedSource('backend', 'scripts/package-macos-program.mjs'), true)
  assert.equal(selectedSource('frontend', 'vendor/frontend-client/index.js'), true)
  assert.equal(selectedSource('frontend', 'BACKEND_TAKEOVER_PROGRESS_20260928.md'), false)
  assert.equal(selectedSource('other', 'package.json'), false)
})

test('only document copies generalize local paths; recipes and runtime bytes are preserved', () => {
  const home = '/Users/snapshot-example'
  const data = Buffer.from(
    `${home}/project\n/private/tmp/vibe-helper-macos-core-Ab12Cd34/workspaces\n` +
      'mktemp -d /private/tmp/vibe-helper-macos-core-XXXXXXXX\n',
  )
  const document = documentCopy('docs/SPEC.md', data, home).toString()
  assert.match(document, /<LOCAL_HOME>\/project/)
  assert.match(document, /<PRIVATE_VERIFICATION_ROOT>\/workspaces/)
  assert.match(document, /mktemp -d \/private\/tmp\/vibe-helper-macos-core-XXXXXXXX/)
  assert.equal(documentCopy('src/runtime.ts', data, home), data)
})

test('privacy checks fail closed for a known home path and literal credentials', () => {
  const home = '/Users/snapshot-example'
  assert.throws(
    () => inspectContent('src/a.ts', Buffer.from(`${home}/secret`), home),
    /SOURCE_LOCAL_PATH/,
  )
  assert.throws(
    () => inspectContent('src/a.ts', Buffer.from(`ghp_${'a'.repeat(36)}`), home),
    /SOURCE_SECRET/,
  )
  assert.throws(
    () => inspectContent('key.txt', Buffer.from('-----BEGIN PRIVATE KEY-----\nbody'), home),
    /SOURCE_SECRET/,
  )
  assert.doesNotThrow(() =>
    inspectContent('src/a.ts', Buffer.from('const sample = "not-a-credential"'), home),
  )
})

test('Windows home spellings are screened and only document copies are generalized', () => {
  const home = 'C:\\Users\\Source Reviewer'
  for (const prefix of [home, home.replaceAll('\\', '/'), home.replaceAll('\\', '\\\\')]) {
    const data = Buffer.from(`${prefix}/private`)
    assert.throws(() => inspectContent('src/a.ts', data, home), /SOURCE_LOCAL_PATH/)
    assert.equal(documentCopy('docs/a.md', data, home).toString(), '<LOCAL_HOME>/private')
    assert.equal(documentCopy('src/a.ts', data, home), data)
  }
})

test('only two explicitly reviewed synthetic tokens at the exact fixture path are permitted', () => {
  const name = 'packages/application/test/redaction-stream.test.ts'
  const fixture = Buffer.from(['ghp_', 'abcdefghijklmnopqrstuvwxyz123456789'].join(''))
  assert.deepEqual(inspectContent(name, fixture), { reviewedSyntheticCredentialHits: 1 })
  assert.throws(() => inspectContent('src/a.ts', fixture), /SOURCE_SECRET/)
  assert.throws(() => inspectContent(name, Buffer.from(`ghp_${'z'.repeat(36)}`)), /SOURCE_SECRET/)
})

test('snapshot copies current bytes and rejects overwrite, symlink and hardlink inputs', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'vibe-helper-source-test-')))
  const root = join(parent, 'source')
  const target = join(parent, 'candidate')
  await mkdir(root, { mode: 0o700 })
  await writeFile(join(root, 'package.json'), '{"current":true}\n')
  const result = await copySourceFile(root, target, 'package.json')
  const bytes = await readFile(join(target, 'package.json'))
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'))
  assert.equal(result.sha256, result.sourceSha256)
  assert.equal(result.documentPathsGeneralized, false)
  await assert.rejects(copySourceFile(root, target, 'package.json'), /EEXIST/)
  await symlink(
    process.platform === 'win32' ? root : join(root, 'package.json'),
    join(root, 'alias.json'),
    process.platform === 'win32' ? 'junction' : 'file',
  )
  await assert.rejects(copySourceFile(root, target, 'alias.json'), /SOURCE_FILE_DENIED/)
  await link(join(root, 'package.json'), join(root, 'hard.json'))
  await assert.rejects(copySourceFile(root, target, 'hard.json'), /SOURCE_FILE_DENIED/)
  await assert.rejects(copySourceFile(root, target, '../outside'), /SOURCE_NAME_DENIED/)
  // Deliberately retained under the user's temporary-file preservation rule.
})
