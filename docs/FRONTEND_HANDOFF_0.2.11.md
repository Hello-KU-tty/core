# 0.2.11 프론트 인계 (2026-10-16)

Windows 0.2.10 확인에서 보내 준 backend 요청 네 건(TASKS K20)을 처리했다. Mac 0.2.11을 만들어 실제 Kiro에서 확인했다. 이번에도 **frontend 코드 변경은 없다.** 고친 곳은 모두 backend(MCP 경계, 미리 승인, Steering)이고, VSIX의 `portable/bin`으로 들어간다. frontend가 따로 진행하는 두 PR(배치 되돌리기 명령, 재연결 뒤 flow 포트)은 그대로 진행하면 된다. 빌드 절차와 지난 기록은 [Kiro-native 인계](FRONTEND_KIRO_NATIVE_HANDOFF.md)에 있다.

| 할 일 | 어디서 | 끝난 기준 |
| --- | --- | --- |
| 1. Windows 0.2.11 빌드와 확인 | backend `main`, program `main` | 아래 [2](#2-windows-0211-빌드와-확인)의 확인 |
| 2. 올리기와 링크 바꾸기 | `Hello-KU-tty/core`의 `main` | VSIX·receipt·files, 설치 가이드, README를 한 커밋에 |

- **Mac 0.2.11:** [`builder-helper-agent-panel-0.2.11-darwin-arm64.vsix`](../releases/macos/kiro-native/builder-helper-agent-panel-0.2.11-darwin-arm64.vsix) · 41,611,702 bytes · SHA-256 `58d3a262c07ecddd309fe0b886842a8dca56503e47a7cd1f3d6f108b58ad6d97`
- **빌드 출처:** backend `main` `af6942f`(깨끗한 worktree), program `4906b36`(program `main` `324214e`과 같은 트리, Mac·Windows 0.2.10과 같음).
- **바뀐 동작:** [0.2.11에서 바뀐 점](FRONTEND_KIRO_NATIVE_HANDOFF.md#0211에서-바뀐-점). Mac 실측: [K20 실제 Kiro 확인](../tests/eval/results/kiro-steering-0.9.2-k20.md).
- **DB:** migration이 없다. 0.2.10 DB를 그대로 쓰고 0.2.10으로 되돌려도 열린다.

## 1. 보내 준 요청에 대한 backend 답

### 1-1. 한글이 `\uXXXX`로 저장됨

- **Mac에도 있다.**
  - Mac Core DB의 결정 요청 60건에는 없었다. 하지만 10/12 Mac 실측에서 `save_progress` 요약 하나가 이스케이프된 채 저장됐다.
  - 10/9 이후 Mac Kiro 세션 기록의 Vibe Helper 도구 호출 118건 중 11건이 같은 원인이었다.
  - 그래서 Windows·bridge 경로의 문제가 아니다.
- **원인:** 모델이 도구 입력을 JSON 한 단계 더 깊게 쓴다. 한글을 `\uXXXX`로 적고, 배열을 JSON 문자열로 보내고, 때로는 나머지 인자까지 첫 문자열에 넣는다. 보내 준 "최상위 문자열만 이스케이프, 선택지 안은 정상"도 같은 습관이다.
- **0.2.11:** Core의 MCP 입력 단계에서 엄격한 schema 앞에 한 번 다듬는다. 요청한 두 안 중 "풀어서 저장"을 골랐다(사용자 결정). 재시도 크레딧이 들지 않기 때문이다.
  - 문자열 안의 비 ASCII 글자가 모두 `\uXXXX`로 적혀 있으면 풀어서 저장한다. 원래 한글이 든 문자열은 그대로 둔다.
  - JSON 문자열로 온 배열·객체는 풀어서 받는다.
  - 다른 인자까지 한 문자열에 들어가면 `summary holds other arguments (nextSteps, kind). Send every argument as its own field …` 오류로 돌려준다. 아무것도 저장하지 않는다. 보내 준 `save_progress` 사례가 이 경우다.
  - Agent가 보는 도구 schema는 그대로다.
- **남는 것:** Kiro가 `tool_call`의 `arguments` 자체를 문자열로 받으면 Kiro가 먼저 거절한다(`Invalid input for tool_call — arguments: expected object, received string`). 이 경우는 Core에 닿지 않는다. Mac 확인에서 세 번 나왔고, Builder가 매번 곧바로 객체로 다시 보내 성공했다. 채팅에는 "깨진 문자가 섞였네요. 다시 보낼게요" 같은 한 줄이 보인다.
- 0.2.10에서 이미 저장된 `decision_02482d85…` 같은 기록은 고치지 않는다(migration 없음).

### 1-2. 따옴표로 감싼 주소(확인 16)

- Mac kiro-cli 판정기로도 재현된다. Kiro는 명령 글자를 그대로 비교한다.
- **원인 하나를 찾았다.** Kiro `execute_bash`는 주소와 포트가 든 `open http://localhost:5174`를 "서버를 띄우는 명령처럼 보인다"며 실행하지 않는다(Exit -1). 그러면 Builder가 주소를 따옴표로 감싸 다시 실행한다. Windows의 `Start-Process "…"`도 같은 경고 때문일 가능성이 높다.
- **0.2.11 미리 승인:** 이 컴퓨터 주소(localhost·127.0.0.1)에 한해 아래를 더했다. 보내 준 후보와 거의 같다.
  - `Start-Process "http://localhost:*"`, `Start-Process 'http://localhost:*'`(`start`, Mac `open`도 같음)
  - `curl "http://localhost:*`, `curl.exe -s "http://localhost:*` 등
  - `Invoke-WebRequest -Uri http://localhost:*`, `-Uri "http://localhost:*`, `-Uri 'http://localhost:*`(`Invoke-RestMethod`도 같음)
  - 다른 호스트(`@`)는 그대로 막고, `; Remove-Item` 같은 이어 붙인 명령은 계속 묻는다(판정기로 확인).
- **괄호 형태는 패턴으로 풀 수 없다.** `(Invoke-WebRequest -Uri "…" -UseBasicParsing).StatusCode`는 Kiro가 하나의 명령으로 읽지 못해, 패턴을 넣어도 계속 묻는다. 그래서 Steering 0.9.2가 막는다.
  - 서버 확인은 `Invoke-WebRequest http://localhost:<port> -UseBasicParsing`처럼 한 줄로 쓴다.
  - Kiro가 `Start-Process`·`open`을 거절하면 같은 명령을 주소만 큰따옴표로 감싸 다시 실행한다.
- **업그레이드:** 0.2.10에서 미리 승인한 폴더는 0.2.11 Core가 시작할 때 새 규칙으로 바뀐다. 다시 연결할 필요가 없다.

### 1-3. 첫 Task에서 선택을 묻지 않음

- Mac에서 Windows와 같은 조건으로 재현을 시도했다. Workflow를 켜고, 처음 보는 목표로 "계획대로 만들기 시작해 줘"를 보냈다. Steering 0.9.1에서는 선택을 하나 물어 재현되지 않았다. 다만 Builder가 다음처럼 했다.
  - 학습 목표 영역인 데이터 구조를 스스로 정했다.
  - 정렬을 임시로 먼저 짠 뒤 물었다.
  - "학습자가 결정할 만한 실제 선택"처럼 말했다.
- **Steering 0.9.2:**
  - "시작 요청은 어떤 선택도 정하지 않는다."
  - 학습 목표 영역의 코드를 쓰기 전마다 실제 선택이 있는지 보고, 있으면 그때 묻는다.
  - 임시 구현을 먼저 쓰지 않는다.
  - 학습자를 3인칭으로 부르거나 규칙 용어를 쓰지 않는다.
- 0.9.2로 세 번(예상 Decision이 있는 Spec 하나 포함) 첫 Task에서 코드 전에 선택을 물었다.
- **부탁:** Windows 0.2.11 확인 9에서 첫 Task가 또 하나도 묻지 않으면 아래를 알려 주세요. Windows에서만 나는 원인을 좁히는 데 필요하다. 대화 원문·토큰은 빼 주세요.
  - Spec의 학습 목표·에이전트 담당·예상 Decision 목록
  - 첫 턴의 도구 호출 순서(이름만)
  - 선택이나 결정을 언급한 Builder 문장
  - `session.json`의 `workflowsEnabled`

### 1-4. 완료 뒤 이유와 함께 바꾼 선택

- **의도한 동작이다(사용자 결정).** 문서에만 적어 주세요.
- 완료된 Task에 적용된 Decision은 바꾸지 않는다. Core가 `save_choice`를 `DECISION_ALREADY_APPLIED`로 거절한다.
- 완료 뒤 학습자가 이전 선택을 바꾸자고 하면 Builder가 `save_progress` PLAN으로 후속 Task를 연다. 이번 `task_4d41047f…`가 그 경로다. 원래 Decision은 `APPLIED`로 남는다.
- 학습자가 붙인 이유("버튼이 한 번 클릭으로 볼 수 있어서")는 hook이 기록한 발언으로 남는다. Decision 기록에는 "바뀜"이 남지 않는다.
- 후속 Task의 Decision으로 남기는 방안(이전 Decision 참조, 학습자 이유 연결)은 Core 계약이 바뀌므로 본선 뒤 다시 판단한다.

### 참고로 보내 준 것

- **크레딧 한도로 Task가 `ACTIVE`로 남음:** 알려진 제한으로 둔다. 다른 계정으로 "작업 마무리해 줘"를 보내 이어 간 방식이 맞다.
- **입력 중 취소:** Kiro 동작이다. 취소된 턴은 Stop hook이 돌지 않는다. 0.2.9부터 다음 발언 전에 `BUILDER_CHAT_TURN`(`interrupted`)으로 기록된다.
- **배치·재연결 PR:** frontend PR로 진행해 주세요. **program `main`에 합친 뒤 Windows 0.2.11을 빌드하면, 그 program 커밋을 알려 주세요.** Mac도 같은 program 커밋으로 다시 빌드해 두 플랫폼을 맞춘다. 합치기 전에 빌드하면 Mac 0.2.11과 같은 `324214e`다.

## 2. Windows 0.2.11 빌드와 확인

- **절차:** [Windows에서](FRONTEND_KIRO_NATIVE_HANDOFF.md#windows에서)의 1~4. backend `main`은 이 문서가 올라간 커밋 이후, program은 `main`이다. 버전은 `0.2.11`로 나온다.
- **업그레이드 전:** 열려 있는 Kiro 창을 모두 닫는다. migration은 없다. 0.2.11 Core가 처음 뜰 때 연결된 폴더의 미리 승인 규칙과 Steering(0.9.2)을 다시 쓴다.
- **확인 항목:**
  - 1~8은 설치·연결만 다시 본다.
  - 9·14·16은 `kiroAgent.workflows.enabled: true` 그대로 다시 본다. 처음 보는 목표로 새 Project를 만들고, 첫 발언 "계획대로 만들기 시작해 줘"로 시작한다.
  - 18~21은 0.2.10에서 통과했으니 하지 않아도 된다.
  - 아래 22~25를 새로 본다.

22. **한글 저장:**
    - 확인을 마친 뒤 Core DB에서 `decision_requests.payload_json`과 `live_context_versions.payload_json`에 백슬래시+u+16진수 네 자리가 없는지 본다.
    - 세션 기록에 `expected object, received string` 거절이 있으면 몇 번이었는지, Builder가 다시 보내 성공했는지 알려 주세요.
23. **따옴표 주소:**
    - Project 폴더의 `%USERPROFILE%\.kiro\workspace-roots\<해시>\permissions.yaml`에 `Start-Process "http://localhost:*"`와 `Invoke-WebRequest -Uri "http://localhost:*`가 있다.
    - 0.2.10에서 쓰던 `win-0.2.10` 폴더도 0.2.11을 연 뒤 같은 항목이 생긴다.
    - Builder가 서버를 확인하고 브라우저를 여는 명령에 `pending_interaction`이 없다. 승인 창이 뜨면 그 명령 원문과 시각을 알려 주세요.
24. **한 문자열에 몰린 인자:** 일부러 만들기는 어렵다. 나오면 `holds other arguments` 오류 뒤 Builder가 다시 보내는지만 알려 주세요.
25. **Builder 말투:** 첫 Task와 후속 Task에서 Builder가 "학습자", "영역", "제가 정할 몫" 같은 말을 하는지 본다. 나오면 그 문장을 알려 주세요.

## 3. 올리기

- 확인한 VSIX와 `receipt.json`, `files.json`을 core의 `releases/windows/kiro-native/`에 넣고 0.2.10 파일을 교체한다.
- 같은 커밋에서 다음을 0.2.11로 바꾼다. 0.2.10 파일을 지우면 지금 링크가 끊기기 때문이다. 포스터의 설치 QR이 설치 가이드를 가리킨다.
  - [설치 가이드](DOWNLOAD_GUIDE.md)의 Windows 링크·크기·SHA-256과 "Windows용 0.2.11은 준비 중입니다." 문장
  - README의 Windows 링크와 "0.2.10(Windows x64)"
- 커밋 메시지와 [인계 문서](FRONTEND_KIRO_NATIVE_HANDOFF.md)의 Windows 확인 절에 결과(1~16과 22~25)를 남긴다.

## 막히면

[0.2.9 인계의 "막히면"](FRONTEND_HANDOFF_0.2.9.md#4-막히면)과 같다. Core가 뜨지 않으면 알림의 오류 코드를 함께 알려 주세요.
