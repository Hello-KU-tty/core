# T19-N P2 깨끗한 Evidence 의미 경계

작성 기준: 2026-09-15. 이 문서는 P2의 source·fixture 설계, Core 계약과 후속 live 판정 경계를 기록한다. 실제 Kiro model 결과는 별도 [live clean evaluation 기록](T19_NATIVE_P2_LIVE_CLEAN_EVAL_20260915.md)에 귀속하며 runtime DB Evidence나 실제 사람의 학습 결과가 아니다.

## 결론

직접 인용 exact-substring 검사는 출처 문구가 실제 USER_MESSAGE에 있었음을 보장하지만 그 문구가 요청, 미래 계획, 설명, 선택 또는 실제 수행 중 무엇인지는 보장하지 않는다. 과거 G의 두 수락 사례는 이 차이를 드러냈다.

- 불변식 설명 하나가 실제 선택 없이 `JUSTIFIED_DECISION`으로 분류됐다.
- 앞으로 해야 할 재검증 규칙 하나가 수행 관찰 없이 `APPLICATION/DEMONSTRATED`로 분류됐다.
- 두 건 모두 인용문 자체는 원문과 일치했다.
- 같은 발언에 별개의 실제 브라우저 행동이 있었다는 사실은 인용한 미래 규칙이 수행됐음을 대신 증명하지 않는다.
- 기존 accepted Evidence와 파생 Concept State는 immutable provenance로 보존하며 소급 수정하거나 새 성공 근거로 사용하지 않는다.

Core가 일반 문장의 의미를 regex나 키워드로 판정하는 방법은 채택하지 않는다. 변경 전 Core가 결정적으로 확인한 사용자 근거는 USER_MESSAGE 원문, `DECISION_RESOLVED.rationaleProvided`, Episode/source scope뿐이었다. 이번 좁은 변경은 저장된 DecisionResolution의 실제 사용자 rationale/custom proposal까지 `JUSTIFIED_DECISION` 검증에 연결한다. `USER_ACTION` reference는 임의 user-authored Event ID를 가리키며 수행 완료라는 의미를 자체적으로 갖지 않는다.

## Prompt v1.0.6 경계

canonical Evidence Analyst prompt는 다음 의미 구분을 명시한다.

| 관찰 | 허용 Proposal | 최대 State | 필요한 근거 |
| --- | --- | --- | --- |
| 요청만 있음 | 없음 | 없음 | USER_MESSAGE가 요청 외 claim을 담지 않음 |
| 자기 설명 | `REPHRASE` | `EXPLAINED` | 직접 USER_MESSAGE와 확인 가능한 prompt dependence |
| 결과 예측 | `PREDICTION` | 기존 Strength·의존성 상한 | 사용자가 직접 제시한 구체적 결과. 독립적인 강한 예측은 기존 정책을 유지 |
| 미래 계획·의도 | 계획 자체는 상태 지지 `APPLICATION`이 아님. 별도 자기 설명·결과 예측은 각각 분리 | 자기 설명은 `EXPLAINED`, 결과 예측은 위 기존 상한 | 계획 자체는 수행으로 보지 않되 포함된 결과 명제를 일괄 낮추지 않음 |
| 실제 이유 있는 선택 | `JUSTIFIED_DECISION` | `DEMONSTRATED` | 같은 선택의 사용자 이유와 structured `USER_DECISION` |
| 실제 수행 적용 | `APPLICATION` | `DEMONSTRATED` | 인용한 user source가 이미 수행한 조치와 관찰 결과를 직접 보고 |

`INDEPENDENT`, `LIGHT_HINT`, `DIRECTLY_LED`는 각 case에 별도로 기록한다. Agent가 핵심 결론을 먼저 제공한 near-repeat는 실제 문장이 맞더라도 State를 지지하지 않는다. 앞선 Agent 답을 참조하지만 Episode에 그 내용이 없으면 독립성이나 약한 힌트를 추정하지 않는다.

Prompt 변경은 Analyst의 semantic proposal을 보수적으로 만든다. 이것만으로 악성·잘못된 Analyst 출력을 deterministic Core가 거절한다고 주장하지 않는다.

## Core의 현재 한계와 제안

### 현재 확인 가능한 것

- schema, Episode/project/task/correlation scope
- user-authored source가 현재 Episode에 실제 존재하는지
- cited USER_MESSAGE의 두 직접 인용 필드 exact substring
- cited `USER_DECISION`의 `DECISION_RESOLVED`, stored same-scope `DecisionResolution`, user rationale와 rationale/custom proposal exact quote
- strength, prompt dependence와 signal별 현재 state cap

### 구현한 최소 policy hardening

승인된 변경은 `JUSTIFIED_DECISION`에만 좁게 적용한다.

1. Proposal이 같은 Episode의 `USER_DECISION`을 직접 인용해야 한다.
2. cited `DECISION_RESOLVED`의 decision/resolution ID와 같은 project/task/correlation scope를 가진 저장된 사용자 `DecisionResolution`이 있어야 한다.
3. Event의 `rationaleProvided`와 저장된 비어 있지 않은 rationale이 함께 있어야 한다.
4. `concept.originalExpression`과 `redactedEvidenceExcerpt`가 그 rationale 또는 custom proposal의 exact substring이어야 한다.
5. 조건을 못 맞춘 `JUSTIFIED_DECISION`은 거절하고 다른 Signal로 자동 변환하지 않는다.

Application은 기존 Evidence submit transaction 안에서 Episode의 Task aggregate를 읽고 `decisionResolutions`만 pure domain evaluator의 내부 입력으로 넘긴다. 외부 wire schema, Activity payload와 DB migration은 바꾸지 않는다. `REPHRASE`, 기존 독립적 `PREDICTION`의 policy 상한과 자연어로 자기 보고한 실제 `APPLICATION`의 수용 가능성은 이번 변경에서 유지한다.

### 수행 provenance의 열린 tradeoff

제품은 현재 사용자의 자연어 발화를 Evidence로 사용하므로, 인용된 USER_MESSAGE가 이미 수행한 조치와 관찰한 결과를 직접 보고하면 `APPLICATION` 후보가 될 수 있다. Core는 인용문 존재와 scope를 검증하지만 자기 보고의 사실성을 독립적으로 입증하지는 않는다. Analyst는 같은 메시지에 섞인 수행 보고와 미래 규칙을 분리하고 이 provenance 한계를 남겨야 한다.

더 강한 수행 provenance가 필요하다면 additive `USER_ACTION_PERFORMED` payload는 후속 선택지가 될 수 있다. 최소 의미 후보는 다음과 같다.

- Core가 발급한 Event ID와 Project/Task/Episode scope
- 제한된 `actionKind`
- `COMPLETED` 또는 `FAILED` outcome
- 사용자가 실제 UI에서 수행했음을 만드는 Application command provenance
- 필요하면 bounded redacted user-authored summary와 기존 test/result reference

이 Event는 이번 승인 계약이나 positive APPLICATION의 필수 조건이 아니다. 채택한다면 일반 USER_MESSAGE의 과거형 문법이나 `USER_ACTION`이라는 reference 이름만으로 합성하지 않고, 정확한 action kind와 UI command를 제품 surface 검토 뒤 계약·Application·storage·migration·negative test와 함께 설계해야 한다.

## 깨끗한 semantic fixture

[`evidence-analyst-v1.0.6-clean-semantics.json`](../../tests/eval/fixtures/prompt-regressions/evidence-analyst-v1.0.6-clean-semantics.json)은 개인정보 없는 합성 UI 발화로 다음을 고정한다.

1. request-only: Proposal 0
2. LIGHT_HINT 뒤 미래 계획: `PREDICTION/REPHRASE`, 최대 `EXPLAINED`
3. 독립적인 자기 설명: `REPHRASE`, 최대 `EXPLAINED`
4. 방향만 제시받은 실제 이유 있는 선택: USER_MESSAGE + `USER_DECISION`, `JUSTIFIED_DECISION/DEMONSTRATED`
5. 직접 수행했다고 보고한 적용: USER_MESSAGE의 완료 조치·관찰 결과, `APPLICATION/DEMONSTRATED`; 자연어 자기 보고 한계를 명시
6. Agent 핵심 결론의 near-repeat: `DIRECTLY_LED`, State 지지 없음
7. unseen cache domain의 미래 규칙: `PREDICTION/REPHRASE`, 최대 `EXPLAINED`, `APPLICATION` 금지

이 fixture의 `modelRunStatus`는 source 작성 시점의 `NOT_RUN`으로 보존한다. JSON expectation과 prompt wiring test 자체는 native model compliance를 증명하지 않으며, 후속 실행 사실을 fixture에 소급 기입하지 않는다.

## 후속 live 판정

일반 Kiro의 0.1.2 VSIX에서 exact catalog-confirmed `claude-sonnet-4.5` 하나로 13-cell 평가를 실행했다. retry 0, runtime Core mutation 0, final idle 확인과 13/13 `COMPLETE`를 충족했지만 overall deterministic 결과는 `FAILED`였다.

- Analyst strict oracle은 2/7 `PASSED`였다. 미래 계획의 약한 `APPLICATION`, 일반 조건 정의와 사후 관찰의 강한 `PREDICTION/DEMONSTRATED`, `USER_DECISION` 없는 cache 미래 규칙의 `JUSTIFIED_DECISION`이 실제 semantic regression으로 남았다.
- 2/7을 일반 정확도로 해석하지 않는다. canonical의 복합 claim 분리와 exact one-Proposal oracle이 충돌하고, `actual_reasoned_choice`의 full Agent Decision context가 사용자 이유와 겹쳐 positive fixture 자체가 오염됐다.
- Helper/Discovery 6개는 deterministic input/output contract를 통과했다. Helper는 네 조건의 핵심 행동이 같아 뚜렷한 행동상 개인화 이득이 없었고, Discovery Ledger-on은 공간 경계 analog에 집중했지만 명시적 근거 연결이나 실용 우위는 입증하지 못했다.
- 단일 stochastic 비교를 인과 효과나 사람 학습으로 일반화하지 않는다. Need-absent와 truly held-out goal도 아직 실행하지 않았다.

자세한 cell별 결과, hash, runtime 불변성과 다음 fixture/oracle 수정 순서는 [live 기록](T19_NATIVE_P2_LIVE_CLEAN_EVAL_20260915.md)을 따른다. 기존 fixture와 metadata는 retcon하지 않는다.

## Personalization 2×2 평가

이전 A′/B는 B에서 `personalization`과 `relevantLedgerEntries`만 제거하고 `recentEpisodes`를 남겼으므로 no-history 대조군이 아니었다. 새 Helper 평가는 아래 네 cell을 사용한다.

| Cell | curated Ledger | recent Episodes | 판정 목적 |
| --- | ---: | ---: | --- |
| L0_R0 | 없음 | 없음 | 중립 기준선 |
| L1_R0 | 깨끗한 accepted Evidence 1건 | 없음 | Ledger의 독립 효과 |
| L0_R1 | 없음 | Helper가 결론을 준 최근 대화 | 대화 연속성과 curated Evidence 혼동 여부 |
| L1_R1 | 같은 clean Evidence | 같은 최근 대화 | 두 provenance를 함께 주되 혼합하지 않는지 |

모든 cell은 정확히 같은 Helper 질문, current Project context, canonical prompt version, model ID와 host 설정을 사용한다. 실제 실행 때 그 값을 기록하며 일부 cell만 retry·model을 다르게 쓰지 않는다. Ledger item은 synthetic이지만 독립적으로 작성된 `REPHRASE/EXPLAINED`이며, fixture와 같은 문구·Signal·의존성·State가 새 in-memory Application path에서 Core에 수락됨을 integration test로 확인했다. 이 deterministic 수락은 live Analyst 출력이나 사람 학습 증거가 아니다. 최근 Episode에는 accepted Evidence를 넣지 않고, Helper가 핵심 결론을 먼저 제공했다는 dependence를 명시한다.

Deterministic 평가는 입력 hash, model/config identity, Ledger/Episode toggle, source ID, prompt dependence와 오염 Evidence 부재를 검사한다. 답변이 실제로 더 유용한지, 최근 대화가 accepted Evidence처럼 과장되지 않는지와 출처 연결의 자연스러움은 rubric을 가진 human review에서 `NEEDS_REVIEW`로 판정한다.

unseen Discovery는 recent Episode를 입력하지 않는다. 같은 Learning Goal·Personal Need·model/config에서 clean Ledger off/on 두 조건만 비교하고, 과거 Evidence가 흥미·실용성을 대체하는 curriculum이 아니라 관련 tie-break/context로 유용한 차이를 만드는지 정성 rubric으로 검토한다.

## 실행·데이터 경계

- 새 평가 DB 또는 in-memory fixture만 사용한다.
- runtime DB의 기존 Evidence, Decision, Ledger를 seed/update/delete하지 않는다.
- 과거 G 수락 행과 파생 state를 성공 조건이나 clean input으로 재사용하지 않는다.
- 합성 UI 입력, fixture expectation, native model result와 실제 사용자의 학습을 각각 구분한다.
- live run이 있다면 model ID, prompt version, input/context hash, retry, source provenance와 hint dependence를 cell별로 기록한다.
- fixture만으로 model이 규칙을 따른다거나 사용자가 학습했다고 주장하지 않는다.

## 현재 구현 상태

- Prompt v1.0.6 source와 adapter version을 맞췄다.
- semantic case fixture, 2×2 Helper plan, unseen Discovery pair와 deterministic fixture regression을 추가했다.
- `JUSTIFIED_DECISION`의 cited Event→stored DecisionResolution→rationale/custom proposal exact quote guard를 Core/Application에 구현했다. 2×2용 exact clean `REPHRASE/EXPLAINED` 문구도 새 in-memory Application path에서 수락되는 integration fixture로 고정했다.
- 기존 독립적 `PREDICTION` 상한과 자연어 수행 보고 `APPLICATION`은 유지했다. performed-action contract는 승인된 필수 조건이 아니라 열린 tradeoff다.
- Crew package build의 expected Analyst prompt version은 1.0.6으로 동기화했고 P1/root의 조율된 typecheck·build가 통과했다. P2가 별도로 shared bundle을 생성하거나 덮어쓰지는 않았다.
- 0.1.2 installed command의 13-cell live 계획은 전부 종료됐지만 semantic/oracle 판정이 실패했고 Helper/Discovery 효과가 미입증이므로 P2를 완료로 표시하지 않는다.

## 공유 결정 기록에 제안할 문안

`docs/DECISIONS.md`에는 승인된 좁은 결정을 기록했다.

> Evidence의 직접 인용 검증과 의미 검증을 분리한다. Core는 문장 regex로 요청·계획·설명·선택·수행을 판정하지 않는다. `JUSTIFIED_DECISION`은 rationale이 있는 structured USER_DECISION과 저장된 같은 scope의 DecisionResolution, 실제 rationale/custom proposal 인용을 요구한다. 기존 `PREDICTION`·자연어 수행 보고 `APPLICATION` 정책은 유지하고, 더 강한 performed-action Event는 열린 tradeoff로 남긴다. 기존 오수락 Evidence는 immutable provenance로 보존하되 새 성공 근거에서 제외한다.

`docs/TASKS.md`의 T19-N 진행 기록에는 source 경계와 별도로 live 실패·정성 판정을 추가한다.

> P2의 13-cell native 계획은 retry와 Core mutation 없이 전부 종료됐지만 Analyst strict oracle은 2/7만 통과했고 전체 deterministic 결과는 실패했다. Helper/Discovery contract는 6/6 통과했어도 행동상 개인화 이득과 인과 효과는 입증하지 못했다. positive choice fixture의 Agent hint contamination과 one-Proposal oracle 충돌을 먼저 고친 뒤 정의·사후 관찰·실제 예측을 구분해 재평가한다. 과거 오수락 DB와 현재 fixture를 성공으로 retcon하지 않는다.
