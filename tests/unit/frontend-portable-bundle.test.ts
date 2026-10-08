import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { expect, it } from 'vitest'
import { coreInstallationIdentity } from '../../packages/runtime/src/portable-core.js'

const require = createRequire(import.meta.url)

// Compilation/import checks only. Do not run the Windows package entry point,
// bypass its source/license preflight, or create a deployable portable artifact.
async function compile(entry: string) {
  const result = await build({
    entryPoints: [resolve(entry)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    minify: true,
    metafile: true,
    write: false,
    sourcemap: false,
    legalComments: 'eof',
    external: ['better-sqlite3', 'vscode'],
    define: { __VIBE_PORTABLE_HOST__: 'true' },
    alias: {
      '@vibe-helper/frontend-client/node': resolve('packages/frontend-client/dist/node.js'),
      '@vibe-helper/application/redaction': resolve('packages/application/dist/redaction.js'),
      '@vibe-helper/kiro-adapter/builder-tool-guard': resolve(
        'packages/kiro-adapter/dist/builder-tool-guard.js',
      ),
    },
  })
  expect(result.outputFiles).toHaveLength(1)
  const inputs = Object.keys(result.metafile.inputs)
  expect(
    inputs.some((input) => /single-host-(invoke|subagent)-probe|[/\\]tests?[/\\]/.test(input)),
  ).toBe(false)
  const module = { exports: {} as Record<string, unknown> }
  runInNewContext(result.outputFiles[0]?.text ?? '', {
    module,
    exports: module.exports,
    require: (name: string) => (name === 'vscode' ? {} : require(name)),
    process,
    Buffer,
    URL,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  })
  return { exports: module.exports, inputs }
}

it('portable Kiro-native frontend host bundles without the IDE-internal worker or a live host', async () => {
  const result = await compile('examples/kiro-panel/src/frontend-host.cjs')
  expect(typeof result.exports.createFrontendHost).toBe('function')
  expect(result.inputs).toContain('examples/kiro-panel/src/core-lifecycle.cjs')
  expect(result.inputs).toContain('examples/kiro-panel/src/mac-terminal-environment.cjs')
  // Off-chat Agents run in Core through kiro-cli; no private Kiro Agent connection is shipped.
  expect(
    result.inputs.some((input) => /native-worker\.cjs|kiro-native-host[/\\]/.test(input)),
  ).toBe(false)
})

it('portable runtime bundle exports the exact installation identity used by its Core owner', async () => {
  const result = await compile('packages/runtime/dist/index.js')
  const identity = result.exports.coreInstallationIdentity as typeof coreInstallationIdentity
  expect(typeof identity).toBe('function')
  const resource = { root: 'C:\\synthetic-installation\\portable' }
  const runtime = { executable: 'C:\\synthetic-runtime\\node.exe', args: [], env: {} }
  expect(identity(resource, runtime)).toBe(coreInstallationIdentity(resource, runtime))
  expect(identity({ root: 'C:\\different-installation\\portable' }, runtime)).not.toBe(
    identity(resource, runtime),
  )
})
