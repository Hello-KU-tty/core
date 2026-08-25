import { type ActivityEvent, type Episode, episodeSchema } from '@vibe-helper/contracts'

import { applied, type DomainResult, noOp, rejected } from './result.js'
import { compareUtc, sameValue, uniqueStrings } from './utils.js'

const OPERATION = 'EPISODE_CLOSE'

export interface CloseEpisodeInput {
  readonly current: Episode
  readonly proposed: unknown
  readonly events: readonly ActivityEvent[]
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
