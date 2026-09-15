import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const panelRoot = resolve('examples/kiro-panel')
const runtimeRoot = resolve(panelRoot, 'runtime')
const promptFiles = {
  DISCOVERY: 'discovery.md',
  BUILDER: 'builder.md',
  HELPER: 'helper.md',
  EVIDENCE_ANALYST: 'evidence-analyst.md',
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

await build({
  entryPoints: ['examples/kiro-panel/src/extension.cjs'],
  outfile: 'examples/kiro-panel/dist/extension.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  // The external Node 24 pin applies to the stdio bridge, not Electron's
  // extension host. Keep the already-proven host-compatible bundle target.
  target: 'node18',
  external: ['vscode'],
  alias: {
    '@vibe-helper/frontend-client/node': resolve('packages/frontend-client/dist/node.js'),
    '@vibe-helper/frontend-client': resolve('packages/frontend-client/dist/index.js'),
    '@vibe-helper/application/redaction': resolve('packages/application/dist/redaction.js'),
    '@vibe-helper/kiro-adapter/builder-tool-guard': resolve(
      'packages/kiro-adapter/dist/builder-tool-guard.js',
    ),
  },
  sourcemap: false,
  legalComments: 'eof',
  logLevel: 'warning',
})
await build({
  entryPoints: ['examples/kiro-panel/test/ide.cjs'],
  outfile: 'examples/kiro-panel/dist/ide-test.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  alias: { '@vibe-helper/frontend-client/node': resolve('packages/frontend-client/dist/node.js') },
  sourcemap: false,
  legalComments: 'eof',
  logLevel: 'warning',
})
await mkdir(resolve(runtimeRoot, 'agent-prompts'), { recursive: true })
await build({
  entryPoints: ['scripts/native-core-stdio-bridge.mjs'],
  outfile: resolve(runtimeRoot, 'native-core-stdio-bridge.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: false,
  legalComments: 'eof',
  logLevel: 'warning',
})
const runtimeConfig = JSON.parse(await readFile(resolve(panelRoot, 'runtime-config.json'), 'utf8'))
const bridge = await readFile(resolve(runtimeRoot, 'native-core-stdio-bridge.mjs'))
const assets = {
  bridge: { path: 'native-core-stdio-bridge.mjs', sha256: sha256(bridge) },
}
const promptVersions = {}
for (const [role, filename] of Object.entries(promptFiles)) {
  const content = await readFile(resolve('docs/agent-prompts', filename))
  const version = content
    .toString('utf8')
    .match(/^> Prompt version: `([0-9]+\.[0-9]+\.[0-9]+)`$/m)?.[1]
  if (!version) throw new Error(`KIRO_PANEL_PROMPT_VERSION_MISSING_${role}`)
  const target = resolve(runtimeRoot, 'agent-prompts', filename)
  await writeFile(target, content, { mode: 0o644 })
  assets[role] = { path: `agent-prompts/${filename}`, sha256: sha256(content) }
  promptVersions[role] = version
}
await writeFile(
  resolve(runtimeRoot, 'manifest.json'),
  `${JSON.stringify({ ...runtimeConfig, promptVersions, assets }, null, 2)}\n`,
  { mode: 0o644 },
)
console.log('Built Kiro panel, IDE host test, and pinned packaged native runtime assets')
