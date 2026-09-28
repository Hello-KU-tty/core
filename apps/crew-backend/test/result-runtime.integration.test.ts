import { mkdir, mkdtemp, open, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ResultRuntimeSupervisor } from '../src/result-runtime.js'

const projectId = 'project_00000000-0000-4000-8000-000000000001'
const descriptor = {
  schemaVersion: 1 as const,
  correlationId: 'corr_00000000-0000-4000-8000-000000000002',
  projectId,
  workspacePath: `projects/${projectId}`,
  status: 'READY' as const,
}
const supervisors: ResultRuntimeSupervisor[] = []

afterEach(async () => {
  await Promise.all(supervisors.splice(0).map((supervisor) => supervisor.close()))
})

async function workspaceFixture(): Promise<{
  readonly root: string
  readonly workspace: string
  readonly supervisor: ResultRuntimeSupervisor
}> {
  const root = await mkdtemp(join(tmpdir(), 'vibe-helper-result-root-'))
  const workspace = join(root, descriptor.workspacePath)
  await mkdir(join(workspace, '.vibe-helper'), { recursive: true })
  await mkdir(join(workspace, 'dist'), { recursive: true })
  const supervisor = await ResultRuntimeSupervisor.create(root, { startupTimeoutMs: 3_000 })
  supervisors.push(supervisor)
  return { root, workspace, supervisor }
}

describe('generated result runtime supervisor', () => {
  it('reports tool preparation failure without launching or exposing private diagnostics', async () => {
    const { root, workspace } = await workspaceFixture()
    await writeFile(
      join(workspace, '.vibe-helper', 'result.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'WEB',
        entry: 'dist/server.mjs',
        healthPath: '/',
      }),
    )
    await writeFile(join(workspace, 'dist', 'server.mjs'), "throw new Error('must not run')\n")
    const supervisor = await ResultRuntimeSupervisor.create(root, {
      projectToolchain: async () => {
        throw new Error('private diagnostic must not escape')
      },
    })
    supervisors.push(supervisor)
    await expect(supervisor.launch(descriptor)).rejects.toMatchObject({
      code: 'RESULT_PROJECT_RUNTIME_UNAVAILABLE',
      message:
        'Generated app runtime could not be prepared. Restore its verified tools before retrying.',
    })
  })

  it('runs one strict compiled web entry on loopback and reuses the healthy process', async () => {
    const { workspace, supervisor } = await workspaceFixture()
    await writeFile(
      join(workspace, '.vibe-helper', 'result.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'WEB',
        entry: 'dist/server.mjs',
        healthPath: '/health',
        openPath: '/app',
      }),
    )
    await writeFile(
      join(workspace, 'dist', 'server.mjs'),
      [
        "import { createServer } from 'node:http'",
        'const host = process.env.HOST',
        'const port = Number(process.env.PORT)',
        "createServer((_request, response) => { response.writeHead(200); response.end('campus-drop-ok') }).listen(port, host)",
      ].join('\n'),
    )

    const first = await supervisor.launch(descriptor)
    expect(first).toMatchObject({ status: 'RUNNING', reused: false })
    if (first.status !== 'RUNNING') throw new Error('Expected running result')
    expect(first.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/app$/)
    await expect((await fetch(first.url)).text()).resolves.toBe('campus-drop-ok')

    const second = await supervisor.launch(descriptor)
    expect(second).toMatchObject({ status: 'RUNNING', url: first.url, reused: true })
  })

  it('rejects an entry symlink that escapes the generated workspace', async () => {
    const { workspace, supervisor } = await workspaceFixture()
    const outside = await mkdtemp(join(tmpdir(), 'vibe-helper-result-outside-'))
    await writeFile(join(outside, 'server.mjs'), "throw new Error('must not run')\n")
    await symlink(outside, join(workspace, 'escape'), 'junction')
    await writeFile(
      join(workspace, '.vibe-helper', 'result.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'WEB',
        entry: 'escape/server.mjs',
        healthPath: '/',
      }),
    )

    await expect(supervisor.launch(descriptor)).rejects.toMatchObject({
      code: 'RESULT_PATH_ESCAPE',
    })
  })

  it('restarts the owned result when a compiled dependency changes after an upgrade', async () => {
    const { workspace, supervisor } = await workspaceFixture()
    await mkdir(join(workspace, 'dist', 'web'))
    await mkdir(join(workspace, 'dist', 'domain'))
    await writeFile(
      join(workspace, '.vibe-helper', 'result.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'WEB',
        entry: 'dist/web/server.mjs',
        healthPath: '/',
      }),
    )
    const dependency = join(workspace, 'dist', 'domain', 'value.mjs')
    await writeFile(dependency, 'export const value = "before-upgrade"')
    await writeFile(
      join(workspace, 'dist', 'web', 'server.mjs'),
      [
        "import { createServer } from 'node:http'",
        "import { value } from '../domain/value.mjs'",
        'createServer((_q, r) => r.end(value)).listen(Number(process.env.PORT), process.env.HOST)',
      ].join('\n'),
    )
    const first = await supervisor.launch(descriptor)
    if (first.status !== 'RUNNING') throw new Error('Expected running result')
    await expect((await fetch(first.url)).text()).resolves.toBe('before-upgrade')
    await writeFile(dependency, 'export const value = "after-upgrade"')
    const next = await supervisor.launch(descriptor)
    expect(next).toMatchObject({ status: 'RUNNING', reused: false })
    if (next.status !== 'RUNNING') throw new Error('Expected running result')
    await expect((await fetch(next.url)).text()).resolves.toBe('after-upgrade')
    await expect(supervisor.launch(descriptor)).resolves.toMatchObject({
      reused: true,
      url: next.url,
    })
  })

  it('revalidates the manifest before reusing a healthy result', async () => {
    const { workspace, supervisor } = await workspaceFixture()
    const manifest = join(workspace, '.vibe-helper', 'result.json')
    await writeFile(
      manifest,
      JSON.stringify({ schemaVersion: 1, kind: 'WEB', entry: 'dist/server.mjs', healthPath: '/' }),
    )
    await writeFile(
      join(workspace, 'dist', 'server.mjs'),
      "import {createServer} from 'node:http'; createServer((_q,r)=>r.end('ok')).listen(Number(process.env.PORT),process.env.HOST)",
    )
    await supervisor.launch(descriptor)
    await writeFile(manifest, '{invalid')
    await expect(supervisor.launch(descriptor)).rejects.toMatchObject({
      code: 'RESULT_MANIFEST_INVALID',
    })
  })

  it.each(['symlink', 'oversized'] as const)(
    'rejects %s compiled content before starting it',
    async (kind) => {
      const { workspace, supervisor } = await workspaceFixture()
      await writeFile(
        join(workspace, '.vibe-helper', 'result.json'),
        JSON.stringify({
          schemaVersion: 1,
          kind: 'WEB',
          entry: 'dist/server.mjs',
          healthPath: '/',
        }),
      )
      await writeFile(join(workspace, 'dist', 'server.mjs'), "throw new Error('must not run')")
      if (kind === 'symlink')
        await symlink(join(workspace, 'dist', 'server.mjs'), join(workspace, 'dist', 'alias.mjs'))
      else {
        const file = await open(join(workspace, 'dist', 'too-large.bin'), 'wx')
        try {
          await file.truncate(64 * 1_024 * 1_024 + 1)
        } finally {
          await file.close()
        }
      }
      await expect(supervisor.launch(descriptor)).rejects.toMatchObject({
        code: 'RESULT_CONTENT_INVALID',
      })
    },
  )

  it('restarts after dependency lock changes but ignores unrelated source and node_modules metadata', async () => {
    const { workspace, supervisor } = await workspaceFixture()
    await writeFile(
      join(workspace, '.vibe-helper', 'result.json'),
      JSON.stringify({ schemaVersion: 1, kind: 'WEB', entry: 'dist/server.mjs', healthPath: '/' }),
    )
    await writeFile(
      join(workspace, 'dist', 'server.mjs'),
      "import {createServer} from 'node:http'; createServer((_q,r)=>r.end('ok')).listen(Number(process.env.PORT),process.env.HOST)",
    )
    await writeFile(join(workspace, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    const first = await supervisor.launch(descriptor)
    if (first.status !== 'RUNNING') throw new Error('Expected running result')
    await writeFile(join(workspace, 'source.ts'), 'unused source change')
    await mkdir(join(workspace, 'dist', 'node_modules'))
    await writeFile(
      join(workspace, 'dist', 'node_modules', 'metadata.txt'),
      'not a compiled artifact',
    )
    await expect(supervisor.launch(descriptor)).resolves.toMatchObject({
      reused: true,
      url: first.url,
    })
    await writeFile(join(workspace, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n# new dependency\n')
    await expect(supervisor.launch(descriptor)).resolves.toMatchObject({ reused: false })
  })
})
