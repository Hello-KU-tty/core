# K10 실제 Kiro 확인: 채팅 Decision 평가와 Builder·Helper 흐름 (2026-10-11)

K10+K11을 합친 Mac VSIX 0.2.7(backend `75c4fa7` 위 작업 트리, frontend `c2c873c`)을 격리 Kiro 프로필(Kiro IDE `kiro.kiroAgent` 1.1.343, 본선 계정)에 설치해 확인했다. 합성 학습자 발언이며 실제 사용자 데이터가 아니다.

**실행 조건:** Codex 화면 조작이 Kiro 창을 읽지 못해(두 차례 시간 초과) 폴더 신뢰 화면을 누를 수 없었다. 이번 확인 대상이 신뢰 화면이 아니므로(K09에서 확인) 테스트 Kiro를 `--disable-workspace-trust` 실행 옵션으로 띄웠다. 프로필 설정은 바꾸지 않았다. 별도 Helper 탭의 모드 선택도 화면 조작이 필요해, Helper 경로는 Builder 탭의 `/vibe-helper` 질문으로 확인했다.

## 1. 채팅 Decision 평가 13개

- 실행기: [`scripts/eval-kiro-chat-decision.mjs`](../../../scripts/eval-kiro-chat-decision.mjs), 사례: [`kiro-chat-decision/cases.json`](../fixtures/kiro-chat-decision/cases.json) 2.0.0. 하네스가 `ask_choice`로 질문을 열고, 새 채팅 세션에 학습자 발언을 보내, Core의 확정 기록과 세션의 도구 호출로만 판정한다.
- 처음 보는 목표의 Project("동아리 자료를 링크로 나눠 주는 작은 웹앱")를 Discovery부터 Spec 확정까지 만든 뒤 빈 폴더에 연결했다.

| 사례 | 기대 | 결과 | 비고 |
| --- | --- | --- | --- |
| explicit-number | 2번 기록 | 통과 | |
| content-shortest | 1번 기록 | 통과 | |
| number-trap "2시간(1번)" | 1번 기록 | 실패 | 선택지에 2시간이 없어 Builder가 1시간인지 되물음. 판단은 합리적 |
| recommendation | 추천 기록 | 통과 | |
| custom (0.6.0) | 직접 낸 안 기록 | 실패 | Builder가 학습자 안을 넣은 질문을 새로 열어 다시 물음 → Steering 0.6.1 보완 |
| custom (0.6.1 재실행) | | 판정 불가 | 0.6.0 실행이 남긴 질문(하네스 정리로 확정됨)을 Builder가 같은 선택으로 기록. 하네스 오염. 아래 흐름에서 0.6.1로 확인 |
| question-not-choice | 기록 안 함 | 통과 | |
| undecided | 기록 안 함 | 통과 | |
| middle-by-elimination | 2번 기록 | 통과 | |
| wavering | 2번 기록 | 통과 | "1번이 나은가 2번이 나은가… 아니다 2번" |
| negation-ambiguous "1번은 너무 짧아" | 기록 안 함 | 통과 | 2번·3번 중 무엇인지 되물음 |
| misconception-changes-fit | 기록 안 함 | 통과 | 바로잡고 다시 물음 |
| partly-wrong-choice-fine | 1번 기록 | 통과 | 기록하고 같은 턴에 "서명·암호화는 유출된 진짜 링크를 막지 못한다"고 정정 |
| changed-mind | 1번, 새 Decision | 통과 | 두 번째 `save_choice`가 같은 질문을 새 Decision으로 다시 열어 확정 |

- 11/13 통과, 직접 낸 안은 아래 흐름에서 통과. 6.03크레딧(채팅). 기록된 선택은 모두 학습자 발언이 1개 이상 연결됐다.
- **찾은 버그:** 9번째 사례에서 하네스의 `ask_choice`가 `TRANSACTION_FAILED`로 거절됐다. K10은 고른 안의 적용을 완료 때로 미루므로 확정만 된 Decision이 작업 맥락의 활성 목록에 쌓이는데, 그 목록의 계약 상한이 10이었고 Core가 계약 검사 실패를 저장소 오류로 감췄다. 상한을 30(`MAX_ACTIVE_DECISIONS`)으로 올리고, 닿으면 `CHAT_TOO_MANY_OPEN_CHOICES`로 이유를 밝히게 했다. 30개까지 묻고 31번째에서 거절하는 회귀 테스트를 넣었다.
- 실제 Kiro hook으로 Builder 채팅 턴이 기록되고(`BUILDER_CHAT_TURN`), Core가 Decision Episode마다 Analyst를 자동 실행해 모두 성공했다.

## 2. 실제 Builder·Helper 흐름 (Steering 0.6.1)

처음 보는 목표와 Personal Need("가족이 함께 쓰는 장보기 목록 웹앱… / 동생이랑 같이 장 볼 때 바로 쓰고 싶어")로 Project를 만들고 빈 폴더에 연결했다. 학습자 발언 세 번으로 Task 완료까지 갔다.

| 턴 | 학습자 | Builder | Vibe Helper 도구 | 승인 창 | 크레딧 |
| --- | --- | --- | --- | --- | --- |
| 1 | 시작 + "동생이랑 둘이서만 쓸 거라 로그인 같은 건 복잡하지 않았으면" | Task 자동 시작, 진행 메모, 저장소 코드·테스트, 공유 링크 방식 Decision(1 고정 링크, 2 비밀 토큰 링크, 추천 2, 작업 막음)을 기록 뒤 질문 | `check_progress`, `save_progress`, `ask_choice` ×2 | 0 | 2.15 |
| 2 | `/vibe-helper` 두 선택지 차이를 우리 상황에 맞춰 | 한국어로 비교(코드 수정 없음), Helper 대화로 기록 | 없음 | 0 | 0.18 |
| 3 | "둘 다 말고, 링크는 하나로 두되 처음 들어올 때 가족끼리 정한 숫자 4자리를 한 번 입력하게 하자. 동생이 링크를 잃어버려도 다시 들어오기 쉬우니까." | 직접 낸 안으로 기록, 구현, 테스트, 완료 | `save_choice`(custom), `save_progress` ×2, `finish_task` ×2 | 0 | 6.59 |

- **확정 기록:** `CUSTOM`, `customProposal`은 학습자 원문, `builderSummary`는 Builder 요약(Agent 출처). 연결된 발언 3개: Builder 탭 질문 전 발언, Helper 질문, Builder 탭 답. `helperUsed: true`.
- **완료:** `finish_task`가 적용 기록, `TASK_COMPLETED` 맥락(활성 0), 완료를 처리했다. Spec에 없는 개념 3개("세션 토큰", "브로드캐스트 동기화", "인메모리 데이터 구조")는 `ignoredConcepts`로 돌려줬다. 개념 이름은 Spec과 정확히 같아야 기록되므로 비슷한 이름("동시 상태 동기화"와 "브로드캐스트 동기화")은 빠진다.
- **판정:** Core가 Analyst(Sonnet 5.5)를 자동 실행해 분석 작업 3개가 성공했고, 학습자의 직접 낸 설계를 JUSTIFIED_DECISION·STRONG·INDEPENDENT·DEMONSTRATED로 받아들였다(근거 인용은 학습자 원문).
- **Kiro 단계의 형식 오류:** `ask_choice`와 `finish_task`의 첫 호출이 Kiro 도구 호출 단계에서 `Invalid input for tool_call — arguments: expected object, received string`으로 거절됐다(모델이 긴 한국어 입력을 JSON 문자열로 보냄). 두 번 모두 Builder가 바로 객체로 다시 보내 성공했다. 우리 Core가 거절한 호출은 0이다. Kiro 모델 동작이라 알려진 한계로 둔다.
- **언어:** 1턴의 마지막 Builder 메시지가 영어였다(3턴은 한국어). Builder Steering에 학습자 언어로 답하라는 규칙이 없다. 후속 보완 거리.
- 흐름 합계 8.92크레딧(채팅). 같은 비교로 첫 체험은 Vibe Helper 호출 25번 중 9번 실패, K09 재실측은 11번 중 0번이었다.

## 3. 완료 뒤 이어서 만들기 (2026-10-11, `main` 0.2.7, Steering 0.6.2)

frontend Windows 실측에서 완료 뒤 요청을 받을 경로가 없다는 것이 드러나 고친 뒤([DECISIONS](../../../docs/DECISIONS.md) "Kiro 채팅에서 완료 뒤 이어서 만들기와 늦은 신뢰 다시 로드"), 위 2절에서 완료한 Project에 `main` 빌드(backend `5f1257c`, frontend `88275f6`)를 설치해 확인했다. Kiro를 다시 연 뒤 새 Core가 완료한 Task로 연결을 복원했고, 새 채팅 세션에서 진행했다.

| 턴 | 학습자 | Builder | Vibe Helper 도구 | 승인 창 | 크레딧 |
| --- | --- | --- | --- | --- | --- |
| 1 | "고마워! 써 보니까 산 물건은 목록에서 지울 수 있어야겠어. 지우는 버튼도 넣어 줘." | 코드를 읽고 항목별 삭제는 이미 있다고 알린 뒤, 산 물건 치우는 방식 Decision(1 한 번에 치우기 버튼, 2 지금 상태, 3 둘 다, 추천 3)을 기록 뒤 질문 | `check_progress`, `ask_choice` | 0 | 0.80 |
| 2 | "3번! 하나씩 지울 때도 있고, 장 다 보고 나서 동생이랑 한 번에 정리하고 싶을 때도 있어서." | 기록, 구현, 테스트, 완료 | `save_choice`, `save_progress` ×2, `finish_task` ×2, `check_progress` | 0 | 5.02 |

- **후속 Task:** 1턴의 `ask_choice`(완료 뒤 첫 쓰기)에서 Core가 학습자 요청 원문을 목표로 sequence 2 Task(이전 Task를 이어받음)를 만들었다. Builder·Helper MCP와 hook 연결이 그 Task로 옮겨 갔다. 첫 Task와 완료 보고서는 그대로다.
- **확정 기록:** 2턴의 학습자 답이 새 Task의 `USER_MESSAGE`로 기록돼 Decision(OPTION 3)에 연결됐고(Builder 탭, 질문 뒤), 완료 때 적용됐다. Analyst 분석 2건 성공, 판단 근거 Evidence `JUSTIFIED_DECISION`·MEDIUM·LIGHT_HINT·EXPLAINED.
- **언어:** Builder 메시지는 모두 한국어였다.
- **한계:** 첫 `finish_task`가 이전 Task의 기준 키(`user_request`·`verified_outcome`가 아닌 키)로 와서 거절됐고, Builder가 `check_progress` 뒤 다시 보내 완료했다. 학습자 요청 메시지는 첫 Task의 발언으로 남는다.
- 합계 5.82크레딧(채팅).
