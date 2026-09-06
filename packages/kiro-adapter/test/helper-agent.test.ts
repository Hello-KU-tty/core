import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  createHelperAgentDefinition,
  HELPER_AGENT_NAME,
  type HelperAgentAdapterError,
  HelperAgentToolAdapter,
  HELPER_PROMPT_SOURCE,
  HELPER_PROMPT_VERSION,
  HELPER_TOOL_NAMES,
} from '../src/helper-agent.js'
import { loadHelperAgentDefinition } from '../src/helper-prompt-node.js'
import {
  builderTaskFixture,
  confirmedLearningSpecFixture,
  helperPersonalizationFixture,
  ids,
  projectFixture,
} from '../../contracts/test/fixtures.js'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))

describe('Helper Agent adapter', () => {
  it('loads the canonical prompt with only the role-bound Helper Core', async () => {
    const definition = await loadHelperAgentDefinition(repositoryRoot)

    expect(definition).toMatchObject({
      name: HELPER_AGENT_NAME,
      promptVersion: HELPER_PROMPT_VERSION,
      promptSource: HELPER_PROMPT_SOURCE,
      includeMcpJson: false,
      tools: ['@vibe-helper-helper-core'],
      allowedTools: ['@vibe-helper-helper-core'],
    })
    expect(definition.tools).not.toContain('fs_read')
    expect(definition.tools).not.toContain('fs_write')
    expect(definition.tools).not.toContain('execute_bash')
    expect(definition.prompt).toContain('sourceExcerpts')
    expect(definition.prompt).toContain('MISSING')
    expect(definition.prompt).toContain('Spec은 변경 가능한 초기 합의')
    expect(definition.prompt).toContain('사용자의 질문·결정·학습 권한을 제한')
    expect(definition.prompt).toContain('personalization')
    expect(definition.prompt).toContain('NO_RELEVANT_EVIDENCE')
    expect(definition.prompt).toContain('최대 5개 개념')
    expect(definition.prompt).toContain('OBSERVED`를 사용자 이해로 과장하지 마라')
    expect(definition.prompt).toContain('openIssueIds')
    expect(definition.prompt).toContain('과거 경험이 현재 코드와 같다고 단정하지 마라')
    expect(HELPER_TOOL_NAMES).toEqual(['get_helper_context', 'request_builder_context_refresh'])
  })

  it('rejects prompt drift', () => {
    expect(() => createHelperAgentDefinition('# Helper\n\n> Prompt version: `9.9.9`')).toThrowError(
      expect.objectContaining<Partial<HelperAgentAdapterError>>({ code: 'INVALID_PROMPT' }),
    )
  })

  it('validates Helper requests and structured Core responses', async () => {
    const calls: string[] = []
    const adapter = new HelperAgentToolAdapter({
      callTool: async (name) => {
        calls.push(name)
        if (name === 'get_helper_context') {
          return {
            structuredContent: {
              schemaVersion: 1,
              correlationId: ids.correlation,
              project: projectFixture,
              learningSpec: confirmedLearningSpecFixture,
              task: builderTaskFixture,
              liveContext: null,
              activeDecisions: [],
              focusedDecision: null,
              relevantLedgerEntries: [],
              personalization: helperPersonalizationFixture,
              recentEpisodes: [],
              contextReferences: [],
              referenceDetails: [],
              sourceExcerpts: [],
              pendingContextRefreshRequests: [],
              freshness: {
                currentContextVersion: null,
                observedContextVersion: null,
                status: 'MISSING',
                stale: true,
                refreshRequired: true,
              },
            },
          }
        }
        return {
          structuredContent: {
            schemaVersion: 1,
            correlationId: ids.correlation,
            accepted: true,
            resourceRevision: 1,
          },
        }
      },
    })

    await expect(
      adapter.getContext({
        schemaVersion: 1,
        kind: 'HELPER_GET_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'HELPER' },
        projectId: ids.project,
        taskId: ids.task,
        question: 'What is current?',
        relatedConceptNames: [],
      }),
    ).resolves.toMatchObject({ freshness: { status: 'MISSING' } })
    await expect(
      adapter.requestContextRefresh({
        schemaVersion: 1,
        kind: 'HELPER_REQUEST_CONTEXT_REFRESH',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'HELPER' },
        idempotencyKey: ids.idempotency,
        projectId: ids.project,
        taskId: ids.task,
        reason: 'The current Context is missing.',
      }),
    ).resolves.toMatchObject({ accepted: true })
    expect(calls).toEqual(['get_helper_context', 'request_builder_context_refresh'])
  })

  it('rejects invalid Core output and tool errors', async () => {
    const invalid = new HelperAgentToolAdapter({
      callTool: async () => ({ structuredContent: {} }),
    })
    await expect(
      invalid.getContext({
        schemaVersion: 1,
        kind: 'HELPER_GET_CONTEXT',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'HELPER' },
        projectId: ids.project,
        question: 'What is current?',
        relatedConceptNames: [],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TOOL_RESPONSE' })

    const failed = new HelperAgentToolAdapter({ callTool: async () => ({ isError: true }) })
    await expect(
      failed.requestContextRefresh({
        schemaVersion: 1,
        kind: 'HELPER_REQUEST_CONTEXT_REFRESH',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'HELPER' },
        idempotencyKey: ids.idempotency,
        projectId: ids.project,
        taskId: ids.task,
        reason: 'The current Context is missing.',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_ERROR' })
  })
})
