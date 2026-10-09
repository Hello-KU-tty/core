import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { projectSessionSnapshotSchema } from '@vibe-helper/contracts'
import { KiroAcpError, KiroAcpSession } from '@vibe-helper/kiro-adapter/acp-node'
import { createRoleBoundMcpHttpHandler } from '@vibe-helper/mcp-server/role-server'
import { type AgentInvocation, type WorkflowAgentPort, WorkflowError } from '@vibe-helper/runtime'
import { guardCommand, privateDirectory } from './private-files.js'

export interface LocalMcpHandler {
  fetch(request: Request): Promise<Response>
  close(): Promise<void>
}
const definitions = {
  PREVIEW: [
    'discovery-preview',
    'DISCOVERY',
    ['get_discovery_context', 'submit_candidate_previews'],
  ],
  ENRICH_FIRST: [
    'discovery-enrichment',
    'DISCOVERY',
    ['get_discovery_context', 'submit_candidate_enrichments'],
  ],
  ENRICH_SECOND: [
    'discovery-enrichment',
    'DISCOVERY',
    ['get_discovery_context', 'submit_candidate_enrichments'],
  ],
  ENRICH_SELECTED: [
    'discovery-enrichment',
    'DISCOVERY',
    ['get_discovery_context', 'submit_candidate_enrichments'],
  ],
  ROUND: ['discovery-round', 'DISCOVERY', ['get_discovery_context', 'submit_candidate_round']],
  MERGE: ['discovery-merge', 'DISCOVERY', ['get_discovery_context', 'submit_candidate_merge']],
  SPEC: ['discovery-spec', 'DISCOVERY', ['submit_learning_spec']],
  SPEC_RECOVERY: [
    'discovery-spec-recovery',
    'DISCOVERY',
    ['get_discovery_context', 'submit_learning_spec'],
  ],
  BUILDER: [
    'builder',
    'BUILDER',
    [
      'get_builder_task',
      'start_task',
      'update_build_context',
      'request_user_decision',
      'get_decision_result',
      'apply_decision_result',
      'complete_task',
    ],
  ],
  HELPER: ['helper', 'HELPER', ['get_helper_context', 'request_builder_context_refresh']],
  EVIDENCE_ANALYST: ['evidence-analyst', 'EVIDENCE_ANALYST', []],
} as const

export class LocalAgentHost implements WorkflowAgentPort {
  readonly handlers = new Map<string, LocalMcpHandler>()
  #baseUrl: string | undefined
  // Models this account could not use, skipped for the rest of the process.
  readonly #unavailableModels = new Set<string>()
  constructor(
    readonly options: {
      application: ApplicationService
      policy: WorkspacePathPolicy
      agentRoot: string
      definitionsRoot: string
      guardPath: string
      executable: string
      model: string
      /**
       * Per-role models; roles without one use `model`. A list is tried in order: a model the
       * account cannot use (for example a preview model on a free account) falls to the next.
       */
      roleModels?: Partial<
        Record<'DISCOVERY' | 'BUILDER' | 'HELPER' | 'EVIDENCE_ANALYST', string | readonly string[]>
      >
      /** Kiro-native mode: the Builder is the learner's own Kiro chat, never a CLI run. */
      builderInHostChat?: boolean
      /**
       * Canonical role prompts (docs/agent-prompts or the packaged copy). When set, a non-Builder
       * role uses its canonical prompt instead of the older generated Agent JSON prompt.
       */
      promptDirectory?: string
      /**
       * Kiro-native: the learner's Builder chat activity for a Helper run, added to the question
       * as a labeled record. Agent-authored; never learner Evidence.
       */
      helperSupplement?: (projectId: string) => Promise<string | null>
    },
  ) {}
  setBaseUrl(value: string): void {
    this.#baseUrl = value
  }
  async invoke(request: AgentInvocation): Promise<{ text: string; stopReason: string }> {
    if (this.#baseUrl === undefined || request.signal.aborted) throw new WorkflowError('CANCELLED')
    const [suffix, role, toolNames] = definitions[request.mode]
    if (role === 'BUILDER' && this.options.builderInHostChat)
      throw new WorkflowError('BUILDER_RUNS_IN_HOST_CHAT')
    const canonicalFile = {
      DISCOVERY: 'discovery.md',
      HELPER: 'helper.md',
      EVIDENCE_ANALYST: 'evidence-analyst.md',
    }[role as 'DISCOVERY' | 'HELPER' | 'EVIDENCE_ANALYST']
    const original =
      this.options.promptDirectory !== undefined && canonicalFile !== undefined
        ? {
            prompt: (
              await readFile(join(this.options.promptDirectory, canonicalFile), 'utf8')
            ).replaceAll('\r\n', '\n'),
          }
        : (JSON.parse(
            await readFile(
              join(this.options.definitionsRoot, `vibe-helper-${suffix}.json`),
              'utf8',
            ),
          ) as { prompt: string; toolsSettings?: unknown })
    if (typeof original.prompt !== 'string' || original.prompt.length < 100)
      throw new WorkflowError('AGENT_DEFINITION_INVALID')
    const configured = this.options.roleModels?.[role] ?? this.options.model
    const candidates = typeof configured === 'string' ? [configured] : [...configured]
    if (candidates.length === 0) throw new WorkflowError('AGENT_MODEL_REQUIRED')
    // Keep the last candidate even if it failed before, so a run always has a model to try.
    const models = [
      ...candidates.slice(0, -1).filter((model) => !this.#unavailableModels.has(model)),
      ...candidates.slice(-1),
    ]
    const unique = randomUUID()
    const name = `vibe-helper-local-${suffix}-${unique}`
    let cwd = await privateDirectory(join(this.options.agentRoot, unique))
    if (role === 'BUILDER') {
      const restored = await this.options.application.executeUi({
        schemaVersion: 1,
        actor: { kind: 'UI' },
        kind: 'UI_RESTORE_PROJECT_SESSION',
        projectId: request.projectId,
        correlationId: request.correlationId,
        helperConversationLimit: 1,
      })
      if (!restored.success) throw new WorkflowError(restored.error.code)
      const snapshot = projectSessionSnapshotSchema.parse(restored.data)
      if (snapshot.currentTask?.id !== request.taskId)
        throw new WorkflowError('TASK_BINDING_MISMATCH')
      cwd = await this.options.policy.resolveProjectWorkspace(
        snapshot.project,
        request.correlationId,
      )
    }
    const configDirectory = await privateDirectory(join(cwd, '.kiro', 'agents'))
    const configPath = join(configDirectory, `${name}.json`)
    const path = `/mcp/${unique}`
    const credential = `Bearer ${randomBytes(32).toString('hex')}`
    let active = true
    let session: KiroAcpSession | undefined
    let handler: LocalMcpHandler | undefined
    const revoke = (): void => {
      active = false
      void session?.cancel()
    }
    request.signal.addEventListener('abort', revoke, { once: true })
    try {
      if (request.signal.aborted) throw new WorkflowError('CANCELLED')
      if (role !== 'EVIDENCE_ANALYST') {
        const core = createRoleBoundMcpHttpHandler({
          role,
          application: this.options.application,
          toolNames,
          binding: {
            projectId: request.projectId,
            correlationId: request.correlationId,
            ...(request.discoverySessionId === undefined
              ? {}
              : { discoverySessionId: request.discoverySessionId }),
            ...(request.taskId === undefined ? {} : { taskId: request.taskId }),
            isActive: () => active && !request.signal.aborted,
          },
        })
        handler = {
          close: () => core.close(),
          fetch: async (webRequest) => {
            const supplied = Buffer.from(webRequest.headers.get('authorization') ?? '')
            const expected = Buffer.from(credential)
            if (
              !active ||
              request.signal.aborted ||
              supplied.length !== expected.length ||
              !timingSafeEqual(supplied, expected)
            )
              return new Response(null, { status: 401 })
            return core.fetch(webRequest)
          },
        }
        this.handlers.set(path, handler)
      }
      const native = role === 'BUILDER' ? ['fs_read', 'fs_write', 'execute_bash'] : []
      const toolList = [...native, ...(handler === undefined ? [] : ['@vibe-helper-local-core'])]
      await writeFile(
        configPath,
        JSON.stringify({
          name,
          description: `Local ${role} run`,
          prompt: original.prompt,
          model: models[0],
          includeMcpJson: false,
          resources: [],
          tools: toolList,
          allowedTools: toolList,
          mcpServers:
            handler === undefined
              ? {}
              : {
                  'vibe-helper-local-core': {
                    url: `${this.#baseUrl}${path}`,
                    headers: { Authorization: credential },
                    timeout: 60_000,
                  },
                },
          ...(role !== 'BUILDER'
            ? {}
            : {
                toolsSettings: original.toolsSettings,
                hooks: {
                  preToolUse: [
                    { command: guardCommand(process.execPath, this.options.guardPath, cwd) },
                  ],
                },
              }),
        }),
        { mode: 0o600, flag: 'wx' },
      )
      const supplement =
        role === 'HELPER'
          ? await this.options.helperSupplement?.(request.projectId).catch(() => null)
          : null
      for (const [index, model] of models.entries()) {
        session = await KiroAcpSession.connect({
          executable: this.options.executable,
          cwd,
          agent: name,
          // The flag overrides the definition's model, so a fallback reuses the same Agent file.
          model,
          onEvent: request.onEvent,
          signal: request.signal,
          // Keep package-manager cache writes out of the developer's global cache.
          environment:
            role === 'BUILDER'
              ? { ...process.env, NPM_CONFIG_CACHE: join(cwd, '.vibe-helper', 'npm-cache') }
              : process.env,
          turnTimeoutMs: role === 'BUILDER' ? 600_000 : 240_000,
        })
        if (request.signal.aborted) throw new WorkflowError('CANCELLED')
        try {
          return await session.prompt(
            supplement ? `${request.message}\n\n${supplement}` : request.message,
          )
        } catch (error) {
          // Only an unusable model is retried: the provider refused before running the turn.
          if (!(error instanceof KiroAcpError && error.code === 'MODEL_UNAVAILABLE')) throw error
          this.#unavailableModels.add(model)
          await session.close()
          if (index === models.length - 1) throw error
        }
      }
      throw new WorkflowError('AGENT_MODEL_UNAVAILABLE')
    } finally {
      active = false
      request.signal.removeEventListener('abort', revoke)
      await session?.close()
      this.handlers.delete(path)
      await handler?.close()
      // Preserve diagnostics directory without leaving a credential in a finished Agent definition.
      await writeFile(
        configPath,
        JSON.stringify({
          name,
          description: 'Revoked local run',
          prompt: 'This run has ended.',
          tools: [],
          allowedTools: [],
          resources: [],
          mcpServers: {},
          includeMcpJson: false,
        }),
        { mode: 0o600 },
      ).catch(() => undefined)
    }
  }
}
