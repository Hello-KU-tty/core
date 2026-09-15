const HAIKU_ID = 'claude-haiku-4.5'
const SONNET_ID = 'claude-sonnet-4.5'
const PROJECT_ID = /^project_[0-9a-f-]{36}$/

function createNativeAnalystModelVariant() {
  let target = null
  return {
    armSonnet: ({ projectId, workspace }) => {
      if (!PROJECT_ID.test(projectId) || typeof workspace !== 'string' ||
          !workspace || target !== null)
        throw new Error('NATIVE_ANALYST_VARIANT_SCOPE_INVALID')
      target = { projectId, workspace }
      return SONNET_ID
    },
    modelFor: ({ projectId, workspace }) => {
      if (target !== null &&
          (target.projectId !== projectId || target.workspace !== workspace))
        throw new Error('NATIVE_ANALYST_VARIANT_PROJECT_MISMATCH')
      return target ? SONNET_ID : HAIKU_ID
    },
    activeFor: projectId => target?.projectId === projectId,
  }
}

module.exports = { HAIKU_ID, SONNET_ID, createNativeAnalystModelVariant }
