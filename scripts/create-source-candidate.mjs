// Private, allowlisted source snapshot, never a release/publication operation.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const backendRoots = new Set([
  '.gitattributes',
  '.gitignore',
  '.node-version',
  '.npmrc',
  'AGENTS.md',
  'PROJECT_BRIEF.md',
  'README.md',
  'app.json',
  'biome.json',
  'package.json',
  'playwright.config.ts',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.json',
  'tsconfig.package.json',
  'vitest.config.ts',
])
const frontendRoots = new Set([
  '.gitattributes',
  '.gitignore',
  'README.md',
  'esbuild.mjs',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vitest.config.ts',
])
const backendDocuments = new Set([
  'docs/SPEC.md',
  'docs/ARCHITECTURE.md',
  'docs/DECISIONS.md',
  'docs/TASKS.md',
  'docs/SUBMISSION.md',
  'docs/SUBMISSION_DEMO_AND_SOURCE.md',
  'docs/SUBMISSION_READINESS_20260928.md',
  'docs/SUBMISSION_READINESS_20260929.md',
  'docs/FRONTEND_HANDOFF.md',
  'docs/DOWNLOAD_GUIDE.md',
  'docs/MAC_VSIX.md',
  'docs/WINDOWS_VSIX.md',
  'docs/spikes/T19_FRONTEND_HANDOFF_UPDATE_20260929_2.json',
  'docs/T20_AUDIT_20260928.md',
  'docs/FRONTEND_MAC_PROGRESS_20260928.md',
  'docs/spikes/t19-discovery-quality-rejected/discovery-v1.3.7.md',
  'docs/spikes/t19-discovery-quality-rejected/discovery-v1.3.8.md',
  'docs/spikes/t19-helper-quality-experiments/helper-v1.2.1.md',
  'docs/spikes/t19-analyst-prompt-experiments/README.md',
  'docs/spikes/t19-analyst-prompt-experiments/evidence-analyst-v1.0.8.md',
  'docs/spikes/t19-analyst-prompt-experiments/evidence-analyst-v1.0.9.md',
])
// Untracked files are never discovered recursively or accepted automatically.
const backendAdditions = [
  ...backendDocuments,
  'examples/program-macos-dev/README.md',
  'examples/program-macos-dev/extension.cjs',
  'examples/program-macos-dev/isolated-environment.cjs',
  'examples/program-macos-dev/model-admission.cjs',
  'examples/program-macos-dev/test/isolated-environment.test.cjs',
  'examples/program-macos-dev/test/model-admission.test.cjs',
  'packages/application/test/redaction-boundary.integration.test.ts',
  'packages/application/test/redaction-stream.test.ts',
  'scripts/prepare-program-macos-dev.mjs',
  'scripts/preview-program-accessibility.mjs',
  'scripts/create-source-candidate.mjs',
  'scripts/create-source-candidate.test.mjs',
  'scripts/frontend-handoff-config.mjs',
  'tests/unit/frontend-handoff-config.test.ts',
  'tests/unit/frontend-handoff-update.test.ts',
  'examples/frontend-handoff/program-managed-20260929.json',
]
const frontendAdditions = [
  'src/core/flow/flow-limits.ts',
  'src/core/runtime-errors.ts',
  'test/evidence-retry.test.ts',
  'test/flow-input-limits.test.ts',
  'test/flow-messages.test.ts',
  'test/privacy-notice.test.ts',
  'test/runtime-errors.test.ts',
]

export function safeName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length < 500 &&
    !/[\\:]/.test(name) &&
    !Array.from(name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) &&
    !name
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          /^(?:\.git|\.data|\.kiro|\.codex|\.local-experiments|node_modules|dist|dist-types|portable|releases|\.pnpm-store)$/.test(
            part,
          ),
      ) &&
    !/(?:^|\/)(?:\.env(?:\..*)?|connection\.json|credit-observation\.json|model-admissions[^/]*)$/.test(
      name,
    ) &&
    !/\.(?:db|sqlite|sqlite3|log|jsonl|vsix|zip|tgz|tsbuildinfo)(?:-(?:wal|shm))?$/.test(name)
  )
}

export function selectedSource(side, name) {
  if (!safeName(name)) return false
  if (side === 'backend')
    return (
      backendRoots.has(name) ||
      backendDocuments.has(name) ||
      /^(?:apps|packages|tests|scripts|docs\/agent-prompts)\//.test(name) ||
      /^examples\/(?:kiro-panel|kiro-native-host|frontend-handoff|program-macos-dev)\//.test(name)
    )
  if (side === 'frontend')
    return frontendRoots.has(name) || /^(?:src|test|media|vendor)\//.test(name)
  return false
}

export function documentCopy(name, data, localHome = homedir()) {
  if (!name.endsWith('.md')) return data
  let value = data.toString('utf8')
  for (const home of new Set([
    localHome,
    localHome.replaceAll('\\', '/'),
    localHome.replaceAll('\\', '\\\\'),
  ]))
    value = value.split(home).join('<LOCAL_HOME>')
  return Buffer.from(
    value
      .replace(/\/Users\/[^/\r\n`]+(?=\/)/g, '<LOCAL_HOME>')
      .replace(
        /\/private\/tmp\/vibe-helper-macos-core-([A-Za-z0-9]{8})(?=\/|[`\s]|$)/g,
        (value, suffix) => (suffix === 'XXXXXXXX' ? value : '<PRIVATE_VERIFICATION_ROOT>'),
      ),
  )
}

export function inspectContent(name, data, localHome = homedir()) {
  const value = data.toString('utf8')
  for (const home of new Set([
    localHome,
    localHome.replaceAll('\\', '/'),
    localHome.replaceAll('\\', '\\\\'),
  ]))
    if (value.includes(`${home}/`) || value.includes(`${home}\\`))
      throw new Error(`SOURCE_LOCAL_PATH:${name}`)
  // Exactly two reviewed alphabet-sequence fixtures, never all tokens in tests.
  const reviewed =
    name === 'packages/application/test/redaction-stream.test.ts'
      ? new Set([
          '76f476d0bf47418551fdd8ae355d42706b642301bb4172204a1ad4de12c4b840',
          '457643f44d19aed85fd756aa50cc0cd6b57376d4e8f5a72f9f85972a522002a3',
        ])
      : new Set()
  const credentials = [
    ...value.matchAll(
      /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16})\b/g,
    ),
  ]
  if (
    credentials.some(([credential]) => !reviewed.has(sha256(credential))) ||
    /^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----$/m.test(value)
  )
    throw new Error(`SOURCE_SECRET_REVIEW_REQUIRED:${name}`)
  return { reviewedSyntheticCredentialHits: credentials.length }
}

export async function copySourceFile(root, target, name) {
  if (!safeName(name)) throw new Error('SOURCE_NAME_DENIED')
  const source = join(root, name)
  const info = await lstat(source)
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1 ||
    info.size > 8 * 1024 * 1024 ||
    (await realpath(source)) !== source
  )
    throw new Error(`SOURCE_FILE_DENIED:${name}`)
  const original = await readFile(source)
  const after = await lstat(source)
  if (info.ino !== after.ino || info.mtimeMs !== after.mtimeMs || original.length !== info.size)
    throw new Error(`SOURCE_CHANGED_DURING_COPY:${name}`)
  const data = documentCopy(name, original)
  const privacy = inspectContent(name, data)
  const destination = join(target, name)
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
  await writeFile(destination, data, { flag: 'wx', mode: 0o600 })
  return {
    name,
    bytes: data.length,
    sha256: sha256(data),
    sourceSha256: sha256(original),
    documentPathsGeneralized: !original.equals(data),
    ...privacy,
  }
}

async function repositorySnapshot(side, source, destination) {
  const root = await realpath(source)
  const git = (args) =>
    execute('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], {
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
  const tracked = (await git(['ls-files', '-z'])).stdout.split('\0').filter(Boolean)
  const additions = side === 'backend' ? backendAdditions : frontendAdditions
  const names = [
    ...new Set([...tracked.filter((name) => selectedSource(side, name)), ...additions]),
  ].sort()
  if (names.length > 4096) throw new Error('SOURCE_FILE_LIMIT')
  const files = []
  let bytes = 0
  for (const name of names) {
    const item = await copySourceFile(root, destination, name)
    bytes += item.bytes
    if (bytes > 128 * 1024 * 1024) throw new Error('SOURCE_SIZE_LIMIT')
    files.push(item)
  }
  return {
    baseCommit: (await git(['rev-parse', 'HEAD'])).stdout.trim(),
    workingTreeChangesIncluded: (await git(['status', '--porcelain'])).stdout.length > 0,
    files,
  }
}

export async function createSourceCandidate(backend, frontend) {
  if (process.version !== 'v24.19.0') throw new Error('PINNED_NODE_REQUIRED')
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'vibe-helper-source-candidate-')))
  const root = join(parent, 'source')
  await mkdir(root, { mode: 0o700 })
  const repositories = {}
  for (const [side, source] of [
    ['backend', backend],
    ['frontend', frontend],
  ])
    repositories[side] = await repositorySnapshot(side, source, join(root, side))
  const manifest = {
    schemaVersion: 1,
    status: 'PRIVATE_REVIEW_CANDIDATE_NOT_RELEASE',
    createdAt: new Date().toISOString(),
    toolchain: { node: '24.19.0', pnpm: '11.13.1' },
    modelCalls: 0,
    published: false,
    windowsInstallersIncluded: false,
    privacyScreen: 'Known local-home and high-confidence key patterns only; not complete DLP.',
    remainingGates: [
      'Independent source verification',
      'Human pilot and baseline or approved limitation',
      'Model semantic quality limitations',
      'Official submission format and final user approval',
    ],
    repositories,
  }
  await writeFile(join(root, 'SOURCE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  await writeFile(
    join(root, 'README.md'),
    `# Vibe Helper — private source review candidate

This is NOT a release, supported Mac installer, Windows kit, or a submitted entry.
Current uncommitted changes are included; base commits alone do not reproduce it.
SOURCE_MANIFEST.json records each selected file's SHA-256 and the source SHA before
document-only path generalization. Runtime source and tests are not sanitized.
Git history, private data, installed dependencies, Windows installers and unrelated
experiments are excluded. Some historical documentation links are intentionally
not included. Source-only Windows modules remain where required by shared tests.

Read backend/docs/SUBMISSION.md and backend/docs/T20_AUDIT_20260928.md for verified
scope and limitations. Preserve LICENSE/notice files when distributing dependencies;
this candidate contains lockfiles and the project's own vendored SDK, not installed
third-party dependency trees. Nothing here grants a new redistribution license.

Select Node 24.19.0 and pnpm 11.13.1; do not bypass preflight.
In backend: pnpm install --frozen-lockfile; pnpm check; pnpm panel:build.
In frontend: npm ci --ignore-scripts; npm run typecheck; npm test; npm run build.
Then from backend: node scripts/test-program-consumer.mjs ../frontend.
Automated commands are model-0. Real native tests require separately approved
Trust, the exact attested host and a fresh credit observation; see the Mac harness
README. No private connection, approval, token or database is shipped here.

The manifest identifies a candidate, not the outcome of running these commands.
Verification receipts and a final archive, if prepared, are separate artifacts.
`,
    { flag: 'wx', mode: 0o600 },
  )
  return {
    status: manifest.status,
    parent,
    root,
    files: Object.values(repositories).reduce((count, item) => count + item.files.length, 0),
    manifestSha256: sha256(await readFile(join(root, 'SOURCE_MANIFEST.json'))),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('FRONTEND_CHECKOUT_REQUIRED')
  const backend = dirname(dirname(fileURLToPath(import.meta.url)))
  console.log(JSON.stringify(await createSourceCandidate(backend, resolve(process.argv[2]))))
}
