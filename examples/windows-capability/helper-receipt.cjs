const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

exports.record = async (repository, root, response) => {
  const load = path => import(pathToFileURL(join(repository, path)).href)
  const { ApplicationService, WorkspacePathPolicy, redactSensitiveText } = await load('packages/application/dist/index.js')
  const { openSqliteStorage } = await load('packages/storage-sqlite/dist/index.js')
  const { ids } = await load('packages/contracts/test/fixtures.ts')
  const storage = await openSqliteStorage({ dataDirectory: join(root, 'core-http') })
  try {
    const application = new ApplicationService({ storage, workspacePolicy: await WorkspacePathPolicy.create(join(root, 'workspace 한글')) })
    const redacted = redactSensitiveText(response, root)
    const receipt = await application.executeUi({ schemaVersion: 1, actor: { kind: 'UI' },
      kind: 'UI_RECORD_HELPER_EXCHANGE', correlationId: `corr_${randomUUID()}`, idempotencyKey: `idem_${randomUUID()}`,
      projectId: ids.project, taskId: ids.task, userMessage: 'Why keep the result immutable?',
      helperResponseSummary: redacted.slice(0, 240), origin: 'FREE_TEXT', closeConversation: true })
    assert.equal(receipt.success, true)
    assert.deepEqual(storage.checkIntegrity(), { quickCheck: 'ok', foreignKeyViolations: 0 })
    return { stored: true, responseCharacters: redacted.length, storedSummaryCharacters: Math.min(redacted.length, 240) }
  } finally { storage.close() }
}
