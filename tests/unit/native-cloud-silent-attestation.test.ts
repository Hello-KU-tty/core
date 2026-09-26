import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  attestSilentCloudLines,
  attestOwnedSilentCloudPull,
} = require('../../examples/kiro-native-host/native-cloud-silent-attestation.cjs')
const {
  cloudStoreHash,
} = require('../../examples/kiro-native-host/native-cloud-pull-attestation.cjs')
const own = 'sess_00000000-0000-4000-8000-000000000001'
const other = 'sess_00000000-0000-4000-8000-000000000002'
const now = Date.parse('2026-09-25T08:00:00.000Z')
const start = (id = own) =>
  `[KiroAgent] ACP session/new sessionId=${id} modeId=synthetic idempotent=false`
const cycle = [
  'cloudConfig.sync.reconcileStarted',
  'network.cloudConfig.getManifest.ok {"system":"network","durationMs":10}',
  'cloudConfig.manifest.notEnabled',
  'cloudConfig.pull.silent {"outcome":"notEnabled"}',
]
const lines = (messages: string[], time = now) =>
  `${messages
    .map((message, i) =>
      JSON.stringify({
        timestamp: new Date(time + i).toISOString(),
        level: 'debug',
        message,
      }),
    )
    .join('\n')}\n`

it('accepts only a fresh serialized notEnabled cycle after the exact owned session', () => {
  expect(
    attestSilentCloudLines(
      lines([`[KiroAgent] ACP session/load sessionId=${other}`, ...cycle, start(), ...cycle]),
      own,
      now,
    ),
  ).toBe(true)
  expect(attestSilentCloudLines(lines([start(other), ...cycle, start(), ...cycle]), own, now)).toBe(
    true,
  )
  expect(() => attestSilentCloudLines(lines([start(other), ...cycle]), own, now)).toThrow(
    'NATIVE_CLOUD_PENDING',
  )
  expect(() => attestSilentCloudLines(lines([start(), ...cycle], now - 100), own, now)).toThrow(
    'NATIVE_CLOUD_CYCLE_UNVERIFIED',
  )
})

it('requires a new idle reconciliation after the proof bound despite older info-only startup', () => {
  const prefix = lines([start(other)], now - 100)
  expect(attestSilentCloudLines(prefix + lines([start(), ...cycle]), own, now)).toBe(true)
  for (const messages of [
    [start(), 'cloudConfig.sync.joinedQueuedFollowUp', ...cycle],
    [cycle[3], start(), ...cycle],
    [start(), ...cycle, cycle[3]],
    [start(), cycle[2], cycle[3]],
  ]) {
    expect(() => attestSilentCloudLines(prefix + lines(messages), own, now)).toThrow(
      'NATIVE_CLOUD_CYCLE_UNVERIFIED',
    )
  }
})

it('does not accept missing info-only proof, unfinished cycles, or an old receipt', () => {
  for (const messages of [[start()], [start(), cycle[0]], [start(), ...cycle.slice(0, 3)]]) {
    expect(() => attestSilentCloudLines(lines(messages), own, now)).toThrow('NATIVE_CLOUD_PENDING')
  }
  expect(() => attestSilentCloudLines(lines([start(), ...cycle]).trimEnd(), own, now)).toThrow(
    'NATIVE_CLOUD_PENDING',
  )
})

it('requires positive busy, two disabled reconciliations and two returns for an older startup pull', () => {
  const prefix = lines([start(other)], now - 100)
  const overlap = [
    start(),
    `[KiroAgent] ACP session/load sessionId=${other}`,
    'cloudConfig.sync.joinedQueuedFollowUp',
    cycle[2],
    cycle[0],
    cycle[3],
    cycle[2],
    cycle[3],
  ]
  expect(attestSilentCloudLines(prefix + lines(overlap), own, now)).toBe(true)
  expect(
    attestSilentCloudLines(prefix + lines([overlap[0], cycle[0], ...overlap.slice(1)]), own, now),
  ).toBe(true)
  expect(() => attestSilentCloudLines(prefix + lines(overlap.slice(0, -1)), own, now)).toThrow(
    'NATIVE_CLOUD_PENDING',
  )
  for (const messages of [
    overlap.filter((_, i) => i !== 3),
    overlap.filter((_, i) => i !== 4),
    [...overlap, cycle[3]],
    overlap.map((s, i) => (i === 6 ? 'cloudConfig.sync.unexpectedFault' : s)),
    overlap.map((s, i) => (i === 7 ? 'cloudConfig.pull.silent {"outcome":"fellBackToCache"}' : s)),
  ])
    expect(() => attestSilentCloudLines(prefix + lines(messages), own, now)).toThrow(
      'NATIVE_CLOUD_CYCLE_UNVERIFIED',
    )
  expect(() => attestSilentCloudLines(lines(overlap), own, now)).toThrow(
    'NATIVE_CLOUD_CYCLE_UNVERIFIED',
  )
})

it('requires every overlapping pull to finish and every reconciliation to be notEnabled', () => {
  const overlap = [
    start(other),
    start(),
    cycle[0],
    'cloudConfig.sync.joinedQueuedFollowUp',
    cycle[2],
    cycle[0],
    cycle[3],
    cycle[2],
    cycle[3],
  ]
  expect(attestSilentCloudLines(lines(overlap), own, now)).toBe(true)
  expect(() => attestSilentCloudLines(lines(overlap.slice(0, -1)), own, now)).toThrow(
    'NATIVE_CLOUD_PENDING',
  )
  expect(() => attestSilentCloudLines(lines(overlap.filter((_, i) => i !== 7)), own, now)).toThrow(
    'NATIVE_CLOUD_CYCLE_UNVERIFIED',
  )
  expect(() => attestSilentCloudLines(lines([...overlap, cycle[3]]), own, now)).toThrow(
    'NATIVE_CLOUD_CYCLE_UNVERIFIED',
  )
  const third = 'sess_00000000-0000-4000-8000-000000000003'
  expect(
    attestSilentCloudLines(
      lines([
        start(other),
        start(),
        start(third),
        cycle[0],
        'cloudConfig.sync.joinedQueuedFollowUp',
        'cloudConfig.sync.joinedQueuedFollowUp',
        cycle[2],
        cycle[0],
        cycle[3],
        cycle[2],
        cycle[3],
        cycle[3],
      ]),
      own,
      now,
    ),
  ).toBe(true)
})

it('rejects incomplete overlapping pulls, reload, and any pre-proof model prompt', () => {
  const cases = [
    [start(), 'cloudConfig.sync.joinedQueuedFollowUp', ...cycle],
    [`[KiroAgent] ACP session/load sessionId=${own}`, ...cycle],
    [start(), `[KiroAgent] ACP session/prompt sessionId=${own}`, ...cycle],
    [start(), ...cycle, start(other)],
    [start(), ...cycle, start()],
  ]
  for (const messages of cases) {
    expect(() => attestSilentCloudLines(lines(messages), own, now)).toThrow(
      'NATIVE_CLOUD_CYCLE_UNVERIFIED',
    )
  }
  for (const messages of [
    [start(other), start(), ...cycle],
    [start(), cycle[0], start(other), ...cycle.slice(1)],
  ]) {
    expect(() => attestSilentCloudLines(lines(messages), own, now)).toThrow('NATIVE_CLOUD_PENDING')
  }
})

it('rejects fallback, mutations, unknown markers, malformed and reversed logs', () => {
  for (const event of [
    'cloudConfig.pull.silent {"outcome":"fellBackToCache","lastAnswer":"none"}',
    'cloudConfig.pull.silent {"outcome":"notEnabled","retracted":true}',
    'cloudConfig.sync.retracted {"deleted":1,"deleteFailures":0}',
    'cloudConfig.sync.synced {"downloaded":1,"deleted":0}',
    'cloudConfig.unknown',
  ]) {
    expect(() =>
      attestSilentCloudLines(lines([start(), ...cycle.slice(0, 3), event]), own, now),
    ).toThrow('NATIVE_CLOUD_CYCLE_UNVERIFIED')
  }
  expect(() => attestSilentCloudLines('cloudConfig.{broken}\n', own, now)).toThrow(
    'NATIVE_CLOUD_CYCLE_UNVERIFIED',
  )
  expect(() =>
    attestSilentCloudLines(lines([start()]) + lines(cycle, now - 100), own, now),
  ).toThrow('NATIVE_CLOUD_CYCLE_UNVERIFIED')
})

it('binds logs to fresh scoped metadata, rejects cached config and model messages', async () => {
  const root = await realpath(mkdtempSync(join(tmpdir(), 'vibe-cloud-silent-')))
  const workspace = join(root, 'workspace')
  const sessionsRoot = join(root, 'sessions')
  const logsRoot = join(root, 'logs')
  const configRoot = join(root, 'cloud', 'config')
  const directory = join(sessionsRoot, cloudStoreHash(workspace), own)
  const log = join(logsRoot, '20260925T080000000')
  mkdirSync(workspace)
  mkdirSync(directory, { recursive: true })
  mkdirSync(log, { recursive: true })
  const metadata = {
    id: own,
    workspacePaths: [workspace],
    rootPaths: [workspace],
    createdAt: new Date(now).toISOString(),
  }
  const metaFile = join(directory, 'session.json')
  writeFileSync(metaFile, JSON.stringify(metadata))
  writeFileSync(join(log, 'kiro.log'), lines([start(), ...cycle]))
  const options = { sessionsRoot, logsRoot, configRoot, notBefore: now }
  await expect(attestOwnedSilentCloudPull(own, workspace, options)).resolves.toBe(true)
  writeFileSync(
    metaFile,
    JSON.stringify({ ...metadata, createdAt: new Date(now - 1).toISOString() }),
  )
  await expect(attestOwnedSilentCloudPull(own, workspace, options)).rejects.toThrow(
    'NATIVE_CLOUD_SESSION_NOT_FRESH',
  )
  writeFileSync(metaFile, JSON.stringify({ ...metadata, rootPaths: [root] }))
  await expect(attestOwnedSilentCloudPull(own, workspace, options)).rejects.toThrow(
    'NATIVE_CLOUD_SESSION_SCOPE_MISMATCH',
  )
  writeFileSync(metaFile, JSON.stringify(metadata))
  writeFileSync(join(directory, 'messages.jsonl'), '{"payload":{"type":"user"}}\n')
  await expect(attestOwnedSilentCloudPull(own, workspace, options)).rejects.toThrow(
    'NATIVE_CLOUD_MESSAGES_UNEXPECTED',
  )
  writeFileSync(join(directory, 'messages.jsonl'), '')
  mkdirSync(configRoot, { recursive: true })
  await expect(attestOwnedSilentCloudPull(own, workspace, options)).rejects.toThrow(
    'NATIVE_CLOUD_CONFIG_PRESENT',
  )
})
