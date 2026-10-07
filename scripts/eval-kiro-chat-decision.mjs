// Development evaluation (K05): does the Kiro Agent map a learner's chat reply to an open Decision
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
const builderTask = () =>
  tool('get_builder_task', {
    schemaVersion: 1,
    kind: 'BUILDER_GET_TASK',
    correlationId: scope.correlationId,
    actor: { kind: 'AGENT', role: 'BUILDER' },
    projectId: scope.projectId,
    taskId: scope.taskId,
  })

async function openDecision() {
  const context = await builderTask()
  const receipt = await tool('request_user_decision', {
    schemaVersion: 1,
    ...scope,
    idempotencyKey: idem(),
    expectedTaskRevision: context.task.revision,
    expectedContextVersion: context.liveContext?.contextVersion ?? 0,
    decision: {
      category: 'PRODUCT_BEHAVIOR',
      question: fixture.decision.question,
      reasonRequiredNow: '링크 생성 코드를 쓰기 전에 만료 정책이 필요하다.',
      options: fixture.decision.options.map((label, index) => ({
        key: `option_${index + 1}`,
        label,
        description: `링크를 ${label} 동안 연다.`,
        impacts: [`${label} 뒤에는 링크가 막힌다.`],
        tradeoffs: [index === 0 ? '받는 시간이 빠듯하다.' : '유출되면 더 오래 노출된다.'],
      })),
      recommendedOptionKey: `option_${fixture.decision.recommendedOptionNumber}`,
      recommendationRationale: '공용 PC에서 바로 옮기는 용도라 짧게 여는 편이 안전하다.',
      relatedConceptNames: ['link expiry'],
      sourceReferences: [],
      independentWorkCanContinue: true,
    },
    context: {
      stage: '공유 링크 구현 전',
      currentGoal: '만료되는 공유 링크를 만든다.',
      recentChanges: ['만료 정책 Decision을 열었다.'],
      activeConceptNames: ['link expiry'],
      relatedFiles: [],
      nextActions: ['학습자의 선택을 기다린다.'],
    },
  })
  const after = await builderTask()
  const decision = after.decisionRequests.find((item) => item.id === receipt.decisionId)
  return { decisionId: receipt.decisionId, options: decision?.options ?? [] }
}

const inbox = join(probeLogs, 'inbox.jsonl')
const outbox = join(probeLogs, 'outbox.jsonl')
async function probe(cmd, args = []) {
  const id = `eval-${randomUUID()}`
  await appendFile(inbox, `${JSON.stringify({ id, cmd, args })}\n`)
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
  const done = payloads.some((payload) => payload.type === 'usage_summary')
  const says = payloads
    .filter((payload) => payload.type === 'assistant' && payload.operationType === 'Say')
    .map((payload) => payload.content)
  return { calls, usage, pending: pending?.question ?? null, done, lastSay: says.at(-1) ?? '' }
}

async function resolutionOf(decisionId) {
  const directory = await mkdtemp(join(tmpdir(), 'vibe-eval-db-'))
  for (const suffix of ['', '-wal', '-shm'])
    await copyFile(
      join(coreRoot, 'data', `vibe-helper.sqlite${suffix}`),
      join(directory, `vibe-helper.sqlite${suffix}`),
    ).catch(() => {})
  const rows = execFileSync(
    'sqlite3',
    [
      '-json',
      join(directory, 'vibe-helper.sqlite'),
      `select payload_json from decision_resolutions where decision_id = '${decisionId.replace(/[^a-z0-9_-]/g, '')}'`,
    ],
    { encoding: 'utf8' },
  )
  const parsed = rows.trim() ? JSON.parse(rows) : []
  return parsed.length === 0 ? null : JSON.parse(parsed[0].payload_json)
}

async function cleanup(decisionId, resolved) {
  const context = await builderTask()
  if (!resolved) {
    const decision = context.decisionRequests.find((item) => item.id === decisionId)
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
            decisionId,
            projectId: scope.projectId,
            taskId: scope.taskId,
            correlationId: decision.correlationId,
            expectedContextVersion: context.liveContext?.contextVersion ?? 0,
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
  const fresh = await builderTask()
  await tool('apply_decision_result', {
    schemaVersion: 1,
    ...scope,
    decisionId,
    idempotencyKey: idem(),
    expectedTaskRevision: fresh.task.revision,
    expectedContextVersion: fresh.liveContext?.contextVersion ?? 0,
    appliedResult: 'Evaluation harness closed this synthetic Decision without implementing it.',
    sourceReferences: [],
    context: {
      stage: '평가 사례 정리',
      currentGoal: '만료되는 공유 링크를 만든다.',
      recentChanges: ['평가용 Decision을 정리했다.'],
      activeConceptNames: ['link expiry'],
      relatedFiles: [],
      nextActions: ['다음 평가 사례'],
    },
  })
}

function judge(expect, resolution, options) {
  if (!expect.resolve)
    return {
      pass: resolution === null,
      reason: resolution ? 'resolved an unclear reply' : 'asked instead',
    }
  if (resolution === null) return { pass: false, reason: 'did not record a clear choice' }
  if (expect.custom) {
    const pass = resolution.selectionKind === 'CUSTOM'
    return {
      pass,
      reason: pass ? 'custom proposal quoted' : `recorded ${resolution.selectionKind}`,
    }
  }
  const selected = options.findIndex((option) => option.id === resolution.selectedOptionId) + 1
  if (selected !== expect.optionNumber)
    return { pass: false, reason: `recorded option ${selected}` }
  if (expect.rationaleRequired && !resolution.rationale)
    return { pass: false, reason: 'choice right but learner reason not quoted' }
  return {
    pass: true,
    reason: `option ${selected}${resolution.rationale ? ' with quoted reason' : ''}`,
  }
}

if (process.env.VIBE_EVAL_DRY_RUN === '1') {
  // Harness self-check without Kiro or model credits: open one Decision, then close it.
  const { decisionId, options } = await openDecision()
  await cleanup(decisionId, false)
  const closed = await resolutionOf(decisionId)
  process.stdout.write(
    `${JSON.stringify({ dryRun: true, decisionId, options: options.length, closedBy: closed?.selectionKind ?? null })}\n`,
  )
  await mcp.close()
  process.exit(0)
}

const results = []
let spent = 0
for (const testCase of fixture.cases) {
  if (spent > budget - 1.5) {
    results.push({ id: testCase.id, skipped: 'CREDIT_BUDGET' })
    continue
  }
  const { decisionId, options } = await openDecision()
  const created = await probe('kiroAgent.sessions.create')
  const sessionId = created.result.sessionId
  await probe('kiroAgent.sessions.sendPrompt', [
    sessionId,
    `${testCase.message} (지금은 코드 작성은 하지 말아줘.)`,
  ])
  let turn = await readTurn(sessionId)
  for (let attempt = 0; attempt < 60 && !turn.done && !turn.pending; attempt++) {
    await delay(3_000)
    turn = await readTurn(sessionId)
  }
  spent += turn.usage
  const resolution = await resolutionOf(decisionId)
  const verdict = judge(testCase.expect, resolution, options)
  results.push({
    id: testCase.id,
    pass: verdict.pass,
    reason: verdict.reason,
    resolution: resolution && {
      selectionKind: resolution.selectionKind,
      option: options.findIndex((option) => option.id === resolution.selectedOptionId) + 1,
      rationale: resolution.rationale ?? null,
      customProposal: resolution.customProposal ?? null,
    },
    coreToolCalls: turn.calls,
    pendingApproval: turn.pending,
    credits: Number(turn.usage.toFixed(3)),
    agentReplyTail: turn.lastSay.slice(-160),
  })
  await cleanup(decisionId, resolution !== null)
  await writeFile(
    outPath,
    `${JSON.stringify({ fixture: fixture.version, spent, results }, null, 2)}\n`,
  )
  process.stdout.write(
    `${testCase.id}: ${verdict.pass ? 'PASS' : 'FAIL'} (${verdict.reason}) credits=${turn.usage.toFixed(2)}\n`,
  )
}
await mcp.close()
process.stdout.write(`total credits ${spent.toFixed(2)}\n`)
