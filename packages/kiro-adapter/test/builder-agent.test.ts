import { mkdir, mkdtemp, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  BUILDER_AGENT_NAME,
  type BuilderAgentAdapterError,
  BuilderAgentToolAdapter,
  BUILDER_CORE_TOOL_NAMES,
  BUILDER_PROMPT_SOURCE,
  BUILDER_PROMPT_VERSION,
  createBuilderAgentDefinition,
} from '../src/builder-agent.js'
import { loadBuilderAgentDefinition } from '../src/builder-prompt-node.js'
import { BuilderCrewSlotBinding } from '../src/builder-crew-slot.js'
import { normalizeBuilderStreamLine, redactBuilderStreamText } from '../src/builder-stream.js'
import { guardBuilderToolInput } from '../src/builder-tool-guard.js'
import {
  builderTaskFixture,
  confirmedLearningSpecFixture,
  ids,
  projectFixture,
} from '../../contracts/test/fixtures.js'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))

describe('Builder Agent adapter', () => {
  it('loads the canonical prompt with only bounded native and Core tools', async () => {
    const definition = await loadBuilderAgentDefinition(repositoryRoot, 'node builder-guard.js')
    expect(definition).toMatchObject({
      name: BUILDER_AGENT_NAME,
      promptVersion: BUILDER_PROMPT_VERSION,
      promptSource: BUILDER_PROMPT_SOURCE,
      tools: ['fs_read', 'fs_write', 'execute_bash', '@vibe-helper-builder-core'],
      allowedTools: ['fs_read', 'fs_write', '@vibe-helper-builder-core'],
      toolsSettings: {
        read: { allowedPaths: ['./**'], deniedPaths: ['.kiro/**'] },
        write: { allowedPaths: ['./**'], deniedPaths: ['.kiro/**'] },
        shell: { denyByDefault: true },
      },
      hooks: { preToolUse: [{ command: 'node builder-guard.js' }] },
    })
    expect(definition.tools).not.toContain('web_search')
    expect(definition.tools).not.toContain('use_subagent')
    expect(definition.prompt).toContain('TASK_STARTED')
    expect(definition.prompt).toContain('TASK_COMPLETED')
    expect(definition.prompt).toContain('apply_decision_result')
    expect(BUILDER_CORE_TOOL_NAMES).toHaveLength(7)
  })

  it('rejects prompt drift and a missing path guard', () => {
    expect(() =>
      createBuilderAgentDefinition('# Builder\n\n> Prompt version: `9.9.9`', {
        guardCommand: 'node guard.js',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<BuilderAgentAdapterError>>({ code: 'INVALID_PROMPT' }),
    )
    expect(() =>
      createBuilderAgentDefinition('# Builder\n\n> Prompt version: `1.1.0`', {
        guardCommand: ' ',
      }),
    ).toThrowError(
      expect.objectContaining<Partial<BuilderAgentAdapterError>>({ code: 'INVALID_GUARD' }),
    )
  })

  it('validates semantic Builder requests and structured Core responses', async () => {
    const calls: string[] = []
    const adapter = new BuilderAgentToolAdapter({
      callTool: async (name) => {
        calls.push(name)
        if (name === 'get_builder_task') {
          return {
            structuredContent: {
              schemaVersion: 1,
              correlationId: ids.correlation,
              project: projectFixture,
              learningSpec: confirmedLearningSpecFixture,
              task: builderTaskFixture,
              liveContext: null,
              decisionRequests: [],
              decisionResolutions: [],
              decisionApplications: [],
              pendingContextRefreshRequests: [],
            },
          }
        }
        if (name === 'request_user_decision' || name === 'apply_decision_result') {
          return {
            structuredContent: {
              schemaVersion: 1,
              correlationId: ids.correlation,
              accepted: true,
              resourceRevision: 1,
              decisionId: ids.decision,
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
    expect(
      await adapter.getTask({
        schemaVersion: 1,
        kind: 'BUILDER_GET_TASK',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        projectId: ids.project,
        taskId: ids.task,
      }),
    ).toMatchObject({ task: { id: ids.task } })
    expect(
      await adapter.updateContext({
        schemaVersion: 1,
        projectId: ids.project,
        taskId: ids.task,
        correlationId: ids.correlation,
        idempotencyKey: ids.idempotency,
        expectedPreviousVersion: 0,
        checkpoint: 'TASK_STARTED',
        stage: 'Starting',
        currentGoal: 'Implement the MVP.',
        recentChanges: [],
        activeDecisionIds: [],
        activeConceptNames: ['discriminated union'],
        relatedFiles: [],
        nextActions: ['Run the initial test.'],
      }),
    ).toMatchObject({ accepted: true })
    expect(
      await adapter.requestDecision({
        schemaVersion: 1,
        projectId: ids.project,
        taskId: ids.task,
        correlationId: ids.correlation,
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000241',
        expectedTaskRevision: 1,
        expectedContextVersion: 1,
        decision: {
          category: 'DATA_MODEL',
          question: 'Should unknown fields be rejected or retained?',
          reasonRequiredNow: 'The parser result depends on this choice.',
          options: [
            {
              key: 'reject',
              label: 'Reject',
              description: 'Reject unknown fields.',
              impacts: ['Typos fail early.'],
              tradeoffs: [],
            },
            {
              key: 'retain',
              label: 'Retain',
              description: 'Keep unknown fields.',
              impacts: ['New fields remain visible.'],
              tradeoffs: [],
            },
          ],
          recommendedOptionKey: 'reject',
          recommendationRationale: 'Strict parsing catches mistakes early.',
          relatedConceptNames: ['runtime validation'],
          sourceReferences: [],
          independentWorkCanContinue: false,
        },
        context: {
          stage: 'Waiting for parser behavior',
          currentGoal: 'Choose the parser behavior.',
          recentChanges: [],
          activeConceptNames: ['runtime validation'],
          relatedFiles: [],
          nextActions: ['Apply the user choice.'],
          blockingReason: 'The parser branch depends on this choice.',
        },
      }),
    ).toMatchObject({ accepted: true, decisionId: ids.decision })
    expect(
      await adapter.applyDecision({
        schemaVersion: 1,
        projectId: ids.project,
        taskId: ids.task,
        decisionId: ids.decision,
        correlationId: ids.correlation,
        idempotencyKey: 'idem_00000000-0000-4000-8000-000000000242',
        expectedTaskRevision: 2,
        expectedContextVersion: 2,
        appliedResult: 'Implemented strict parser rejection.',
        sourceReferences: [],
        context: {
          stage: 'Applied parser behavior',
          currentGoal: 'Validate the selected parser behavior.',
          recentChanges: ['Implemented strict parsing.'],
          activeConceptNames: ['runtime validation'],
          relatedFiles: [],
          nextActions: ['Run tests.'],
        },
      }),
    ).toMatchObject({ accepted: true, decisionId: ids.decision })
    expect(calls).toEqual([
      'get_builder_task',
      'update_build_context',
      'request_user_decision',
      'apply_decision_result',
    ])
  })

  it('fails closed when the Core response is malformed', async () => {
    const adapter = new BuilderAgentToolAdapter({
      callTool: async () => ({ structuredContent: { accepted: true } }),
    })
    await expect(
      adapter.getTask({
        schemaVersion: 1,
        kind: 'BUILDER_GET_TASK',
        correlationId: ids.correlation,
        actor: { kind: 'AGENT', role: 'BUILDER' },
        projectId: ids.project,
        taskId: ids.task,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TOOL_RESPONSE' })
  })
})

describe('Builder native tool guard and transient stream', () => {
  it('allows workspace paths but rejects traversal, protected config, symlink escapes, and unsafe shell', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'vibe-helper-builder-guard-'))
    const outside = await mkdtemp(join(tmpdir(), 'vibe-helper-builder-outside-'))
    await mkdir(join(workspace, 'src'))
    await symlink(outside, join(workspace, 'escape'))

    await expect(
      guardBuilderToolInput(
        { tool_name: 'fs_write', tool_input: { path: 'src/index.ts' }, cwd: workspace },
        workspace,
      ),
    ).resolves.toEqual({ allowed: true })
    await expect(
      guardBuilderToolInput(
        {
          tool_name: 'write',
          tool_input: { operations: [{ mode: 'Create', path: 'src/second.ts' }] },
          cwd: workspace,
        },
        workspace,
      ),
    ).resolves.toEqual({ allowed: true })
    await expect(
      guardBuilderToolInput(
        { tool_name: 'fs_write', tool_input: { path: '../outside.ts' }, cwd: workspace },
        workspace,
      ),
    ).resolves.toMatchObject({ allowed: false, reasonCode: 'GUARD_PATH_ESCAPE' })
    await expect(
      guardBuilderToolInput(
        { tool_name: 'fs_read', tool_input: { path: '.kiro/agents/builder.json' }, cwd: workspace },
        workspace,
      ),
    ).resolves.toMatchObject({ allowed: false, reasonCode: 'GUARD_PROTECTED_PATH' })
    await expect(
      guardBuilderToolInput(
        { tool_name: 'fs_write', tool_input: { path: 'escape/secret.ts' }, cwd: workspace },
        workspace,
      ),
    ).resolves.toMatchObject({ allowed: false, reasonCode: 'GUARD_PATH_ESCAPE' })
    await expect(
      guardBuilderToolInput(
        { tool_name: 'execute_bash', tool_input: { command: 'node --test' }, cwd: workspace },
        workspace,
      ),
    ).resolves.toEqual({ allowed: true })
    await expect(
      guardBuilderToolInput(
        {
          tool_name: 'execute_bash',
          tool_input: { command: 'node ../../escape.mjs' },
          cwd: workspace,
        },
        workspace,
      ),
    ).resolves.toMatchObject({ allowed: false, reasonCode: 'GUARD_SHELL_DENIED' })
  })

  it('redacts credentials and host paths before exposing transient stream events', () => {
    const workspace = '/Users/example/generated/project'
    const text = redactBuilderStreamText(
      `api_key=top-secret Bearer abc.def ${workspace}/src/index.ts /Users/example/.ssh/id_ed25519`,
      workspace,
    )
    expect(text).not.toContain('top-secret')
    expect(text).not.toContain('abc.def')
    expect(text).not.toContain('.ssh')
    expect(text).toContain('[WORKSPACE]')
    expect(
      normalizeBuilderStreamLine(
        JSON.stringify({ type: 'tool_call', command: 'api_key=top-secret' }),
        4,
        workspace,
      ),
    ).toMatchObject({
      sequence: 4,
      kind: 'TOOL_CALL',
      transient: true,
      redactionStatus: 'VERIFIED_REDACTED',
    })
  })
})

describe('Builder Crew slot workspace binding', () => {
  it('binds the canonical project before dispatch and refuses late or unbound dispatch', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'vibe-helper-builder-slot-'))
    const calls: Array<{ path: string; body: Readonly<Record<string, unknown>> }> = []
    const binding = new BuilderCrewSlotBinding({
      post: async (path, body) => {
        calls.push({ path, body })
        return { ok: true }
      },
    })
    expect(() => binding.markFirstMessageDispatched('builder-unbound')).toThrowError(
      expect.objectContaining({ code: 'WORKSPACE_NOT_BOUND' }),
    )
    const canonical = await binding.bindWorkspaceBeforeFirstMessage('builder-1', workspace)
    binding.markFirstMessageDispatched('builder-1')
    expect(binding.workspaceFor('builder-1')).toBe(canonical)
    expect(calls).toEqual([
      { path: '/api/chat/slots/builder-1/project', body: { project: canonical } },
    ])
    await expect(
      binding.bindWorkspaceBeforeFirstMessage('builder-1', workspace),
    ).rejects.toMatchObject({ code: 'WORKSPACE_BINDING_TOO_LATE' })
  })
})
