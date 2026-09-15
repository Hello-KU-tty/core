/**
 * Native MCP input has arrived without collection fields. Whether the Agent
 * omitted them or transport dropped them is unknown. Restore only collections
 * that Core proves empty in the first Discovery Round. No other input changes.
 */
export async function restoreInitialDiscoveryEmptyCollections(binding, name, input, readContext) {
  if (
    binding.role !== 'DISCOVERY' ||
    name !== 'submit_candidate_round' ||
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    input.expectedSessionRevision !== 1 ||
    input.projectId !== binding.projectId ||
    input.discoverySessionId !== binding.discoverySessionId ||
    input.correlationId !== binding.correlationId ||
    (input.appliedFeedbackIds !== undefined && input.carriedCandidates !== undefined)
  )
    return { input, restored: [] }
  const context = await readContext()
  if (
    context?.project?.id !== binding.projectId ||
    context?.session?.id !== binding.discoverySessionId ||
    context?.session?.correlationId !== binding.correlationId ||
    context?.session?.revision !== 1 ||
    context?.session?.status !== 'ACTIVE' ||
    !Array.isArray(context.rounds) ||
    context.rounds.length !== 0 ||
    !Array.isArray(context.feedback) ||
    context.feedback.length !== 0
  )
    throw new Error('BRIDGE_INITIAL_DISCOVERY_STATE_UNVERIFIED')
  const restored = []
  const output = { ...input }
  if (input.appliedFeedbackIds === undefined) {
    output.appliedFeedbackIds = []
    restored.push('appliedFeedbackIds')
  }
  if (input.carriedCandidates === undefined) {
    output.carriedCandidates = []
    restored.push('carriedCandidates')
  }
  return { input: output, restored }
}

/** An absent carry list means empty only for a verified, narrowing target refinement. */
export async function restoreDiscoveryEmptyCollections(binding, name, input, readContext) {
  const initial = await restoreInitialDiscoveryEmptyCollections(binding, name, input, readContext)
  if (initial.restored.length > 0) return initial
  if (
    binding.role !== 'DISCOVERY' ||
    name !== 'submit_candidate_round' ||
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !Number.isSafeInteger(input.expectedSessionRevision) ||
    input.expectedSessionRevision <= 1 ||
    input.projectId !== binding.projectId ||
    input.discoverySessionId !== binding.discoverySessionId ||
    input.correlationId !== binding.correlationId ||
    input.carriedCandidates !== undefined ||
    !Array.isArray(input.appliedFeedbackIds)
  )
    return { ...initial, skipReason: 'ROUND_INPUT_SCOPE_OR_SHAPE' }

  // The role-bound MCP transport accepts an array or one bounded JSON-encoded
  // array. Inspect only the collection shape; Core still parses and validates
  // every Agent-authored Candidate, and receives the original field unchanged.
  const candidates = input.candidates
  let candidateCount
  if (Array.isArray(candidates)) candidateCount = candidates.length
  else if (typeof candidates === 'string' && Buffer.byteLength(candidates, 'utf8') <= 512 * 1024) {
    try {
      const parsed = JSON.parse(candidates)
      if (Array.isArray(parsed)) candidateCount = parsed.length
    } catch {
      // Leave malformed input to Core's normal schema rejection.
    }
  }
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 1 || candidateCount > 30)
    return { ...initial, skipReason: 'ROUND_CANDIDATES_SHAPE_UNVERIFIED' }

  const context = await readContext()
  if (
    context?.project?.id !== binding.projectId ||
    context?.session?.id !== binding.discoverySessionId ||
    context?.session?.correlationId !== binding.correlationId ||
    context?.session?.revision !== input.expectedSessionRevision ||
    context?.session?.status !== 'ACTIVE' ||
    !Array.isArray(context.rounds) ||
    context.rounds.length === 0 ||
    !context.rounds.every((round) => Array.isArray(round.appliedFeedbackIds)) ||
    !Array.isArray(context.feedback)
  )
    return { ...initial, skipReason: 'ROUND_CORE_CONTEXT_UNVERIFIED' }
  const previousRound = context.rounds.at(-1)
  const pending = context.feedback.filter(
    (feedback) => feedback.roundId === previousRound.id && feedback.intent !== 'SELECT',
  )
  const alreadyApplied = new Set(context.rounds.flatMap((round) => round.appliedFeedbackIds))
  if (
    pending.length === 0 ||
    pending.some((feedback) => alreadyApplied.has(feedback.id)) ||
    !pending.every((feedback) => ['REVISE', 'SHRINK', 'EXPAND'].includes(feedback.intent)) ||
    pending.length !== input.appliedFeedbackIds.length ||
    new Set(input.appliedFeedbackIds).size !== pending.length ||
    !pending.every((feedback) => input.appliedFeedbackIds.includes(feedback.id))
  )
    return { ...initial, skipReason: 'ROUND_PENDING_FEEDBACK_UNVERIFIED' }
  return { input: { ...input, carriedCandidates: [] }, restored: ['carriedCandidates'] }
}
