const { test } = require('node:test')
const assert = require('node:assert/strict')
const { summarizeEvidenceTrace } = require('../src/evidence-view.cjs')
const redactor = import('../../../packages/application/dist/redaction.js')

test('keeps provenance and bounded explanations while redacting secrets again', async () => {
  const { redactSensitiveText: redact } = await redactor
  const trace = {
    projectId: 'project_1',
    concepts: [{ conceptId: 'concept_1', conceptName: 'Map and Set', state: 'EXPLAINED',
      stateRevision: 1,
      evidence: [{ evidenceId: 'evidence_1', kind: 'USER_UNDERSTANDING',
        projectId: 'project_1', taskId: 'task_1', episodeId: 'episode_1',
        episodeType: 'USER_DECISION', supportsState: 'EXPLAINED',
        redactedEvidenceExcerpt: 'I compared both cases. token=fixture-secret',
        rationale: 'Shows an independent comparison.' }],
      rejectedEvidence: [{ proposalId: 'proposal_1', evidenceDecisionId: 'decision_1',
        projectId: 'project_1', episodeId: 'episode_2', reasonCode: 'INVALID_REFERENCE',
        redactedEvidenceExcerpt: 'The proposed state was too strong.',
        explanation: 'The reference is invalid. Bearer fixture-secret' }],
    }],
    analysis: [{ analysisJobId: 'job_1', episodeId: 'episode_1', status: 'SUCCEEDED' }],
    personalization: [{ id: 'trace_1', mode: 'EVIDENCE_AWARE',
      target: { kind: 'HELPER_TURN', taskId: 'task_1' }, createdAt: '2026-09-13T15:00:00Z',
      basis: [{ conceptId: 'concept_1', state: 'EXPLAINED', evidenceIds: ['evidence_1'],
        episodeIds: ['episode_1'], sourceProjectIds: ['project_1'],
        purpose: 'HELPER_EXPLANATION_START', redactedEvidenceExcerpt: 'Use the prior comparison.' }] }],
  }
  const view = summarizeEvidenceTrace('project_1', trace, redact)
  assert.equal(view.concepts[0].accepted[0].id, 'evidence_1')
  assert.equal(view.concepts[0].rejected[0].reasonCode, 'INVALID_REFERENCE')
  assert.deepEqual(view.personalization[0].basis[0].evidenceIds, ['evidence_1'])
  assert.match(view.concepts[0].accepted[0].excerpt, /I compared both cases/)
  assert.match(view.concepts[0].accepted[0].rationale, /independent comparison/)
  assert.match(view.concepts[0].rejected[0].explanation, /reference is invalid/)
  assert.match(view.personalization[0].basis[0].excerpt, /prior comparison/)
  assert(!JSON.stringify(view).includes('fixture-secret'))
  assert.equal(view.concepts[0].accepted[0].excerpt, 'I compared both cases. token=[REDACTED]')
  assert.throws(() => summarizeEvidenceTrace('project_2', trace, redact), /EVIDENCE_TRACE_PROJECT_MISMATCH/)
})

test('bounds long explanation text after redaction', async () => {
  const { redactSensitiveText: redact } = await redactor
  const trace = { projectId: 'project_1', concepts: [{ conceptId: 'concept_1', conceptName: 'A',
    state: null, stateRevision: null, evidence: [], rejectedEvidence: [{ proposalId: 'proposal_1',
      evidenceDecisionId: 'decision_1', projectId: 'project_1', episodeId: 'episode_1',
      reasonCode: 'INVALID_SCHEMA', explanation: 'x'.repeat(4000),
      redactedEvidenceExcerpt: 'some excerpt' }] }], analysis: [], personalization: [] }
  const explanation = summarizeEvidenceTrace('project_1', trace, redact).concepts[0].rejected[0].explanation
  assert.equal(explanation.length, 321)
  assert(explanation.endsWith('…'))
})
