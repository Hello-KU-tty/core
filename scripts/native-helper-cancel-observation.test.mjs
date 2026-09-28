import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertHelperEndpointObservations,
  assertQueuedHelperObservation,
  inspectNativeHelperCancellation,
} from './native-helper-cancel-observation.mjs'

const at = (ms) => new Date(Date.parse('2026-09-28T00:00:00.000Z') + ms).toISOString()
const event = (status, ms) => ({ status, updatedAt: at(ms) })
const running = (ms) => event('AGENT_RUNNING_HELPER', ms)
const reusable = (ms) => event('BUILTIN_H_CANCEL_CONFIRMED_REUSABLE', ms)
const cancelled = (ms) => event('AGENT_FAILED_NATIVE_H_CANCELLED_CONFIRMED', ms)
const completed = [running(10), reusable(40), cancelled(50)]

test('waits for both ordered native receipts after this bounded run starts', () => {
  assert.equal(inspectNativeHelperCancellation([], at(0)), null)
  assert.equal(inspectNativeHelperCancellation([running(10)], at(0)), null)
  assert.equal(inspectNativeHelperCancellation([running(10), reusable(40)], at(0)), null)
  assert.deepEqual(inspectNativeHelperCancellation(completed, at(0)), {
    firstNativeStartedAt: at(10),
    pairReusableAt: at(40),
    nativeCancelTerminalAt: at(50),
    helperStarts: [at(10)],
  })
})

const endpoint = (role, ms, serial, windowId = 7) => ({
  role,
  at: at(ms),
  windowId,
  nativeJobId: `native_00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
})

test('counts the two Helper calls independently from their normal following Analyst', () => {
  const entries = [
    endpoint('HELPER', 10, 1),
    endpoint('HELPER', 60, 2),
    endpoint('EVIDENCE_ANALYST', 80, 3),
  ]
  assert.deepEqual(assertHelperEndpointObservations(entries, at(0), at(30)), {
    helperCount: 2,
    analystCount: 1,
    windowId: 7,
  })
  assert.deepEqual(assertHelperEndpointObservations(entries.slice(0, 1), at(0)), {
    helperCount: 1,
    analystCount: 0,
    windowId: 7,
  })
  assert.throws(() => assertHelperEndpointObservations(entries, at(0)), /SET_INVALID/)
  assert.throws(
    () => assertHelperEndpointObservations([...entries, endpoint('HELPER', 90, 4)], at(0), at(30)),
    /COUNT_INVALID/,
  )
})

test('rejects changed windows, duplicate jobs, foreign roles and stale endpoint bounds', () => {
  const first = endpoint('HELPER', 10, 1)
  assert.throws(() => assertHelperEndpointObservations([first, first], at(0), at(5)), /SET_INVALID/)
  assert.throws(
    () => assertHelperEndpointObservations([first, endpoint('HELPER', 60, 2, 8)], at(0), at(30)),
    /WINDOW_CHANGED/,
  )
  assert.throws(
    () => assertHelperEndpointObservations([first, endpoint('BUILDER', 60, 2)], at(0), at(30)),
    /SET_INVALID/,
  )
  assert.throws(() => assertHelperEndpointObservations([first], at(11)), /PRECEDES_RUN/)
  assert.throws(
    () =>
      assertHelperEndpointObservations(
        [first, endpoint('HELPER', 60, 2), endpoint('EVIDENCE_ANALYST', 20, 3)],
        at(0),
        at(30),
      ),
    /ANALYST_PRECEDES/,
  )
})

test('does not accept a previous delayed cancellation as this run confirmation', () => {
  for (const prefix of [[reusable(2)], [cancelled(2)], [reusable(2), cancelled(3)]]) {
    assert.throws(
      () => inspectNativeHelperCancellation([...prefix, ...completed], at(0)),
      /UNBOUND/,
    )
    assert.throws(() => inspectNativeHelperCancellation(prefix, at(0)), /UNBOUND/)
  }
  assert.throws(() => inspectNativeHelperCancellation(completed, at(11)), /UNBOUND/)
})

test('rejects missing or out-of-order reusable confirmation', () => {
  assert.throws(
    () => inspectNativeHelperCancellation([running(10), cancelled(40)], at(0)),
    /REUSABLE_ORDER/,
  )
  assert.throws(
    () => inspectNativeHelperCancellation([running(10), cancelled(40), reusable(50)], at(0)),
    /REUSABLE_ORDER/,
  )
})

test('rejects a new Helper invocation while the first native prompt is still live', () => {
  assert.throws(
    () => inspectNativeHelperCancellation([running(10), running(20)], at(0)),
    /INVOKED_BEFORE/,
  )
  assert.throws(
    () =>
      inspectNativeHelperCancellation(
        [running(10), running(20), reusable(40), cancelled(50)],
        at(0),
      ),
    /INVOKED_BEFORE/,
  )
})

test('fails closed on ambiguous foreign activity or non-cancellation failure', () => {
  for (const status of [
    'AGENT_RUNNING_BUILDER',
    'AGENT_ENDED_HELPER',
    'BUILTIN_H_FAIL_CLOSED',
    'AGENT_FAILED_NATIVE_IDE_TURN_FAILED',
  ]) {
    assert.throws(
      () =>
        inspectNativeHelperCancellation(
          [running(10), event(status, 20), reusable(40), cancelled(50)],
          at(0),
        ),
      /NOT_CONFIRMED/,
    )
  }
})

test('validates timestamps and does not infer order from an invalid clock', () => {
  assert.throws(
    () => inspectNativeHelperCancellation([running(10), reusable(9)], at(0)),
    /CLOCK_REGRESSED/,
  )
  assert.throws(
    () => inspectNativeHelperCancellation([{ status: 'x', updatedAt: 'bad' }], at(0)),
    /TIME_INVALID/,
  )
  assert.throws(
    () => inspectNativeHelperCancellation([{ updatedAt: at(10) }], at(0)),
    /OBSERVATION_INVALID/,
  )
})

test('requires actual queue overlap and exactly two starts; permits normal later Analyst', () => {
  const trace = [
    ...completed,
    running(60),
    event('AGENT_ENDED_HELPER', 70),
    event('AGENT_RUNNING_EVIDENCE_ANALYST', 80),
  ]
  const result = assertQueuedHelperObservation(trace, at(0), at(30))
  assert.equal(result.retryNativeStartedAt, at(60))
  assert.equal(result.nativeCancelTerminalAt, at(50))
  assert.throws(() => assertQueuedHelperObservation(trace, at(0), at(50)), /OVERLAP_NOT_OBSERVED/)
  assert.throws(() => assertQueuedHelperObservation(trace, at(0), at(9)), /CREATED_BEFORE/)
  assert.throws(() => assertQueuedHelperObservation(completed, at(0), at(30)), /START_COUNT/)
  assert.throws(
    () => assertQueuedHelperObservation([...trace, running(90)], at(0), at(30)),
    /START_COUNT/,
  )
})
