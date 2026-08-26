import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ApplicationService, WorkspacePathPolicy } from '../packages/application/dist/index.js'
import { discoveryInputSchema } from '../packages/contracts/dist/index.js'
import { loadDiscoveryAgentDefinition } from '../packages/kiro-adapter/dist/discovery-prompt-node.js'
import { openSqliteStorage } from '../packages/storage-sqlite/dist/index.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const inputPath = resolve(
  repositoryRoot,
  process.argv[2] ?? 'tests/eval/fixtures/inputs/webhook-lens.json',
)
const input = discoveryInputSchema.parse(JSON.parse(await readFile(inputPath, 'utf8')))
const runtimeRoot = await mkdtemp(join(tmpdir(), 'vibe-helper-t08-discovery-'))
const dataDirectory = join(runtimeRoot, 'data')
const workspaceRoot = join(runtimeRoot, 'generated-workspaces')
const agentWorkspace = join(runtimeRoot, 'agent-workspace')
await Promise.all([
  mkdir(dataDirectory, { recursive: true }),
  mkdir(workspaceRoot, { recursive: true }),
  mkdir(join(agentWorkspace, '.kiro', 'agents'), { recursive: true }),
])

const ids = {
  project: 'project_10000000-0000-4000-8000-000000000001',
  session: 'discovery_session_10000000-0000-4000-8000-000000000002',
  correlation: 'corr_10000000-0000-4000-8000-000000000003',
  idempotency: 'idem_10000000-0000-4000-8000-000000000004',
}
let generatedSequence = 10
const storage = await openSqliteStorage({ dataDirectory })
const application = new ApplicationService({
  storage,
  workspacePolicy: await WorkspacePathPolicy.create(workspaceRoot),
  generateId: (prefix) => {
    if (prefix === 'discovery_session') return ids.session
    generatedSequence += 1
    return `${prefix}_10000000-0000-4000-8000-${String(generatedSequence).padStart(12, '0')}`
  },
})
const started = await application.executeUi({
  schemaVersion: 1,
  kind: 'UI_START_DISCOVERY',
  correlationId: ids.correlation,
  actor: { kind: 'UI' },
  idempotencyKey: ids.idempotency,
  projectId: ids.project,
  input,
})
if (!started.success) {
  storage.close()
  throw new Error(`Could not seed live Discovery evaluation: ${started.error.code}`)
}
storage.close()

const definition = await loadDiscoveryAgentDefinition(repositoryRoot)
const serverName = 'vibe-helper-discovery-core'
const agentConfig = {
  name: definition.name,
  description: definition.description,
  prompt: definition.prompt,
  includeMcpJson: definition.includeMcpJson,
  mcpServers: {
    [serverName]: {
      command: process.execPath,
      args: [join(repositoryRoot, 'apps/mcp-server/dist/main.js')],
      env: {
        VIBE_HELPER_AGENT_ROLE: 'DISCOVERY',
        VIBE_HELPER_DATA_DIR: dataDirectory,
        VIBE_HELPER_WORKSPACE_ROOT: workspaceRoot,
      },
    },
  },
  tools: definition.tools,
  allowedTools: definition.allowedTools,
}
const agentConfigPath = join(agentWorkspace, '.kiro', 'agents', `${definition.name}.json`)
await writeFile(agentConfigPath, `${JSON.stringify(agentConfig, null, 2)}\n`, 'utf8')

const turn = [
  'Run one synthetic, redacted Discovery evaluation.',
  `Call get_discovery_context for projectId ${ids.project} and discoverySessionId ${ids.session}.`,
  `Use correlationId ${ids.correlation} for every tool call.`,
  'Then generate an initial Candidate Round with exactly 8 meaningfully different TypeScript project Candidates and submit it with submit_candidate_round. Eight is an allowed approximate initial round, not a fixed product contract.',
  'Use appliedFeedbackIds=[], carriedCandidates=[], lineage kind NEW for every Candidate, a new schema-valid idempotency key, and expectedSessionRevision=1.',
  'Do not invent Candidate/Round IDs, timestamps, source, redaction status, round index, or input snapshot; the role-bound adapter supplies them.',
  'Do not submit a Learning Spec and do not select a Candidate.',
  'After the tool succeeds, reply only with DISCOVERY_ROUND_STORED.',
].join('\n')

const run = await new Promise((resolveRun, rejectRun) => {
  const child = spawn(
    'kiro-cli',
    [
      'chat',
      '--agent',
      definition.name,
      '--agent-engine',
      'v2',
      '--no-interactive',
      '--require-mcp-startup',
      '--trust-tools=@vibe-helper-discovery-core',
      '--output-format',
      'stream-json',
      turn,
    ],
    { cwd: agentWorkspace, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const stdout = []
  const stderr = []
  let timedOut = false
  let forceKillTimeout
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
    forceKillTimeout = setTimeout(() => child.kill('SIGKILL'), 5_000)
  }, 360_000)
  child.once('error', (error) => {
    clearTimeout(timeout)
    clearTimeout(forceKillTimeout)
    rejectRun(error)
  })
  child.once('close', (code) => {
    clearTimeout(timeout)
    clearTimeout(forceKillTimeout)
    resolveRun({ code, timedOut, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) })
  })
})
const transcriptPath = join(runtimeRoot, 'kiro-stream.jsonl')
const errorPath = join(runtimeRoot, 'kiro-stderr.log')
await Promise.all([writeFile(transcriptPath, run.stdout), writeFile(errorPath, run.stderr)])
if (run.timedOut || run.code !== 0) {
  throw new Error(
    `Live Discovery Agent ${run.timedOut ? 'exceeded 360 seconds' : `exited with ${String(run.code)}`}. Inspect ${errorPath} and ${transcriptPath}.`,
  )
}

const resultStorage = await openSqliteStorage({ dataDirectory })
const aggregate = resultStorage.repository.readDiscoveryAggregate(ids.project, ids.session)
resultStorage.close()
const round = aggregate?.rounds.at(-1)
if (aggregate === null || aggregate === undefined || round === undefined) {
  throw new Error(`Discovery Agent did not store a Candidate Round. Inspect ${transcriptPath}.`)
}
const roundKeys = new Set(
  round.candidates.map((candidate) => `${candidate.candidateId}:${candidate.revision}`),
)
const candidates = aggregate.candidates.filter((candidate) =>
  roundKeys.has(`${candidate.id}:${candidate.revision}`),
)
const subjectPath = join(runtimeRoot, 'discovery-subject.json')
await writeFile(
  subjectPath,
  `${JSON.stringify({ schemaVersion: 1, discovery: { round, candidates } }, null, 2)}\n`,
  'utf8',
)
process.stdout.write(
  `${JSON.stringify({
    runtimeRoot,
    subjectPath,
    transcriptPath,
    promptVersion: definition.promptVersion,
    candidateCount: candidates.length,
    sessionRevision: aggregate.session.revision,
  })}\n`,
)
