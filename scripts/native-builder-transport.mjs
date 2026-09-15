// Kiro-specific wire repair for one redundant, Core-owned collection. Never
// invent Agent-authored Context text, files, Concepts, or Decision outcomes.
export async function restoreCoreProvenEmptyActiveDecisions(binding, name, input, readTask) {
  if (
    binding.role !== 'BUILDER' ||
    name !== 'update_build_context' ||
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    input.projectId !== binding.projectId ||
    input.taskId !== binding.taskId ||
    input.correlationId !== binding.correlationId ||
    Object.hasOwn(input, 'activeDecisionIds') ||
    !Number.isSafeInteger(input.expectedPreviousVersion) ||
    input.expectedPreviousVersion < 0 ||
    !Array.isArray(input.relatedFiles)
  )
    return { input, restored: [], skipReason: 'INPUT_NOT_ELIGIBLE' }

  const state = await readTask()
  if (
    state?.correlationId !== binding.correlationId ||
    state?.project?.id !== binding.projectId ||
    state?.learningSpec?.status !== 'CONFIRMED' ||
    state?.task?.id !== binding.taskId ||
    state?.task?.projectId !== binding.projectId ||
    state?.task?.correlationId !== binding.correlationId ||
    state?.task?.status !== 'ACTIVE' ||
    !Array.isArray(state.decisionRequests) ||
    !Array.isArray(state.decisionResolutions) ||
    !Array.isArray(state.decisionApplications)
  )
    return { input, restored: [], skipReason: 'CORE_SCOPE_UNVERIFIED' }

  const currentVersion = state.liveContext?.contextVersion ?? 0
  if (
    currentVersion !== input.expectedPreviousVersion ||
    (currentVersion === 0 && (state.liveContext !== null || input.checkpoint !== 'TASK_STARTED')) ||
    (currentVersion > 0 &&
      (state.liveContext?.id === undefined ||
        state.liveContext.projectId !== binding.projectId ||
        state.liveContext.taskId !== binding.taskId ||
        state.liveContext.correlationId !== binding.correlationId ||
        input.checkpoint === 'TASK_STARTED'))
  )
    return { input, restored: [], skipReason: 'CONTEXT_VERSION_OR_SCOPE_MISMATCH' }

  const requestIds = new Set()
  for (const decision of state.decisionRequests) {
    if (
      typeof decision?.id !== 'string' ||
      requestIds.has(decision.id) ||
      decision.projectId !== binding.projectId ||
      decision.taskId !== binding.taskId ||
      decision.correlationId !== binding.correlationId
    )
      return { input, restored: [], skipReason: 'DECISION_HISTORY_INVALID' }
    requestIds.add(decision.id)
  }
  const appliedIds = new Set()
  const resolutionDecisionIds = new Map()
  for (const resolution of state.decisionResolutions) {
    if (
      typeof resolution?.id !== 'string' ||
      typeof resolution?.decisionId !== 'string' ||
      !requestIds.has(resolution.decisionId) ||
      resolutionDecisionIds.has(resolution.id) ||
      resolution.projectId !== binding.projectId ||
      resolution.taskId !== binding.taskId ||
      resolution.correlationId !== binding.correlationId
    )
      return { input, restored: [], skipReason: 'DECISION_HISTORY_INVALID' }
    resolutionDecisionIds.set(resolution.id, resolution.decisionId)
  }
  for (const application of state.decisionApplications) {
    if (
      typeof application?.decisionId !== 'string' ||
      typeof application?.resolutionId !== 'string' ||
      resolutionDecisionIds.get(application.resolutionId) !== application.decisionId ||
      !requestIds.has(application.decisionId) ||
      appliedIds.has(application.decisionId) ||
      application.projectId !== binding.projectId ||
      application.taskId !== binding.taskId ||
      application.correlationId !== binding.correlationId
    )
      return { input, restored: [], skipReason: 'DECISION_HISTORY_INVALID' }
    appliedIds.add(application.decisionId)
  }
  if ([...requestIds].some((id) => !appliedIds.has(id)))
    return { input, restored: [], skipReason: 'ACTIVE_DECISION_EXISTS' }

  // The authoritative requested-minus-applied set is empty. The stored Live
  // Context may be stale (an Agent once reintroduced an applied ID), so the
  // read version and the Core update's expectedPreviousVersion must match.
  return { input: { ...input, activeDecisionIds: [] }, restored: ['activeDecisionIds'] }
}
