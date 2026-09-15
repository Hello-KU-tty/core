# T19-N P2 clean-semantics native harness 준비

작성 기준: 2026-09-15. 이 문서는 합성 입력 기반 native 평가 harness의 source 준비 상태만 기록한다. 실제 Kiro 모델 호출, runtime DB 변경, 일반 Kiro 설치·활성화 또는 사람의 학습 판정 결과가 아니다.

## 결론

P2의 13-cell clean 평가를 실행할 수 있는 두 개의 주입형 runner, 합성 input factory, 단일 command orchestration module과 deterministic regression test를 준비했다.

- Evidence Analyst v1.0.6: semantic case 7개
- Helper: curated Ledger on/off × recent Episodes on/off 4개
- unseen Discovery: Personal Need가 있는 동일 입력의 Ledger off/on 2개

기존 `native-analyst-semantic-eval.cjs`는 v1.0.3/v1.0.4 historical evaluator로 그대로 보존한다. current v1.0.6을 거절하는 hash/version gate를 우회하거나 옛 prompt를 강제로 사용하지 않는다. 기존 `native-helper-ablation.cjs`도 실제 G context의 두 cell을 비교하는 historical source로 보존하며 clean 2×2 성공 근거로 재사용하지 않는다.

새 runner는 fixture, canonical role prompt, contracts, prompt composer, protected session opener, barrier와 idle assertion을 모두 caller에게서 주입받는다. module 초기화 때 repository-relative prompt·fixture·dist 파일을 읽지 않으므로 packaged extension이 검증된 runtime asset과 현재 contracts를 명시적으로 전달할 수 있다.

## 실행 입력

### Analyst 7 cells

`runNativeAnalystCleanSemantics`의 필수 입력은 다음과 같다.

- v1.0.6 clean fixture와 canonical v1.0.6 role prompt
- `episodeContextSchema`, `analystSemanticResultSchema`를 포함한 contracts
- `composeNativeProtectedAnalystPrompt`와 synthetic provenance
- catalog에서 확인한 하나의 model ID, 확인 source와 노출된 configuration 또는 `NOT_EXPOSED`
- inspection으로 확인한 exact window ID
- protected H `openSession`, common-window `openBarrier`, worker/backend `assertIdle`

각 fixture case는 schema-valid synthetic `EpisodeContext`가 된다. Agent가 앞에서 기여한 case에는 별도의 `HELPER_RESPONSE` Event가 USER_MESSAGE보다 먼저 들어간다. 이 Agent Event는 dependence context일 뿐 direct user Evidence가 아니다. reasoned-choice case는 DECISION Episode, USER_MESSAGE, user-authored `DECISION_RESOLVED`, full Decision request/resolution과 rationale을 같은 project/task/correlation scope로 연결한다.

### Helper 2×2와 Discovery pair

`runNativePersonalizationMatrix`는 위 host/model 의존성과 함께 다음 synthetic input을 받는다.

- neutral, schema-valid `HelperContext`
- neutral, schema-valid PREVIEW `ProjectSessionSnapshot`
- exact clean `REPHRASE/EXPLAINED/INDEPENDENT` acceptance attestation
- 그 Evidence ID를 가진 clean Concept Ledger entry
- Helper와 Discovery 목적에 맞는 personalization basis
- accepted Evidence를 담지 않은 DIRECTLY_LED recent Helper Episode summary
- `createDiscoveryEphemeralContext`와 Helper/Discovery standalone composers
- 과거 오수락 source가 들어오면 pre-model에서 거절할 forbidden provenance token 목록

L0 cell도 `personalization` 필드를 삭제하지 않는다. `NO_RELEVANT_EVIDENCE`, 빈 basis와 fallback reason으로 schema-valid하게 유지한다. L1은 동일 trace scope에서 clean basis와 Ledger 하나만 넣는다. R1은 동일 recent Episode 하나만 넣는다. Helper의 나머지 project/task/spec/live/freshness/context fields는 동일하다.

Discovery는 existing pure `createDiscoveryEphemeralContext`로 두 PREVIEW context를 만든다. Learning Goal과 Personal Need는 동일하고 `relevantLedgerEntries`와 `personalization`만 바뀐다. protected H에는 MCP가 없으므로 이 turn은 durable Discovery submit이 아니다. standalone synthetic no-submit wrapper가 preview tool-input JSON을 반환하게 하고 계약만 검증한다.

현재 pair는 Personal Need가 있는 unseen input만 다룬다. Need-absent 비교는 이번 13-cell 결과로 주장할 수 없으며 필요하면 별도 fixture와 turn budget 승인이 필요하다.

## 결정적 판정과 사람 검토 경계

Analyst runner는 다음을 결정적으로 검사한다.

- result schema와 Episode revision/correlation envelope
- fixture가 허용한 direct user source set과 실제 Episode Event의 일치
- `concept.originalExpression`과 Evidence excerpt가 cited USER_MESSAGE 또는 cited Decision rationale/custom proposal에 실제 포함되는지
- Agent Event가 direct Evidence로 바뀌지 않는지
- proposal count, Signal, Strength, prompt dependence, maximum state와 forbidden Signal
- request-only의 빈 결과, directly-led proposal의 state-support 0

따라서 미래 cache 규칙을 exact USER_MESSAGE로 인용했더라도 `APPLICATION/DEMONSTRATED`면 실패다. deterministic Core가 일반 문장 의미를 판정한다고 가장하지 않으며, fixture oracle을 Core 수락 여부로 덮지 않는다.

Analyst의 schema/source/fixture contract oracle 자체는 사람 판정이 필요 없다는 뜻으로 `contractOracleHumanReviewStatus=NOT_REQUIRED`를 기록한다. 실제 모델 문장이 해당 의미 구분을 충실하게 해석했는지는 별도 `semanticInterpretationReviewStatus=NEEDS_REVIEW`와 overall `humanReviewStatus=NEEDS_REVIEW`로 남겨 root가 응답을 검토한다.

Helper/Discovery runner의 deterministic 검사는 schema, common-input hash, 허용 toggle, model/window identity, prompt/input hash, polluted provenance 부재, 응답 존재와 Discovery preview contract/scope까지만 담당한다. 다음 항목은 cell마다 `NEEDS_REVIEW`로 남긴다.

- L1_R0이 공식 재설명을 줄이고 이미 설명한 경계 관계를 다음 검증 또는 선택에 유용하게 연결하는지
- L0_R1이 대화 연속성만 사용하고 독립적 학습 또는 accepted Evidence라고 과장하지 않는지
- L1_R1이 curated Ledger와 recent Episode의 provenance를 구분하는지
- 문구만 달라지고 행동 추천 또는 오류 예방 이득이 없으면 `EFFECT_INSUFFICIENT`인지
- unseen Discovery 차이가 관련 tie-break이지 curriculum 대체가 아닌지

합성 Core context, 실제 native model output과 실제 사람 학습은 서로 다른 층이다. 모델 응답이나 fixture만으로 사람의 학습을 주장하지 않는다.
동일 model/config의 단일 stochastic pair도 personalization의 인과 효과를 확정하지 않는다. 이번 Discovery 입력은 기존 Campus Drop을 복제하지 않은 새 합성 가구 경계 domain이라는 뜻에서 fresh다. 실제 사용자 goal 대비 truly held-out 여부와 P4의 Personal Need-absent 비교는 별도 미완료 gate다.

## 실행 불변식

- 총 최대 13 turns: Analyst 7 + Helper 4 + Discovery 2
- 모든 cell은 root가 선택하고 catalog로 확인한 같은 exact model ID 사용
- Sonnet 또는 다른 model을 source에서 가정하거나 강제하지 않음
- cell마다 fresh protected H session, 동일 exact window, barrier 이후 attestation
- prompt 전후 worker/backend idle, all-deny/no-tool protected route
- serial execution, cell retry 0, operational gate failure 시 즉시 중단
- response가 늦게 끝나거나 잘못된 schema여도 성공으로 relabel하지 않음
- Core mutation count 0, runtime DB seed/update/delete 0

노출되지 않은 temperature와 sampling configuration은 추정하지 않고 `NOT_EXPOSED`로 기록한다. model answer는 display용 결과와 metadata를 분리해 progress/private metadata에 원문이 섞이지 않게 한다.

## production prompt byte 경계

`native-agent-relay.ts`에 있던 Helper/Analyst protected prompt 조립을 side-effect-free `native-protected-prompt.ts`로 옮겼다. provenance를 생략한 production 분기는 기존 body와 byte-identical하다. synthetic 분기는 다음 사실을 명시한다.

- Core가 synthetic cell에 대해 실제 context query를 실행하지 않았다.
- Core state를 읽거나 변경하지 않는다.
- 합성 Episode가 durable Evidence 또는 사람 학습 결과가 아니다.

literal body test와 actual relay integration test가 production 조립 결과를 exact equality로 비교한다. canonical Agent prompt 내용과 version은 변경하지 않았다.

## 단일 command orchestration

P2 module `registerNativeCleanEvaluationCommand(vscode, deps)`는 `vibeHelper.nativeCleanEvaluationRun` 하나만 등록한다. P1-owned `extension.cjs`와 manifest에는 이 module의 registration hook만 연결한다. command는 다음 순서를 강제한다.

1. read-only Core restore와 `UI_READ_ANALYSIS_JOBS` idle 확인 뒤 native worker isolated-evaluation lease를 얻는다.
2. protected H model catalog inspection 결과만 QuickPick에 내고 사용자가 고른 exact available ID 하나를 확정한다. Sonnet 4.5는 catalog에 실제 있을 때만 첫 항목으로 정렬하며 자동 선택·강제하지 않는다.
3. 최대 13 turn, retry 0, synthetic input, Core mutation 0과 review 필요성을 modal confirmation으로 다시 알린다.
4. `packagedRuntime()`에서 검증한 Analyst v1.0.6, Helper v1.2.0, Discovery v1.3.5 bytes와 bundle-time static fixture/contracts/composers를 주입한다.
5. Analyst runner를 먼저 실행한다. semantic oracle mismatch는 독립 cell과 phase 2를 계속하되 deterministic `FAILED`로 남기고, transport/policy/idle 같은 operational failure는 즉시 중단해 phase 2를 실행하지 않는다.
6. 같은 model/window로 Helper 2×2와 Discovery pair를 실행하고 마지막 idle을 한 번 확인한다. 실패한 final idle은 자동 재시도하거나 성공으로 바꾸지 않는다.
7. 모델 원문을 제외한 metadata만 private `0600` artifact에 기록한다. synthetic answer는 redaction·HTML escape 후 `enableScripts:false`, `localResourceRoots:[]`, CSP `default-src 'none'; style-src 'unsafe-inline'`인 임시 webview에만 표시한다.
8. lease는 항상 `resume:false`로 종료하고 실제 Core mutation command 또는 DB write를 호출하지 않는다.

runtime scope의 project ID와 restored current Task ID는 forbidden provenance token으로 자동 포함한다. 따라서 matrix의 합성 context가 현재 runtime/과거 G context를 재사용하면 model session을 열기 전에 실패한다. 추가 고정 token은 DI로 더할 수 있지만 DB row를 읽어 합성 fixture에 복사하지 않는다.

등록 시 `getNativeWorker: () => nativeWorker` getter를 전달해야 한다. registration 시점의 `null` 값을 캡처하면 안 된다. 나머지 의존성은 existing `packagedRuntime`, `connectLocalCore`, `configuredConnection`, protected H opener/barrier, 두 idle assertion, `uiMetadata`와 redactor다. command module이 요구하는 VS Code surface는 command registration, QuickPick, modal warning, progress, information message, webview, `ProgressLocation.Notification`과 `ViewColumn.Beside`로 한정한다.

두 runner의 직접 호출 형태는 다음과 같다.

```text
runNativeAnalystCleanSemantics({
  fixture, rolePrompt, composeAnalystPrompt, contracts,
  model, expectedWindowId, scope,
  openSession, openBarrier, assertIdle, signal, onCell
})

runNativePersonalizationMatrix({
  fixture, contracts,
  helperRolePrompt, discoveryRolePrompt,
  composeHelperPrompt, composeDiscoveryPrompt, createDiscoveryContext,
  helperBaseContext, discoveryBaseSnapshot,
  cleanLedgerEntry, helperBasis, discoveryBasis, recentEpisode,
  cleanEvidenceAttestation, forbiddenProvenanceTokens,
  model, expectedWindowId, scope,
  openSession, openBarrier, assertIdle, signal, onCell
})
```

`composeNativeProtectedHelperPrompt`와 `composeNativeProtectedAnalystPrompt`는 local-backend build output에서 bundle에 포함할 수 있다. Discovery standalone composer는 반드시 `SYNTHETIC_REDACTED_EVAL_INPUT`, no-submit과 no-Core-mutation을 명시하고 exact PREVIEW context/tool metadata를 한 번만 포함해야 한다.

## 현재 source 검증

Node 24.19.0에서 다음 focused 결과를 확인했다.

- native Analyst clean runner: 5/5 pass
- native personalization matrix runner와 실제 합성 input factory: 6/6 pass
- native clean evaluation command orchestration: 6/6 pass
- pure prompt composer와 actual relay regression: 9/9 pass
- local-backend package no-emit typecheck: pass

아직 실행하지 않은 P2 항목은 실제 native model 13 cells와 root의 human review다. P1-owned command/manifest hook의 package·activation 결과는 P1 기록을 source of truth로 삼으며 이 문서는 live 실행을 완료로 표시하지 않는다.
