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

## 실제 Kiro 확인 (0.2.8, 2026-10-12)

- 설치물: Mac 0.2.8(backend `10eaafb`, frontend `feat/next-move-card` `6a6a557`, 두 checkout 모두 깨끗함). 격리 Kiro 프로필(Kiro 1.2.56, 본선 계정)에 K14 테스트 빌드 위로 설치했다. K14의 러닝 기록 Project(처음 보는 목표, Personal Need 있음)를 그대로 썼고, 기존 DB가 migration 0008로 올라가면서 Project 기록은 남았다.
- 방법: 채팅 발언은 probe가 보냈고(학습자 대신 입력), 패널은 CDP로 webview DOM을 1초마다 읽고 화면을 다시 렌더링해 봤다. 판정은 Kiro 세션 기록과 Core SQLite로 했다.

| 순서 | 결과 |
| --- | --- |
| 1. 열린 선택에 "1번"으로 답함 | Builder가 `save_choice` → 구현 → 테스트 7개 통과 → `finish_task`. 완료 메시지 끝에 "프로젝트를 키울 만한 아이디어를 준비하고 있어요…패널에서 볼 수 있고, 여기서 물어봐도 됩니다" 한 줄 |
| 2. 패널 | 완료 1.9초 뒤 생성 중 표시, 9.8초 뒤 후보 3개. Builder 머리글도 "이번 작업을 완료했어요"로 바뀜. job은 PENDING→SUCCEEDED 8.3초, 같이 돈 Analyst 7.8초, 둘 다 첫 시도 |
| 3. "다음엔 뭘 더 해 보면 좋을까?" | Builder가 `check_progress` 1회로 후보 3개를 번호와 함께 그대로 전하고 "지금은 그냥 둬도 괜찮아요"로 맺음 |
| 4. "2번 해 보자. 지난달이랑 이번 달 기록을 비교해 보고 싶어" | `save_progress` PLAN에 `nextMove: 2`. 후속 Task 4의 목표가 "다음 한 걸음 2번 "기록 검색·필터링": …\n학습자 요청: …"이 되고 Task에 후보 출처(AGENT/DISCOVERY)가 남음. 패널 카드는 사라지고 머리글이 새 Task로 바뀜 |
| 5. 후속 Task | Builder가 API 선택(날짜 범위를 받는 방식) 하나를 물음 → "1번" → 구현·실서버 요청 확인 → `finish_task` |
| 6. 새 후보 | 완료 3.5초 뒤 생성 중, 10.3초 뒤 새 후보 3개(개인 러닝 기록 분석, 기록 일괄 가져오기, 월별 목표와 달성률). 고른 "기록 검색·필터링"은 다시 나오지 않음. job 8.9초, Analyst 6.5초 |

- 크레딧: 채팅 4턴 6.7, Analyst 3회와 Next Move 2회를 더해 약 7.5. 계정 표시는 시작 때 97.68/1000.
- 소견: Builder가 크기를 "(SMALL)"처럼 영어 값 그대로 전했다. 새 후보의 "월별 목표와 달성률"은 1회차에서 고르지 않은 "팀 진행률 비교"와 방향이 비슷하다(고르지 않은 후보의 재등장은 허용). 패널 카드 항목의 테두리는 Kiro 어두운 테마에서 거의 보이지 않는다(패널의 다른 카드와 같은 색 변수).

## 한계

- 사례마다 1~3회만 돌렸고, 변동 폭은 재지 않았다.
- 실제 Kiro 확인은 Mac 한 Project에서 한 번이다. 실패와 "다시 만들기"는 실제 화면에서 일어나지 않아 패널 단위 테스트와 Core integration 테스트로만 확인했다. Windows는 frontend 확인을 기다린다.
- 이 실측에 쓴 크레딧: Next Move 12회(제품 경로 8회, 계량 4회)는 회당 약 0.036이다. Analyst 8회는 이전 평가의 평균(회당 약 0.25, Sonnet 5.5)으로 추정했다. 합계 약 2.4크레딧이다.
