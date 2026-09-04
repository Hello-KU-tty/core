import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  createDiscoveryAgentDefinition,
  type DiscoveryAgentAdapterError,
  DiscoveryAgentToolAdapter,
  DISCOVERY_AGENT_NAME,
  DISCOVERY_PROMPT_SOURCE,
  DISCOVERY_PROMPT_VERSION,
  DISCOVERY_TOOL_NAMES,
  type DiscoveryToolCaller,
} from '../src/discovery-agent.js'
import { loadDiscoveryAgentDefinition } from '../src/discovery-prompt-node.js'
import {
  candidateFixture,
  candidateRoundFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  ids,
  learningSpecDraftContentFixture,
  projectFixture,
} from '../../contracts/test/fixtures.js'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))

describe('Discovery Agent adapter', () => {
  it('loads the versioned canonical prompt without copying it into the package', async () => {
    const definition = await loadDiscoveryAgentDefinition(repositoryRoot)

    expect(definition).toMatchObject({
      name: DISCOVERY_AGENT_NAME,
      promptVersion: DISCOVERY_PROMPT_VERSION,
      promptSource: DISCOVERY_PROMPT_SOURCE,
      includeMcpJson: false,
      tools: ['@vibe-helper-discovery-core'],
      allowedTools: ['@vibe-helper-discovery-core'],
    })
    expect(definition.prompt).toContain('appliedFeedbackIds')
    expect(definition.prompt).toContain('사용자가 UI에서 직접 기록하는 action')
    expect(definition.prompt).toContain('expectedSpecRevision')
    expect(definition.prompt).toContain('Spec ID, selected Candidate reference')
    expect(definition.prompt).toContain('lightweight preview를 정확히 10개')
    expect(definition.prompt).toContain('각 권장 범위 1~2개')
    expect(definition.prompt).toContain('JSON 문자열이 아니라 실제 배열')
    expect(DISCOVERY_TOOL_NAMES).toEqual([
      'get_discovery_context',
      'submit_candidate_previews',
      'submit_candidate_enrichments',
      'submit_candidate_round',
      'submit_candidate_merge',
      'submit_learning_spec',
    ])
  })

  it('rejects prompt text whose declared version drifted from the adapter', () => {
    expect(() =>
      createDiscoveryAgentDefinition('# Drifted prompt\n\n> Prompt version: `9.9.9`'),
    ).toThrowError(
      expect.objectContaining<Partial<DiscoveryAgentAdapterError>>({ code: 'INVALID_PROMPT' }),
    )
  })

  it('validates Discovery requests and structured Core responses in both directions', async () => {
    const calls: string[] = []
    const caller: DiscoveryToolCaller = {
      callTool: async (name) => {
        calls.push(name)
        if (name === 'get_discovery_context') {
          return {
            structuredContent: {
              schemaVersion: 1,
              correlationId: ids.correlation,
              project: projectFixture,
              session: discoverySessionFixture,
              rounds: [candidateRoundFixture],
              candidates: [candidateFixture],
              feedback: [discoveryFeedbackFixture],
              learningSpec: null,
              relevantLedgerEntries: [],
            },
          }
        }
        return {
          structuredContent: {
            schemaVersion: 1,
            correlationId: ids.correlation,
            accepted: true,
            resourceRevision: 2,
          },
        }
      },
    }
    const adapter = new DiscoveryAgentToolAdapter(caller)

    const context = await adapter.getContext({
      schemaVersion: 1,
      kind: 'DISCOVERY_GET_CONTEXT',
      correlationId: ids.correlation,
      actor: { kind: 'AGENT', role: 'DISCOVERY' },
      projectId: ids.project,
      discoverySessionId: ids.discoverySession,
    })
    expect(context.session.id).toBe(ids.discoverySession)

    const receipt = await adapter.submitCandidateRound({
      schemaVersion: 1,
      projectId: ids.project,
      discoverySessionId: ids.discoverySession,
      correlationId: ids.correlation,
      idempotencyKey: ids.idempotency,
      expectedSessionRevision: 1,
      appliedFeedbackIds: [],
      carriedCandidates: [],
      candidates: [
        {
          lineage: { kind: 'NEW' },
          title: candidateFixture.title,
          summary: candidateFixture.summary,
          targetUsers: candidateFixture.targetUsers,
          coreInteraction: candidateFixture.coreInteraction,
          usageMoment: candidateFixture.usageMoment,
          appeal: candidateFixture.appeal,
          personalNeedRelationship: candidateFixture.personalNeedRelationship,
          technologyNecessity: candidateFixture.technologyNecessity,
          coreConcepts: candidateFixture.coreConcepts,
          mvpFeatures: candidateFixture.mvpFeatures,
          suggestedScope: candidateFixture.suggestedScope,
          risks: candidateFixture.risks,
          generationTags: candidateFixture.generationTags,
          evaluation: candidateFixture.evaluation,
        },
      ],
      generationRationale: candidateRoundFixture.generationRationale,
      diversityCheck: candidateRoundFixture.diversityCheck,
    })
    expect(receipt.resourceRevision).toBe(2)

    const mergeReceipt = await adapter.submitCandidateMerge({
      schemaVersion: 1,
      projectId: ids.project,
      discoverySessionId: ids.discoverySession,
      correlationId: ids.correlation,
      idempotencyKey: ids.idempotency,
      expectedSessionRevision: 1,
      candidate: {
        title: candidateFixture.title,
        summary: candidateFixture.summary,
        targetUsers: candidateFixture.targetUsers,
        coreInteraction: candidateFixture.coreInteraction,
        usageMoment: candidateFixture.usageMoment,
        appeal: candidateFixture.appeal,
        personalNeedRelationship: candidateFixture.personalNeedRelationship,
        technologyNecessity: candidateFixture.technologyNecessity,
        coreConcepts: candidateFixture.coreConcepts,
        mvpFeatures: candidateFixture.mvpFeatures,
        suggestedScope: candidateFixture.suggestedScope,
        risks: candidateFixture.risks,
        generationTags: candidateFixture.generationTags,
        evaluation: candidateFixture.evaluation,
      },
      generationRationale: candidateRoundFixture.generationRationale,
      diversityCheck: candidateRoundFixture.diversityCheck,
    })
    expect(mergeReceipt.resourceRevision).toBe(2)

    const specReceipt = await adapter.submitLearningSpec({
      schemaVersion: 1,
      projectId: ids.project,
      discoverySessionId: ids.discoverySession,
      correlationId: ids.correlation,
      idempotencyKey: ids.idempotency,
      expectedSessionRevision: 2,
      expectedSpecRevision: 0,
      draft: learningSpecDraftContentFixture,
    })
    expect(specReceipt.resourceRevision).toBe(2)
    expect(calls).toEqual([
      'get_discovery_context',
      'submit_candidate_round',
      'submit_candidate_merge',
      'submit_learning_spec',
    ])
  })

  it('fails closed when a Core tool response is malformed', async () => {
    const adapter = new DiscoveryAgentToolAdapter({
      callTool: async () => ({ structuredContent: { accepted: true } }),
    })
    await expect(
      adapter.getContext({
        schemaVersion: 1,
        kind: 'DISCOVERY_GET_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'DISCOVERY' },
        projectId: ids.project,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TOOL_RESPONSE' })
  })
})
