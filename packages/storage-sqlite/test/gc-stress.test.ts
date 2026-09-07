import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it('survives repeated native Statement finalization and explicit database close on pinned Node', async () => {
  const result = await promisify(execFile)(
    process.execPath,
    [
      '--expose-gc',
      '--input-type=module',
      '-e',
      `
    import Database from 'better-sqlite3';
    const db = new Database(':memory:');
    db.exec('CREATE TABLE gc_probe (n INTEGER)');
    for (let i=0;i<10000;i++) {
      db.prepare('INSERT INTO gc_probe VALUES (?)').run(i);
      db.prepare('SELECT n FROM gc_probe WHERE rowid = ?').get(i+1);
      if(i%100===0) global.gc();
    }
    if(db.prepare('SELECT COUNT(*) AS n FROM gc_probe').get().n!==10000) throw Error('ROWS');
    if(db.pragma('quick_check', {simple:true})!=='ok') throw Error('INTEGRITY');
    db.close(); global.gc(); console.log('GC_AND_CLOSE_OK');
  `,
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), timeout: 8_000, maxBuffer: 65_536 },
  )
  expect(result.stdout.trim()).toBe('GC_AND_CLOSE_OK')
})
