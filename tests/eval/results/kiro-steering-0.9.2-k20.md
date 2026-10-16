# K20 실제 Kiro 확인: 한글 이스케이프, 따옴표 주소, 첫 Task 선택, Steering 0.9.2 (2026-10-16)

격리 Kiro 프로필(Kiro IDE 1.2.56, 본선 계정, 채팅 모델 Auto, Autopilot)에서 확인했다. 프로필 설정에 `kiroAgent.workflows.enabled: true`를 켰다. frontend Windows 0.2.10 확인과 같은 조건이고, 확인 뒤에는 설정을 되돌렸다. 매번 빈 폴더와 처음 보는 목표로 새 Project를 만들고, Windows와 같은 첫 발언 "계획대로 만들기 시작해 줘"를 보냈다. 학습자 발언은 합성이며 실제 사용자 데이터가 아니다. 화면 조작 없이 probe 확장으로 발언을 보냈다. 승인 창은 명령을 읽고 하나씩 허용했다. 판정은 Kiro 세션 기록과 Core SQLite로 했다.

## Mac 기록에서 본 이스케이프

10/9 이후 이 Mac의 Kiro 세션 기록을 다시 읽었다. 이번 실측 전까지 Vibe Helper 도구 호출은 118건이었다.

| 형태 | 건수 | 결과 |
| --- | --- | --- |
| Kiro `tool_call`의 `arguments`가 JSON 문자열(한글은 `\uXXXX`) | 8 | Kiro가 거절(`arguments: expected object, received string`). Builder가 다시 보냄 |
| 배열 필드를 JSON 문자열로 보냄(`options`, `implemented` 등) | 2 | schema 거절(`Invalid input: expected array`) |
| 최상위 문자열에 `\uXXXX`(10/12 K17 `save_progress` 요약) | 1 | **그대로 저장**(`live_context_versions.currentGoal`) |

- Mac Core DB 14개의 결정 요청 60건에는 이스케이프가 없었다. Windows에서는 같은 증상이 `ask_choice` 세 번에 저장됐다.
- 원인은 모델(Bedrock Claude, Auto)이 입력을 JSON 한 단계 더 깊게 쓰는 습관이다. bridge·Windows 경로가 아니다.
- 이번 실측에서도 `tool_call` 문자열 형태가 3번 나왔다(아래 C·D). Kiro가 매번 거절했고 Builder가 곧바로 정상 객체로 다시 보냈다. Core에는 이스케이프된 글이 저장되지 않았다.

## 따옴표 주소(모델 호출 없는 판정)

`experiments/kiro-shell-permissions/judge.sh`(kiro-cli `_kiro/permissions/explain`)로 판정했다.

- **0.2.10 규칙:** 다음은 모두 묻기였다. Mac `open "…"`·`curl "…"`도 같다.
  - `Start-Process "http://localhost:5173"`, `Start-Process 'http://localhost:5173'`
  - `Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing`
  - `(Invoke-WebRequest -Uri "…" -UseBasicParsing).StatusCode`
- **0.2.11 규칙:**
  - 따옴표 형태와 `-Uri` 형태는 허용된다.
  - 다음은 계속 묻는다.
    - 괄호로 감싼 `.StatusCode` 형태(패턴을 넣어도 하나의 명령으로 읽히지 않음)
    - `@evil.com`이 붙은 주소
    - `; Remove-Item`, `&& rm -rf`, `| Remove-Item`, 줄바꿈, `$( )`
  - 예전 명령 목록 3개(합성, 2차, 체험 실측)는 판정이 하나도 바뀌지 않았다.
- **Kiro 경고:** Kiro `execute_bash`는 주소와 포트가 든 `open http://localhost:5174`를 "서버를 띄우는 명령처럼 보인다"는 경고와 함께 실행하지 않았다(Exit -1). Builder는 B에서 `open 'http://localhost:5174'`, C에서 `/usr/bin/open "http://localhost:5181/"`로 피해 갔다. `open http://localhost:5180/`(끝에 `/`)는 경고 없이 실행됐다.

## 첫 Task

| 세션 | 빌드·Steering | 목표(Spec) | 첫 Task에서 Builder | 승인 창 | 크레딧 |
| --- | --- | --- | --- | --- | --- |
| A | 0.2.10 · 0.9.1 | 보드게임 백과사전(학습 목표 3개, 예상 Decision 없음) | 환경 확인 → PLAN → 뼈대 → 데이터 모델을 스스로 정함("데이터 모델링은 설계상 중요한 부분이지만 … 정하겠습니다") → 정렬을 "임시로" 최대 인원 기준으로 짬 → 테스트 → `ask_choice`(인원 정렬 기준). 답 뒤 고치고 완료. "학습자가 결정할 만한 실제 선택", "학습자가 다룰 영역이라" | 2(첫 `npm create vite`가 대화형으로 멈춰 지우고 다시 만듦) | 7.29 |
| B | 0.2.11 시험 빌드 · 0.9.2 초안 | 독서 기록(학습 목표 1개: 데이터 구조·다중 정렬) | 뼈대 → 정렬 코드 전에 `ask_choice`(같은 평점의 순서, 3안) → 답 뒤 구현·완료. "여러분"으로 부름. 저장소 결정 때 "이건 제가 정해서 만드는 영역인데". `open` 경고 뒤 `open '…'` | 0 | 5.72 |
| C | 0.2.11 릴리스 1차(`b44472c`) | 동아리 회비 상태판(Personal Need, 예상 Decision 1개: 기록 구조) | 환경·PLAN 뒤 코드 전에 예상 Decision을 물음(`tool_call` 문자열 거절 1번 뒤 성공) → 답 뒤 구현·완료(`finish_task`도 문자열 거절 1번 뒤 성공). "이 부분은 제가 정하는 영역이라 결정해서 말씀드릴게요" | 2(`npm approve-scripts esbuild 2>&1 \|\| true`, `/usr/bin/open "…"`) | 6.15 |
| D | 0.2.11 릴리스(`af6942f`) | 생일 친구(학습 목표 2개, 예상 Decision 없음) | 뼈대 → Spec이 다루지 않는 저장 위치를 코드 직전에 물음 → 답 → 정렬 순서(학습 목표)를 따로 물음 → 2번 답에 맞춰 이미 쓴 정렬 코드를 고치고 완료. 처음부터 `open "http://localhost:5174"` | 0 | 6.53 |

- **판정:**
  - Windows처럼 첫 Task에서 하나도 묻지 않는 증상은 Mac에서 0.9.1로도 재현되지 않았다(A). Windows의 원인은 이 기록만으로 좁히지 못했다.
  - 0.9.2에서는 세 번 모두 첫 Task에서 실제 선택을 코드 전에 하나씩 물었다. 예상 Decision이 있는 Spec(C)과 없는 Spec(B, D)을 모두 봤다.
  - D는 정렬 순서를 예고한 뒤 일 순 정렬을 먼저 써 두었고, 그 안을 추천했다. 답이 다르자 코드를 고쳤다. "임시 구현 뒤 묻지 않기"가 완전히 지켜지지는 않았다.
- **규칙 말하기:**
  - A는 "학습자", B·C는 "제가 정하는 영역"이었다.
  - C 뒤 Spec 영역 머리글 "Agent support (decide here and state what you chose)"를 "choose these yourself; in chat, say only what you chose"로 바꿨다. D에서는 영역 이야기가 없고 "화면 레이아웃·스타일은 제가 알아서 정할게요: …"만 남았다.
- **서버:** 네 번 모두 서버를 켜 둔 채 브라우저로 열고 주소를 알렸다. 이름으로 프로세스를 끈 명령은 없었다. `run_workflow`도 없었다.

## 업그레이드

- 0.2.11 Core가 시작하면서 연결된 폴더의 권한 파일을 새 규칙으로 바꾸고 Steering을 0.9.2로 다시 썼다. A 폴더는 새로 만든 파일과 같은 166줄이 됐다.
- 예전 미배포 0.2.9 시험 빌드가 남긴 규칙(`open`·`Start-Process`·`start`만 있음)은 "항상 허용"처럼 남는다(k14·k17 폴더). 배포된 0.2.9~0.2.10 규칙에서 올라오는 경로는 단위 테스트로 확인했다.

## 크레딧

- 채팅 25.69(A 7.29, B 5.72, C 6.15, D 6.53).
- Discovery·Spec 4번과 Analyst·Next Move는 따로 약 2~3이다.
- 계정 누적: 165.91(시작) → 189.63(D 전 IDE 기록) → 약 197.
