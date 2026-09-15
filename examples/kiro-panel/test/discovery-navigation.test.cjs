const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const { join } = require('node:path')
const { restartDiscoveryInput } = require('../src/discovery-navigation.cjs')

const selectedSnapshot = {
  project: { id: 'project_1', status: 'SPEC_REVIEW' },
  discoverySession: {
    status: 'SELECTED',
    input: { learningGoal: 'Map and Set', personalNeed: 'Local shortcut organizer', currentLevel: 'NEW' },
  },
  learningSpec: { id: 'learning_spec_1', revision: 1 },
  discoveryContext: {
    rounds: [{ candidates: [{ candidateId: 'candidate_1', revision: 2 }] }],
    candidates: [{ id: 'candidate_1', revision: 2, title: 'Shortcut profile', summary: 'Local comparison' }],
  },
  pendingDecisions: [],
}

test('explicit new-candidate input preserves other fields and supports removing Personal Need', () => {
  assert.deepEqual(restartDiscoveryInput(selectedSnapshot, '  Changed goal  ', '  '), {
    learningGoal: 'Changed goal', currentLevel: 'NEW',
  })
  assert.deepEqual(restartDiscoveryInput(selectedSnapshot, 'Changed goal', ' New need '), {
    learningGoal: 'Changed goal', personalNeed: 'New need', currentLevel: 'NEW',
  })
  assert.throws(() => restartDiscoveryInput({ ...selectedSnapshot, project: { status: 'DISCOVERY' } }, 'goal', ''),
    /LEARNING_SPEC_REVIEW_NOT_ACTIVE/)
  assert.throws(() => restartDiscoveryInput(selectedSnapshot, '', ''), /DISCOVERY_GOAL_REQUIRED/)
})

test('Spec back button displays archived candidates locally; only explicit new-candidate button posts a mutation', () => {
  const messages = []
  const elements = new Map()
  const makeElement = () => ({
    value: '', textContent: '', hidden: false, disabled: false, children: [], dataset: {},
    append(...nodes) { this.children.push(...nodes) },
    replaceChildren(...nodes) { this.children = [...nodes] },
    querySelectorAll(selector) {
      if (selector !== 'input') return []
      return this.children.flatMap(row => row.children?.filter(node => node.type === 'checkbox') ?? [])
    },
    scrollIntoView() { this.scrolled = true },
  })
  const byId = id => {
    if (!elements.has(id)) elements.set(id, makeElement())
    return elements.get(id)
  }
  const buttons = {
    feedback: ['SELECT', 'REVISE', 'MERGE', 'MORE'].map(action => ({ dataset: { feedback: action } })),
    retry: ['PREVIEW', 'ENRICH_ALL', 'ROUND'].map(action => ({ dataset: { retry: action } })),
    agent: ['BUILDER', 'HELPER'].map(action => ({ dataset: { agent: action } })),
  }
  let onMessage
  const document = {
    getElementById: byId,
    createElement: makeElement,
    createTextNode: text => ({ textContent: text }),
    querySelectorAll(selector) {
      if (selector === '[data-feedback]') return buttons.feedback
      if (selector === '[data-retry]') return buttons.retry
      if (selector === '[data-agent]') return buttons.agent
      if (selector === '[data-feedback], [data-retry]') return [...buttons.feedback, ...buttons.retry]
      return []
    },
  }
  const window = { addEventListener: (_, handler) => { onMessage = handler } }
  const source = readFileSync(join(__dirname, '../media/panel.js'), 'utf8')
  runInNewContext(source, { document, window, acquireVsCodeApi: () => ({ postMessage: x => messages.push(x) }) })
  assert.deepEqual(messages.map(x => x.action), ['refresh'])
  messages.length = 0
  onMessage({ data: { kind: 'snapshot', data: selectedSnapshot } })
  assert.equal(byId('candidates').children.length, 1)
  assert.equal(byId('goal').value, 'Map and Set')
  assert.equal(byId('need').value, 'Local shortcut organizer')
  byId('return').onclick()
  assert.equal(messages.length, 0)
  assert.equal(byId('archiveNotice').hidden, false)
  assert.equal(byId('discoverySection').scrolled, true)
  assert.equal(byId('candidates').querySelectorAll('input')[0].disabled, true)
  assert.equal(buttons.feedback.every(x => x.disabled), true)
  byId('backToSpec').onclick()
  assert.equal(messages.length, 0)
  assert.equal(byId('archiveNotice').hidden, true)
  byId('return').onclick()
  byId('goal').value = 'Revised Map and Set goal'
  byId('need').value = ''
  byId('restartDiscovery').onclick()
  assert.deepEqual(JSON.parse(JSON.stringify(messages)), [
    { action: 'restartDiscovery', goal: 'Revised Map and Set goal', need: '' },
  ])
})
