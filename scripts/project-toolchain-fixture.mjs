import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Explicit synthetic validation app; its source and tests are not learner Evidence.
export async function writeToolchainFixture(workspace) {
  await mkdir(join(workspace, 'src'), { recursive: true })
  await mkdir(join(workspace, '.vibe-helper'), { recursive: true })
  await writeFile(
    join(workspace, 'package.json'),
    JSON.stringify({
      name: 'vibe-w4-synthetic-app',
      version: '1.0.0',
      private: true,
      type: 'module',
      packageManager: 'pnpm@11.12.0',
      scripts: { build: 'tsc', test: 'node --test dist/test.js', smoke: 'node dist/smoke.js' },
      devDependencies: { typescript: '7.0.2', '@types/node': '24.13.3' },
    }),
  )
  await writeFile(
    join(workspace, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        types: ['node'],
        rootDir: 'src',
        outDir: 'dist',
        skipLibCheck: true,
      },
      include: ['src/**/*.ts'],
    }),
  )
  await writeFile(
    join(workspace, 'src/server.ts'),
    `import { createServer } from 'node:http'
const server = createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, node: process.versions.node, electron: process.versions.electron ?? null, selectedNode: process.execPath, secretLeaked: Boolean(process.env.VIBE_CORE_TOKEN), path: req.url })) })
server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => { const address = server.address(); if (typeof address !== 'string' && address) process.send?.({ port: address.port }) })
`,
  )
  await writeFile(
    join(workspace, 'src/test.ts'),
    `import { test } from 'node:test'
import assert from 'node:assert/strict'
test('real standalone Node and isolated environment', () => { assert.ok(['24.18.0','24.19.0'].includes(process.versions.node)); assert.equal(process.versions.electron, undefined); assert.equal(process.env.VIBE_CORE_TOKEN, undefined); assert.equal(process.env.ELECTRON_RUN_AS_NODE, undefined) })
`,
  )
  await writeFile(
    join(workspace, 'src/smoke.ts'),
    `import { fork } from 'node:child_process'
import assert from 'node:assert/strict'
const child = fork(new URL('./server.js', import.meta.url), [], { env: { ...process.env, HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore','ignore','ignore','ipc'] })
const timeout = setTimeout(() => { child.kill(); process.exitCode = 1 }, 10000)
try { const port = await new Promise<number>((resolve, reject) => { child.once('message', (message: {port:number}) => resolve(message.port)); child.once('error', reject); child.once('exit', () => reject(new Error('early exit'))) }); for (const path of ['/health','/']) { const response = await fetch('http://127.0.0.1:' + port + path); assert.equal(response.status, 200); const body = await response.json() as {ok:boolean,electron:unknown,secretLeaked:boolean}; assert.equal(body.ok,true); assert.equal(body.electron,null); assert.equal(body.secretLeaked,false) }; console.log('W4_HTTP_SMOKE_PASS') }
finally { clearTimeout(timeout); child.kill() }
`,
  )
  await writeFile(
    join(workspace, '.vibe-helper/result.json'),
    JSON.stringify({
      schemaVersion: 1,
      kind: 'WEB',
      entry: 'dist/server.js',
      healthPath: '/health',
      openPath: '/',
    }),
  )
}
