import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { projectSessionSnapshotSchema } from '@vibe-helper/contracts'
import {
  allowKiroCoreTools,
  installKiroWorkspace,
  learnerScopeFrom,
  parseKiroSteeringTemplates,
} from '@vibe-helper/kiro-adapter/kiro-workspace-node'
import { privateDirectory } from '@vibe-helper/runtime'
import type { LocalMcpHandler } from './agent-host.js'
import { createKiroHookBinding } from './kiro-hook-binding.js'
import { createNativeCoreBinding } from './native-core-binding.js'
import { folderHasWork, type WorkspaceRegistry } from './workspace-registry.js'

interface ActiveBinding {
  readonly taskId: string
  readonly revoke: () => void
  readonly builderActivity: () => Promise<string | null>
}

export interface KiroBindRequest {
  /** The learner's open, empty Kiro folder to use as the Project folder. Omitted: generated one. */
  readonly workspace?: string
  /** The learner agreed to stop Kiro asking before each Vibe Helper Core tool in this folder. */
  readonly allowCoreTools?: boolean
}

export interface KiroBindResult {
  readonly projectId: string
  readonly taskId: string
  readonly workspace: string
  readonly registered: boolean
  readonly spec: string
  readonly coreTools: 'WRITTEN' | 'ALREADY_ALLOWED' | 'UNRECOGNIZED' | 'NOT_REQUESTED'
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
  // A fresh file each time keeps 0600 and a single link, as the bridge and hook runner require.
  const next = `${path}.${randomUUID()}.tmp`
  await writeFile(next, JSON.stringify(value), { mode: 0o600, flag: 'wx' })
  await rename(next, path)
}

/**
 * Kiro-native connections, one per Project: a Builder MCP binding for the learner's Kiro chat and
 * a chat-only hook binding, plus the workspace files that point Kiro at them.
 */
export class KiroBindingManager {
  readonly #active = new Map<string, ActiveBinding>()

  constructor(
    private readonly options: {
      readonly application: ApplicationService
      readonly policy: WorkspacePathPolicy
      readonly root: string
      readonly handlers: Map<string, LocalMcpHandler>
      readonly baseUrl: () => string
      readonly nodeExecutable: string
      readonly bridgeScript: string
      readonly hookScript: string
      readonly registry: WorkspaceRegistry
      /** `kiro-steering.md` and the canonical `helper.md` (repository or packaged copies). */
      readonly steeringTemplate: string
      readonly helperPrompt: string
      readonly homeDirectory?: string
    },
  ) {}

  /** The bound Project's Builder chat activity, for a Helper run outside Kiro chat. */
  builderActivity(projectId: string): Promise<string | null> {
    return this.#active.get(projectId)?.builderActivity() ?? Promise.resolve(null)
  }

  async bind(projectId: string, request: KiroBindRequest = {}): Promise<KiroBindResult> {
    const restored = await this.options.application.executeUi({
      schemaVersion: 1,
      kind: 'UI_RESTORE_PROJECT_SESSION',
      correlationId: `corr_${randomUUID()}`,
      actor: { kind: 'UI' },
      projectId,
      helperConversationLimit: 1,
    })
    if (!restored.success) throw new Error(restored.error.code)
    const snapshot = projectSessionSnapshotSchema.parse(restored.data)
    const task = snapshot.currentTask
    if (task === null || snapshot.learningSpec?.status !== 'CONFIRMED')
      throw new Error('KIRO_BIND_TASK_NOT_READY')
    // Templates are read before anything changes, so a broken install fails without side effects.
    const templates = parseKiroSteeringTemplates(
      await readFile(this.options.steeringTemplate, 'utf8'),
    )
    const helperPrompt = await readFile(this.options.helperPrompt, 'utf8')
    if (request.workspace !== undefined) {
      // Work already started in the generated folder stays there instead of being split.
      if (this.options.registry.get(projectId) === undefined) {
        const generated = await this.options.policy.resolveProjectWorkspace(
          snapshot.project,
          task.correlationId,
        )
        if (await folderHasWork(generated)) throw new Error('PROJECT_HAS_GENERATED_FOLDER')
      }
      await this.options.registry.register(projectId, request.workspace)
    }
    const workspace = await this.options.policy.resolveProjectWorkspace(
      snapshot.project,
      task.correlationId,
    )
    this.#active.get(projectId)?.revoke()
    const scope = { projectId, taskId: task.id, correlationId: task.correlationId }
    const builder = createNativeCoreBinding({
      application: this.options.application,
      role: 'BUILDER',
      ...scope,
    })
    const helper = createNativeCoreBinding({
      application: this.options.application,
      role: 'HELPER',
      ...scope,
    })
    const hook = createKiroHookBinding({
      application: this.options.application,
      binding: scope,
      workspace,
      ...(this.options.homeDirectory === undefined
        ? {}
        : { homeDirectory: this.options.homeDirectory }),
    })
    for (const binding of [builder, helper, hook])
      this.options.handlers.set(binding.path, binding.handler)
    const directory = await privateDirectory(join(this.options.root, 'kiro-bindings', projectId))
    const bindingDescriptor = join(directory, 'builder-mcp.json')
    const helperDescriptor = join(directory, 'helper-mcp.json')
    const hookDescriptor = join(directory, 'hook.json')
    for (const [file, role, binding] of [
      [bindingDescriptor, 'BUILDER', builder],
      [helperDescriptor, 'HELPER', helper],
    ] as const)
      await writePrivateJson(file, {
        role,
        ...scope,
        workspace,
        toolNames: binding.toolNames,
        url: `${this.options.baseUrl()}${binding.path}`,
        authorization: binding.authorization,
      })
    await writePrivateJson(hookDescriptor, {
      projectId,
      taskId: task.id,
      url: `${this.options.baseUrl()}${hook.path}`,
      authorization: hook.authorization,
    })
    const installed = await installKiroWorkspace({
      workspace,
      templates,
      binding: scope,
      nodeExecutable: this.options.nodeExecutable,
      hookScript: this.options.hookScript,
      hookDescriptor,
      bridgeScript: this.options.bridgeScript,
      bindingDescriptor,
      learnerScope: learnerScopeFrom(snapshot.learningSpec),
      spec: { project: snapshot.project, learningSpec: snapshot.learningSpec, task },
      helperAgent: { helperPrompt, helperDescriptor },
    })
    await hook.syncProfile().catch(() => null)
    const coreTools = request.allowCoreTools
      ? await allowKiroCoreTools({
          homeDirectory: this.options.homeDirectory ?? homedir(),
          workspace,
        }).catch(() => 'UNRECOGNIZED' as const)
      : 'NOT_REQUESTED'
    this.#active.set(projectId, {
      taskId: task.id,
      builderActivity: () => hook.builderActivity(),
      revoke: () => {
        for (const binding of [builder, helper, hook]) {
          binding.revoke()
          this.options.handlers.delete(binding.path)
        }
        for (const file of [bindingDescriptor, helperDescriptor, hookDescriptor])
          void writePrivateJson(file, { status: 'REVOKED' }).catch(() => {})
      },
    })
    return {
      projectId,
      taskId: task.id,
      workspace,
      registered: this.options.registry.get(projectId) === workspace,
      spec: installed.spec,
      coreTools,
    }
  }

  close(): void {
    for (const binding of this.#active.values()) binding.revoke()
    this.#active.clear()
  }
}
