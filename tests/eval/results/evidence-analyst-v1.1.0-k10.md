# Evidence Analyst 1.1.0 평가 (K10, 2026-10-11)

K10 재설계([DECISIONS](../../../docs/DECISIONS.md) "Kiro 채팅 Builder 워크플로 재설계(K10)")의 판정 기준을 반영한 Analyst 1.1.0을 본선 계정 kiro-cli 2.29.0, `claude-sonnet-5.5`(Analyst 기본 모델)로 측정했다. 합성·redacted 입력이며 실제 사용자 데이터가 아니다. 프롬프트 준수와 Core 정책 결과를 재는 것이지 사람의 학습 효과가 아니다.

## 1. K10 사례 11개 (놓침 7, 과대 방지 4)

- 실행기: [`analyst-k10-chat.test.ts`](../analyst-k10-chat.test.ts), 사례: [`evidence-analyst-v1.1.0-k10-chat.json`](../fixtures/prompt-regressions/evidence-analyst-v1.1.0-k10-chat.json). 각 사례를 실제 Core의 Kiro 채팅 명령으로 기록하고(요청 전 발언, Helper 탭, Builder 채팅 턴, 선택 바꾸기 포함), Analyst의 JSON을 실제 분석 제출 경로로 넣어 Core Evidence 정책이 받아들인 최고 상태와 오해 issue로 채점한다.
- 판정: 받아들인 최고 상태가 사례의 최소~최대 범위 안이고, 오해가 기대되면 열렸을 때 통과.

| 사례 | 기대 | 1차 | 고친 뒤 |
| --- | --- | --- | --- |
| tradeoff_reason (장단점을 이유로) | EXPLAINED | P · EXPLAINED | |
| own_situation_reason (자기 사정) | EXPLAINED~DEMONSTRATED | P · DEMONSTRATED | |
| reason_before_question (질문 전 이유) | EXPLAINED~DEMONSTRATED | P · DEMONSTRATED | |
| helper_tab_reason (Helper 탭 이유) | EXPLAINED~DEMONSTRATED | P · DEMONSTRATED | |
| concept_not_named (개념 이름 없음) | EXPLAINED~DEMONSTRATED | P · DEMONSTRATED | |
| short_contextual_reference ("아까 말한 대로") | EXPLAINED~DEMONSTRATED | F · `INVALID_REFERENCE` | P · DEMONSTRATED |
| own_design (직접 낸 설계) | EXPLAINED~DEMONSTRATED | P · DEMONSTRATED | |
| guard_agent_led_conclusion (Agent가 결론) | 없음 | P · 없음(`INSUFFICIENT_EVIDENCE`) | |
| guard_acknowledgement ("응 추천대로") | 없음 | P · 없음(제안 0) | |
| guard_corrected_misconception (바로잡힌 오해) | 최대 EXPLAINED + 오해 issue | P · EXPLAINED + 오해 issue | |
| changed_choice_reason (선택 바꾸기) | EXPLAINED~DEMONSTRATED | P · DEMONSTRATED | |

- 1차 10/11, 4.00크레딧(사례당 약 0.36). 놓침 사례 6/7, 과대 방지 4/4.
- 실패 원인: 판정은 맞았지만(학습자 사정을 이유로 한 JUSTIFIED_DECISION, DEMONSTRATED), Analyst가 질문 전 발언과 답을 `"공지사항은 하루에 한 번 바뀔까 말까야 / 아까 말한 대로 자주 안 바뀌니까 2번"`처럼 붙여 인용해 Core가 한 발언 안의 글자 그대로가 아니라며 거절했다.
- 조치: Core가 ` / `, ` … `, ` | `로 나눈 인용의 각 조각이 인용한 학습자 발언 중 하나에 글자 그대로 있으면 받는다(`evidence-policy.ts` `quotedIn`). Agent 문장이 섞이면 여전히 거절한다. 프롬프트는 바꾸지 않았다. 그 사례만 다시 돌려 통과(0.52크레딧), 모델 없이 같은 모양의 답을 재현하는 테스트를 추가했다.

## 2. 기존 16개 회귀 (과대 판정 방지)

- 실행기: [`scripts/eval-analyst-models.mjs`](../../../scripts/eval-analyst-models.mjs), 사례: `evidence-analyst-v1.0.8-source-first.json` 8개, `evidence-analyst-v1.0.8-held-out.json` 8개. 판정 코드와 정답은 1.0.8 때 그대로다. 16개 모두 1.1.0의 정책 변경과 정답이 충돌하지 않는다(요청만, Agent 반복, 추천 클릭 등).

| 프롬프트 | source-first | held-out | 합계 | 크레딧 |
| --- | --- | --- | --- | --- |
| 1.0.8 (2026-10-09, [모델 비교](evidence-analyst-models-kiro-cli.md) 3차) | 7/8 | 7/8 | 14/16 | 3.96 |
| **1.1.0 (2026-10-11)** | 7/8 | 8/8 | **15/16** | 3.98 |

- 회귀 없음. 1.0.8에서 두 묶음 모두 놓친 `actual_performed_application`이 held-out에서 통과했고 source-first에서는 여전히 놓쳤다. 나머지 14개는 같은 판정이다.

## 3. 비용과 한계

- 이번 측정 합계 9.01크레딧(K10 1차 4.00, 회귀 3.98, 진단 재실행 0.51, 확인 재실행 0.52).
- 모델당 1회 실행이다. 같은 입력도 실행마다 판정이 달라질 수 있다.
- Builder가 실제 채팅에서 학습자 답을 해석하는 정확도(채팅 Decision 평가 13개)와 실제 Kiro 흐름은 VSIX를 만든 뒤 따로 잰다.
