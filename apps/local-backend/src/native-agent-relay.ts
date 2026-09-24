import { createHash, randomUUID } from 'node:crypto'
import { appendFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import { redactSensitiveText } from '@vibe-helper/application/redaction'
import {
  candidateIdSchema,
  helperContextSchema,
  projectSessionSnapshotSchema,
} from '@vibe-helper/contracts'
import {
  type AgentInvocation,
  type CoreRuntimeDescriptor,
  type WorkflowAgentPort,
  WorkflowError,
} from '@vibe-helper/runtime'
import type { LocalMcpHandler } from './agent-host.js'
import { describeNativeAnalystResult } from './native-analyst-diagnostic.js'
import { createNativeCoreBinding } from './native-core-binding.js'
import {
  composeNativeProtectedAnalystPrompt,
  composeNativeProtectedHelperPrompt,
} from './native-protected-prompt.js'
import { isPrivateDirectory, privateDirectory } from './private-files.js'

type NativeRole = 'DISCOVERY' | 'BUILDER' | 'HELPER' | 'EVIDENCE_ANALYST'
interface NativeJob {
  id: string
  projectId: string
  taskId: string | null
  discoverySessionId: string | null
  role: NativeRole
  workspace: string
  projectWorkspace: string
  separateHost: boolean
  protectedBuiltin: boolean
  helperHostWorkspace: string | null
  correlationId: string
  helperQuestion: string | null
  helperDecisionId: string | null
  promptIssued: boolean
  roleName: string
  bindingFile: string | null
  message: string
  state: 'WAITING' | 'CLAIMED' | 'CANCELLED' | 'DONE'
  onEvent: AgentInvocation['onEvent']
  resolve: (value: { text: string; stopReason: string }) => void
  reject: (error: Error) => void
  binding: ReturnType<typeof createNativeCoreBinding> | undefined
  descriptorFile: string | undefined
  timeout?: ReturnType<typeof setTimeout>
  leaseDeadlineAt: string
}
const roleFiles: Record<NativeRole, string> = {
  DISCOVERY: 'discovery.md',
  BUILDER: 'builder.md',
  HELPER: 'helper.md',
  EVIDENCE_ANALYST: 'evidence-analyst.md',
}
const coreActions = new Set([
  'DISCOVERY_GET_CONTEXT',
  'DISCOVERY_SUBMIT_CANDIDATE_PREVIEWS',
  'DISCOVERY_SUBMIT_CANDIDATE_ENRICHMENTS',
  'DISCOVERY_SUBMIT_CANDIDATE_ROUND',
  'DISCOVERY_SUBMIT_LEARNING_SPEC',
  'BUILDER_GET_TASK',
  'BUILDER_START_TASK',
  'BUILDER_UPDATE_LIVE_CONTEXT',
  'BUILDER_REQUEST_DECISION',
  'BUILDER_GET_DECISION_RESULT',
  'BUILDER_APPLY_DECISION',
  'BUILDER_COMPLETE_TASK',
  'HELPER_GET_CONTEXT',
  'HELPER_REQUEST_CONTEXT_REFRESH',
])
declare const __VIBE_PACKAGED_CORE__: boolean
const PERSISTENT_NATIVE_RUNTIME =
  typeof __VIBE_PACKAGED_CORE__ !== 'undefined' && __VIBE_PACKAGED_CORE__
    ? ''
    : '/Users/hurdoo/Library/Application Support/VibeHelper/NativeExperiment-20260913/runtime'
const HELPER_HOST_PREFIX = '__vibe-native-helper-'
function redactJobText(text: string, job: NativeJob): string {
  return redactSensitiveText(redactSensitiveText(text, job.workspace), job.projectWorkspace)
}
/** Extension-host relay for the IDE's built-in Agent. It never invokes Kiro CLI or a model API. */
export class NativeAgentRelay implements WorkflowAgentPort {
  readonly handlers = new Map<string, LocalMcpHandler>()
  readonly #jobs = new Map<string, NativeJob>()
  readonly #application: ApplicationService
  readonly #policy: WorkspacePathPolicy
  readonly #root: string
  readonly #repository: string
  readonly #portable:
    | { promptDirectory: string; bridgeScriptPath: string; runtime: CoreRuntimeDescriptor }
    | undefined
  readonly #singleWindowBuiltinH: boolean
  readonly #prepareBuilderTools:
    | ((workspace: string, signal: AbortSignal) => Promise<void>)
    | undefined
  #baseUrl: string | undefined
  #closed = false
  constructor(options: {
    application: ApplicationService
    policy: WorkspacePathPolicy
    root: string
    repository: string
    portable?: { promptDirectory: string; bridgeScriptPath: string; runtime: CoreRuntimeDescriptor }
    singleWindowBuiltinH?: boolean
    prepareBuilderTools?: (workspace: string, signal: AbortSignal) => Promise<void>
  }) {
    this.#application = options.application
    this.#policy = options.policy
    this.#root = options.root
    this.#repository = options.repository
    this.#portable = options.portable
    this.#prepareBuilderTools = options.prepareBuilderTools
    this.#singleWindowBuiltinH = options.singleWindowBuiltinH === true
  }
  setBaseUrl(url: string): void {
    this.#baseUrl = url
  }
  async invoke(request: AgentInvocation): Promise<{ text: string; stopReason: string }> {
    if (this.#closed || !this.#baseUrl || request.signal.aborted)
      throw new WorkflowError('NATIVE_RUNTIME_CLOSED')
    const role: NativeRole =
      request.mode === 'EVIDENCE_ANALYST'
        ? 'EVIDENCE_ANALYST'
        : request.mode === 'BUILDER'
          ? 'BUILDER'
          : request.mode === 'HELPER'
            ? 'HELPER'
            : 'DISCOVERY'
    if (
      request.mode === 'ENRICH_SELECTED' &&
      (!Array.isArray(request.requestedCandidateIds) ||
        request.requestedCandidateIds.length === 0 ||
        request.requestedCandidateIds.length > 10 ||
        new Set(request.requestedCandidateIds).size !== request.requestedCandidateIds.length ||
        request.requestedCandidateIds.some((id) => !candidateIdSchema.safeParse(id).success))
    )
      throw new WorkflowError('NATIVE_SELECTED_CANDIDATE_SCOPE_INVALID')
    const restored = await this.#application.executeUi({
      schemaVersion: 1,
      actor: { kind: 'UI' },
      kind: 'UI_RESTORE_PROJECT_SESSION',
      projectId: request.projectId,
      correlationId: request.correlationId,
      helperConversationLimit: 1,
    })
    if (!restored.success) throw new WorkflowError(restored.error.code)
    const snapshot = projectSessionSnapshotSchema.parse(restored.data)
    if (role === 'DISCOVERY') {
      if (snapshot.discoverySession?.id !== request.discoverySessionId)
        throw new WorkflowError('NATIVE_DISCOVERY_SCOPE_MISMATCH')
    } else if (snapshot.currentTask?.id !== request.taskId && role !== 'EVIDENCE_ANALYST') {
      throw new WorkflowError('NATIVE_TASK_SCOPE_MISMATCH')
    }
    const projectWorkspace =
      role === 'DISCOVERY'
        ? await realpath(this.#policy.generatedWorkspaceRoot)
        : await this.#policy.resolveProjectWorkspace(snapshot.project, request.correlationId)
    const workspace =
      role === 'HELPER' || role === 'EVIDENCE_ANALYST'
        ? await this.#helperHostWorkspace(request.projectId, projectWorkspace)
        : projectWorkspace
    const helperHostWorkspace =
      this.#singleWindowBuiltinH && role === 'BUILDER'
        ? await this.#helperHostWorkspace(request.projectId, projectWorkspace)
        : null
    const protectedBuiltin =
      this.#singleWindowBuiltinH && (role === 'HELPER' || role === 'EVIDENCE_ANALYST')
    const id = `native_${randomUUID()}`
    const roleName = `vibe-native-${role.toLowerCase().replaceAll('_', '-')}-${id.slice(-8)}`
    const binding =
      role === 'EVIDENCE_ANALYST' || protectedBuiltin
        ? undefined
        : createNativeCoreBinding({
            application: this.#application,
            role,
            projectId: request.projectId,
            correlationId: request.correlationId,
            ...(role === 'DISCOVERY'
              ? { discoverySessionId: request.discoverySessionId as string }
              : { taskId: request.taskId as string }),
            ...(role === 'DISCOVERY' ? { toolNames: this.#toolsForMode(request.mode) } : {}),
          })
    if (binding) this.handlers.set(binding.path, binding.handler)
    const descriptorFile = binding
      ? join(await realpath(this.#root), `native-binding-${id}.json`)
      : undefined
    try {
      if (role === 'BUILDER') await this.#prepareBuilderTools?.(workspace, request.signal)
      if (!protectedBuiltin)
        await this.#prepareConfig({
          workspace,
          role,
          roleName,
          binding,
          descriptorFile,
          request,
          id,
        })
      else {
        if (role !== 'HELPER' && role !== 'EVIDENCE_ANALYST')
          throw new WorkflowError('NATIVE_BUILTIN_ROLE_INVALID')
        if (role === 'HELPER' && (!request.taskId || !request.helperQuestion?.trim()))
          throw new WorkflowError('NATIVE_HELPER_QUESTION_SCOPE_INVALID')
      }
    } catch (error) {
      if (binding) {
        binding.revoke()
        this.handlers.delete(binding.path)
        await binding.handler.close()
      }
      throw error
    }
    return new Promise((resolve, reject) => {
      const leaseMs = role === 'BUILDER' ? 660_000 : 300_000
      // The timer starts when the invocation is queued, not when the IDE
      // claims it. Send the same absolute deadline to the native observer so
      // Builder can request a confirmed stop before this lease expires.
      const leaseDeadlineAt = new Date(Date.now() + leaseMs).toISOString()
      const job: NativeJob = {
        id,
        projectId: request.projectId,
        taskId: request.taskId ?? null,
        discoverySessionId: request.discoverySessionId ?? null,
        role,
        workspace,
        projectWorkspace,
        separateHost: workspace !== projectWorkspace,
        roleName,
        bindingFile: descriptorFile ?? null,
        descriptorFile,
        message: protectedBuiltin && role === 'HELPER' ? '' : request.message,
        protectedBuiltin,
        helperHostWorkspace,
        correlationId: request.correlationId,
        helperQuestion: request.helperQuestion ?? null,
        helperDecisionId: request.helperDecisionId ?? null,
        promptIssued: false,
        state: 'WAITING',
        onEvent: request.onEvent,
        resolve,
        reject,
        binding,
        leaseDeadlineAt,
      }
      const abort = () => {
        this.#finish(job, new WorkflowError('CANCELLED'))
      }
      job.resolve = (value) => {
        request.signal.removeEventListener('abort', abort)
        resolve(value)
      }
      job.reject = (error) => {
        request.signal.removeEventListener('abort', abort)
        reject(error)
      }
      request.signal.addEventListener('abort', abort, { once: true })
      job.timeout = setTimeout(
        () =>
          this.#finish(
            job,
            new WorkflowError(
              job.state === 'WAITING' ? 'NATIVE_IDE_WORKER_UNAVAILABLE' : 'NATIVE_IDE_TURN_TIMEOUT',
            ),
          ),
        leaseMs,
      )
      this.#jobs.set(id, job)
      if (request.signal.aborted) abort()
    })
  }
  claim(
    workspace: string,
    activeRoles: readonly NativeRole[] = [],
  ): {
    id: string
    projectId: string
    taskId: string | null
    correlationId: string
    discoverySessionId: string | null
    role: NativeRole
    workspace: string
    roleName: string
    bindingFile: string | null
    message: string
    projectWorkspace: string
    protectedBuiltin: boolean
    helperHostWorkspace: string | null
    leaseDeadlineAt: string
  } | null {
    const busyRoles = new Set(activeRoles)
    for (const claimed of this.#jobs.values()) {
      if (
        claimed.state === 'CLAIMED' &&
        (claimed.workspace === workspace ||
          (claimed.protectedBuiltin && claimed.projectWorkspace === workspace))
      ) {
        // The MCP pool belongs to the IDE host, not to a custom Agent session.
        // A second role on the same host can replace an active role's catalog.
        if (claimed.separateHost && !claimed.protectedBuiltin) return null
        busyRoles.add(claimed.role)
      }
    }
    const waiting = [...this.#jobs.values()].filter(
      (j) =>
        j.state === 'WAITING' &&
        (j.workspace === workspace || (j.protectedBuiltin && j.projectWorkspace === workspace)) &&
        !busyRoles.has(j.role) &&
        (!j.protectedBuiltin ||
          ![...this.#jobs.values()].some(
            (claimed) =>
              claimed.state === 'CLAIMED' &&
              claimed.role === 'DISCOVERY' &&
              claimed.projectId === j.projectId,
          )) &&
        (j.role !== 'DISCOVERY' ||
          !this.#singleWindowBuiltinH ||
          ![...this.#jobs.values()].some(
            (claimed) =>
              claimed.state === 'CLAIMED' &&
              claimed.protectedBuiltin &&
              claimed.projectId === j.projectId,
          )) &&
        (j.role !== 'BUILDER' ||
          !this.#singleWindowBuiltinH ||
          ![...this.#jobs.values()].some(
            (claimed) =>
              claimed.state === 'CLAIMED' &&
              claimed.protectedBuiltin &&
              claimed.projectWorkspace === workspace,
          )) &&
        (!j.protectedBuiltin ||
          ![...this.#jobs.values()].some(
            (claimed) =>
              claimed.state === 'CLAIMED' &&
              claimed.protectedBuiltin &&
              claimed.workspace === j.workspace,
          )),
    )
    const job =
      waiting.find((j) => j.role === 'HELPER' && j.protectedBuiltin) ??
      waiting.find((j) => j.workspace === workspace) ??
      waiting[0]
    if (!job) return null
    job.state = 'CLAIMED'
    return {
      id: job.id,
      projectId: job.projectId,
      taskId: job.taskId,
      correlationId: job.correlationId,
      discoverySessionId: job.discoverySessionId,
      role: job.role,
      workspace: job.workspace,
      roleName: job.roleName,
      bindingFile: job.bindingFile,
      message: job.protectedBuiltin ? '' : job.message,
      projectWorkspace: job.projectWorkspace,
      protectedBuiltin: job.protectedBuiltin,
      helperHostWorkspace: job.helperHostWorkspace,
      leaseDeadlineAt: job.leaseDeadlineAt,
    }
  }
  async protectedPrompt(id: string): Promise<string> {
    const job = this.#jobs.get(id)
    if (
      job?.state !== 'CLAIMED' ||
      !job.protectedBuiltin ||
      job.promptIssued ||
      (job.role !== 'HELPER' && job.role !== 'EVIDENCE_ANALYST')
    )
      throw new WorkflowError('NATIVE_H_PROMPT_NOT_AVAILABLE')
    job.promptIssued = true
    return this.#protectedBuiltinPrompt(
      job.role,
      {
        projectId: job.projectId,
        ...(job.taskId === null ? {} : { taskId: job.taskId }),
        correlationId: job.correlationId,
        ...(job.helperQuestion === null ? {} : { helperQuestion: job.helperQuestion }),
        ...(job.helperDecisionId === null ? {} : { helperDecisionId: job.helperDecisionId }),
        message: job.message,
      },
      job.projectWorkspace,
      job.workspace,
    )
  }
  pendingWorkspace(): string | null {
    // H never becomes an editor workspace switch target. In single-window
    // mode its jobs are claimed by the authoritative Project W worker.
    return (
      [...this.#jobs.values()].find((j) => j.state === 'WAITING' && !j.separateHost)?.workspace ??
      null
    )
  }
  pendingHelperWorkspace(): string | null {
    return (
      [...this.#jobs.values()].find(
        (job) => job.state === 'WAITING' && job.separateHost && !job.protectedBuiltin,
      )?.workspace ?? null
    )
  }
  async #helperHostWorkspace(projectId: string, projectWorkspace: string): Promise<string> {
    const root = await realpath(this.#root)
    const generatedRoot = await realpath(this.#policy.generatedWorkspaceRoot)
    if (generatedRoot !== join(root, 'workspaces'))
      throw new WorkflowError('NATIVE_HELPER_HOST_ROOT_INVALID')
    const tag = createHash('sha256').update(projectId).digest('hex').slice(0, 24)
    const host = join(generatedRoot, `${HELPER_HOST_PREFIX}${tag}`)
    if (host === projectWorkspace) throw new WorkflowError('NATIVE_HELPER_HOST_NOT_SEPARATE')
    try {
      await mkdir(host, { mode: 0o700 })
      if (process.platform === 'win32') await privateDirectory(host)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    const info = await lstat(host)
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      !(await isPrivateDirectory(host)) ||
      (await realpath(host)) !== host
    )
      throw new WorkflowError('NATIVE_HELPER_HOST_PATH_INVALID')
    return host
  }
  async #protectedBuiltinPrompt(
    role: 'HELPER' | 'EVIDENCE_ANALYST',
    request: Pick<
      AgentInvocation,
      'projectId' | 'taskId' | 'correlationId' | 'helperQuestion' | 'helperDecisionId' | 'message'
    >,
    projectWorkspace: string,
    helperWorkspace: string,
  ): Promise<string> {
    const rolePrompt = await readFile(
      join(
        this.#portable?.promptDirectory ?? join(this.#repository, 'docs/agent-prompts'),
        roleFiles[role],
      ),
      'utf8',
    )
    let composed: string
    if (role === 'HELPER') {
      if (!request.taskId || !request.helperQuestion?.trim())
        throw new WorkflowError('NATIVE_HELPER_QUESTION_SCOPE_INVALID')
      const result = await this.#application.executeAgent('HELPER', {
        schemaVersion: 1,
        kind: 'HELPER_GET_CONTEXT',
        actor: { kind: 'AGENT', role: 'HELPER' },
        correlationId: request.correlationId,
        projectId: request.projectId,
        taskId: request.taskId,
        ...(request.helperDecisionId === undefined ? {} : { decisionId: request.helperDecisionId }),
        question: request.helperQuestion,
        relatedConceptNames: [],
      })
      if (!result.success) throw new WorkflowError(result.error.code)
      const context = helperContextSchema.parse(result.data)
      let refreshStatus: 'NOT_NEEDED' | 'REQUESTED' | 'UNAVAILABLE' = 'NOT_NEEDED'
      if (context.freshness.refreshRequired) {
        const requested = await this.#application.executeAgent('HELPER', {
          schemaVersion: 1,
          kind: 'HELPER_REQUEST_CONTEXT_REFRESH',
          actor: { kind: 'AGENT', role: 'HELPER' },
          correlationId: request.correlationId,
          idempotencyKey: `idem_${randomUUID()}`,
          projectId: request.projectId,
          taskId: request.taskId,
          ...(context.freshness.currentContextVersion === null
            ? {}
            : { observedContextVersion: context.freshness.currentContextVersion }),
          reason: 'Helper needs current Builder context for this user question.',
        })
        refreshStatus = requested.success ? 'REQUESTED' : 'UNAVAILABLE'
      }
      composed = composeNativeProtectedHelperPrompt({
        rolePrompt,
        question: request.helperQuestion,
        refreshStatus,
        context,
      })
    } else {
      composed = composeNativeProtectedAnalystPrompt({ rolePrompt, message: request.message })
    }
    const prompt = redactSensitiveText(
      redactSensitiveText(composed, projectWorkspace),
      helperWorkspace,
    )
    if (Buffer.byteLength(prompt, 'utf8') > 400_000)
      throw new WorkflowError('NATIVE_BUILTIN_CONTEXT_TOO_LARGE')
    return prompt
  }
  status(id: string): 'WAITING' | 'CLAIMED' | 'CANCELLED' | 'DONE' | 'UNKNOWN' {
    return this.#jobs.get(id)?.state ?? 'UNKNOWN'
  }
  event(id: string, value: unknown): void {
    const job = this.#jobs.get(id)
    if (job?.state !== 'CLAIMED' || !value || typeof value !== 'object')
      throw new WorkflowError('NATIVE_JOB_NOT_CLAIMED')
    const event = value as Record<string, unknown>
    if (event.kind === 'TEXT' && typeof event.text === 'string' && event.text.length <= 65536)
      job.onEvent({ kind: 'TEXT', text: redactJobText(event.text, job) })
    else if (event.kind === 'TOOL' && typeof event.update === 'object' && event.update !== null) {
      const update = event.update as Record<string, unknown>
      const keys = (value: unknown): value is string[] =>
        Array.isArray(value) &&
        value.length <= 32 &&
        value.every((key) => typeof key === 'string' && /^[a-zA-Z_]{1,40}$/.test(key))
      const toolName = update.toolName
      const kind = update.protocolKind
      const path = update.relativePath
      const command = update.command
      const output = update.output
      const shellExitCode = update.shellExitCode ?? null
      const kiroOutputTransformation = update.kiroOutputTransformation ?? null
      const coreAction = update.coreAction
      const envelopeInputAction = update.envelopeInputAction ?? null
      const bridgeErrorCode = update.bridgeErrorCode ?? null
      const nativeToolIdClass = update.nativeToolIdClass ?? null
      const commandPattern =
        /^(?:\.\\\.kiro\\vibe-tools\.cmd )?(?:node --test(?: [A-Za-z0-9._/:=-]+)*|pnpm test(?: [A-Za-z0-9._/:=,-]+)*|pnpm rebuild esbuild|pnpm run [a-zA-Z0-9:_-]+(?: -- [A-Za-z0-9._/:=,-]+)*|pnpm install --frozen-lockfile|pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile|npm test(?: -- [A-Za-z0-9._/:=,-]+)*|npm run [a-zA-Z0-9:_-]+(?: -- [A-Za-z0-9._/:=,-]+)*|npm install(?: --include=dev)?)$/
      if (
        update.sessionUpdate !== 'tool_call_update' ||
        !['READ', 'WRITE', 'DECISION', 'OTHER'].includes(String(update.titleClass)) ||
        typeof update.srcPath !== 'boolean' ||
        !keys(update.updateKeys) ||
        !keys(update.rawInputKeys) ||
        !Array.isArray(update.validationFieldMentions) ||
        update.validationFieldMentions.length > 8 ||
        update.validationFieldMentions.some(
          (field) =>
            ![
              'activeDecisionIds',
              'relatedFiles',
              'stage',
              'stageHints',
              'checkpoint',
              'expectedPreviousVersion',
              '_meta',
            ].includes(field),
        ) ||
        !Array.isArray(update.validationIssueKinds) ||
        update.validationIssueKinds.length > 5 ||
        update.validationIssueKinds.some(
          (issue) =>
            ![
              'invalid_type',
              'required',
              'unrecognized_keys',
              'too_small',
              'invalid_value',
            ].includes(issue),
        ) ||
        !['read', 'edit', 'execute', 'search', 'think', 'fetch', 'other', 'unknown'].includes(
          String(kind),
        ) ||
        !['pending', 'in_progress', 'completed', 'failed', 'unknown'].includes(
          String(update.nativeStatus),
        ) ||
        (nativeToolIdClass !== null &&
          !['USER_INPUT', 'OTHER'].includes(String(nativeToolIdClass))) ||
        (update.toolId !== null &&
          (typeof update.toolId !== 'string' || !/^[a-f0-9]{12}$/.test(update.toolId))) ||
        (toolName !== null && !['read', 'search', 'write', 'shell'].includes(String(toolName))) ||
        (toolName === 'read' && kind !== 'read') ||
        (toolName === 'search' && kind !== 'search') ||
        (toolName === 'write' && kind !== 'edit') ||
        (toolName === 'shell' && kind !== 'execute') ||
        (coreAction !== null &&
          (kind !== 'other' || typeof coreAction !== 'string' || !coreActions.has(coreAction))) ||
        (envelopeInputAction !== null &&
          (kind !== 'other' ||
            typeof envelopeInputAction !== 'string' ||
            !coreActions.has(envelopeInputAction) ||
            !update.rawInputKeys.includes('inputJson'))) ||
        (update.coreIsError !== null && typeof update.coreIsError !== 'boolean') ||
        (update.coreSuccess !== null && typeof update.coreSuccess !== 'boolean') ||
        (update.coreErrorCode !== null &&
          (typeof update.coreErrorCode !== 'string' ||
            !/^[A-Z0-9_]{1,100}$/.test(update.coreErrorCode))) ||
        (coreAction === null &&
          (update.coreIsError !== null ||
            update.coreSuccess !== null ||
            update.coreErrorCode !== null)) ||
        (bridgeErrorCode !== null &&
          (![
            'BRIDGE_ENVELOPE_SCHEMA_TOO_LARGE',
            'BRIDGE_ENVELOPE_WRAPPER_INVALID',
            'BRIDGE_ENVELOPE_JSON_REQUIRED',
            'BRIDGE_ENVELOPE_JSON_TOO_LARGE',
            'BRIDGE_ENVELOPE_JSON_INVALID',
            'BRIDGE_ENVELOPE_OBJECT_REQUIRED',
            'BRIDGE_ENVELOPE_UNKNOWN',
          ].includes(String(bridgeErrorCode)) ||
            kind !== 'other' ||
            update.nativeStatus !== 'failed' ||
            coreAction !== null ||
            update.rawOutputType !== 'object' ||
            !update.rawInputKeys.includes('inputJson'))) ||
        (path !== null &&
          ((toolName !== 'read' && toolName !== 'search' && toolName !== 'write') ||
            typeof path !== 'string' ||
            !/^[A-Za-z0-9._/-]{1,160}$/.test(path) ||
            path.split('/').includes('..') ||
            path.split('/').includes('.kiro') ||
            path.startsWith('/'))) ||
        (command !== null &&
          (toolName !== 'shell' ||
            typeof command !== 'string' ||
            command.length > 160 ||
            command.includes('..') ||
            command.includes('~') ||
            !commandPattern.test(command) ||
            redactJobText(command, job) !== command)) ||
        (shellExitCode !== null &&
          (toolName !== 'shell' ||
            kind !== 'execute' ||
            !Number.isSafeInteger(shellExitCode) ||
            (shellExitCode as number) < -255 ||
            (shellExitCode as number) > 255)) ||
        (kiroOutputTransformation !== null &&
          (toolName !== 'shell' ||
            kind !== 'execute' ||
            !['CLIPPED', 'OFFLOADED'].includes(String(kiroOutputTransformation)))) ||
        (update.acpTruncationMarkerPresent !== undefined &&
          typeof update.acpTruncationMarkerPresent !== 'boolean') ||
        (output !== null && (typeof output !== 'string' || output.length > 2048)) ||
        typeof update.outputTruncated !== 'boolean' ||
        !['string', 'none', 'object', 'number', 'boolean'].includes(String(update.rawOutputType))
      )
        throw new WorkflowError('NATIVE_EVENT_INVALID')
      job.onEvent({
        kind: 'TOOL',
        update: {
          sessionUpdate: 'tool_call_update',
          titleClass: update.titleClass,
          srcPath: update.srcPath,
          updateKeys: update.updateKeys,
          protocolKind: kind,
          nativeStatus: update.nativeStatus,
          ...(nativeToolIdClass === null ? {} : { nativeToolIdClass }),
          toolId: update.toolId,
          toolName,
          coreAction,
          ...(envelopeInputAction === null ? {} : { envelopeInputAction }),
          coreIsError: update.coreIsError,
          coreSuccess: update.coreSuccess,
          coreErrorCode: update.coreErrorCode,
          ...(bridgeErrorCode === null ? {} : { bridgeErrorCode }),
          relativePath: path,
          command,
          ...(shellExitCode === null ? {} : { shellExitCode }),
          ...(kiroOutputTransformation === null ? {} : { kiroOutputTransformation }),
          ...(update.acpTruncationMarkerPresent === undefined
            ? {}
            : { acpTruncationMarkerPresent: update.acpTruncationMarkerPresent }),
          output: output === null ? null : redactJobText(output as string, job),
          outputTruncated: update.outputTruncated,
          rawOutputType: update.rawOutputType,
          rawInputKeys: update.rawInputKeys,
          validationFieldMentions: update.validationFieldMentions,
          validationIssueKinds: update.validationIssueKinds,
        },
      })
    } else if (event.kind === 'PERMISSION_DENIED') job.onEvent({ kind: 'PERMISSION_DENIED' })
    else throw new WorkflowError('NATIVE_EVENT_INVALID')
  }
  complete(id: string, result: unknown): void {
    const job = this.#jobs.get(id)
    if (job?.state !== 'CLAIMED') throw new WorkflowError('NATIVE_JOB_NOT_CLAIMED')
    if (!result || typeof result !== 'object') throw new WorkflowError('NATIVE_RESULT_INVALID')
    const value = result as Record<string, unknown>
    if (typeof value.errorCode === 'string' && /^[A-Z0-9_]{1,100}$/.test(value.errorCode)) {
      this.#finish(job, new WorkflowError(value.errorCode))
    } else if (
      typeof value.text === 'string' &&
      Buffer.byteLength(value.text, 'utf8') <= 1_048_576 &&
      typeof value.stopReason === 'string'
    ) {
      if (job.role === 'EVIDENCE_ANALYST' && this.#root === PERSISTENT_NATIVE_RUNTIME) {
        const summary = describeNativeAnalystResult(value.text)
        void appendFile(
          join(this.#root, 'native-analyst-shape.jsonl'),
          `${JSON.stringify({ at: new Date().toISOString(), nativeJobId: job.id, ...summary })}\n`,
          { mode: 0o600 },
        ).catch(() => undefined)
      }
      this.#finish(job, undefined, {
        text: redactJobText(value.text, job),
        stopReason: value.stopReason,
      })
    } else throw new WorkflowError('NATIVE_RESULT_INVALID')
  }
  async close(): Promise<void> {
    this.#closed = true
    for (const job of this.#jobs.values())
      this.#finish(job, new WorkflowError('NATIVE_RUNTIME_CLOSED'))
  }
  #finish(job: NativeJob, error?: Error, value?: { text: string; stopReason: string }): void {
    if (job.state === 'DONE' || job.state === 'CANCELLED') return
    job.state = error ? 'CANCELLED' : 'DONE'
    job.message = ''
    job.helperQuestion = null
    job.helperDecisionId = null
    if (job.timeout) clearTimeout(job.timeout)
    job.binding?.revoke()
    if (job.binding) {
      this.handlers.delete(job.binding.path)
      void job.binding.handler.close()
    }
    if (job.descriptorFile)
      void writeFile(job.descriptorFile, JSON.stringify({ status: 'REVOKED' }), { mode: 0o600 })
    if (error) job.reject(error)
    else if (value) job.resolve(value)
    const expiry = setTimeout(() => this.#jobs.delete(job.id), 30_000)
    expiry.unref()
  }
  #toolsForMode(mode: AgentInvocation['mode']): readonly string[] {
    if (mode === 'PREVIEW') return ['get_discovery_context', 'submit_candidate_previews']
    if (mode.startsWith('ENRICH')) return ['get_discovery_context', 'submit_candidate_enrichments']
    if (mode === 'ROUND') return ['get_discovery_context', 'submit_candidate_round']
    if (mode === 'MERGE') return ['get_discovery_context', 'submit_candidate_merge']
    if (mode === 'SPEC') return ['submit_learning_spec']
    if (mode === 'SPEC_RECOVERY') return ['get_discovery_context', 'submit_learning_spec']
    throw new WorkflowError('NATIVE_DISCOVERY_MODE_INVALID')
  }
  async #prepareConfig(options: {
    workspace: string
    role: NativeRole
    roleName: string
    binding: ReturnType<typeof createNativeCoreBinding> | undefined
    descriptorFile: string | undefined
    request: AgentInvocation
    id: string
  }): Promise<void> {
    const { workspace, role, roleName, binding, descriptorFile } = options
    const prompt = await readFile(
      join(
        this.#portable?.promptDirectory ?? join(this.#repository, 'docs/agent-prompts'),
        roleFiles[role],
      ),
      'utf8',
    )
    const directory = join(workspace, '.kiro', 'agents')
    for (const path of [join(workspace, '.kiro'), directory]) {
      const info = await lstat(path).catch((error) => {
        if (error?.code === 'ENOENT') return null
        throw error
      })
      if (info?.isSymbolicLink()) throw new WorkflowError('NATIVE_CONFIG_SYMLINK_DENIED')
    }
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if ((await realpath(directory)) !== resolve(directory))
      throw new WorkflowError('NATIVE_CONFIG_PATH_ESCAPED')
    if (binding && descriptorFile) {
      await writeFile(
        descriptorFile,
        JSON.stringify({
          role,
          projectId: options.request.projectId,
          correlationId: options.request.correlationId,
          workspace,
          toolNames: binding.toolNames,
          ...(role === 'DISCOVERY'
            ? {
                discoverySessionId: options.request.discoverySessionId,
                mode: options.request.mode,
                requestedCandidateIds: options.request.requestedCandidateIds ?? [],
              }
            : { taskId: options.request.taskId }),
          url: `${this.#baseUrl}${binding.path}`,
          authorization: binding.authorization,
        }),
        { mode: 0o600, flag: 'wx' },
      )
    }
    const tools = role === 'BUILDER' ? ['read', 'write', 'shell'] : []
    const names = binding?.toolNames ?? []
    const receiptRoot = await realpath(this.#root)
    const receiptFile =
      receiptRoot.startsWith('/private/tmp/') ||
      (!(typeof __VIBE_PACKAGED_CORE__ !== 'undefined' && __VIBE_PACKAGED_CORE__) &&
        process.env.VIBE_NATIVE_PERSISTENT_DIAGNOSTICS === '1' &&
        receiptRoot === PERSISTENT_NATIVE_RUNTIME)
        ? join(receiptRoot, 'native-core-receipts.jsonl')
        : null
    const config = {
      name: roleName,
      description: `Native ${role} for one Core run`,
      prompt,
      includeMcpJson: false,
      includePowers: false,
      resources: [],
      tools: [...tools, ...names.map((name) => `@vibe-native-core/${name}`)],
      mcpServers:
        !binding || !descriptorFile
          ? {}
          : {
              'vibe-native-core': {
                command: this.#portable?.runtime.executable ?? '/opt/homebrew/opt/node@24/bin/node',
                args: [
                  ...(this.#portable?.runtime.args ?? []),
                  this.#portable?.bridgeScriptPath ??
                    join(this.#repository, 'scripts/native-core-stdio-bridge.mjs'),
                  descriptorFile,
                  workspace,
                ],
                ...(receiptFile || this.#portable
                  ? {
                      env: {
                        ...this.#portable?.runtime.env,
                        ...(receiptFile ? { VIBE_NATIVE_BRIDGE_RECEIPT_FILE: receiptFile } : {}),
                      },
                    }
                  : {}),
              },
            },
      permissions: {
        rules: [
          ...names.map((name) => ({
            capability: 'mcp',
            match: [`vibe-native-core/${name}`],
            effect: 'allow',
          })),
          ...(role === 'BUILDER'
            ? [
                {
                  capability: 'fs_read',
                  match: ['.kiro/**', `${workspace}/.kiro/**`],
                  effect: 'deny',
                },
                {
                  capability: 'fs_write',
                  match: ['.kiro/**', `${workspace}/.kiro/**`],
                  effect: 'deny',
                },
                { capability: 'fs_read', match: ['**'], effect: 'ask' },
                { capability: 'fs_write', match: ['**'], effect: 'ask' },
                { capability: 'shell', effect: 'ask' },
              ]
            : [
                { capability: 'fs_write', effect: 'deny' },
                { capability: 'shell', effect: 'deny' },
              ]),
          ...(this.#portable
            ? [
                ...(role !== 'BUILDER' ? [{ capability: 'fs_read', effect: 'deny' }] : []),
                { capability: 'web_search', effect: 'deny' },
                ...(role === 'EVIDENCE_ANALYST' ? [{ capability: 'mcp', effect: 'deny' }] : []),
              ]
            : []),
        ],
      },
    }
    await writeFile(join(directory, `${roleName}.json`), `${JSON.stringify(config)}\n`, {
      mode: 0o600,
      flag: 'wx',
    })
  }
}
