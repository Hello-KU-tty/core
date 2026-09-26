import { createHash } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import {
  CORE_NODE_VERSIONS,
  loadCoreResources,
  MANAGED_NODE,
} from '../packages/runtime/dist/portable-core.js'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2] ?? `${process.platform}-${process.arch}`
if (target !== 'win32-x64') throw new Error('PORTABLE_TARGET_UNVERIFIED')
const output = join(repository, 'dist', `portable-core-${target}`)
if (!output.startsWith(`${join(repository, 'dist')}${sep}`)) throw new Error('OUTPUT_PATH_UNSAFE')
await mkdir(join(repository, 'dist'), { recursive: true })
if ((await realpath(join(repository, 'dist'))) !== join(repository, 'dist'))
  throw new Error('OUTPUT_PARENT_UNSAFE')
// Only this generated package is replaced; source and user data are never traversed.
await rm(output, { force: true, recursive: true })
await mkdir(join(output, 'bin'), { recursive: true })
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const inputs = new Set()
async function bundle(entry, file, options = {}) {
  const result = await build({
    entryPoints: [join(repository, entry)],
    outfile: join(output, file),
    bundle: true,
    platform: 'node',
    format: file.endsWith('.cjs') ? 'cjs' : 'esm',
    target: 'node24',
    sourcemap: false,
    minify: true,
    legalComments: 'eof',
    metafile: true,
    external: ['better-sqlite3', 'vscode'],
    define: { __VIBE_PORTABLE_HOST__: 'true' },
    ...(file.endsWith('.mjs')
      ? {
          banner: {
            js: "import { createRequire as __portableRequire } from 'node:module'; const require = __portableRequire(import.meta.url);",
          },
        }
      : {}),
    ...options,
  })
  for (const input of Object.keys(result.metafile.inputs)) {
    if (/single-host-(invoke|subagent)-probe|[\\/]test[s]?[\\/]/.test(input))
      throw new Error('DEVELOPER_SOURCE_IN_PACKAGE')
    inputs.add(resolve(repository, input))
  }
}
await bundle('apps/local-backend/dist/main.js', 'bin/core.mjs', {
  define: { __VIBE_PACKAGED_CORE__: 'true' },
})
await bundle('scripts/native-core-stdio-bridge.mjs', 'bin/bridge.mjs')
await bundle('scripts/portable-runtime-probe.cjs', 'bin/probe.cjs')
await bundle('packages/kiro-adapter/dist/builder-tool-guard-node.js', 'bin/guard.mjs')
await bundle('packages/runtime/dist/index.js', 'bin/runtime.cjs')
await bundle('scripts/project-tools.mjs', 'bin/project-tools.mjs')
await bundle('packages/frontend-client/dist/node.js', 'bin/client.cjs')
await bundle('examples/kiro-panel/src/core-lifecycle.cjs', 'bin/lifecycle.cjs')
await bundle('examples/kiro-panel/src/frontend-host.cjs', 'bin/frontend-host.cjs', {
  alias: {
    '@vibe-helper/frontend-client/node': join(repository, 'packages/frontend-client/dist/node.js'),
    '@vibe-helper/application/redaction': join(
      repository,
      'packages/application/dist/redaction.js',
    ),
    '@vibe-helper/kiro-adapter/builder-tool-guard': join(
      repository,
      'packages/kiro-adapter/dist/builder-tool-guard.js',
    ),
  },
})
await bundle('examples/kiro-panel/src/portable-extension.cjs', 'bin/extension.cjs', {
  alias: {
    '@vibe-helper/frontend-client/node': join(repository, 'packages/frontend-client/dist/node.js'),
    '@vibe-helper/frontend-client': join(repository, 'packages/frontend-client/dist/index.js'),
    '@vibe-helper/application/redaction': join(
      repository,
      'packages/application/dist/redaction.js',
    ),
    '@vibe-helper/kiro-adapter/builder-tool-guard': join(
      repository,
      'packages/kiro-adapter/dist/builder-tool-guard.js',
    ),
  },
})
await bundle('examples/kiro-panel/src/native-worker.cjs', 'bin/native-worker.cjs', {
  alias: {
    '@vibe-helper/frontend-client/node': join(repository, 'packages/frontend-client/dist/node.js'),
    '@vibe-helper/application/redaction': join(
      repository,
      'packages/application/dist/redaction.js',
    ),
    '@vibe-helper/kiro-adapter/builder-tool-guard': join(
      repository,
      'packages/kiro-adapter/dist/builder-tool-guard.js',
    ),
  },
})

async function copy(source, destination) {
  const info = await lstat(source)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('PACKAGE_SOURCE_FILE_UNSAFE')
  const path = join(output, destination)
  await mkdir(dirname(path), { recursive: true })
  await copyFile(source, path)
}
const requireStorage = createRequire(join(repository, 'packages/storage-sqlite/package.json'))
const sqliteRoot = dirname(await realpath(requireStorage.resolve('better-sqlite3/package.json')))
const sqlite = JSON.parse(await readFile(join(sqliteRoot, 'package.json'), 'utf8'))
if (sqlite.version !== '13.0.3') throw new Error('SQLITE_VERSION_UNVERIFIED')
async function sqliteLibrary(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) await sqliteLibrary(path)
    else if (item.name.endsWith('.js'))
      await copy(
        path,
        `node_modules/better-sqlite3/${relative(sqliteRoot, path).split(sep).join('/')}`,
      )
  }
}
await sqliteLibrary(join(sqliteRoot, 'lib'))
await copy(
  join(sqliteRoot, 'prebuilds/win32-x64.node'),
  'node_modules/better-sqlite3/prebuilds/win32-x64.node',
)
await writeFile(
  join(output, 'node_modules/better-sqlite3/package.json'),
  JSON.stringify({
    name: sqlite.name,
    version: sqlite.version,
    main: 'lib/index.js',
    license: sqlite.license,
  }),
)
await copy(join(sqliteRoot, 'LICENSE'), 'licenses/better-sqlite3-LICENSE')

// Drizzle is loaded through createRequire by the established storage adapter.
// Bundle its two public runtime entry points rather than shipping TS/types/dev tooling.
const drizzleRoot = dirname(await realpath(requireStorage.resolve('drizzle-orm')))
for (const [entry, file] of [
  ['better-sqlite3/index.cjs', 'sqlite.cjs'],
  ['better-sqlite3/migrator.cjs', 'migrator.cjs'],
])
  await bundle(relative(repository, join(drizzleRoot, entry)), `node_modules/drizzle-orm/${file}`)
await writeFile(
  join(output, 'node_modules/drizzle-orm/package.json'),
  JSON.stringify({
    name: 'drizzle-orm',
    version: '0.45.2',
    exports: { './better-sqlite3': './sqlite.cjs', './better-sqlite3/migrator': './migrator.cjs' },
  }),
)
const migrationRoot = join(repository, 'packages/storage-sqlite/drizzle')
for (const name of await readdir(migrationRoot))
  if (/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) await copy(join(migrationRoot, name), `drizzle/${name}`)
await copy(join(migrationRoot, 'meta/_journal.json'), 'drizzle/meta/_journal.json')
const promptVersions = {}
for (const name of ['discovery', 'builder', 'helper', 'evidence-analyst']) {
  const data = (
    await readFile(join(repository, 'docs/agent-prompts', `${name}.md`), 'utf8')
  ).replaceAll('\r\n', '\n')
  const version = data.match(/^> Prompt version: `([0-9]+\.[0-9]+\.[0-9]+)`$/m)?.[1]
  if (!version) throw new Error('PROMPT_VERSION_MISSING')
  promptVersions[name] = version
  await mkdir(join(output, 'agent-prompts'), { recursive: true })
  await writeFile(join(output, 'agent-prompts', `${name}.md`), data)
}
// This build runs with the exact development Node distribution already verified in W1.
if (sha256(await readFile(process.execPath)) !== MANAGED_NODE.sha256)
  throw new Error('NODE_DISTRIBUTION_UNVERIFIED')
// Some verified runtime caches contain node.exe without its distribution license.
// Reuse that binary and accept only the exact official v24.19.0 license as a sidecar.
const nodeLicense = process.env.VIBE_NODE_DISTRIBUTION_LICENSE
if (
  nodeLicense &&
  sha256(await readFile(nodeLicense)) !==
    '148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5'
)
  throw new Error('NODE_DISTRIBUTION_LICENSE_UNVERIFIED')
await copy(
  nodeLicense ? resolve(nodeLicense) : join(dirname(process.execPath), 'LICENSE'),
  'licenses/node-LICENSE',
)
const licenses = new Map()
for (const input of inputs) {
  if (!input.includes(`${sep}node_modules${sep}`)) continue
  let directory = dirname(input)
  while (directory.startsWith(repository) && directory !== repository) {
    try {
      const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      if (pkg.name && pkg.version) {
        licenses.set(`${pkg.name}@${pkg.version}`, { directory, pkg })
        break
      }
    } catch {
      /* Nested source directory, ascend to the dependency root. */
    }
    directory = dirname(directory)
  }
}
const notices = []
for (const [identity, { directory, pkg }] of licenses) {
  const names = (await readdir(directory)).filter((name) =>
    /^(license|licence|copying|notice)(\.|$)/i.test(name),
  )
  if (!names.length && identity === 'drizzle-orm@0.45.2') {
    await copy(
      join(repository, 'scripts/vendor-licenses/drizzle-orm-0.45.2-LICENSE'),
      'licenses/drizzle-orm@0.45.2-LICENSE',
    )
  } else if (!names.length) throw new Error(`RUNTIME_LICENSE_MISSING_${pkg.name}`)
  for (const name of names)
    await copy(join(directory, name), `licenses/${identity.replaceAll('/', '__')}-${name}`)
  notices.push({ name: pkg.name, version: pkg.version, license: pkg.license })
}
await writeFile(
  join(output, 'licenses/dependencies.json'),
  JSON.stringify(
    notices.sort((a, b) => a.name.localeCompare(b.name)),
    null,
    2,
  ),
)
const files = {}
async function inventory(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) await inventory(path)
    else {
      const name = relative(output, path).split(sep).join('/')
      const content = await readFile(path)
      if (
        /\.(map|ts|sqlite|db|log)$|(^|\/)(src|test|tests|\.git|\.env)(\/|$)/.test(name) ||
        (name.endsWith('.node') &&
          name !== 'node_modules/better-sqlite3/prebuilds/win32-x64.node') ||
        content.includes(Buffer.from(repository)) ||
        content.includes(Buffer.from(repository.replaceAll('\\', '\\\\'))) ||
        /(?:\/Users\/|[A-Za-z]:\\\\Users\\\\)[A-Za-z0-9_-]+/.test(content.toString('utf8'))
      )
        throw new Error('PORTABLE_ASSET_LEAK')
      files[name] = { sha256: sha256(content), bytes: content.length }
    }
  }
}
await inventory(output)
await writeFile(
  join(output, 'manifest.json'),
  `${JSON.stringify({ schemaVersion: 1, target, nodeVersions: CORE_NODE_VERSIONS, promptVersions, files }, null, 2)}\n`,
)
await loadCoreResources(output)
console.log(
  JSON.stringify({
    status: 'PORTABLE_CORE_READY',
    target,
    files: Object.keys(files).length,
    bytes:
      Object.values(files).reduce((n, file) => n + file.bytes, 0) +
      (await lstat(join(output, 'manifest.json'))).size,
    output: relative(repository, output),
  }),
)
