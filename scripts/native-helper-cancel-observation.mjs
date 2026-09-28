// A bounded, isolated-worker observation, not a job-bound native cancellation ACK.
// Core run identity and global idle are checked separately by the live probe.
const RUNNING = 'AGENT_RUNNING_HELPER'
const REUSABLE = 'BUILTIN_H_CANCEL_CONFIRMED_REUSABLE'
const CANCELLED = 'AGENT_FAILED_NATIVE_H_CANCELLED_CONFIRMED'

function time(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(parsed)) throw new Error('NATIVE_CANCEL_OBSERVATION_TIME_INVALID')
  return parsed
}

export function inspectNativeHelperCancellation(events, runCreatedAt) {
  const created = time(runCreatedAt)
  if (!Array.isArray(events)) throw new Error('NATIVE_CANCEL_OBSERVATION_INVALID')
  const times = events.map((event) => {
    if (typeof event?.status !== 'string') throw new Error('NATIVE_CANCEL_OBSERVATION_INVALID')
    return time(event.updatedAt)
  })
  if (times.some((at, index) => index > 0 && at < times[index - 1]))
    throw new Error('NATIVE_CANCEL_OBSERVATION_CLOCK_REGRESSED')
  const starts = events.flatMap((event, index) => (event.status === RUNNING ? [index] : []))
  const first = starts[0]
  const terminal = events.findIndex((event) => event.status === CANCELLED)
  const reusable = events.findIndex((event) => event.status === REUSABLE)
  if (
    (terminal >= 0 && (first === undefined || terminal <= first)) ||
    (reusable >= 0 && (first === undefined || reusable <= first)) ||
    (first !== undefined && times[first] < created)
  )
    throw new Error('NATIVE_CANCEL_OBSERVATION_UNBOUND')
  const boundary = terminal >= 0 ? terminal : events.length
  if (
    events
      .slice(0, boundary)
      .some(
        (event) =>
          event.status === 'BUILTIN_H_FAIL_CLOSED' ||
          event.status.startsWith('AGENT_FAILED_') ||
          event.status.startsWith('AGENT_ENDED_') ||
          (event.status.startsWith('AGENT_RUNNING_') && event.status !== RUNNING),
      )
  )
    throw new Error('NATIVE_CANCEL_NOT_CONFIRMED_REUSABLE')
  if (starts.length > 1 && (terminal < 0 || starts[1] <= terminal))
    throw new Error('NATIVE_RETRY_INVOKED_BEFORE_CANCEL_TERMINAL')
  if (terminal < 0) return null
  if (reusable < 0 || reusable > terminal)
    throw new Error('NATIVE_CANCEL_REUSABLE_ORDER_UNCONFIRMED')
  return {
    firstNativeStartedAt: events[first].updatedAt,
    pairReusableAt: events[reusable].updatedAt,
    nativeCancelTerminalAt: events[terminal].updatedAt,
    helperStarts: starts.map((index) => events[index].updatedAt),
  }
}

export function assertQueuedHelperObservation(events, runCreatedAt, retryCreatedAt) {
  const observed = inspectNativeHelperCancellation(events, runCreatedAt)
  if (observed?.helperStarts.length !== 2) throw new Error('NATIVE_RETRY_START_COUNT_UNCONFIRMED')
  const retryCreated = time(retryCreatedAt)
  const cancelledAt = time(observed.nativeCancelTerminalAt)
  if (retryCreated < time(observed.firstNativeStartedAt))
    throw new Error('NATIVE_RETRY_CREATED_BEFORE_FIRST_PROMPT')
  if (retryCreated >= cancelledAt) throw new Error('NATIVE_RETRY_QUEUE_OVERLAP_NOT_OBSERVED')
  const retryNativeStartedAt = observed.helperStarts[1]
  if (time(retryNativeStartedAt) < cancelledAt)
    throw new Error('NATIVE_RETRY_INVOKED_BEFORE_CANCEL_TERMINAL')
  return {
    acceptedBeforeNativeCancelTerminal: true,
    invokedOnlyAfterNativeCancelTerminal: true,
    retryCreatedAt,
    nativeCancelTerminalAt: observed.nativeCancelTerminalAt,
    retryNativeStartedAt,
  }
}

export function assertHelperEndpointObservations(endpoints, runCreatedAt, retryCreatedAt) {
  const expected = retryCreatedAt === undefined ? 1 : 2
  if (
    !Array.isArray(endpoints) ||
    endpoints.some(
      (endpoint) =>
        !['HELPER', ...(expected === 2 ? ['EVIDENCE_ANALYST'] : [])].includes(endpoint?.role) ||
        !/^native_[0-9a-f-]{36}$/.test(endpoint?.nativeJobId ?? '') ||
        !Number.isInteger(endpoint?.windowId) ||
        endpoint.windowId <= 0,
    ) ||
    new Set(endpoints.map((endpoint) => endpoint.nativeJobId)).size !== endpoints.length
  )
    throw new Error('NATIVE_CANCEL_ENDPOINT_SET_INVALID')
  const helpers = endpoints.filter((endpoint) => endpoint.role === 'HELPER')
  if (helpers.length !== expected) throw new Error('NATIVE_CANCEL_HELPER_ENDPOINT_COUNT_INVALID')
  if (endpoints.some((endpoint) => endpoint.windowId !== helpers[0].windowId))
    throw new Error('NATIVE_CANCEL_ENDPOINT_WINDOW_CHANGED')
  const created = [runCreatedAt, retryCreatedAt]
  if (helpers.some((endpoint, index) => time(endpoint.at) < time(created[index])))
    throw new Error('NATIVE_CANCEL_ENDPOINT_PRECEDES_RUN')
  if (
    endpoints.some(
      (endpoint) => endpoint.role === 'EVIDENCE_ANALYST' && time(endpoint.at) < time(helpers[1].at),
    )
  )
    throw new Error('NATIVE_CANCEL_ANALYST_PRECEDES_RECOVERY')
  return {
    helperCount: helpers.length,
    analystCount: endpoints.length - helpers.length,
    windowId: helpers[0].windowId,
  }
}
