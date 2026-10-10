// Development evaluation (K05, K10 tools): does the Kiro Agent map a learner's chat reply to an open Decision
// correctly, and does it refrain when the reply is not a choice? It needs a running core-only
// backend with a Builder binding, the Kiro probe extension inbox, and real model credits.
// Judgement uses only Core resolution fields and Kiro session tool calls, never text search.
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  Client,
  StreamableHTTPClientTransport,
} from '../apps/mcp-server/node_modules/@modelcontextprotocol/client/dist/index.mjs'

const [bindingPath, probeLogs, workspaceHash, budgetArg, outPath] = process.argv.slice(2)
if (!bindingPath || !probeLogs || !workspaceHash || !budgetArg || !outPath)
  throw new Error(
    'usage: eval-kiro-chat-decision.mjs <native-mcp.json> <probe-logs-dir> <kiro-workspace-hash> <credit-budget> <out.json>',
  )
const budget = Number(budgetArg)
const repository = resolve(dirname(new URL(import.meta.url).pathname), '..')
const fixture = JSON.parse(
  await readFile(join(repository, 'tests/eval/fixtures/kiro-chat-decision/cases.json'), 'utf8'),
)
const binding = JSON.parse(await readFile(bindingPath, 'utf8'))
const coreRoot = dirname(resolve(bindingPath))
const connection = JSON.parse(await readFile(join(coreRoot, 'connection.json'), 'utf8'))
const scope = {
  projectId: binding.projectId,
  taskId: binding.taskId,
  correlationId: binding.correlationId,
}
const idem = () => `idem_${randomUUID()}`

const mcp = new Client({ name: 'vibe-helper-eval', version: '0.1.0' })
await mcp.connect(
  new StreamableHTTPClientTransport(new URL(binding.url), {
    requestInit: { headers: { Authorization: binding.authorization } },
  }),
)
async function tool(name, args) {
  const result = await mcp.callTool({ name, arguments: args })
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.structuredContent)}`)
  return result.structuredContent
}
// K10: the harness asks through the same Kiro chat Builder tools the Agent uses.
async function openDecision() {
  const receipt = await tool('ask_choice', {
    category: 'PRODUCT_BEHAVIOR',
    question: fixture.decision.question,
    whyNow: '링크 생성 코드를 쓰기 전에 만료 정책이 필요하다.',
    options: fixture.decision.options.map((label, index) => ({
      label,
      description: `링크를 ${label} 동안 연다.`,
      tradeoffs: [index === 0 ? '받는 시간이 빠듯하다.' : '유출되면 더 오래 노출된다.'],
    })),
    recommended: fixture.decision.recommendedOptionNumber,
    recommendationReason: '공용 PC에서 바로 옮기는 용도라 짧게 여는 편이 안전하다.',
    blocksWork: false,
    concepts: ['link expiry'],
  })
  return { decisionId: receipt.decisionId }
}

const inbox = join(probeLogs, 'inbox.jsonl')
const outbox = join(probeLogs, 'outbox.jsonl')
async function probe(cmd, args = [], waitForResult = true) {
  const id = `eval-${randomUUID()}`
  await appendFile(inbox, `${JSON.stringify({ id, cmd, args })}\n`)
  // sendPrompt resolves only when the turn ends; the session record is polled instead.
  if (!waitForResult) return null
  for (let attempt = 0; attempt < 60; attempt++) {
    await delay(1_000)
    const line = (await readFile(outbox, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((value) => JSON.parse(value))
      .find((entry) => entry.id === id)
    if (line) return line
  }
  throw new Error(`probe timeout ${cmd}`)
}

const sessionRecord = (sessionId) =>
  join(homedir(), '.kiro', 'sessions', workspaceHash, sessionId, 'messages.jsonl')
async function readTurn(sessionId) {
  const raw = await readFile(sessionRecord(sessionId), 'utf8').catch(() => '')
  const payloads = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line).payload)
  const calls = payloads
    .filter((payload) => payload.type === 'tool_call' && payload.toolName === 'tool_call')
    .map((payload) => payload.args?.tool_id)
  const usage = payloads
    .filter((payload) => payload.type === 'usage_summary')
    .flatMap((payload) => payload.promptTurnSummaries.map((turn) => turn.usage))
    .reduce((sum, value) => sum + value, 0)
  const pending = payloads.find((payload) => payload.type === 'pending_interaction')
  const summaries = payloads.filter((payload) => payload.type === 'usage_summary').length
  const says = payloads
    .filter((payload) => payload.type === 'assistant' && payload.operationType === 'Say')
    .map((payload) => payload.content)
  return { calls, usage, pending: pending?.question ?? null, summaries, lastSay: says.at(-1) ?? '' }
}

async function query(sql) {
  const directory = await mkdtemp(join(tmpdir(), 'vibe-eval-db-'))
  for (const suffix of ['', '-wal', '-shm'])
    await copyFile(
      join(coreRoot, 'data', `vibe-helper.sqlite${suffix}`),
      join(directory, `vibe-helper.sqlite${suffix}`),
    ).catch(() => {})
  const rows = execFileSync('sqlite3', ['-json', join(directory, 'vibe-helper.sqlite'), sql], {
    encoding: 'utf8',
  })
  return (rows.trim() ? JSON.parse(rows) : []).map((row) => JSON.parse(row.payload_json))
}
const taskFilter = `task_id = '${scope.taskId.replace(/[^a-z0-9_-]/g, '')}'`
const decisionsOfTask = () =>
  query(`select payload_json from decision_requests where ${taskFilter} order by requested_at`)
const resolutionsOfTask = () =>
  query(`select payload_json from decision_resolutions where ${taskFilter} order by resolved_at`)
const latestContext = async () =>
  (
    await query(
      `select versions.payload_json from live_contexts heads join live_context_versions versions on versions.context_id = heads.id and versions.context_version = heads.head_version where heads.${taskFilter}`,
    )
  )[0] ?? null

// The learner's latest choice for a question: a changed choice reopens it as a new Decision.
async function resolutionOf(decisionId) {
  const decisions = await decisionsOfTask()
  let current = decisions.find((item) => item.id === decisionId)
  for (let step = 0; current && step < decisions.length; step++) {
    const next = decisions.find((item) => item.replacesDecisionId === current.id)
    if (!next) break
    current = next
  }
  if (!current) return null
  const resolution = (await resolutionsOfTask()).find((item) => item.decisionId === current.id)
  return resolution ? { resolution, decision: current } : null
}

// Resolves every Decision still waiting (the harness's and any the Agent opened), so the next
// case starts with no question open. Synthetic evaluation data only.
async function closeOpenDecision(decision, context) {
  const response = await fetch(new URL('/api/application', connection.baseUrl), {
    method: 'POST',
    headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      protocolVersion: 1,
      request: {
        schemaVersion: 1,
        kind: 'UI_RESOLVE_DECISION',
        correlationId: decision.correlationId,
        actor: { kind: 'UI' },
        idempotencyKey: idem(),
        resolution: {
          schemaVersion: 1,
          id: `decision_resolution_${randomUUID()}`,
          decisionId: decision.id,
          projectId: scope.projectId,
          taskId: scope.taskId,
          correlationId: decision.correlationId,
          expectedContextVersion: context?.contextVersion ?? 0,
          selectionKind: 'RECOMMENDATION',
          selectedOptionId: decision.recommendedOptionId,
          helperUsed: false,
          resolvedAt: new Date().toISOString(),
          source: { kind: 'USER' },
          redactionStatus: 'VERIFIED_REDACTED',
        },
      },
    }),
  }).then((value) => value.json())
  if (!response.success) throw new Error(`cleanup resolve failed ${JSON.stringify(response)}`)
}

async function cleanup() {
  const resolved = new Set((await resolutionsOfTask()).map((item) => item.decisionId))
  for (const decision of (await decisionsOfTask()).filter((item) => !resolved.has(item.id)))
    await closeOpenDecision(decision, await latestContext())
}

function judge(expect, recorded) {
  if (!expect.resolve)
    return {
      pass: recorded === null,
      reason: recorded ? 'recorded a reply that needed a question first' : 'asked instead',
    }
  if (recorded === null) return { pass: false, reason: 'did not record a clear choice' }
  const { resolution, decision } = recorded
  if (expect.linked && !(resolution.chatSource?.linkedMessages?.length > 0))
    return { pass: false, reason: 'learner words were not linked' }
  if (expect.custom) {
    const pass = resolution.selectionKind === 'CUSTOM'
    return { pass, reason: pass ? 'custom idea recorded' : `recorded ${resolution.selectionKind}` }
  }
  const selected =
    decision.options.findIndex((option) => option.id === resolution.selectedOptionId) + 1
  if (selected !== expect.optionNumber)
    return { pass: false, reason: `recorded option ${selected}` }
  if (expect.changed && decision.replacesDecisionId === undefined)
    return { pass: false, reason: 'change not recorded as a new choice' }
  return { pass: true, reason: `option ${selected}` }
}

if (process.env.VIBE_EVAL_DRY_RUN === '1') {
  // Harness self-check without Kiro or model credits: open one Decision, then close it.
  await cleanup()
  const { decisionId } = await openDecision()
  await cleanup()
  const closed = await resolutionOf(decisionId)
  process.stdout.write(
    `${JSON.stringify({ dryRun: true, decisionId, closedBy: closed?.resolution.selectionKind ?? null })}\n`,
  )
  await mcp.close()
  process.exit(0)
}

const results = []
let spent = 0
let stopped = false
const only = new Set((process.env.VIBE_EVAL_ONLY ?? '').split(',').filter(Boolean))
await cleanup()
for (const testCase of fixture.cases) {
  if (only.size > 0 && !only.has(testCase.id)) continue
  if (spent > budget - 1.5) {
    results.push({ id: testCase.id, skipped: 'CREDIT_BUDGET' })
    continue
  }
  const { decisionId } = await openDecision()
  const created = await probe('kiroAgent.sessions.create')
  const sessionId = created.result.sessionId
  const turns = []
  for (const message of testCase.messages ?? [testCase.message]) {
    await probe(
      'kiroAgent.sessions.sendPrompt',
      [sessionId, `${message} (지금은 코드 작성은 하지 말아줘.)`],
      false,
    )
    // Each prompt adds one usage summary when its turn ends.
    let turn = await readTurn(sessionId)
    for (
      let attempt = 0;
      attempt < 60 && turn.summaries <= turns.length && !turn.pending;
      attempt++
    ) {
      await delay(3_000)
      turn = await readTurn(sessionId)
    }
    turns.push(turn)
    if (turn.pending) break
  }
  const turn = turns.at(-1)
  spent += turn.usage
  const recorded = await resolutionOf(decisionId)
  const verdict = judge(testCase.expect, recorded)
  results.push({
    id: testCase.id,
    pass: verdict.pass,
    reason: verdict.reason,
    resolution: recorded && {
      selectionKind: recorded.resolution.selectionKind,
      option:
        recorded.decision.options.findIndex(
          (option) => option.id === recorded.resolution.selectedOptionId,
        ) + 1,
      changed: recorded.decision.replacesDecisionId !== undefined,
      linkedMessages: recorded.resolution.chatSource?.linkedMessages?.length ?? 0,
      customProposal: recorded.resolution.customProposal ?? null,
    },
    coreToolCalls: turn.calls,
    pendingApproval: turn.pending,
    credits: Number(turn.usage.toFixed(3)),
    agentReplyTail: turn.lastSay.slice(-160),
  })
  try {
    await cleanup()
  } catch (error) {
    // An unclosed Decision would leak into the next case, so stop the run here.
    results.at(-1).cleanupError = error instanceof Error ? error.message : String(error)
    stopped = true
  }
  await writeFile(
    outPath,
    `${JSON.stringify({ fixture: fixture.version, spent, results }, null, 2)}\n`,
  )
  process.stdout.write(
    `${testCase.id}: ${verdict.pass ? 'PASS' : 'FAIL'} (${verdict.reason}) credits=${turn.usage.toFixed(2)}\n`,
  )
  if (stopped) break
}
await mcp.close()
process.stdout.write(`total credits ${spent.toFixed(2)}\n`)
