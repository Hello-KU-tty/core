import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it } from 'vitest'

describe('SQLite adapter compatibility', () => {
  it('opens an in-memory database and rolls back a failed transaction', () => {
    const sqlite = new Database(':memory:')
    const database = drizzle(sqlite)

    sqlite.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT')
    const insert = sqlite.prepare('INSERT INTO probe (value) VALUES (?)')
    const failingTransaction = sqlite.transaction(() => {
      insert.run('should-roll-back')
      throw new Error('rollback probe')
    })

    expect(database).toBeDefined()
    expect(failingTransaction).toThrow('rollback probe')
    expect(sqlite.prepare('SELECT count(*) AS count FROM probe').get()).toEqual({ count: 0 })

    sqlite.close()
  })
})
