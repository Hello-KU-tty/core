// Development evaluation: compare Evidence Analyst models through kiro-cli on the same fixed corpus
// and the same deterministic oracle used for the preliminary prompt decision (v1.0.8 source-first).
// Synthetic, redacted inputs only. Needs a logged-in kiro-cli and spends real model credits.
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as contracts from '../packages/contracts/dist/index.js'
import { loadEvidenceAnalystAgentDefinition } from '../packages/kiro-adapter/dist/evidence-analyst-prompt-node.js'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const {
  buildSyntheticCase,
  evaluateText,
} = require('../examples/kiro-panel/src/native-analyst-clean-semantics.cjs')
const [modelsArg, outPath, corpusArg] = process.argv.slice(2)
if (!modelsArg || !outPath)
  throw new Error('usage: eval-analyst-models.mjs <model,model,...> <out.json> [corpus.json]')
const corpusPath = resolve(
  corpusArg ??
    join(
      repositoryRoot,
      'tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.8-source-first.json',
    ),
)
const fixture = JSON.parse(await readFile(corpusPath, 'utf8'))
const definition = await loadEvidenceAnalystAgentDefinition(repositoryRoot)
const workspace = await mkdtemp(join(tmpdir(), 'vibe-analyst-models-'))
await mkdir(join(workspace, '.kiro', 'agents'), { recursive: true })

function run(args, timeoutMs = 300_000) {
  return new Promise((done, fail) => {
    const child = spawn('kiro-cli', args, { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'] })
    const out = []
    const err = []
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.stdout.on('data', (chunk) => out.push(chunk))
    child.stderr.on('data', (chunk) => err.push(chunk))
    child.once('error', fail)
    child.once('close', (code) => {
      clearTimeout(timer)
      done({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      })
    })
  })
}

const results = []
for (const model of modelsArg.split(',').filter(Boolean)) {
  const name = `${definition.name}-${model.replace(/[^a-z0-9]+/gi, '-')}`
  const configPath = join(workspace, '.kiro', 'agents', `${name}.json`)
  await writeFile(
    configPath,
    `${JSON.stringify(
      {
        name,
        description: definition.description,
        prompt: definition.prompt,
        tools: definition.tools,
        allowedTools: definition.allowedTools,
        ...(model === 'auto' ? {} : { model }),
      },
      null,
      2,
    )}\n`,
  )
  const limit = Number(process.env.VIBE_EVAL_CASE_LIMIT ?? fixture.cases.length)
  for (const [index, item] of fixture.cases.slice(0, limit).entries()) {
    const context = buildSyntheticCase(item, index, contracts)
    const turn = [
      '다음 bounded EpisodeContext를 Evidence Analyst prompt에 따라 한 번 분석하세요.',
      '다른 정보나 도구를 사용하지 말고 strict JSON 하나만 반환하세요.',
      JSON.stringify(context),
    ].join('\n')
    const started = Date.now()
    const outcome = await run([
      'chat',
      '--agent',
      name,
      '--no-interactive',
      '--output-format',
      'stream-json',
      '--verbose',
      turn,
    ])
    let answer = ''
    let toolCalls = 0
    const metering = []
    for (const line of outcome.stdout.split(/\r?\n/u).filter(Boolean)) {
      let event
      try {
        event = JSON.parse(line)
      } catch {
        continue
      }
      const update = event?.data?.update
      if (update?.sessionUpdate === 'tool_call') toolCalls += 1
      if (update?.sessionUpdate === 'agent_message_chunk' && update?.content?.type === 'text')
        answer += update.content.text
      const text = JSON.stringify(event)
      if (/credit|metering|usage/i.test(text) && text.length < 2_000) metering.push(event)
    }
    const verdict =
      outcome.code === 0 && toolCalls === 0
        ? evaluateText(answer, context, item, contracts)
        : {
            deterministicStatus: 'FAILED',
            failureCode: toolCalls ? 'TOOL_CALL' : `EXIT_${outcome.code}`,
          }
    const cell = {
      model,
      case: item.id,
      status: verdict.deterministicStatus,
      failureCode: verdict.failureCode ?? null,
      schemaValid: verdict.schemaValid ?? false,
      proposalCount: verdict.proposalCount ?? null,
      ms: Date.now() - started,
      credits: metering
        .flatMap((event) => event?.data?.meteringUsage ?? [])
        .reduce((sum, usage) => sum + (Number(usage.value) || 0), 0),
      stderrTail: outcome.code === 0 ? null : outcome.stderr.slice(-300),
    }
    results.push(cell)
    await writeFile(
      outPath,
      `${JSON.stringify({ corpus: corpusPath, promptVersion: definition.promptVersion, results }, null, 2)}\n`,
    )
    process.stdout.write(
      `${model} ${item.id}: ${cell.status} ${cell.failureCode ?? ''} ${cell.ms}ms\n`,
    )
  }
}
