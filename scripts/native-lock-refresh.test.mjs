import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { test } from 'node:test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('a script-free lock refresh resolves a new local dependency before frozen install', () => {
  const root = mkdtempSync(join(tmpdir(), 'vibe-native-lock-refresh-'))
  const dependency = join(root, 'deps', 'synthetic-local-dep')
  mkdirSync(dependency, { recursive: true })
  const marker = join(root, 'unexpected-install-script-ran')
  writeFileSync(
    join(dependency, 'package.json'),
    JSON.stringify({
      name: 'synthetic-local-dep',
      version: '1.0.0',
      scripts: { install: `node -e "require('node:fs').writeFileSync('${marker}', 'ran')"` },
    }),
  )
  const writeRoot = (dependencies) =>
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'synthetic-lock-refresh-app',
        version: '1.0.0',
        private: true,
        dependencies,
      }),
    )
  const run = (...args) =>
    execFileSync('pnpm', args, {
      cwd: root,
      env: process.env,
      stdio: 'pipe',
      timeout: 120_000,
    })

  writeRoot({})
  run('install', '--lockfile-only', '--ignore-scripts', '--ignore-pnpmfile')
  assert(existsSync(join(root, 'pnpm-lock.yaml')))
  assert.equal(existsSync(marker), false)

  writeRoot({ 'synthetic-local-dep': 'file:./deps/synthetic-local-dep' })
  run('install', '--lockfile-only', '--ignore-scripts', '--ignore-pnpmfile')
  assert(readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8').includes('synthetic-local-dep'))
  assert.equal(existsSync(marker), false, 'the resolution step must not run dependency scripts')

  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    'packages:\n  - .\nallowBuilds:\n  synthetic-local-dep: false\n',
  )
  run('install', '--frozen-lockfile')
  assert(existsSync(join(root, 'node_modules', 'synthetic-local-dep')))
  assert.equal(
    existsSync(marker),
    false,
    'the explicit dependency build denial must remain effective',
  )
})
