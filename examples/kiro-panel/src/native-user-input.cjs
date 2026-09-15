const { createHash, randomUUID } = require('node:crypto')

const fail = (code) => Object.assign(new Error(code), { code })
const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 &&
  value.length <= limit
const optionalText = (value, limit) => value === undefined ||
  (typeof value === 'string' && value.length <= limit)

// Kiro's question is transient UI state. It is never written to Core or logs.
function createNativeUserInputQueue(redactText) {
  const pending = new Map()
  const byTool = new Map()
  const settled = new Map()
  const listeners = new Set()
  const publish = () => {
    for (const listener of listeners) {
      try { listener() } catch { /* A panel cannot break the native session. */ }
    }
  }
  const safe = (value, workspace, limit) => {
    const result = redactText(value, workspace)
    if (typeof result !== 'string' || result.length > limit * 2)
      throw fail('NATIVE_USER_INPUT_REDACTION_FAILED')
    return result
  }
  const request = ({ job, sessionId, toolCallId, question, options, signal }) => {
    if (!job || typeof job.id !== 'string' || typeof job.projectId !== 'string' ||
      !text(sessionId, 256) || !text(toolCallId, 256) || !text(question, 4096) ||
      !Array.isArray(options) || options.length > 10 || signal?.aborted)
      return Promise.reject(fail('NATIVE_USER_INPUT_INVALID'))
    const key = `${job.id}\u0000${sessionId}\u0000${toolCallId}`
    if (byTool.has(key)) return byTool.get(key).promise
    let display
    try {
      display = {
        question: safe(question, job.workspace, 4096),
        options: options.map((option) => {
          if (!option || typeof option !== 'object' || Array.isArray(option) ||
            Object.keys(option).some((key) => !['title', 'description', 'recommended',
              'subOptionsLabel', 'subOptions'].includes(key)) ||
            !text(option.title, 256) || !optionalText(option.description, 1024) ||
            (option.recommended !== undefined && typeof option.recommended !== 'boolean') ||
            !optionalText(option.subOptionsLabel, 256) ||
            (option.subOptions !== undefined &&
              (!Array.isArray(option.subOptions) || option.subOptions.length > 10)))
            throw fail('NATIVE_USER_INPUT_INVALID')
          return {
            title: safe(option.title, job.workspace, 256),
            ...(option.description === undefined ? {} :
              { description: safe(option.description, job.workspace, 1024) }),
            recommended: option.recommended === true,
            ...(option.subOptionsLabel === undefined ? {} :
              { subOptionsLabel: safe(option.subOptionsLabel, job.workspace, 256) }),
            subOptions: (option.subOptions ?? []).map((sub) => {
              if (!sub || typeof sub !== 'object' || Array.isArray(sub) ||
                Object.keys(sub).some((key) => !['title', 'description'].includes(key)) ||
                !text(sub.title, 256) || !optionalText(sub.description, 1024))
                throw fail('NATIVE_USER_INPUT_INVALID')
              return { title: safe(sub.title, job.workspace, 256),
                ...(sub.description === undefined ? {} :
                  { description: safe(sub.description, job.workspace, 1024) }) }
            }),
          }
        }),
      }
    } catch (error) { return Promise.reject(error) }
    const requestId = randomUUID()
    let resolve
    let reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    const abort = () => {
      const current = pending.get(requestId)
      if (!current) return
      pending.delete(requestId)
      byTool.delete(key)
      reject(fail('NATIVE_USER_INPUT_CANCELLED'))
      publish()
    }
    const item = { requestId, jobId: job.id, projectId: job.projectId, workspace: job.workspace,
      taskId: job.taskId ?? null, discoverySessionId: job.discoverySessionId ?? null,
      role: job.role, key, display, promise, status: 'WAITING', digest: null,
      resolve, reject, signal, abort }
    pending.set(requestId, item)
    byTool.set(key, item)
    signal?.addEventListener('abort', abort, { once: true })
    publish()
    return promise
  }
  const list = (projectId) => [...pending.values()]
    .filter((item) => item.projectId === projectId)
    .map((item) => ({ requestId: item.requestId, nativeJobId: item.jobId,
      projectId: item.projectId, taskId: item.taskId,
      discoverySessionId: item.discoverySessionId, role: item.role,
      status: item.status,
      ...item.display }))
  const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value))
    .digest('hex')
  const submit = ({ projectId, nativeJobId, requestId, action, optionIndex,
    subOptionIndices, answer }) => {
    if (!text(projectId, 120) || !text(nativeJobId, 120) ||
      typeof requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(requestId) ||
      !['answered', 'dismissed'].includes(action))
      throw fail('NATIVE_USER_INPUT_RESPONSE_INVALID')
    const intent = { action, optionIndex, subOptionIndices, answer }
    const digest = fingerprint(intent)
    const previous = settled.get(requestId)
    if (previous) {
      if (previous.projectId === projectId && previous.jobId === nativeJobId &&
        previous.digest === digest) return 'ALREADY_HANDLED'
      throw fail('NATIVE_USER_INPUT_STALE')
    }
    const item = pending.get(requestId)
    if (!item || item.projectId !== projectId || item.jobId !== nativeJobId ||
      item.signal?.aborted)
      throw fail('NATIVE_USER_INPUT_STALE')
    if (item.status === 'RESPONDING') {
      if (item.digest === digest) return 'ALREADY_SUBMITTED'
      throw fail('NATIVE_USER_INPUT_STALE')
    }
    let response
    if (action === 'dismissed') {
      if (optionIndex !== undefined || subOptionIndices !== undefined || answer !== undefined)
        throw fail('NATIVE_USER_INPUT_RESPONSE_INVALID')
      response = { action: 'dismissed' }
    } else if (item.display.options.length > 0) {
      if (answer !== undefined) {
        if (optionIndex !== undefined || subOptionIndices !== undefined ||
          !text(answer, 2048) || redactText(answer, item.workspace) !== answer)
          throw fail('NATIVE_USER_INPUT_RESPONSE_INVALID')
        response = { action: 'answered', answer: answer.trim() }
      } else {
        if (!Number.isInteger(optionIndex) || optionIndex < 0 ||
          optionIndex >= item.display.options.length ||
          !Array.isArray(subOptionIndices) || subOptionIndices.length > 10 ||
          subOptionIndices.some((index) => !Number.isInteger(index) || index < 0 ||
            index >= item.display.options[optionIndex].subOptions.length) ||
          subOptionIndices.length !== new Set(subOptionIndices).size)
          throw fail('NATIVE_USER_INPUT_RESPONSE_INVALID')
        const option = item.display.options[optionIndex]
        const extras = subOptionIndices.map((index) => option.subOptions[index].title)
        const selected = option.title + (extras.length ? ` [${extras.join(', ')}]` : '')
        if (!text(selected, 2048)) throw fail('NATIVE_USER_INPUT_RESPONSE_INVALID')
        response = { action: 'answered', answer: selected }
      }
    } else {
      if (optionIndex !== undefined || subOptionIndices !== undefined ||
        !text(answer, 2048) || redactText(answer, item.workspace) !== answer)
        throw fail('NATIVE_USER_INPUT_RESPONSE_INVALID')
      response = { action: 'answered', answer: answer.trim() }
    }
    item.status = 'RESPONDING'
    item.digest = digest
    item.resolve(response)
    publish()
    return 'SUBMITTED'
  }
  const acknowledge = (jobId, sessionId, toolCallId) => {
    const item = byTool.get(`${jobId}\u0000${sessionId}\u0000${toolCallId}`)
    if (!item || item.status !== 'RESPONDING') return false
    pending.delete(item.requestId)
    byTool.delete(item.key)
    item.signal?.removeEventListener('abort', item.abort)
    settled.set(item.requestId, { projectId: item.projectId, jobId,
      digest: item.digest })
    publish()
    return true
  }
  const clearJob = (jobId) => {
    for (const item of [...pending.values()]) if (item.jobId === jobId) item.abort()
    for (const [id, item] of settled) if (item.jobId === jobId) settled.delete(id)
  }
  const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }
  return { request, list, submit, acknowledge, clearJob, subscribe }
}

module.exports = { createNativeUserInputQueue }
