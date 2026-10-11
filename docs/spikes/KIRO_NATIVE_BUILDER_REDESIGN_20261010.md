# K10 재설계: Decision 답 기록과 판정 예시 (2026-10-10)

사용자와 정한 재설계([DECISIONS](../DECISIONS.md) "Kiro 채팅 Builder 워크플로 재설계(K10)")를 발언 예시로 확인한 표다. 재설계 전 상태는 [Builder 워크플로 정리](KIRO_NATIVE_BUILDER_WORKFLOW_20261009.md)에 있다. 평가 세트는 이 표의 문구를 그대로 쓰지 않고 다른 주제로 만든다.

## 예시 Decision

- **D1 메모 조회:** 1번 본인 메모만(단순하고 빠름, 추천), 2번 공개 여부 필드(공유 붙이기 쉬움)
- **D2 복호화 키 위치:** 1번 JWT에 포함(단순하지만 토큰 커짐), 2번 DB 별도 저장(토큰 작고 키 관리 유연, 추천)

EXPLAINED는 자기 말로 설명, DEMONSTRATED는 실제 판단에 사용이다. "후보"는 Analyst 제안의 최대치이고 Core가 정책 상한으로 다시 자른다. 괄호 안은 재설계 전 동작이다.

## 발언별 처리

| # | 발언 | Decision 처리 | 이해도 판정 (재설계 전) | 이유 |
| --- | --- | --- | --- | --- |
| 1 | D1 "1번" | 확정 | 없음 (같음) | 이유 없음 |
| 2 | D1 "추천대로 해줘" | 추천안 확정 | 없음 (같음) | 확인 응답 |
| 3 | D1 "ㅇㅋ 그걸로" | Builder가 "추천안인 1번 말씀이죠?" 되물음 → "응" → 확정 | 없음 (같음) | 가리키는 안이 애매 |
| 4 | D1 "1번, 단순한 게 좋아" | 확정 | EXPLAINED (없음) | 선택지 장단점 중 하나를 자기 우선순위로 고름 |
| 5 | D2 "2번, 토큰 커지는 게 싫어서" | 확정 | EXPLAINED (없음) | 4와 같음 |
| 6 | D2 "2번. 토큰은 요청마다 따라가니까 커지면 매번 손해잖아" | 확정 | DEMONSTRATED 후보 (인용 성공 시 가능) | 선택지에 없는 인과(매 요청 전송)를 붙임 |
| 7 | D1 "1번. 어차피 나 혼자 쓰는 앱이라" | 확정 | DEMONSTRATED 후보 (개념 표현이 없어 빠지기 쉬움) | 자기 제품 사정 연결, 개념 표현은 선택지에서 |
| 8 | 요청 전 "나중에 친구들한테도 보여주고 싶어" → 요청 후 "그럼 2번" | 확정 | DEMONSTRATED 후보 (없음, 요청 전 발언 버림) | 선택지를 보기 전의 필요라 독립성이 높음 |
| 9 | 요청 전 "공유는 안 넣을 거야" → 요청 후 "아까 말했잖아, 공유 안 한다고" | 내용으로 1번 확정, Builder가 "1번으로 갈게요" 한 문장 | DEMONSTRATED 후보 (없음) | 번호 없는 맥락 지칭, 잘못 읽었으면 학습자가 바로 고침 |
| 10 | 요청 전 "CSS는 나중에 하자" → 요청 후 "1번" | 확정 | 없음 (같음) | 연결되지만 D1과 무관해 쓰지 않음, 중복 Evidence 없음 |
| 11 | D2 "2번. 키가 토큰 안에 있으면 토큰 털리면 끝이잖아" | 확정 | DEMONSTRATED 후보 (빠지기 쉬움) | 선택지에 없는 보안 결과를 스스로 말함 |
| 12 | D2 "JWT에 넣으면 누가 열어볼 수 있어?" | 미확정, Builder가 답하고 다시 묻기 | 없음 (같음) | 질문만 |
| 13 | (Builder: "JWT 내용은 누구나 디코딩할 수 있어요") "그럼 2번. 누구나 열 수 있으면 키 넣으면 안 되지" | 확정 | EXPLAINED (Agent 답을 못 봐 과대 또는 보류) | 사실은 Agent, 결론은 학습자 |
| 14 | (Builder: "이 앱은 공유가 없으니 1번이 맞아요") "ㅇㅇ 1번, 공유 없으니까" | 확정 | 없음 (DEMONSTRATED 과대 가능) | 결론까지 Agent가 줌 |
| 15 | D1 "둘 다 말고, 기본은 본인만 보이고 고른 메모만 공유 링크로 열면?" | "그렇게 갈까요?" → "응" → 직접 낸 안 확정(Builder 요약 + 학습자 원문) | DEMONSTRATED 후보 (없음, 이유 인용 없으면 0) | 두 안을 합친 자기 설계 |
| 16 | D2 "1번. JWT는 암호화돼 있으니까 키 넣어도 안전하잖아" | 기록 보류 → Builder: "JWT는 서명만 되고 내용은 누구나 열어볼 수 있어요. 그래도 1번으로 갈까요?" | 16a·16b | 선택을 바꿀 만한 보안 오해 |
| 16a | → "아 그럼 2번. 다 보이면 키 넣으면 안 되지" | 2번 확정 | 오해 issue 열림 + 고쳐 말한 것 EXPLAINED | issue는 나중에 도움 없이 맞게 쓸 때 닫힘 |
| 16b | → "그래도 1번" | 1번 확정(학습자 몫) | 오해 issue 열림 | |
| 17 | D2 "2번. 토큰도 작아지고, DB가 털려도 키는 안전하니까" | 2번 확정, 같은 턴에 "DB가 털리면 키도 같이 털려요"라고 한 문장 정정 후 작업 계속(되묻지 않음) | 앞부분 EXPLAINED + 뒷부분 오해 issue | 선택은 맞고 이유 일부만 틀림 |
| 18 | D1 "2번… 아 아니다 1번, 단순하게" | 마지막 말로 1번 확정 + 한 문장 알림 | EXPLAINED (없음) | 번호가 둘이라 Core 번호 검사는 쉼 |
| 19 | 학습자 "1번", Builder가 2번으로 기록 | Core 거절 → Builder 재확인 | 해당 없음 (같음) | 명시 번호 모순 검사 유지 |
| 20 | 1번 확정 뒤 "아 공개 필드로 바꿀래, 나중에 공유할 수도 있어서" | 2번으로 선택 변경 기록, 이전 선택은 이력, 추가 확인 없음 | EXPLAINED (변경 경로 없음) | 장단점 이유 |
| 21 | Helper 탭 "혼자 쓸 거라 1번이 나을 것 같은데 맞아?" → Builder 탭 "1번" | 확정, Helper 탭 발언을 이유로 연결 | DEMONSTRATED 후보 (없음) | 이유가 학습자에게서 먼저 나옴 |
| 22 | Helper 탭 "1번이랑 2번 차이가 뭐야?" → Helper 비교 → Builder 탭 "1번, 공유 안 할 거라서" | 확정 | DEMONSTRATED 후보 | Helper 비교는 가벼운 힌트, 자기 사정 연결 |
| 23 | Helper 탭 "1번으로 할래" → Helper가 "Builder 탭에 말해 주세요" → Builder 탭 "1번" | 확정, Helper 탭 발언도 연결 | 없음 | 이유 없음 |

## Kiro 채팅 도구 계약 (사용자 검토, 2026-10-10)

공통: Agent는 식별자(projectId·taskId·correlationId), schema 버전, 명령 봉투, 멱등키, expected 버전을 보내지 않는다. 서버가 연결 값과 쓰기 직전 Core 상태로 채운다. 같은 내용을 다시 보내면 Core가 이미 있는 결과를 돌려준다(도구별 기준). 키를 내용 해시로 만들면 1→2→1 같은 선택 변경을 막으므로 쓰지 않는다.

| 도구 | Agent 입력 | Core가 하는 일 | 거절 | 같은 내용 기준 | 대체 |
| --- | --- | --- | --- | --- | --- |
| `check_progress`(읽기) | 없음 | Task 제목·상태, 수락 기준(key·한 줄), 열린 Decision(번호 선택지·추천 번호·상태), 마지막 진행 메모 한 줄 | - | - | `get_build_status`, `get_builder_task`, `get_decision_result` |
| `save_progress` | `kind`(PLAN·DIRECTION_CHANGED·ERROR_REPLAN·TEST_STARTED), `summary`, 선택 `changes[]` `nextSteps[]` `files[]` `concepts[]` | 맥락 새 버전 저장, 열린 Decision 목록은 Core가 채움 | 완료된 Task, 폴더 밖 파일 | 직전 메모와 같음 | `update_build_context`, `start_task` |
| `ask_choice` | `category`, `question`, `whyNow`, `options[2~4]{label, description, tradeoffs?}`, `recommended`(번호), `recommendationReason`, `blocksWork`, 선택 `blockingReason` `concepts[]` `files[]` | 선택지 key·ID, 맥락(직전 진행 메모), DECISION_REQUIRED 기록, 막으면 Task BLOCKED | 선택지 수·추천 번호 범위, 막는데 이유 없음 | 같은 질문의 열린 Decision | `request_user_decision` |
| `save_choice` | `decisionId`(열린 게 하나면 생략), `choice`(번호·`recommended`·`custom`), `customSummary` | 직전 확정(첫 Decision이면 Task 시작) 이후의 Builder·Helper 탭 학습자 발언 최근 20개 연결, 처음이면 확정·이미 확정이면 선택 변경(이력 유지), 막힌 Task 재개, Decision Episode 종료 | 요청(변경이면 직전 확정) 뒤 Builder 탭 학습자 발언 없음, 마지막 Builder 탭 발언이 분명한 번호 답인데 기록과 다름, 번호 범위 밖, 열린 Decision이 여럿인데 `decisionId` 없음 | 현재 선택과 같음 | `resolve_decision_from_chat` |
| `finish_task` | `implemented[]`, `acceptance[{key, passed, changedByDecisionId?}]`, `checks[{name, passed, summary}]`, `decisionsApplied[{decisionId, how}]`, 선택 `concepts[{name, why, files?}]` `deviations[]` `remaining[]` `limitations[]` `files[]` | TASK_COMPLETED 맥락 자동 기록, 마지막 선택 기준 Decision 적용 기록 생성, 개념 범위·중요도는 Learning Spec에서 | 수락 기준 key 누락·불일치, 실패한 기준·검사, 검사 0개, 답 기다리는 Decision, 확정 Decision의 `how` 누락 | 이미 완료 | `complete_task`, `apply_decision_result`, 완료 맥락 |

### 확정한 것

1. **적용은 완료 보고로 합친다.** Helper는 완료 전까지 구현 여부를 Builder 활동 기록으로 본다.
2. **번호 모순 검사:** 마지막 Builder 탭 학습자 발언이 번호를 하나만 말하고, 그 번호로 시작하는 분명한 답(`2번`, `2번, 이유`, `2번으로 해줘`, `2번이요`, `2번 할게`)일 때만 검사한다. 뒤에 `말고`·`빼고`·`대신`·`보다`·`은/는`·`아니`·`별로`·`싫`이 붙거나 번호가 둘 이상이면 검사하지 않고 Builder 해석과 "N번으로 갈게요" 확인 문장, 학습자 정정에 맡긴다. 지금 규칙은 "1번은 별로야"·"1번 말고"에서 Builder가 2번을 기록하면 거절하는 오탐이 있다(scratch 실행으로 확인). 망설임("1번보다 2번이 낫네 아닌가… 아니다 2번이 낫네"), 부정, 비교, 질문형 답은 Builder 해석 평가 사례에 넣는다.
3. **연결 상한:** 최근 20개.
4. **Builder 채팅 기록은 저장한다.** Stop hook이 Builder 탭 턴 끝에 마지막 답을 1,000자 이하로 redaction해 `BUILDER_CHAT_TURN`(AGENT·BUILDER)으로 기록한다. Evidence 근거로는 쓰지 않는다.
5. **완료 검사 엄격도 유지.** 거절되면 Builder는 끝났다고 말하지 않고 기준을 맞추는 작업을 계속한다(Steering).
6. **도구 이름:** Kiro는 MCP `title`을 쓰지 않고 `@서버/도구이름`을 화면에 띄운다(설치된 `kiro.kiro-agent` 1.1.343 번들의 도구 목록 변환이 name·description·inputSchema·boolean annotations만 남기고 displayName을 `@server/tool` 소문자로 만든다). 표시 이름만 따로 둘 수 없으므로 이름 자체가 화면 표시다. 사용자 결정으로 쉬운 영어 이름 `check_progress`, `save_progress`, `ask_choice`, `save_choice`, `finish_task`를 쓴다.
7. **기준을 못 맞추는 예외:** 학습자 결정이 바꾼 수락 기준은 `changedByDecisionId`로 표시하면 통과 대신 받는다(사용자 승인).
8. **선택 바꾸기 구현:** 확정 기록 DB 제약 때문에 같은 질문을 새 Decision(`replacesDecisionId`)으로 열고 바로 확정한다. 학습자 쪽 동작은 같다.

### Core 계약 변경 (기존 DB 행은 그대로 읽힘)

- `DecisionResolution.chatSource`: 기존 `{mappedBy, userMessageIds}` 유지, 선택 필드 `linkedMessages[{conversationId, messageId, tab: BUILDER|HELPER, timing: BEFORE_REQUEST|AFTER_REQUEST}]`(최대 20)와 `builderSummary`(AGENT) 추가.
- 직접 낸 안: `customProposal`은 마지막 Builder 탭 학습자 발언 원문(USER), Builder 요약은 `builderSummary`.
- 선택 변경: Resolution에 `supersedesResolutionId`. 한 Decision에 여러 Resolution, 현재 선택은 마지막.
- 새 Activity `BUILDER_CHAT_TURN`(위 4).
- Episode: 답 기록 때 연결된 요청 전·Helper 탭 발언을 Decision Episode에 참조로 붙인다.
- Evidence 정책: 채팅 확정의 JUSTIFIED_DECISION은 연결된 학습자 발언에서 인용을 찾고, 개념 표현은 학습자 발언이나 고른 선택지 label·description에 있으면 되며, (발언, 개념) 쌍당 Evidence 하나.
- 패널(UI) 경로 계약은 그대로.

### 프롬프트

- Steering 0.6.0: 도구 5개와 부를 때, 식별자·키·버전 설명 삭제, 한 번에 하나·묻기 전 기록, 선택을 바꿀 만한 오해는 다시 묻고 이유 일부만 틀리면 같은 턴 정정, 기록 뒤 "N번으로 갈게요", 마음을 바꾸면 `save_choice`, 완료가 거절되면 기준을 맞출 때까지 작업.
- Helper 에이전트: 학습자가 선택을 말하면 Builder 탭에 말하도록 안내.
- Analyst 1.1.0: DECISIONS K10의 판정 기준, `BUILDER_CHAT_TURN`·`HELPER_RESPONSE`를 Agent 맥락으로 쓰는 법.
