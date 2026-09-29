import { execFile } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

export async function sourceProvenance(directory) {
  const root = await realpath(directory)
  const git = async (args) =>
    (await promisify(execFile)('git', ['-C', root, ...args])).stdout.trim()
  let gitRoot
  try {
    gitRoot = await git(['rev-parse', '--show-toplevel'])
  } catch {
    // An extracted developer snapshot has no Git history.
  }
  if (gitRoot && (await realpath(gitRoot)) === root)
    return {
      baseCommit: await git(['rev-parse', 'HEAD']),
      workingTreeChangesIncluded: (await git(['status', '--porcelain'])).length > 0,
      kind: 'checkout',
    }
  const info = JSON.parse(await readFile(join(root, 'source-info.json'), 'utf8'))
  if (!/^[a-f0-9]{40}$/.test(info.baseCommit)) throw new Error('SOURCE_PROVENANCE_REQUIRED')
  return { ...info, kind: 'developer-snapshot' }
}
