import { describe, expect, it } from 'vitest'
import {
  classifyBuilderTurn,
  classifyNativeWorkerStatus,
  createDecisionResolutionRequest,
  DecisionInputError,
  eligibleFinalUpgradeTraces,
  type LocalRun,
  type LocalRunEvent,
  type ProjectEvidenceTrace,
  type ProjectSessionSnapshot,
  projectRunEvent,
  summarizeEvidenceTrace,
  uiRequestSchema,
} from '../src/index.js'
import {
  builderTaskFixture,
  completionReportFixture,
  decisionRequestFixture,
  ids,
  liveContextFixture,
  projectFixture,
  timestamp,
} from '../../contracts/test/fixtures.js'

const run: LocalRun = {
  protocolVersion: 1,
  backendInstanceId: '00000000-0000-4000-8000-000000000000',
  id: 'run_00000000-0000-4000-8000-000000000001',
  projectId: ids.project,
  kind: 'BUILDER',
  phase: 'BUILDER',
  status: 'SUCCEEDED',
  outcome: 'TURN_ENDED',
  createdAt: timestamp,
  updatedAt: timestamp,
  errorCode: null,
  lastSequence: 3,
  retainedFromSequence: 1,
}
const event = (body: Partial<LocalRunEvent>): LocalRunEvent => ({
  runId: run.id,
  projectId: ids.project,
  sequence: 2,
  kind: 'TOOL',
  transient: true,
  redactionStatus: 'VERIFIED_REDACTED',
  ...body,
})
const snapshot = (patch: Partial<ProjectSessionSnapshot> = {}): ProjectSessionSnapshot =>
  ({
    project: projectFixture,
    currentTask: { ...builderTaskFixture, status: 'ACTIVE' },
    liveContext: liveContextFixture,
    pendingDecisions: [],
    completionReport: null,
    helperConversations: [],
    ...patch,
  }) as unknown as ProjectSessionSnapshot

describe('run event projection', () => {
  it('maps native shell activity without diagnostic fields', () => {
    const view = projectRunEvent(
      event({
        update: {
          sessionUpdate: 'tool_call_update',
          titleClass: 'OTHER',
          nativeStatus: 'completed',
          toolId: 'abcdef012345',
          toolName: 'shell',
          protocolKind: 'execute',
          command: 'pnpm test',
          shellExitCode: 1,
          output: 'FAIL 1 test',
          outputTruncated: false,
          rawInputKeys: ['command'],
        },
      }),
    )
    expect(view).toEqual({
      kind: 'TOOL',
      sequence: 2,
      toolId: 'abcdef012345',
      tool: 'shell',
      status: 'FAILED',
      relativePath: null,
      command: 'pnpm test',
      exitCode: 1,
      coreAction: null,
      errorCode: null,
      output: 'FAIL 1 test',
      truncated: false,
    })
  })

  it('degrades CLI and oversized updates instead of guessing success', () => {
    expect(
      projectRunEvent(
        event({ update: { toolCallId: 'call_1', title: 'Read file', status: 'in_progress' } }),
      ),
    ).toMatchObject({ toolId: 'call_1', tool: 'Read file', status: 'RUNNING' })
    expect(
      projectRunEvent(
        event({
          update: {
            sessionUpdate: 'tool_call_update',
            status: 'truncated',
            summary: 'TOOL_OUTPUT_TOO_LARGE',
          },
        }),
      ),
    ).toMatchObject({ status: 'UNKNOWN', truncated: true })
    expect(
      projectRunEvent(
        event({
          update: {
            nativeStatus: 'completed',
            coreAction: 'complete_task',
            coreSuccess: false,
            coreErrorCode: 'BUILDER_TASK_STALE',
          },
        }),
      ),
    ).toMatchObject({ tool: 'core', status: 'FAILED', errorCode: 'BUILDER_TASK_STALE' })
    expect(projectRunEvent(event({ kind: 'PERMISSION_DENIED' }))).toEqual({
      kind: 'PERMISSION_DENIED',
      sequence: 2,
    })
  })
})

describe('Builder turn outcome', () => {
  it('requires the durable Completion Report, not a successful turn', () => {
    expect(classifyBuilderTurn(run, snapshot(), ids.task)).toEqual({
      kind: 'TURN_ENDED_TASK_ACTIVE',
      taskStatus: 'ACTIVE',
    })
    expect(
      classifyBuilderTurn(
        run,
        snapshot({
          currentTask: { ...builderTaskFixture, status: 'COMPLETED' },
          completionReport: completionReportFixture,
        } as Partial<ProjectSessionSnapshot>),
        ids.task,
      ),
    ).toEqual({ kind: 'TASK_COMPLETED', completionReportId: ids.completionReport })
    expect(
      classifyBuilderTurn(
        run,
        snapshot({ pendingDecisions: [decisionRequestFixture] } as Partial<ProjectSessionSnapshot>),
        ids.task,
      ),
    ).toEqual({ kind: 'DECISION_REQUIRED', decisionIds: [ids.decision] })
    expect(
      classifyBuilderTurn(
        { ...run, status: 'FAILED', errorCode: 'AGENT_TURN_INCOMPLETE' },
        snapshot(),
        ids.task,
      ),
    ).toEqual({ kind: 'FAILED', errorCode: 'AGENT_TURN_INCOMPLETE' })
    expect(
      classifyBuilderTurn(run, snapshot(), 'task_00000000-0000-4000-8000-000000000999'),
    ).toEqual({ kind: 'TASK_BINDING_CHANGED' })
  })
})

describe('Decision resolution request', () => {
  const pending = snapshot({
    pendingDecisions: [decisionRequestFixture],
  } as Partial<ProjectSessionSnapshot>)

  it('builds a schema-valid USER resolution bound to the current Context version', () => {
    const request = createDecisionResolutionRequest(pending, {
      decisionId: ids.decision,
      selection: { kind: 'OPTION', optionId: ids.optionB },
      rationale: '  I want to reject unknown fields early.  ',
      helperUsed: true,
    })
    expect(uiRequestSchema.safeParse(request).success).toBe(true)
    expect(request.resolution).toMatchObject({
      selectionKind: 'OPTION',
      selectedOptionId: ids.optionB,
      rationale: 'I want to reject unknown fields early.',
      expectedContextVersion: liveContextFixture.contextVersion,
      source: { kind: 'USER' },
    })
    const custom = createDecisionResolutionRequest(pending, {
      decisionId: ids.decision,
      selection: { kind: 'CUSTOM', customProposal: 'Validate only the envelope.' },
      helperUsed: false,
    })
    expect(uiRequestSchema.safeParse(custom).success).toBe(true)
    expect(custom.resolution).not.toHaveProperty('rationale')
  })

  it('rejects stale, unknown or empty choices before calling Core', () => {
    const code = (fn: () => unknown) => {
      try {
        fn()
      } catch (error) {
        return error instanceof DecisionInputError ? error.code : 'OTHER'
      }
      return 'NONE'
    }
    expect(
      code(() =>
        createDecisionResolutionRequest(snapshot(), {
          decisionId: ids.decision,
          selection: { kind: 'RECOMMENDATION' },
          helperUsed: false,
        }),
      ),
    ).toBe('DECISION_NOT_PENDING')
    expect(
      code(() =>
        createDecisionResolutionRequest(pending, {
          decisionId: ids.decision,
          selection: {
            kind: 'OPTION',
            optionId: 'decision_option_00000000-0000-4000-8000-000000000999',
          },
          helperUsed: false,
        }),
      ),
    ).toBe('DECISION_OPTION_INVALID')
    expect(
      code(() =>
        createDecisionResolutionRequest(pending, {
          decisionId: ids.decision,
          selection: { kind: 'CUSTOM', customProposal: '   ' },
          helperUsed: false,
        }),
      ),
    ).toBe('DECISION_CUSTOM_INVALID')
  })
})

const helperCorrelation = 'corr_00000000-0000-4000-8000-000000000501'
const traceItem = (id: string, correlationId: string) => ({
  schemaVersion: 1 as const,
  id,
  projectId: ids.project,
  correlationId,
  target: { kind: 'HELPER_TURN' as const, taskId: ids.task },
  mode: 'EVIDENCE_AWARE' as const,
  basis: [{ conceptId: ids.concept }],
  createdAt: timestamp,
  source: { kind: 'CORE' as const },
  redactionStatus: 'VERIFIED_REDACTED' as const,
})
const evidenceTrace = {
  projectId: ids.project,
  concepts: [
    {
      conceptId: ids.concept,
      conceptName: 'runtime validation',
      state: 'OBSERVED',
      evidence: [
        {
          evidenceId: ids.evidence,
          kind: 'CONCEPT_OBSERVATION',
          projectId: ids.project,
          episodeId: ids.episode,
          redactedEvidenceExcerpt: 'Builder added a schema.',
        },
      ],
      rejectedEvidence: [],
      openIssues: [],
    },
  ],
  analysis: [
    {
      analysisJobId: ids.analysisJob,
      episodeId: ids.episode,
      status: 'SUCCEEDED',
      resultSummary: { proposalCount: 1, acceptedCount: 0, rejectedCount: 1 },
    },
  ],
  personalization: [
    traceItem('personalization_00000000-0000-4000-8000-000000000601', helperCorrelation),
    traceItem(
      'personalization_00000000-0000-4000-8000-000000000602',
      'corr_00000000-0000-4000-8000-000000000502',
    ),
  ],
} as unknown as ProjectEvidenceTrace

describe('Evidence and Final Upgrade views', () => {
  it('never labels observations or a succeeded analysis as user understanding', () => {
    const view = summarizeEvidenceTrace(ids.project, evidenceTrace)
    expect(view.concepts[0]).toMatchObject({
      displayState: 'OBSERVED_ONLY',
      userUnderstandingCount: 0,
    })
    expect(view.analysis[0]).toMatchObject({ displayState: 'ANALYZED', acceptedCount: 0 })
    expect(view.userUnderstandingTotal).toBe(0)
    expect(() =>
      summarizeEvidenceTrace(projectFixture.id.replace('1', '2'), evidenceTrace),
    ).toThrow('EVIDENCE_TRACE_PROJECT_MISMATCH')
  })

  it('offers only traces whose Helper answer was recorded', () => {
    const completed = snapshot({
      currentTask: { ...builderTaskFixture, status: 'COMPLETED' },
      completionReport: completionReportFixture,
      helperConversations: [
        {
          conversationId: ids.conversation,
          episodeId: ids.episode,
          correlationId: helperCorrelation,
          taskId: ids.task,
          status: 'PENDING_ANALYSIS',
          startedAt: timestamp,
          redactedUserExcerpts: ['Why validate here?'],
          helperResponseSummaries: ['Because unknown fields hide typos.'],
        },
      ],
    } as Partial<ProjectSessionSnapshot>)
    expect(eligibleFinalUpgradeTraces(completed, evidenceTrace)).toEqual([
      {
        id: 'personalization_00000000-0000-4000-8000-000000000601',
        createdAt: timestamp,
        basisCount: 1,
      },
    ])
    expect(eligibleFinalUpgradeTraces(snapshot(), evidenceTrace)).toEqual([])
  })
})

describe('native worker status', () => {
  it('classifies diagnostic codes without trusting arbitrary input', () => {
    expect(classifyNativeWorkerStatus('AGENT_RUNNING_BUILDER')).toEqual({
      stage: 'AGENT_RUNNING',
      role: 'BUILDER',
      code: 'AGENT_RUNNING_BUILDER',
    })
    expect(classifyNativeWorkerStatus('AGENT_QUEUED_HELPER_BEHIND_BUILDER')).toMatchObject({
      stage: 'AGENT_QUEUED',
      role: 'HELPER',
    })
    expect(classifyNativeWorkerStatus('AGENT_FAILED_NATIVE_ROLE_CATALOG_UNVERIFIED')).toMatchObject(
      {
        stage: 'AGENT_FAILED',
        role: null,
      },
    )
    expect(classifyNativeWorkerStatus('WORKSPACE_SWITCH_UNCONFIRMED')).toMatchObject({
      stage: 'WORKSPACE_SWITCH_FAILED',
    })
    expect(classifyNativeWorkerStatus('CATALOG_HELPER_VALID_TOTAL_3')).toMatchObject({
      stage: 'DIAGNOSTIC',
      role: 'HELPER',
    })
    expect(classifyNativeWorkerStatus('')).toBe(null)
    expect(classifyNativeWorkerStatus('<script>')).toBe(null)
  })
})
