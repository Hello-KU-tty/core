function restartDiscoveryInput(snapshot, goal, need) {
  if (snapshot?.project?.status !== 'SPEC_REVIEW' ||
      snapshot?.discoverySession?.status !== 'SELECTED' ||
      !snapshot.learningSpec) throw new Error('LEARNING_SPEC_REVIEW_NOT_ACTIVE')
  if (typeof goal !== 'string' || typeof need !== 'string') throw new Error('DISCOVERY_INPUT_REQUIRED')
  const learningGoal = goal.trim()
  const personalNeed = need.trim()
  if (!learningGoal || learningGoal.length > 240) throw new Error('DISCOVERY_GOAL_REQUIRED')
  if (personalNeed.length > 4_000) throw new Error('DISCOVERY_NEED_TOO_LONG')
  const input = { ...snapshot.discoverySession.input, learningGoal }
  if (personalNeed) input.personalNeed = personalNeed
  else delete input.personalNeed
  return input
}

module.exports = { restartDiscoveryInput }
