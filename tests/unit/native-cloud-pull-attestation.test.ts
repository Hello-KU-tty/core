import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  cloudStoreHash,
  parseCloudMessages,
  attestOwnedCloudPull,
} = require('../../examples/kiro-native-host/native-cloud-pull-attestation.cjs')

const OLD = '2026-09-14T16:00:00.000Z'
const NEW = '2026-09-14T17:00:00.000Z'
const now = Date.parse(NEW)

it('uses case-insensitive Windows session buckets while preserving POSIX case', () => {
  if (process.platform === 'win32') {
    expect(cloudStoreHash('C:\\Probe Space\\한글')).toBe(cloudStoreHash('c:/probe space/한글/'))
  } else {
    expect(cloudStoreHash('/tmp/Probe')).not.toBe(cloudStoreHash('/tmp/probe'))
  }
})

function pair(id: string, timestamp = NEW) {
  const call = {
    timestamp,
    payload: {
      type: 'tool_call',
      toolCallId: id,
      executionId: `exec-${id}`,
      toolName: 'fetch_cloud_config',
      actionType: 'fetch_cloud_config',
      args: { toolName: 'fetch_cloud_config' },
      status: 'completed',
      kind: 'other',
    },
  }
  const result = {
    timestamp,
    payload: {
      type: 'tool_result',
      toolCallId: id,
      executionId: `exec-${id}`,
      success: true,
      content: JSON.stringify({ kind: 'notEnabled', retracted: false }),
    },
  }
  return [call, result]
}

function lines(entries: object[]) {
  return `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`
}

it('requires a completed cloud pull from the current session/new, even for reused empty sessions', () => {
  expect(() => parseCloudMessages(lines([...pair('old', OLD)]), now)).toThrow(
    'NATIVE_CLOUD_PENDING',
  )
  expect(parseCloudMessages(lines([...pair('old', OLD), ...pair('new')]), now)).toBe(true)
  expect(() => parseCloudMessages(lines([pair('new')[0]]), now)).toThrow('NATIVE_CLOUD_PENDING')
  expect(() => parseCloudMessages(lines([...pair('new')]).slice(0, -1), now)).toThrow(
    'NATIVE_CLOUD_PENDING',
  )
  expect(() => parseCloudMessages('{broken}\n', now)).toThrow('NATIVE_CLOUD_MESSAGES_INVALID')
})

it('rejects model turns, other actions, unsafe cloud results, and mismatched completion', () => {
  expect(() =>
    parseCloudMessages(lines([...pair('new'), { timestamp: NEW, payload: { type: 'user' } }]), now),
  ).toThrow('NATIVE_CLOUD_MODEL_STARTED')
  expect(() =>
    parseCloudMessages(
      lines([
        ...pair('new'),
        { timestamp: NEW, payload: { type: 'tool_call', toolName: 'other' } },
      ]),
      now,
    ),
  ).toThrow('NATIVE_CLOUD_ACTION_UNVERIFIED')
  const badResult = pair('new')
  ;(badResult[1] as { payload: { content: string } }).payload.content = JSON.stringify({
    kind: 'synced',
    downloaded: 1,
  })
  expect(() => parseCloudMessages(lines(badResult), now)).toThrow('NATIVE_CLOUD_RESULT_UNVERIFIED')
  const mismatch = pair('new')
  ;(mismatch[1] as { payload: { executionId: string } }).payload.executionId = 'different'
  expect(() => parseCloudMessages(lines(mismatch), now)).toThrow('NATIVE_CLOUD_ACTION_MISMATCH')
})

it('binds the terminal action to the exact owned session directory and absent cloud cache', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'vibe-cloud-attest-')))
  const workspace = join(root, 'workspace')
  const sessionsRoot = join(root, 'sessions')
  const sessionId = 'sess_00000000-0000-4000-8000-000000000001'
  const directory = join(sessionsRoot, cloudStoreHash(workspace), sessionId)
  mkdirSync(workspace)
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    join(directory, 'session.json'),
    JSON.stringify({
      id: sessionId,
      workspacePaths: [workspace],
      rootPaths: [workspace],
    }),
  )
  writeFileSync(join(directory, 'messages.jsonl'), lines([...pair('current')]))
  const configRoot = join(root, 'cloud-cache', 'user', 'config')
  await expect(
    attestOwnedCloudPull(sessionId, workspace, now, sessionsRoot, configRoot),
  ).resolves.toBe(true)
  writeFileSync(
    join(directory, 'session.json'),
    JSON.stringify({ id: sessionId, workspacePaths: [join(root, 'another-workspace')] }),
  )
  await expect(
    attestOwnedCloudPull(sessionId, workspace, now, sessionsRoot, configRoot),
  ).rejects.toThrow('NATIVE_CLOUD_SESSION_SCOPE_MISMATCH')
  writeFileSync(
    join(directory, 'session.json'),
    JSON.stringify({ id: sessionId, workspacePaths: [workspace], rootPaths: [workspace] }),
  )
  mkdirSync(configRoot, { recursive: true })
  await expect(
    attestOwnedCloudPull(sessionId, workspace, now, sessionsRoot, configRoot),
  ).rejects.toThrow('NATIVE_CLOUD_CONFIG_PRESENT')
})
