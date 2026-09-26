// The pinned Windows Agent mux and dynamic file logger live in this extension
// host. Keep debug enabled only while fresh pre-model Cloud proof is collected.
function createScopedCloudDebug(getEnvironment = () => process.env) {
  let active = 0, environment, previous, hadValue = false, changed = false
  return async function withScopedCloudDebug(action) {
    if (active === 0) {
      environment = typeof getEnvironment === 'function' ? getEnvironment() : getEnvironment
      hadValue = Object.hasOwn(environment, 'KIRO_LOG_LEVEL')
      previous = environment.KIRO_LOG_LEVEL
      changed = !['debug', 'trace'].includes(previous)
      if (changed) environment.KIRO_LOG_LEVEL = 'debug'
    }
    active++
    try { return await action() }
    finally {
      active--
      if (active === 0) {
        if (changed && environment.KIRO_LOG_LEVEL === 'debug') {
          if (hadValue) environment.KIRO_LOG_LEVEL = previous
          else delete environment.KIRO_LOG_LEVEL
        }
        previous = undefined
        environment = undefined
        changed = false
      }
    }
  }
}

module.exports = { createScopedCloudDebug, withScopedCloudDebug: createScopedCloudDebug() }
