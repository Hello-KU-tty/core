const { randomUUID } = require('node:crypto')
const uiMetadata = correlationId => ({
  schemaVersion: 1, actor: { kind: 'UI' }, correlationId: correlationId ?? `corr_${randomUUID()}`,
})

async function readFailedAnalysisJobs(client, projectId) {
  return client.execute({
    ...uiMetadata(), kind: 'UI_READ_ANALYSIS_JOBS', projectId, status: 'FAILED', limit: 100,
  })
}

async function retryFailedAnalysis(client, projectId, analysisJobId) {
  const jobs = await readFailedAnalysisJobs(client, projectId)
  const job = jobs.find(job => job.id === analysisJobId && job.projectId === projectId && job.status === 'FAILED')
  if (!job) throw new Error('FAILED_ANALYSIS_JOB_REQUIRED')
  return client.execute({
    ...uiMetadata(job.correlationId), kind: 'UI_RETRY_ANALYSIS', idempotencyKey: `idem_${randomUUID()}`,
    projectId, analysisJobId: job.id, expectedJobRevision: job.revision,
  })
}

module.exports = { readFailedAnalysisJobs, retryFailedAnalysis }
