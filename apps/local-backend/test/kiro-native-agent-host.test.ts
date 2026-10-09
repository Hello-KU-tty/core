import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { openInMemorySqliteStorage } from '@vibe-helper/storage-sqlite'
import { describe, expect, it } from 'vitest'
import { ids } from '../../../packages/contracts/test/fixtures.js'
import { LocalAgentHost } from '../src/agent-host.js'

describe('Kiro-native CLI Agent host', () => {
  it('never starts a CLI Builder when the Builder is the learner Kiro chat', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibe-kiro-native-host-'))
    const policy = await WorkspacePathPolicy.create(root)
    const host = new LocalAgentHost({
      application: new ApplicationService({
        storage: await openInMemorySqliteStorage(),
        workspacePolicy: policy,
      }),
      policy,
      agentRoot: root,
      definitionsRoot: resolve(import.meta.dirname, '../../../agents'),
      guardPath: join(root, 'unused-guard.js'),
      executable: 'kiro-cli-not-called',
      model: 'auto',
      builderInHostChat: true,
    })
    host.setBaseUrl('http://127.0.0.1:1')
    await expect(
      host.invoke({
        mode: 'BUILDER',
        projectId: ids.project,
        correlationId: ids.correlation,
        taskId: ids.task,
        message: 'build',
        signal: new AbortController().signal,
        onEvent: () => {},
      }),
    ).rejects.toMatchObject({ code: 'BUILDER_RUNS_IN_HOST_CHAT' })
  })

  it.skipIf(process.platform === 'win32')(
    'writes the per-role model override into the CLI Agent definition',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'vibe-role-model-'))
      const capture = join(root, 'captured-definition.json')
      // A stand-in for kiro-cli that keeps the definition it was started with, then fails.
      const fakeCli = join(root, 'fake-kiro-cli')
      await writeFile(
        fakeCli,
        `#!/bin/sh\ncat "$PWD"/.kiro/agents/*.json > "${capture}"\nexit 1\n`,
        {
          mode: 0o700,
        },
      )
      const policy = await WorkspacePathPolicy.create(root)
      const host = new LocalAgentHost({
        application: new ApplicationService({
          storage: await openInMemorySqliteStorage(),
          workspacePolicy: policy,
        }),
        policy,
        agentRoot: root,
        definitionsRoot: resolve(import.meta.dirname, '../../../agents'),
        guardPath: join(root, 'unused-guard.js'),
        executable: fakeCli,
        model: 'claude-haiku-4.5',
        roleModels: { EVIDENCE_ANALYST: 'claude-sonnet-4.5' },
      })
      host.setBaseUrl('http://127.0.0.1:1')
      await expect(
        host.invoke({
          mode: 'EVIDENCE_ANALYST',
          projectId: ids.project,
          correlationId: ids.correlation,
          message: 'analyze',
          signal: new AbortController().signal,
          onEvent: () => {},
        }),
      ).rejects.toBeDefined()
      expect(JSON.parse(await readFile(capture, 'utf8')).model).toBe('claude-sonnet-4.5')
    },
  )
  it.skipIf(process.platform === 'win32')(
    'falls back to the next role model only when the account cannot use one',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'vibe-role-fallback-'))
      const tried = join(root, 'tried-models.txt')
      // A minimal ACP peer: it refuses claude-sonnet-5.5 like kiro-cli 2.28 and answers otherwise.
      const fakeCli = join(root, 'fake-kiro-cli')
      await writeFile(
        fakeCli,
        `#!${process.execPath}
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
const agent = args[args.indexOf('--agent') + 1]
const model = args[args.indexOf('--model') + 1]
appendFileSync(${JSON.stringify(tried)}, model + '\\n')
let buffer = ''
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index
  while ((index = buffer.indexOf('\\n')) >= 0) {
    const message = JSON.parse(buffer.slice(0, index))
    buffer = buffer.slice(index + 1)
    if (message.method === 'initialize') send({ id: message.id, result: { protocolVersion: 1, agentInfo: { version: 'fake' } } })
    else if (message.method === 'session/new') send({ id: message.id, result: { sessionId: 'sess-fake', modes: { currentModeId: agent }, models: { currentModelId: model } } })
    else if (message.method === 'session/prompt' && model === 'claude-sonnet-5.5') send({ id: message.id, error: { code: -32603, message: 'Internal error', data: "The model 'claude-sonnet-5.5' is not available. Please use '/model' to select a different model and try again." } })
    else if (message.method === 'session/prompt') send({ id: message.id, result: { stopReason: 'end_turn' } })
  }
})
`,
        { mode: 0o700 },
      )
      const policy = await WorkspacePathPolicy.create(root)
      const host = new LocalAgentHost({
        application: new ApplicationService({
          storage: await openInMemorySqliteStorage(),
          workspacePolicy: policy,
        }),
        policy,
        agentRoot: root,
        definitionsRoot: resolve(import.meta.dirname, '../../../agents'),
        guardPath: join(root, 'unused-guard.js'),
        executable: fakeCli,
        model: 'claude-haiku-4.5',
        roleModels: { EVIDENCE_ANALYST: ['claude-sonnet-5.5', 'auto'] },
      })
      host.setBaseUrl('http://127.0.0.1:1')
      const analyze = () =>
        host.invoke({
          mode: 'EVIDENCE_ANALYST',
          projectId: ids.project,
          correlationId: ids.correlation,
          message: 'analyze',
          signal: new AbortController().signal,
          onEvent: () => {},
        })
      await expect(analyze()).resolves.toMatchObject({ stopReason: 'end_turn' })
      expect((await readFile(tried, 'utf8')).trim().split('\n')).toEqual([
        'claude-sonnet-5.5',
        'auto',
      ])
      // The refused model is skipped for the rest of the process.
      await expect(analyze()).resolves.toMatchObject({ stopReason: 'end_turn' })
      expect((await readFile(tried, 'utf8')).trim().split('\n')).toEqual([
        'claude-sonnet-5.5',
        'auto',
        'auto',
      ])
    },
  )
})
