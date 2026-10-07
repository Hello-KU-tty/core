# Kiro 채팅 Decision 해석 평가 (Steering 0.2.0)

[평가 사례](../fixtures/kiro-chat-decision/cases.json) 1.0.0을 [평가기](../../../scripts/eval-kiro-chat-decision.mjs)로 실제 Kiro에서 실행한 결과다. 학습자 메시지는 합성 문장이고 실제 사용자 데이터가 아니다. 사람의 학습 효과를 뜻하지 않는다.

## 조건

- Kiro 1.2.4(`kiro.kiroAgent` 1.1.294), 개인 BuilderId 무료 플랜, Auto 모델, 격리 프로필.
- Core `core-only` + Builder 바인딩 + Kiro hook, Campus Drop 합성 Task. Steering은 `kiro-workspace-node.ts` 0.2.0.
- 사례마다 평가기가 Builder MCP로 선택지 3개(1시간·24시간·7일, 추천 1번)의 Decision을 열고, 새 Kiro 세션에 학습자 메시지 하나를 보냈다. 메시지 끝에 "(지금은 코드 작성은 하지 말아줘.)"를 붙였다. Decision 기록을 유도하는 문구는 넣지 않았다.
- 판정은 Core `decision_resolutions`의 구조화 필드와 Kiro 세션 기록의 도구 호출만으로 했다. 사례가 끝나면 평가기가 남은 Decision을 닫았다(합성 평가 DB에만 해당).

## 결과

| 사례 | 기대 | 판정 | 기록 | 비고 | 크레딧 |
| --- | --- | --- | --- | --- | --- |
| explicit-number "2번으로 할게…" | 2번 + 이유 | PASS | OPTION 2, 이유 원문 | | 0.49 |
| content-shortest "제일 짧은 쪽…" | 1번 + 이유 | PASS | OPTION 1, 이유 원문 | 번호 없이 내용으로 해석 | 0.69 |
| number-trap "2시간(1번)…" | 1번 | FAIL | 기록 없음 | Agent가 제3안 "2시간"으로 기록하려다 Core가 명시 번호(1번)와 모순으로 거절, Agent가 학습자에게 다시 확인 요청. 잘못된 확정은 저장되지 않음 | 0.45 |
| recommendation "추천한 걸로" | 추천안(1번) | PASS | RECOMMENDATION 1 | | 0.55 |
| custom "다운로드 한 번 하면 바로 만료…" | 제3안 | FAIL | 기록 없음 | Agent가 학습자 아이디어를 넣은 새 Decision을 다시 열어 다시 고르게 함 | 1.17 |
| question-not-choice "차이가 뭐야?" | 확정하지 않음 | PASS | 없음 | 차이를 설명하고 어느 쪽인지 되물음 | 0.44 |
| undecided "좀 더 생각해볼게" | 확정하지 않음 | PASS | 없음 | Core 도구를 부르지 않고 일반 설명만 함(열린 Decision과 연결하지 못함) | 0.11 |
| middle-by-elimination "1번은 짧고 3번은 길어. 중간 걸로" | 2번 + 이유 | PASS | OPTION 2, 이유 원문 | 번호가 두 개라 모순 검사는 적용되지 않음 | 0.67 |

- 6/8 PASS. 확정해야 하는 6개 중 4개를 정확히 기록했고, 확정하면 안 되는 2개는 모두 확정하지 않았다.
- **저장된 확정 4건은 모두 맞았다.** 잘못된 선택지나 Agent 문장이 이유로 저장된 경우는 없었다. 이유는 4건 모두 학습자 원문 그대로였다(추천 사례는 이유 없음).
- 실패 2건은 모두 "기록하지 않음"으로 끝났다. 하나는 Core의 명시 번호 검사가 막았고, 하나는 Agent가 다시 묻는 쪽을 택했다.

## 한계와 다음 조치

- 사례 2~5는 같은 Task에서 앞 사례의 닫힌 Decision이 보이는 상태로 실행됐다. number-trap에서 Agent가 "이전에 1시간을 선택하셨는데"라고 말한 것은 이 오염 때문이다. 마지막 두 사례는 새 데이터 폴더에서 실행했다.
- 같은 Task에 Decision이 쌓이자 `get_builder_task` 응답이 커져 Kiro가 파일로 빼 두었고, Agent가 그 파일을 셸로 읽으려다 승인 대기에 걸렸다. Agent용 Core 응답을 열린 Decision 위주로 줄이는 개선이 필요하다.
- custom 사례: Steering에 "학습자가 제시한 자기 안은 새 Decision을 열지 말고 CUSTOM으로 기록"을 넣을지, 다시 묻는 현재 행동을 허용할지 결정이 필요하다.
- undecided 사례: 열린 Decision과 연결하지 못했다. 세션 시작 시 열린 Decision을 알려 주는 방법(SessionStart hook 출력 등)을 검토한다.
- 8개는 작은 표본이다. 사례당 0.1~1.2크레딧이 들어 무료 플랜에서는 표본을 늘리기 어렵다.
- 총 약 5.1크레딧(평가기 결함으로 중단된 첫 실행 1사례 0.54 포함).
