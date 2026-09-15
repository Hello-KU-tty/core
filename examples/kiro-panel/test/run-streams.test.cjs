const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const { join } = require('node:path')

test('overlapping Builder and Helper output remains selectable by run', () => {
  const elements = new Map()
  const makeElement = () => ({
    value: '', textContent: '', hidden: false, disabled: false, children: [], dataset: {},
    scrollTop: 0, scrollHeight: 0, clientHeight: 0,
    append(...nodes) { this.children.push(...nodes) },
    replaceChildren(...nodes) { this.children = [...nodes] },
    querySelectorAll() { return [] },
    focus() { this.focused = true },
  })
  const byId = id => {
    if (!elements.has(id)) elements.set(id, makeElement())
    return elements.get(id)
  }
  const buttons = {
    feedback: ['SELECT', 'REVISE', 'MERGE', 'MORE'].map(value => ({ dataset: { feedback: value } })),
    retry: ['PREVIEW', 'ENRICH_ALL', 'ROUND'].map(value => ({ dataset: { retry: value } })),
    agent: ['BUILDER', 'HELPER'].map(value => ({ dataset: { agent: value } })),
    quick: [{ dataset: { helperQuick: '현재 코드로 예를 들어 설명해 줘' } }],
  }
  const posted = []
  let receive
  const document = {
    getElementById: byId,
    createElement: makeElement,
    createTextNode: text => ({ textContent: text }),
    querySelectorAll(selector) {
      if (selector === '[data-feedback]') return buttons.feedback
      if (selector === '[data-retry]') return buttons.retry
      if (selector === '[data-agent]') return buttons.agent
      if (selector === '[data-helper-quick]') return buttons.quick
      if (selector === '[data-feedback], [data-retry]') return [...buttons.feedback, ...buttons.retry]
      return []
    },
  }
  const window = { addEventListener: (_, callback) => { receive = data => callback({ data }) } }
  const source = readFileSync(join(__dirname, '../media/panel.js'), 'utf8')
  runInNewContext(source, { document, window, acquireVsCodeApi: () => ({ postMessage: message => posted.push(message) }) })
  const snapshot = projectId => ({ project: { id: projectId, status: 'BUILDER' },
    pendingDecisions: [], learningSpec: null, discoveryContext: null })
  receive({ kind: 'snapshot', data: snapshot('project_one') })
  const builder = { id: 'run_builder', projectId: 'project_one', kind: 'BUILDER', phase: 'BUILDER',
    status: 'RUNNING', outcome: 'PENDING', createdAt: '2026-09-14T08:14:00.000Z' }
  const helper = { id: 'run_helper', projectId: 'project_one', kind: 'HELPER', phase: 'HELPER',
    status: 'RUNNING', outcome: 'PENDING', createdAt: '2026-09-14T08:15:00.000Z' }
  receive({ kind: 'run', data: builder })
  receive({ kind: 'event', data: { projectId: 'project_one', runId: builder.id,
    sequence: 2, kind: 'TEXT', text: 'Builder writes files.' } })
  assert.equal(byId('builderStream').textContent, 'Builder writes files.')
  assert.equal(byId('helperStream').textContent, '')
  assert.equal(byId('stopBuilder').disabled, false)
  assert.equal(byId('stopHelper').disabled, true)
  receive({ kind: 'run', data: helper })
  receive({ kind: 'event', data: { projectId: 'project_one', runId: helper.id,
    sequence: 3, kind: 'TEXT', text: ' to keep insertion order.' } })
  receive({ kind: 'event', data: { projectId: 'project_one', runId: helper.id,
    sequence: 2, kind: 'TEXT', text: 'Copy before sorting' } })
  receive({ kind: 'event', data: { projectId: 'project_one', runId: helper.id,
    sequence: 2, kind: 'TEXT', text: 'Copy before sorting' } })
  assert.equal(byId('stream').textContent, 'Copy before sorting to keep insertion order.')
  assert.match(byId('streamHeading').textContent, /HELPER/)
  assert.equal(byId('builderStream').textContent, 'Builder writes files.')
  assert.equal(byId('helperStream').textContent, 'Copy before sorting to keep insertion order.')
  assert.equal(byId('stopHelper').disabled, false)
  byId('helperStream').scrollHeight = 500
  byId('helperStream').clientHeight = 100
  byId('helperStream').scrollTop = 10
  receive({ kind: 'event', data: { projectId: 'project_one', runId: builder.id,
    sequence: 3, kind: 'TOOL', update: { name: 'shell', status: 'SUCCEEDED' } } })
  assert.equal(byId('stream').textContent, 'Copy before sorting to keep insertion order.')
  assert.match(byId('builderStream').textContent, /"status":"SUCCEEDED"/)
  assert.equal(byId('helperStream').textContent, 'Copy before sorting to keep insertion order.')
  assert.equal(byId('helperStream').scrollTop, 10, 'Builder output must not move a manually scrolled Helper pane')
  receive({ kind: 'run', data: { ...helper, status: 'RUNNING' } })
  assert.equal(byId('helperStream').scrollTop, 10, 'status-only updates must preserve Helper reading position')

  byId('builderMessage').value = 'Build the product.'
  byId('helperMessage').value = 'Explain this decision.'
  buttons.agent.find(button => button.dataset.agent === 'BUILDER').onclick()
  buttons.agent.find(button => button.dataset.agent === 'HELPER').onclick()
  assert.equal(posted.at(-2).role, 'BUILDER')
  assert.equal(posted.at(-2).text, 'Build the product.')
  assert.equal(posted.at(-1).role, 'HELPER')
  assert.equal(posted.at(-1).text, 'Explain this decision.')
  assert.equal(byId('builderMessage').value, 'Build the product.')
  assert.equal(byId('helperMessage').value, 'Explain this decision.')
  receive({ kind: 'snapshot', data: snapshot('project_one') })
  assert.equal(byId('builderMessage').value, 'Build the product.')
  assert.equal(byId('helperMessage').value, 'Explain this decision.')
  byId('stopBuilder').onclick()
  byId('stopHelper').onclick()
  assert.equal(posted.at(-2).runId, builder.id)
  assert.equal(posted.at(-1).runId, helper.id)
  buttons.quick[0].onclick()
  assert.equal(byId('helperMessage').value, '현재 코드로 예를 들어 설명해 줘')
  assert.equal(byId('builderMessage').value, 'Build the product.')
  assert.equal(byId('helperMessage').focused, true)

  byId('runs').children[0].children[0].onclick()
  assert.match(byId('stream').textContent, /Builder writes files/)
  assert.match(byId('stream').textContent, /"status":"SUCCEEDED"/)
  receive({ kind: 'run', data: { ...builder, status: 'SUCCEEDED' } })
  assert.match(byId('streamHeading').textContent, /BUILDER.*SUCCEEDED/)
  assert.equal(byId('stopBuilder').disabled, true)
  assert.equal(byId('stopHelper').disabled, false)
  byId('runs').children[1].children[0].onclick()
  assert.equal(byId('stream').textContent, 'Copy before sorting to keep insertion order.')

  buttons.agent.find(button => button.dataset.agent === 'HELPER').onclick()
  const laterHelper = { ...helper, id: 'run_helper_later', createdAt: '2026-09-14T08:20:00.000Z' }
  receive({ kind: 'run', data: laterHelper })
  receive({ kind: 'event', data: { projectId: 'project_one', runId: laterHelper.id,
    sequence: 2, kind: 'TEXT', text: 'New answer.' } })
  assert.equal(byId('stream').textContent, 'New answer.')
  assert.match(byId('streamHeading').textContent, /HELPER/)
  assert.equal(byId('helperStream').textContent, 'New answer.')
  assert.match(byId('builderStream').textContent, /Builder writes files/)
  assert.equal(byId('helperStream').scrollTop, 500, 'a newly selected Helper run follows its own tail')
  byId('helperStream').scrollTop = 10
  receive({ kind: 'event', data: { projectId: 'project_one', runId: laterHelper.id,
    sequence: 3, kind: 'TEXT', text: 'A'.repeat(70_000) } })
  assert.equal(byId('helperStream').scrollTop, 10, 'new text must not jump while reading earlier output')
  byId('helperStream').scrollTop = 390
  receive({ kind: 'event', data: { projectId: 'project_one', runId: laterHelper.id,
    sequence: 4, kind: 'TEXT', text: 'B'.repeat(70_000) } })
  assert.equal(byId('helperStream').scrollTop, 500, 'a near-bottom Helper pane follows new text')
  receive({ kind: 'event', data: { projectId: 'project_one', runId: laterHelper.id,
    sequence: 2, kind: 'TEXT', text: 'New answer.' } })
  assert.equal(byId('stream').textContent, 'B'.repeat(70_000),
    'replaying a trimmed sequence cannot reinsert old output')
  assert.equal(byId('helperStream').textContent, 'B'.repeat(70_000))

  receive({ kind: 'snapshot', data: snapshot('project_two') })
  assert.equal(byId('stream').textContent, '')
  assert.equal(byId('builderStream').textContent, '')
  assert.equal(byId('helperStream').textContent, '')
  assert.equal(byId('builderMessage').value, '')
  assert.equal(byId('helperMessage').value, '')
  assert.equal(byId('stopBuilder').disabled, true)
  assert.equal(byId('stopHelper').disabled, true)
  assert.equal(byId('runs').children.length, 0)
  receive({ kind: 'event', data: { projectId: 'project_one', runId: laterHelper.id,
    sequence: 3, kind: 'TEXT', text: 'Must stay hidden.' } })
  assert.equal(byId('stream').textContent, '')
  assert.equal(byId('builderStream').textContent, '')
  assert.equal(byId('helperStream').textContent, '')
})

test('Builder and Helper retain distinct visible composers and streams', () => {
  const html = readFileSync(join(__dirname, '../media/panel.html'), 'utf8')
  for (const id of ['builderMessage', 'helperMessage', 'builderStream', 'helperStream',
    'stopBuilder', 'stopHelper', 'decisions', 'runs', 'stream']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) ?? []).length, 1, `${id} must occur once`)
  }
})
