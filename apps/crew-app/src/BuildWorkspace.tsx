import type {
  DecisionRequest,
  DecisionSessionItem,
  GeneratedResultDescriptor,
  ProjectSessionSnapshot,
} from '@vibe-helper/contracts'
import {
  builderSlotKey,
  type CrewAgentModeClient,
  helperSlotKey,
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
}: {
  readonly slotKey: string
  readonly agent: string
  readonly placeholder: string
  readonly onSend: (message: string) => void | Promise<void>
  readonly client: CrewAgentModeClient
}) {
  const [messages, setMessages] = useState<readonly unknown[]>([])
  const [running, setRunning] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const role = agent.includes('builder') ? 'Builder' : 'Helper'

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
  return (
    <div className="native-chat-frame">
      <div className="native-message-list" role="log" aria-label={`${role} transcript`}>
        <HostChatMessageList messages={messages} running={running || sending} />
      </div>
      {sessionError === null ? null : (
        <p className="pane-error" role="alert">
          {sessionError}
        </p>
      )}
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
      {children}
      <NativeChatSession
        slotKey={slotKey}
        agent={agent}
        placeholder={placeholder}
        onSend={onSend}
        client={client}
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
  const [launchBusy, setLaunchBusy] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [resultDescriptor, setResultDescriptor] = useState<GeneratedResultDescriptor | null>(null)
  const autoStartedTasks = useRef(new Set<string>())

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
  const focusedDecisionItem =
    allDecisionItems.find((item) => item.resolution === null) ?? allDecisionItems.at(-1) ?? null

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
    if (
      sessions === null ||
      task === null ||
      task.status !== 'PENDING' ||
      sessions.builderMessages.length > 0 ||
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
        '선택한 방향을 정확히 반영해서 구현을 계속해줘.',
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
          placeholder="Builder에게 구현 방향을 말하거나 질문하세요."
          error={runtimeError}
          client={agentClient}
          onSend={(message) =>
            dispatchBuilder(
              snapshot,
              message,
              focusedDecision === null
                ? 'Read the current Task and Live Context before acting on the user message.'
                : `Decision ${focusedDecision.id} is still pending. You may explain, but do not apply a direction until Core contains a user resolution.`,
            )
          }
        >
          <div className="intervention-stack">
            {focusedDecisionItem === null ? null : (
              <section className="decision-stack" aria-label="Current Task decision">
                <DecisionCard
                  item={focusedDecisionItem}
                  draft={
                    decisionDrafts[focusedDecisionItem.request.id] ?? {
                      customProposal: '',
                      rationale: '',
                    }
                  }
                  busy={decisionBusyId === focusedDecisionItem.request.id}
                  onDraft={(draft) =>
                    setDecisionDrafts((current) => ({
                      ...current,
                      [focusedDecisionItem.request.id]: draft,
                    }))
                  }
                  onAskHelper={() => {
                    setMobilePane('HELPER')
                    void askHelper(
                      '이 선택지들의 영향과 Builder 추천의 tradeoff를 쉬운 말로 비교해줘',
                      'QUICK_ACTION',
                      focusedDecisionItem.request.id,
                    )
                  }}
                  onResolve={(decision, selection, rationale) =>
                    void resolveDecision(decision, selection, rationale)
                  }
                />
              </section>
            )}
            {snapshot.completionReport === null ? null : (
              <CompletionView
                snapshot={snapshot}
                descriptor={resultDescriptor}
                busy={launchBusy}
                error={launchError}
                onLaunch={() => void launchResult()}
              />
            )}
          </div>
        </AgentPane>
        <AgentPane
          kind="helper"
          eyebrow="Read-only guide · actual session"
          title="Helper"
          status={
            <span className={`read-only-badge${helperBusy ? ' helper-busy' : ''}`}>
              {helperBusy ? '답변 중' : '변경 권한 없음'}
            </span>
          }
          slotKey={sessions?.helperSlotKey ?? helperSlotKey(snapshot.project.id)}
          agent="vibe-helper-helper"
          placeholder="현재 코드나 판단에 관해 무엇이든 물어보세요."
          error={helperError}
          client={agentClient}
          onSend={(question) => askHelper(question, 'FREE_TEXT', focusedDecision?.id)}
        >
          <HelperTools
            busy={helperBusy}
            focusedDecision={focusedDecision}
            onAsk={(question, origin, decisionId) => void askHelper(question, origin, decisionId)}
          />
        </AgentPane>
      </div>
    </section>
  )
}
