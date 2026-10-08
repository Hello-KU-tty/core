# Evidence Analyst 모델 비교 (kiro-cli)

예선에서 Analyst 프롬프트 v1.0.8을 채택할 때 쓴 고정 사례와 결정적 판정 코드(`native-analyst-clean-semantics.cjs`의 `evaluateText`)를 그대로 써서, 본선 실행기인 kiro-cli로 모델만 바꿔 비교했다. 실행기: [`scripts/eval-analyst-models.mjs`](../../../scripts/eval-analyst-models.mjs).

## 조건

- kiro-cli 2.28.0, 개인 Builder ID 무료 플랜, 정식 Analyst 프롬프트(`agents/vibe-helper-evidence-analyst.json`), 도구 없음, 재시도 없음.
- 사례: `evidence-analyst-v1.0.8-source-first.json` 8개, `evidence-analyst-v1.0.8-held-out.json` 8개. 합성·redacted 입력이며 실제 사용자 데이터가 아니다.
- 모델당 사례마다 1회만 실행했다. 반복 실행이 없어 변동 폭은 측정하지 않았다.

## 결과

| 모델 | 배율(표시) | source-first | held-out | 합계 | 형식 오류 | 시간 중앙값 | 실제 크레딧(16회) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claude-haiku-4.5 | 0.40x | 4/8 | 5/8 | 9/16 | 0 | 10.3초 | 0.82 |
| **glm-5** | 0.50x | 5/8 | 7/8 | **12/16** | 1 | 13.6초 | 2.50 |
| deepseek-3.2 | 0.25x | 3/8 | 4/8 | 7/16 | 8 | 19.0초 | 1.21 |
| minimax-m2.5 | 0.25x | 2/8 | 3/8 | 5/16 | 11 | 18.9초 | 1.21 |
| claude-sonnet-4.5 | 1.30x | 5/8 | 6/8 | 11/16 | 0 | 15.1초 | 2.65 |

사례별(P 통과, F 기대 불일치, S 형식 오류):

| 사례 | Haiku | GLM-5 | DeepSeek | MiniMax | Sonnet |
| --- | --- | --- | --- | --- | --- |
| request_only (sf/ho) | P/P | P/P | P/P | P/P | P/P |
| future_plan_after_light_hint | F/F | P/P | S/S | S/S | F/F |
| own_explanation_independent | P/P | F/P | F/P | S/S | P/P |
| actual_reasoned_choice | F/P | F/S | S/S | S/S | F/F |
| actual_performed_application | F/F | F/P | S/S | S/S | F/P |
| directly_led_repeat | P/P | P/P | P/S | S/P | P/P |
| independent_future_prediction | F/F | P/P | S/P | S/S | P/P |
| bare_recommendation_without_user_words | P/P | P/P | P/P | P/P | P/P |

## 해석

- GLM-5가 가장 많이 맞혔고(12/16), Sonnet 4.5(11/16), Haiku 4.5(9/16) 순이다. DeepSeek 3.2와 MiniMax M2.5는 출력 형식을 자주 어겨 Analyst에 맞지 않는다.
- 표시 배율과 실제 소비는 다르다. GLM-5는 배율이 0.5x지만 출력이 길어 사례당 약 0.16크레딧으로 Haiku(약 0.05)의 3배였다.
- 형식 오류는 Core가 제안을 받지 않으므로 잘못된 이해 판정으로 이어지지 않는다. 기대 불일치(F)는 과대·과소 판정 방향을 이번 실행에서 따로 기록하지 않았다.
- 예선 기록에서 Haiku는 같은 source-first 8개에 6/8(IDE 내부 실행기, 2회)이었는데 이번에는 4/8이다. 실행기·Kiro 버전 차이와 1회 실행의 변동이 섞여 있어 원인을 가르지 않았다.
- 표본이 작고 1회 실행이라, 모델 교체는 반복 실행으로 확인한 뒤 확정한다.

## 2차: Auto와 Sonnet 4.5 반복

이 계정(무료 Builder ID)의 kiro-cli에서는 공식 문서에 있는 Opus 5.x·Opus 4.x·Sonnet 4.6/5.x·GPT-5.6 모델 ID가 모두 "사용할 수 없음"으로 거절됐다(kiro-cli 2.28.0이 최신). 쓸 수 있는 9개 중 남은 후보 Auto를 같은 조건으로 돌리고, Sonnet 4.5는 변동을 보려고 한 번 더 돌렸다.

| 모델 | source-first | held-out | 합계 | 형식 오류 | 시간 중앙값 | 실제 크레딧(16회) |
| --- | --- | --- | --- | --- | --- | --- |
| **auto** | 8/8 | 6/8 | **14/16** | 0 | 11.4초 | 1.99 (사례당 0.12) |
| claude-sonnet-4.5 (2회차) | 6/8 | 6/8 | 12/16 | 1 | 14.6초 | 2.56 |

- Sonnet 4.5는 두 실행의 사례별 판정이 15/16 같아 실행 간 변동이 작았다(11/16 → 12/16).
- Auto는 가장 높고 Sonnet보다 싸다. Auto의 실패 2개는 held-out의 future_plan_after_light_hint와 actual_performed_application이다.
- Auto는 서버가 작업마다 모델을 고르므로 시간이 지나면 동작이 바뀔 수 있다. 판정이 Core 규칙으로 걸러지므로 잘못된 이해 판정 위험은 제한되지만, 본선 전에 같은 평가를 다시 돌려 확인한다.
