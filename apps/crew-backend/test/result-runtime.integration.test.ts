import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
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
    await symlink(outside, join(workspace, 'escape'))
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
})
