import type {
  CandidateRevisionReference,
  CandidatePreview,
  DiscoveryFeedback,
  DiscoveryInput,
  ProjectCandidateRevision,
  ProjectSessionSnapshot,
} from '@vibe-helper/contracts'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

export interface AgentRunView {
  readonly status:
    | 'IDLE'
    | 'DISPATCHING'
    | 'RUNNING'
    | 'BACKGROUND'
    | 'TOOL_REJECTED'
    | 'HOST_DISCONNECTED'
    | 'TIMED_OUT'
  readonly startedAt: number | null
  readonly detail: string
  readonly retry: (() => void) | null
}

export interface DiscoveryFeedbackAction {
  readonly intent: DiscoveryFeedback['intent']
  readonly targets: readonly CandidateRevisionReference[]
  readonly message?: string
}

const rotatingPlaceholders = [
  '예: React 상태 관리가 실제 화면에서 어떻게 연결되는지 배우고 싶어요.',
  '예: TypeScript로 안전한 외부 데이터 처리를 익히고 싶어요.',
  '예: 데이터베이스 설계를 작은 서비스로 직접 경험하고 싶어요.',
] as const

function candidateReference(candidate: ProjectCandidateRevision): CandidateRevisionReference {
  return { candidateId: candidate.id, revision: candidate.revision }
}

function candidateKey(reference: CandidateRevisionReference): string {
  return `${reference.candidateId}:${reference.revision}`
}

function previewKey(preview: CandidatePreview): string {
  return candidateKey({ candidateId: preview.candidateId, revision: 1 })
}

export function AgentRunBanner({ run }: { readonly run: AgentRunView }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const startedAt = run.startedAt
    if (startedAt === null) {
      setElapsed(0)
      return
    }
    const update = (): void => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)))
    update()
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [run.startedAt])

  if (run.status === 'IDLE') return null
  const active =
    run.status === 'DISPATCHING' || run.status === 'RUNNING' || run.status === 'BACKGROUND'
  const title =
    run.status === 'DISPATCHING'
      ? 'Discovery Agent에 요청을 전달하고 있어요.'
      : run.status === 'RUNNING'
        ? 'Agent가 결과를 구성하고 있어요.'
        : run.status === 'BACKGROUND'
          ? '백그라운드 Agent 작업을 확인하고 있어요.'
          : run.status === 'TOOL_REJECTED'
            ? '새 결과를 저장하지 못했어요.'
            : run.status === 'HOST_DISCONNECTED'
              ? 'Crew 호스트와 연결이 끊겼어요.'
              : 'Agent 응답이 예상보다 오래 걸리고 있어요.'
  return (
    <section
      className={`agent-run agent-run-${active ? 'active' : 'retry'}`}
      role={active ? 'status' : 'alert'}
      aria-live="polite"
    >
      <span className={active ? 'agent-run-pulse' : 'agent-run-mark'} aria-hidden="true">
        {active ? '' : '!'}
      </span>
      <div>
        <strong>{title}</strong>
        <p>{run.detail}</p>
      </div>
      <span className="agent-run-time">{elapsed}초</span>
      {run.retry === null ? null : (
        <button type="button" className="secondary-button" onClick={run.retry}>
          상태 확인 후 다시 시도
        </button>
      )}
    </section>
  )
}

export function DiscoveryStartView({
  busy,
  error,
  onStart,
  initialInput,
  mode = 'START',
}: {
  readonly busy: boolean
  readonly error: string | null
  readonly onStart: (input: DiscoveryInput) => Promise<void>
  readonly initialInput?: DiscoveryInput
  readonly mode?: 'START' | 'RESTART'
}) {
  const [learningGoal, setLearningGoal] = useState(initialInput?.learningGoal ?? '')
  const [personalNeed, setPersonalNeed] = useState(initialInput?.personalNeed ?? '')
  const [recentFriction, setRecentFriction] = useState(initialInput?.recentFriction ?? '')
  const [currentLevel, setCurrentLevel] = useState<NonNullable<DiscoveryInput['currentLevel']>>(
    initialInput?.currentLevel ?? 'UNSPECIFIED',
  )
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(
      () => setPlaceholderIndex((index) => (index + 1) % rotatingPlaceholders.length),
      4_500,
    )
    return () => window.clearInterval(timer)
  }, [])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const goal = learningGoal.trim()
    if (goal.length === 0 || busy) return
    void onStart({
      learningGoal: goal,
      ...(personalNeed.trim().length === 0 ? {} : { personalNeed: personalNeed.trim() }),
      ...(recentFriction.trim().length === 0 ? {} : { recentFriction: recentFriction.trim() }),
      currentLevel,
    })
  }

  return (
    <section
      className={`discovery-start${mode === 'RESTART' ? ' discovery-restart' : ''}`}
      aria-labelledby={mode === 'RESTART' ? 'discovery-restart-title' : 'discovery-start-title'}
    >
      <div className="discovery-intro">
        <p className="eyebrow">
          {mode === 'RESTART' ? '새 방향 명시적으로 시작' : '새 프로젝트 발견'}
        </p>
        <h2 id={mode === 'RESTART' ? 'discovery-restart-title' : 'discovery-start-title'}>
          {mode === 'RESTART'
            ? '입력을 확인한 뒤에만 새 후보를 만들어요.'
            : '배우고 싶은 것을, 만들고 싶은 것으로 바꿔보세요.'}
        </h2>
        <p>
          {mode === 'RESTART'
            ? '지금 보이는 이전 후보와 Spec은 그대로 보존됩니다. 아래 입력을 바꾸지 않고 다시 시작해도 괜찮아요.'
            : '기술이나 개념 하나만 적으면 충분합니다. 개인적인 필요가 없어도 재미, 호기심, 익숙한 서비스 재현은 좋은 출발점이에요.'}
        </p>
        {mode === 'RESTART' ? null : (
          <ol className="flow-steps" aria-label="Discovery 진행 순서">
            <li>
              <span>1</span>
              <strong>목표 입력</strong>
              <small>필수 입력은 하나</small>
            </li>
            <li>
              <span>2</span>
              <strong>후보 탐색</strong>
              <small>반응하며 계속 조정</small>
            </li>
            <li>
              <span>3</span>
              <strong>범위 확인</strong>
              <small>권장 Spec에서 시작</small>
            </li>
          </ol>
        )}
      </div>
      <form className="discovery-form" onSubmit={submit}>
        <label className="field field-prominent">
          <span>
            무엇을 배우고 싶나요? <b>필수</b>
          </span>
          <textarea
            value={learningGoal}
            onChange={(event) => setLearningGoal(event.target.value)}
            placeholder={rotatingPlaceholders[placeholderIndex]}
            maxLength={240}
            rows={4}
            required
          />
        </label>
        <label className="field">
          <span>
            요즘 직접 해결하고 싶은 일이 있나요? <em>선택</em>
          </span>
          <textarea
            value={personalNeed}
            onChange={(event) => setPersonalNeed(event.target.value)}
            placeholder="없다면 비워두세요. 후보를 더 자유롭게 탐색합니다."
            maxLength={4_000}
            rows={3}
          />
        </label>
        <details className="optional-inputs">
          <summary>
            조금 더 알려주기 <span>선택</span>
          </summary>
          <div>
            <label className="field">
              <span>최근 막혔던 점</span>
              <textarea
                value={recentFriction}
                onChange={(event) => setRecentFriction(event.target.value)}
                placeholder="예: 타입은 맞는데 실행 중 잘못된 JSON 때문에 오류가 났어요."
                maxLength={4_000}
                rows={2}
              />
            </label>
            <label className="field">
              <span>현재 익숙한 정도</span>
              <select
                value={currentLevel}
                onChange={(event) =>
                  setCurrentLevel(event.target.value as NonNullable<DiscoveryInput['currentLevel']>)
                }
              >
                <option value="UNSPECIFIED">아직 잘 모르겠어요</option>
                <option value="NEW">처음이에요</option>
                <option value="BEGINNER">기초를 조금 해봤어요</option>
                <option value="FAMILIAR">어느 정도 익숙해요</option>
              </select>
            </label>
          </div>
        </details>
        {error === null ? null : (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="primary-button wide-button"
          disabled={busy || learningGoal.trim().length === 0}
        >
          {busy
            ? 'Discovery를 여는 중…'
            : mode === 'RESTART'
              ? '새 후보 받기'
              : '프로젝트 후보 만나기'}
        </button>
      </form>
    </section>
  )
}

function CandidateCard({
  candidate,
  currentRoundIndex,
  selected,
  disabled,
  onToggle,
  onFeedback,
}: {
  readonly candidate: ProjectCandidateRevision
  readonly currentRoundIndex: number
  readonly selected: boolean
  readonly disabled: boolean
  readonly onToggle: () => void
  readonly onFeedback: (action: DiscoveryFeedbackAction) => void
}) {
  const reference = candidateReference(candidate)
  return (
    <li className={`candidate-card${selected ? ' candidate-card-selected' : ''}`}>
      <label className="candidate-check">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={disabled}
          aria-label={`${candidate.title} 관심 목록에 담기`}
        />
        <span className="candidate-checkmark" aria-hidden="true" />
        <span>{selected ? '관심 목록에 담았어요' : '관심 목록에 담기'}</span>
      </label>
      <div className="candidate-copy">
        <div className="candidate-title-row">
          <div>
            <p className="candidate-tags">{candidate.generationTags.join(' · ')}</p>
            <h3>{candidate.title}</h3>
          </div>
          <span className="candidate-revision">
            v{candidate.revision} · round {currentRoundIndex}
          </span>
        </div>
        <p className="candidate-summary">{candidate.summary}</p>
      </div>
      <dl className="candidate-facts">
        <div>
          <dt>끌리는 이유</dt>
          <dd>{candidate.appeal}</dd>
        </div>
        <div>
          <dt>핵심 경험</dt>
          <dd>{candidate.coreInteraction}</dd>
        </div>
      </dl>
      <div className="candidate-footer">
        <ul className="concept-chips" aria-label="핵심 개념">
          {candidate.coreConcepts.map((concept) => (
            <li key={concept}>{concept}</li>
          ))}
        </ul>
        <button
          type="button"
          className="select-button"
          disabled={disabled}
          onClick={() => onFeedback({ intent: 'SELECT', targets: [reference] })}
        >
          이 방향 선택
        </button>
      </div>
      <details className="candidate-details">
        <summary>세부 범위와 변경 이력</summary>
        <div className="candidate-scope">
          <p>
            <strong>내가 집중할 것</strong>
            {candidate.suggestedScope.learnerFocus.join(' · ') || '아직 없음'}
          </p>
          <p>
            <strong>Agent가 도울 것</strong>
            {candidate.suggestedScope.agentSupport.join(' · ') || '아직 없음'}
          </p>
          <p>
            <strong>MVP에서 뺄 것</strong>
            {candidate.suggestedScope.excluded.join(' · ') || '아직 없음'}
          </p>
        </div>
        <p className="candidate-technology">
          <strong>기술이 필요한 이유</strong>
          {candidate.technologyNecessity}
        </p>
        <p className="lineage">
          {candidate.parentRevisions.length === 0
            ? '이 round에서 새로 나온 후보입니다.'
            : `이전 후보 ${candidate.parentRevisions.map((parent) => `${parent.candidateId.slice(-6)} v${parent.revision}`).join(', ')}에서 이어졌습니다.`}
        </p>
      </details>
    </li>
  )
}

function CandidatePreviewCard({
  preview,
  candidate,
  selected,
  disabled,
  onToggle,
}: {
  readonly preview: CandidatePreview
  readonly candidate: ProjectCandidateRevision | null
  readonly selected: boolean
  readonly disabled: boolean
  readonly onToggle: () => void
}) {
  return (
    <li className={`candidate-card${selected ? ' candidate-card-selected' : ''}`}>
      <label className="candidate-check">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          disabled={disabled}
          aria-label={`${preview.title} 관심 목록에 담기`}
        />
        <span className="candidate-checkmark" aria-hidden="true" />
        <span>{selected ? '관심 목록에 담았어요' : '관심 목록에 담기'}</span>
      </label>
      <div className="candidate-copy">
        <div className="candidate-title-row">
          <div>
            <p className="candidate-tags">{preview.generationTags.join(' · ')}</p>
            <h3>{preview.title}</h3>
          </div>
          <span className="candidate-revision">
            {candidate === null ? '상세 준비 중' : '상세 준비됨'}
          </span>
        </div>
        <p className="candidate-summary">{preview.summary}</p>
      </div>
      <dl className="candidate-facts">
        <div>
          <dt>끌리는 이유</dt>
          <dd>{preview.appeal}</dd>
        </div>
        <div>
          <dt>핵심 경험</dt>
          <dd>{preview.coreInteraction}</dd>
        </div>
      </dl>
      {candidate === null ? (
        <div className="candidate-enrichment-pending" role="status">
          <span aria-hidden="true" />
          핵심 개념과 MVP 범위를 background에서 채우고 있어요.
        </div>
      ) : (
        <>
          <div className="candidate-footer">
            <ul className="concept-chips" aria-label="핵심 개념">
              {candidate.coreConcepts.map((concept) => (
                <li key={concept}>{concept}</li>
              ))}
            </ul>
            <span className="candidate-ready-label">선택 준비됨</span>
          </div>
          <details className="candidate-details">
            <summary>세부 범위 미리 보기</summary>
            <div className="candidate-scope">
              <p>
                <strong>내가 집중할 것</strong>
                {candidate.suggestedScope.learnerFocus.join(' · ')}
              </p>
              <p>
                <strong>Agent가 도울 것</strong>
                {candidate.suggestedScope.agentSupport.join(' · ')}
              </p>
              <p>
                <strong>MVP에서 뺄 것</strong>
                {candidate.suggestedScope.excluded.join(' · ')}
              </p>
            </div>
            <p className="candidate-technology">
              <strong>기술이 필요한 이유</strong>
              {preview.technologyNecessity}
            </p>
          </details>
        </>
      )}
    </li>
  )
}

export function DiscoveryWorkspace({
  snapshot,
  run,
  busy,
  actionError,
  onFeedback,
  onGenerate,
  onResumeEnrichment,
  onLegacyFallback,
  onRestart,
  onBackToSpec,
}: {
  readonly snapshot: ProjectSessionSnapshot
  readonly run: AgentRunView
  readonly busy: boolean
  readonly actionError: string | null
  readonly onFeedback: (action: DiscoveryFeedbackAction) => Promise<void>
  readonly onGenerate: () => Promise<void>
  readonly onResumeEnrichment: () => Promise<void>
  readonly onLegacyFallback: () => Promise<void>
  readonly onRestart: (input: DiscoveryInput) => Promise<void>
  readonly onBackToSpec: () => void
}) {
  const context = snapshot.discoveryContext
  const latestRound = context?.rounds.at(-1)
  const previewRound = context?.previewRound ?? null
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set())
  const [message, setMessage] = useState('')

  const candidates = useMemo(() => {
    if (context === null || context === undefined || latestRound === undefined) return []
    const byKey = new Map(
      context.candidates.map((candidate) => [
        candidateKey(candidateReference(candidate)),
        candidate,
      ]),
    )
    const appliedFeedbackIds = new Set(latestRound.appliedFeedbackIds)
    const appliedFeedback = context.feedback.filter((feedback) =>
      appliedFeedbackIds.has(feedback.id),
    )
    const narrowingFeedback = appliedFeedback.filter((feedback) =>
      ['MERGE', 'REVISE', 'SHRINK', 'EXPAND'].includes(feedback.intent),
    )
    const projectedKeys = new Set<string>()
    for (const feedback of narrowingFeedback) {
      const primary = feedback.targets[0]
      if (primary !== undefined) {
        projectedKeys.add(
          candidateKey({ candidateId: primary.candidateId, revision: primary.revision + 1 }),
        )
      }
    }
    for (const feedback of appliedFeedback) {
      if (feedback.intent !== 'PIN') continue
      for (const target of feedback.targets) projectedKeys.add(candidateKey(target))
    }
    const visibleReferences =
      narrowingFeedback.length === 0
        ? latestRound.candidates
        : latestRound.candidates.filter((reference) => projectedKeys.has(candidateKey(reference)))
    const projectedReferences =
      visibleReferences.length === 0 ? latestRound.candidates : visibleReferences
    return projectedReferences.flatMap((reference) => {
      const candidate = byKey.get(candidateKey(reference))
      return candidate === undefined ? [] : [candidate]
    })
  }, [context, latestRound])
  const selectedTargets = candidates
    .filter((candidate) => selectedKeys.has(candidateKey(candidateReference(candidate))))
    .map(candidateReference)
  const enrichedPreviewCandidates = new Map(
    context?.candidateEnrichments.map((enrichment) => [
      enrichment.candidate.id,
      enrichment.candidate,
    ]) ?? [],
  )
  const basketItems =
    latestRound === undefined && previewRound !== null
      ? previewRound.previews.map((preview) => ({ key: previewKey(preview), title: preview.title }))
      : candidates.map((candidate) => ({
          key: candidateKey(candidateReference(candidate)),
          title: candidate.title,
        }))
  const selectedBasketItems = basketItems.filter((item) => selectedKeys.has(item.key))
  const selectedArchive = snapshot.discoverySession?.status === 'SELECTED'
  const inactive =
    selectedArchive ||
    busy ||
    run.status === 'DISPATCHING' ||
    run.status === 'RUNNING' ||
    run.status === 'BACKGROUND'
  const previewToggleDisabled = selectedArchive || busy
  const enrichmentActive =
    run.status === 'DISPATCHING' || run.status === 'RUNNING' || run.status === 'BACKGROUND'
  const legacyFallbackDisabled = run.status === 'DISPATCHING' || run.status === 'RUNNING'

  const submitFreeFeedback = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const trimmed = message.trim()
    if (trimmed.length === 0 || inactive) return
    const action: DiscoveryFeedbackAction =
      selectedTargets.length === 0
        ? { intent: 'REGENERATE', targets: [], message: trimmed }
        : selectedTargets.length === 1
          ? { intent: 'REVISE', targets: selectedTargets, message: trimmed }
          : { intent: 'MERGE', targets: selectedTargets, message: trimmed }
    setMessage('')
    void onFeedback(action)
  }

  return (
    <section aria-labelledby="discovery-title">
      <div className="discovery-heading">
        <div>
          <p className="eyebrow">학습 목표</p>
          <h2 id="discovery-title">{snapshot.project.learningGoal}</h2>
          <p>
            {snapshot.discoverySession?.input.personalNeed ??
              '개인적 필요 없이 자유롭게 탐색하고 있어요.'}
          </p>
        </div>
        <div className="round-summary">
          <strong>
            {latestRound === undefined
              ? previewRound === null
                ? '준비 중'
                : `${String(previewRound.previews.length)}개 미리보기`
              : `${candidates.length}개 후보`}
          </strong>
          <span>
            {latestRound === undefined
              ? previewRound === null
                ? '첫 미리보기를 기다리는 중'
                : `상세 ${String(context?.candidateEnrichments.length ?? 0)}/10 준비됨`
              : latestRound.roundIndex === 1
                ? '10개 상세 후보가 모두 준비됐어요'
                : `Discovery round ${latestRound.roundIndex}`}
          </span>
        </div>
      </div>
      <AgentRunBanner run={run} />
      {selectedArchive ? (
        <section className="round-note" aria-label="이전 Discovery 후보">
          <strong>이전 후보를 그대로 보고 있어요.</strong>
          <p>
            Spec에서 돌아오는 것만으로 Agent를 다시 실행하지 않았습니다. Spec으로 돌아가거나
            아래에서 입력을 확인한 뒤 새 후보를 요청할 수 있어요.
          </p>
          <button type="button" className="secondary-button" onClick={onBackToSpec}>
            Spec으로 돌아가기
          </button>
        </section>
      ) : null}
      {actionError === null ? null : (
        <p className="form-error action-error" role="alert">
          {actionError}
        </p>
      )}
      {latestRound === undefined && previewRound === null ? (
        run.status === 'IDLE' ? (
          <section className="state-card compact-state">
            <span className="state-mark" aria-hidden="true">
              ◌
            </span>
            <h3>아직 저장된 후보가 없어요.</h3>
            <p>사용자가 요청할 때만 첫 미리보기 10개를 만듭니다.</p>
            <button type="button" className="primary-button" onClick={() => void onGenerate()}>
              첫 미리보기 받기
            </button>
          </section>
        ) : null
      ) : (
        <>
          {selectedArchive ? null : (
            <section className="refinement-dock" aria-labelledby="refinement-title">
              <div className="refinement-heading">
                <div>
                  <p className="eyebrow">내 방향 만들기</p>
                  <h3 id="refinement-title">관심 주제를 담고, 생각을 더해보세요.</h3>
                  <p>
                    {latestRound === undefined
                      ? '아래 미리보기에서 끌리는 방향을 먼저 담아두세요. 상세가 모두 준비되면 이곳에서 바로 좁히거나 합칠 수 있어요.'
                      : '아래 목록에서 고른 뒤 이곳으로 돌아오세요. 요청하면 담은 방향만 다듬거나 합치고, 담지 않은 후보는 현재 목록에서 빠져요. 기록은 그대로 남습니다.'}
                  </p>
                </div>
                <strong>{selectedBasketItems.length}개 담음</strong>
              </div>
              <div className="selection-basket" aria-live="polite">
                {selectedBasketItems.length === 0 ? (
                  <p>아직 담은 주제가 없어요. 주제를 담지 않고 새 방향을 요청해도 됩니다.</p>
                ) : (
                  <ul aria-label="관심 목록에 담은 주제">
                    {selectedBasketItems.map((item) => {
                      const key = item.key
                      return (
                        <li key={key}>
                          <span>{item.title}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedKeys((current) => {
                                const next = new Set(current)
                                next.delete(key)
                                return next
                              })
                            }
                            aria-label={`${item.title} 관심 목록에서 빼기`}
                          >
                            ×
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <form onSubmit={submitFreeFeedback}>
                <label className="field field-prominent">
                  <span>Agent에게 원하는 방향 말하기</span>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={
                      '예: 선택한 주제의 핵심은 유지하고 하루 안에 만들 정도로 범위를 줄여 주세요.\n예: 여기에 친구와 결과를 비교하는 경험을 하나 더 붙여 주세요.'
                    }
                    maxLength={4_000}
                    rows={4}
                    disabled={inactive || latestRound === undefined}
                  />
                </label>
                <div className="refinement-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={inactive || latestRound === undefined}
                    onClick={() =>
                      void onFeedback({
                        intent: 'MORE',
                        targets: [],
                        message: '기존 후보는 유지하고 겹치지 않는 다른 후보를 더 보여 주세요.',
                      })
                    }
                  >
                    다른 후보 4개 더 보기
                  </button>
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={inactive || latestRound === undefined || message.trim().length === 0}
                  >
                    {selectedTargets.length === 0
                      ? '새 방향 요청'
                      : selectedTargets.length === 1
                        ? '이 주제로 좁히기'
                        : '선택한 주제로 합치기'}
                  </button>
                </div>
              </form>
            </section>
          )}
          {latestRound === undefined && previewRound !== null ? (
            <section className="enrichment-status" aria-labelledby="enrichment-status-title">
              <div>
                <p className="eyebrow">미리보기 저장 완료</p>
                <h3 id="enrichment-status-title">
                  상세 {String(context?.candidateEnrichments.length ?? 0)}/10 준비됨
                </h3>
                <p>
                  제목과 핵심 방향은 이미 안전하게 저장됐어요. 준비된 상세는 바로 펼쳐볼 수 있고,
                  나머지는 같은 후보 ID에만 추가됩니다.
                </p>
              </div>
              <div className="enrichment-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={enrichmentActive}
                  onClick={() => void onResumeEnrichment()}
                >
                  누락된 상세만 다시 시도
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={legacyFallbackDisabled}
                  onClick={() => void onLegacyFallback()}
                >
                  기존 방식으로 후보 생성
                </button>
              </div>
            </section>
          ) : null}
          <div className="round-note">
            <strong>이번 구성의 기준</strong>
            <p>{latestRound?.generationRationale ?? previewRound?.generationRationale}</p>
          </div>
          <ol className="candidate-list" aria-label="프로젝트 후보 목록">
            {latestRound === undefined
              ? previewRound?.previews.map((preview) => {
                  const key = previewKey(preview)
                  return (
                    <CandidatePreviewCard
                      key={key}
                      preview={preview}
                      candidate={enrichedPreviewCandidates.get(preview.candidateId) ?? null}
                      selected={selectedKeys.has(key)}
                      disabled={previewToggleDisabled}
                      onToggle={() =>
                        setSelectedKeys((current) => {
                          const next = new Set(current)
                          if (next.has(key)) next.delete(key)
                          else next.add(key)
                          return next
                        })
                      }
                    />
                  )
                })
              : candidates.map((candidate) => {
                  const key = candidateKey(candidateReference(candidate))
                  return (
                    <CandidateCard
                      key={key}
                      candidate={candidate}
                      currentRoundIndex={latestRound.roundIndex}
                      selected={selectedKeys.has(key)}
                      disabled={inactive}
                      onToggle={() =>
                        setSelectedKeys((current) => {
                          const next = new Set(current)
                          if (next.has(key)) next.delete(key)
                          else next.add(key)
                          return next
                        })
                      }
                      onFeedback={(action) => void onFeedback(action)}
                    />
                  )
                })}
          </ol>
          {selectedArchive ? (
            <DiscoveryStartView
              key={snapshot.discoverySession?.id}
              mode="RESTART"
              busy={busy}
              error={actionError}
              initialInput={
                snapshot.discoverySession?.input ?? {
                  learningGoal: snapshot.project.learningGoal,
                }
              }
              onStart={onRestart}
            />
          ) : null}
        </>
      )}
    </section>
  )
}

export function SpecWorkspace({
  snapshot,
  run,
  busy,
  actionError,
  onRefine,
  onConfirmAndPrepare,
  onReturn,
}: {
  readonly snapshot: ProjectSessionSnapshot
  readonly run: AgentRunView
  readonly busy: boolean
  readonly actionError: string | null
  readonly onRefine: (message: string) => Promise<void>
  readonly onConfirmAndPrepare: () => Promise<void>
  readonly onReturn: () => void
}) {
  const spec = snapshot.learningSpec
  const [refinement, setRefinement] = useState('')
  const inactive =
    busy || run.status === 'DISPATCHING' || run.status === 'RUNNING' || run.status === 'BACKGROUND'

  if (spec === null) {
    return (
      <section aria-labelledby="spec-wait-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">권장 Learning Spec</p>
            <h2 id="spec-wait-title">선택한 방향을 시작 가능한 범위로 정리하고 있어요.</h2>
          </div>
        </div>
        <AgentRunBanner run={run} />
        {actionError === null ? null : (
          <p className="form-error action-error" role="alert">
            {actionError}
          </p>
        )}
      </section>
    )
  }

  return (
    <section aria-labelledby="spec-title">
      <div className="section-heading spec-heading">
        <div>
          <p className="eyebrow">권장 Learning Spec · revision {spec.revision}</p>
          <h2 id="spec-title">이 범위라면 바로 시작할 수 있어요.</h2>
        </div>
        <span className={`status-pill status-${spec.status.toLowerCase()}`}>{spec.status}</span>
      </div>
      <AgentRunBanner run={run} />
      {actionError === null ? null : (
        <p className="form-error action-error" role="alert">
          {actionError}
        </p>
      )}
      <div className="spec-review-layout">
        <div className="spec-overview">
          <section className="spec-purpose" aria-labelledby="spec-purpose-title">
            <p className="eyebrow">한 문장으로 보면</p>
            <h3 id="spec-purpose-title">{spec.productPurpose}</h3>
          </section>
          <section className="spec-story" aria-label="제품 사용 흐름">
            <article>
              <span>1</span>
              <div>
                <strong>누가 쓰나요?</strong>
                <p>{spec.targetUsers.join(', ')}</p>
              </div>
            </article>
            <article>
              <span>2</span>
              <div>
                <strong>언제 쓰나요?</strong>
                <p>{spec.primaryUsageMoment}</p>
              </div>
            </article>
            <article>
              <span>3</span>
              <div>
                <strong>어디까지 되면 성공인가요?</strong>
                <p>{spec.successMoment}</p>
              </div>
            </article>
          </section>
          <section className="spec-section" aria-labelledby="spec-mvp-title">
            <div className="spec-section-heading">
              <span>만들 것</span>
              <h3 id="spec-mvp-title">첫 버전에 들어가는 기능</h3>
            </div>
            <ul className="spec-feature-list">
              {spec.mvpFeatures.map((feature) => (
                <li key={feature}>
                  <span aria-hidden="true">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </section>
          <section className="spec-section" aria-labelledby="spec-scope-title">
            <div className="spec-section-heading">
              <span>역할 분담</span>
              <h3 id="spec-scope-title">내가 배울 것과 Agent가 맡을 것</h3>
            </div>
            <div className="scope-summary-list">
              {spec.scope.map((item) => (
                <article
                  key={`${item.category}-${item.title}`}
                  className={`scope-summary scope-${item.category.toLowerCase().replaceAll('_', '-')}`}
                >
                  <div>
                    <span>
                      {item.category === 'LEARNER_FOCUS'
                        ? '내가 집중할 것'
                        : item.category === 'AGENT_SUPPORT'
                          ? 'Agent가 도울 것'
                          : '이번에는 제외'}
                    </span>
                    <h4>{item.title}</h4>
                  </div>
                  <p>{item.rationale}</p>
                  {item.conceptNames.length === 0 ? null : (
                    <ul className="concept-chips" aria-label={`${item.title} 핵심 개념`}>
                      {item.conceptNames.map((concept) => (
                        <li key={concept}>{concept}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section className="spec-section" aria-labelledby="spec-decision-title">
            <div className="spec-section-heading">
              <span>진행 중 선택</span>
              <h3 id="spec-decision-title">이런 순간에는 다시 물어볼게요</h3>
            </div>
            <div className="spec-decision-list">
              {spec.expectedDecisions.map((decision) => (
                <article key={`${decision.category}-${decision.description}`}>
                  <strong>{decision.description}</strong>
                  <p>{decision.whyUserInputMatters}</p>
                </article>
              ))}
            </div>
          </section>
          <footer className="spec-constraints">
            <strong>실행 기준</strong>
            <span>TypeScript</span>
            {spec.deploymentConstraints.map((constraint) => (
              <span key={constraint}>{constraint}</span>
            ))}
          </footer>
        </div>
        <aside className="spec-actions">
          <p className="eyebrow">다음 선택</p>
          <h3>권장안에서 편하게 결정하세요.</h3>
          <p>
            세부 기술을 모두 설계할 필요는 없습니다. 중요한 제품 범위와 학습 초점만 확인하면 돼요.
          </p>
          <button
            type="button"
            className="primary-button wide-button"
            disabled={inactive}
            onClick={() => void onConfirmAndPrepare()}
          >
            이대로 시작
          </button>
          {spec.status === 'DRAFT' ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                const value = refinement.trim()
                if (value.length > 0) {
                  setRefinement('')
                  void onRefine(value)
                }
              }}
            >
              <label className="field field-prominent">
                <span>바꾸고 싶은 점을 Agent에게 말하기</span>
                <textarea
                  value={refinement}
                  onChange={(event) => setRefinement(event.target.value)}
                  placeholder="예: 로그인은 빼고 로컬에서 먼저 완성하고 싶어요. 성공 기준도 초보자가 확인하기 쉽게 바꿔 주세요."
                  rows={5}
                />
              </label>
              <button
                type="submit"
                className="secondary-button wide-button"
                disabled={inactive || refinement.trim().length === 0}
              >
                Agent에게 다시 정리해달라고 하기
              </button>
            </form>
          ) : null}
          <button
            type="button"
            className="text-button"
            disabled={inactive}
            onClick={() => void onReturn()}
          >
            ← 다른 주제로 돌아가기
          </button>
        </aside>
      </div>
    </section>
  )
}
