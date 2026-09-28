import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { replaceEvidenceMethodWithBaseline } from './benchmark-reference-source.mjs'

const method = (eol, body) => `${eol}  #readEvidenceTrace(${eol}${body}${eol}  }`
const suffix = (eol) => `${eol}  async #getResultDescriptor(${eol}    currentOnly${eol}`

for (const currentEol of ['\n', '\r\n']) {
  for (const baselineEol of ['\n', '\r\n']) {
    test(`preserves current prefix/suffix with ${JSON.stringify(currentEol)} / ${JSON.stringify(baselineEol)}`, () => {
      const prefix = `current-only${currentEol}unchanged`
      const before = prefix + method(currentEol, '    optimized') + suffix(currentEol)
      const baseline = `baseline-only${method(baselineEol, '    old')}${suffix(baselineEol)}`
      const result = replaceEvidenceMethodWithBaseline(before, baseline)
      assert.equal(result, prefix + method(baselineEol, '    old') + suffix(currentEol))
      assert.ok(!result.includes('baseline-only'))
      assert.ok(!result.includes('optimized'))
    })
  }
}

test('rejects missing, duplicate, reversed and changed method boundaries on either side', () => {
  const valid = `prefix${method('\n', '    old')}${suffix('\n')}`
  const invalid = [
    '',
    valid.replace('#readEvidenceTrace(', '#changed('),
    valid.replace('async #getResultDescriptor(', 'async #changed('),
    valid + method('\n', '    duplicate'),
    valid + suffix('\n'),
    suffix('\r\n') + method('\r\n', '    reversed'),
    valid.replace('  #readEvidenceTrace(', '   #readEvidenceTrace('),
  ]
  for (const source of invalid) {
    assert.throws(() => replaceEvidenceMethodWithBaseline(source, valid), /BOUNDARY_DRIFT/)
    assert.throws(() => replaceEvidenceMethodWithBaseline(valid, source), /BOUNDARY_DRIFT/)
  }
})

test('does not coerce non-source input', () => {
  assert.throws(() => replaceEvidenceMethodWithBaseline(null, ''), /SOURCE_INVALID/)
  assert.throws(() => replaceEvidenceMethodWithBaseline('', {}), /SOURCE_INVALID/)
})

test('real current source reconstructs an identical comparison bundle from LF and CRLF', async () => {
  const directory = new URL('../packages/application/src/', import.meta.url)
  const current = await readFile(new URL('application-service.ts', directory), 'utf8')
  const baseline = execFileSync(
    'git',
    [
      'show',
      '04117c520c10e732af709b0d064c020d1d001e55:packages/application/src/application-service.ts',
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    },
  )
  const compile = async (contents) => {
    const result = await build({
      stdin: {
        contents,
        resolveDir: fileURLToPath(directory),
        sourcefile: 'reference-application.ts',
        loader: 'ts',
      },
      write: false,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
    })
    assert.equal(result.outputFiles.length, 1)
    return result.outputFiles[0].text
  }
  const lf = current.replaceAll('\r\n', '\n')
  const crlf = lf.replaceAll('\n', '\r\n')
  const first = await compile(replaceEvidenceMethodWithBaseline(lf, baseline))
  const second = await compile(replaceEvidenceMethodWithBaseline(crlf, baseline))
  assert.equal(first, second)
})
