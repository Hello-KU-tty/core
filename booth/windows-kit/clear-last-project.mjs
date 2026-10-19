// Forgets the Hello Vibe panel's last Project in a closed Kiro profile. The panel reopens that Project
// in any window whose folder is not a Project folder, so ① would show the previous visitor's Project
// (or "이전 프로젝트를 불러오지 못했습니다" once it is gone). Only this one key changes.
// Usage (Kiro closed): <Node 22.13+> --no-warnings clear-last-project.mjs <profile>\User\globalStorage\state.vscdb
import { DatabaseSync } from 'node:sqlite'

const KEY = 'vibe-helper.builder-helper-agent-panel'
const db = new DatabaseSync(process.argv[2])
try {
  const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(KEY)
  if (row) {
    const text = typeof row.value === 'string' ? row.value : Buffer.from(row.value).toString('utf8')
    const state = JSON.parse(text)
    if ('bhlr.lastProjectId' in state) {
      delete state['bhlr.lastProjectId']
      db.prepare('UPDATE ItemTable SET value = ? WHERE key = ?').run(JSON.stringify(state), KEY)
    }
  }
} finally {
  db.close()
}
