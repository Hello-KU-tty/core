import { resolve } from 'node:path'
import { build } from 'esbuild'
await build({
  entryPoints: ['examples/kiro-panel/src/extension.cjs'],
  outfile: 'examples/kiro-panel/dist/extension.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  alias: {
    '@vibe-helper/frontend-client/node': resolve('packages/frontend-client/dist/node.js'),
    '@vibe-helper/frontend-client': resolve('packages/frontend-client/dist/index.js'),
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
console.log('Built examples/kiro-panel/dist/extension.cjs and IDE host test')
