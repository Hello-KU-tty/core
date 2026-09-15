function fail(code) { return Object.assign(new Error(code), { code }) }

const TERMINAL_RUNS = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED'])

async function assertNativeCoreIdle(client, projectId, taskId, uiMetadata) {
  if (!client || typeof client.health !== 'function' ||
      typeof client.listProjects !== 'function' ||
      typeof client.listRuns !== 'function' ||
      typeof client.restoreProject !== 'function' ||
      typeof client.execute !== 'function' ||
      typeof uiMetadata !== 'function')
    throw fail('HELPER_ABLATION_IDLE_DEPENDENCIES_INVALID')
  await client.health()
  const history = await client.listProjects(50)
  if (!Array.isArray(history?.projects) || history.projects.length >= 50 ||
      !history.projects.some(entry => entry?.project?.id === projectId))
    throw fail('HELPER_ABLATION_PROJECT_SET_UNCONFIRMED')
  const snapshot = await client.restoreProject(projectId)
  if (snapshot?.currentTask?.id !== taskId)
    throw fail('HELPER_ABLATION_TASK_DRIFT')
  for (const entry of history.projects) {
    const id = entry?.project?.id
    if (typeof id !== 'string') throw fail('HELPER_ABLATION_PROJECT_SET_UNCONFIRMED')
    const runs = await client.listRuns(id)
    if (!Array.isArray(runs) || runs.some(run => !TERMINAL_RUNS.has(run.status)))
      throw fail('HELPER_ABLATION_BACKEND_RUN_ACTIVE')
    for (const status of ['PENDING', 'RUNNING']) {
      const jobs = await client.execute({ ...uiMetadata(),
        kind: 'UI_READ_ANALYSIS_JOBS', projectId: id, status, limit: 1 })
      if (!Array.isArray(jobs) || jobs.length > 0)
        throw fail('HELPER_ABLATION_ANALYST_ACTIVE')
    }
  }
  return true
}

async function assertNativeHelperAblationIdle(client, lease, projectId, taskId,
  uiMetadata) {
  if (!lease?.assertIdle?.()) throw fail('HELPER_ABLATION_WORKER_NOT_IDLE')
  await assertNativeCoreIdle(client, projectId, taskId, uiMetadata)
  if (!lease.assertIdle()) throw fail('HELPER_ABLATION_WORKER_NOT_IDLE')
  return { workerIdle: true, backendIdle: true }
}

module.exports = { assertNativeCoreIdle, assertNativeHelperAblationIdle }
