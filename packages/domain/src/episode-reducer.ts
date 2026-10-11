import { type ActivityEvent, type Episode, episodeSchema } from '@vibe-helper/contracts'

import { applied, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue, uniqueStrings } from './utils.js'

const OPERATION = 'EPISODE_CLOSE'

export interface CloseEpisodeInput {
  readonly current: Episode
  readonly proposed: unknown
  readonly events: readonly ActivityEvent[]
}

export interface AppendEpisodeEventInput {
  readonly current: Episode
  readonly event: ActivityEvent
}

export function appendEpisodeEvent(input: AppendEpisodeEventInput): DomainResult<Episode> {
  const entityIds = [input.current.id, input.event.id]
  if (input.current.status !== 'OPEN') {
    return rejected({
      operation: 'EPISODE_EVENT_APPEND',
      reasonCode: 'EPISODE_NOT_OPEN',
      entityIds,
    })
  }
  if (input.current.eventIds.includes(input.event.id)) {
    return noOp(input.current, {
      operation: 'EPISODE_EVENT_APPEND',
      reasonCode: 'EPISODE_EVENT_DUPLICATE',
      entityIds,
    })
  }
  if (
    input.event.projectId !== input.current.projectId ||
    input.event.correlationId !== input.current.correlationId ||
    (input.current.taskId !== undefined && input.event.taskId !== input.current.taskId) ||
    (input.current.decisionId !== undefined &&
      input.event.decisionId !== undefined &&
      input.event.decisionId !== input.current.decisionId) ||
    (input.current.conversationId !== undefined &&
      input.event.conversationId !== undefined &&
      input.event.conversationId !== input.current.conversationId) ||
    compareUtc(input.event.occurredAt, input.current.startedAt) < 0
  ) {
    return rejected({
      operation: 'EPISODE_EVENT_APPEND',
      reasonCode: 'EPISODE_EVENT_SCOPE_INVALID',
      entityIds,
    })
  }
  const next = episodeSchema.parse({
    ...input.current,
    revision: input.current.revision + 1,
    eventIds: [...input.current.eventIds, input.event.id],
  })
  return applied(next, {
    operation: 'EPISODE_EVENT_APPEND',
    reasonCode: 'EPISODE_EVENT_APPENDED',
    entityIds,
    supportingIds: next.eventIds,
  })
}

const LINKABLE_CHAT_EVENT_TYPES: ReadonlySet<ActivityEvent['payload']['type']> = new Set([
  'USER_MESSAGE',
  'HELPER_RESPONSE',
  'BUILDER_CHAT_TURN',
])

export interface LinkEpisodeChatEventsInput {
  readonly current: Episode
  /** The Episode's own events, so the linked result keeps activity order. */
  readonly currentEvents: readonly ActivityEvent[]
  readonly events: readonly ActivityEvent[]
}

/**
 * Links chat events of the same Task to an open Decision Episode (K10): the learner's messages
 * from before the question and from the Helper tab, with the Agent replies around them, so the
 * Analyst reads the choice with what the learner said. A linked event may be older than the
 * Episode; the Episode then starts at its earliest event. Events are kept in activity order.
 */
export function linkEpisodeChatEvents(input: LinkEpisodeChatEventsInput): DomainResult<Episode> {
  const operation = 'EPISODE_CHAT_EVENTS_LINK'
  const entityIds = [input.current.id, ...input.events.map((event) => event.id)]
  if (input.current.status !== 'OPEN' || input.current.type !== 'DECISION') {
    return rejected({ operation, reasonCode: 'EPISODE_NOT_OPEN', entityIds })
  }
  if (
    input.currentEvents.length !== input.current.eventIds.length ||
    input.currentEvents.some((event) => !input.current.eventIds.includes(event.id))
  ) {
    return rejected({ operation, reasonCode: 'EPISODE_EVENT_SET_INVALID', entityIds })
  }
  for (const event of input.events) {
    if (
      !LINKABLE_CHAT_EVENT_TYPES.has(event.payload.type) ||
      event.projectId !== input.current.projectId ||
      event.correlationId !== input.current.correlationId ||
      input.current.taskId === undefined ||
      event.taskId !== input.current.taskId ||
      (event.decisionId !== undefined && event.decisionId !== input.current.decisionId)
    ) {
      return rejected({ operation, reasonCode: 'EPISODE_EVENT_SCOPE_INVALID', entityIds })
    }
  }
  const added = input.events.filter((event) => !input.current.eventIds.includes(event.id))
  if (added.length === 0) {
    return noOp(input.current, { operation, reasonCode: 'EPISODE_EVENT_DUPLICATE', entityIds })
  }
  const ordered = [...input.currentEvents, ...added].sort(
    (left, right) => left.sequence - right.sequence,
  )
  const earliest = ordered.reduce(
    (start, event) => (compareUtc(event.occurredAt, start) < 0 ? event.occurredAt : start),
    input.current.startedAt,
  )
  const next = episodeSchema.parse({
    ...input.current,
    revision: input.current.revision + 1,
    startedAt: earliest,
    eventIds: ordered.map((event) => event.id),
  })
  return applied(next, {
    operation,
    reasonCode: 'EPISODE_CHAT_EVENTS_LINKED',
    entityIds,
    supportingIds: next.eventIds,
  })
}

export interface TransitionEpisodeAnalysisInput {
  readonly current: Episode
  readonly status: 'PENDING_ANALYSIS' | 'ANALYZED' | 'ANALYSIS_FAILED'
  readonly changedAt: string
  readonly closeReason?: string
}

export function transitionEpisodeAnalysis(
  input: TransitionEpisodeAnalysisInput,
): DomainResult<Episode> {
  const allowed =
    (input.current.status === 'PENDING_ANALYSIS' &&
      (input.status === 'ANALYZED' || input.status === 'ANALYSIS_FAILED')) ||
    (input.current.status === 'ANALYSIS_FAILED' && input.status === 'PENDING_ANALYSIS')
  if (!allowed) {
    return rejected({
      operation: 'EPISODE_ANALYSIS_TRANSITION',
      reasonCode: 'EPISODE_ANALYSIS_TRANSITION_NOT_ALLOWED',
      entityIds: [input.current.id],
    })
  }
  const next = episodeSchema.parse({
    ...input.current,
    revision: input.current.revision + 1,
    status: input.status,
    endedAt: input.current.endedAt ?? input.changedAt,
    closeReason:
      input.closeReason ?? input.current.closeReason ?? 'Episode analysis state changed.',
  })
  return applied(next, {
    operation: 'EPISODE_ANALYSIS_TRANSITION',
    reasonCode: 'EPISODE_ANALYSIS_TRANSITIONED',
    entityIds: [next.id],
    before: input.current.status,
    after: next.status,
  })
}

function immutableEpisodeContent(episode: Episode): unknown {
  const {
    revision: _revision,
    status: _status,
    eventIds: _eventIds,
    endedAt: _endedAt,
    closeReason: _closeReason,
    ...immutable
  } = episode
  return immutable
}

export function closeEpisode(input: CloseEpisodeInput): DomainResult<Episode> {
  const parsed = episodeSchema.safeParse(input.proposed)
  if (!parsed.success)
    return rejected({ operation: OPERATION, reasonCode: 'EPISODE_INVALID_SCHEMA' })
  const proposed = parsed.data
  const entityIds = [input.current.id]
  if (sameValue(input.current, proposed)) {
    return noOp(input.current, { operation: OPERATION, reasonCode: 'EPISODE_DUPLICATE', entityIds })
  }
  if (input.current.status !== 'OPEN' || proposed.status !== 'PENDING_ANALYSIS') {
    return rejected({
      operation: OPERATION,
      reasonCode: 'EPISODE_TRANSITION_NOT_ALLOWED',
      entityIds,
    })
  }
  if (
    proposed.id !== input.current.id ||
    proposed.revision !== input.current.revision + 1 ||
    !sameValue(immutableEpisodeContent(input.current), immutableEpisodeContent(proposed))
  ) {
    return rejected({ operation: OPERATION, reasonCode: 'EPISODE_REVISION_CONFLICT', entityIds })
  }
  if (!uniqueStrings(proposed.eventIds) || proposed.eventIds.length !== input.events.length) {
    return rejected({ operation: OPERATION, reasonCode: 'EPISODE_EVENT_SET_INVALID', entityIds })
  }
  const eventsById = new Map(input.events.map((event) => [event.id, event]))
  const orderedEvents: ActivityEvent[] = []
  for (const eventId of proposed.eventIds) {
    const event = eventsById.get(eventId)
    if (event === undefined) {
      return rejected({ operation: OPERATION, reasonCode: 'EPISODE_EVENT_NOT_FOUND', entityIds })
    }
    orderedEvents.push(event)
  }
  for (const [index, event] of orderedEvents.entries()) {
    const previous = orderedEvents[index - 1]
    if (
      event.projectId !== proposed.projectId ||
      event.correlationId !== proposed.correlationId ||
      (proposed.taskId !== undefined && event.taskId !== proposed.taskId) ||
      (proposed.decisionId !== undefined &&
        event.decisionId !== undefined &&
        event.decisionId !== proposed.decisionId) ||
      (proposed.conversationId !== undefined &&
        event.conversationId !== undefined &&
        event.conversationId !== proposed.conversationId) ||
      (previous !== undefined && event.sequence <= previous.sequence) ||
      compareUtc(event.occurredAt, proposed.startedAt) < 0 ||
      (proposed.endedAt !== undefined && compareUtc(event.occurredAt, proposed.endedAt) > 0)
    ) {
      return rejected({
        operation: OPERATION,
        reasonCode: 'EPISODE_EVENT_SCOPE_INVALID',
        entityIds,
      })
    }
  }
  return applied(proposed, {
    operation: OPERATION,
    reasonCode: 'EPISODE_CLOSED',
    entityIds,
    before: input.current.status,
    after: proposed.status,
    supportingIds: proposed.eventIds,
  })
}
