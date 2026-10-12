import { randomUUID } from 'node:crypto'
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { projectSessionSnapshotSchema } from '@vibe-helper/contracts'
import {
  installKiroWorkspace,
  type KiroCommandApproval,
  learnerScopeFrom,
  parseKiroSteeringTemplates,
  setKiroCommandApproval,
} from '@vibe-helper/kiro-adapter/kiro-workspace-node'
import { privateDirectory } from '@vibe-helper/runtime'
import type { LocalMcpHandler } from './agent-host.js'
import { createKiroHookBinding } from './kiro-hook-binding.js'
import { createNativeCoreBinding } from './native-core-binding.js'
import { folderHasWork, type WorkspaceRegistry } from './workspace-registry.js'

interface ActiveBinding {
  readonly taskId: string
  readonly workspace: string
  readonly revoke: () => void
  readonly builderActivity: () => Promise<string | null>
}

export interface KiroBindRequest {
  /** The learner's open, empty Kiro folder to use as the Project folder. Omitted: generated one. */
  readonly workspace?: string
  /** The learner's command approval choice for this folder. Omitted: Kiro's rules stay as they are. */
  readonly approval?: KiroCommandApproval
}

type KiroPermissionsResult = 'WRITTEN' | 'UNCHANGED' | 'UNRECOGNIZED'

export interface KiroBindResult {
  readonly projectId: string
  readonly taskId: string
  readonly workspace: string
  readonly registered: boolean
  readonly spec: string
  readonly permissions: KiroPermissionsResult | 'NOT_REQUESTED'
}

const PROJECT_ID = /^project_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

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
  readonly #following = new Map<string, Promise<void>>()

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
      /** Unused since K17 removed the Kiro chat Helper agent; packaged installs still pass it. */
      readonly helperPrompt: string
      readonly homeDirectory?: string
    },
  ) {}

  /** The bound Project's Builder chat activity, for a Helper run outside Kiro chat. */
  builderActivity(projectId: string): Promise<string | null> {
    return this.#active.get(projectId)?.builderActivity() ?? Promise.resolve(null)
  }

  /**
   * Core start: binds again every Project that had a Kiro connection, so hooks and MCP bridges
   * already pointing at the private descriptors reach this Core without the learner reconnecting.
   * Folders that no longer exist are left alone. Returns the Project IDs that were bound.
   */
  async restore(): Promise<readonly string[]> {
    const names = await readdir(join(this.options.root, 'kiro-bindings')).catch(
      () => [] as string[],
    )
    const restored: string[] = []
    for (const projectId of names.filter((name) => PROJECT_ID.test(name)).sort()) {
      const result = await this.bind(projectId, {}, { restoring: true }).catch(() => null)
      if (result !== null) restored.push(projectId)
    }
    return restored
  }

  async bind(
    projectId: string,
    request: KiroBindRequest = {},
    mode: { readonly restoring?: boolean } = {},
  ): Promise<KiroBindResult> {
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
    // A restore never recreates a Project folder the learner removed.
    if (
      mode.restoring === true &&
      !(await stat(workspace).then(
        (info) => info.isDirectory(),
        () => false,
      ))
    )
      throw new Error('KIRO_RESTORE_FOLDER_MISSING')
    // The new descriptors below replace the old ones in place; nothing marks them revoked first,
    // so a bridge or hook never reads a stale revocation written after the new binding.
    this.#active.get(projectId)?.revoke()
    const scope = { projectId, taskId: task.id, correlationId: task.correlationId }
    const directory = await privateDirectory(join(this.options.root, 'kiro-bindings', projectId))
    const builder = createNativeCoreBinding({
      application: this.options.application,
      role: 'BUILDER',
      surface: 'KIRO_CHAT',
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
      queueFile: join(directory, 'hook-queue.jsonl'),
      ...(this.options.homeDirectory === undefined
        ? {}
        : { homeDirectory: this.options.homeDirectory }),
    })
    for (const binding of [helper, hook]) this.options.handlers.set(binding.path, binding.handler)
    // A Builder chat call may have started a follow-up Task (FR-BLD-008); the connection then
    // moves to it, so hooks record the learner's messages there and Steering and Spec show it.
    this.options.handlers.set(builder.path, {
      fetch: async (request) => {
        const response = await builder.handler.fetch(request)
        if (response.status !== 401) this.#followLatestTask(projectId, task.id)
        return response
      },
      close: () => builder.handler.close(),
    })
    const bindingDescriptor = join(directory, 'builder-mcp.json')
    const helperDescriptor = join(directory, 'helper-mcp.json')
    const hookDescriptor = join(directory, 'hook.json')
    for (const [file, role, binding] of [
      [bindingDescriptor, 'BUILDER', builder],
      [helperDescriptor, 'HELPER', helper],
    ] as const)
      await writePrivateJson(file, {
        role,
        // Project connections outlive one Core: a bridge follows the rewritten descriptor.
        lifecycle: 'PROJECT',
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
      // K17: one `/vibe-helper` in Kiro's menu, the steering turn; no separate Helper agent.
    })
    await hook.syncProfile().catch(() => null)
    // Learner prompts queued while no Core was connected are recorded as soon as one is.
    await hook.drainQueue().catch(() => 0)
    // Without a new choice, a folder pre-approved by an earlier installer gets the current rules.
    if (request.approval === undefined) await this.#applyApproval(workspace, 'UPGRADE')
    const permissions =
      request.approval === undefined
        ? 'NOT_REQUESTED'
        : await this.#applyApproval(workspace, request.approval)
    this.#active.set(projectId, {
      taskId: task.id,
      workspace,
      builderActivity: () => hook.builderActivity(),
      // Descriptors stay: their tokens die with these handlers, and a later bind or a restore by
      // the next Core rewrites them. Hooks queue and bridges wait until then.
      revoke: () => {
        for (const binding of [builder, helper, hook]) {
          binding.revoke()
          this.options.handlers.delete(binding.path)
        }
      },
    })
    return {
      projectId,
      taskId: task.id,
      workspace,
      registered: this.options.registry.get(projectId) === workspace,
      spec: installed.spec,
      permissions,
    }
  }

  /**
   * Binds again when the Project's current Task continues the bound one. Checks run one after
   * another per Project, so a follow-up started while a check is running is still followed.
   */
  #followLatestTask(projectId: string, boundTaskId: string): void {
    const check = async () => {
      if (this.#active.get(projectId)?.taskId !== boundTaskId) return
      const restored = await this.options.application.executeUi({
        schemaVersion: 1,
        kind: 'UI_RESTORE_PROJECT_SESSION',
        correlationId: `corr_${randomUUID()}`,
        actor: { kind: 'UI' },
        projectId,
        helperConversationLimit: 1,
      })
      if (!restored.success) return
      const current = projectSessionSnapshotSchema.parse(restored.data).currentTask
      if (current === null || current.id === boundTaskId) return
      if (!current.prerequisiteTaskIds.includes(boundTaskId)) return
      if (this.#active.get(projectId)?.taskId === boundTaskId) await this.bind(projectId)
    }
    const next = (this.#following.get(projectId) ?? Promise.resolve())
      .then(check)
      .catch(() => undefined)
    this.#following.set(projectId, next)
    void next.finally(() => {
      if (this.#following.get(projectId) === next) this.#following.delete(projectId)
    })
  }

  /** Settles once every pending follow of a new Task has finished (tests and shutdown). */
  async settled(): Promise<void> {
    await Promise.all([...this.#following.values()])
  }

  /**
   * The learner changed the approval choice: every Project folder bound in this Core follows it
   * now, so turning pre-approval off takes effect without reconnecting.
   */
  async setCommandApproval(
    approval: KiroCommandApproval,
  ): Promise<Readonly<Record<KiroPermissionsResult, number>>> {
    const counts = { WRITTEN: 0, UNCHANGED: 0, UNRECOGNIZED: 0 }
    const folders = new Set([...this.#active.values()].map((binding) => binding.workspace))
    for (const workspace of folders) counts[await this.#applyApproval(workspace, approval)] += 1
    return counts
  }

  #applyApproval(
    workspace: string,
    approval: KiroCommandApproval | 'UPGRADE',
  ): Promise<KiroPermissionsResult> {
    return setKiroCommandApproval({
      homeDirectory: this.options.homeDirectory ?? homedir(),
      workspace,
      approval,
    }).catch(() => 'UNRECOGNIZED' as const)
  }

  close(): void {
    for (const binding of this.#active.values()) binding.revoke()
    this.#active.clear()
  }
}
