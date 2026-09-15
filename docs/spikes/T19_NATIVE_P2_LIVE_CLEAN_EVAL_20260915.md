# T19-N P2 native clean evaluation 실측

작성 기준: 2026-09-15. 이 문서는 일반 Kiro에 설치한 0.1.2 VSIX의 bounded synthetic evaluation 결과를 기록한다. 입력은 `SYNTHETIC_REDACTED_EVAL_INPUT`이며 실제 사용자 Evidence, 실제 사람의 학습 또는 runtime Core acceptance 결과가 아니다.

## 판정

13개 cell의 native 실행과 host 안전 gate는 끝났지만 전체 deterministic 판정은 `FAILED`다.

- 13/13 cell이 `COMPLETE`, retry 0, runtime Core mutation 0, final idle 확인을 충족했다.
- Analyst strict fixture oracle은 7개 중 `request_only`, `directly_led_repeat` 두 개만 `PASSED`였다.
- Helper 4개와 Discovery 2개는 입력 불변식·출력 contract 기준으로 6/6 `PASSED`였다.
- root 정성 검토에서는 Helper의 뚜렷한 행동상 개인화 이득과 Discovery의 실용적 우위를 입증하지 못했다.
- Analyst 2/7을 일반 의미 정확도로 해석하면 안 된다. 일부 mismatch는 실제 의미 회귀지만, exact 1 Proposal oracle과 이유 있는 선택 positive fixture 자체에도 결함이 확인됐다.

따라서 `PLAN_FINISHED`는 정해진 실행 계획이 transport 실패 없이 끝났다는 뜻일 뿐 품질 성공이 아니다. metadata의 overall `deterministicStatus`는 `FAILED`, `humanReviewStatus`는 `NEEDS_REVIEW`다. T19-N은 `[~]`를 유지한다.

이번 결합 baseline에서 P1은 package/install/activation과 idle reconnect라는 제한된 범위를 통과했고, P2 strict semantic gate는 실패했다. P1의 bounded PASS를 active-operation reconnect나 전체 제품 PASS로 확대하지 않는다.

현재 0.1.2 결과 webview 상단은 `PLAN_FINISHED`와 `NEEDS_REVIEW`를 중심으로 보여 overall deterministic `FAILED`가 metadata보다 덜 드러난다. 후속 UI는 실행 완료와 품질 판정을 동시에 명시해야 하지만 이번 baseline code·UI와 이미 만든 package를 소급 수정하지 않는다.

## 실행 귀속과 무결성

- 설치물: Vibe Helper VSIX 0.1.2
- host: 일반 Kiro 창, `windowId=2`, Kiro와 Vibe Helper Webview 모두 `parentId=2`
- model: catalog에서 실제 확인하고 QuickPick으로 선택한 exact `claude-sonnet-4.5`
- model source: `IDE_CONFIG_OPTION`
- 노출되지 않은 model configuration: `NOT_EXPOSED`
- prompt: Evidence Analyst 1.0.6, Helper 1.2.0, Discovery 1.3.5의 packaged canonical bytes
- turns: Analyst 7 + Helper 4 + Discovery 2 = 13/13
- fresh protected H session per cell, serial execution, retry 0
- Core mutation count 0, final idle `true`, phase 2 `RUN`
- 총 model 구간 224,622ms, cell 경과 합계 251,173ms

metadata는 `/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-native-clean-eval-L1kDyY/metadata.json`에 mode `0600`으로 남았다. 파일 SHA-256은 `22d592c6d1241f5f55ceb93a5efd7c8a4579ddf87caade5faaba196f5eaa30f7`이다. 이 파일에는 모델 답변 원문이 없고 cell별 상태, hash, 판정과 timing만 있다.

위 deterministic 수치와 Proposal 요약은 metadata에서 확인했다. 정성 판정은 root가 scripts-disabled 결과 webview에서 Analyst의 핵심 오분류, Helper 답변 4개 전체와 Discovery 후보 20개 전체를 직접 시각 검토한 결과다. 원문을 metadata나 이 문서에 복제하지 않았다.
root의 정성 검토는 실제 사용자의 검토가 아니며 immutable run metadata의 `humanReviewStatus=NEEDS_REVIEW`를 변경하지 않는다.

주요 hash는 다음과 같다.

| 대상 | SHA-256 |
| --- | --- |
| fixture | `0b61ba1f0757389642cd04db10125c212ad4ba9a8720c051c7bfa740e46b97e9` |
| Analyst prompt | `cca647d8ce223ae43682c6fc6a7e055809eba2066ca6694df3b18433749a9281` |
| Helper prompt | `c6a96ee7d34510e8097b8082bcc087f185ca915257023b8340089f88ed193231` |
| Discovery prompt | `d3af4d4906a22e79225055668d500a2fd6303ea31ca35cf38cf9925dcc3d2c9d` |
| Helper common invariant | `fa97018845fbffb522e37bfdbbe22b329c67b2d6a3a463e440e433905a308ed7` |
| Discovery common invariant | `1f8448191bf5ee96b66abe8b43686a16ff4e76691b253764b1c45f4ebec5df89` |

fixture hash는 source JSON file bytes의 hash가 아니라 runner가 `JSON.stringify(fixture)`로 직렬화한 값의 SHA-256이다.

## Analyst 결과

모든 7개 output은 schema, envelope, direct source reference와 exact quote provenance 검사를 통과했다. 실패는 fixture의 claim별 Signal·Strength·dependence·state/count expectation과 실제 Proposal의 차이다.

| Case | 실제 Proposal 요약 | deterministic | 판정 |
| --- | --- | --- | --- |
| `request_only` | Proposal 0 | `PASSED` | 요청만 있는 문장을 상태 근거로 만들지 않았다. |
| `future_plan_after_light_hint` | `PREDICTION/MEDIUM/LIGHT_HINT/EXPLAINED` + `APPLICATION/WEAK/LIGHT_HINT/null` | `FAILED` | 예측 분리는 맞지만, state를 올리지 않더라도 미래 계획에 `APPLICATION` Signal을 붙인 것은 precondition 위반이다. |
| `own_explanation_independent` | `REPHRASE/STRONG/INDEPENDENT/EXPLAINED` + `PREDICTION/STRONG/INDEPENDENT/DEMONSTRATED` | `FAILED` | “그 값이 방 너비보다 크면 가구가 방 밖으로 나간 상태”라는 일반 조건 정의를 별도 강한 결과 예측으로 올렸다. 정의와 실제 미래 결과 예측의 구분이 부족한 genuine regression이다. |
| `actual_reasoned_choice` | `JUSTIFIED_DECISION/STRONG/INDEPENDENT/DEMONSTRATED` 2개 | `FAILED` | exact 1 Proposal과 `LIGHT_HINT` 기대에는 어긋났지만 positive fixture가 오염돼 clean 성공·실패 근거로 쓸 수 없다. |
| `actual_performed_application` | `APPLICATION/STRONG/INDEPENDENT/DEMONSTRATED` + `PREDICTION/STRONG/INDEPENDENT/DEMONSTRATED` | `FAILED` | 수행 적용은 잡았지만 “450에서 100으로 바꾼 뒤 경계 초과를 확인”한 과거 관찰도 추가 강한 예측으로 분류했다. 사후 관찰과 미래 예측 구분이 부족한 genuine regression이다. |
| `directly_led_repeat` | `REPHRASE/NONE/DIRECTLY_LED/null` | `PASSED` | Agent가 먼저 준 결론의 반복을 state 지지로 사용하지 않았다. |
| `unseen_cache_future_rule_not_application` | `JUSTIFIED_DECISION/STRONG/LIGHT_HINT/EXPLAINED` + `PREDICTION/MEDIUM/LIGHT_HINT/EXPLAINED` | `FAILED` | 사용자 선택·`USER_DECISION` 없이 미래 규칙을 `JUSTIFIED_DECISION`으로 만들었다. |

마지막 cache Proposal은 새 deterministic Core guard라면 cited `USER_DECISION`과 stored same-scope `DecisionResolution`이 없어 수락 요건을 충족하지 못한다. 그러나 이번 command는 synthetic Analyst contract evaluation만 수행했고 Core Evidence submit/acceptance를 실행하지 않았다. 따라서 실제 Core가 이 Proposal을 기각했다고 기록하지 않는다.

### 이유 있는 선택 fixture 오염

`actual_reasoned_choice`의 `precedingAgentContribution`은 선택지만 제시하는 가벼운 방향 힌트처럼 보이지만, runner가 만든 full Decision request에는 다음 Agent-authored 내용이 이미 있었다.

- option A tradeoff: `사용자 비율이 달라질 수 있습니다.`
- recommendation rationale: `사용자 입력 비율을 임의로 바꾸지 않습니다.`

이는 사용자의 “자동으로 가구 크기를 바꾸면 사용자가 정한 비율이 깨진다”는 이유와 실질적으로 겹친다. 실제 출력이 두 개의 `JUSTIFIED_DECISION`을 `INDEPENDENT`로 분리했고 oracle의 one-count/`LIGHT_HINT` expectation에 실패했지만, 이 입력은 clean positive choice Evidence가 아니다. 기존 fixture나 이번 metadata를 소급해 고치거나 성공으로 재해석하지 않는다.

또한 canonical prompt는 복합 사용자 발화의 독립 claim을 분리하도록 요구한다. fixture가 모든 positive case에 정확히 Proposal 하나만 강제하면 올바른 claim 분리까지 실패로 셀 수 있다. 그러므로 2/7은 회귀 신호와 oracle 결함을 함께 포함하며 모델의 일반 정확도 수치가 아니다.

## Helper 2×2 root 정성 검토

네 조건 모두 방 크기 변경 뒤 전체 가구 재검사, 경계 초과 표시, Undo 복구를 같은 핵심 행동으로 제안했다.

- L1_R0만 과거의 `x + width` 경계 설명을 명시적으로 다음 검증에 연결했다.
- recent-only L0_R1을 포함해 recent 대화를 accepted Evidence나 독립적 사용자 학습이라고 과장한 표현은 확인되지 않았다.
- 그러나 네 답의 행동 추천과 오류 예방은 거의 같았다. 문구·출처 언급 차이를 넘어선 뚜렷한 개인화 이득은 입증되지 않아 `EFFECT_INSUFFICIENT`다.
- 한 model/config의 단일 stochastic 2×2이므로 이 차이를 Ledger의 인과 효과로 일반화하지 않는다.

Deterministic 4/4 `PASSED`는 answer presence, model/window identity, input/prompt hash와 허용된 Ledger/Episode toggle을 검증했다는 뜻이다. 실용성 성공이나 학습 효과를 뜻하지 않는다.

## Discovery pair root 실용성 검토

Ledger off/on 모두 10개씩, 총 20개의 전반적으로 유용한 contract-valid·scope-valid 제품 preview를 생성했다.

- off는 예산, 모임, 운동, 레시피, 학습 시간처럼 더 다양한 생활 문제를 포함했다.
- on은 책장, 냉장고, 선반, 액자 등 공간·경계 analog에 더 집중했다.
- on 결과가 curated Evidence를 명시적으로 유용하게 연결했다거나 실용적으로 더 우수하다는 점은 입증하지 못했다.
- 단일 stochastic pair이므로 관찰된 주제 집중을 인과적 personalization 효과로 확정하지 않는다.

여기서 unseen은 Campus Drop fixture를 복제하지 않은 fresh synthetic furniture-boundary input이라는 뜻이다. 실제 사용자 이력에 대한 truly held-out learning goal 검증은 아니며, P4의 Personal Need-absent 비교도 실행하지 않았다.

## Runtime 사후 상태

관측 시점 backend instance는 `ae629c61-b180-40da-942f-d883b06ceae7`, owner OS PID 84455, tool exec session ID 59168이었다. 이 값은 2026-09-15 시점 snapshot이며 다음 세션에서 재사용을 가정하지 않는다.

- current-instance run 0/active 0
- Analysis Job 45건 모두 `SUCCEEDED`
- accepted Evidence 76, Ledger 54, Proposal 46, Completion 11로 실행 전후 불변
- native binding 113개 모두 `REVOKED`, 각 binding mode `0600`
- connection descriptor와 owner file mode `0600`
- SQLite `quick_check=ok`

root가 완료 알림을 Command-Backspace로 닫은 뒤 worker status는 `NATIVE_EVAL_RELOAD_REQUIRED`를 09:10:01.758Z에 표시했다. 결과 webview는 유지했으며 추가 model 또는 Core 작업은 실행하지 않았다.

원본 `main` worktree의 `git status`는 빈 값이었고 recovery의 기존 dirty 변경은 보존됐다.

## 다음 bounded gate

1. 7개 case의 전체 Agent-authored context와 user claim 중복을 감사하고 hint dependence contamination을 제거한다.
2. canonical claim 분리와 충돌하지 않게 oracle을 claim granularity 기준으로 재설계한다. Proposal 총개수만으로 정확도를 판정하지 않는다.
3. 일반 조건 정의, 사후 관찰과 실제 미래 결과 예측을 분리하는 semantic 회귀를 추가한다. 기존 독립 `STRONG PREDICTION` 정책을 일괄 낮추지 않는다.
4. 이유 있는 선택은 Agent가 사용자 rationale을 미리 제공하지 않는 새 synthetic context로 다시 만든다.
5. 고정된 fixture/oracle을 같은 bounded native protocol로 재평가한다.

후속 fixture와 oracle은 새 revision으로 만들며, 현재 fixture·metadata와 이 baseline 판정을 소급 수정하지 않는다.

이 작업이 끝나도 P3 Builder + late Helper/cancel 반복, P4 실제 Decision과 Need 유·무 unseen Discovery, Windows와 CLI cutover 비교는 별도 gate로 남는다.
