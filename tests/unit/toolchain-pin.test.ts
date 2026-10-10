import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { PROJECT_PNPM } from '../../packages/runtime/src/project-toolchain.js'
it('keeps the recommended pnpm, the managed project pnpm and the development minimum aligned', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  expect(pkg.packageManager).toBe(`pnpm@${PROJECT_PNPM.version}`)
  // Development accepts this release or a later 11.x; generated projects get exactly this one.
  expect(pkg.engines.pnpm).toBe(`>=${PROJECT_PNPM.version} <12`)
  expect(['11.12.0', '11.13.0']).not.toContain(PROJECT_PNPM.version)
  expect(readFileSync('scripts/check-toolchain.mjs', 'utf8')).toContain(
    `const minimumPnpm = '${PROJECT_PNPM.version}'`,
  )
  expect(readFileSync('scripts/project-tools.mjs', 'utf8')).toContain(
    `pnpm@${PROJECT_PNPM.version}`,
  )
  expect(PROJECT_PNPM.url).toBe(
    `https://registry.npmjs.org/pnpm/-/pnpm-${PROJECT_PNPM.version}.tgz`,
  )
})
