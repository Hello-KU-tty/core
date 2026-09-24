const assert = require('node:assert/strict')
const { mkdir, writeFile } = require('node:fs/promises')
const { createRequire } = require('node:module')
const { isAbsolute, join } = require('node:path')
const { pathToFileURL } = require('node:url')

async function main() {
  const [repository, root, reportFile] = process.argv.slice(2)
  assert.equal(process.platform, 'win32')
  assert.ok([repository, root, reportFile].every(isAbsolute))
  const report = {
    platform: process.platform, arch: process.arch, node: process.versions.node,
    napi: process.versions.napi, electron: process.versions.electron ?? null,
    apis: { fetch: typeof fetch === 'function', websocket: typeof WebSocket === 'function' },
    sqlite: 'NOT_TESTED', coreStorage: 'NOT_TESTED',
  }
  try {
    await mkdir(root, { recursive: true })
    const requireStorage = createRequire(join(repository, 'packages/storage-sqlite/package.json'))
    const Database = requireStorage('better-sqlite3')
    const databasePath = join(root, 'capability.sqlite')
    let db = new Database(databasePath)
    try {
      db.exec('CREATE TABLE IF NOT EXISTS receipt (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
      db.exec('DELETE FROM receipt')
      db.transaction(() => db.prepare('INSERT INTO receipt VALUES (?, ?)').run(1, '합성 값'))()
      assert.throws(() => db.transaction(() => {
        db.prepare('INSERT INTO receipt VALUES (?, ?)').run(2, 'rollback')
        throw new Error('SYNTHETIC_ROLLBACK')
      })(), /SYNTHETIC_ROLLBACK/)
    } finally { db.close() }
    db = new Database(databasePath, { fileMustExist: true })
    try {
      assert.deepEqual(db.prepare('SELECT * FROM receipt').all(), [{ id: 1, value: '합성 값' }])
      assert.equal(db.pragma('quick_check', { simple: true }), 'ok')
    } finally { db.close() }
    report.sqlite = 'PASS'
    const { openSqliteStorage } = await import(pathToFileURL(
      join(repository, 'packages/storage-sqlite/dist/index.js')).href)
    for (let iteration = 0; iteration < 2; iteration++) {
      const storage = await openSqliteStorage({ dataDirectory: join(root, 'core') })
      try {
        assert.deepEqual(storage.checkIntegrity(), { quickCheck: 'ok', foreignKeyViolations: 0 })
      } finally { storage.close() }
    }
    report.coreStorage = 'PASS'
    report.core = await require('./core-probe.cjs').run(repository, root)
  } catch (error) {
    // Never serialize native error messages, environment, connection data or paths.
    report.failure = { name: error?.name ?? 'Error', code: error?.code ?? 'PROBE_FAILED',
      probeLine: Number(error?.stack?.match(/core-probe\.cjs:(\d+):/)?.[1]) || null }
    if (error?.code === 'CORE_CONTEXT_FAILED') report.failure.validation = error.diagnostic
    process.exitCode = 1
  }
  await writeFile(reportFile, JSON.stringify(report, null, 2), { flag: 'wx' })
  process.stdout.write(`${JSON.stringify(report)}\n`)
}
main().catch(() => { process.stderr.write('WINDOWS_RUNTIME_PROBE_FAILED\n'); process.exitCode = 1 })
