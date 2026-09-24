import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

const execute = promisify(execFile)

it('builds identical complete Agent configurations from LF and Windows CRLF prompts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibe-crew-line-endings-'))
  const configurations: string[][] = []
  for (const ending of ['\n', '\r\n']) {
    const workspace = join(root, ending === '\n' ? 'lf' : 'crlf')
    await mkdir(join(workspace, 'scripts'), { recursive: true })
    await mkdir(join(workspace, 'docs', 'agent-prompts'), { recursive: true })
    await copyFile(
      resolve('scripts/build-crew-agents.mjs'),
      join(workspace, 'scripts/build-crew-agents.mjs'),
    )
    for (const name of ['discovery', 'builder', 'helper', 'evidence-analyst']) {
      const text = await readFile(resolve(`docs/agent-prompts/${name}.md`), 'utf8')
      await writeFile(
        join(workspace, 'docs', 'agent-prompts', `${name}.md`),
        text.replace(/\r\n/g, '\n').replace(/\n/g, ending),
      )
    }
    await execute(process.execPath, [join(workspace, 'scripts/build-crew-agents.mjs')], {
      cwd: workspace,
      timeout: 5_000,
      windowsHide: true,
    })
    const files = (await readdir(join(workspace, 'agents'))).sort()
    expect(files).toHaveLength(9)
    configurations.push(
      await Promise.all(files.map((file) => readFile(join(workspace, 'agents', file), 'utf8'))),
    )
  }
  expect(configurations[1]).toEqual(configurations[0])
})
