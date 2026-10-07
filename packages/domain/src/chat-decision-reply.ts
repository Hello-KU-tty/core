import type { DecisionRequest } from '@vibe-helper/contracts'

export const CHAT_DECISION_REPLY_POLICY_VERSION = '1.0.0'

const MAX_RATIONALE_CHARS = 4_000

// An explicit selector only: "2번", "2.", "2)", "2:", "옵션 2", "option 2", or a bare "2".
// "2시간", "2 hours" and "24" are not selectors, so they never pick an option.
const OPTION_SELECTOR =
  /^\s*(?:(?:옵션|option)\s*)?([1-6])(?:\s*번(?:째)?|[.):,]|(?=\s*$))\s*(?:으로|로)?\s*/iu
const RECOMMENDATION_SELECTOR =
  /^\s*(?:추천(?:안|대로|한\s*(?:걸로|것으로))?|recommend(?:ed|ation)?)(?=[\s.,:)!]|$)[\s.,:)!]*/iu

export type ChatDecisionReply =
  | {
      readonly kind: 'RESOLVED'
      readonly selectionKind: 'OPTION' | 'RECOMMENDATION'
      readonly selectedOptionId: string
      readonly rationale?: string
    }
  | {
      readonly kind: 'UNRESOLVED'
      readonly reason: 'NO_EXPLICIT_SELECTION' | 'OPTION_OUT_OF_RANGE' | 'RATIONALE_TOO_LONG'
    }

function rationaleFrom(remainder: string): string | undefined | null {
  const trimmed = remainder.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > MAX_RATIONALE_CHARS) return null
  return trimmed
}

/**
 * Deterministically reads a learner's chat reply to an open Decision.
 * Only an explicit option number or "recommended" selector resolves it; the rest of the
 * learner's own text is kept verbatim as the rationale. Anything else stays unresolved so
 * that no Agent or heuristic chooses on the learner's behalf.
 */
export function parseChatDecisionReply(
  request: Pick<DecisionRequest, 'options' | 'recommendedOptionId'>,
  reply: string,
): ChatDecisionReply {
  const recommendation = RECOMMENDATION_SELECTOR.exec(reply)
  if (recommendation !== null) {
    const rationale = rationaleFrom(reply.slice(recommendation[0].length))
    if (rationale === null) return { kind: 'UNRESOLVED', reason: 'RATIONALE_TOO_LONG' }
    return {
      kind: 'RESOLVED',
      selectionKind: 'RECOMMENDATION',
      selectedOptionId: request.recommendedOptionId,
      ...(rationale === undefined ? {} : { rationale }),
    }
  }

  const option = OPTION_SELECTOR.exec(reply)
  if (option === null) return { kind: 'UNRESOLVED', reason: 'NO_EXPLICIT_SELECTION' }
  const selected = request.options[Number(option[1]) - 1]
  if (selected === undefined) return { kind: 'UNRESOLVED', reason: 'OPTION_OUT_OF_RANGE' }
  const rationale = rationaleFrom(reply.slice(option[0].length))
  if (rationale === null) return { kind: 'UNRESOLVED', reason: 'RATIONALE_TOO_LONG' }
  return {
    kind: 'RESOLVED',
    selectionKind: 'OPTION',
    selectedOptionId: selected.id,
    ...(rationale === undefined ? {} : { rationale }),
  }
}
