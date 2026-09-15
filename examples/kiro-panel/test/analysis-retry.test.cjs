const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFailedAnalysisJobs, retryFailedAnalysis } = require('../src/analysis-retry.cjs')

const projectId = 'project_00000000-0000-4000-8000-000000000001'
const job = {
  id: 'analysis_job_00000000-0000-4000-8000-000000000002',
  projectId,
  correlationId: 'corr_00000000-0000-4000-8000-000000000003',
  revision: 5,
  status: 'FAILED',
}

test('reads only failed jobs for the selected project', async () => {
  const requests = []
  const client = { execute: async request => { requests.push(request); return [job] } }
  assert.deepEqual(await readFailedAnalysisJobs(client, projectId), [job])
  assert.equal(requests.length, 1)
  assert.deepEqual({ kind: requests[0].kind, projectId: requests[0].projectId, status: requests[0].status, limit: requests[0].limit },
    { kind: 'UI_READ_ANALYSIS_JOBS', projectId, status: 'FAILED', limit: 100 })
})

test('retries the exact failed job at its current revision without creating evidence', async () => {
  const requests = []
  const client = { execute: async request => {
    requests.push(request)
    return request.kind === 'UI_READ_ANALYSIS_JOBS' ? [job] : { ...job, status: 'PENDING', revision: 6 }
  } }
  const result = await retryFailedAnalysis(client, projectId, job.id)
  assert.equal(result.status, 'PENDING')
  assert.equal(requests.length, 2)
  assert.deepEqual({ kind: requests[1].kind, projectId: requests[1].projectId, analysisJobId: requests[1].analysisJobId,
    expectedJobRevision: requests[1].expectedJobRevision, correlationId: requests[1].correlationId },
  { kind: 'UI_RETRY_ANALYSIS', projectId, analysisJobId: job.id, expectedJobRevision: 5, correlationId: job.correlationId })
})

test('rejects a job outside the selected failed-job set without issuing a retry', async () => {
  for (const jobs of [[{ ...job, projectId: 'project_00000000-0000-4000-8000-000000000004' }], [{ ...job, status: 'SUCCEEDED' }], []]) {
    const requests = []
    const client = { execute: async request => { requests.push(request); return jobs } }
    await assert.rejects(retryFailedAnalysis(client, projectId, job.id), /FAILED_ANALYSIS_JOB_REQUIRED/)
    assert.equal(requests.length, 1)
  }
})
