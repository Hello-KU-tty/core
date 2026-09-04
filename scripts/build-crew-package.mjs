import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packageRoot = join(workspaceRoot, 'dist', 'crew-package')

if (
  resolve(packageRoot) === resolve(workspaceRoot) ||
  !resolve(packageRoot).startsWith(`${resolve(workspaceRoot)}/dist/`)
) {
  throw new TypeError('Crew package output must stay inside the workspace dist directory')
}

await build({
  entryPoints: [join(workspaceRoot, 'apps', 'crew-backend', 'dist', 'main.js')],
  outfile: join(workspaceRoot, 'apps', 'crew-backend', 'dist', 'main.bundle.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['better-sqlite3'],
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
})

await build({
  entryPoints: [
    join(workspaceRoot, 'packages', 'kiro-adapter', 'dist', 'builder-tool-guard-node.js'),
  ],
  outfile: join(workspaceRoot, 'apps', 'crew-backend', 'dist', 'builder-tool-guard.bundle.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
})

await rm(packageRoot, { recursive: true, force: true })

const runtimeFiles = [
  ['agents/vibe-helper-discovery-preview.json', 'agents/vibe-helper-discovery-preview.json'],
  ['agents/vibe-helper-discovery-enrichment.json', 'agents/vibe-helper-discovery-enrichment.json'],
  ['app.json', 'app.json'],
  ['agents/vibe-helper-discovery-round.json', 'agents/vibe-helper-discovery-round.json'],
  ['agents/vibe-helper-discovery-merge.json', 'agents/vibe-helper-discovery-merge.json'],
  ['agents/vibe-helper-discovery-spec.json', 'agents/vibe-helper-discovery-spec.json'],
  [
    'agents/vibe-helper-discovery-spec-recovery.json',
    'agents/vibe-helper-discovery-spec-recovery.json',
  ],
  ['agents/vibe-helper-builder.json', 'agents/vibe-helper-builder.json'],
  ['agents/vibe-helper-helper.json', 'agents/vibe-helper-helper.json'],
  ['apps/crew-app/dist/index.mjs', 'ui/dist/index-0.2.1.mjs'],
  ['apps/crew-backend/dist/main.bundle.js', 'apps/crew-backend/dist/main.js'],
  [
    'apps/crew-backend/dist/builder-tool-guard.bundle.js',
    'apps/crew-backend/dist/builder-tool-guard.js',
  ],
]

for (const [source, destination] of runtimeFiles) {
  const outputPath = join(packageRoot, destination)
  await mkdir(dirname(outputPath), { recursive: true })
  await copyFile(join(workspaceRoot, source), outputPath)
}

await cp(
  join(workspaceRoot, 'packages', 'storage-sqlite', 'drizzle'),
  join(packageRoot, 'apps', 'crew-backend', 'drizzle'),
  { recursive: true },
)

const storageManifest = JSON.parse(
  await readFile(join(workspaceRoot, 'packages', 'storage-sqlite', 'package.json'), 'utf8'),
)
const sqliteVersion = storageManifest.dependencies?.['better-sqlite3']
const drizzleVersion = storageManifest.dependencies?.['drizzle-orm']
if (typeof sqliteVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(sqliteVersion)) {
  throw new TypeError('better-sqlite3 must use an exact version for the Crew runtime package')
}
if (typeof drizzleVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(drizzleVersion)) {
  throw new TypeError('drizzle-orm must use an exact version for the Crew runtime package')
}

const runtimeManifest = {
  name: 'vibe-helper-runtime',
  version: '0.2.1',
  private: true,
  type: 'module',
  engines: { node: '>=24 <27' },
  dependencies: {
    'better-sqlite3': sqliteVersion,
    'drizzle-orm': drizzleVersion,
  },
}
await writeFile(
  join(packageRoot, 'package.json'),
  `${JSON.stringify(runtimeManifest, null, 2)}\n`,
  { mode: 0o600 },
)

process.stdout.write(`Generated ${relative(workspaceRoot, packageRoot)}\n`)
