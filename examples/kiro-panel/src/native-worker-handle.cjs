// Panels can open before Workspace Trust is granted. Keep their subscriptions
// attached when the real worker becomes available, without replaying any input.
function createNativeWorkerHandle() {
  let worker
  let unsubscribeStatus, unsubscribeInputs
  const statuses = new Set(), inputs = new Set()
  const notify = (listeners, value) => {
    for (const listener of listeners) { try { listener(value) } catch {} }
  }
  return {
    attach(next) {
      if (worker === next) return
      unsubscribeStatus?.(); unsubscribeInputs?.()
      worker = next
      unsubscribeStatus = worker?.subscribeStatus(value => notify(statuses, value))
      unsubscribeInputs = worker?.subscribeUserInputs(value => notify(inputs, value))
      if (worker?.getStatus()) notify(statuses, worker.getStatus())
      notify(inputs)
    },
    getStatus: () => worker?.getStatus(),
    listUserInputs: projectId => worker?.listUserInputs(projectId) ?? [],
    subscribeStatus(listener) { statuses.add(listener); return () => statuses.delete(listener) },
    subscribeUserInputs(listener) { inputs.add(listener); return () => inputs.delete(listener) },
    async submitUserInput(value) {
      if (!worker) throw new Error('NATIVE_NOT_READY')
      return worker.submitUserInput(value)
    },
  }
}
module.exports = { createNativeWorkerHandle }
