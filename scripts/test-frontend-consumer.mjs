// Independent npm / TS 5.4 / CJS consumer. Leaves its synthetic temp directory.
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
const execute = promisify(execFile)
const directory = await mkdtemp(join(tmpdir(), 'vibe-helper-sdk-consumer-'))
const tarball = resolve('dist/vibe-helper-frontend-client-0.1.0.tgz')
await writeFile(
  join(directory, 'package.json'),
  JSON.stringify({
    private: true,
    dependencies: {
      '@vibe-helper/frontend-client': `file:${tarball}`,
      typescript: '5.4.5',
      '@types/node': '18.19.130',
      esbuild: '0.21.5',
    },
  }),
)
await writeFile(
  join(directory, 'consumer.cts'),
  `import { LocalCoreClient, LocalProgramAdapter, LOCAL_PROTOCOL_VERSION, type ProjectSessionSnapshot } from '@vibe-helper/frontend-client';
import { connectLocalCore } from '@vibe-helper/frontend-client/node';
export async function consume(file: string) {
  const client: LocalCoreClient = await connectLocalCore(file);
  const projects = await client.listProjects();
  const snapshot: ProjectSessionSnapshot | null = projects.projects[0] ? await client.restoreProject(projects.projects[0].project.id) : null;
  const run = await client.startRun({kind: 'DISCOVERY', projectId: 'project_id', discoverySessionId: 'discovery_session_id', expectedSessionRevision: 1, idempotencyKey: 'idem_id', phase: 'PREVIEW'});
  const adapter = new LocalProgramAdapter(client, () => snapshot!.project.id);
  const handle = await adapter.startTurn({agent: 'helper', text: 'Explain', allowWorkStream: false}, e => { if(e.kind === 'message_chunk') e.text.toUpperCase(); });
  handle.cancel();
  return { run, snapshot, LOCAL_PROTOCOL_VERSION, adapter };
}
`,
)
await writeFile(
  join(directory, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'Node16',
      moduleResolution: 'Node16',
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      esModuleInterop: true,
    },
    include: ['consumer.cts'],
  }),
)
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
// npm.cmd needs cmd on Windows; arguments here are fixed literals, never user messages.
await execute(
  npm,
  [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--cache',
    join(directory, 'npm-cache'),
  ],
  { cwd: directory, timeout: 120_000, maxBuffer: 1_048_576, shell: process.platform === 'win32' },
)
await execute(
  process.execPath,
  [join(directory, 'node_modules/typescript/bin/tsc'), '-p', directory],
  { cwd: directory, timeout: 60_000, maxBuffer: 2_097_152 },
)
await execute(
  process.execPath,
  [
    '--input-type=commonjs',
    '-e',
    "const c=require('@vibe-helper/frontend-client'); const n=require('@vibe-helper/frontend-client/node'); if(c.LOCAL_PROTOCOL_VERSION!==1 || typeof n.connectLocalCore!=='function') process.exit(1);",
  ],
  { cwd: directory, timeout: 10_000 },
)
await execute(
  process.execPath,
  [
    join(directory, 'node_modules/esbuild/bin/esbuild'),
    'consumer.cts',
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--outfile=consumer.cjs',
  ],
  { cwd: directory, timeout: 10_000 },
)
const packageJson = await readFile(
  join(directory, 'node_modules/@vibe-helper/frontend-client/package.json'),
  'utf8',
)
if (/workspace:|better-sqlite3|@vibe-helper\/application/.test(packageJson))
  throw new Error('SDK_NOT_STANDALONE')
if (process.argv[2]) {
  await execute(
    process.execPath,
    [
      '-e',
      `
    const {connectLocalCore}=require('@vibe-helper/frontend-client/node');
    (async()=>{const client=await connectLocalCore(process.argv[1]);await client.health();await client.listProjects()})()
      .catch(()=>{process.exitCode=1});
  `,
      resolve(process.argv[2]),
    ],
    { cwd: directory, timeout: 20_000 },
  )
}
console.log(
  JSON.stringify({
    status: 'PASSED',
    directory,
    typescript: '5.4.5',
    cjs: true,
    esbuild: '0.21.5',
    strictLibraryCheck: true,
    liveCoreRead: Boolean(process.argv[2]),
  }),
)
