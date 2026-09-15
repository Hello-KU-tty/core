// Core returns a project-scoped, redacted trace. Bound and redact its explanatory
// text again before passing it to the panel, which renders it with textContent.
function displayText(value, redactText, limit = 320) {
  if (typeof value !== 'string') return null
  const redacted = redactText(value)
  return redacted.length > limit ? `${redacted.slice(0, limit)}…` : redacted
}

function summarizeEvidenceTrace(projectId, trace, redactText) {
  if (typeof redactText !== 'function') throw new Error('EVIDENCE_TRACE_REDACTOR_REQUIRED')
  if (trace?.projectId !== projectId || !Array.isArray(trace.concepts) ||
      !Array.isArray(trace.analysis) || !Array.isArray(trace.personalization))
    throw new Error('EVIDENCE_TRACE_PROJECT_MISMATCH')
  return {
    concepts: trace.concepts.map(concept => ({
      id: concept.conceptId,
      name: concept.conceptName,
      state: concept.state,
      stateRevision: concept.stateRevision,
      accepted: concept.evidence.map(item => ({
        id: item.evidenceId,
        kind: item.kind,
        sourceProjectId: item.projectId,
        taskId: item.taskId ?? null,
        episodeId: item.episodeId,
        episodeType: item.episodeType,
        supportsState: item.supportsState ?? null,
        signal: item.signal ?? null,
        strength: item.strength ?? null,
        promptDependence: item.promptDependence ?? null,
        excerpt: displayText(item.redactedEvidenceExcerpt, redactText),
        rationale: displayText(item.rationale, redactText),
      })),
      rejected: concept.rejectedEvidence.map(item => ({
        proposalId: item.proposalId,
        decisionId: item.evidenceDecisionId,
        sourceProjectId: item.projectId,
        episodeId: item.episodeId,
        reasonCode: item.reasonCode,
        excerpt: displayText(item.redactedEvidenceExcerpt, redactText),
        explanation: displayText(item.explanation, redactText),
      })),
    })),
    analysis: trace.analysis.map(item => ({
      jobId: item.analysisJobId,
      episodeId: item.episodeId,
      status: item.status,
      failureCode: item.lastFailure?.code ?? null,
    })),
    personalization: trace.personalization.map(item => ({
      id: item.id,
      mode: item.mode,
      target: item.target,
      createdAt: item.createdAt,
      basis: item.basis.map(basis => ({
        conceptId: basis.conceptId,
        state: basis.state,
        evidenceIds: basis.evidenceIds,
        episodeIds: basis.episodeIds,
        sourceProjectIds: basis.sourceProjectIds,
        purpose: basis.purpose,
        excerpt: displayText(basis.redactedEvidenceExcerpt, redactText),
      })),
    })),
    emptyReason: trace.emptyReason ?? null,
  }
}

module.exports = { summarizeEvidenceTrace }
