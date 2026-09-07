import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'dist', 'frontend-client')
await mkdir(output, { recursive: true })
for (const format of ['esm', 'cjs']) {
  const ext = format === 'esm' ? '.js' : '.cjs'
  await build({
    entryPoints: {
      index: join(root, 'packages/frontend-client/dist/index.js'),
      node: join(root, 'packages/frontend-client/dist/node.js'),
    },
    outdir: output,
    outExtension: { '.js': ext },
    bundle: true,
    platform: 'node',
    format,
    target: 'node18',
    external: ['zod'],
    sourcemap: false,
    legalComments: 'eof',
    logLevel: 'warning',
  })
}
for (const format of ['esm', 'cjs']) {
  const ext = format === 'esm' ? '.js' : '.cjs'
  const typeExt = format === 'esm' ? '.d.ts' : '.d.cts'
  const types = join(output, 'types', format)
  await mkdir(join(types, 'contracts'), { recursive: true })
  for (const file of await readdir(join(root, 'packages/contracts/dist'))) {
    if (!file.endsWith('.d.ts')) continue
    const source = await readFile(join(root, 'packages/contracts/dist', file), 'utf8')
    await writeFile(
      join(types, 'contracts', file.replace('.d.ts', typeExt)),
      source.replace(/from '(\.\/[^']+)\.js'/g, `from '$1${ext}'`),
    )
  }
  for (const file of ['index', 'node', 'program-adapter']) {
    const source = await readFile(
      join(root, 'packages/frontend-client/dist', `${file}.d.ts`),
      'utf8',
    )
    await writeFile(
      join(types, `${file}${typeExt}`),
      source
        .replaceAll("'@vibe-helper/contracts'", `'./contracts/index${ext}'`)
        .replaceAll("'./index.js'", `'./index${ext}'`)
        .replaceAll("'./program-adapter.js'", `'./program-adapter${ext}'`),
    )
  }
}
const contracts = JSON.parse(await readFile(join(root, 'packages/contracts/package.json'), 'utf8'))
const exportsFor = (name) => ({
  import: { types: `./types/esm/${name}.d.ts`, default: `./${name}.js` },
  require: { types: `./types/cjs/${name}.d.cts`, default: `./${name}.cjs` },
})
await writeFile(
  join(output, 'package.json'),
  `${JSON.stringify(
    {
      name: '@vibe-helper/frontend-client',
      version: '0.1.0',
      type: 'module',
      main: './index.cjs',
      module: './index.js',
      types: './types/esm/index.d.ts',
      exports: { '.': exportsFor('index'), './node': exportsFor('node') },
      engines: { node: '>=18' },
      dependencies: { zod: contracts.dependencies.zod },
      files: ['*.js', '*.cjs', 'types', 'README.md'],
    },
    null,
    2,
  )}\n`,
)
await writeFile(
  join(output, 'README.md'),
  '# Vibe Helper frontend client\n\nExtension-host only. Read the private connection file with `connectLocalCore` from `@vibe-helper/frontend-client/node`. Never send credentials to a Webview. See the matching backend revision `docs/FRONTEND_INTEGRATION.md`.\n',
)
console.log('Built dist/frontend-client (ESM + CJS, standalone contract declarations).')
