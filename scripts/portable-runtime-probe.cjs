// Packaged separately so the candidate process, not the caller, loads its native library.
const { join, isAbsolute } = require('node:path')
const Database = require('better-sqlite3')
const root = process.argv[2]
if (!root || !isAbsolute(root)) throw new Error('PROBE_PRIVATE_ROOT_REQUIRED')
const file = join(root, 'probe.sqlite')
let db = new Database(file)
db.exec('CREATE TABLE probe(value TEXT)')
db.transaction(() => db.prepare('INSERT INTO probe VALUES (?)').run('합성 transaction'))()
try {
  db.transaction(() => { db.prepare('INSERT INTO probe VALUES (?)').run('rollback'); throw new Error('rollback') })()
} catch (error) { if (error.message !== 'rollback') throw error }
db.close()
db = new Database(file, { fileMustExist: true })
if (db.prepare('SELECT count(*) AS n FROM probe').get().n !== 1 ||
    db.prepare('SELECT value FROM probe').get().value !== '합성 transaction' ||
    db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('SQLITE_PROBE_FAILED')
db.close()
process.stdout.write(JSON.stringify({ node: process.versions.node, platform: process.platform,
  arch: process.arch, napi: Number(process.versions.napi), electron: process.versions.electron ?? null,
  api: typeof fetch === 'function' && typeof WebSocket === 'function', sqlite: 'ok' }))
