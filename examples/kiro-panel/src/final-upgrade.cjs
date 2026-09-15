// UI discovery only. ApplicationService rechecks the complete sequence-2 gate
// and owns Task creation; this helper never treats a trace as learned state.
function eligibleFinalUpgradeTraces(snapshot, evidenceTrace) {
  const task = snapshot?.currentTask
  if (snapshot?.project?.status !== 'BUILDING' || task?.status !== 'COMPLETED' ||
      task.sequence !== 1 || task.finalUpgrade !== undefined ||
      snapshot?.completionReport?.taskId !== task.id ||
      !Array.isArray(evidenceTrace?.personalization)) return []
  return evidenceTrace.personalization.filter(trace =>
    trace?.projectId === snapshot.project.id &&
    trace?.target?.kind === 'HELPER_TURN' &&
    trace.target.taskId === task.id &&
    trace.mode === 'EVIDENCE_AWARE' &&
    Array.isArray(trace.basis) && trace.basis.length > 0 &&
    typeof trace.id === 'string' && typeof trace.createdAt === 'string')
    .map(trace => ({ id: trace.id, createdAt: trace.createdAt, basisCount: trace.basis.length }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

module.exports = { eligibleFinalUpgradeTraces }
