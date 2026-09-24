const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const fixture = require('../../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.4-request-versus-claim.json')
const { MAX_TURNS, derivePriorPrompt, rolePrompts, syntheticContext, evaluateText,
  planCells, runNativeAnalystSemanticEval } =
  require('../src/native-analyst-semantic-eval.cjs')

const currentPrompt = readFileSync(join(__dirname, '..', '..', '..', 'docs',
  'agent-prompts', 'evidence-analyst.md'), 'utf8').replaceAll('\r\n', '\n')
// This command is a frozen v1.0.3/v1.0.4 comparison. Reconstruct the exact
// v1.0.4 historical input from the known v1.0.7, v1.0.6 and v1.0.5 edits for tests only; the
// production command must reject the current canonical prompt before a turn.
function historicalV104Prompt(current) {
  assert.match(current, /^> Prompt version: `1\.0\.7`$/m)
  let prior = current
  const replaceOnce = (from, to) => {
    assert.equal(prior.split(from).length, 2, 'historical prompt delta drifted')
    prior = prior.replace(from, to)
  }
  replaceOnce('> Prompt version: `1.0.7`', '> Prompt version: `1.0.6`')
  replaceOnce('\n- `PREDICTION`은 발화 시점에 아직 관찰하지 않은 **특정한 미래 입력·조치와 그 예상 결과**를 사용자가 연결한 claim이다. `A이면 B 상태다` 같은 일반 조건·정의는 조건문 형태만으로 미래 예측이 아니며 자기 설명이면 `REPHRASE`로 평가한다. 이미 조치한 뒤 확인한 결과는 과거 관찰이므로 그 수행 claim을 `APPLICATION`과 분리하지 말고 별도 미래 `PREDICTION`으로 다시 올리지 마라. 반대로 아직 실행하지 않은 구체적 조건에서 생길 결과를 사용자가 독립적으로 강하게 예측했다면 기존 `PREDICTION` Strength·State 정책을 그대로 적용하라.', '')
  replaceOnce('- 구체적인 결과 예측: 발화 시점에 아직 관찰하지 않은 특정 입력·조치의 결과를 미리 말한 claim은 `PREDICTION`이며 Strength와 Agent 의존성에 따른 기존 상한을 적용한다. 독립적인 강한 예측을 미래형이라는 이유만으로 낮추지 않되, 일반 조건·정의나 이미 확인한 과거 관찰을 별도 예측으로 중복 제안하지 않고 앞으로 할 계획·의도도 수행한 `APPLICATION`으로 만들지 않는다.',
    '- 구체적인 결과 예측: `PREDICTION`이며 Strength와 Agent 의존성에 따른 기존 상한을 적용한다. 독립적인 강한 예측을 미래형이라는 이유만으로 낮추지 않되, 앞으로 할 계획·의도는 수행한 `APPLICATION`이 아니다.')
  replaceOnce('> Prompt version: `1.0.6`', '> Prompt version: `1.0.5`')
  replaceOnce('- `JUSTIFIED_DECISION`에는 사용자가 실제 대안을 선택하고 **자신이 제시한** 관련 이유가 있어야 한다. 선택지들을 나열하거나 선택하면 어떻게 되는지 묻는 조건문은 선택이 아니다. 입력에 같은 선택을 가리키는 `USER_DECISION` reference와 `DECISION_RESOLVED` Event가 있으면 반드시 직접 근거에 포함하라. 실제 선택을 가리키는 구조화된 근거가 없으면 선택했다는 claim은 보류하라. 별도의 자기 설명은 `REPHRASE`와 최대 `EXPLAINED`로 평가하고, 독립적인 결과 예측은 기존 `PREDICTION` 정책을 적용하되, 어느 쪽도 구조화된 선택 없이 `JUSTIFIED_DECISION`으로 올리지 마라.\n- `APPLICATION`에는 사용자가 원리를 현재 문제에 실제로 적용해 이미 수행한 조치와 관찰한 결과를 직접 보고해야 한다. `해야겠다`, `하면 될 것 같다`, `확인해 달라`, `구현해 달라` 같은 미래 계획·조건부 해결책·Agent 지시는 수행이 아니다. `USER_ACTION` reference라는 이름만으로 수행을 추정하지 말고 실제로 인용한 USER_MESSAGE나 다른 user source가 완료한 조치와 결과를 말하는지 claim별로 확인하라. 같은 메시지에 실제 수행 보고와 앞으로의 규칙이 함께 있어도 수행 보고가 미래 규칙까지 적용했다고 대신 증명하지 않는다.',
    '- `JUSTIFIED_DECISION`에는 사용자가 실제 대안을 선택하고 **자신이 제시한** 관련 이유가 있어야 한다. 선택지들을 나열하거나 선택하면 어떻게 되는지 묻는 조건문은 선택이 아니다. `APPLICATION`에는 사용자가 원리를 현재 문제에 적용한 판단·조치·결과가 있어야 한다. Agent에게 적용해 달라는 지시는 적용 Evidence가 아니다.')
  replaceOnce('`DEMONSTRATED`는 사용자가 현재 프로젝트의 실제 문제에 Concept를 사용해 내린 **구조적으로 확인 가능한 이유 있는 선택**, 구체적인 결과를 독립적으로 예측한 강한 Evidence, 또는 user source에서 이미 수행했다고 보고한 수정·검증이 있을 때만 지지한다. 사용자가 코드를 직접 작성해야 하는 것은 아니지만 Agent가 작업을 대신 수행했다는 사실도 사용자 적용 근거가 아니다. 가능한 해결 방법을 앞으로 쓰겠다고 말하거나 맞는지 확인해 달라는 발언은 아직 그 방법을 현재 프로젝트에 채택하거나 적용한 근거가 아니다. 그런 발언에 사용자가 직접 제시한 별도의 원리·인과관계가 있으면 `PREDICTION` 또는 `REPHRASE`로 평가하되 계획·의도 자체를 `APPLICATION`으로 올리지 마라. 실제로 선택한 이유 있는 제품·기술 방향은 코드가 아직 작성되지 않았더라도 대응하는 `USER_DECISION` 근거가 있을 때 `JUSTIFIED_DECISION`과 `DEMONSTRATED` 후보가 될 수 있다. 발언 전체가 아니라 각각의 주장과 행위에 이 구분을 적용하라.',
    '`DEMONSTRATED`는 사용자가 현재 프로젝트의 실제 문제에 Concept를 사용해 내린 **확정적인 판단이나 지시**, 또는 수행한 수정·검증이 있을 때만 지지한다. 사용자가 코드를 직접 작성해야 하는 것은 아니다. 원리의 결과를 예측하거나 가능한 해결 방법을 제안한 뒤 맞는지 확인해 달라는 발언은 아직 그 방법을 현재 프로젝트에 채택하거나 적용한 근거가 아니다. 그런 발언에서 사용자가 독립적으로 제시한 원리·인과관계는 `PREDICTION` 또는 `REPHRASE`로 평가하고 최대 `EXPLAINED`까지만 제안하라. 실제로 선택한 이유 있는 제품·기술 방향은 코드가 아직 작성되지 않았더라도 `JUSTIFIED_DECISION`과 `DEMONSTRATED` 후보가 될 수 있다. 발언 전체가 아니라 각각의 주장과 행위에 이 구분을 적용하라.')
  const observationStart = prior.indexOf('\n## 상태 지지에 필요한 관찰 종류\n')
  const observationEnd = prior.indexOf('\n## Evidence 신호\n', observationStart)
  assert.ok(observationStart >= 0 && observationEnd > observationStart,
    'v1.0.6 observation-kind section drifted')
  prior = `${prior.slice(0, observationStart)}${prior.slice(observationEnd)}`
  replaceOnce('`concept.originalExpression`에는 사용자가 실제 쓴 Concept 표현만 짧게 인용하라. 최대 120자이며, 장문의 질문·설명 전체를 이 필드에 넣지 마라. USER_MESSAGE Event의 `redactedExcerpt` 또는 대응하는 `decisionContext.resolution`의 사용자 작성 rationale/custom proposal처럼 입력에서 출처를 직접 확인할 수 있는 문자열만 쓴다. 사용자 발언 중 판단의 근거가 되는 짧은 부분은 별도 `redactedEvidenceExcerpt`에 민감정보를 제거해 담아라. 길이를 맞추려고 새 뜻을 만들거나 사용자 말을 Agent 설명으로 바꾸지 마라.',
    '`concept.originalExpression`에는 사용자가 실제 쓴 Concept 표현만 짧게 인용하라. 최대 120자이며, 장문의 질문·설명 전체를 이 필드에 넣지 마라. 사용자 발언 중 판단의 근거가 되는 짧은 부분은 별도 `redactedEvidenceExcerpt`에 민감정보를 제거해 담아라. 길이를 맞추려고 새 뜻을 만들거나 사용자 말을 Agent 설명으로 바꾸지 마라.')
  replaceOnce('`proposals`의 **모든** 항목에서 `concept.originalExpression`은 생략할 수 없는 비어 있지 않은 문자열이다. `proposedCanonicalName`만 쓰거나 `originalExpression`을 `null`로 두면 Core가 Proposal 전체를 거절한다. 입력의 직접적인 USER source에서 실제 사용자의 짧은 표현을 인용할 수 없는 Concept는 Proposal에서 제외하라. `USER_DECISION`을 직접 근거로 쓸 때는 같은 `decisionContext.resolution`에 있는 실제 사용자 rationale/custom proposal을 인용하고, 그것이 없으면 Agent의 Decision 질문·선택지 문구를 대신 쓰지 마라. 인용할 수 있는 사용자 표현이 하나도 없으면 `proposals: []`와 구체적인 `noEvidenceReason`을 반환하라. Agent 설명·코드 문구를 사용자 원래 표현으로 대체하지 마라.',
    '`proposals`의 **모든** 항목에서 `concept.originalExpression`은 생략할 수 없는 비어 있지 않은 문자열이다. `proposedCanonicalName`만 쓰거나 `originalExpression`을 `null`로 두면 Core가 Proposal 전체를 거절한다. 입력의 직접적인 USER Event에서 실제 사용자의 짧은 표현을 인용할 수 없는 Concept는 Proposal에서 제외하라. 인용할 수 있는 사용자 표현이 하나도 없으면 `proposals: []`와 구체적인 `noEvidenceReason`을 반환하라. Agent 설명·코드 문구를 사용자 원래 표현으로 대체하지 마라.')
  replaceOnce('당신에게는 file, shell, network나 MCP tool이 없다. 직접 데이터베이스, Concept State, Project History를 수정하지 말고 제공된 Episode ID·revision·correlation ID를 그대로 echo한 strict JSON 하나만 반환하라. stable ID, timestamp, provenance, redaction status와 Analysis Job metadata는 만들지 마라. 이 metadata는 adapter와 Core가 채운다. 반환 직전 `proposals`의 각 `concept.originalExpression`이 실제 USER_MESSAGE 또는 USER_DECISION rationale/custom proposal의 짧은 문자열인지 확인하고, 빠졌으면 그 Proposal을 제거하라.',
    '당신에게는 file, shell, network나 MCP tool이 없다. 직접 데이터베이스, Concept State, Project History를 수정하지 말고 제공된 Episode ID·revision·correlation ID를 그대로 echo한 strict JSON 하나만 반환하라. stable ID, timestamp, provenance, redaction status와 Analysis Job metadata는 만들지 마라. 이 metadata는 adapter와 Core가 채운다. 반환 직전 `proposals`의 각 `concept.originalExpression`이 실제 USER Event의 짧은 문자열인지 확인하고, 빠졌으면 그 Proposal을 제거하라.')
  assert.equal(createHash('sha256').update(prior).digest('hex'),
    'f04ce6392147c86d44b898bffc3cf0c6f9f753ef6fbbfa1e811e68dd35e9a585',
    'v1.0.6 inverse must reconstruct pinned v1.0.5')
  replaceOnce('> Prompt version: `1.0.5`', '> Prompt version: `1.0.4`')
  replaceOnce('\n\n`DEMONSTRATED`는 사용자가 현재 프로젝트의 실제 문제에 Concept를 사용해 내린 **확정적인 판단이나 지시**, 또는 수행한 수정·검증이 있을 때만 지지한다. 사용자가 코드를 직접 작성해야 하는 것은 아니다. 원리의 결과를 예측하거나 가능한 해결 방법을 제안한 뒤 맞는지 확인해 달라는 발언은 아직 그 방법을 현재 프로젝트에 채택하거나 적용한 근거가 아니다. 그런 발언에서 사용자가 독립적으로 제시한 원리·인과관계는 `PREDICTION` 또는 `REPHRASE`로 평가하고 최대 `EXPLAINED`까지만 제안하라. 실제로 선택한 이유 있는 제품·기술 방향은 코드가 아직 작성되지 않았더라도 `JUSTIFIED_DECISION`과 `DEMONSTRATED` 후보가 될 수 있다. 발언 전체가 아니라 각각의 주장과 행위에 이 구분을 적용하라.', '')
  replaceOnce('\n\n사용자가 앞선 Agent 설명을 토대로 말한다고 명시했는데 제공된 Episode에는 그 앞선 답의 핵심 내용이 없으면, 그 답이 방향만 제시했는지 이미 결론을 제공했는지 확인할 수 없다. 발언이 구체적이라는 이유로 `LIGHT_HINT`나 `INDEPENDENT`를 추정하거나 `STRONG` 상태 지지 Proposal을 만들지 마라. 의존성을 검증할 자료가 없는 해당 주장에는 상태 지지 Proposal을 보류하고 `noEvidenceReason`에 그 제한을 설명할 수 있다. 제공된 맥락에 답이 있다면 실제 겹치는 명제와 사용자가 새로 만든 판단을 비교해 claim별로 평가하라. 다른 독립적 판단이 분리되어 있고 그 근거를 확인할 수 있으면 해당 주장만 별도로 평가하라.', '')
  replaceOnce('같은 Task에서 방금 들은 설명을 바로 사용한 것은 Transfer가 아니다. 현재 프로젝트에 실제로 채택한 판단이나 수행한 적용이며 Agent의 답을 단순 반복한 것이 아닐 때에만 Demonstrated 후보다. 예상 방법을 설명한 것만으로는 최대 Explained이고, 직접 유도된 반복은 상태를 지지하지 않는다.',
    '같은 Task에서 방금 들은 설명을 바로 사용한 것은 Transfer가 아니라 Demonstrated 후보다.')
  replaceOnce('Episode 전체에서 사용자 Evidence가 없거나, 사용자가 앞선 Agent 답에 명시적으로 의존하는데 그 답이 제공되지 않았고 분리해 평가할 독립적인 주장도 없다면 가짜 상태 지지 Proposal을 만들지 말고 빈 `proposals`와 구체적인 `noEvidenceReason`을 반환하라. 앞선 Agent 답을 언급하지 않은 독립적인 첫 사용자 주장은 이 보류 조건에 해당하지 않는다. Proposal이 하나 이상이면 `noEvidenceReason`은 반환하지 마라.',
    'Episode 전체에서 사용자 Evidence가 없다면 가짜 `NONE` Proposal을 만들지 말고 빈 `proposals`와 구체적인 `noEvidenceReason`을 반환하라. Proposal이 하나 이상이면 `noEvidenceReason`은 반환하지 마라.')
  return prior
}
const historicalPrompt = historicalV104Prompt(currentPrompt)
assert.equal(createHash('sha256').update(historicalPrompt).digest('hex'),
  '157effa5142311acaf884b779a32f129c647212ed0420480d208d98e5b3dea8e',
  'historical v1.0.4 reconstruction drifted')
const models = [
  { family: 'HAIKU', id: 'claude-haiku-4.5', confirmed: true,
    source: 'IDE_CONFIG_OPTION' },
  { family: 'SONNET', id: 'claude-sonnet-4.5', confirmed: true,
    source: 'IDE_CONFIG_OPTION' },
]

function semanticResult(context, proposals = []) {
  return {
    schemaVersion: 1, episodeId: context.episode.id,
    episodeRevision: context.episode.revision,
    correlationId: context.correlationId, proposals,
    ...(proposals.length === 0 ? { noEvidenceReason: 'The user requested analysis only.' } : {}),
  }
}

function proposal(context, item, overrides = {}) {
  const source = context.events[0].sourceReferences[0]
  const expression = item.userAuthoredClaimExcerpt ?? item.userMessage.slice(0, 40)
  return {
    concept: { originalExpression: expression,
      proposedCanonicalName: 'Date boundary reasoning' },
    signal: 'PREDICTION', strength: 'MEDIUM', promptDependence: 'INDEPENDENT',
    userEvidenceSources: [source], contextSources: [],
    redactedEvidenceExcerpt: expression,
    rationale: 'A synthetic user statement contains a checkable consequence.',
    maximumSupportedState: 'EXPLAINED', misconception: { action: 'NONE' },
    ...overrides,
  }
}

test('reconstructs and pins the prior canonical prompt without changing the common transport', () => {
  const prior = derivePriorPrompt(historicalPrompt)
  const prompts = rolePrompts(historicalPrompt)
  assert.match(prior, /^> Prompt version: `1\.0\.3`$/m)
  assert.doesNotMatch(prior, /요청과 사용자가 실제로 제시한 내용 구분/)
  assert.match(historicalPrompt, /요청과 사용자가 실제로 제시한 내용 구분/)
  assert.equal(prompts['1.0.3'].prompt, prior)
  assert.equal(prompts['1.0.4'].prompt, historicalPrompt)
  assert.equal(prompts['1.0.3'].sha256.length, 64)
  assert.equal(prompts['1.0.4'].sha256.length, 64)
  assert.throws(() => rolePrompts(historicalPrompt.replace('## Evidence 신호', '## Other')),
    /ANALYST_EVAL_PROMPT_DRIFT/)
  assert.throws(() => rolePrompts(currentPrompt), /ANALYST_EVAL_PROMPT_VERSION_INVALID/)
})

test('the historical evaluator rejects current canonical v1.0.7 before a native model turn', async () => {
  let opened = 0
  await assert.rejects(runNativeAnalystSemanticEval({
    scope: { projectId: 'project_scope', workspace: '/scope/W', helper: '/scope/H' },
    models,
    openSession: async () => { opened += 1; throw new Error('SHOULD_NOT_OPEN_H') },
    openBarrier: async () => { throw new Error('SHOULD_NOT_OPEN_BARRIER') },
  }), /ANALYST_EVAL_PROMPT_VERSION_INVALID/)
  assert.equal(opened, 0)
})

test('builds three valid, separate synthetic USER_MESSAGE Episode contexts', async () => {
  const contracts = await import('../../../packages/contracts/dist/index.js')
  const ids = new Set()
  for (const [index, item] of fixture.cases.entries()) {
    const context = contracts.episodeContextSchema.parse(syntheticContext(item, index))
    assert.equal(context.events[0].payload.redactedExcerpt, item.userMessage)
    assert.equal(context.events[0].actor.kind, 'USER')
    assert.deepEqual(context.events[0].sourceReferences, [{ kind: 'USER_MESSAGE',
      conversationId: context.events[0].payload.conversationId,
      messageId: context.events[0].payload.messageId }])
    assert.equal(context.analysisJob, null)
    assert.equal(context.decisionContext, null)
    ids.add(context.episode.id)
  }
  assert.equal(ids.size, 3)
})

test('detects the H5-style false positive while preserving a claim inside a question', async () => {
  const contracts = await import('../../../packages/contracts/dist/index.js')
  const negative = fixture.cases[0]
  const negativeContext = syntheticContext(negative, 0)
  const falseDecision = proposal(negativeContext, negative, {
    signal: 'JUSTIFIED_DECISION', strength: 'STRONG',
    maximumSupportedState: 'DEMONSTRATED',
    rationale: 'The user asks for separation of confirmed and unverified results.',
  })
  const invalidSemantic = evaluateText(
    JSON.stringify(semanticResult(negativeContext, [falseDecision])),
    negativeContext, negative, contracts)
  assert.equal(invalidSemantic.schemaValid, true)
  assert.equal(invalidSemantic.sourceReferencesValid, true)
  assert.equal(invalidSemantic.coarseExpectationMatch, false)
  const validEmpty = evaluateText(JSON.stringify(semanticResult(negativeContext)),
    negativeContext, negative, contracts)
  assert.equal(validEmpty.coarseExpectationMatch, true)

  const positive = fixture.cases[1]
  const positiveContext = syntheticContext(positive, 1)
  const validPrediction = evaluateText(
    `\`\`\`json\n${JSON.stringify(semanticResult(positiveContext,
      [proposal(positiveContext, positive)]))}\n\`\`\``,
    positiveContext, positive, contracts)
  assert.equal(validPrediction.jsonForm, 'FENCED_JSON')
  assert.equal(validPrediction.schemaValid, true)
  assert.equal(validPrediction.sourceReferencesValid, true)
  assert.equal(validPrediction.coarseExpectationMatch, true)
  assert.equal(validPrediction.proposals[0].claimExcerptPresent, true)

  const reasonedChoice = fixture.cases[2]
  const choiceContext = syntheticContext(reasonedChoice, 2)
  const choice = proposal(choiceContext, reasonedChoice, {
    signal: 'JUSTIFIED_DECISION', strength: 'STRONG',
    maximumSupportedState: 'DEMONSTRATED',
  })
  const validChoice = evaluateText(JSON.stringify(semanticResult(choiceContext, [choice])),
    choiceContext, reasonedChoice, contracts)
  assert.equal(validChoice.coarseExpectationMatch, true)

  const wrongReference = proposal(positiveContext, positive, {
    userEvidenceSources: [{ kind: 'USER_MESSAGE',
      conversationId: positiveContext.events[0].payload.conversationId,
      messageId: negativeContext.events[0].payload.messageId }],
  })
  const wrong = evaluateText(JSON.stringify(semanticResult(positiveContext,
    [wrongReference])), positiveContext, positive, contracts)
  assert.equal(wrong.schemaValid, true)
  assert.equal(wrong.sourceReferencesValid, false)
  assert.equal(wrong.coarseExpectationMatch, false)
})

test('plans at most twelve sequential cells and skips Sonnet when its exact ID is unconfirmed', () => {
  assert.equal(planCells(models).length, MAX_TURNS)
  const skipped = planCells([models[0], { family: 'SONNET', id: null,
    confirmed: false, source: 'IDE_CONFIG_OPTION' }])
  assert.equal(skipped.filter(cell => cell.modelId === null).length, 6)
  assert.throws(() => planCells([models[0], { family: 'SONNET',
    id: 'claude-sonnet-auto', confirmed: true, source: 'IDE_CONFIG_OPTION' }]),
  /ANALYST_EVAL_MODEL_PLAN_INVALID/)
})

test('uses fresh attested H sessions, never returns prompt or model output, and stops on gate failure', async () => {
  const contracts = await import('../../../packages/contracts/dist/index.js')
  const opened = []
  const closed = []
  const sent = []
  const scope = { projectId: 'project_scope', workspace: '/scope/W', helper: '/scope/H' }
  const result = await runNativeAnalystSemanticEval({
    scope, models: [models[0], { family: 'SONNET', id: null,
      confirmed: false, source: 'IDE_CONFIG_OPTION' }],
    currentPrompt: historicalPrompt, contracts,
    openSession: async (receivedScope, modelId) => {
      assert.equal(receivedScope, scope)
      const instance = opened.length + 1
      opened.push(instance)
      return {
        modelId, windowId: 4,
        attestAfterBarrier: async id => assert.equal(id, 'sess_barrier'),
        prompt: async (text, _onUpdate, signal) => {
          assert.equal(signal.aborted, false)
          const json = text.match(/Bounded EpisodeContext JSON: ([^\n]+)/)?.[1]
          assert.ok(json)
          const context = JSON.parse(json)
          sent.push({ instance, promptVersion: text.match(/Prompt version: `([^`]+)`/)?.[1] })
          return { stopReason: 'end_turn', text: JSON.stringify(semanticResult(context)) }
        },
        close: () => closed.push(instance),
      }
    },
    openBarrier: async () => ({ windowId: 4,
      sessionIdForBarrier: 'sess_barrier' }),
  })
  assert.equal(result.status, 'PLAN_FINISHED')
  assert.equal(result.turns, 6)
  assert.equal(result.softTimeoutMs, 30_000)
  assert.equal(result.nativePromptRpcTimeoutMs, 240_000)
  assert.equal(result.observedCells, 6)
  assert.equal(result.skippedCells, 6)
  assert.equal(result.cells.length, 12)
  assert.equal(result.cells.filter(cell => cell.status === 'SKIP_MODEL_UNCONFIRMED').length, 6)
  assert.deepEqual(opened, [1, 2, 3, 4, 5, 6])
  assert.deepEqual(closed, opened)
  assert.equal(sent.length, 6)
  assert.equal(sent[0].promptVersion, '1.0.3')
  assert.equal(sent[1].promptVersion, '1.0.4')
  const serialized = JSON.stringify(result)
  for (const item of fixture.cases) assert.equal(serialized.includes(item.userMessage), false)
  assert.equal(serialized.includes('redactedEvidenceExcerpt'), false)
  assert.equal(serialized.includes('rationale'), false)

  let prompts = 0
  const failed = await runNativeAnalystSemanticEval({
    scope, models, currentPrompt: historicalPrompt, contracts,
    openSession: async () => ({ modelId: 'auto', windowId: 4,
      attestAfterBarrier: async () => undefined,
      prompt: async () => { prompts += 1 }, close: () => undefined }),
    openBarrier: async () => ({ windowId: 4,
      sessionIdForBarrier: 'sess_barrier' }),
  })
  assert.equal(failed.status, 'INCOMPLETE')
  assert.equal(failed.turns, 0)
  assert.equal(failed.cells.length, 1)
  assert.equal(failed.cells[0].errorCode, 'ANALYST_EVAL_MODEL_ATTESTATION_FAILED')
  assert.equal(prompts, 0)
})

test('a late end_turn after soft cancellation never becomes a completed cell', async () => {
  const contracts = await import('../../../packages/contracts/dist/index.js')
  let closes = 0
  const result = await runNativeAnalystSemanticEval({
    scope: { projectId: 'project_scope', workspace: '/scope/W', helper: '/scope/H' },
    models, currentPrompt: historicalPrompt, contracts,
    armSoftTimeout: onTimeout => { queueMicrotask(onTimeout); return () => undefined },
    openSession: async (_scope, modelId) => ({ modelId, windowId: 4,
      attestAfterBarrier: async () => undefined,
      prompt: async text => {
        await new Promise(resolve => setImmediate(resolve))
        const context = JSON.parse(text.match(/Bounded EpisodeContext JSON: ([^\n]+)/)[1])
        return { stopReason: 'end_turn', text: JSON.stringify(semanticResult(context)) }
      },
      close: () => { closes += 1 },
    }),
    openBarrier: async () => ({ windowId: 4, sessionIdForBarrier: 'sess_barrier' }),
  })
  assert.equal(result.status, 'INCOMPLETE')
  assert.equal(result.turns, 1)
  assert.equal(result.cells.length, 1)
  assert.equal(result.cells[0].status, 'FAILED')
  assert.equal(result.cells[0].errorCode, 'ANALYST_EVAL_SOFT_TIMEOUT_RACED')
  assert.equal(result.cells[0].softDeadlineExceeded, true)
  assert.equal(closes, 1)
})

test('confirmed soft cancellation is distinct from native hard RPC failure', async () => {
  const contracts = await import('../../../packages/contracts/dist/index.js')
  const scope = { projectId: 'project_scope', workspace: '/scope/W', helper: '/scope/H' }
  const base = {
    scope, models: [models[0], { family: 'SONNET', id: null,
      confirmed: false, source: 'IDE_CONFIG_OPTION' }],
    currentPrompt: historicalPrompt, contracts,
    armSoftTimeout: onTimeout => { queueMicrotask(onTimeout); return () => undefined },
    openBarrier: async () => ({ windowId: 4, sessionIdForBarrier: 'sess_barrier' }),
  }
  const confirmed = await runNativeAnalystSemanticEval({ ...base,
    openSession: async (_scope, modelId) => ({ modelId, windowId: 4,
      attestAfterBarrier: async () => undefined,
      prompt: async (_text, _onUpdate, signal) => {
        await new Promise(resolve => setImmediate(resolve))
        assert.equal(signal.aborted, true)
        throw Object.assign(new Error('NATIVE_H_CANCELLED_CONFIRMED'),
          { code: 'NATIVE_H_CANCELLED_CONFIRMED' })
      },
      close: () => undefined,
    }),
  })
  assert.equal(confirmed.turns, 6)
  assert.equal(confirmed.status, 'INCOMPLETE')
  assert.equal(confirmed.cells.filter(cell =>
    cell.status === 'SOFT_TIMEOUT_CONFIRMED').length, 6)

  const hardFailure = await runNativeAnalystSemanticEval({ ...base,
    openSession: async (_scope, modelId) => ({ modelId, windowId: 4,
      attestAfterBarrier: async () => undefined,
      prompt: async () => { throw Object.assign(new Error('NATIVE_RPC_TIMEOUT'),
        { code: 'NATIVE_RPC_TIMEOUT' }) },
      close: () => undefined,
    }),
  })
  assert.equal(hardFailure.turns, 1)
  assert.equal(hardFailure.status, 'INCOMPLETE')
  assert.equal(hardFailure.cells[0].errorCode, 'NATIVE_RPC_TIMEOUT')
  assert.equal(hardFailure.cells.length, 1)
})
