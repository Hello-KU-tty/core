import type {
  DecisionRequest,
  DecisionSessionItem,
  GeneratedResultDescriptor,
  ProjectSessionSnapshot,
} from '@vibe-helper/contracts'
import type {
  BuilderStreamEvent,
  CrewAgentModeClient,
  CrewCoreClient,
  CrewConversationMessage,
  CrewProjectSessions,
} from '@vibe-helper/kiro-adapter/crew-app'
import { useMemo, useState } from 'react'

const MAX_VISIBLE_STREAM_EVENTS = 160

type Pane = 'BUILDER' | 'HELPER'
type RuntimeStatus = 'IDLE' | 'BINDING' | 'RUNNING' | 'DONE' | 'FAILED'
type HelperOrigin = 'FREE_TEXT' | 'QUICK_ACTION'

interface LocalMessage extends CrewConversationMessage {
  readonly origin?: HelperOrigin
}

interface StreamState {
  readonly events: readonly BuilderStreamEvent[]
  readonly olderCount: number
}

interface DecisionDraft {
  readonly customProposal: string
  readonly rationale: string
}

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

function StatusPill({ value }: { readonly value: string }) {
  return (
    <span className={`status-pill status-${value.toLowerCase()}`}>
      {value.replaceAll('_', ' ')}
    </span>
  )
}

function StreamIcon({ kind }: { readonly kind: BuilderStreamEvent['kind'] }) {
  const label = {
    MESSAGE: '말',
    TOOL_CALL: '도구',
    FILE_CHANGE: '파일',
    TEST_RESULT: '검증',
    ERROR: '오류',
    STATUS: '상태',
  }[kind]
  return <span className={`stream-kind stream-kind-${kind.toLowerCase()}`}>{label}</span>
}

function BuilderPane({
  messages,
  stream,
  status,
  error,
  canDispatch,
  dispatchLabel,
  draft,
  onDraft,
  onDispatch,
}: {
  readonly messages: readonly CrewConversationMessage[]
  readonly stream: StreamState
  readonly status: RuntimeStatus
  readonly error: string | null
  readonly canDispatch: boolean
  readonly dispatchLabel: string
  readonly draft: string
  readonly onDraft: (draft: string) => void
  readonly onDispatch: (purpose?: string) => void
}) {
  const dispatchDisabled = !canDispatch || status === 'BINDING' || status === 'RUNNING'
  return (
    <section className="agent-pane builder-pane" aria-labelledby="builder-pane-title">
      <header className="agent-pane-header">
        <div>
          <p className="eyebrow">Build Agent</p>
          <h3 id="builder-pane-title">Builder</h3>
        </div>
        <span className={`runtime-state runtime-${status.toLowerCase()}`}>{status}</span>
      </header>
      <div className="builder-stream" role="log" aria-live="polite" aria-relevant="additions">
        {stream.olderCount > 0 ? (
          <p className="older-activity">이전 활동 {stream.olderCount}개는 접어 두었습니다.</p>
        ) : null}
        {messages.map((message) => (
          <article className="stream-event stream-message" key={`history-${message.key}`}>
            <StreamIcon kind="MESSAGE" />
            <div>
              <strong>{message.role === 'USER' ? 'You' : 'Builder'}</strong>
              <p>{message.content}</p>
            </div>
          </article>
        ))}
        {stream.events.map((event) => (
          <article
            className={`stream-event stream-${event.kind.toLowerCase()}`}
            key={event.sequence}
          >
            <StreamIcon kind={event.kind} />
            <div>
              <strong>{event.kind.replaceAll('_', ' ')}</strong>
              <p>{event.summary}</p>
            </div>
          </article>
        ))}
        {messages.length === 0 && stream.events.length === 0 ? (
          <div className="stream-empty">
            <strong>실제 Builder 실행이 여기에 나타납니다.</strong>
            <p>메시지, tool call, 파일 변경, 테스트와 오류 수정을 순서대로 보여드려요.</p>
          </div>
        ) : null}
      </div>
      {error === null ? null : (
        <p className="pane-error" role="alert">
          {error}
        </p>
      )}
      <footer className="agent-composer builder-composer">
        <p>Core가 지정한 workspace 바인딩을 확인한 뒤에만 실행합니다.</p>
        <button
          className="primary-button"
          type="button"
          disabled={dispatchDisabled}
          onClick={() => onDispatch()}
        >
          {status === 'BINDING'
            ? 'Workspace 확인 중…'
            : status === 'RUNNING'
              ? 'Builder 실행 중…'
              : dispatchLabel}
        </button>
        <form
          className="builder-followup"
          onSubmit={(event) => {
            event.preventDefault()
            const message = draft.trim()
            if (message.length === 0) return
            onDraft('')
            onDispatch(`User follow-up: ${message}`)
          }}
        >
          <label htmlFor="builder-followup">Builder에게 답하거나 추가 지시하기</label>
          <div>
            <textarea
              id="builder-followup"
              rows={2}
              value={draft}
              disabled={dispatchDisabled}
              placeholder="예: 테스트가 통과했어. 완료 보고를 다시 제출해줘."
              onChange={(event) => onDraft(event.target.value)}
            />
            <button
              className="secondary-button"
              type="submit"
              disabled={dispatchDisabled || draft.trim().length === 0}
            >
              Builder에게 보내기
            </button>
          </div>
        </form>
      </footer>
    </section>
  )
}

function HelperPane({
  messages,
  draft,
  busy,
  error,
  focusedDecision,
  onDraft,
  onAsk,
}: {
  readonly messages: readonly LocalMessage[]
  readonly draft: string
  readonly busy: boolean
  readonly error: string | null
  readonly focusedDecision: DecisionRequest | null
  readonly onDraft: (value: string) => void
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
    <section className="agent-pane helper-pane" aria-labelledby="helper-pane-title">
      <header className="agent-pane-header">
        <div>
          <p className="eyebrow">Read-only guide</p>
          <h3 id="helper-pane-title">Helper</h3>
        </div>
        <span className="read-only-badge">변경 권한 없음</span>
      </header>
      {focusedDecision === null ? null : (
        <div className="helper-focus">
          <span>현재 Decision</span>
          <strong>{focusedDecision.question}</strong>
        </div>
      )}
      <div className="helper-messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="stream-empty">
            <strong>Builder를 멈추지 않고 물어보세요.</strong>
            <p>Helper는 현재 Core context를 읽지만 코드나 결정을 바꿀 수 없습니다.</p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              className={`helper-message helper-message-${message.role.toLowerCase()}`}
              key={message.key}
            >
              <span>
                {message.role === 'USER' ? 'You' : 'Helper'}
                {message.origin === 'QUICK_ACTION' ? ' · quick action' : ''}
              </span>
              <p>{message.content}</p>
            </article>
          ))
        )}
      </div>
      <fieldset className="quick-actions" aria-label="Helper quick actions">
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
      {error === null ? null : (
        <p className="pane-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="agent-composer helper-composer"
        onSubmit={(event) => {
          event.preventDefault()
          if (draft.trim().length > 0) onAsk(draft.trim(), 'FREE_TEXT', focusedDecision?.id)
        }}
      >
        <label htmlFor="helper-question">직접 질문하기</label>
        <textarea
          id="helper-question"
          rows={3}
          value={draft}
          disabled={busy}
          placeholder="예: 왜 여기서 runtime validation이 필요한가요?"
          onChange={(event) => onDraft(event.target.value)}
        />
        <button
          className="secondary-button"
          type="submit"
          disabled={busy || draft.trim().length === 0}
        >
          {busy ? 'Helper 답변 중…' : '질문 보내기'}
        </button>
      </form>
    </section>
  )
}

function DecisionCard({
  item,
  draft,
  busy,
  onDraft,
  onAskHelper,
  onResolve,
}: {
  readonly item: DecisionSessionItem
  readonly draft: DecisionDraft
  readonly busy: boolean
  readonly onDraft: (draft: DecisionDraft) => void
  readonly onAskHelper: () => void
  readonly onResolve: (
    decision: DecisionRequest,
    selection:
      | { readonly kind: 'RECOMMENDATION' | 'OPTION'; readonly optionId: string }
      | {
          readonly kind: 'CUSTOM'
          readonly proposal: string
        },
    rationale: string,
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
        {resolution.rationale === undefined ? null : <p>{resolution.rationale}</p>}
        {application === null ? (
          <small>Builder가 저장된 결정을 읽고 적용하기를 기다리고 있습니다.</small>
        ) : (
          <small>{application.appliedResult}</small>
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
            </ul>
            {option.tradeoffs.length === 0 ? null : (
              <details>
                <summary>Tradeoffs</summary>
                <ul>
                  {option.tradeoffs.map((tradeoff) => (
                    <li key={tradeoff}>{tradeoff}</li>
                  ))}
                </ul>
              </details>
            )}
            <button
              type="button"
              className="option-button"
              disabled={busy}
              onClick={() =>
                onResolve(request, { kind: 'OPTION', optionId: option.id }, draft.rationale)
              }
            >
              이 선택으로 진행
            </button>
          </section>
        ))}
      </div>
      {recommended === undefined ? null : (
        <div className="recommendation-box">
          <div>
            <span>Builder recommendation</span>
            <strong>{recommended.label}</strong>
            <p>{request.recommendationRationale}</p>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() =>
              onResolve(
                request,
                { kind: 'RECOMMENDATION', optionId: recommended.id },
                draft.rationale,
              )
            }
          >
            추천대로 진행
          </button>
        </div>
      )}
      <div className="decision-support-row">
        <button type="button" className="secondary-button" disabled={busy} onClick={onAskHelper}>
          Helper에게 비교 요청
        </button>
        <label>
          <span>선택 이유 (선택)</span>
          <textarea
            rows={2}
            value={draft.rationale}
            onChange={(event) => onDraft({ ...draft, rationale: event.target.value })}
          />
        </label>
      </div>
      <form
        className="custom-decision"
        onSubmit={(event) => {
          event.preventDefault()
          const proposal = draft.customProposal.trim()
          if (proposal.length > 0) {
            onResolve(request, { kind: 'CUSTOM', proposal }, draft.rationale)
          }
        }}
      >
        <label htmlFor={`custom-${request.id}`}>다른 방향을 직접 제안하기</label>
        <div>
          <input
            id={`custom-${request.id}`}
            value={draft.customProposal}
            placeholder="원하는 동작이나 제약을 적어 주세요."
            onChange={(event) => onDraft({ ...draft, customProposal: event.target.value })}
          />
          <button type="submit" disabled={busy || draft.customProposal.trim().length === 0}>
            제안으로 진행
          </button>
        </div>
      </form>
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
            실행 준비 완료 · {descriptor.workspacePath}
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
  const [stream, setStream] = useState<StreamState>({ events: [], olderCount: 0 })
  const [helperMessages, setHelperMessages] = useState<readonly LocalMessage[]>(
    sessions?.helperMessages ?? [],
  )
  const [helperDraft, setHelperDraft] = useState('')
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
  const [decisionDrafts, setDecisionDrafts] = useState<Readonly<Record<string, DecisionDraft>>>({})
  const [builderDraft, setBuilderDraft] = useState('')
  const [launchBusy, setLaunchBusy] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [resultDescriptor, setResultDescriptor] = useState<GeneratedResultDescriptor | null>(null)

  const task = snapshot.currentTask
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

  const restore = async (): Promise<ProjectSessionSnapshot> => {
    const restored = await coreClient.restoreProjectSession(entityId('corr'), snapshot.project.id)
    onSnapshot(restored)
    return restored
  }

  const appendStreamEvent = (event: BuilderStreamEvent): void => {
    setStream((current) => {
      const appended = [...current.events, event]
      const overflow = Math.max(0, appended.length - MAX_VISIBLE_STREAM_EVENTS)
      return {
        events: overflow === 0 ? appended : appended.slice(overflow),
        olderCount: current.olderCount + overflow,
      }
    })
  }

  const dispatchBuilder = async (
    source: ProjectSessionSnapshot,
    purpose = 'Start or resume the current Builder Task.',
  ): Promise<void> => {
    const currentTask = source.currentTask
    if (currentTask === null) return
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
        message: `${purpose}\n\nCore tool identifiers: schemaVersion=1, projectId=${source.project.id}, taskId=${currentTask.id}, correlationId=${currentTask.correlationId}, idempotencyKey=${entityId('idem')}. Read the current Task and Live Context from Core before acting.`,
        onEvent: appendStreamEvent,
      })
      setRuntimeStatus('RUNNING')
      const completion = await receipt.completion
      setRuntimeStatus(completion.status === 'DONE' ? 'DONE' : 'FAILED')
      if (completion.status !== 'DONE') setRuntimeError('Builder stream 연결이 종료되었습니다.')
      await restore()
    } catch (error) {
      setRuntimeStatus('FAILED')
      setRuntimeError(actionError(error))
    }
  }

  const askHelper = async (
    question: string,
    origin: HelperOrigin,
    decisionId?: string,
  ): Promise<void> => {
    if (task === null) return
    setHelperBusy(true)
    setHelperError(null)
    const userMessage: LocalMessage = {
      key: `local-user-${crypto.randomUUID()}`,
      role: 'USER',
      content: question,
      origin,
    }
    setHelperMessages((current) => [...current, userMessage])
    if (origin === 'FREE_TEXT') setHelperDraft('')
    try {
      const helperCorrelationId = entityId('corr')
      await coreClient.openHelper({
        schemaVersion: 1,
        kind: 'UI_OPEN_HELPER',
        correlationId: helperCorrelationId,
        actor: { kind: 'UI' },
        projectId: snapshot.project.id,
        taskId: task.id,
        ...(decisionId === undefined ? {} : { decisionId }),
        question,
      })
      let streamedText = ''
      const receipt = await agentClient.dispatchHelper({
        projectId: snapshot.project.id,
        message: `사용자 질문: ${question}\n\nCore tool identifiers: schemaVersion=1, projectId=${snapshot.project.id}, taskId=${task.id}, correlationId=${helperCorrelationId}${decisionId === undefined ? '' : `, decisionId=${decisionId}`}. get_helper_context를 읽고 read-only 설명만 제공하세요.`,
        onText: (text) => {
          streamedText = `${streamedText}${text}`.slice(-4_000)
        },
      })
      const completion = await receipt.completion
      const summary = completion.assistantSummary || streamedText.trim().slice(0, 240)
      if (completion.status !== 'DONE' || summary.length === 0) {
        throw new Error('Helper가 저장 가능한 답변을 반환하지 않았습니다.')
      }
      setHelperMessages((current) => [
        ...current,
        { key: `local-helper-${crypto.randomUUID()}`, role: 'ASSISTANT', content: summary },
      ])
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
        helperResponseSummary: summary,
        origin,
        closeConversation: false,
      })
      setConversationId(recorded.conversationId)
      if (decisionId !== undefined) {
        setHelperUsedDecisionIds((current) => new Set([...current, decisionId]))
      }
      await restore()
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
    rationale: string,
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
          ...(rationale.trim().length === 0 ? {} : { rationale: rationale.trim() }),
          helperUsed: helperUsedDecisionIds.has(decision.id),
          resolvedAt: new Date().toISOString(),
          source: { kind: 'USER' },
          redactionStatus: 'NOT_REQUIRED',
        },
      })
      const restored = await restore()
      await dispatchBuilder(
        restored,
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
      setResultDescriptor(
        await coreClient.launchResult({
          schemaVersion: 1,
          kind: 'UI_LAUNCH_RESULT',
          correlationId: entityId('corr'),
          actor: { kind: 'UI' },
          idempotencyKey: entityId('idem'),
          projectId: snapshot.project.id,
        }),
      )
    } catch (error) {
      setLaunchError(actionError(error))
    } finally {
      setLaunchBusy(false)
    }
  }

  if (snapshot.completionReport !== null) {
    return (
      <CompletionView
        snapshot={snapshot}
        descriptor={resultDescriptor}
        busy={launchBusy}
        error={launchError}
        onLaunch={() => void launchResult()}
      />
    )
  }

  const hasBlockingDecision = allDecisionItems.some(
    (item) => item.resolution === null && !item.request.independentWorkCanContinue,
  )
  const canDispatch = task !== null && !hasBlockingDecision && task.status !== 'COMPLETED'
  const dispatchLabel = task?.status === 'PENDING' ? 'Builder 시작' : 'Builder 계속하기'

  return (
    <section aria-labelledby="build-title">
      <div className="section-heading build-heading">
        <div>
          <p className="eyebrow">Current task</p>
          <h2 id="build-title">{task?.title ?? 'Build has not started.'}</h2>
        </div>
        {task === null ? null : <StatusPill value={task.status} />}
      </div>
      {snapshot.liveContext === null ? null : (
        <article className="live-progress" aria-label="Live Progress">
          <div className="progress-label">
            <span>Live Progress · Context v{snapshot.liveContext.contextVersion}</span>
            <strong>{snapshot.liveContext.stage}</strong>
          </div>
          <div>
            <p>{snapshot.liveContext.currentGoal}</p>
            <small>
              {snapshot.liveContext.nextActions[0] ?? '다음 checkpoint를 기다리고 있습니다.'}
            </small>
          </div>
        </article>
      )}
      {allDecisionItems.length === 0 ? null : (
        <section className="decision-stack" aria-label="Task decisions">
          {allDecisionItems.map((item) => (
            <DecisionCard
              key={item.request.id}
              item={item}
              draft={decisionDrafts[item.request.id] ?? { customProposal: '', rationale: '' }}
              busy={decisionBusyId === item.request.id}
              onDraft={(draft) =>
                setDecisionDrafts((current) => ({ ...current, [item.request.id]: draft }))
              }
              onAskHelper={() => {
                setMobilePane('HELPER')
                void askHelper(
                  '이 선택지들의 영향과 Builder 추천의 tradeoff를 쉬운 말로 비교해줘',
                  'QUICK_ACTION',
                  item.request.id,
                )
              }}
              onResolve={(decision, selection, rationale) =>
                void resolveDecision(decision, selection, rationale)
              }
            />
          ))}
        </section>
      )}
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
        <BuilderPane
          messages={sessions?.builderMessages ?? []}
          stream={stream}
          status={runtimeStatus}
          error={runtimeError}
          canDispatch={canDispatch}
          dispatchLabel={dispatchLabel}
          draft={builderDraft}
          onDraft={setBuilderDraft}
          onDispatch={(purpose) => void dispatchBuilder(snapshot, purpose)}
        />
        <HelperPane
          messages={helperMessages}
          draft={helperDraft}
          busy={helperBusy}
          error={helperError}
          focusedDecision={focusedDecision}
          onDraft={setHelperDraft}
          onAsk={(question, origin, decisionId) => void askHelper(question, origin, decisionId)}
        />
      </div>
    </section>
  )
}
