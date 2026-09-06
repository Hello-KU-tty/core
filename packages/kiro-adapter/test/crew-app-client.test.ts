import { describe, expect, it, vi } from 'vitest'
import { CREW_UI_PROTOCOL_VERSION } from '@vibe-helper/contracts'

import {
  builderSlotKey,
  CREW_CHAT_STREAM_PATH,
  CREW_CORE_APPLICATION_PATH,
  createDiscoveryEphemeralContext,
  type CrewAppApi,
  CrewAppClientError,
  CrewCoreClient,
  CrewDiscoveryClient,
  CrewSessionClient,
  DISCOVERY_AGENT_NAME,
  DISCOVERY_MERGE_AGENT_NAME,
  DISCOVERY_SPEC_AGENT_NAME,
  DISCOVERY_SPEC_RECOVERY_AGENT_NAME,
  discoveryRunSlotKey,
  discoverySlotKey,
  helperSlotKey,
} from '../src/crew-app-client.js'

const projectId = 'project_00000000-0000-4000-8000-000000000001'
const correlationId = 'corr_00000000-0000-4000-8000-000000000001'

describe('Crew browser-safe clients', () => {
  it('uses the fixed Core endpoint and validates the Project History response', async () => {
    const post = vi.fn(async () => ({
      success: true,
      data: { schemaVersion: 1, correlationId, projects: [] },
    }))
    const client = new CrewCoreClient({ get: vi.fn(), post })

    await expect(client.listProjects(correlationId)).resolves.toEqual({
      schemaVersion: 1,
      correlationId,
      projects: [],
    })
    expect(post).toHaveBeenCalledWith(CREW_CORE_APPLICATION_PATH, {
      schemaVersion: 1,
      kind: 'UI_LIST_PROJECTS',
      correlationId,
      actor: { kind: 'UI' },
      limit: 50,
      clientProtocolVersion: CREW_UI_PROTOCOL_VERSION,
    })
  })

  it('classifies Core permission failures without exposing a raw transport', async () => {
    const client = new CrewCoreClient({
      get: vi.fn(),
      post: vi.fn(async () => ({
        success: false,
        error: {
          schemaVersion: 1,
          kind: 'OPERATION_ERROR',
          category: 'PERMISSION',
          code: 'WORKSPACE_NOT_ASSIGNED',
          disposition: 'USER_ACTION_REQUIRED',
          message: 'Workspace is not assigned.',
          correlationId,
          issues: [],
          redactionStatus: 'VERIFIED_REDACTED',
        },
      })),
    })

    await expect(client.listProjects(correlationId)).rejects.toMatchObject({
      name: 'CrewAppClientError',
      category: 'PERMISSION',
      code: 'WORKSPACE_NOT_ASSIGNED',
    })
  })

  it('restores deterministic Builder and Helper slots and redacts returned history', async () => {
    const discovery = discoverySlotKey(projectId)
    const builder = builderSlotKey(projectId)
    const helper = helperSlotKey(projectId)
    const legacyHelper = `vibe-helper-helper-${projectId}`
    const api: CrewAppApi = {
      get: vi.fn(async (path: string) => {
        if (path === '/api/chat/slots') {
          return [{ key: builder }, { key: legacyHelper }, { key: helper }]
        }
        if (path.includes(builder)) {
          return {
            messages: [
              { role: 'user', content: 'token=synthetic-secret-value' },
              { role: 'assistant', content: 'Use /Users/example/private/project.ts.' },
            ],
          }
        }
        if (path.includes(legacyHelper)) {
          return { messages: [{ role: 'assistant', content: 'Earlier Helper explanation.' }] }
        }
        return { messages: [{ role: 'assistant', content: 'Review the pending decision.' }] }
      }),
      post: vi.fn(),
    }

    await expect(new CrewSessionClient(api).restoreProject(projectId)).resolves.toEqual({
      discoverySlotKey: discovery,
      builderSlotKey: builder,
      helperSlotKey: helper,
      discoveryMessages: [],
      builderMessages: [
        { key: '0-user-28', role: 'USER', content: 'token=[REDACTED]' },
        { key: '1-assistant-38', role: 'ASSISTANT', content: 'Use [REDACTED_PATH]' },
      ],
      helperMessages: [
        {
          key: 'merged-0-0-assistant-27',
          role: 'ASSISTANT',
          content: 'Earlier Helper explanation.',
        },
        {
          key: 'merged-1-0-assistant-28',
          role: 'ASSISTANT',
          content: 'Review the pending decision.',
        },
      ],
    })
  })

  it('preserves legacy Builder history while using the current session revision', async () => {
    const currentBuilder = builderSlotKey(projectId)
    const legacyBuilder = `vibe-helper-builder-${projectId}`
    const previousBuilderV2 = `vibe-helper-builder-v2-${projectId}`
    const previousBuilderV3 = `vibe-helper-builder-v3-${projectId}`
    const previousBuilderV4 = `vibe-helper-builder-v4-${projectId}`
    const previousBuilderV5 = `vibe-helper-builder-v5-${projectId}`
    const previousBuilderV6 = `vibe-helper-builder-v6-${projectId}`
    const api: CrewAppApi = {
      get: vi.fn(async (path: string) => {
        if (path === '/api/chat/slots') {
          return [
            { key: legacyBuilder },
            { key: previousBuilderV2 },
            { key: previousBuilderV3 },
            { key: previousBuilderV4 },
            { key: previousBuilderV5 },
            { key: previousBuilderV6 },
            { key: currentBuilder },
          ]
        }
        if (path.includes(currentBuilder)) {
          return { messages: [{ role: 'assistant', content: 'Current session' }] }
        }
        if (path.includes(previousBuilderV2)) {
          return { messages: [{ role: 'assistant', content: 'Previous session v2' }] }
        }
        if (path.includes(previousBuilderV3)) {
          return { messages: [{ role: 'assistant', content: 'Previous session v3' }] }
        }
        if (path.includes(previousBuilderV4)) {
          return { messages: [{ role: 'assistant', content: 'Previous session v4' }] }
        }
        if (path.includes(previousBuilderV5)) {
          return { messages: [{ role: 'assistant', content: 'Previous session v5' }] }
        }
        if (path.includes(previousBuilderV6)) {
          return { messages: [{ role: 'assistant', content: 'Previous session v6' }] }
        }
        return { messages: [{ role: 'assistant', content: 'Legacy session' }] }
      }),
      post: vi.fn(),
    }

    const restored = await new CrewSessionClient(api).restoreProject(projectId)

    expect(restored.builderSlotKey).toBe(currentBuilder)
    expect(restored.builderMessages.map((message) => message.content)).toEqual([
      'Legacy session',
      'Previous session v2',
      'Previous session v3',
      'Previous session v4',
      'Previous session v5',
      'Previous session v6',
      'Current session',
    ])
    expect(new Set(restored.builderMessages.map((message) => message.key)).size).toBe(7)
  })

  it('keeps missing slots empty and reports disconnected Crew history', async () => {
    const empty = new CrewSessionClient({ get: vi.fn(async () => []), post: vi.fn() })
    await expect(empty.restoreProject(projectId)).resolves.toMatchObject({
      discoveryMessages: [],
      builderMessages: [],
      helperMessages: [],
    })

    const disconnected = new CrewSessionClient({
      get: vi.fn(async () => {
        throw new Error('offline')
      }),
      post: vi.fn(),
    })
    await expect(disconnected.restoreProject(projectId)).rejects.toBeInstanceOf(CrewAppClientError)
  })

  it('submits validated Discovery UI commands through the fixed Core boundary', async () => {
    const post = vi.fn(async () => ({
      success: true,
      data: { schemaVersion: 1, correlationId, accepted: true, resourceRevision: 1 },
    }))
    const client = new CrewCoreClient({ get: vi.fn(), post })
    const request = {
      schemaVersion: 1,
      kind: 'UI_START_DISCOVERY',
      correlationId,
      actor: { kind: 'UI' },
      idempotencyKey: 'idem_00000000-0000-4000-8000-000000000001',
      projectId,
      input: { learningGoal: 'Understand runtime validation' },
    } as const

    await expect(client.startDiscovery(request)).resolves.toMatchObject({ resourceRevision: 1 })
    expect(post).toHaveBeenCalledWith(CREW_CORE_APPLICATION_PATH, {
      ...request,
      clientProtocolVersion: CREW_UI_PROTOCOL_VERSION,
    })
    await expect(
      client.startDiscovery({ ...request, projectId: 'not-a-project-id' }),
    ).rejects.toMatchObject({ name: 'ZodError' })
  })

  it('turns a stale UI protocol response into an explicit refresh error', async () => {
    const client = new CrewCoreClient({
      get: vi.fn(),
      post: vi.fn(async () => {
        throw new Error('Request failed with HTTP 409')
      }),
    })

    await expect(client.listProjects(correlationId)).rejects.toMatchObject({
      category: 'CONTRACT',
      code: 'STALE_UI_PROTOCOL',
    })
  })

  it('creates a deterministic Discovery slot and dispatches only through the SSE endpoint', async () => {
    const discoverySessionId = 'discovery_session_00000000-0000-4000-8000-000000000014'
    const slot = discoveryRunSlotKey(discoverySessionId, 2)
    const api: CrewAppApi = {
      get: vi.fn(async () => []),
      post: vi.fn(async () => ({ key: slot })),
    }
    const streamText = vi.fn(async () => 'data: done\n\n')
    const streamingFetch = vi.fn(async () => ({ ok: true, status: 200, text: streamText }))
    const client = new CrewDiscoveryClient(api, {
      fetch: streamingFetch,
      now: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(35),
    })

    const receipt = await client.dispatch(discoverySessionId, 2, 'Start Discovery')
    expect(receipt).toMatchObject({ slotKey: slot, dispatchMilliseconds: 25 })
    await expect(receipt.completion).resolves.toBe('DONE')
    expect(api.post).toHaveBeenCalledWith('/api/chat/slots', {
      name: slot,
      agent: DISCOVERY_AGENT_NAME,
      memory_mode: 'temporary',
    })
    expect(streamingFetch).toHaveBeenCalledWith(CREW_CHAT_STREAM_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Start Discovery', slot, agent: DISCOVERY_AGENT_NAME }),
    })
    expect(streamText).toHaveBeenCalledOnce()
  })

  it('injects bounded Core context before dispatch and falls back without blocking chat', async () => {
    const discoverySessionId = 'discovery_session_00000000-0000-4000-8000-000000000014'
    const slot = discoveryRunSlotKey(discoverySessionId, 2)
    const post = vi.fn(async (path: string) =>
      path === '/api/chat/slots' ? { key: slot } : { ok: true },
    )
    const streamingFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'data: done\n\n',
    }))
    const client = new CrewDiscoveryClient(
      { get: vi.fn(async () => []), post },
      { fetch: streamingFetch },
    )

    const receipt = await client.dispatch(
      discoverySessionId,
      2,
      'Generate Candidates',
      '{"kind":"VIBE_HELPER_DISCOVERY_CONTEXT"}',
    )

    expect(receipt).toMatchObject({
      slotKey: slot,
      contextInjection: 'INJECTED',
      contextCharacters: 40,
    })
    expect(post).toHaveBeenNthCalledWith(2, `/api/chat/slots/${slot}/context`, {
      content: '{"kind":"VIBE_HELPER_DISCOVERY_CONTEXT"}',
      source: 'vibe-helper-core',
      ephemeral: true,
      maxAge: 300,
    })
    const injectedBody = JSON.parse(String(streamingFetch.mock.calls[0]?.[1].body)) as {
      message: string
    }
    expect(injectedBody.message).toContain('do not call get_discovery_context')
    expect(injectedBody.message).toContain('Generate Candidates')

    const fallbackFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'data: done\n\n',
    }))
    const fallback = new CrewDiscoveryClient(
      {
        get: vi.fn(async () => [{ key: slot, agent: DISCOVERY_AGENT_NAME }]),
        post: vi.fn(async () => {
          throw new Error('context unsupported')
        }),
      },
      { fetch: fallbackFetch },
    )
    const fallbackReceipt = await fallback.dispatch(
      discoverySessionId,
      2,
      'Generate Candidates',
      '{"kind":"VIBE_HELPER_DISCOVERY_CONTEXT"}',
    )
    expect(fallbackReceipt.contextInjection).toBe('FALLBACK')
    expect(fallbackFetch).toHaveBeenCalledWith(
      CREW_CHAT_STREAM_PATH,
      expect.objectContaining({
        body: JSON.stringify({
          message: 'Generate Candidates',
          slot,
          agent: DISCOVERY_AGENT_NAME,
        }),
      }),
    )
  })

  it('uses the focused Spec Agent and an isolated phase slot for Spec turns', async () => {
    const discoverySessionId = 'discovery_session_00000000-0000-4000-8000-000000000014'
    const slot = discoveryRunSlotKey(discoverySessionId, 3, 'SPEC')
    const post = vi.fn(async (path: string) =>
      path === '/api/chat/slots' ? { key: slot } : { ok: true },
    )
    const streamingFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'data: done\n\n',
    }))
    const client = new CrewDiscoveryClient(
      { get: vi.fn(async () => []), post },
      { fetch: streamingFetch },
    )

    const receipt = await client.dispatch(
      discoverySessionId,
      3,
      'Draft the Spec',
      '{"kind":"VIBE_HELPER_DISCOVERY_CONTEXT"}',
      'SPEC',
    )

    expect(receipt.slotKey).toBe(slot)
    expect(post).toHaveBeenNthCalledWith(1, '/api/chat/slots', {
      name: slot,
      agent: DISCOVERY_SPEC_AGENT_NAME,
      memory_mode: 'temporary',
    })
    expect(streamingFetch).toHaveBeenCalledWith(
      CREW_CHAT_STREAM_PATH,
      expect.objectContaining({
        body: expect.stringContaining(`"agent":"${DISCOVERY_SPEC_AGENT_NAME}"`),
      }),
    )
  })

  it('uses the read-capable Spec recovery Agent only when context injection fails', async () => {
    const discoverySessionId = 'discovery_session_00000000-0000-4000-8000-000000000014'
    const fastSlot = discoveryRunSlotKey(discoverySessionId, 3, 'SPEC')
    const recoverySlot = discoveryRunSlotKey(discoverySessionId, 3, 'SPEC_RECOVERY')
    const post = vi.fn(async (path: string) => {
      if (path === '/api/chat/slots') {
        const slotRequest = post.mock.calls.at(-1)?.[1] as { name?: string } | undefined
        return { key: slotRequest?.name }
      }
      throw new Error('context unsupported')
    })
    const streamingFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'data: done\n\n',
    }))
    const client = new CrewDiscoveryClient(
      { get: vi.fn(async () => []), post },
      { fetch: streamingFetch },
    )

    const receipt = await client.dispatch(
      discoverySessionId,
      3,
      'Refine the Spec',
      '{"kind":"VIBE_HELPER_DISCOVERY_CONTEXT"}',
      'SPEC',
    )

    expect(receipt).toMatchObject({ slotKey: recoverySlot, contextInjection: 'FALLBACK' })
    expect(post).toHaveBeenCalledWith('/api/chat/slots', {
      name: fastSlot,
      agent: DISCOVERY_SPEC_AGENT_NAME,
      memory_mode: 'temporary',
    })
    expect(post).toHaveBeenCalledWith('/api/chat/slots', {
      name: recoverySlot,
      agent: DISCOVERY_SPEC_RECOVERY_AGENT_NAME,
      memory_mode: 'temporary',
    })
    expect(streamingFetch).toHaveBeenCalledWith(
      CREW_CHAT_STREAM_PATH,
      expect.objectContaining({
        body: JSON.stringify({
          message: 'Refine the Spec',
          slot: recoverySlot,
          agent: DISCOVERY_SPEC_RECOVERY_AGENT_NAME,
        }),
      }),
    )
  })

  it('inspects running, completed, missing, and legacy phase slots without dispatching', async () => {
    const discoverySessionId = 'discovery_session_00000000-0000-4000-8000-000000000014'
    const roundSlot = discoveryRunSlotKey(discoverySessionId, 2)
    const specRecoverySlot = discoveryRunSlotKey(discoverySessionId, 3, 'SPEC_RECOVERY')
    const legacySlot = `vibe-helper-discovery-${discoverySessionId}-4`
    const client = new CrewDiscoveryClient({
      get: vi.fn(async () => [
        { key: roundSlot, agent: DISCOVERY_AGENT_NAME, running: true },
        { key: specRecoverySlot, agent: DISCOVERY_SPEC_RECOVERY_AGENT_NAME, running: false },
        { key: legacySlot, agent: 'vibe-helper-discovery', running: false },
      ]),
      post: vi.fn(),
    })

    await expect(client.inspectRun(discoverySessionId, 2, 'ROUND')).resolves.toEqual({
      status: 'RUNNING',
      slotKey: roundSlot,
    })
    await expect(client.inspectRun(discoverySessionId, 3, 'SPEC')).resolves.toEqual({
      status: 'COMPLETED',
      slotKey: specRecoverySlot,
    })
    await expect(client.inspectRun(discoverySessionId, 4, 'ROUND')).resolves.toEqual({
      status: 'LEGACY',
      slotKey: legacySlot,
    })
    await expect(client.inspectRun(discoverySessionId, 5, 'ROUND')).resolves.toEqual({
      status: 'MISSING',
    })
  })

  it('uses the focused MERGE Agent for Core-derived narrowing metadata', async () => {
    const discoverySessionId = 'discovery_session_00000000-0000-4000-8000-000000000014'
    const slot = discoveryRunSlotKey(discoverySessionId, 2, 'MERGE')
    const post = vi.fn(async (path: string) =>
      path === '/api/chat/slots' ? { key: slot } : { ok: true },
    )
    const streamingFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'data: done\n\n',
    }))
    const client = new CrewDiscoveryClient(
      { get: vi.fn(async () => []), post },
      { fetch: streamingFetch },
    )

    await client.dispatch(
      discoverySessionId,
      2,
      'Merge Candidates',
      '{"kind":"VIBE_HELPER_DISCOVERY_CONTEXT"}',
      'MERGE',
    )

    expect(post).toHaveBeenNthCalledWith(1, '/api/chat/slots', {
      name: slot,
      agent: DISCOVERY_MERGE_AGENT_NAME,
      memory_mode: 'temporary',
    })
    expect(streamingFetch).toHaveBeenCalledWith(
      CREW_CHAT_STREAM_PATH,
      expect.objectContaining({
        body: expect.stringContaining(`"agent":"${DISCOVERY_MERGE_AGENT_NAME}"`),
      }),
    )
  })

  it('keeps ephemeral context bounded to the current round and pending feedback', () => {
    const discoverySessionId = 'discovery_session_00000000-0000-4000-8000-000000000014'
    const candidateId = 'candidate_00000000-0000-4000-8000-000000000015'
    const feedbackId = 'feedback_00000000-0000-4000-8000-000000000016'
    const session = {
      id: discoverySessionId,
      correlationId,
      revision: 3,
      status: 'ACTIVE',
      input: { learningGoal: 'Understand validation' },
    }
    const candidate = {
      id: candidateId,
      revision: 1,
      parentRevisions: [],
      title: 'Config Lab',
      summary: 'Validate config variants.',
      targetUsers: ['Developer'],
      coreInteraction: 'Paste config and inspect a result.',
      usageMoment: 'Before a local run.',
      appeal: 'Makes invisible rules visible.',
      technologyNecessity: 'Runtime validation is the core behavior.',
      coreConcepts: ['schema'],
      mvpFeatures: ['Paste config'],
      suggestedScope: { learnerFocus: ['schema'], agentSupport: [], excluded: [] },
      generationTags: ['DIRECT'],
      evaluation: [{ synthetic: 'historical detail must not be injected' }],
      risks: ['historical detail must not be injected'],
    }
    const context = createDiscoveryEphemeralContext(
      {
        project: {
          id: projectId,
          title: 'Validation',
          learningGoal: 'Understand validation',
          status: 'DISCOVERY',
        },
        discoverySession: session,
        discoveryContext: {
          project: {
            id: projectId,
            title: 'Validation',
            learningGoal: 'Understand validation',
            status: 'DISCOVERY',
          },
          session,
          rounds: [
            {
              id: 'candidate_round_00000000-0000-4000-8000-000000000017',
              roundIndex: 1,
              appliedFeedbackIds: [],
              candidates: [{ candidateId, revision: 1 }],
            },
          ],
          candidates: [candidate],
          feedback: [
            {
              id: feedbackId,
              roundId: 'candidate_round_00000000-0000-4000-8000-000000000017',
              intent: 'EXPAND',
              targets: [{ candidateId, revision: 1 }],
              message: 'Make it a little bigger.',
            },
          ],
          learningSpec: null,
          relevantLedgerEntries: [],
          personalization: {
            schemaVersion: 1,
            id: 'personalization_00000000-0000-4000-8000-000000000020',
            projectId,
            correlationId,
            target: { kind: 'DISCOVERY_SESSION', discoverySessionId: session.id },
            mode: 'NO_RELEVANT_EVIDENCE',
            basis: [],
            fallbackReason: 'NO_LEDGER',
            createdAt: '2026-09-06T00:00:00.000Z',
            source: { kind: 'CORE' },
            redactionStatus: 'VERIFIED_REDACTED',
          },
        },
        selectedCandidate: null,
      } as never,
      'ROUND',
    )
    const parsed = JSON.parse(context) as Record<string, unknown>

    expect(parsed).toMatchObject({
      kind: 'VIBE_HELPER_DISCOVERY_CONTEXT',
      purpose: 'ROUND',
      expectedSessionRevision: 3,
      currentCandidates: [expect.objectContaining({ id: candidateId, title: 'Config Lab' })],
      pendingFeedback: [expect.objectContaining({ id: feedbackId, intent: 'EXPAND' })],
      personalization: { mode: 'NO_RELEVANT_EVIDENCE', fallbackReason: 'NO_LEDGER' },
    })
    expect(context).not.toContain('historical detail must not be injected')
  })

  it('injects only the previews selected by the user for just-in-time enrichment', () => {
    const discoverySessionId = 'discovery_session_00000000-0000-4000-8000-000000000014'
    const previewRoundId = 'candidate_preview_round_00000000-0000-4000-8000-000000000018'
    const finalRoundId = 'candidate_round_00000000-0000-4000-8000-000000000019'
    const previews = Array.from({ length: 10 }, (_, index) => ({
      candidateId: `candidate_00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      position: index + 1,
      title: `Preview ${String(index + 1)}`,
      summary: `Summary ${String(index + 1)}`,
      coreInteraction: `Interaction ${String(index + 1)}`,
      appeal: `Appeal ${String(index + 1)}`,
      technologyNecessity: `Necessity ${String(index + 1)}`,
      generationTags: ['DIRECT'],
    }))
    const session = {
      id: discoverySessionId,
      correlationId,
      revision: 1,
      status: 'ACTIVE',
      input: { learningGoal: 'Understand validation' },
    }
    const thirdPreview = previews[2]
    const eighthPreview = previews[7]
    if (thirdPreview === undefined || eighthPreview === undefined) {
      throw new TypeError('Selected enrichment preview fixture is incomplete')
    }
    const context = createDiscoveryEphemeralContext(
      {
        project: {
          id: projectId,
          title: 'Validation',
          learningGoal: 'Understand validation',
          status: 'DISCOVERY',
        },
        discoverySession: session,
        discoveryContext: {
          project: {
            id: projectId,
            title: 'Validation',
            learningGoal: 'Understand validation',
            status: 'DISCOVERY',
          },
          session,
          rounds: [],
          candidates: [],
          feedback: [],
          learningSpec: null,
          relevantLedgerEntries: [],
          personalization: {
            schemaVersion: 1,
            id: 'personalization_00000000-0000-4000-8000-000000000021',
            projectId,
            correlationId,
            target: { kind: 'DISCOVERY_SESSION', discoverySessionId: session.id },
            mode: 'NO_RELEVANT_EVIDENCE',
            basis: [],
            fallbackReason: 'NO_LEDGER',
            createdAt: '2026-09-06T00:00:00.000Z',
            source: { kind: 'CORE' },
            redactionStatus: 'VERIFIED_REDACTED',
          },
          previewRound: {
            id: previewRoundId,
            finalRoundId,
            previews,
          },
          candidateEnrichments: [],
        },
        selectedCandidate: null,
      } as never,
      'ENRICH_SELECTED',
      [thirdPreview.candidateId, eighthPreview.candidateId],
    )
    const parsed = JSON.parse(context) as {
      previewRound: Record<string, unknown>
      requestedPreviews: { position: number; title: string }[]
    }

    expect(parsed.previewRound).toEqual({ id: previewRoundId, finalRoundId })
    expect(parsed.requestedPreviews.map((preview) => preview.position)).toEqual([3, 8])
    expect(parsed.requestedPreviews.map((preview) => preview.title)).toEqual([
      'Preview 3',
      'Preview 8',
    ])
  })

  it('classifies a completed stream tool validation failure without exposing its body', async () => {
    const discoverySessionId = 'discovery_session_00000000-0000-4000-8000-000000000014'
    const slot = discoveryRunSlotKey(discoverySessionId, 3)
    const client = new CrewDiscoveryClient(
      {
        get: vi.fn(async () => [{ key: slot, agent: DISCOVERY_AGENT_NAME }]),
        post: vi.fn(),
      },
      {
        fetch: vi.fn(async () => ({
          ok: true,
          status: 200,
          text: async () => 'Input validation error: synthetic private payload details',
        })),
      },
    )

    const receipt = await client.dispatch(discoverySessionId, 3, 'Continue Discovery')
    await expect(receipt.completion).resolves.toBe('TOOL_VALIDATION_FAILED')
  })

  it('distinguishes slot ownership and host dispatch failures', async () => {
    const discoverySessionId = 'discovery_session_00000000-0000-4000-8000-000000000014'
    const slot = discoveryRunSlotKey(discoverySessionId, 2)
    const mismatch = new CrewDiscoveryClient({
      get: vi.fn(async () => [{ key: slot, agent: 'another-agent' }]),
      post: vi.fn(),
    })
    await expect(mismatch.dispatch(discoverySessionId, 2, 'Start')).rejects.toMatchObject({
      category: 'CONTRACT',
      code: 'DISCOVERY_SLOT_AGENT_MISMATCH',
    })

    const renamed = new CrewDiscoveryClient({
      get: vi.fn(async () => []),
      post: vi.fn(async () => ({ key: 'another-slot' })),
    })
    await expect(renamed.dispatch(discoverySessionId, 2, 'Start')).rejects.toMatchObject({
      category: 'CONTRACT',
      code: 'INVALID_SLOT_RESPONSE',
    })

    const disconnected = new CrewDiscoveryClient(
      { get: vi.fn(async () => [{ key: slot, agent: DISCOVERY_AGENT_NAME }]), post: vi.fn() },
      {
        fetch: vi.fn(async () => {
          throw new TypeError('host unavailable')
        }),
      },
    )
    await expect(disconnected.dispatch(discoverySessionId, 2, 'Start')).rejects.toMatchObject({
      category: 'CONNECTION',
      code: 'DISCOVERY_DISPATCH_UNAVAILABLE',
    })
  })
})
