import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { PROJECT_PNPM } from '../../packages/runtime/src/project-toolchain.js'
it('keeps development and managed project pnpm pins aligned and rejects broken releases', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  expect(pkg.packageManager).toBe(`pnpm@${PROJECT_PNPM.version}`)
  expect(pkg.engines.pnpm).toBe(PROJECT_PNPM.version)
  expect(['11.12.0', '11.13.0']).not.toContain(PROJECT_PNPM.version)
  expect(readFileSync('scripts/check-toolchain.mjs', 'utf8')).toContain(
    `const expectedPnpm = '${PROJECT_PNPM.version}'`,
  )
  expect(readFileSync('scripts/project-tools.mjs', 'utf8')).toContain(
    `pnpm@${PROJECT_PNPM.version}`,
  )
  expect(PROJECT_PNPM.url).toBe(
    `https://registry.npmjs.org/pnpm/-/pnpm-${PROJECT_PNPM.version}.tgz`,
  )
})
