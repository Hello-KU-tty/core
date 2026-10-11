# Next Move turn (Discovery prompt v1.4.0, K15)

Discovery prompt 1.4.0은 `## NEXT MOVE turn` 절 하나와 마지막 줄의 "도구가 없는 NEXT MOVE turn만 JSON 하나로 답한다"만 더했다. PREVIEW·ENRICHMENT·MERGE·SPEC turn 문장은 1.3.5와 같아서 기존 Discovery 평가는 다시 돌리지 않았다. 아래는 새 절의 평가다.

## 조건

- 날짜: 2026-10-12. kiro-cli 2.29.1, 본선 계정, Next Move는 제품 기본 모델 `claude-haiku-4.5`, Analyst는 제품 설정대로 `claude-sonnet-5.5`(대안 Auto).
- 경로: 실행기 [`scripts/measure-next-move.mjs`](../../../scripts/measure-next-move.mjs). 제품과 같은 Core(임시 SQLite), `WorkflowRuntime`의 Analyst·Next Move worker, local-backend `LocalAgentHost`(ACP)를 쓴다. 학습자 발언 기록 → `finish_task` → 두 worker가 동시에 처리 → `UI_READ_NEXT_MOVE`가 READY가 될 때까지 200ms 간격으로 확인했다.
- 사례: [`next-move-v1.4.0.json`](../fixtures/prompt-regressions/next-move-v1.4.0.json). Campus Drop(Personal Need 있음, 학습자가 1번을 고른 뒤 후속 Task를 마치는 2회차 포함), 처음 보는 목표 2개(동아리 회비 장부: Personal Need 있음, 실시간 그림 퀴즈: 없음). 합성 데이터이고 실제 사용자 데이터가 아니다.
- 크레딧: 제품 경로(ACP)는 사용량을 돌려주지 않는다. 그래서 `VIBE_MEASURE_CREDITS=1`로 같은 turn을 `kiro-cli chat --output-format stream-json`에 한 번 더 보내 계량값을 읽었다.

## 결과 (최종 prompt, 3회차 실행)

| 사례 | 완료 → 후보 저장 | 동시에 돈 Analyst 완료 | 계량 실행 시간 | 크레딧 | 결과 형식 |
| --- | --- | --- | --- | --- | --- |
| Campus Drop 1회차 | 9.3초 | 9.5초 | 8.3초 | 0.037 | 통과 |
| Campus Drop 2회차 | 8.9초 | 8.9초 | 8.4초 | 0.037 | 통과 |
| 동아리 회비 장부 | 7.2초 | 7.4초 | 8.5초 | 0.035 | 통과 |
| 실시간 그림 퀴즈 | 7.2초 | 9.7초 | 8.8초 | 0.037 | 통과 |

- 4번 모두 첫 시도에 READY였고 Analyst job도 모두 SUCCEEDED였다. 목표 30초 안에 들었다.
- 두 worker는 같은 시간대에 끝났다. Analyst를 기다렸다면 후보는 두 시간을 더한 만큼(약 15~19초) 늦게 떴을 것이다.
- 앞선 두 실행(prompt 길이 규칙 보강 전)도 READY 4번, 7.5~9.9초였다.

## 내용 점검

자동 점검: 3개, 제목 중복 없음, 한국어, 로컬 실행 밖 방향(배포·결제·API 키·클라우드 등 낱말) 없음은 4번 모두 통과했다. Campus Drop 2회차는 1회차에서 고른 "여러 파일 한 번에"를 다시 내지 않았다. 고르지 않은 1회차 후보("만료된 파일 자동 정리")는 다시 나왔는데, 이는 허용한다.

글자 수: prompt 제한(제목 16, 설명 45, 좋아지는 점 35)을 넘긴 줄은 보강 전 2회차에 4개 있었다. 그래서 "패널 카드 한 줄에 들어가야 하므로 글자 수를 넘기지 말고, 한 문장에는 한 가지만 쓴다"를 넣었고, 보강 뒤에는 12개 후보 중 1줄(좋아지는 점 37자)만 넘었다. 저장 계약의 상한(24/64/48)에는 모두 들어가 재시도는 없었다.

사람이 읽은 소견(자동 판정 아님):

- 완료 보고의 남은 일·제한을 바로 썼다. 예: 만료 뒤 파일이 남는 문제 → "만료된 파일 자동 정리", 방이 하나뿐 → "여러 방 만들기", 학기마다 바뀌는 회비 → "학기별 회비 금액 관리".
- 크기는 SMALL이 10개, MEDIUM이 2개였다.
- 어색한 점: Campus Drop 2회차의 "받는 사람이 비밀번호 설정"은 제목(받는 사람이 정함)과 설명(공유할 때 정함)이 어긋났다. 동아리 회비의 "처음 누군가 입금하면 자동으로 회원 목록에 추가"는 앱 안 납부 기록을 뜻하지만, 은행 연동으로 읽힐 수 있다.

## 한계

- 사례마다 1~3회만 돌렸고, 변동 폭은 재지 않았다.
- 실제 Kiro 화면(패널 생성 중 표시와 Builder 채팅 전달)은 이 실행에 들어 있지 않다. K15의 실제 Kiro 확인에서 따로 본다.
- 이 실측에 쓴 크레딧: Next Move 12회(제품 경로 8회, 계량 4회)는 회당 약 0.036이다. Analyst 8회는 이전 평가의 평균(회당 약 0.25, Sonnet 5.5)으로 추정했다. 합계 약 2.4크레딧이다.
