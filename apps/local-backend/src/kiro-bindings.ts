import { randomUUID } from 'node:crypto'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { projectSessionSnapshotSchema } from '@vibe-helper/contracts'
import {
  installKiroWorkspace,
  learnerScopeFrom,
} from '@vibe-helper/kiro-adapter/kiro-workspace-node'
import { privateDirectory } from '@vibe-helper/runtime'
import type { LocalMcpHandler } from './agent-host.js'
import { createKiroHookBinding } from './kiro-hook-binding.js'
import { createNativeCoreBinding } from './native-core-binding.js'

interface ActiveBinding {
  readonly taskId: string
  readonly revoke: () => void
}

export interface KiroBindResult {
  readonly projectId: string
  readonly taskId: string
  readonly workspace: string
  readonly spec: string
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
    },
  ) {}

  async bind(projectId: string): Promise<KiroBindResult> {
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
    const hook = createKiroHookBinding({
      application: this.options.application,
      binding: scope,
      workspace,
    })
    this.options.handlers.set(builder.path, builder.handler)
    this.options.handlers.set(hook.path, hook.handler)
    const directory = await privateDirectory(join(this.options.root, 'kiro-bindings', projectId))
    const bindingDescriptor = join(directory, 'builder-mcp.json')
    const hookDescriptor = join(directory, 'hook.json')
    await writePrivateJson(bindingDescriptor, {
      role: 'BUILDER',
      ...scope,
      workspace,
      toolNames: builder.toolNames,
      url: `${this.options.baseUrl()}${builder.path}`,
      authorization: builder.authorization,
    })
    await writePrivateJson(hookDescriptor, {
      projectId,
      taskId: task.id,
      url: `${this.options.baseUrl()}${hook.path}`,
      authorization: hook.authorization,
    })
    const installed = await installKiroWorkspace({
      workspace,
      binding: scope,
      nodeExecutable: this.options.nodeExecutable,
      hookScript: this.options.hookScript,
      hookDescriptor,
      bridgeScript: this.options.bridgeScript,
      bindingDescriptor,
      learnerScope: learnerScopeFrom(snapshot.learningSpec),
      spec: { project: snapshot.project, learningSpec: snapshot.learningSpec, task },
    })
    await hook.syncProfile().catch(() => null)
    this.#active.set(projectId, {
      taskId: task.id,
      revoke: () => {
        builder.revoke()
        hook.revoke()
        this.options.handlers.delete(builder.path)
        this.options.handlers.delete(hook.path)
        void writePrivateJson(bindingDescriptor, { status: 'REVOKED' }).catch(() => {})
        void writePrivateJson(hookDescriptor, { status: 'REVOKED' }).catch(() => {})
      },
    })
    return { projectId, taskId: task.id, workspace, spec: installed.spec }
  }

  close(): void {
    for (const binding of this.#active.values()) binding.revoke()
    this.#active.clear()
  }
}
