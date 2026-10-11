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

// Explicit option mentions anywhere in a message: "2번", "2번째", "옵션 2", "option 2", or a
// leading "2." / "2)". Durations and counts such as "2시간", "24", "2 hours" are not mentions.
const OPTION_MENTION =
  /(?<![0-9])([1-6])\s*번(?:째)?(?![0-9])|(?:옵션|option)\s*([1-6])(?![0-9])|^\s*([1-6])[.)](?![0-9])/giu

/**
 * Lists the Decision options a learner explicitly named by number in their own messages.
 * Core uses it only to reject a Builder mapping that contradicts a single explicit choice.
 */
export function findExplicitOptionMentions(
  request: { readonly options: readonly { readonly id: string }[] },
  messages: readonly string[],
): readonly string[] {
  const mentioned = new Set<string>()
  for (const message of messages) {
    for (const match of message.matchAll(OPTION_MENTION)) {
      const number = Number(match[1] ?? match[2] ?? match[3])
      const option = request.options[number - 1]
      if (option !== undefined) mentioned.add(option.id)
    }
  }
  return request.options.map((option) => option.id).filter((id) => mentioned.has(id))
}

// A reply that opens with one option number as the answer: "2번", "2번, 이유", "2번으로 해줘",
// "2번이요", "2번 할게". A negation or comparison right after the number ("1번 말고", "1번은
// 별로", "1번보다") is not an answer, and neither is "2번이 낫나?".
const CLEAR_OPTION_ANSWER =
  /^\s*(?:(?:옵션|option)\s*)?([1-6])\s*번(?:째)?(?:\s*(?:으로|로))?(?:\s*(?:이요|요|할게요?|할래요?|갈게요?|가자|해\s*줘|해요?|선택))?(?!\s*(?:말고|빼고|대신|보다|아니|별로|싫|은|는))\s*(?:$|[,.!~]|\s)/iu
const BARE_OPTION_ANSWER = /^\s*([1-6])\s*[.!]?\s*$/u

/**
 * The option a learner's reply clearly answers with, or undefined when the reply is not a plain
 * numbered answer (wavering, negation, comparison, a question, or two different numbers).
 * Core rejects a Builder record only against such a clear answer (K10); every other reply is
 * left to the Builder's reading and its one-sentence confirmation in chat.
 */
export function findClearOptionAnswer(
  request: { readonly options: readonly { readonly id: string }[] },
  reply: string,
): string | undefined {
  const match = CLEAR_OPTION_ANSWER.exec(reply) ?? BARE_OPTION_ANSWER.exec(reply)
  if (match === null) return undefined
  const option = request.options[Number(match[1]) - 1]
  if (option === undefined) return undefined
  const mentioned = findExplicitOptionMentions(request, [reply])
  if (mentioned.some((id) => id !== option.id)) return undefined
  return option.id
}
