import type {
  DecisionRequest,
  DecisionSessionItem,
  GeneratedResultDescriptor,
  ProjectEvidenceTrace,
  ProjectSessionSnapshot,
} from '@vibe-helper/contracts'
import {
  builderSlotKey,
  type CrewAgentModeClient,
  helperSlotKey,
  priorBuilderSlotKeys,
  priorHelperSlotKeys,
  type CrewProjectSessions,
  type CrewCoreClient,
} from '@vibe-helper/kiro-adapter/crew-app'
import * as KiroCrewSdk from '@kirocrew/app-sdk'
import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

type Pane = 'BUILDER' | 'HELPER'
type RuntimeStatus = 'IDLE' | 'BINDING' | 'RUNNING' | 'DONE' | 'FAILED'
type HelperOrigin = 'FREE_TEXT' | 'QUICK_ACTION'

export interface BuildWorkspaceProps {
  readonly snapshot: ProjectSessionSnapshot
  readonly sessions: CrewProjectSessions | null
  readonly crewError: string | null
  readonly coreClient: CrewCoreClient
  readonly agentClient: CrewAgentModeClient
  readonly onSnapshot: (snapshot: ProjectSessionSnapshot) => void
}

function entityId(prefix: 'corr' | 'idem' | 'decision_resolution'): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function actionError(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 완료하지 못했습니다.'
}

function decodeLegacyUnicodeEscapes(value: string): string {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_match, codePoint: string) =>
    String.fromCharCode(Number.parseInt(codePoint, 16)),
  )
}

function StatusPill({ value }: { readonly value: string }) {
  return (
    <span className={`status-pill status-${value.toLowerCase()}`}>
      {value.replaceAll('_', ' ')}
    </span>
  )
}

const conceptStateLabels = {
  OBSERVED: '프로젝트에서 관찰됨',
  EXPLAINED: '사용자가 설명함',
  DEMONSTRATED: '구현에서 보여줌',
  TRANSFERRED: '다른 맥락에 적용함',
} as const

function EvidenceTracePanel({
  trace,
  busy,
  error,
  onOpen,
  onRetry,
}: {
  readonly trace: ProjectEvidenceTrace | null
  readonly busy: boolean
  readonly error: string | null
  readonly onOpen: () => void
  readonly onRetry: (job: ProjectEvidenceTrace['analysis'][number]) => void
}) {
  return (
    <details
      className="evidence-trace-panel"
      onToggle={(event) => {
        if (event.currentTarget.open) onOpen()
      }}
    >
      <summary>
        <span>
          <strong>학습 Evidence 확인</strong>
          <small>상태 점수가 아니라, Core가 채택한 근거와 제외한 이유를 봅니다.</small>
        </span>
        <span aria-hidden="true">＋</span>
      </summary>
      <div className="evidence-trace-body" aria-live="polite">
        {busy ? <p>검증된 Evidence를 불러오는 중입니다…</p> : null}
        {error === null ? null : (
          <p className="pane-error" role="alert">
            {error}
          </p>
        )}
        {trace?.concepts.length === 0 ? (
          <div className="evidence-empty-state">
            <strong>아직 표시할 Evidence가 없습니다.</strong>
            <p>{trace.emptyReason}</p>
          </div>
        ) : null}
        {trace?.concepts.map((concept) => (
          <article className="concept-evidence-card" key={concept.conceptId}>
            <header>
              <div>
                <h3>{concept.conceptName}</h3>
                <p>{concept.description}</p>
              </div>
              {concept.state === null ? null : (
                <span className="evidence-state">{conceptStateLabels[concept.state]}</span>
              )}
            </header>
            {concept.evidence.length === 0 ? (
              <p className="evidence-muted">이 프로젝트에 공개할 수 있는 채택 근거가 없습니다.</p>
            ) : (
              <ol className="evidence-timeline">
                {concept.evidence.map((evidence) => (
                  <li key={evidence.evidenceId}>
                    <strong>{evidence.projectTitle}</strong>
                    <span>
                      {evidence.kind === 'CONCEPT_OBSERVATION'
                        ? '코드·작업에서 개념 사용이 관찰됨'
                        : evidence.redactedEvidenceExcerpt}
                    </span>
                    <small>
                      {evidence.episodeType.replaceAll('_', ' ')} ·{' '}
                      {evidence.supportsState === undefined
                        ? '오해 가능성 신호'
                        : conceptStateLabels[evidence.supportsState]}
                    </small>
                    {evidence.rationale === undefined ? null : <small>{evidence.rationale}</small>}
                  </li>
                ))}
              </ol>
            )}
            {concept.rejectedEvidence.length === 0 ? null : (
              <details className="evidence-subsection">
                <summary>채택되지 않은 제안 {concept.rejectedEvidence.length}개</summary>
                <ul>
                  {concept.rejectedEvidence.map((item) => (
                    <li key={item.evidenceDecisionId}>
                      <span>{item.redactedEvidenceExcerpt}</span>
                      <small>{item.explanation}</small>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {concept.openIssues.length === 0 ? null : (
              <div className="evidence-open-issues">
                <strong>아직 열린 오해 가능성</strong>
                <ul>
                  {concept.openIssues.map((issue) => (
                    <li key={issue.id}>{issue.summary}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ))}
        {trace?.personalization.length === 0 ? null : (
          <section
            className="personalization-provenance"
            aria-label="Agent personalization provenance"
          >
            <h3>Agent에 제공된 근거</h3>
            <p>이 기록은 근거 제공 여부를 뜻하며, 답변에 실제 사용됐다는 보증은 아닙니다.</p>
            <ul>
              {trace?.personalization.slice(0, 10).map((item) => (
                <li key={item.id}>
                  {item.mode === 'NO_RELEVANT_EVIDENCE'
                    ? '관련 Evidence 없이 일반 경로를 사용함'
                    : item.basis
                        .map(
                          (basis) =>
                            `${basis.conceptName} · ${basis.sourceProjectTitles.join(', ')}`,
                        )
                        .join(' / ')}
                </li>
              ))}
            </ul>
          </section>
        )}
        {trace?.analysis.map((job) =>
          job.status === 'FAILED' ? (
            <div className="analysis-retry" key={job.analysisJobId} role="status">
              <span>
                Evidence 분석이 완료되지 않았습니다. 저장된 Episode에서 안전하게 다시 시도할 수
                있습니다.
              </span>
              <button type="button" disabled={busy} onClick={() => onRetry(job)}>
                분석 다시 시도
              </button>
            </div>
          ) : null,
        )}
      </div>
    </details>
  )
}

interface HostChatMessageListProps {
  readonly messages: readonly unknown[]
  readonly running?: boolean
}

const HostChatMessageList = (
  KiroCrewSdk as unknown as {
    readonly ChatMessageList?: ComponentType<HostChatMessageListProps>
  }
).ChatMessageList

function NativeChatSession({
  slotKey,
  agent,
  placeholder,
  onSend,
  client,
  historySlotKeys,
  composerAccessory,
}: {
  readonly slotKey: string
  readonly agent: string
  readonly placeholder: string
  readonly onSend: (message: string) => void | Promise<void>
  readonly client: CrewAgentModeClient
  readonly historySlotKeys: readonly string[]
  readonly composerAccessory?: ReactNode
}) {
  const [historyMessages, setHistoryMessages] = useState<readonly unknown[]>([])
  const [messages, setMessages] = useState<readonly unknown[]>([])
  const [running, setRunning] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const role = agent.includes('builder') ? 'Builder' : 'Helper'

  useEffect(() => {
    let active = true
    void Promise.all(historySlotKeys.map((key) => client.readRenderableSession(key)))
      .then((sessions) => {
        if (active) setHistoryMessages(sessions.flatMap((session) => session.messages))
      })
      .catch((error: unknown) => {
        if (active) setSessionError(actionError(error))
      })
    return () => {
      active = false
    }
  }, [client, historySlotKeys])

  useEffect(() => {
    let active = true
    let timer: number | undefined
    const refresh = async (): Promise<void> => {
      try {
        const session = await client.readRenderableSession(slotKey)
        if (!active) return
        setMessages(session.messages)
        setRunning(session.running)
        setSessionError(null)
      } catch (error) {
        if (active) setSessionError(actionError(error))
      } finally {
        if (active) timer = window.setTimeout(() => void refresh(), running ? 800 : 2_000)
      }
    }
    void refresh()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [client, running, slotKey])

  if (HostChatMessageList === undefined) {
    return (
      <div className="native-chat-unavailable" role="alert">
        <strong>실제 Crew 채팅을 열 수 없습니다.</strong>
        <p>현재 Kiro host가 필요한 session renderer를 제공하지 않습니다.</p>
      </div>
    )
  }
  const renderableMessages = [...historyMessages, ...messages]
  return (
    <div className="native-chat-frame">
      <div className="native-message-list" role="log" aria-label={`${role} transcript`}>
        <HostChatMessageList messages={renderableMessages} running={running || sending} />
      </div>
      {sessionError === null ? null : (
        <p className="pane-error" role="alert">
          {sessionError}
        </p>
      )}
      {composerAccessory}
      <form
        className="native-chat-composer"
        onSubmit={(event) => {
          event.preventDefault()
          const message = draft.trim()
          if (message.length === 0 || sending) return
          setDraft('')
          setSending(true)
          void Promise.resolve(onSend(message)).finally(() => setSending(false))
        }}
      >
        <textarea
          aria-label={`${role} message`}
          value={draft}
          rows={2}
          placeholder={placeholder}
          disabled={sending}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="native-chat-actions">
          {running || sending ? (
            <button
              type="button"
              className="chat-stop-button"
              disabled={stopping}
              onClick={() => {
                setStopping(true)
                void client
                  .stopSession(slotKey)
                  .then(() => setRunning(false))
                  .catch((error: unknown) => setSessionError(actionError(error)))
                  .finally(() => setStopping(false))
              }}
            >
              {stopping ? '중지 중…' : `${role} 중지`}
            </button>
          ) : null}
          <button type="submit" disabled={sending || draft.trim().length === 0}>
            {sending ? `${role} 응답 중…` : `${role}에게 보내기`}
          </button>
        </div>
      </form>
    </div>
  )
}

function AgentPane({
  kind,
  title,
  eyebrow,
  status,
  children,
  slotKey,
  agent,
  placeholder,
  error,
  onSend,
  client,
  historySlotKeys,
}: {
  readonly kind: 'builder' | 'helper'
  readonly title: string
  readonly eyebrow: string
  readonly status: ReactNode
  readonly children?: ReactNode
  readonly slotKey: string
  readonly agent: string
  readonly placeholder: string
  readonly error: string | null
  readonly onSend: (message: string) => void | Promise<void>
  readonly client: CrewAgentModeClient
  readonly historySlotKeys: readonly string[]
}) {
  return (
    <section className={`agent-pane ${kind}-pane`} aria-labelledby={`${kind}-pane-title`}>
      <header className="agent-pane-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3 id={`${kind}-pane-title`}>{title}</h3>
        </div>
        {status}
      </header>
      <NativeChatSession
        slotKey={slotKey}
        agent={agent}
        placeholder={placeholder}
        onSend={onSend}
        client={client}
        historySlotKeys={historySlotKeys}
        composerAccessory={children}
      />
      {error === null ? null : (
        <p className="pane-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function HelperTools({
  busy,
  focusedDecision,
  onAsk,
}: {
  readonly busy: boolean
  readonly focusedDecision: DecisionRequest | null
  readonly onAsk: (question: string, origin: HelperOrigin, decisionId?: string) => void
}) {
  const quickActions = focusedDecision
    ? [
        '이 선택지들의 차이를 쉬운 말로 비교해줘',
        'Builder 추천의 장점과 위험을 설명해줘',
        '이 결정이 지금 필요한 이유를 예시로 알려줘',
      ]
    : [
        '현재 작업을 쉬운 비유로 설명해줘',
        '지금 사용 중인 핵심 개념을 알려줘',
        '다음 테스트가 확인하는 것을 설명해줘',
      ]
  return (
    <div className="helper-tools">
      {focusedDecision === null ? null : (
        <div className="helper-focus">
          <span>현재 Decision</span>
          <strong>{focusedDecision.question}</strong>
        </div>
      )}
      <fieldset className="quick-actions" aria-label="Helper quick actions">
        <legend>추천 질문</legend>
        {quickActions.map((question) => (
          <button
            type="button"
            key={question}
            disabled={busy}
            onClick={() => onAsk(question, 'QUICK_ACTION', focusedDecision?.id)}
          >
            {question}
          </button>
        ))}
      </fieldset>
    </div>
  )
}

function DecisionCard({
  item,
  busy,
  onAskHelper,
  onResolve,
}: {
  readonly item: DecisionSessionItem
  readonly busy: boolean
  readonly onAskHelper: () => void
  readonly onResolve: (
    decision: DecisionRequest,
    selection:
      | { readonly kind: 'RECOMMENDATION' | 'OPTION'; readonly optionId: string }
      | {
          readonly kind: 'CUSTOM'
          readonly proposal: string
        },
  ) => void
}) {
  const { request, resolution, application } = item
  const recommended = request.options.find((option) => option.id === request.recommendedOptionId)
  if (resolution !== null) {
    const selected = request.options.find((option) => option.id === resolution.selectedOptionId)
    return (
      <article className="decision-card decision-resolved">
        <div className="decision-title-row">
          <div>
            <p className="eyebrow">Decision resolved</p>
            <h3>{request.question}</h3>
          </div>
          <StatusPill value={application === null ? 'APPLY_PENDING' : 'APPLIED'} />
        </div>
        <p className="decision-answer">
          {resolution.selectionKind === 'CUSTOM'
            ? resolution.customProposal
            : (selected?.label ?? '선택한 옵션')}
        </p>
        {resolution.rationale === undefined ? null : (
          <p>{decodeLegacyUnicodeEscapes(resolution.rationale)}</p>
        )}
        {application === null ? (
          <small>Builder가 저장된 결정을 읽고 적용하기를 기다리고 있습니다.</small>
        ) : (
          <small>{decodeLegacyUnicodeEscapes(application.appliedResult)}</small>
        )}
      </article>
    )
  }

  return (
    <article className="decision-card decision-pending">
      <div className="decision-title-row">
        <div>
          <p className="eyebrow">Decision needed · {request.category.replaceAll('_', ' ')}</p>
          <h3>{request.question}</h3>
        </div>
        <span className="decision-owner">결정은 사용자가 합니다</span>
      </div>
      <p className="decision-reason">{request.reasonRequiredNow}</p>
      {recommended === undefined ? null : (
        <div className="recommendation-box">
          <span>Builder recommendation</span>
          <strong>{recommended.label}</strong>
          <p>{request.recommendationRationale}</p>
        </div>
      )}
      <details className="decision-details">
        <summary>선택지 영향 자세히 보기</summary>
        <div className="decision-options">
          {request.options.map((option) => (
            <section
              className={option.id === request.recommendedOptionId ? 'recommended-option' : ''}
              key={option.id}
            >
              <div>
                <strong>{option.label}</strong>
                {option.id === request.recommendedOptionId ? <span>Builder 추천</span> : null}
              </div>
              <p>{option.description}</p>
              <ul>
                {option.impacts.map((impact) => (
                  <li key={impact}>{impact}</li>
                ))}
                {option.tradeoffs.map((tradeoff) => (
                  <li key={tradeoff}>{tradeoff}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>
      <fieldset className="decision-reply-row">
        <legend>추천 답장</legend>
        <div>
          {request.options.map((option) => (
            <button
              type="button"
              className={option.id === request.recommendedOptionId ? 'recommended-reply' : ''}
              disabled={busy}
              key={option.id}
              onClick={() =>
                onResolve(
                  request,
                  option.id === request.recommendedOptionId
                    ? { kind: 'RECOMMENDATION', optionId: option.id }
                    : { kind: 'OPTION', optionId: option.id },
                )
              }
            >
              {option.label}
              {option.id === request.recommendedOptionId ? ' · 추천' : ''}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={onAskHelper}>
            Helper에게 비교 요청
          </button>
        </div>
      </fieldset>
      <p className="decision-composer-hint">
        아래 Builder 입력창에 선택 이유나 전혀 다른 방향을 직접 적어도 됩니다.
      </p>
    </article>
  )
}

function CompletionView({
  snapshot,
  descriptor,
  busy,
  error,
  onLaunch,
}: {
  readonly snapshot: ProjectSessionSnapshot
  readonly descriptor: GeneratedResultDescriptor | null
  readonly busy: boolean
  readonly error: string | null
  readonly onLaunch: () => void
}) {
  const report = snapshot.completionReport
  if (report === null) return null
  return (
    <section className="completion-view" aria-labelledby="completion-title">
      <div className="completion-primary">
        <p className="eyebrow">Runnable result</p>
        <h2 id="completion-title">{snapshot.project.title} 완성</h2>
        <p>Builder가 구현과 검증을 마쳤습니다. 결과물을 먼저 확인해 보세요.</p>
        <button className="primary-button" type="button" disabled={busy} onClick={onLaunch}>
          {busy ? '결과 확인 중…' : '생성 결과 열기'}
        </button>
        {descriptor === null ? null : (
          <p className="result-ready" role="status">
            {descriptor.status === 'RUNNING' ? (
              <a href={descriptor.url} target="_blank" rel="noreferrer">
                실행 중인 결과 다시 열기
              </a>
            ) : (
              `실행 준비 완료 · ${descriptor.workspacePath}`
            )}
          </p>
        )}
        {error === null ? null : <p className="pane-error">{error}</p>}
      </div>
      <div className="completion-details">
        <section>
          <h3>구현된 기능</h3>
          <ul>
            {report.implementedFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>검증 결과</h3>
          <ul>
            {report.validationResults.map((validation) => (
              <li key={validation.name}>
                <StatusPill value={validation.status} /> {validation.name} — {validation.summary}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  )
}

function FinalUpgradePanel({
  personalizationReady,
  goal,
  busy,
  error,
  onGoal,
  onAskHelper,
  onPrepare,
}: {
  readonly personalizationReady: boolean
  readonly goal: string
  readonly busy: boolean
  readonly error: string | null
  readonly onGoal: (value: string) => void
  readonly onAskHelper: () => void
  readonly onPrepare: () => void
}) {
  return (
    <section className="final-upgrade-panel" aria-labelledby="final-upgrade-title">
      <p className="eyebrow">Optional Final Upgrade</p>
      <h3 id="final-upgrade-title">Evidence를 다음 개선에 연결하기</h3>
      <p>
        Helper가 검증된 Evidence와 현재 결과를 함께 보고 다음 개선 후보를 설명합니다. 건너뛰어도
        완료 상태는 그대로 유지됩니다.
      </p>
      <button type="button" disabled={busy} onClick={onAskHelper}>
        Helper와 개선 방향 찾기
      </button>
      {personalizationReady ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onPrepare()
          }}
        >
          <label>
            <span>내가 선택한 개선 목표</span>
            <textarea
              value={goal}
              onChange={(event) => onGoal(event.target.value)}
              placeholder="예: 만료된 링크와 이미 사용한 링크를 서로 다른 안내로 보여줘"
              rows={3}
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={busy || goal.trim().length === 0}
          >
            {busy ? '개선 Task 준비 중…' : '이 목표로 개선 시작'}
          </button>
        </form>
      ) : null}
      {error === null ? null : <p className="pane-error">{error}</p>}
    </section>
  )
}

export function BuildWorkspace({
  snapshot,
  sessions,
  crewError,
  coreClient,
  agentClient,
  onSnapshot,
}: BuildWorkspaceProps) {
  const [mobilePane, setMobilePane] = useState<Pane>('BUILDER')
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>('IDLE')
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [helperBusy, setHelperBusy] = useState(false)
  const [helperError, setHelperError] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [helperUsedDecisionIds, setHelperUsedDecisionIds] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        snapshot.helperConversations.flatMap((conversation) =>
          conversation.decisionId === undefined ? [] : [conversation.decisionId],
        ),
      ),
  )
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null)
  const [launchBusy, setLaunchBusy] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [resultDescriptor, setResultDescriptor] = useState<GeneratedResultDescriptor | null>(null)
  const [upgradePersonalizationId, setUpgradePersonalizationId] = useState<string | null>(null)
  const [upgradeGoal, setUpgradeGoal] = useState('')
  const [upgradeBusy, setUpgradeBusy] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [evidenceTrace, setEvidenceTrace] = useState<ProjectEvidenceTrace | null>(null)
  const [evidenceBusy, setEvidenceBusy] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const autoStartedTasks = useRef(new Set<string>())

  const task = snapshot.currentTask
  const runtimeTaskId = useRef(task?.id)
  const focusedDecision =
    snapshot.decisions.find((item) => item.resolution === null)?.request ?? null
  const allDecisionItems = useMemo(() => {
    if (snapshot.decisions.length > 0) return snapshot.decisions
    return snapshot.pendingDecisions.map((request) => ({
      request,
      resolution: null,
      application: null,
    }))
  }, [snapshot.decisions, snapshot.pendingDecisions])
  const focusedDecisionItem =
    allDecisionItems.find((item) => item.resolution === null) ?? allDecisionItems.at(-1) ?? null
  const builderHistorySlotKeys = useMemo(
    () => priorBuilderSlotKeys(snapshot.project.id),
    [snapshot.project.id],
  )
  const helperHistorySlotKeys = useMemo(
    () => priorHelperSlotKeys(snapshot.project.id),
    [snapshot.project.id],
  )

  const restore = useCallback(async (): Promise<ProjectSessionSnapshot> => {
    const restored = await coreClient.restoreProjectSession(entityId('corr'), snapshot.project.id)
    onSnapshot(restored)
    return restored
  }, [coreClient, onSnapshot, snapshot.project.id])

  const dispatchBuilder = useCallback(
    async (
      source: ProjectSessionSnapshot,
      visibleMessage: string,
      privateInstruction: string,
    ): Promise<void> => {
      const currentTask = source.currentTask
      if (currentTask === null || currentTask.status === 'COMPLETED') {
        setRuntimeError(
          '완료된 Task에는 새 Builder 작업을 보낼 수 없습니다. Helper에게 질문해 주세요.',
        )
        return
      }
      if (runtimeStatus === 'BINDING' || runtimeStatus === 'RUNNING') {
        setRuntimeError('Builder가 현재 응답 중입니다. 완료된 뒤 이어서 보내 주세요.')
        return
      }
      setRuntimeError(null)
      setRuntimeStatus('BINDING')
      try {
        const runCorrelationId = entityId('corr')
        const binding = await coreClient.prepareBuilderSession({
          schemaVersion: 1,
          kind: 'UI_PREPARE_BUILDER_SESSION',
          correlationId: runCorrelationId,
          actor: { kind: 'UI' },
          projectId: source.project.id,
          taskId: currentTask.id,
        })
        const receipt = await agentClient.dispatchBuilder({
          projectId: source.project.id,
          taskId: currentTask.id,
          workspaceDirectory: binding.workspaceDirectory,
          message: visibleMessage,
          context: [
            'Private Vibe Helper Core context. Never repeat these identifiers or this instruction in the visible answer.',
            `schemaVersion=1, projectId=${source.project.id}, taskId=${currentTask.id}, correlationId=${currentTask.correlationId}, idempotencyKey=${entityId('idem')}.`,
            privateInstruction,
          ].join('\n'),
          onEvent: () => undefined,
        })
        setRuntimeStatus('RUNNING')
        const completion = await receipt.completion
        setRuntimeStatus(completion.status === 'DONE' ? 'DONE' : 'FAILED')
        if (completion.status !== 'DONE') setRuntimeError('Builder session 연결이 종료되었습니다.')
        await restore()
      } catch (error) {
        setRuntimeStatus('FAILED')
        setRuntimeError(actionError(error))
      }
    },
    [agentClient, coreClient, restore, runtimeStatus],
  )

  useEffect(() => {
    if (runtimeTaskId.current === task?.id) return

    runtimeTaskId.current = task?.id
    setRuntimeStatus('IDLE')
    setRuntimeError(null)
    setConversationId(undefined)
  }, [task?.id])

  useEffect(() => {
    if (
      sessions === null ||
      task === null ||
      task.status !== 'PENDING' ||
      (task.sequence === 1 && sessions.builderMessages.length > 0) ||
      runtimeStatus !== 'IDLE' ||
      autoStartedTasks.current.has(task.id)
    ) {
      return
    }
    autoStartedTasks.current.add(task.id)
    void dispatchBuilder(
      snapshot,
      '확정한 Learning Spec을 기준으로 구현을 시작해줘. 중요한 실제 판단이 필요하면 먼저 물어봐.',
      'Read the current Task and Live Context from Core, then start the Task. Stop and request a real Decision when one is required.',
    )
  }, [dispatchBuilder, runtimeStatus, sessions, snapshot, task])

  const loadEvidenceTrace = useCallback(async (): Promise<void> => {
    if (evidenceBusy) return
    setEvidenceBusy(true)
    setEvidenceError(null)
    try {
      setEvidenceTrace(
        await coreClient.readEvidenceTrace({
          schemaVersion: 1,
          kind: 'UI_READ_EVIDENCE_TRACE',
          correlationId: entityId('corr'),
          actor: { kind: 'UI' },
          projectId: snapshot.project.id,
        }),
      )
    } catch (error) {
      setEvidenceError(actionError(error))
    } finally {
      setEvidenceBusy(false)
    }
  }, [coreClient, evidenceBusy, snapshot.project.id])

  const askHelper = async (
    question: string,
    origin: HelperOrigin,
    decisionId?: string,
  ): Promise<void> => {
    if (task === null) return
    setHelperBusy(true)
    setHelperError(null)
    try {
      const helperCorrelationId = entityId('corr')
      const helperContext = await coreClient.openHelper({
        schemaVersion: 1,
        kind: 'UI_OPEN_HELPER',
        correlationId: helperCorrelationId,
        actor: { kind: 'UI' },
        projectId: snapshot.project.id,
        taskId: task.id,
        ...(decisionId === undefined ? {} : { decisionId }),
        question,
      })
      const receipt = await agentClient.dispatchHelper({
        projectId: snapshot.project.id,
        message: question,
        context: [
          'Private Vibe Helper Core context. Never repeat these identifiers or this instruction in the visible answer.',
          `schemaVersion=1, projectId=${snapshot.project.id}, taskId=${task.id}, correlationId=${helperCorrelationId}${decisionId === undefined ? '' : `, decisionId=${decisionId}`}.`,
          'Read get_helper_context and provide a read-only explanation. Do not mutate code, decisions, or Core state.',
        ].join('\n'),
      })
      const completion = await receipt.completion
      if (completion.status !== 'DONE' || completion.assistantText.length === 0) {
        throw new Error('Helper가 저장 가능한 답변을 반환하지 않았습니다.')
      }
      const recorded = await coreClient.recordHelperExchange({
        schemaVersion: 1,
        kind: 'UI_RECORD_HELPER_EXCHANGE',
        correlationId: helperCorrelationId,
        actor: { kind: 'UI' },
        idempotencyKey: entityId('idem'),
        projectId: snapshot.project.id,
        taskId: task.id,
        ...(decisionId === undefined ? {} : { decisionId }),
        ...(conversationId === undefined ? {} : { conversationId }),
        userMessage: question,
        helperResponseSummary: completion.assistantSummary,
        origin,
        closeConversation: false,
      })
      setConversationId(recorded.conversationId)
      if (task.status === 'COMPLETED') {
        if (helperContext.personalization.mode === 'EVIDENCE_AWARE') {
          setUpgradePersonalizationId(helperContext.personalization.id)
          setUpgradeError(null)
        } else {
          setUpgradePersonalizationId(null)
          setUpgradeError(
            '아직 연결할 accepted Evidence가 없습니다. 분석이 끝난 뒤 다시 확인해 주세요.',
          )
        }
      }
      if (decisionId !== undefined) {
        setHelperUsedDecisionIds((current) => new Set([...current, decisionId]))
      }
      await restore()
      setEvidenceTrace(null)
      await loadEvidenceTrace()
    } catch (error) {
      setHelperError(actionError(error))
    } finally {
      setHelperBusy(false)
    }
  }

  const resolveDecision = async (
    decision: DecisionRequest,
    selection:
      | { readonly kind: 'RECOMMENDATION' | 'OPTION'; readonly optionId: string }
      | { readonly kind: 'CUSTOM'; readonly proposal: string },
  ): Promise<void> => {
    const currentTask = snapshot.currentTask
    if (currentTask === null) return
    setDecisionBusyId(decision.id)
    setRuntimeError(null)
    try {
      await coreClient.resolveDecision({
        schemaVersion: 1,
        kind: 'UI_RESOLVE_DECISION',
        correlationId: decision.correlationId,
        actor: { kind: 'UI' },
        idempotencyKey: entityId('idem'),
        resolution: {
          schemaVersion: 1,
          id: entityId('decision_resolution'),
          decisionId: decision.id,
          projectId: decision.projectId,
          taskId: decision.taskId,
          correlationId: decision.correlationId,
          expectedContextVersion: snapshot.liveContext?.contextVersion ?? decision.contextVersion,
          selectionKind: selection.kind,
          ...(selection.kind === 'CUSTOM'
            ? { customProposal: selection.proposal }
            : { selectedOptionId: selection.optionId }),
          helperUsed: helperUsedDecisionIds.has(decision.id),
          resolvedAt: new Date().toISOString(),
          source: { kind: 'USER' },
          redactionStatus: 'NOT_REQUIRED',
        },
      })
      const restored = await restore()
      const selectedOption =
        selection.kind === 'CUSTOM'
          ? null
          : decision.options.find((option) => option.id === selection.optionId)
      const visibleMessage =
        selection.kind === 'CUSTOM'
          ? selection.proposal
          : selection.kind === 'RECOMMENDATION'
            ? `Builder 추천인 “${selectedOption?.label ?? '선택한 방향'}”으로 진행해줘.`
            : `“${selectedOption?.label ?? '선택한 방향'}”으로 진행해줘.`
      await dispatchBuilder(
        restored,
        visibleMessage,
        `Decision ${decision.id} was resolved by the user. Read get_decision_result, apply the exact stored resolution, record apply_decision_result, and continue the Task.`,
      )
    } catch (error) {
      setRuntimeError(actionError(error))
    } finally {
      setDecisionBusyId(null)
    }
  }

  const launchResult = async (): Promise<void> => {
    setLaunchBusy(true)
    setLaunchError(null)
    try {
      const descriptor = await coreClient.launchResult({
        schemaVersion: 1,
        kind: 'UI_LAUNCH_RESULT',
        correlationId: entityId('corr'),
        actor: { kind: 'UI' },
        idempotencyKey: entityId('idem'),
        projectId: snapshot.project.id,
      })
      setResultDescriptor(descriptor)
      if (descriptor.status === 'RUNNING') {
        window.open(descriptor.url, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      setLaunchError(actionError(error))
    } finally {
      setLaunchBusy(false)
    }
  }

  const prepareFinalUpgrade = async (): Promise<void> => {
    if (task === null || task.status !== 'COMPLETED' || upgradePersonalizationId === null) return
    setUpgradeBusy(true)
    setUpgradeError(null)
    try {
      await coreClient.prepareFinalUpgradeTask({
        schemaVersion: 1,
        kind: 'UI_PREPARE_FINAL_UPGRADE_TASK',
        correlationId: entityId('corr'),
        actor: { kind: 'UI' },
        idempotencyKey: entityId('idem'),
        projectId: snapshot.project.id,
        sourceTaskId: task.id,
        expectedSourceTaskRevision: task.revision,
        personalizationTraceId: upgradePersonalizationId,
        userGoal: upgradeGoal,
      })
      setResultDescriptor(null)
      await restore()
    } catch (error) {
      setUpgradeError(actionError(error))
    } finally {
      setUpgradeBusy(false)
    }
  }

  const retryAnalysis = async (job: ProjectEvidenceTrace['analysis'][number]): Promise<void> => {
    setEvidenceBusy(true)
    setEvidenceError(null)
    try {
      await coreClient.retryAnalysis({
        schemaVersion: 1,
        kind: 'UI_RETRY_ANALYSIS',
        correlationId: entityId('corr'),
        actor: { kind: 'UI' },
        idempotencyKey: entityId('idem'),
        projectId: snapshot.project.id,
        analysisJobId: job.analysisJobId,
        expectedJobRevision: job.revision,
      })
      setEvidenceTrace(null)
      await loadEvidenceTrace()
    } catch (error) {
      setEvidenceError(actionError(error))
    } finally {
      setEvidenceBusy(false)
    }
  }

  return (
    <section aria-labelledby="build-title">
      <div className="build-session-bar">
        <div>
          <p className="eyebrow">Agent session</p>
          <h2 id="build-title">{task?.title ?? 'Build has not started.'}</h2>
        </div>
        <div className="session-status-cluster">
          {snapshot.liveContext === null ? null : (
            <span className="live-progress" role="status" aria-label="Live Progress">
              <strong>{snapshot.liveContext.stage}</strong>
              <small>Context v{snapshot.liveContext.contextVersion}</small>
            </span>
          )}
          {task === null ? null : <StatusPill value={task.status} />}
        </div>
      </div>
      {crewError === null ? null : (
        <div className="inline-notice" role="status">
          <strong>Crew conversation unavailable.</strong> {crewError} Durable Core state remains
          visible.
        </div>
      )}
      <div className="mobile-pane-tabs" role="tablist" aria-label="Agent mode panes">
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'BUILDER'}
          onClick={() => setMobilePane('BUILDER')}
        >
          Builder
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'HELPER'}
          onClick={() => setMobilePane('HELPER')}
        >
          Helper
        </button>
      </div>
      <div className="agent-mode-grid" data-mobile-active={mobilePane.toLowerCase()}>
        <AgentPane
          kind="builder"
          eyebrow="Build Agent · actual session"
          title="Builder"
          status={
            <span className={`runtime-state runtime-${runtimeStatus.toLowerCase()}`}>
              {runtimeStatus}
            </span>
          }
          slotKey={sessions?.builderSlotKey ?? builderSlotKey(snapshot.project.id)}
          agent="vibe-helper-builder"
          placeholder={
            focusedDecision === null
              ? 'Builder에게 구현 방향을 말하거나 질문하세요.'
              : '이 선택에 답하거나 전혀 다른 방향을 직접 제안하세요.'
          }
          error={runtimeError}
          client={agentClient}
          historySlotKeys={builderHistorySlotKeys}
          onSend={(message) => {
            if (focusedDecision !== null) {
              return resolveDecision(focusedDecision, { kind: 'CUSTOM', proposal: message })
            }
            return dispatchBuilder(
              snapshot,
              message,
              'Read the current Task and Live Context before acting on the user message. Treat the latest explicit user direction as authoritative within safety and permission boundaries.',
            )
          }}
        >
          <div className="intervention-stack">
            {focusedDecisionItem === null ? null : (
              <section className="decision-stack" aria-label="Current Task decision">
                <DecisionCard
                  item={focusedDecisionItem}
                  busy={decisionBusyId === focusedDecisionItem.request.id}
                  onAskHelper={() => {
                    setMobilePane('HELPER')
                    void askHelper(
                      '이 선택지들의 영향과 Builder 추천의 tradeoff를 쉬운 말로 비교해줘',
                      'QUICK_ACTION',
                      focusedDecisionItem.request.id,
                    )
                  }}
                  onResolve={(decision, selection) => void resolveDecision(decision, selection)}
                />
              </section>
            )}
            {snapshot.completionReport === null ? null : (
              <>
                <CompletionView
                  snapshot={snapshot}
                  descriptor={resultDescriptor}
                  busy={launchBusy}
                  error={launchError}
                  onLaunch={() => void launchResult()}
                />
                {task?.finalUpgrade === undefined ? (
                  <FinalUpgradePanel
                    personalizationReady={upgradePersonalizationId !== null}
                    goal={upgradeGoal}
                    busy={upgradeBusy || helperBusy}
                    error={upgradeError}
                    onGoal={setUpgradeGoal}
                    onAskHelper={() => {
                      setMobilePane('HELPER')
                      void askHelper(
                        '검증된 Evidence와 지금 완성된 결과를 연결해서, 내가 직접 선택할 만한 작고 유용한 다음 개선 2가지를 tradeoff와 함께 제안해줘.',
                        'QUICK_ACTION',
                      )
                    }}
                    onPrepare={() => void prepareFinalUpgrade()}
                  />
                ) : null}
              </>
            )}
          </div>
        </AgentPane>
        <AgentPane
          kind="helper"
          eyebrow="Read-only guide · actual session"
          title="Helper"
          status={
            <span className={`read-only-badge${helperBusy ? ' helper-busy' : ''}`}>
              {helperBusy ? '답변 중' : '설명 전용'}
            </span>
          }
          slotKey={sessions?.helperSlotKey ?? helperSlotKey(snapshot.project.id)}
          agent="vibe-helper-helper"
          placeholder="현재 코드나 판단에 관해 무엇이든 물어보세요."
          error={helperError}
          client={agentClient}
          historySlotKeys={helperHistorySlotKeys}
          onSend={(question) => askHelper(question, 'FREE_TEXT', focusedDecision?.id)}
        >
          <HelperTools
            busy={helperBusy}
            focusedDecision={focusedDecision}
            onAsk={(question, origin, decisionId) => void askHelper(question, origin, decisionId)}
          />
        </AgentPane>
      </div>
      <EvidenceTracePanel
        trace={evidenceTrace}
        busy={evidenceBusy}
        error={evidenceError}
        onOpen={() => {
          if (!evidenceBusy) void loadEvidenceTrace()
        }}
        onRetry={(job) => void retryAnalysis(job)}
      />
    </section>
  )
}
