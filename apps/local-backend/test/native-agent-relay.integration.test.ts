import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, readdir, realpath, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { ApplicationService, WorkspacePathPolicy } from '@vibe-helper/application'
import {
  builderTaskSchema,
  candidateRoundSchema,
  discoveryFeedbackSchema,
  discoverySessionSchema,
  learningSpecRevisionSchema,
  projectCandidateRevisionSchema,
  projectSchema,
} from '@vibe-helper/contracts'
import { openInMemorySqliteStorage } from '@vibe-helper/storage-sqlite'
import { describe, expect, it } from 'vitest'
import {
  builderTaskFixture,
  candidateFixture,
  candidateRoundFixture,
  confirmedLearningSpecFixture,
  discoveryFeedbackFixture,
  discoverySessionFixture,
  draftLearningSpecFixture,
  ids,
  projectFixture,
} from '../../../packages/contracts/test/fixtures.js'
import { NativeAgentRelay } from '../src/native-agent-relay.js'
import {
  composeNativeProtectedAnalystPrompt,
  composeNativeProtectedHelperPrompt,
} from '../src/native-protected-prompt.js'

const require = createRequire(import.meta.url)
const { boundedCoreRole } = require('../../../examples/kiro-native-host/native-client.cjs')

// Windows provisioning includes real ACL subprocesses, not just in-memory jobs.
const jobPollAttempts = process.platform === 'win32' ? 1500 : 100
describe('native IDE Agent relay', { timeout: 60_000 }, () => {
  it('routes protected Helper and Analyst through one W worker with fresh Core context', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibe-native-single-window-'))
    const workspaces = join(root, 'workspaces')
    const workspacePath = join(workspaces, 'projects', ids.project)
    await mkdir(workspacePath, { recursive: true, mode: 0o700 })
    const workspace = await realpath(workspacePath)
    const storage = await openInMemorySqliteStorage()
    storage.transaction((repository) => {
      repository.appendProject(
        projectSchema.parse({
          ...projectFixture,
          generatedWorkspacePath: `projects/${ids.project}`,
        }),
      )
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
      repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
      repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
      repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(confirmedLearningSpecFixture))
      repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
    })
    const policy = await WorkspacePathPolicy.create(workspaces)
    const relay = new NativeAgentRelay({
      application: new ApplicationService({ storage, workspacePolicy: policy }),
      policy,
      root,
      repository: resolve('.'),
      singleWindowBuiltinH: true,
    })
    relay.setBaseUrl('http://127.0.0.1:47831')
    const invoke = (mode: 'BUILDER' | 'HELPER' | 'EVIDENCE_ANALYST', message: string) =>
      relay.invoke({
        mode,
        projectId: ids.project,
        correlationId: ids.correlation,
        ...(mode === 'EVIDENCE_ANALYST' ? {} : { taskId: ids.task }),
        ...(mode === 'HELPER' ? { helperQuestion: 'Why keep the result immutable?' } : {}),
        message,
        signal: new AbortController().signal,
        onEvent: () => undefined,
      })
    const waitClaim = async (roles: ('BUILDER' | 'HELPER' | 'EVIDENCE_ANALYST')[] = []) => {
      for (let n = 0; n < jobPollAttempts; n++) {
        const job = relay.claim(workspace, roles)
        if (job) return job
        await new Promise((done) => setTimeout(done, 10))
      }
      throw new Error('NATIVE_JOB_NOT_READY')
    }
    const invokedAt = Date.now()
    const builder = invoke('BUILDER', 'Read the current Task.')
    const builderJob = await waitClaim()
    const builderDeadline = Date.parse(builderJob.leaseDeadlineAt)
    expect(builderDeadline).toBeGreaterThanOrEqual(invokedAt + 660_000)
    expect(builderDeadline).toBeLessThanOrEqual(Date.now() + 660_000)
    expect(builderJob.helperHostWorkspace).toBeTruthy()
    expect(builderJob.protectedBuiltin).toBe(false)
    expect(builderJob.bindingFile).toBeTruthy()
    const helper = invoke('HELPER', 'Runtime wrapper with exact user message.')
    const helperJob = await waitClaim(['BUILDER'])
    expect(helperJob).toMatchObject({
      role: 'HELPER',
      projectWorkspace: workspace,
      protectedBuiltin: true,
      bindingFile: null,
      message: '',
    })
    expect(helperJob.workspace).toBe(builderJob.helperHostWorkspace)
    const helperPrompt = await relay.protectedPrompt(helperJob.id)
    expect(helperPrompt).toContain('Why keep the result immutable?')
    expect(helperPrompt).toContain('already executed the exact read-only get_helper_context')
    expect(helperPrompt).toContain('Validated Core Helper context JSON:')
    const helperContext = JSON.parse(
      helperPrompt.slice(
        helperPrompt.lastIndexOf('Validated Core Helper context JSON: ') +
          'Validated Core Helper context JSON: '.length,
      ),
    )
    expect(helperPrompt).toBe(
      composeNativeProtectedHelperPrompt({
        rolePrompt: await readFile(resolve('docs/agent-prompts/helper.md'), 'utf8'),
        question: 'Why keep the result immutable?',
        refreshStatus: 'REQUESTED',
        context: helperContext,
      }),
    )
    await expect(relay.protectedPrompt(helperJob.id)).rejects.toThrow(
      'NATIVE_H_PROMPT_NOT_AVAILABLE',
    )
    const discovery = relay.invoke({
      mode: 'PREVIEW',
      projectId: ids.project,
      correlationId: ids.correlation,
      discoverySessionId: ids.discoverySession,
      message: 'Read the Discovery context.',
      signal: new AbortController().signal,
      onEvent: () => undefined,
    })
    const discoveryWorkspace = await realpath(workspaces)
    await expect.poll(() => relay.pendingWorkspace(), { timeout: 5000 }).toBe(discoveryWorkspace)
    expect(relay.claim(discoveryWorkspace)).toBeNull()
    const analyst = invoke('EVIDENCE_ANALYST', '{"episode":"synthetic"}')
    expect(relay.claim(workspace, ['BUILDER', 'HELPER'])).toBeNull()
    relay.complete(helperJob.id, { text: 'A read-only explanation.', stopReason: 'end_turn' })
    await helper
    let rootJob = relay.claim(discoveryWorkspace)
    for (let n = 0; n < jobPollAttempts && !rootJob; n++) {
      await new Promise((done) => setTimeout(done, 10))
      rootJob = relay.claim(discoveryWorkspace)
    }
    if (!rootJob) throw new Error('NATIVE_DISCOVERY_JOB_NOT_READY')
    expect(relay.claim(workspace, ['BUILDER'])).toBeNull()
    relay.complete(rootJob.id, { text: 'Discovery turn ended.', stopReason: 'end_turn' })
    await discovery
    const analystJob = await waitClaim(['BUILDER'])
    expect(analystJob).toMatchObject({
      role: 'EVIDENCE_ANALYST',
      protectedBuiltin: true,
      bindingFile: null,
      message: '',
    })
    const analystPrompt = await relay.protectedPrompt(analystJob.id)
    expect(analystPrompt).toContain('episode')
    expect(analystPrompt).toBe(
      composeNativeProtectedAnalystPrompt({
        rolePrompt: await readFile(resolve('docs/agent-prompts/evidence-analyst.md'), 'utf8'),
        message: '{"episode":"synthetic"}',
      }),
    )
    relay.complete(analystJob.id, { text: '{"proposals":[]}', stopReason: 'end_turn' })
    await analyst
    expect(builderJob.bindingFile).not.toBeNull()
    relay.complete(builderJob.id, { text: 'Builder turn ended.', stopReason: 'end_turn' })
    await builder
    await relay.close()
    storage.close()
  })
  it('passes a run-bound Discovery job to the exact generated workspace and revokes its Core binding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibe-native-relay-'))
    const workspaces = join(root, 'workspaces')
    await mkdir(workspaces)
    const canonicalWorkspaces = await realpath(workspaces)
    const storage = await openInMemorySqliteStorage()
    const application = new ApplicationService({
      storage,
      workspacePolicy: await WorkspacePathPolicy.create(workspaces),
    })
    const projectId = `project_${randomUUID()}`
    const correlationId = `corr_${randomUUID()}`
    const started = await application.executeUi({
      schemaVersion: 1,
      actor: { kind: 'UI' },
      correlationId,
      kind: 'UI_START_DISCOVERY',
      projectId,
      idempotencyKey: `idem_${randomUUID()}`,
      input: { learningGoal: 'TypeScript unions for a local event viewer' },
    })
    expect(started.success).toBe(true)
    const restored = await application.executeUi({
      schemaVersion: 1,
      actor: { kind: 'UI' },
      correlationId,
      kind: 'UI_RESTORE_PROJECT_SESSION',
      projectId,
      helperConversationLimit: 1,
    })
    if (!restored.success || !restored.data.discoverySession) throw new Error('SESSION_MISSING')
    const relay = new NativeAgentRelay({
      application,
      policy: await WorkspacePathPolicy.create(workspaces),
      root,
      repository: resolve('.'),
    })
    relay.setBaseUrl('http://127.0.0.1:47831')
    const events: unknown[] = []
    const pending = relay.invoke({
      mode: 'PREVIEW',
      projectId,
      correlationId,
      discoverySessionId: restored.data.discoverySession.id,
      message: 'Submit previews.',
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
    })
    let job = relay.claim(canonicalWorkspaces)
    for (let n = 0; n < jobPollAttempts && !job; n++) {
      await new Promise((done) => setTimeout(done, 10))
      job = relay.claim(canonicalWorkspaces)
    }
    if (!job) await pending
    expect(job).not.toBeNull()
    if (!job?.bindingFile) throw new Error('NATIVE_JOB_MISSING')
    expect(relay.claim(canonicalWorkspaces)).toBeNull()
    const descriptor = JSON.parse(await readFile(job.bindingFile, 'utf8'))
    expect(descriptor).toMatchObject({
      role: 'DISCOVERY',
      projectId,
      discoverySessionId: restored.data.discoverySession.id,
      mode: 'PREVIEW',
      requestedCandidateIds: [],
      toolNames: ['get_discovery_context', 'submit_candidate_previews'],
    })
    expect(boundedCoreRole(canonicalWorkspaces, job.roleName, descriptor, job.bindingFile)).toBe(
      true,
    )
    expect(() =>
      relay.event(job.id, {
        kind: 'TOOL',
        update: {
          sessionUpdate: 'tool_call_update',
          titleClass: 'READ',
          srcPath: false,
          updateKeys: ['rawInput'],
          rawInputKeys: ['command'],
          validationFieldMentions: [],
          validationIssueKinds: [],
          protocolKind: 'other',
          nativeStatus: 'completed',
          toolId: 'aaaaaaaaaaaa',
          toolName: null,
          coreAction: 'DISCOVERY_GET_CONTEXT',
          coreIsError: false,
          coreSuccess: true,
          coreErrorCode: null,
          relativePath: null,
          command: null,
          output: 'token=fixture-sensitive-value',
          outputTruncated: false,
          rawOutputType: 'string',
          rawInput: { secret: 'must-not-stream' },
        },
      }),
    ).not.toThrow()
    const safeUpdate = (events[0] as { update: Record<string, unknown> }).update
    // Recording an observed command is separate from granting shell permission.
    const shellUpdate = {
      ...safeUpdate,
      protocolKind: 'execute',
      toolName: 'shell',
      coreAction: null,
      coreIsError: null,
      coreSuccess: null,
      output: null,
      shellExitCode: 0,
    }
    for (const command of [
      '.\\.kiro\\vibe-tools.cmd pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile',
      '.\\.kiro\\vibe-tools.cmd pnpm install --frozen-lockfile',
      '.\\.kiro\\vibe-tools.cmd pnpm run build',
      '.\\.kiro\\vibe-tools.cmd pnpm test',
      '.\\.kiro\\vibe-tools.cmd pnpm run smoke',
    ]) {
      expect(() =>
        relay.event(job.id, { kind: 'TOOL', update: { ...shellUpdate, command } }),
      ).not.toThrow()
      expect(events.pop()).toMatchObject({ update: { command, shellExitCode: 0 } })
    }
    for (const command of [
      '.\\.kiro\\vibe-tools.cmd pnpm test; whoami',
      '.\\.kiro\\other.cmd pnpm test',
      '.\\.kiro\\vibe-tools.cmd node ../../outside.js',
    ])
      expect(() =>
        relay.event(job.id, { kind: 'TOOL', update: { ...shellUpdate, command } }),
      ).toThrow('NATIVE_EVENT_INVALID')
    expect(() =>
      relay.event(job.id, {
        kind: 'TOOL',
        update: {
          ...safeUpdate,
          validationFieldMentions: ['fixture-sensitive-value'],
        },
      }),
    ).toThrow('NATIVE_EVENT_INVALID')
    const envelopeUpdate = {
      ...safeUpdate,
      titleClass: 'DECISION',
      rawInputKeys: ['inputJson', '_meta'],
      nativeStatus: 'failed',
      coreAction: null,
      envelopeInputAction: 'BUILDER_REQUEST_DECISION',
      coreIsError: null,
      coreSuccess: null,
      bridgeErrorCode: 'BRIDGE_ENVELOPE_JSON_INVALID',
      rawOutputType: 'object',
      output: null,
    }
    expect(() => relay.event(job.id, { kind: 'TOOL', update: envelopeUpdate })).not.toThrow()
    expect(() =>
      relay.event(job.id, {
        kind: 'TOOL',
        update: { ...envelopeUpdate, bridgeErrorCode: 'BRIDGE_ENVELOPE_PRIVATE_DETAIL' },
      }),
    ).toThrow('NATIVE_EVENT_INVALID')
    expect(() =>
      relay.event(job.id, {
        kind: 'TOOL',
        update: { ...envelopeUpdate, nativeStatus: 'completed' },
      }),
    ).toThrow('NATIVE_EVENT_INVALID')
    expect(() =>
      relay.event(job.id, {
        kind: 'TOOL',
        update: { ...envelopeUpdate, envelopeInputAction: 'PRIVATE_ACTION' },
      }),
    ).toThrow('NATIVE_EVENT_INVALID')
    relay.event(job.id, { kind: 'TEXT', text: 'Checking local concepts.' })
    relay.complete(job.id, { text: 'Prepared.', stopReason: 'end_turn' })
    expect(await pending).toEqual({ text: 'Prepared.', stopReason: 'end_turn' })
    expect(events).toEqual([
      {
        kind: 'TOOL',
        update: {
          sessionUpdate: 'tool_call_update',
          titleClass: 'READ',
          srcPath: false,
          updateKeys: ['rawInput'],
          rawInputKeys: ['command'],
          validationFieldMentions: [],
          validationIssueKinds: [],
          protocolKind: 'other',
          nativeStatus: 'completed',
          toolId: 'aaaaaaaaaaaa',
          toolName: null,
          coreAction: 'DISCOVERY_GET_CONTEXT',
          coreIsError: false,
          coreSuccess: true,
          coreErrorCode: null,
          relativePath: null,
          command: null,
          output: 'token=[REDACTED]',
          outputTruncated: false,
          rawOutputType: 'string',
        },
      },
      { kind: 'TOOL', update: envelopeUpdate },
      { kind: 'TEXT', text: 'Checking local concepts.' },
    ])
    expect(JSON.parse(await readFile(job.bindingFile, 'utf8'))).toEqual({ status: 'REVOKED' })
    const selectedId = `candidate_${randomUUID()}`
    const selectedPending = relay.invoke({
      mode: 'ENRICH_SELECTED',
      projectId,
      correlationId,
      discoverySessionId: restored.data.discoverySession.id,
      requestedCandidateIds: [selectedId],
      message: 'Complete only this selected Preview.',
      signal: new AbortController().signal,
      onEvent: () => undefined,
    })
    let selectedJob = relay.claim(canonicalWorkspaces)
    for (let n = 0; n < jobPollAttempts && !selectedJob; n++) {
      await new Promise((done) => setTimeout(done, 10))
      selectedJob = relay.claim(canonicalWorkspaces)
    }
    if (!selectedJob?.bindingFile) throw new Error('SELECTED_NATIVE_JOB_MISSING')
    expect(JSON.parse(await readFile(selectedJob.bindingFile, 'utf8'))).toMatchObject({
      mode: 'ENRICH_SELECTED',
      requestedCandidateIds: [selectedId],
      toolNames: ['get_discovery_context', 'submit_candidate_enrichments'],
    })
    relay.complete(selectedJob.id, { text: 'Submitted.', stopReason: 'end_turn' })
    await selectedPending
    await expect(
      relay.invoke({
        mode: 'ENRICH_SELECTED',
        projectId,
        correlationId,
        discoverySessionId: restored.data.discoverySession.id,
        requestedCandidateIds: [selectedId, selectedId],
        message: 'Invalid duplicate selection.',
        signal: new AbortController().signal,
        onEvent: () => undefined,
      }),
    ).rejects.toThrow('NATIVE_SELECTED_CANDIDATE_SCOPE_INVALID')
    await relay.close()
    storage.close()
  })
  it('generates a Builder mode whose write and shell authority requires a bounded permission decision', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibe-native-builder-relay-'))
    const workspaces = join(root, 'workspaces')
    await mkdir(join(workspaces, 'generated', 'webhook-lens'), { recursive: true })
    const storage = await openInMemorySqliteStorage()
    storage.transaction((repository) => {
      repository.appendProject(projectSchema.parse(projectFixture))
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
      repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
      repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
      repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(confirmedLearningSpecFixture))
      repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
    })
    const policy = await WorkspacePathPolicy.create(workspaces)
    const relay = new NativeAgentRelay({
      application: new ApplicationService({ storage, workspacePolicy: policy }),
      policy,
      root,
      repository: resolve('.'),
    })
    relay.setBaseUrl('http://127.0.0.1:47831')
    const controller = new AbortController()
    const pending = relay.invoke({
      mode: 'BUILDER',
      projectId: ids.project,
      taskId: ids.task,
      correlationId: ids.correlation,
      message: 'Read the Task.',
      signal: controller.signal,
      onEvent: () => undefined,
    })
    const workspace = await realpath(join(workspaces, 'generated', 'webhook-lens'))
    let job = relay.claim(workspace)
    for (let n = 0; n < jobPollAttempts && !job; n++) {
      await new Promise((done) => setTimeout(done, 10))
      job = relay.claim(workspace)
    }
    if (!job?.bindingFile) throw new Error('NATIVE_BUILDER_JOB_MISSING')
    const descriptor = JSON.parse(await readFile(job.bindingFile, 'utf8'))
    expect(boundedCoreRole(workspace, job.roleName, descriptor, job.bindingFile, false, true)).toBe(
      true,
    )
    const config = JSON.parse(
      await readFile(join(workspace, '.kiro', 'agents', `${job.roleName}.json`), 'utf8'),
    )
    expect(config.mcpServers['vibe-native-core'].env).toBeUndefined()
    expect(config.tools).toContain('shell')
    expect(config.permissions.rules).toContainEqual({ capability: 'shell', effect: 'ask' })
    expect(config.permissions.rules).toContainEqual({
      capability: 'fs_write',
      match: ['.kiro/**', `${workspace}/.kiro/**`],
      effect: 'deny',
    })
    const helperStop = new AbortController()
    const helperEvents: unknown[] = []
    const helper = relay.invoke({
      mode: 'HELPER',
      projectId: ids.project,
      taskId: ids.task,
      correlationId: ids.correlation,
      message: 'Explain the active task.',
      signal: helperStop.signal,
      onEvent: (event) => helperEvents.push(event),
    })
    let helperWorkspace: string | undefined
    for (let n = 0; n < jobPollAttempts && !helperWorkspace; n++) {
      await new Promise((done) => setTimeout(done, 10))
      const host = (await readdir(workspaces)).find((entry) =>
        entry.startsWith('__vibe-native-helper-'),
      )
      if (host) helperWorkspace = await realpath(join(workspaces, host))
    }
    if (!helperWorkspace) throw new Error('NATIVE_HELPER_HOST_MISSING')
    expect(helperWorkspace).not.toBe(workspace)
    expect(relay.claim(workspace, ['BUILDER'])).toBeNull()
    let helperJob = relay.claim(helperWorkspace)
    for (let n = 0; n < jobPollAttempts && !helperJob; n++) {
      await new Promise((done) => setTimeout(done, 10))
      helperJob = relay.claim(helperWorkspace)
    }
    expect(helperJob?.role).toBe('HELPER')
    expect(helperJob?.workspace).toBe(helperWorkspace)
    if (!helperJob?.bindingFile) throw new Error('NATIVE_HELPER_BINDING_MISSING')
    const helperDescriptor = JSON.parse(await readFile(helperJob.bindingFile, 'utf8'))
    const helperPath = new URL(helperDescriptor.url).pathname
    const helperHandler = relay.handlers.get(helperPath)
    if (!helperHandler) throw new Error('NATIVE_HELPER_HANDLER_MISSING')
    expect(helperDescriptor).toMatchObject({
      role: 'HELPER',
      projectId: ids.project,
      taskId: ids.task,
      workspace: helperWorkspace,
      toolNames: ['get_helper_context'],
    })
    expect(
      boundedCoreRole(helperWorkspace, helperJob.roleName, helperDescriptor, helperJob.bindingFile),
    ).toBe(true)
    const helperConfig = JSON.parse(
      await readFile(
        join(helperWorkspace, '.kiro', 'agents', `${helperJob.roleName}.json`),
        'utf8',
      ),
    )
    expect(helperConfig.tools).toEqual(['@vibe-native-core/get_helper_context'])
    expect(helperConfig.permissions.rules).toContainEqual({
      capability: 'fs_write',
      effect: 'deny',
    })
    expect(helperConfig.permissions.rules).toContainEqual({ capability: 'shell', effect: 'deny' })
    relay.event(helperJob.id, {
      kind: 'TEXT',
      text: `Project path ${workspace}; Helper path ${helperWorkspace}.`,
    })
    relay.event(helperJob.id, {
      kind: 'TOOL',
      update: {
        sessionUpdate: 'tool_call_update',
        titleClass: 'READ',
        srcPath: false,
        updateKeys: [],
        rawInputKeys: [],
        validationFieldMentions: [],
        validationIssueKinds: [],
        protocolKind: 'other',
        nativeStatus: 'completed',
        toolId: null,
        toolName: null,
        coreAction: 'HELPER_GET_CONTEXT',
        coreIsError: false,
        coreSuccess: true,
        coreErrorCode: null,
        relativePath: null,
        command: null,
        output: `Core path ${workspace}; host ${helperWorkspace}.`,
        outputTruncated: false,
        rawOutputType: 'string',
      },
    })
    expect(JSON.stringify(helperEvents)).not.toContain(workspace)
    expect(JSON.stringify(helperEvents)).not.toContain(helperWorkspace)
    const analyst = relay.invoke({
      mode: 'EVIDENCE_ANALYST',
      projectId: ids.project,
      correlationId: ids.correlation,
      message: 'Analyse the bounded Episode.',
      signal: new AbortController().signal,
      onEvent: () => undefined,
    })
    expect(relay.claim(helperWorkspace)).toBeNull()
    expect(relay.pendingWorkspace()).toBeNull()
    relay.complete(helperJob.id, {
      text: `Answer about ${workspace} from ${helperWorkspace}.`,
      stopReason: 'end_turn',
    })
    const helperResult = await helper
    expect(helperResult.text).not.toContain(workspace)
    expect(helperResult.text).not.toContain(helperWorkspace)
    let analystJob = relay.claim(helperWorkspace)
    for (let n = 0; n < jobPollAttempts && !analystJob; n++) {
      await new Promise((done) => setTimeout(done, 10))
      analystJob = relay.claim(helperWorkspace)
    }
    if (!analystJob) throw new Error('NATIVE_ANALYST_HOST_JOB_MISSING')
    expect(analystJob.role).toBe('EVIDENCE_ANALYST')
    expect(analystJob.bindingFile).toBeNull()
    const analystConfig = JSON.parse(
      await readFile(
        join(helperWorkspace, '.kiro', 'agents', `${analystJob.roleName}.json`),
        'utf8',
      ),
    )
    expect(analystConfig.tools).toEqual([])
    expect(analystConfig.mcpServers).toEqual({})
    expect(analystConfig.permissions.rules).toContainEqual({
      capability: 'fs_write',
      effect: 'deny',
    })
    expect(analystConfig.permissions.rules).toContainEqual({ capability: 'shell', effect: 'deny' })
    expect(relay.claim(workspace)).toBeNull()
    relay.complete(analystJob.id, { text: 'No USER Evidence proposed.', stopReason: 'end_turn' })
    await analyst
    const secondHelperStop = new AbortController()
    const secondHelper = relay.invoke({
      mode: 'HELPER',
      projectId: ids.project,
      taskId: ids.task,
      correlationId: ids.correlation,
      message: 'Explain another aspect.',
      signal: secondHelperStop.signal,
      onEvent: () => undefined,
    })
    expect(relay.claim(helperWorkspace)).toBeNull()
    expect(JSON.parse(await readFile(helperJob.bindingFile, 'utf8'))).toEqual({ status: 'REVOKED' })
    expect(relay.handlers.has(helperPath)).toBe(false)
    expect(
      (
        await helperHandler.fetch(
          new Request(helperDescriptor.url, {
            headers: { Authorization: helperDescriptor.authorization },
          }),
        )
      ).status,
    ).toBe(401)
    const builderPath = new URL(descriptor.url).pathname
    const builderHandler = relay.handlers.get(builderPath)
    if (!builderHandler) throw new Error('NATIVE_BUILDER_HANDLER_LOST')
    expect(
      (
        await builderHandler.fetch(
          new Request(descriptor.url, {
            headers: { Authorization: descriptor.authorization },
          }),
        )
      ).status,
    ).not.toBe(401)
    let secondHelperJob = relay.claim(helperWorkspace)
    for (let n = 0; n < jobPollAttempts && !secondHelperJob; n++) {
      await new Promise((done) => setTimeout(done, 10))
      secondHelperJob = relay.claim(helperWorkspace)
    }
    expect(secondHelperJob?.role).toBe('HELPER')
    expect(relay.pendingWorkspace()).toBeNull()
    expect(relay.claim(workspace)).toBeNull()
    secondHelperStop.abort()
    await expect(secondHelper).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(relay.pendingWorkspace()).toBeNull()
    expect(relay.claim(workspace)).toBeNull()
    helperStop.abort()
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    await relay.close()
    storage.close()
  })
  it('keeps Helper read-only and the Analyst tool-less in separate native modes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vibe-native-readonly-relay-'))
    const workspaces = join(root, 'workspaces')
    const workspace = join(workspaces, 'generated', 'webhook-lens')
    await mkdir(workspace, { recursive: true })
    const storage = await openInMemorySqliteStorage()
    storage.transaction((repository) => {
      repository.appendProject(projectSchema.parse(projectFixture))
      repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
      repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
      repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
      repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
      repository.appendLearningSpec(learningSpecRevisionSchema.parse(confirmedLearningSpecFixture))
      repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
    })
    const policy = await WorkspacePathPolicy.create(workspaces)
    const relay = new NativeAgentRelay({
      application: new ApplicationService({ storage, workspacePolicy: policy }),
      policy,
      root,
      repository: resolve('.'),
    })
    relay.setBaseUrl('http://127.0.0.1:47831')
    const canonicalWorkspace = await realpath(workspace)
    const helperHost = join(
      await realpath(workspaces),
      `__vibe-native-helper-${createHash('sha256').update(ids.project).digest('hex').slice(0, 24)}`,
    )
    for (const mode of ['HELPER', 'EVIDENCE_ANALYST']) {
      const controller = new AbortController()
      const pending = relay.invoke({
        mode,
        projectId: ids.project,
        ...(mode === 'HELPER' ? { taskId: ids.task } : {}),
        correlationId: `corr_${randomUUID()}`,
        message: 'Read bounded context.',
        signal: controller.signal,
        onEvent: () => undefined,
      })
      const host = helperHost
      let job = relay.claim(host)
      for (let n = 0; n < jobPollAttempts && !job; n++) {
        await new Promise((done) => setTimeout(done, 10))
        job = relay.claim(host)
      }
      if (!job) throw new Error('NATIVE_READONLY_JOB_MISSING')
      expect(job.workspace).toBe(host)
      expect(relay.claim(canonicalWorkspace)).toBeNull()
      expect(job.roleName).toMatch(/^[a-z][a-z0-9-]{1,79}$/)
      if (mode === 'EVIDENCE_ANALYST') expect(job.roleName).toContain('evidence-analyst')
      const config = JSON.parse(
        await readFile(join(host, '.kiro', 'agents', `${job.roleName}.json`), 'utf8'),
      )
      expect(config.tools.some((tool) => ['read', 'write', 'shell'].includes(tool))).toBe(false)
      expect(config.permissions.rules).toContainEqual({ capability: 'fs_write', effect: 'deny' })
      expect(config.permissions.rules).toContainEqual({ capability: 'shell', effect: 'deny' })
      if (mode === 'HELPER') {
        expect(config.tools).toEqual(['@vibe-native-core/get_helper_context'])
        expect(job.bindingFile).not.toBeNull()
      } else {
        expect(config.tools).toEqual([])
        expect(job.bindingFile).toBeNull()
      }
      controller.abort()
      await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    }
    await relay.close()
    storage.close()
  })
  it.each(['symlink', 'permissive'])(
    'rejects a %s Helper host before issuing its Core binding',
    async (hostType) => {
      const root = await mkdtemp(join(tmpdir(), 'vibe-native-helper-host-'))
      const workspaces = join(root, 'workspaces')
      const workspace = join(workspaces, 'generated', 'webhook-lens')
      await mkdir(workspace, { recursive: true })
      const hostTag = createHash('sha256').update(ids.project).digest('hex').slice(0, 24)
      const helperHost = join(workspaces, `__vibe-native-helper-${hostTag}`)
      if (hostType === 'symlink') {
        const outside = await mkdtemp(join(tmpdir(), 'vibe-native-helper-outside-'))
        await symlink(outside, helperHost, 'junction')
      } else {
        await mkdir(helperHost)
        await chmod(helperHost, 0o777)
      }
      const storage = await openInMemorySqliteStorage()
      storage.transaction((repository) => {
        repository.appendProject(projectSchema.parse(projectFixture))
        repository.appendDiscoverySession(discoverySessionSchema.parse(discoverySessionFixture))
        repository.appendCandidate(projectCandidateRevisionSchema.parse(candidateFixture))
        repository.appendCandidateRound(candidateRoundSchema.parse(candidateRoundFixture))
        repository.appendDiscoveryFeedback(discoveryFeedbackSchema.parse(discoveryFeedbackFixture))
        repository.appendLearningSpec(learningSpecRevisionSchema.parse(draftLearningSpecFixture))
        repository.appendLearningSpec(
          learningSpecRevisionSchema.parse(confirmedLearningSpecFixture),
        )
        repository.appendTask(builderTaskSchema.parse(builderTaskFixture))
      })
      const policy = await WorkspacePathPolicy.create(workspaces)
      const relay = new NativeAgentRelay({
        application: new ApplicationService({ storage, workspacePolicy: policy }),
        policy,
        root,
        repository: resolve('.'),
      })
      relay.setBaseUrl('http://127.0.0.1:47831')
      await expect(
        relay.invoke({
          mode: 'HELPER',
          projectId: ids.project,
          taskId: ids.task,
          correlationId: ids.correlation,
          message: 'Read bounded context.',
          signal: new AbortController().signal,
          onEvent: () => undefined,
        }),
      ).rejects.toMatchObject({ code: 'NATIVE_HELPER_HOST_PATH_INVALID' })
      expect(relay.claim(await realpath(workspace))).toBeNull()
      await relay.close()
      storage.close()
    },
  )
})
