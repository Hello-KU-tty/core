const api = acquireVsCodeApi()
const byId = id => document.getElementById(id)
const send = (action, fields = {}) => { byId('errors').textContent = ''; api.postMessage({ action, ...fields }) }
const text = id => byId(id).value.trim()
const element = (tag, content) => { const node = document.createElement(tag); node.textContent = content; return node }
let snapshot
let helperUsed = false
let archiveView = false
const runs = new Map()
const runStreams = new Map()
const runStreamFragments = new Map()
const runStreamTrimmedThrough = new Map()
let selectedRunId = null
let streamSelectionPinned = false
const shortId = id => typeof id === 'string' ? id.slice(-8) : '없음'
const roleNames = { BUILDER: 'Builder', HELPER: 'Helper' }
const latestRoleRun = role => {
  const matching = [...runs.values()].filter(run => run.kind === role)
  const active = matching.filter(run => ['ACCEPTED', 'RUNNING'].includes(run.status))
  return (active.length ? active : matching).sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]
}
const renderRole = role => {
  const name = roleNames[role]
  const prefix = name.toLowerCase()
  const run = latestRoleRun(role)
  byId(`${prefix}StreamHeading`).textContent = run
    ? `${name} ${run.phase} · ${run.status} · ${shortId(run.id)}${run.errorCode ? ` · ${run.errorCode}` : ''}`
    : `${name} 실행 기록이 없습니다.`
  const stream = byId(`${prefix}Stream`)
  const nextRunId = run?.id ?? ''
  const nextText = runStreams.get(run?.id) ?? ''
  const runChanged = stream.dataset.runId !== nextRunId
  if (runChanged || stream.textContent !== nextText) {
    const followTail = runChanged ||
      stream.scrollHeight - stream.scrollTop - stream.clientHeight <= 24
    stream.textContent = nextText
    stream.dataset.runId = nextRunId
    if (followTail) stream.scrollTop = stream.scrollHeight
  }
  byId(`stop${name}`).disabled = !run || !['ACCEPTED', 'RUNNING'].includes(run.status)
}
const stopRole = role => {
  const run = latestRoleRun(role)
  if (run && ['ACCEPTED', 'RUNNING'].includes(run.status)) send('cancel', { runId: run.id })
}
const renderStream = () => {
  const run = runs.get(selectedRunId)
  byId('streamHeading').textContent = run
    ? `${run.kind} ${run.phase} · ${run.status} · ${shortId(run.id)}${streamSelectionPinned ? ' · 수동 선택' : ''}`
    : '표시할 실행이 없습니다.'
  byId('stream').textContent = runStreams.get(selectedRunId) ?? ''
  byId('stream').scrollTop = byId('stream').scrollHeight
}
const renderRuns = () => {
  byId('runs').replaceChildren()
  for (const run of runs.values()) {
    const row = element('p', `${run.kind} ${run.phase} · ${run.status} · ${run.outcome} ${run.errorCode ?? ''}`)
    const show = element('button', '출력 보기')
    show.onclick = () => { selectedRunId = run.id; streamSelectionPinned = true; renderStream() }
    row.append(show)
    if (['ACCEPTED', 'RUNNING'].includes(run.status)) {
      const stop = element('button', '중지')
      stop.onclick = () => send('cancel', { runId: run.id })
      row.append(stop)
    }
    byId('runs').append(row)
  }
}
const updateDiscoveryNavigation = () => {
  const specReview = snapshot?.project.status === 'SPEC_REVIEW' &&
    snapshot?.discoverySession?.status === 'SELECTED' && !!snapshot.learningSpec
  const activeDiscovery = snapshot?.project.status === 'DISCOVERY' &&
    snapshot?.discoverySession?.status === 'ACTIVE'
  byId('archiveNotice').hidden = !(archiveView && specReview)
  byId('return').disabled = !specReview
  for (const button of document.querySelectorAll('[data-feedback], [data-retry]')) button.disabled = !activeDiscovery
  for (const check of byId('candidates').querySelectorAll('input')) check.disabled = !activeDiscovery
}
byId('refresh').onclick = () => send('refresh')
byId('start').onclick = () => send('start', { goal: text('goal'), need: text('need') })
byId('refineSpec').onclick = () => send('refineSpec', { text: text('specText') })
byId('return').onclick = () => {
  if (snapshot?.project.status !== 'SPEC_REVIEW' || !snapshot.learningSpec) return
  archiveView = true
  updateDiscoveryNavigation()
  byId('discoverySection').scrollIntoView({ block: 'start' })
}
byId('backToSpec').onclick = () => {
  archiveView = false
  updateDiscoveryNavigation()
  byId('spec').scrollIntoView({ block: 'start' })
}
byId('restartDiscovery').onclick = () => {
  if (!archiveView || snapshot?.project.status !== 'SPEC_REVIEW') return
  send('restartDiscovery', { goal: text('goal'), need: text('need') })
}
byId('prepareFinalUpgrade').onclick = () => send('prepareFinalUpgrade', {
  personalizationTraceId: byId('upgradeTrace').value, userGoal: text('upgradeGoal'),
})
for (const action of ['confirm', 'openWorkspace', 'launch']) byId(action).onclick = () => send(action)
for (const button of document.querySelectorAll('[data-retry]')) button.onclick = () => send('retryDiscovery', { phase: button.dataset.retry })
for (const button of document.querySelectorAll('[data-feedback]')) button.onclick = () => {
  const intent = button.dataset.feedback
  const candidateIds = intent === 'MORE' ? [] : [...document.querySelectorAll('#candidates input:checked')].map(node => node.value)
  if ((intent === 'SELECT' || intent === 'REVISE') && candidateIds.length !== 1) {
    byId('errors').textContent = '후보를 정확히 하나 선택해 주세요.'
    return
  }
  if (intent === 'MERGE' && (candidateIds.length < 2 || candidateIds.length > 8)) {
    byId('errors').textContent = '합칠 후보를 2개 이상 8개 이하로 선택해 주세요.'
    return
  }
  send('feedback', { intent, text: text('feedback'), candidateIds })
}
for (const button of document.querySelectorAll('[data-agent]')) button.onclick = () => {
  const role = button.dataset.agent
  if (role === 'HELPER') helperUsed = true
  streamSelectionPinned = false
  send('agent', { role, text: text(role === 'BUILDER' ? 'builderMessage' : 'helperMessage'),
    decisionId: snapshot?.pendingDecisions[0]?.id })
}
byId('stopBuilder').onclick = () => stopRole('BUILDER')
byId('stopHelper').onclick = () => stopRole('HELPER')
for (const button of document.querySelectorAll('[data-helper-quick]')) button.onclick = () => {
  byId('helperMessage').value = button.dataset.helperQuick
  byId('helperMessage').focus()
}
window.addEventListener('message', ({ data: message }) => {
  if (message.kind === 'error') byId('errors').textContent = message.code
  if (message.kind === 'connectionStatus') {
    byId('connectionStatus').textContent = message.status === 'RECOVERED_READ_ONLY'
      ? `Core 연결을 갱신하고 저장된 상태를 다시 읽었습니다.${message.stoppedStreams > 0 ? ' 진행 중이던 stream은 다시 시작하지 않았습니다.' : ''}`
      : ''
  }
  if (message.kind === 'workerStatus') {
    byId('workerStatus').textContent = message.status === 'WORKSPACE_SWITCH_UNCONFIRMED'
      ? '생성 workspace 전환이 이 Kiro 창에서 확인되지 않아 Agent 작업을 받지 못했습니다. 같은 폴더를 연 다른 창과 실행 창을 확인해 주세요.'
      : message.status === 'WORKSPACE_SWITCH_FAILED'
        ? '생성 workspace 전환이 실패했습니다. 실행 창과 workspace 상태를 확인해 주세요.'
        : message.status === 'HELPER_WINDOW_OPENING'
          ? 'Helper 전용 Kiro 창을 여는 중입니다. 해당 창에 Restricted Mode 안내가 있으면 Workspace Trust를 승인해 주세요.'
          : ''
  }
  if (message.kind === 'resultLaunch') {
    if (!snapshot || message.projectId !== snapshot.project.id ||
        typeof message.url !== 'string' || !/^http:\/\/127\.0\.0\.1:\d+\//.test(message.url)) return
    const host = byId('resultLaunch')
    const link = element('a', message.url)
    link.href = message.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    host.replaceChildren(element('p', message.opened ?
      '결과 서버가 실행 중이며 외부 브라우저 열기 요청을 전달했습니다.' :
      '결과 서버는 실행 중이지만 브라우저 자동 열기를 확인하지 못했습니다. 아래 주소를 열어 주세요.'), link)
  }
  if (message.kind === 'history') {
    byId('history').replaceChildren(element('h2', 'History'))
    for (const item of message.data.projects) {
      const button = element('button', `${item.project.title} · ${item.project.status} · ${item.project.updatedAt}`)
      button.onclick = () => { helperUsed = false; send('history', { projectId: item.project.id }) }
      byId('history').append(button)
    }
  }
  if (message.kind === 'snapshot') {
    const sameProject = snapshot?.project.id === message.data.project.id
    const checkedIds = sameProject ? new Set([...byId('candidates').querySelectorAll('input:checked')].map(input => input.value)) : new Set()
    if (!sameProject) {
      runs.clear(); runStreams.clear(); runStreamFragments.clear(); runStreamTrimmedThrough.clear()
      selectedRunId = null; streamSelectionPinned = false
      byId('runs').replaceChildren(); byId('analysisJobs').replaceChildren(); renderStream()
      renderRole('BUILDER'); renderRole('HELPER'); helperUsed = false
      archiveView = false
      byId('builderMessage').value = ''
      byId('helperMessage').value = ''
      byId('upgradeGoal').value = ''
      byId('resultLaunch').replaceChildren()
    }
    snapshot = message.data
    if (!sameProject) {
      byId('goal').value = snapshot.discoverySession?.input?.learningGoal ?? ''
      byId('need').value = snapshot.discoverySession?.input?.personalNeed ?? ''
    }
    if (snapshot.project.status !== 'SPEC_REVIEW') archiveView = false
    byId('finalUpgrade').hidden = true
    byId('upgradeTrace').replaceChildren()
    byId('evidenceTrace').replaceChildren()
    byId('snapshot').textContent = JSON.stringify(snapshot, null, 2)
    byId('spec').textContent = JSON.stringify(snapshot.learningSpec, null, 2)
    byId('candidates').replaceChildren()
    const context = snapshot.discoveryContext
    const latest = context?.rounds.at(-1)
    const candidates = latest ? latest.candidates.map(ref => context.candidates.find(c => c.id === ref.candidateId && c.revision === ref.revision)).filter(Boolean)
      : context?.previewRound?.previews.map(p => ({ ...p, id: p.candidateId })) ?? []
    for (const candidate of candidates) {
      const row = element('div', ''); row.className = 'candidate'
      const check = document.createElement('input'); check.type = 'checkbox'; check.value = candidate.id; check.checked = checkedIds.has(candidate.id)
      row.append(check, element('strong', candidate.title), element('p', candidate.summary))
      byId('candidates').append(row)
    }
    updateDiscoveryNavigation()
    byId('decisions').replaceChildren()
    for (const decision of snapshot.pendingDecisions) {
      const row = element('div', '')
      row.append(element('h3', decision.title ?? decision.question), element('pre', JSON.stringify(decision, null, 2)))
      const rationale = document.createElement('textarea'); rationale.placeholder = '선택 이유 (선택, 본인의 말로)'; row.append(rationale)
      for (const option of decision.options) {
        const button = element('button', option.label ?? option.title ?? option.id)
        button.onclick = () => send('decision', { decisionId: decision.id, selectionKind: 'OPTION', optionId: option.id, helperUsed, rationale: rationale.value.trim() })
        row.append(button)
      }
      const customProposal = document.createElement('textarea')
      customProposal.placeholder = '목록에 없는 직접 제안'
      customProposal.maxLength = 4000
      const customButton = element('button', '직접 제안으로 결정')
      customButton.onclick = () => send('decision', { decisionId: decision.id,
        selectionKind: 'CUSTOM', customProposal: customProposal.value.trim(),
        helperUsed, rationale: rationale.value.trim() })
      row.append(customProposal, customButton)
      byId('decisions').append(row)
    }
  }
  if (message.kind === 'finalUpgradeTraces') {
    if (!snapshot || message.projectId !== snapshot.project.id) return
    const select = byId('upgradeTrace')
    select.replaceChildren()
    for (const trace of message.data) {
      const option = element('option', `Helper ${trace.createdAt} · Evidence 근거 ${trace.basisCount}건 · ${trace.id.slice(-8)}`)
      option.value = trace.id
      select.append(option)
    }
    byId('finalUpgrade').hidden = message.data.length === 0
  }
  if (message.kind === 'analysisJobs') {
    if (!snapshot || message.projectId !== snapshot.project.id) return
    byId('analysisJobs').replaceChildren()
    for (const job of message.data) {
      const row = element('div', `Episode ${job.episodeId.slice(-8)} · 분석 실패 · ${job.errorCode ?? 'ANALYST_RUNTIME_ERROR'}`)
      const retry = element('button', '저장된 Episode 분석 다시 시도')
      retry.onclick = () => send('retryAnalysis', { analysisJobId: job.id })
      row.append(retry)
      byId('analysisJobs').append(row)
    }
  }
  if (message.kind === 'evidenceTrace') {
    if (!snapshot || message.projectId !== snapshot.project.id) return
    const host = byId('evidenceTrace')
    host.replaceChildren()
    const data = message.data
    if (data.emptyReason) host.append(element('p', data.emptyReason))
    for (const concept of data.concepts) {
      const details = document.createElement('details')
      details.className = 'candidate'
      details.append(element('summary', `${concept.name} · ${concept.state ?? '미확인'} · 수락 ${concept.accepted.length} / 기각 ${concept.rejected.length}`))
      details.append(element('p', `Concept ${concept.id} · State revision ${concept.stateRevision ?? '없음'}`))
      for (const item of concept.accepted) {
        details.append(element('p', `수락 · ${item.kind} · 상태 근거 ${item.supportsState ?? '없음'} · 신호 ${item.signal ?? '없음'} · 강도 ${item.strength ?? '없음'} · 힌트 ${item.promptDependence ?? '없음'}`))
        if (item.excerpt) details.append(element('p', `Evidence: ${item.excerpt}`))
        if (item.rationale) details.append(element('p', `판정 이유: ${item.rationale}`))
        details.append(element('small', `Evidence ${item.id} · Episode ${item.episodeId} (${item.episodeType}) · 출처 Project ${item.sourceProjectId} · Task ${item.taskId ?? '없음'}`))
      }
      for (const item of concept.rejected) {
        details.append(element('p', `기각 · ${item.reasonCode}`))
        if (item.excerpt) details.append(element('p', `제안된 Evidence: ${item.excerpt}`))
        if (item.explanation) details.append(element('p', `기각 이유: ${item.explanation}`))
        details.append(element('small', `Proposal ${item.proposalId} · 판정 ${item.decisionId} · Episode ${item.episodeId} · 출처 Project ${item.sourceProjectId}`))
      }
      host.append(details)
    }
    for (const item of data.personalization) {
      const details = document.createElement('details')
      details.className = 'candidate'
      const targetId = item.target.kind === 'HELPER_TURN' ? item.target.taskId : item.target.discoverySessionId
      details.append(element('summary', `개인화 ${shortId(item.id)} · ${item.mode} · ${item.target.kind} ${shortId(targetId)} · ${item.createdAt}`))
      for (const basis of item.basis) {
        details.append(element('p', `사용 근거 · ${basis.state} · ${basis.purpose}`))
        if (basis.excerpt) details.append(element('p', `참고한 Evidence: ${basis.excerpt}`))
        details.append(element('small', `Concept ${basis.conceptId} · Evidence ${basis.evidenceIds.join(', ')} · Episode ${basis.episodeIds.join(', ')} · 출처 Project ${basis.sourceProjectIds.join(', ')}`))
      }
      host.append(details)
    }
    if (data.analysis.length) host.append(element('p', `분석 Job: ${data.analysis.map(item => `${shortId(item.jobId)} ${item.status} (Episode ${shortId(item.episodeId)})`).join(' · ')}`))
  }
  if (message.kind === 'lifecycleStatus') {
    const labels = { IDLE: '준비 전', PREPARING_RUNTIME: '실행 환경 준비 중', CONNECTING_CORE: 'Core 연결 중',
      RECOVERING_CORE: 'Core 복구 중', CORE_CONNECTED: 'Core 연결됨', FAILED: '준비 실패', STOPPED: '종료됨' }
    const native = message.data.native === 'WORKER_READY' ? 'Agent 실행 준비됨 · 실제 결과는 실행 후 저장됩니다.' : 'Agent 준비 대기'
    byId('lifecycleStatus').textContent = `${labels[message.data.phase] ?? '상태 확인 중'} · ${native}` +
      (message.data.helperMode === 'SEPARATE_WINDOW' ? ' · Helper는 전용 보조 창에서 실행됩니다.' : '') +
      (message.data.errorCode ? ` · ${message.data.errorCode}` : '')
    byId('retryCore').hidden = message.data.phase !== 'FAILED' && message.data.native !== 'UNAVAILABLE'
    byId('retryCore').onclick = () => send('retryCore')
  }
  if (message.kind === 'userInputs') {
    if (!snapshot || message.projectId !== snapshot.project.id) return
    byId('userInputs').replaceChildren()
    for (const request of message.data) {
      const row = element('div', ''); row.className = 'candidate'
      row.append(element('h3', `Kiro 질문 · ${request.role}`),
        element('p', request.question))
      if (request.status === 'RESPONDING') {
        row.append(element('p', '답변을 Kiro에 전달 중 · 확인 응답 대기'))
        byId('userInputs').append(row)
        continue
      }
      if (request.options.length) {
        request.options.forEach((option, optionIndex) => {
          const choice = element('div', ''); choice.className = 'candidate'
          choice.append(element('p', `${option.title}${option.recommended ? ' · 추천' : ''}`))
          if (option.description) choice.append(element('p', option.description))
          if (option.subOptionsLabel) choice.append(element('p', option.subOptionsLabel))
          const checks = []
          option.subOptions.forEach((sub, subIndex) => {
            const label = document.createElement('label')
            const check = document.createElement('input'); check.type = 'checkbox'; check.checked = true
            checks.push(check)
            label.append(check, document.createTextNode(sub.title))
            if (sub.description) label.append(element('span', ` · ${sub.description}`))
            choice.append(label)
          })
          const select = element('button', '이 답변 보내기')
          select.onclick = () => send('answerUserInput', {
            nativeJobId: request.nativeJobId, requestId: request.requestId,
            responseAction: 'answered', optionIndex,
            subOptionIndices: checks.flatMap((check, index) => check.checked ? [index] : []),
          })
          choice.append(select); row.append(choice)
        })
      }
      const answer = document.createElement('textarea')
      answer.placeholder = '직접 답변 (선택지 대신 입력 가능)'
      answer.maxLength = 2048
      const submit = element('button', '직접 답변 보내기')
      submit.onclick = () => send('answerUserInput', {
        nativeJobId: request.nativeJobId, requestId: request.requestId,
        responseAction: 'answered', answer: answer.value.trim(),
      })
      row.append(answer, submit)
      const dismiss = element('button', '질문 닫기')
      dismiss.onclick = () => send('answerUserInput', {
        nativeJobId: request.nativeJobId, requestId: request.requestId,
        responseAction: 'dismissed',
      })
      row.append(dismiss); byId('userInputs').append(row)
    }
  }
  if (message.kind === 'event') {
    const event = message.data
    if (snapshot && event.projectId !== snapshot.project.id) return
    if (event.kind === 'TEXT' || event.kind === 'TOOL') {
      if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) return
      if (event.sequence <= (runStreamTrimmedThrough.get(event.runId) ?? 0)) return
      const fragment = event.kind === 'TEXT' ? event.text ?? '' : `${JSON.stringify(event.update ?? {})}\n`
      const fragments = runStreamFragments.get(event.runId) ?? new Map()
      if (fragments.has(event.sequence)) return
      fragments.set(event.sequence, fragment)
      runStreamFragments.set(event.runId, fragments)
      const ordered = [...fragments].sort(([a], [b]) => a - b)
      let length = ordered.reduce((sum, [, value]) => sum + value.length, 0)
      while (length > 100_000 && ordered.length > 1) {
        const [sequence, value] = ordered.shift()
        fragments.delete(sequence)
        runStreamTrimmedThrough.set(event.runId, sequence)
        length -= value.length
      }
      runStreams.set(event.runId, ordered.map(([, value]) => value).join('').slice(-100_000))
      if (event.runId === selectedRunId) renderStream()
      const role = runs.get(event.runId)?.kind
      if (role === 'BUILDER' || role === 'HELPER') renderRole(role)
    }
  }
  if (message.kind === 'run') {
    if (snapshot && message.data.projectId !== snapshot.project.id) return
    const run = message.data
    runs.set(run.id, run)
    if (!streamSelectionPinned && (!selectedRunId ||
        run.createdAt > (runs.get(selectedRunId)?.createdAt ?? ''))) selectedRunId = run.id
    renderRuns()
    renderStream()
    if (run.kind === 'BUILDER' || run.kind === 'HELPER') renderRole(run.kind)
  }
})
send('refresh')
