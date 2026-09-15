const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { readLanguageModelMetadata, formatLanguageModelMetadata,
  readProbeMarkers, evaluateSubagentProbe, evaluateInvokeProbe } =
  require('../src/single-host-capability.cjs')

test('metadata probe enumerates models without sending a model request', async () => {
  const selectors = []
  const model = { vendor: 'kiro', id: 'model-safe', family: 'claude', version: '1.0',
    sendRequest() { throw new Error('MODEL_REQUEST_MUST_NOT_RUN') } }
  const metadata = await readLanguageModelMetadata({ lm: {
    selectChatModels: async selector => { selectors.push(selector); return [model] },
  } })
  assert.deepEqual(selectors, [undefined, { vendor: 'kiro' }])
  assert.equal(metadata.apiAvailable, true)
  assert.equal(metadata.allCount, 1)
  assert.equal(metadata.kiroCount, 1)
  assert.equal(metadata.models[0].vendor, 'kiro')
  assert.match(metadata.models[0].id, /^sha256:[0-9a-f]{12}$/)
  assert.equal(metadata.models[0].family, 'claude')
  assert.equal(metadata.models[0].version, '1.0')
  assert.match(formatLanguageModelMetadata(metadata), /LM_MODELS all=1 kiro=1/)
})

test('metadata probe bounds and sanitizes model identifiers', async () => {
  const metadata = await readLanguageModelMetadata({ lm: { selectChatModels: async selector =>
    selector ? [] : [{ vendor: 'other', id: 'private key=abc\n'.repeat(20), family: '', version: '' }] } })
  assert.equal(metadata.kiroCount, 0)
  assert.match(metadata.models[0].id, /^sha256:[0-9a-f]{12}$/)
  assert.doesNotMatch(JSON.stringify(metadata), /private|abc/)
  assert.deepEqual(await readLanguageModelMetadata({}),
    { apiAvailable: false, allCount: 0, kiroCount: 0, models: [] })
})

test('barrier result needs both returned markers with overlapping times', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'vibe-probe-markers-'))
  const write = (side, phase, time) => writeFileSync(join(directory, `${side}.${phase}.json`),
    JSON.stringify({ side, [phase === 'entered' ? 'enteredAt' : 'returnedAt']: time }))
  write('a', 'entered', 100)
  write('b', 'entered', 120)
  write('b', 'returned', 130)
  assert.equal((await readProbeMarkers(directory)).overlapped, false)
  write('a', 'returned', 125)
  assert.equal((await readProbeMarkers(directory)).overlapped, true)
  write('a', 'returned', 110)
  assert.equal((await readProbeMarkers(directory)).overlapped, false)
})

test('DAG verdict requires observed child identities and successful native tools', () => {
  const markers = { overlapped: true }
  const activities = [
    { action: 'ORCHESTRATE', status: 'completed', error: false,
      stages: ['vibe-single-host-a', 'vibe-single-host-b'] },
    { action: 'MEET_A', status: 'completed', error: false, subExecutionTag: 'child-a' },
    { action: 'MEET_B', status: 'completed', error: false, subExecutionTag: 'child-b' },
  ]
  assert.equal(evaluateSubagentProbe(markers, activities, 0, 0, false).passed, true)
  assert.equal(evaluateSubagentProbe(markers, activities.slice(0, 2), 0, 0, false).passed, false)
  assert.equal(evaluateSubagentProbe(markers, activities, 0, 1, false).passed, false)
  assert.equal(evaluateSubagentProbe(markers, activities, 0, 0, true).passed, false)
  assert.equal(evaluateSubagentProbe(markers,
    [...activities, { protocolKind: 'read' }], 0, 0, false).passed, false)
})

test('stock invoke verdict needs two distinct native calls and both child barriers', () => {
  const markers = { overlapped: true }
  const activities = [
    { action: 'INVOKE', role: 'vibe-single-invoke-a', toolCallTag: 'parent-a',
      status: 'completed', error: false },
    { action: 'INVOKE', role: 'vibe-single-invoke-b', toolCallTag: 'parent-b',
      status: 'completed', error: false },
    { action: 'MEET_A', status: 'completed', error: false, subExecutionTag: 'child-a' },
    { action: 'MEET_B', status: 'completed', error: false, subExecutionTag: 'child-b' },
  ]
  const evaluate = (events = activities) => evaluateInvokeProbe(markers,
    events, 2, 0, false, false, 'end_turn', 0,
    ['vibe-single-invoke-a', 'vibe-single-invoke-b'])
  assert.equal(evaluate().passed, true)
  assert.equal(evaluateInvokeProbe(markers, activities, 0, 0, false, false,
    'end_turn').overlapObserved, true)
  assert.equal(evaluateInvokeProbe(markers, activities, 0, 0, false, false,
    'end_turn').permissionRoute, 'AUTO_OR_UNOBSERVED')
  assert.equal(evaluate(activities.slice(0, 3)).passed, false)
  assert.equal(evaluate(activities.map(event => event.toolCallTag === 'parent-b' ?
    { ...event, toolCallTag: 'parent-a' } : event)).passed, false)
  assert.equal(evaluate([...activities, { responseFilesPresent: true }]).passed, false)
  assert.equal(evaluateInvokeProbe(markers, activities, 2, 0, false, true,
    'end_turn', 0, ['vibe-single-invoke-a', 'vibe-single-invoke-b']).passed, false)
  assert.equal(evaluateInvokeProbe(markers, activities, 2, 1, false, false,
    'end_turn', 0, ['vibe-single-invoke-a', 'vibe-single-invoke-b']).passed, false)
})
