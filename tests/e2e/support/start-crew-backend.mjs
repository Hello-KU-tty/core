import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ApplicationService, WorkspacePathPolicy } from '../../../packages/application/dist/index.js'
import { openSqliteStorage } from '../../../packages/storage-sqlite/dist/index.js'

import { createCrewBackendServer } from '../../../apps/crew-backend/dist/server.js'

const testRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-e2e-'))
const workspaceRoot = join(testRoot, 'generated-workspaces')
await mkdir(workspaceRoot, { recursive: true })
const storage = await openSqliteStorage({ dataDirectory: join(testRoot, 'core') })
const workspacePolicy = await WorkspacePathPolicy.create(workspaceRoot)
const application = new ApplicationService({ storage, workspacePolicy })
const server = createCrewBackendServer({
  application,
  proxySecret: 'test-proxy-secret-with-at-least-thirty-two-bytes',
})

const close = () => server.close(() => storage.close())
process.once('SIGINT', close)
process.once('SIGTERM', close)
server.listen(4174, '127.0.0.1')
