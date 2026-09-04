import { useAppApi } from '@kirocrew/app-sdk'
import type {
  CrewAppSurface,
  DiscoveryInput,
  ProjectHistory,
  ProjectSessionSnapshot,
} from '@vibe-helper/contracts'
import {
  CrewAppClientError,
  CrewAgentModeClient,
  type DiscoveryAgentPhase,
  CrewCoreClient,
  createDiscoveryEphemeralContext,
  CrewDiscoveryClient,
  type CrewProjectSessions,
  CrewSessionClient,
} from '@vibe-helper/kiro-adapter/crew-app'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import appStyles from './app.css?inline'
import { BuildWorkspace } from './BuildWorkspace.js'
import {
  AgentRunBanner,
  type AgentRunView,
  type DiscoveryFeedbackAction,
  DiscoveryStartView,
  DiscoveryWorkspace,
  SpecWorkspace,
} from './DiscoveryFlow.js'

type RouteName = 'discovery' | 'spec' | 'build' | 'history'

interface AppRoute {
  readonly name: RouteName
  readonly projectId: string | null
}

interface ViewError {
  readonly kind: 'DISCONNECTED' | 'PERMISSION' | 'RECOVERABLE'
  readonly title: string
  readonly message: string
}

export interface VibeHelperAppProps {
  readonly coreClient: CrewCoreClient
  readonly sessionClient: CrewSessionClient
  readonly discoveryClient: CrewDiscoveryClient
  readonly agentClient: CrewAgentModeClient
}

interface AgentExpectationRound {
  readonly kind: 'ROUND'
  readonly baseline: number
}

interface AgentExpectationPreview {
  readonly kind: 'PREVIEW'
}

interface AgentExpectationSpec {
  readonly kind: 'SPEC'
  readonly baseline: number
}

type AgentExpectation = AgentExpectationRound | AgentExpectationPreview | AgentExpectationSpec

const TARGET_DISCOVERY_FOREGROUND_MS = import.meta.env.MODE === 'test' ? 700 : 30_000
const TARGET_DISCOVERY_TIMEOUT_MS = import.meta.env.MODE === 'test' ? 6_000 : 420_000
const TARGET_DISCOVERY_COMPLETION_GRACE_MS = import.meta.env.MODE === 'test' ? 1_800 : 900

interface AgentRequest {
  readonly projectId: string
  readonly message: string
  readonly expectation: AgentExpectation
  readonly phase?: DiscoveryAgentPhase
}

interface RecoverableAgentRun {
  readonly phase: DiscoveryAgentPhase
  readonly expectation: AgentExpectation
  readonly retryMessage: string | null
}

const idleAgentRun: AgentRunView = {
  status: 'IDLE',
  startedAt: null,
  detail: '',
  retry: null,
}

const surfaceRoute: Record<CrewAppSurface, RouteName> = {
  DISCOVERY: 'discovery',
  SPEC: 'spec',
  BUILD: 'build',
}

const routeLabels: Readonly<Record<RouteName, string>> = {
  discovery: 'Discovery',
  spec: 'Spec',
  build: 'Build',
  history: 'History',
}

function readRoute(): AppRoute {
  const raw = window.location.hash.slice(1) || '/history'
  const parsed = new URL(raw, window.location.origin)
  const candidate = parsed.pathname.replace(/^\//, '').toLowerCase()
  const name: RouteName =
    candidate === 'discovery' || candidate === 'spec' || candidate === 'build'
      ? candidate
      : 'history'
  return { name, projectId: parsed.searchParams.get('project') }
}

function href(name: RouteName, projectId?: string | null): string {
  const query = projectId === undefined || projectId === null ? '' : `?project=${projectId}`
  return `#/${name}${query}`
}

function correlationId(): string {
  return `corr_${crypto.randomUUID()}`
}

function entityId(prefix: 'project' | 'idem' | 'feedback'): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function expectationMet(snapshot: ProjectSessionSnapshot, expectation: AgentExpectation): boolean {
  if (expectation.kind === 'PREVIEW') {
    return (snapshot.discoveryContext?.previewRound ?? null) !== null
  }
  if (expectation.kind === 'ROUND') {
    return (snapshot.discoveryContext?.rounds.length ?? 0) > expectation.baseline
  }
  return (snapshot.discoveryContext?.learningSpec?.revision ?? 0) > expectation.baseline
}

function discoveryAgentPhase(
  snapshot: ProjectSessionSnapshot,
  expectation: AgentExpectation,
): DiscoveryAgentPhase {
  if (expectation.kind === 'PREVIEW') return 'PREVIEW'
  if (expectation.kind === 'SPEC') return 'SPEC'
  const context = snapshot.discoveryContext
  if (context === null || context === undefined) return 'ROUND'
  const appliedFeedbackIds = new Set(context.rounds.flatMap((round) => round.appliedFeedbackIds))
  const pending = context.feedback.filter((feedback) => !appliedFeedbackIds.has(feedback.id))
  return pending.length === 1 && pending[0]?.intent === 'MERGE' ? 'MERGE' : 'ROUND'
}

function recoverableAgentRun(snapshot: ProjectSessionSnapshot): RecoverableAgentRun | null {
  const session = snapshot.discoverySession
  const context = snapshot.discoveryContext
  if (session === null || context === null) return null
  if (session.status === 'SELECTED') {
    const specRevision = context.learningSpec?.revision ?? 0
    return {
      phase: 'SPEC',
      expectation: { kind: 'SPEC', baseline: specRevision },
      retryMessage:
        specRevision === 0
          ? '선택된 후보를 바탕으로 권장 Learning Spec 초안을 바로 제출해 주세요.'
          : null,
    }
  }
  if (session.status !== 'ACTIVE') return null
  if (context.rounds.length === 0) {
    if (context.previewRound !== null) return null
    return {
      phase: 'PREVIEW',
      expectation: { kind: 'PREVIEW' },
      retryMessage: '현재 학습 목표를 바탕으로 Candidate preview 10개를 제출해 주세요.',
    }
  }
  const appliedFeedbackIds = new Set(context.rounds.flatMap((round) => round.appliedFeedbackIds))
  const pending = context.feedback.filter((feedback) => !appliedFeedbackIds.has(feedback.id))
  if (pending.length === 0) return null
  const expectation = { kind: 'ROUND', baseline: context.rounds.length } as const
  return {
    phase: discoveryAgentPhase(snapshot, expectation),
    expectation,
    retryMessage:
      'Core에 저장된 최신 user-authored Discovery Feedback을 반영해 다음 Candidate Round를 제출해 주세요.',
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof CrewAppClientError) return error.message
  return error instanceof Error
    ? error.message
    : '요청을 처리하지 못했습니다. 저장된 상태를 확인해 주세요.'
}

function viewError(error: unknown): ViewError {
  if (error instanceof CrewAppClientError && error.category === 'PERMISSION') {
    return { kind: 'PERMISSION', title: 'Permission required', message: error.message }
  }
  if (error instanceof CrewAppClientError && error.category === 'CONNECTION') {
    return {
      kind: 'DISCONNECTED',
      title: 'Core disconnected',
      message:
        'Vibe Helper could not reach its local Core. Your saved project data was not changed.',
    }
  }
  return {
    kind: 'RECOVERABLE',
    title: 'This view could not be restored',
    message:
      error instanceof Error ? error.message : 'An unexpected local error interrupted restoration.',
  }
}

function StatusPill({ value }: { readonly value: string }) {
  return (
    <span className={`status-pill status-${value.toLowerCase()}`}>
      {value.replaceAll('_', ' ')}
    </span>
  )
}

function EmptyState({ route }: { readonly route: RouteName }) {
  return (
    <section className="state-card empty-state" aria-labelledby="empty-title">
      <span className="state-mark" aria-hidden="true">
        ◌
      </span>
      <p className="eyebrow">Nothing to restore</p>
      <h2 id="empty-title">
        {route === 'history'
          ? 'Your project history starts here.'
          : `No ${routeLabels[route]} session yet.`}
      </h2>
      <p>
        Start Discovery from a new learning goal. Vibe Helper will keep the project, decisions,
        context, and redacted activity together as you move between modes.
      </p>
    </section>
  )
}

function ErrorState({ error, retry }: { readonly error: ViewError; readonly retry: () => void }) {
  return (
    <section className={`state-card error-state error-${error.kind.toLowerCase()}`} role="alert">
      <p className="eyebrow">{error.kind.replaceAll('_', ' ')}</p>
      <h2>{error.title}</h2>
      <p>{error.message}</p>
      <button type="button" className="primary-button" onClick={retry}>
        Try again
      </button>
    </section>
  )
}

function LoadingState({ label }: { readonly label: string }) {
  return (
    <section className="state-card loading-state" role="status" aria-live="polite">
      <span className="loading-orbit" aria-hidden="true" />
      <p className="eyebrow">Restoring session</p>
      <h2>{label}</h2>
      <p>Reading durable Core state and reconnecting project conversations.</p>
    </section>
  )
}

function HistoryView({
  history,
  openProject,
}: {
  readonly history: ProjectHistory
  readonly openProject: (projectId: string, surface: CrewAppSurface) => void
}) {
  if (history.projects.length === 0) return <EmptyState route="history" />
  return (
    <section aria-labelledby="history-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Project history</p>
          <h2 id="history-title">Pick up where you left off.</h2>
        </div>
        <p>
          {history.projects.length} local project{history.projects.length === 1 ? '' : 's'}
        </p>
      </div>
      <div className="history-grid">
        {history.projects.map((item) => (
          <button
            className="project-card"
            type="button"
            key={item.project.id}
            onClick={() => openProject(item.project.id, item.suggestedSurface)}
          >
            <span className="project-card-topline">
              <StatusPill value={item.project.status} />
              <time dateTime={item.project.updatedAt}>
                {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                  new Date(item.project.updatedAt),
                )}
              </time>
            </span>
            <strong>{item.project.title}</strong>
            {item.project.learningGoal === item.project.title ? null : (
              <span className="project-goal">{item.project.learningGoal}</span>
            )}
            <span className="project-metrics">
              <span>{item.pendingDecisionCount} decisions</span>
              <span>
                {item.currentContextVersion === null
                  ? 'No context'
                  : `Context v${item.currentContextVersion}`}
              </span>
              <span>{item.helperConversationCount} helper threads</span>
            </span>
            <span className="open-label">
              Open {routeLabels[surfaceRoute[item.suggestedSurface]]} →
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function VibeHelperApp({
  coreClient,
  sessionClient,
  discoveryClient,
  agentClient,
}: VibeHelperAppProps) {
  const [route, setRoute] = useState<AppRoute>(readRoute)
  const [history, setHistory] = useState<ProjectHistory | null>(null)
  const [historyError, setHistoryError] = useState<ViewError | null>(null)
  const [snapshot, setSnapshot] = useState<ProjectSessionSnapshot | null>(null)
  const [sessions, setSessions] = useState<CrewProjectSessions | null>(null)
  const [crewError, setCrewError] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<ViewError | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [loadingSession, setLoadingSession] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [operationBusy, setOperationBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [agentRun, setAgentRun] = useState<AgentRunView>(idleAgentRun)
  const agentRunSequence = useRef(0)
  const inspectedRecoveryKeys = useRef(new Set<string>())

  useEffect(() => {
    const onHashChange = (): void => setRoute(readRoute())
    window.addEventListener('hashchange', onHashChange)
    if (window.location.hash === '') window.location.replace(href('history'))
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    void refresh
    let active = true
    setLoadingHistory(true)
    setHistoryError(null)
    void coreClient
      .listProjects(correlationId())
      .then((nextHistory) => {
        if (!active) return
        setHistory(nextHistory)
        if (
          route.name !== 'history' &&
          route.name !== 'discovery' &&
          route.projectId === null &&
          nextHistory.projects[0]
        ) {
          window.location.hash = href(route.name, nextHistory.projects[0].project.id).slice(1)
        }
      })
      .catch((error: unknown) => {
        if (active) setHistoryError(viewError(error))
      })
      .finally(() => {
        if (active) setLoadingHistory(false)
      })
    return () => {
      active = false
    }
  }, [coreClient, refresh, route.name, route.projectId])

  useEffect(() => {
    void refresh
    if (route.projectId === null) {
      setSnapshot(null)
      setSessions(null)
      setSessionError(null)
      return
    }
    let active = true
    setLoadingSession(true)
    setSessionError(null)
    setCrewError(null)
    void Promise.allSettled([
      coreClient.restoreProjectSession(correlationId(), route.projectId),
      sessionClient.restoreProject(route.projectId),
    ]).then(([coreResult, crewResult]) => {
      if (!active) return
      if (coreResult.status === 'fulfilled') setSnapshot(coreResult.value)
      else {
        setSnapshot(null)
        setSessionError(viewError(coreResult.reason))
      }
      if (crewResult.status === 'fulfilled') setSessions(crewResult.value)
      else {
        setSessions(null)
        setCrewError(
          crewResult.reason instanceof Error
            ? crewResult.reason.message
            : 'The local Crew session could not be restored.',
        )
      }
      setLoadingSession(false)
    })
    return () => {
      active = false
    }
  }, [coreClient, refresh, route.projectId, sessionClient])

  const retry = (): void => setRefresh((value) => value + 1)
  const selectedProjectId = route.projectId ?? snapshot?.project.id ?? null
  const navigate = (name: RouteName, projectId = selectedProjectId): void => {
    window.location.hash = href(name, name === 'history' ? null : projectId).slice(1)
  }
  const openProject = (projectId: string, surface: CrewAppSurface): void =>
    navigate(surfaceRoute[surface], projectId)

  const performAgentRequest = useCallback(
    async function perform(request: AgentRequest): Promise<void> {
      const runSequence = agentRunSequence.current + 1
      agentRunSequence.current = runSequence
      setActionError(null)
      const retry = (): void => {
        void perform(request)
      }
      try {
        const restored = await coreClient.restoreProjectSession(correlationId(), request.projectId)
        setSnapshot(restored)
        if (expectationMet(restored, request.expectation)) {
          setAgentRun(idleAgentRun)
          setRefresh((value) => value + 1)
          return
        }
        const startedAt = Date.now()
        setAgentRun({
          status: 'DISPATCHING',
          startedAt,
          detail: '사용자 입력과 Core에 저장된 최신 상태를 연결하고 있습니다.',
          retry: null,
        })
        const discoverySession = restored.discoverySession
        if (discoverySession === null) {
          throw new CrewAppClientError(
            'CONTRACT',
            'DISCOVERY_SESSION_MISSING',
            'Core did not return an active Discovery Session.',
          )
        }
        const agentPhase = request.phase ?? discoveryAgentPhase(restored, request.expectation)
        const dispatchReceipt = await discoveryClient.dispatch(
          discoverySession.id,
          discoverySession.revision,
          `${request.message}\n\nCore tool identifiers: schemaVersion=1, projectId=${request.projectId}, discoverySessionId=${discoverySession.id}, correlationId=${discoverySession.correlationId}, expectedSessionRevision=${discoverySession.revision}, idempotencyKey=${entityId('idem')}.`,
          createDiscoveryEphemeralContext(restored, agentPhase),
          agentPhase,
        )
        if (agentRunSequence.current !== runSequence) return
        void (async () => {
          try {
            let completion = await dispatchReceipt.completion
            const completionAttempts = agentPhase === 'SPEC' ? 2 : 1
            for (let attempt = 0; attempt < completionAttempts; attempt += 1) {
              if (agentRunSequence.current !== runSequence) return
              await delay(TARGET_DISCOVERY_COMPLETION_GRACE_MS)
              if (agentRunSequence.current !== runSequence) return
              const current = await coreClient.restoreProjectSession(
                correlationId(),
                request.projectId,
              )
              if (expectationMet(current, request.expectation)) return
              if (attempt === 0 && agentPhase === 'SPEC' && completion === 'DONE') {
                const currentSession = current.discoverySession
                if (currentSession !== null) {
                  setAgentRun({
                    status: 'RUNNING',
                    startedAt,
                    detail:
                      '저장 없이 끝난 Spec 응답을 최신 Core 상태에서 한 번 복구하고 있습니다.',
                    retry: null,
                  })
                  const recoveryReceipt = await discoveryClient.dispatch(
                    currentSession.id,
                    currentSession.revision,
                    `${request.message}\n\n이전 응답은 Core 저장 없이 끝났습니다. 확인 질문이나 설명을 하지 말고 submit_learning_spec으로 다음 revision을 제출하세요. Core tool identifiers: schemaVersion=1, projectId=${request.projectId}, discoverySessionId=${currentSession.id}, correlationId=${currentSession.correlationId}, expectedSessionRevision=${currentSession.revision}, idempotencyKey=${entityId('idem')}.`,
                    createDiscoveryEphemeralContext(current, 'SPEC'),
                    'SPEC',
                  )
                  completion = await recoveryReceipt.completion
                  continue
                }
              }
              if (agentRunSequence.current !== runSequence) return
              agentRunSequence.current += 1
              setAgentRun({
                status: 'TOOL_REJECTED',
                startedAt: null,
                detail:
                  completion === 'TOOL_VALIDATION_FAILED'
                    ? 'Core가 Agent의 제출 형식을 거절했습니다. 현재 저장 상태에서 안전하게 재시도할 수 있어요.'
                    : 'Agent 응답은 끝났지만 Core에 새 결과가 저장되지 않았습니다. 현재 저장 상태에서 안전하게 재시도할 수 있어요.',
                retry,
              })
              return
            }
          } catch {
            // The normal Core polling path owns connection failure reporting.
          }
        })()
        setAgentRun({
          status: 'RUNNING',
          startedAt,
          detail:
            agentPhase === 'PREVIEW'
              ? '빠르게 훑을 수 있는 10개 방향을 만들고 Core에 저장하고 있습니다.'
              : '후보를 구성하고 Core schema로 검증하고 있습니다.',
          retry: null,
        })

        const pollUntil = async (deadline: number): Promise<boolean> => {
          while (Date.now() < deadline && agentRunSequence.current === runSequence) {
            await delay(900)
            const next = await coreClient.restoreProjectSession(correlationId(), request.projectId)
            if (agentRunSequence.current !== runSequence) return true
            setSnapshot(next)
            if (expectationMet(next, request.expectation)) {
              setAgentRun(idleAgentRun)
              setRefresh((value) => value + 1)
              return true
            }
          }
          return agentRunSequence.current !== runSequence
        }

        if (await pollUntil(startedAt + TARGET_DISCOVERY_FOREGROUND_MS)) return
        setAgentRun({
          status: 'BACKGROUND',
          startedAt,
          detail:
            '이 화면을 떠나도 작업은 계속됩니다. 저장된 이전 결과를 보거나 다른 화면으로 이동할 수 있어요.',
          retry: null,
        })
        void (async () => {
          try {
            if (await pollUntil(startedAt + TARGET_DISCOVERY_TIMEOUT_MS)) return
            if (agentRunSequence.current !== runSequence) return
            setAgentRun({
              status: 'TIMED_OUT',
              startedAt: null,
              detail:
                'Core에는 아직 새 결과가 없습니다. 먼저 저장 상태를 확인한 뒤 안전하게 다시 요청할 수 있습니다.',
              retry,
            })
          } catch (error) {
            if (agentRunSequence.current !== runSequence) return
            setAgentRun({
              status: 'HOST_DISCONNECTED',
              startedAt: null,
              detail:
                error instanceof CrewAppClientError
                  ? error.message
                  : 'Core 상태를 확인할 수 없습니다. 이미 저장된 프로젝트와 피드백은 유지됩니다.',
              retry,
            })
          }
        })()
        return
      } catch (error) {
        setAgentRun({
          status: 'HOST_DISCONNECTED',
          startedAt: null,
          detail:
            error instanceof CrewAppClientError
              ? error.message
              : 'Crew의 Discovery Agent에 연결할 수 없습니다. 이미 Core에 저장된 프로젝트와 피드백은 유지됩니다.',
          retry,
        })
      }
    },
    [coreClient, discoveryClient],
  )

  const performCandidateEnrichment = useCallback(
    async function enrich(projectId: string): Promise<void> {
      const runSequence = agentRunSequence.current + 1
      agentRunSequence.current = runSequence
      const retry = (): void => {
        void enrich(projectId)
      }
      try {
        const restored = await coreClient.restoreProjectSession(correlationId(), projectId)
        setSnapshot(restored)
        const context = restored.discoveryContext
        const session = restored.discoverySession
        if ((context?.rounds.length ?? 0) > 0) {
          setAgentRun(idleAgentRun)
          setRefresh((value) => value + 1)
          return
        }
        const previewRound = context?.previewRound ?? null
        if (
          context === null ||
          context === undefined ||
          session === null ||
          previewRound === null
        ) {
          throw new CrewAppClientError(
            'CONTRACT',
            'CANDIDATE_PREVIEW_MISSING',
            '상세 보강을 시작할 Candidate preview가 없습니다.',
          )
        }
        const enrichedIds = new Set(
          context.candidateEnrichments.map((enrichment) => enrichment.candidate.id),
        )
        const phases = (['ENRICH_FIRST', 'ENRICH_SECOND'] as const).filter((phase) =>
          previewRound.previews.some(
            (preview) =>
              (phase === 'ENRICH_FIRST' ? preview.position <= 5 : preview.position > 5) &&
              !enrichedIds.has(preview.candidateId),
          ),
        )
        if (phases.length === 0) {
          throw new CrewAppClientError(
            'OPERATION',
            'CANDIDATE_ENRICHMENT_INCOMPLETE',
            '상세는 저장됐지만 Candidate Round가 완성되지 않았습니다. 기존 방식으로 복구할 수 있어요.',
          )
        }
        const startedAt = Date.now()
        setAgentRun({
          status: 'DISPATCHING',
          startedAt,
          detail: `저장된 10개 방향 중 남은 ${String(10 - enrichedIds.size)}개의 상세 작업을 준비하고 있습니다.`,
          retry: null,
        })
        let backgroundShown = false
        const deadline = startedAt + TARGET_DISCOVERY_TIMEOUT_MS
        let currentSnapshot = restored
        for (const [phaseIndex, phase] of phases.entries()) {
          const batch = phase === 'ENRICH_FIRST' ? 'FIRST' : 'SECOND'
          const requestedIds = new Set(
            previewRound.previews
              .filter((preview) =>
                phase === 'ENRICH_FIRST' ? preview.position <= 5 : preview.position > 5,
              )
              .map((preview) => preview.candidateId),
          )
          setAgentRun({
            status: 'RUNNING',
            startedAt,
            detail: `상세 batch ${String(phaseIndex + 1)}/${String(phases.length)}를 순서대로 저장하고 있어요.`,
            retry: null,
          })
          const receipt = await discoveryClient.dispatch(
            session.id,
            session.revision,
            `Candidate preview의 ${batch} batch를 상세화해 주세요. previewRoundId=${previewRound.id}, batch=${batch}. Candidate ID와 preview의 의미 필드는 그대로 복사하고 지정된 5개만 submit_candidate_enrichments로 제출하세요.\n\nCore tool identifiers: schemaVersion=1, projectId=${projectId}, discoverySessionId=${session.id}, correlationId=${session.correlationId}, expectedSessionRevision=${session.revision}, idempotencyKey=${entityId('idem')}.`,
            createDiscoveryEphemeralContext(currentSnapshot, phase),
            phase,
          )
          const terminal: {
            outcome: 'DONE' | 'TOOL_VALIDATION_FAILED' | 'STREAM_FAILED' | null
            observedAt: number
          } = { outcome: null, observedAt: 0 }
          void receipt.completion.then((outcome) => {
            terminal.outcome = outcome
            terminal.observedAt = Date.now()
          })

          let batchStored = false
          while (Date.now() < deadline && agentRunSequence.current === runSequence) {
            await delay(900)
            const next = await coreClient.restoreProjectSession(correlationId(), projectId)
            if (agentRunSequence.current !== runSequence) return
            setSnapshot(next)
            if ((next.discoveryContext?.rounds.length ?? 0) > 0) {
              setAgentRun(idleAgentRun)
              setRefresh((value) => value + 1)
              return
            }
            const storedIds = new Set(
              next.discoveryContext?.candidateEnrichments.map(
                (enrichment) => enrichment.candidate.id,
              ) ?? [],
            )
            if ([...requestedIds].every((candidateId) => storedIds.has(candidateId))) {
              currentSnapshot = next
              batchStored = true
              break
            }
            if (
              terminal.outcome !== null &&
              Date.now() >= terminal.observedAt + TARGET_DISCOVERY_COMPLETION_GRACE_MS
            ) {
              throw new CrewAppClientError(
                'OPERATION',
                'CANDIDATE_ENRICHMENT_NOT_STORED',
                terminal.outcome === 'TOOL_VALIDATION_FAILED'
                  ? `상세 형식이 거절됐습니다. 저장된 ${String(storedIds.size)}/10개는 유지되며 누락된 batch만 다시 시도할 수 있어요.`
                  : `상세 작업이 끝났지만 ${String(storedIds.size)}/10개만 저장됐습니다. 누락된 batch만 다시 시도할 수 있어요.`,
              )
            }
            if (!backgroundShown && Date.now() >= startedAt + TARGET_DISCOVERY_FOREGROUND_MS) {
              backgroundShown = true
              setAgentRun({
                status: 'BACKGROUND',
                startedAt,
                detail:
                  '10개 방향은 이미 저장됐습니다. 화면을 보면서 기다릴 수 있고 상세는 background에서 순서대로 이어집니다.',
                retry: null,
              })
            }
          }
          if (agentRunSequence.current !== runSequence) return
          if (!batchStored) break
          await Promise.race([receipt.completion, delay(5_000)])
        }
        if (agentRunSequence.current !== runSequence) return
        setAgentRun({
          status: 'TIMED_OUT',
          startedAt: null,
          detail:
            '미리보기는 안전하게 저장됐지만 상세가 아직 끝나지 않았습니다. 누락된 batch만 다시 시도할 수 있어요.',
          retry,
        })
      } catch (error) {
        if (agentRunSequence.current !== runSequence) return
        setAgentRun({
          status:
            error instanceof CrewAppClientError && error.category === 'OPERATION'
              ? 'TOOL_REJECTED'
              : 'HOST_DISCONNECTED',
          startedAt: null,
          detail: actionErrorMessage(error),
          retry,
        })
      }
    },
    [coreClient, discoveryClient],
  )

  const generateLegacyCandidateRound = useCallback(
    async (projectId: string): Promise<void> => {
      await performAgentRequest({
        projectId,
        phase: 'ROUND',
        message:
          'staged preview 경로 대신 기존 atomic fallback을 사용합니다. 현재 Core context로 완성된 Candidate 4~6개를 한 Round에 제출해 주세요.',
        expectation: { kind: 'ROUND', baseline: 0 },
      })
    },
    [performAgentRequest],
  )

  const generatePreviewCandidates = useCallback(
    async (projectId: string): Promise<void> => {
      await performAgentRequest({
        projectId,
        phase: 'PREVIEW',
        message:
          '새 Discovery의 첫 단계입니다. 제공된 최신 Core context를 사용해 서로 다른 lightweight Candidate preview를 정확히 10개 제출해 주세요.',
        expectation: { kind: 'PREVIEW' },
      })
      const current = await coreClient.restoreProjectSession(correlationId(), projectId)
      setSnapshot(current)
      if (
        current.discoveryContext?.previewRound !== null &&
        current.discoveryContext?.previewRound !== undefined &&
        current.discoveryContext.rounds.length === 0
      ) {
        void performCandidateEnrichment(projectId)
      }
    },
    [coreClient, performAgentRequest, performCandidateEnrichment],
  )

  const startDiscovery = async (input: DiscoveryInput): Promise<void> => {
    setOperationBusy(true)
    setActionError(null)
    const projectId = entityId('project')
    try {
      await coreClient.startDiscovery({
        schemaVersion: 1,
        kind: 'UI_START_DISCOVERY',
        correlationId: correlationId(),
        actor: { kind: 'UI' },
        idempotencyKey: entityId('idem'),
        projectId,
        input,
      })
      const next = await coreClient.restoreProjectSession(correlationId(), projectId)
      setSnapshot(next)
      window.location.hash = href('discovery', projectId).slice(1)
      await generatePreviewCandidates(projectId)
    } catch (error) {
      setActionError(actionErrorMessage(error))
    } finally {
      setOperationBusy(false)
    }
  }

  const recordDiscoveryFeedback = async (action: DiscoveryFeedbackAction): Promise<void> => {
    const session = snapshot?.discoverySession
    const round = snapshot?.discoveryContext?.rounds.at(-1)
    if (snapshot === null || session === null || session === undefined || round === undefined) {
      setActionError('현재 Candidate Round를 복원한 뒤 다시 시도해 주세요.')
      return
    }
    setOperationBusy(true)
    setActionError(null)
    const baselineRound = snapshot.discoveryContext?.rounds.length ?? 0
    const baselineSpec = snapshot.discoveryContext?.learningSpec?.revision ?? 0
    try {
      await coreClient.recordDiscoveryFeedback({
        schemaVersion: 1,
        kind: 'UI_RECORD_DISCOVERY_FEEDBACK',
        correlationId: session.correlationId,
        actor: { kind: 'UI' },
        idempotencyKey: entityId('idem'),
        expectedSessionRevision: session.revision,
        feedback: {
          schemaVersion: 1,
          id: entityId('feedback'),
          discoverySessionId: session.id,
          roundId: round.id,
          correlationId: session.correlationId,
          intent: action.intent,
          targets: [...action.targets],
          ...(action.message === undefined ? {} : { message: action.message }),
          createdAt: new Date().toISOString(),
          source: { kind: 'USER' },
          redactionStatus: 'NOT_REQUIRED',
        },
      })
      const next = await coreClient.restoreProjectSession(correlationId(), snapshot.project.id)
      setSnapshot(next)
      if (action.intent === 'SELECT') {
        window.location.hash = href('spec', snapshot.project.id).slice(1)
        await performAgentRequest({
          projectId: snapshot.project.id,
          message:
            '사용자가 UI에서 후보를 선택했습니다. 제공된 최신 Core context를 사용하고 설명보다 먼저 submit_learning_spec을 호출해 낮은 부담의 권장 Learning Spec 초안을 저장해 주세요.',
          expectation: { kind: 'SPEC', baseline: baselineSpec },
        })
      } else {
        await performAgentRequest({
          projectId: snapshot.project.id,
          message:
            '제공된 최신 Core context의 user-authored Discovery Feedback을 모두 반영해 다음 Candidate Round를 제출해 주세요.',
          expectation: { kind: 'ROUND', baseline: baselineRound },
        })
      }
    } catch (error) {
      setActionError(actionErrorMessage(error))
    } finally {
      setOperationBusy(false)
    }
  }

  const refineLearningSpec = async (message: string): Promise<void> => {
    if (snapshot === null) return
    setOperationBusy(true)
    setActionError(null)
    try {
      await performAgentRequest({
        projectId: snapshot.project.id,
        message: `제공된 최신 Core context를 사용하고 설명보다 먼저 submit_learning_spec을 호출해 Learning Spec을 저장해 주세요. 조정 요청: ${message}`,
        expectation: {
          kind: 'SPEC',
          baseline: snapshot.discoveryContext?.learningSpec?.revision ?? 0,
        },
      })
    } finally {
      setOperationBusy(false)
    }
  }

  const confirmAndPrepare = async (): Promise<void> => {
    const spec = snapshot?.learningSpec
    if (snapshot === null || spec === null || spec === undefined) return
    setOperationBusy(true)
    setActionError(null)
    try {
      let confirmedRevision = spec.revision
      if (spec.status !== 'CONFIRMED') {
        const receipt = await coreClient.confirmLearningSpec({
          schemaVersion: 1,
          kind: 'UI_CONFIRM_LEARNING_SPEC',
          correlationId: snapshot.discoverySession?.correlationId ?? snapshot.project.correlationId,
          actor: { kind: 'UI' },
          idempotencyKey: entityId('idem'),
          projectId: snapshot.project.id,
          learningSpecId: spec.id,
          expectedSpecRevision: spec.revision,
        })
        confirmedRevision = receipt.resourceRevision
      }
      await coreClient.prepareBuilderTask({
        schemaVersion: 1,
        kind: 'UI_PREPARE_BUILDER_TASK',
        correlationId: snapshot.discoverySession?.correlationId ?? snapshot.project.correlationId,
        actor: { kind: 'UI' },
        idempotencyKey: entityId('idem'),
        projectId: snapshot.project.id,
        learningSpecId: spec.id,
        expectedSpecRevision: confirmedRevision,
      })
      window.location.hash = href('build', snapshot.project.id).slice(1)
      setRefresh((value) => value + 1)
    } catch (error) {
      setActionError(actionErrorMessage(error))
    } finally {
      setOperationBusy(false)
    }
  }

  const returnToDiscovery = (): void => {
    if (snapshot === null) return
    setActionError(null)
    window.location.hash = href('discovery', snapshot.project.id).slice(1)
  }

  const restartDiscovery = async (input: DiscoveryInput): Promise<void> => {
    const session = snapshot?.discoverySession
    const spec = snapshot?.learningSpec
    if (
      snapshot === null ||
      session === null ||
      session === undefined ||
      spec === null ||
      spec === undefined
    )
      return
    setOperationBusy(true)
    setActionError(null)
    try {
      await coreClient.returnToDiscovery({
        schemaVersion: 1,
        kind: 'UI_RETURN_TO_DISCOVERY',
        correlationId: session.correlationId,
        actor: { kind: 'UI' },
        idempotencyKey: entityId('idem'),
        projectId: snapshot.project.id,
        discoverySessionId: session.id,
        expectedSessionRevision: session.revision,
        expectedSpecRevision: spec.revision,
        input,
      })
      const next = await coreClient.restoreProjectSession(correlationId(), snapshot.project.id)
      setSnapshot(next)
      window.location.hash = href('discovery', snapshot.project.id).slice(1)
      await generatePreviewCandidates(snapshot.project.id)
    } catch (error) {
      setActionError(actionErrorMessage(error))
    } finally {
      setOperationBusy(false)
    }
  }

  const generateCurrentDiscovery = async (): Promise<void> => {
    if (snapshot === null || snapshot.discoverySession?.status !== 'ACTIVE') return
    setOperationBusy(true)
    try {
      if ((snapshot.discoveryContext?.previewRound ?? null) === null) {
        await generatePreviewCandidates(snapshot.project.id)
      } else {
        void performCandidateEnrichment(snapshot.project.id)
      }
    } finally {
      setOperationBusy(false)
    }
  }

  const recoverableRun = snapshot === null ? null : recoverableAgentRun(snapshot)
  const recoveryKey =
    route.projectId !== null &&
    (route.name === 'discovery' || route.name === 'spec') &&
    !loadingSession &&
    !operationBusy &&
    agentRun.status === 'IDLE' &&
    snapshot?.discoverySession !== null &&
    snapshot?.discoverySession !== undefined &&
    recoverableRun !== null
      ? [
          snapshot.discoverySession.id,
          snapshot.discoverySession.revision,
          recoverableRun.phase,
          recoverableRun.expectation.kind,
          recoverableRun.expectation.kind === 'PREVIEW'
            ? 'preview'
            : recoverableRun.expectation.baseline,
        ].join(':')
      : null

  useEffect(() => {
    if (recoveryKey === null || inspectedRecoveryKeys.current.has(recoveryKey)) return
    inspectedRecoveryKeys.current.add(recoveryKey)
    const currentSnapshot = snapshot
    const run = recoverableRun
    const projectId = route.projectId
    if (
      currentSnapshot === null ||
      currentSnapshot.discoverySession === null ||
      run === null ||
      projectId === null
    )
      return
    const discoverySession = currentSnapshot.discoverySession

    const retryRequest =
      run.retryMessage === null
        ? null
        : { projectId, message: run.retryMessage, expectation: run.expectation }
    const retryRecoveredRun =
      retryRequest === null
        ? null
        : (): void => {
            void performAgentRequest(retryRequest)
          }
    void (async () => {
      try {
        const inspection = await discoveryClient.inspectRun(
          discoverySession.id,
          discoverySession.revision,
          run.phase,
        )
        if (inspection.status === 'MISSING') return
        if (inspection.status === 'LEGACY') {
          setAgentRun({
            status: 'TOOL_REJECTED',
            startedAt: null,
            detail:
              retryRequest === null
                ? '업데이트 전 Agent 실행은 현재 앱과 호환되지 않습니다. 수정 요청을 입력창에 다시 적어 주세요.'
                : '업데이트 전 Agent 실행은 현재 앱과 호환되지 않습니다. Core의 저장 상태를 기준으로 다시 요청할 수 있어요.',
            retry: retryRecoveredRun,
          })
          return
        }
        if (inspection.status === 'COMPLETED') {
          setAgentRun({
            status: 'TOOL_REJECTED',
            startedAt: null,
            detail:
              retryRequest === null
                ? '이전 Agent 응답은 끝났지만 수정 결과가 저장되지 않았습니다. 수정 요청을 다시 입력해 주세요.'
                : '이전 Agent 응답은 끝났지만 Core에 새 결과가 없습니다. 저장된 상태에서 안전하게 다시 요청할 수 있어요.',
            retry: retryRecoveredRun,
          })
          return
        }

        const runSequence = agentRunSequence.current + 1
        agentRunSequence.current = runSequence
        setAgentRun({
          status: 'BACKGROUND',
          startedAt: null,
          detail:
            '이전에 시작한 Agent 작업을 다시 연결했습니다. 완료될 때까지 저장 상태를 확인합니다.',
          retry: null,
        })
        const deadline = Date.now() + TARGET_DISCOVERY_TIMEOUT_MS
        while (Date.now() < deadline && agentRunSequence.current === runSequence) {
          await delay(900)
          const next = await coreClient.restoreProjectSession(correlationId(), projectId)
          if (agentRunSequence.current !== runSequence) return
          setSnapshot(next)
          if (expectationMet(next, run.expectation)) {
            setAgentRun(idleAgentRun)
            setRefresh((value) => value + 1)
            return
          }
          const latestInspection = await discoveryClient.inspectRun(
            discoverySession.id,
            discoverySession.revision,
            run.phase,
          )
          if (latestInspection.status === 'RUNNING') continue
          agentRunSequence.current += 1
          setAgentRun({
            status: 'TOOL_REJECTED',
            startedAt: null,
            detail:
              retryRequest === null
                ? 'Agent 실행은 끝났지만 수정 결과가 저장되지 않았습니다. 수정 요청을 다시 입력해 주세요.'
                : 'Agent 실행은 끝났지만 Core에 새 결과가 없습니다. 저장된 상태에서 안전하게 다시 요청할 수 있어요.',
            retry: retryRecoveredRun,
          })
          return
        }
        if (agentRunSequence.current !== runSequence) return
        setAgentRun({
          status: 'TIMED_OUT',
          startedAt: null,
          detail: '복원한 Agent 작업이 아직 끝나지 않았습니다. Core의 저장 상태는 유지됩니다.',
          retry: retryRecoveredRun,
        })
      } catch (error) {
        setAgentRun({
          status: 'HOST_DISCONNECTED',
          startedAt: null,
          detail: actionErrorMessage(error),
          retry: retryRecoveredRun,
        })
      }
    })()
  }, [
    coreClient,
    discoveryClient,
    performAgentRequest,
    recoverableRun,
    recoveryKey,
    route.projectId,
    snapshot,
  ])

  let content: ReactNode
  if (historyError !== null) content = <ErrorState error={historyError} retry={retry} />
  else if (route.name === 'history')
    content =
      loadingHistory || history === null ? (
        <LoadingState label="Opening Project History" />
      ) : (
        <HistoryView history={history} openProject={openProject} />
      )
  else if (route.name === 'discovery' && route.projectId === null)
    content = (
      <>
        <AgentRunBanner run={agentRun} />
        <DiscoveryStartView busy={operationBusy} error={actionError} onStart={startDiscovery} />
      </>
    )
  else if (loadingSession && snapshot?.project.id !== route.projectId)
    content = <LoadingState label={`Opening ${routeLabels[route.name]}`} />
  else if (sessionError !== null) content = <ErrorState error={sessionError} retry={retry} />
  else if (snapshot === null) content = <EmptyState route={route.name} />
  else if (route.name === 'discovery')
    content = (
      <DiscoveryWorkspace
        snapshot={snapshot}
        run={agentRun}
        busy={operationBusy}
        actionError={actionError}
        onFeedback={recordDiscoveryFeedback}
        onGenerate={generateCurrentDiscovery}
        onResumeEnrichment={() => performCandidateEnrichment(snapshot.project.id)}
        onLegacyFallback={() => generateLegacyCandidateRound(snapshot.project.id)}
        onRestart={restartDiscovery}
        onBackToSpec={() => navigate('spec', snapshot.project.id)}
      />
    )
  else if (route.name === 'spec')
    content = (
      <SpecWorkspace
        snapshot={snapshot}
        run={agentRun}
        busy={operationBusy}
        actionError={actionError}
        onRefine={refineLearningSpec}
        onConfirmAndPrepare={confirmAndPrepare}
        onReturn={returnToDiscovery}
      />
    )
  else
    content = (
      <BuildWorkspace
        key={snapshot.project.id}
        snapshot={snapshot}
        sessions={sessions}
        crewError={crewError}
        coreClient={coreClient}
        agentClient={agentClient}
        onSnapshot={setSnapshot}
      />
    )

  return (
    <>
      <style>{appStyles}</style>
      <main className="app-shell">
        <header className="app-header">
          <a className="brand" href={href('history')} aria-label="Vibe Helper Project History">
            <span className="brand-mark" aria-hidden="true">
              vh
            </span>
            <span>
              <strong>Vibe Helper</strong>
              <small>Learn through your own build.</small>
            </span>
          </a>
          <nav aria-label="Project workspace">
            {(Object.keys(routeLabels) as RouteName[]).map((name) => (
              <a
                key={name}
                href={href(name, name === 'history' ? null : selectedProjectId)}
                aria-current={route.name === name ? 'page' : undefined}
              >
                {routeLabels[name]}
              </a>
            ))}
          </nav>
          <label className="project-select">
            <span>Project</span>
            <select
              aria-label="Current project"
              value={selectedProjectId ?? ''}
              onChange={(event) => {
                const item = history?.projects.find(
                  (candidate) => candidate.project.id === event.target.value,
                )
                if (item !== undefined) openProject(item.project.id, item.suggestedSurface)
              }}
              disabled={history === null || history.projects.length === 0}
            >
              {history?.projects.length === 0 ? <option value="">No projects</option> : null}
              {history?.projects.map((item) => (
                <option key={item.project.id} value={item.project.id}>
                  {item.project.title}
                </option>
              ))}
            </select>
          </label>
        </header>
        <div className="page-frame">
          <div className="route-context">
            <span>{routeLabels[route.name]}</span>
            {snapshot === null ? null : (
              <>
                <i aria-hidden="true">/</i>
                <strong>{snapshot.project.title}</strong>
                <StatusPill value={snapshot.project.status} />
              </>
            )}
          </div>
          {content}
        </div>
      </main>
    </>
  )
}

export function App() {
  const api = useAppApi()
  const clients = useMemo(
    () => ({
      core: new CrewCoreClient(api),
      sessions: new CrewSessionClient(api),
      discovery: new CrewDiscoveryClient(api),
      agentMode: new CrewAgentModeClient(api),
    }),
    [api],
  )
  return (
    <VibeHelperApp
      coreClient={clients.core}
      sessionClient={clients.sessions}
      discoveryClient={clients.discovery}
      agentClient={clients.agentMode}
    />
  )
}

export default App
