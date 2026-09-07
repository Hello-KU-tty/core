const api = acquireVsCodeApi()
const byId = id => document.getElementById(id)
const send = (action, fields = {}) => { byId('errors').textContent = ''; api.postMessage({ action, ...fields }) }
const text = id => byId(id).value.trim()
const element = (tag, content) => { const node = document.createElement(tag); node.textContent = content; return node }
let snapshot
let helperUsed = false
const runs = new Map()
byId('refresh').onclick = () => send('refresh')
byId('start').onclick = () => send('start', { goal: text('goal'), need: text('need') })
byId('refineSpec').onclick = () => send('refineSpec', { text: text('specText') })
for (const action of ['return', 'confirm', 'openWorkspace', 'launch']) byId(action).onclick = () => send(action)
for (const button of document.querySelectorAll('[data-retry]')) button.onclick = () => send('retryDiscovery', { phase: button.dataset.retry })
for (const button of document.querySelectorAll('[data-feedback]')) button.onclick = () => send('feedback', {
  intent: button.dataset.feedback, text: text('feedback'), candidateIds: button.dataset.feedback === 'MORE' ? [] : [...document.querySelectorAll('#candidates input:checked')].map(node => node.value),
})
for (const button of document.querySelectorAll('[data-agent]')) button.onclick = () => {
  if (button.dataset.agent === 'HELPER') helperUsed = true
  send('agent', { role: button.dataset.agent, text: text('message'), decisionId: snapshot?.pendingDecisions[0]?.id })
}
window.addEventListener('message', ({ data: message }) => {
  if (message.kind === 'error') byId('errors').textContent = message.code
  if (message.kind === 'history') {
    byId('history').replaceChildren(element('h2', 'History'))
    for (const item of message.data.projects) {
      const button = element('button', `${item.project.title} · ${item.project.status} · ${item.project.updatedAt}`)
      button.onclick = () => { helperUsed = false; send('history', { projectId: item.project.id }) }
      byId('history').append(button)
    }
  }
  if (message.kind === 'snapshot') {
    if (snapshot?.project.id !== message.data.project.id) {
      runs.clear(); byId('runs').replaceChildren(); byId('stream').textContent = ''; helperUsed = false
    }
    snapshot = message.data
    byId('snapshot').textContent = JSON.stringify(snapshot, null, 2)
    byId('spec').textContent = JSON.stringify(snapshot.learningSpec, null, 2)
    byId('candidates').replaceChildren()
    const context = snapshot.discoveryContext
    const latest = context?.rounds.at(-1)
    const candidates = latest ? latest.candidates.map(ref => context.candidates.find(c => c.id === ref.candidateId && c.revision === ref.revision)).filter(Boolean)
      : context?.previewRound?.previews.map(p => ({ ...p, id: p.candidateId })) ?? []
    for (const candidate of candidates) {
      const row = element('div', ''); row.className = 'candidate'
      const check = document.createElement('input'); check.type = 'checkbox'; check.value = candidate.id
      row.append(check, element('strong', candidate.title), element('p', candidate.summary))
      byId('candidates').append(row)
    }
    byId('decisions').replaceChildren()
    for (const decision of snapshot.pendingDecisions) {
      const row = element('div', '')
      row.append(element('h3', decision.title ?? decision.question), element('pre', JSON.stringify(decision, null, 2)))
      const rationale = document.createElement('textarea'); rationale.placeholder = '선택 이유 (선택, 본인의 말로)'; row.append(rationale)
      for (const option of decision.options) {
        const button = element('button', option.label ?? option.title ?? option.id)
        button.onclick = () => send('decision', { decisionId: decision.id, optionId: option.id, helperUsed, rationale: rationale.value.trim() })
        row.append(button)
      }
      byId('decisions').append(row)
    }
  }
  if (message.kind === 'event') {
    const event = message.data
    if (snapshot && event.projectId !== snapshot.project.id) return
    if (event.kind === 'TEXT' || event.kind === 'TOOL') {
      byId('stream').textContent = (byId('stream').textContent + (event.text ?? JSON.stringify(event.update)) + '\n').slice(-100_000)
      byId('stream').scrollTop = byId('stream').scrollHeight
    }
  }
  if (message.kind === 'run') {
    if (snapshot && message.data.projectId !== snapshot.project.id) return
    runs.set(message.data.id, message.data); byId('runs').replaceChildren()
    for (const run of runs.values()) {
      const row = element('p', `${run.kind} ${run.phase} · ${run.status} · ${run.outcome} ${run.errorCode ?? ''}`)
      if (['ACCEPTED', 'RUNNING'].includes(run.status)) { const stop = element('button', '중지'); stop.onclick = () => send('cancel', { runId: run.id }); row.append(stop) }
      byId('runs').append(row)
    }
  }
})
send('refresh')
