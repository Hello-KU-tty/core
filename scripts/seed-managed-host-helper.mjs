import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import * as schemas from '../packages/contracts/dist/index.js'
import * as fixtures from '../packages/contracts/test/fixtures.ts'
import { privateDirectory } from '../packages/runtime/dist/private-directory.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'

// Only the private synthetic host root validated by test-managed-host may call this.
// A fixture Task is setup data, never an Agent success or learner Evidence.
export async function seedHelperTask(storagePath) {
  const coreRoot = join(storagePath, 'core-data')
  const owner = await readFile(join(coreRoot, 'backend.lock/owner.json'), 'utf8')
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
  if (owner) {
    assert.ok(Number.isSafeInteger(owner.pid) && owner.pid > 0)
    try {
      process.kill(owner.pid, 0)
      throw new Error('SYNTHETIC_CORE_STILL_RUNNING')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  await privateDirectory(join(coreRoot, 'workspaces/projects', fixtures.ids.project))
  await privateDirectory(join(coreRoot, 'data'))
  await privateDirectory(join(coreRoot, 'agents'))
  const storage = await openSqliteStorage({ dataDirectory: join(coreRoot, 'data') })
  try {
    storage.transaction((repository) => {
      if (repository.recoverProject(fixtures.ids.project)) return
      for (const [method, schema, value] of [
        [
          'appendProject',
          schemas.projectSchema,
          {
            ...fixtures.projectFixture,
            generatedWorkspacePath: `projects/${fixtures.ids.project}`,
          },
        ],
        [
          'appendDiscoverySession',
          schemas.discoverySessionSchema,
          fixtures.discoverySessionFixture,
        ],
        ['appendCandidate', schemas.projectCandidateRevisionSchema, fixtures.candidateFixture],
        ['appendCandidateRound', schemas.candidateRoundSchema, fixtures.candidateRoundFixture],
        [
          'appendDiscoveryFeedback',
          schemas.discoveryFeedbackSchema,
          fixtures.discoveryFeedbackFixture,
        ],
        [
          'appendLearningSpec',
          schemas.learningSpecRevisionSchema,
          fixtures.draftLearningSpecFixture,
        ],
        [
          'appendLearningSpec',
          schemas.learningSpecRevisionSchema,
          fixtures.confirmedLearningSpecFixture,
        ],
        ['appendTask', schemas.builderTaskSchema, fixtures.builderTaskFixture],
      ]) {
        repository[method](schema.parse(value))
      }
    })
  } finally {
    storage.close()
  }
  return {
    projectId: fixtures.ids.project,
    taskId: fixtures.ids.task,
    provenance: 'SYNTHETIC_FIXTURE',
  }
}
