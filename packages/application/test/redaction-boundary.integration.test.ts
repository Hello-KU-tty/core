import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { discoverySessionSchema, projectSchema } from '@vibe-helper/contracts'
import { describe, expect, it } from 'vitest'

import {
  discoveryInputFixture,
  discoverySessionFixture,
  ids,
  liveContextFixture,
  projectFixture,
  timestamp,
} from '../../contracts/test/fixtures.js'
import { openSqliteStorage } from '../../storage-sqlite/src/index.js'

const harness = async () => {
  const root = await mkdtemp(join(tmpdir(), 'vibe-redaction-boundary-'))
  const workspaces = join(root, 'workspaces')
  await mkdir(workspaces)
  const storage = await openSqliteStorage({ dataDirectory: join(root, 'data') })
  const service = new ApplicationService({
    storage,
    workspacePolicy: await WorkspacePathPolicy.create(workspaces),
  })
  return { storage, service, workspaces }
}

const start = {
  schemaVersion: 1,
  kind: 'UI_START_DISCOVERY',
  correlationId: ids.correlation,
  actor: { kind: 'UI' },
  projectId: ids.project,
  idempotencyKey: ids.idempotency,
  input: {
    learningGoal: 'TypeScript token=synthetic-goal-secret',
    personalNeed: 'password=synthetic-need-secret',
    recentFriction: 'Read /Users/synthetic-private-user/private-note.txt',
    interestAreas: ['api_key=synthetic-interest-secret'],
    freeContext: 'Bearer synthetic-bearer-secret',
  },
} as const

describe('persisted structured text redaction boundary', () => {
  it('redacts new Discovery input before DB, History and restored UI output without changing provenance', async () => {
    const { storage, service } = await harness()
    try {
      const result = await service.executeUi(start)
      expect(result, JSON.stringify(result)).toMatchObject({ success: true })
      const aggregate = storage.repository.readDiscoveryAggregate(ids.project)
      expect(aggregate).toMatchObject({
        project: { learningGoal: 'TypeScript token=[REDACTED]', source: { kind: 'USER' } },
        session: { input: { personalNeed: 'password=[REDACTED]' }, source: { kind: 'USER' } },
      })
      const restored = await service.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        projectId: ids.project,
        helperConversationLimit: 5,
      })
      expect(restored).toMatchObject({ success: true })
      const history = await service.executeUi({
        schemaVersion: 1,
        kind: 'UI_LIST_PROJECTS',
        correlationId: ids.correlation,
        actor: { kind: 'UI' },
        limit: 20,
      })
      expect(history).toMatchObject({ success: true })
      expect(JSON.stringify([aggregate, restored, history])).not.toMatch(
        /synthetic-(goal|need|interest|bearer)-secret|synthetic-private-user/,
      )
      expect(start.input.personalNeed).toBe('password=synthetic-need-secret')
      const path = storage.databasePath
      if (path === null) throw new Error('File-backed test database is required')
      storage.close()
      expect((await readFile(path)).toString('utf8')).not.toMatch(
        /synthetic-(goal|need|interest|bearer)-secret|synthetic-private-user/,
      )
    } finally {
      storage.close()
    }
  })

  it('keeps original-request idempotency despite equal redacted text, including after service restart', async () => {
    const { storage, service, workspaces } = await harness()
    try {
      const first = await service.executeUi(start)
      expect(first).toMatchObject({ success: true })
      expect(await service.executeUi(start)).toEqual(first)
      expect(
        await service.executeUi({
          ...start,
          input: { ...start.input, personalNeed: 'password=synthetic-other-secret' },
        }),
      ).toMatchObject({ success: false, error: { code: 'IDEMPOTENCY_KEY_REUSE' } })
      const restarted = new ApplicationService({
        storage,
        workspacePolicy: await WorkspacePathPolicy.create(workspaces),
      })
      expect(await restarted.executeUi(start)).toEqual(first)
    } finally {
      storage.close()
    }
  })

  it('redacts Agent candidate descriptions and nested arrays but preserves their source and identities', async () => {
    const { storage, service } = await harness()
    try {
      storage.repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          status: 'DISCOVERY',
          generatedWorkspacePath: undefined,
        }),
      )
      storage.repository.appendDiscoverySession(
        discoverySessionSchema.parse(discoverySessionFixture),
      )
      const round = {
        schemaVersion: 1,
        id: 'candidate_preview_round_00000000-0000-4000-8000-000000000501',
        finalRoundId: 'candidate_round_00000000-0000-4000-8000-000000000502',
        discoverySessionId: ids.discoverySession,
        correlationId: ids.correlation,
        inputSnapshot: discoveryInputFixture,
        previews: Array.from({ length: 10 }, (_, i) => ({
          candidateId: `candidate_00000000-0000-4000-8000-${String(510 + i).padStart(12, '0')}`,
          position: i + 1,
          title: `Preview ${i + 1}`,
          summary: 'api_key=synthetic-agent-secret',
          coreInteraction: 'Filter records',
          appeal: 'Explore a small dataset',
          technologyNecessity: 'Typed arrays',
          generationTags: ['DIRECT'],
        })),
        generationRationale: 'Read /Users/synthetic-agent-user/private/input.txt',
        createdAt: timestamp,
        source: { kind: 'AGENT', role: 'DISCOVERY' },
        redactionStatus: 'NOT_REQUIRED',
      }
      expect(
        await service.executeAgent('DISCOVERY', {
          schemaVersion: 1,
          kind: 'DISCOVERY_SUBMIT_CANDIDATE_PREVIEWS',
          correlationId: ids.correlation,
          actor: { kind: 'AGENT', role: 'DISCOVERY' },
          idempotencyKey: ids.idempotency,
          expectedSessionRevision: 1,
          previewRound: round,
        }),
      ).toMatchObject({ success: true })
      const stored = storage.repository.readDiscoveryAggregate(ids.project)?.previewRound
      expect(stored).toMatchObject({
        id: round.id,
        source: round.source,
        redactionStatus: 'VERIFIED_REDACTED',
      })
      expect(stored?.previews.map((item) => item.candidateId)).toEqual(
        round.previews.map((item) => item.candidateId),
      )
      expect(JSON.stringify(stored)).not.toMatch(/synthetic-agent-secret|synthetic-agent-user/)
      expect(round.previews[0]?.summary).toBe('api_key=synthetic-agent-secret')
    } finally {
      storage.close()
    }
  })

  it('revalidates text expansion instead of storing an over-limit redacted payload', async () => {
    const { storage, service } = await harness()
    try {
      expect(
        await service.executeUi({
          ...start,
          input: { learningGoal: 'token=a '.repeat(29).trim() },
        }),
      ).toMatchObject({ success: false, error: { code: 'INVALID_PAYLOAD' } })
      expect(storage.repository.recoverProject(ids.project)).toBeNull()
    } finally {
      storage.close()
    }
  })

  it('rejects a sensitive file reference before dispatch rather than rewriting its destination', async () => {
    const { storage, service } = await harness()
    try {
      const result = await service.executeAgent('BUILDER', {
        schemaVersion: 1,
        kind: 'BUILDER_UPDATE_LIVE_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        idempotencyKey: ids.idempotency,
        context: {
          ...liveContextFixture,
          relatedFiles: [{ kind: 'CODE', path: 'src/token=synthetic-secret.ts' }],
        },
      })
      expect(result).toMatchObject({ success: false, error: { code: 'SENSITIVE_REFERENCE_PATH' } })
      expect(JSON.stringify(result)).not.toContain('synthetic-secret')
      expect(storage.repository.recoverProject(ids.project)).toBeNull()
    } finally {
      storage.close()
    }
  })
})
