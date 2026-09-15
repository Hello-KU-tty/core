const { randomUUID } = require('node:crypto')

const PROJECT_ID = /^project_[0-9a-f-]{36}$/
const TASK_ID = /^task_[0-9a-f-]{36}$/
const CORRELATION_ID = /^corr_[0-9a-f-]{36}$/
const ARM_TTL_MS = 10 * 60 * 1000
const CAPTURE_TTL_MS = 5 * 60 * 1000
const MAX_PROMPT_BYTES = 400_000

function createProtectedHelperCapture(now = Date.now) {
  let armed = null
  let pending = null
  let completed = null
  let expiryTimer = null

  const clearTimer = () => {
    if (expiryTimer !== null) clearTimeout(expiryTimer)
    expiryTimer = null
  }
  const clear = () => {
    clearTimer()
    armed = null
    pending = null
    completed = null
  }
  const schedule = (expiresAt) => {
    clearTimer()
    expiryTimer = setTimeout(clear, Math.max(0, expiresAt - now()))
    expiryTimer.unref?.()
  }
  const arm = ({ projectId, taskId, workspace, helper }) => {
    if (!PROJECT_ID.test(projectId) || typeof workspace !== 'string' ||
        !TASK_ID.test(taskId) || typeof helper !== 'string' ||
        !workspace || !helper || workspace === helper)
      throw new Error('NATIVE_HELPER_CAPTURE_SCOPE_INVALID')
    clear()
    armed = { projectId, taskId, workspace, helper, expiresAt: now() + ARM_TTL_MS }
    schedule(armed.expiresAt)
    return { expiresAt: new Date(armed.expiresAt).toISOString() }
  }
  const begin = (job, windowId) => {
    if (!armed) return null
    if (now() >= armed.expiresAt || job.projectId !== armed.projectId ||
        job.taskId !== armed.taskId ||
        job.projectWorkspace !== armed.workspace ||
        (job.helperHostWorkspace || job.workspace) !== armed.helper ||
        !TASK_ID.test(job.taskId) ||
        !CORRELATION_ID.test(job.correlationId) ||
        !Number.isInteger(windowId) || windowId <= 0) {
      clear()
      return null
    }
    const token = randomUUID()
    pending = {
      token, projectId: job.projectId, taskId: job.taskId,
      correlationId: job.correlationId, nativeJobId: job.id,
      uiWindowId: windowId,
    }
    armed = null
    clearTimer()
    return token
  }
  const abort = (token) => {
    if (token !== null && pending?.token === token) clear()
  }
  const complete = (token, prompt) => {
    if (token === null || pending?.token !== token) return false
    if (typeof prompt !== 'string' || !prompt.trim() ||
        Buffer.byteLength(prompt, 'utf8') > MAX_PROMPT_BYTES) {
      clear()
      return false
    }
    const capturedAt = now()
    completed = {
      projectId: pending.projectId, taskId: pending.taskId,
      correlationId: pending.correlationId, nativeJobId: pending.nativeJobId,
      uiWindowId: pending.uiWindowId, prompt,
      capturedAt: new Date(capturedAt).toISOString(),
      expiresAt: new Date(capturedAt + CAPTURE_TTL_MS).toISOString(),
    }
    pending = null
    schedule(capturedAt + CAPTURE_TTL_MS)
    return true
  }
  const available = (projectId) => {
    if (!completed) return false
    if (now() >= Date.parse(completed.expiresAt)) { clear(); return false }
    return completed.projectId === projectId
  }
  const take = (projectId) => {
    if (!available(projectId)) throw new Error('NATIVE_HELPER_CAPTURE_UNAVAILABLE')
    const value = completed
    clear()
    return value
  }
  return { arm, begin, abort, complete, available, take, clear }
}

module.exports = { createProtectedHelperCapture, ARM_TTL_MS, CAPTURE_TTL_MS }
