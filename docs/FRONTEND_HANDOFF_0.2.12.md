# 0.2.12 프론트 인계 (2026-10-17)

Windows 0.2.11 확인의 backend 할 일 다섯 건(TASKS K21)과 사용자가 본선 계정으로 Windows 0.2.11을 두 번 써 본 결과(TASKS K22)를 처리해 Mac 0.2.12를 만들고 실제 Kiro에서 확인했다. 고친 곳은 모두 backend라 VSIX의 `portable/bin`으로 들어간다. **이번 빌드에 frontend 코드 변경은 필요 없다.** 다만 사용자가 말한 패널 UI 요청 세 가지가 frontend 몫이다(아래 [3](#3-패널-ui-사용자-요청)). 빌드 절차와 지난 기록은 [Kiro-native 인계](FRONTEND_KIRO_NATIVE_HANDOFF.md)에 있다.

| 할 일 | 어디서 | 끝난 기준 |
| --- | --- | --- |
| 1. Windows 0.2.12 빌드와 확인 | backend `main`(이 문서가 올라간 커밋 이후), program `main` `1eefe3f` | 아래 [2](#2-windows-0212-빌드와-확인)의 확인 |
| 2. 올리기와 링크 바꾸기 | `Hello-KU-tty/core`의 `main` | VSIX·receipt·files, 설치 가이드, README를 한 커밋에 |
| 3. 패널 UI | `Hello-KU-tty/program` | 본선 전에 할 수 있는 것만. 아래 [3](#3-패널-ui-사용자-요청) |

- **Mac 0.2.12:** [`builder-helper-agent-panel-0.2.12-darwin-arm64.vsix`](../releases/macos/kiro-native/builder-helper-agent-panel-0.2.12-darwin-arm64.vsix) · 41,613,213 bytes · SHA-256 `baa150b12117f1d0174c0540e162b67ebd442d4597be89732f5a7b3603e7f61c`
- **빌드 출처:** backend `main` `c781eb5`, program `main` `1eefe3f`(Windows 0.2.11과 같음). 둘 다 깨끗한 worktree다.
- **바뀐 동작:** [0.2.12에서 바뀐 점](FRONTEND_KIRO_NATIVE_HANDOFF.md#0212에서-바뀐-점). Mac 실측: [Mac 0.2.12 확인](../tests/eval/results/kiro-0.2.12-mac-check.md). 사용자 Windows 기록 분석: [K22](../tests/eval/results/kiro-windows-trial-k22.md).
- **DB:** migration이 없다. 0.2.11 DB를 그대로 쓰고 0.2.11로 되돌려도 열린다.

## 1. 0.2.11 확인에서 받은 요청의 답

1. **Mac 재빌드:** program `1eefe3f`로 다시 빌드했고, 버전은 두 플랫폼 모두 0.2.12로 맞춘다.
2. **#11·#12 Mac 확인:**
   - #11 "Vibe Helper: Restore Kiro Layout": 실행하면 확인 알림이 뜨고, "되돌리기"를 누르면 배치가 처음으로 돌아갔다.
   - #12 재연결 뒤 flow 포트: 패널을 열 때 Core를 준비하지 못한 상태(절전 직후 등)를 Mac에서 만들지 못했다. program `1eefe3f`의 타입 검사와 테스트 843개(`flow-ports-reconnect.test.ts` 포함)가 Mac에서 통과한 것으로 갈음했다.
3. **설치 가이드 문구:** "(Windows 0.2.11부터)"를 "(Mac 0.2.12, Windows 0.2.11부터)"로 고쳤다.
4. **첫 턴 승인 창(`cmd /c ver; …`):** Steering 0.9.3이 버전 확인만 하게 했다. Mac 실측에서 승인 없이 돌았다.
5. **본선 뒤로 미룬 것:** TASKS K21·K22에 적었다.

## 2. Windows 0.2.12 빌드와 확인

- **절차:** [Windows에서](FRONTEND_KIRO_NATIVE_HANDOFF.md#windows에서)의 1~4. backend `main`은 이 문서가 올라간 커밋 이후, program은 `main` `1eefe3f`다. 버전은 `0.2.12`로 나온다.
- **업그레이드 전:** 열려 있는 Kiro 창을 모두 닫는다. migration은 없다. 0.2.12 Core가 처음 뜰 때 연결된 폴더의 미리 승인 규칙과 Steering(0.9.4)을 다시 쓴다.
- **확인 항목:**
  - 1~8은 설치·연결만 다시 본다.
  - 9·14·16은 지금 PC 설정 그대로 본다(Workflow를 켜 두었다면 그대로). 처음 보는 목표로 새 Project를 만들고, 첫 발언 "계획대로 만들기 시작해 줘"로 시작한다.
  - 아래 26~30을 새로 본다.

26. **npm:**
    - Kiro 채팅의 명령에서 `npm -v`, `npm install`이 오류 없이 돈다. `double-loading config … as "global", previously loaded as "user"`가 나오면 안 된다.
    - Builder가 `$env:NPM_CONFIG_GLOBALCONFIG=$null; …` 같은 우회를 쓰지 않는다.
27. **승인 창:**
    - 첫 Task에서 뜬 승인 창의 명령 원문과 개수를 알려 주세요.
    - `pnpm test 2>&1 | Out-String` 같은 명령과 서버 확인 `Invoke-WebRequest http://localhost:<port> -UseBasicParsing | Select-Object -ExpandProperty StatusCode`는 묻지 않아야 한다.
    - Project 폴더의 `%USERPROFILE%\.kiro\workspace-roots\<해시>\permissions.yaml`에 `Out-String`과 `Invoke-WebRequest "http://localhost:*`가 있다. 0.2.11 때 쓰던 폴더에도 0.2.12를 연 뒤 생긴다.
    - 괄호(`(Invoke-WebRequest …).StatusCode`)나 `try { … }` 형태가 나오면 그 원문을 알려 주세요. 이 형태는 계속 묻는다.
28. **개념 기록(학습 기록 탭):**
    - Task를 마친 뒤 Core DB `completion_reports.payload_json`의 `conceptUsage`가 비어 있지 않다. 세션 기록의 `finish_task` 결과 `ignoredConcepts`가 비어 있다.
    - 패널 학습 기록에 이번 Task의 개념이 보인다. 0.2.11에서는 Builder가 개념 이름을 바꿔 써서 기록되지 않았다.
29. **실패 보고:** 설치나 테스트가 종료 코드 0이 아니게 끝나면 Builder가 "됐다"가 아니라 실패라고 말한다. 생겼을 때만 알려 주세요.
30. **새 창 연결 시간과 신뢰:**
    - 패널에서 새 Project를 열 때 창이 뜬 시각부터 패널이 연결될 때까지 몇 초인지 알려 주세요. 사용자 기록에서는 첫 창 약 10초, 두 번째 창은 확장 활성화까지만 19초였다.
    - 신뢰 창에 "상위 폴더도 신뢰" 선택지가 있는지 봐 주세요. 있으면 부스 PC에서 상위 폴더(`%APPDATA%\Kiro\User\globalStorage\vibe-helper.builder-helper-agent-panel\core-data\workspaces\projects`)를 한 번 신뢰한다. 그다음 새 Project 창이 신뢰 창과 다시 로드 없이 열리는지 확인해 주세요. 없으면 Kiro 신뢰 설정 화면의 폴더 추가로 같은 폴더를 넣어 본다. Mac 실측 프로필은 개발 호스트 창이라 신뢰 창이 뜨지 않아 확인하지 못했다.

## 3. 패널 UI (사용자 요청)

사용자가 Windows에서 써 보며 말한 것 중 frontend 몫이다. 본선 전에 할 수 있는 것만 해 주세요. backend 쪽에 필요한 변경은 없다.

1. **탭 정리:** 빌더·도우미·학습 기록 탭을 정리해 달라고 했다. 어떻게 정리할지는 사용자와 직접 정해 주세요.
2. **첫 화면 진행 안내:** 처음 쓰는 사람은 Kiro 채팅에 무엇을 입력할지 모른다("ㄱㄱ" 한 번이면 시작되는데). Kiro 채팅 연결 직후 패널 왼쪽에 진행 순서를 보여 주면 좋겠다고 했다. 예:
   1. Kiro 채팅에 "시작해 줘"라고 보내면 만들기가 시작돼요.
   2. 번호로 묻는 선택이 오면 번호와 고른 이유를 한 문장으로 적어요.
   3. 다 만들면 브라우저에서 바로 확인할 수 있어요.
   4. 끝나면 "다음 한 걸음"에서 번호를 골라 이어서 만들어요.
3. **Next Move 카드의 입력 예시:** 후보마다 "Kiro 채팅에 '2번 해 보자'라고 보내 보세요" 같은 문구와 복사 버튼(`vscode.env.clipboard.writeText`)을 두면 좋겠다고 했다.
   - Kiro 채팅 입력칸을 채우거나 보내는 공개 명령은 없다. 실측 probe가 쓰는 `kiroAgent.sessions.sendPrompt`는 Kiro의 비공개 개발용 명령이다.
   - 버튼이 대신 보내면 학습자가 쓰지 않은 문장이 학습자 발언으로 기록된다. 그래서 자동 입력·전송은 하지 않는다.
   - "Task로 바로 추가하고 'ㄱㄱ'만 치게 하기"는 사용자가 더 고민하기로 했다. 결정 전에는 만들지 않는다.

**본선 뒤 제안(지금은 하지 않음):** 우리 확장은 `package.json`의 `extensionDependencies: ["kiro.kiroAgent"]` 때문에 Kiro 에이전트 전용 확장 호스트에 같이 놓인다. 사용자 Windows 기록에서 그 호스트가 새 창 시작 때 여러 번 응답하지 않았고, 우리 확장 활성화가 창이 뜬 뒤 19초였다. 확장이 Kiro 에이전트를 부르는 곳은 `kiroAgent.newSession` 명령 하나뿐이라 의존을 빼면 일반 호스트에서 더 일찍 뜰 수 있다. 다만 활성화 순서가 바뀌므로 두 플랫폼에서 재 보고 정하자.

## 4. 올리기

- 확인한 VSIX와 `receipt.json`, `files.json`을 core의 `releases/windows/kiro-native/`에 넣고 0.2.11 파일을 교체한다.
- 같은 커밋에서 다음을 0.2.12로 바꾼다. 0.2.11 파일을 지우면 지금 링크가 끊기기 때문이다. 포스터의 설치 QR이 설치 가이드를 가리킨다.
  - [설치 가이드](DOWNLOAD_GUIDE.md)의 Windows 링크·SHA-256, 첫 문단의 "**0.2.11**(Windows) … Windows용 0.2.12는 준비 중입니다." 문장, "6. 문제가 생기면"의 "(Mac 0.2.12, Windows 0.2.11부터)"
  - README의 Windows 링크와 "**0.2.11**(Windows x64) … Windows 0.2.12는 frontend가 빌드해 올린다."
- 커밋 메시지와 [인계 문서](FRONTEND_KIRO_NATIVE_HANDOFF.md)의 Windows 확인 절에 결과(1~16과 26~30)를 남긴다.

## 막히면

[0.2.9 인계의 "막히면"](FRONTEND_HANDOFF_0.2.9.md#4-막히면)과 같다. Core가 뜨지 않으면 알림의 오류 코드를 함께 알려 주세요.
