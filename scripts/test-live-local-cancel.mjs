// Explicit synthetic local run. May briefly use the logged-in Kiro model.
import { resolve } from 'node:path'
import { connectLocalCore } from '../packages/frontend-client/dist/node.js'
const client = await connectLocalCore(resolve(process.argv[2] ?? '.data/local/connection.json'))
const { projectId, run } = await client.startDiscovery({
  learningGoal: 'Synthetic cancellation of TypeScript state-transition Discovery',
})
await new Promise((done) => setTimeout(done, 250))
const started = Date.now()
const result = await client.cancelRun(run.id)
const snapshot = await client.restoreProject(projectId)
if (result.status !== 'CANCELLED' || snapshot.project.id !== projectId)
  throw new Error('CANCEL_OR_RESTORE_FAILED')
console.log(
  JSON.stringify({
    status: 'CANCEL_AND_RESTORE_VERIFIED',
    projectId,
    cancelMs: Date.now() - started,
    savedPreview: snapshot.discoveryContext?.previewRound !== null,
    taskCreated: snapshot.currentTask !== null,
  }),
)
