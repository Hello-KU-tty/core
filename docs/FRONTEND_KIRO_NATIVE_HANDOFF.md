# 본선 설치물 0.2.13 (Kiro-native, Mac·Windows) 프론트 인계

본선 방향([PROJECT_BRIEF §0](../PROJECT_BRIEF.md))에 맞춰 Mac 설치물의 host를 Kiro-native로 바꿨다. 0.2.1은 첫 실사용 체험 피드백(K09)을 반영했고, 0.2.2는 본선 계정 재실측에서 나온 Analyst·Evidence 정책 변경을 더했고, 0.2.3은 Kiro 채팅 Helper 에이전트가 도구를 받지 못하던 문제를 고치고 Helper를 읽기 전용으로 바꿨고, 0.2.4는 Kiro 연결이 Core 재시작을 넘어 유지되게 하고 끊긴 동안의 학습자 발언을 큐로 보존하며, 0.2.5는 같은 코드로 Windows x64 설치물을 빌드할 수 있게 했다(Mac은 backend, Windows는 frontend가 빌드). 0.2.6은 버전 강제를 완화했고, 0.2.7은 Kiro 채팅 Builder 도구를 다시 설계하고(K10) 개발 명령 미리 승인(K11), 완료 뒤 이어서 만들기, frontend가 Windows에서 찾은 문제 수정을 더했다. 0.2.8은 Builder가 묻는 기준(K14)과 Task를 마칠 때마다 확장 방향 3개를 제안하는 Next Move(K15, 패널 카드 포함)를 더했다. 0.2.9는 사용자 직접 체험의 후속(K17)이다: 학습자 선택 위조 방지와 "내가 고른 게 아니야" 되돌리기, 중단된 턴 기록, 미리 승인 때 Autopilot과 새 채팅 세션, `/vibe-helper` 하나, 완료 뒤 서버 유지, 패널 빌더 탭 정리와 남은 시간 표시. 0.2.10은 frontend Windows 0.2.9 확인의 후속(K18)이다: Core·bridge의 실행 파일 이름을 `vibe-helper-core`로 바꿔 이름으로 node를 끄는 명령에서 지키고, 다시 로드·절전·시작 실패 뒤 Core가 다시 뜨게 하고, Builder가 구현을 Kiro Workflow에 넘기지 않게 했다(Steering 0.9.1). 0.2.11은 frontend Windows 0.2.10 확인의 후속(K20)이다: 모델이 JSON 한 단계 더 깊게 쓴 도구 입력(`\uXXXX` 한글, 문자열로 온 배열)을 Core가 풀어서 받고, 따옴표로 감싼 이 컴퓨터 주소를 미리 승인에 더하고, 첫 Task에서도 학습 목표 영역의 선택을 묻게 했다(Steering 0.9.2). 0.2.12는 frontend Windows 0.2.11 확인(K21)과 사용자 Windows 실사용(K22)의 후속이다: program `1eefe3f`(배치 되돌리기 명령, 재연결 뒤 flow 포트), 첫 턴 버전 확인만 하기(Steering 0.9.3), Project 터미널의 npm 설정 오류 수정, `Out-String`과 따옴표 `Invoke-WebRequest` 미리 승인, `check_progress`의 Spec 개념 이름과 그 이름으로 완료 보고하기(Steering 0.9.4). 0.2.13은 backend가 맡은 패널 정리(K23: 진행·학습 기록 두 탭, "지금 할 일" 카드, 복사만 하는 채팅 문구, 창마다 자기 Project)와 결정 순간 Helper 안내(K24, Steering 0.9.6)다. 2026-10-11부터 두 저장소 모두 `main` 브랜치 하나로 작업한다.

- 설치 파일: Mac [`releases/macos/kiro-native/builder-helper-agent-panel-0.2.13-darwin-arm64.vsix`](../releases/macos/kiro-native/builder-helper-agent-panel-0.2.13-darwin-arm64.vsix) · 41,625,387 bytes · SHA-256 `7a1218213f93aa13c5cdd9df157bf1a7ceac57272776ef1db9e2be89a9b39b92` · [receipt](../releases/macos/kiro-native/macos-vsix-receipt.json) · [항목별 hash](../releases/macos/kiro-native/files.json)
- 설치 파일: Windows는 0.2.12다. [`releases/windows/kiro-native/builder-helper-agent-panel-0.2.12-win32-x64.vsix`](../releases/windows/kiro-native/builder-helper-agent-panel-0.2.12-win32-x64.vsix) · 2,608,078 bytes · SHA-256 `bd65be96e6ddb9beb9e92ed32d8faac2a471d5a0c542b1d861beb56aa34b9a4b` · [receipt](../releases/windows/kiro-native/windows-vsix-receipt.json) · [항목별 hash](../releases/windows/kiro-native/files.json). frontend가 backend `e020bbc`와 program `1eefe3f`로 빌드하고 확인했다([0.2.12 Windows 확인](#0212-windows-확인-2026-10-17)). Windows 0.2.13은 아래 [Windows 0.2.13 빌드 요청](#windows-0213-빌드-요청-frontend)대로 만든다.
- 빌드 출처(Mac 0.2.13): backend `eb7a130`(`main`, 깨끗한 worktree), frontend `d314006`(program `main`, 깨끗한 worktree). 0.2.12(backend `c781eb5`, frontend `1eefe3f`), 0.2.11(backend `af6942f`, frontend `4906b36`), 0.2.10(backend `dc5859e`, frontend `324214e`), 0.2.9(backend `3721a76`, frontend `4906b36`), 0.2.8(backend `10eaafb`, frontend `6a6a557`), 0.2.7(backend `5f1257c`, frontend `88275f6`), 0.2.6(backend `a18f718`), 0.2.5(backend `1f1eea4`), 0.2.4(backend `2b0487a`), 0.2.3(backend `7df50ec`), 0.2.2(backend `012c664`), 0.2.1(backend `4def349`)과 0.2.0(frontend `e65cd7f`)은 Git 이력에 있다.

## 프론트 담당자 빠른 시작

- **이번에 할 일(0.2.13):** [0.2.13 프론트 인계](FRONTEND_HANDOFF_0.2.13.md)에 Windows 0.2.13 빌드(program `main` `d314006`), 새 확인 31~36(탭, 지금 할 일, 결정 순간 Helper 안내, Next Move 복사, 다른 Project 창, 미리 승인), 올리기를 모았다. 패널 코드는 backend가 program `main`에 이미 합쳤다.
- **지난 할 일(0.2.12):** [0.2.12 프론트 인계](FRONTEND_HANDOFF_0.2.12.md)에 할 일 순서, 사용자와 같이 정할 것(빌드 순서, 탭 정리, 첫 화면 안내, Next Move 바로 시작), Windows 0.2.12 빌드와 추가 확인 26~30, 사용자가 말한 패널 UI 요청(탭 정리, 첫 화면 진행 안내, Next Move 입력 예시), 0.2.11 확인 요청 다섯 건의 답을 모았다. 빌드에 frontend 코드 변경은 필요 없다.
- **지난 할 일(0.2.11):** [0.2.11 프론트 인계](FRONTEND_HANDOFF_0.2.11.md)에 보내 준 요청 네 건의 답, Windows 0.2.11 빌드와 추가 확인 22~25를 모았다. frontend 코드 변경은 없다. 지난 할 일은 [0.2.10 프론트 인계](FRONTEND_HANDOFF_0.2.10.md)와 [0.2.9 프론트 인계](FRONTEND_HANDOFF_0.2.9.md)에 있다.
- **코드:** backend `Hello-KU-tty/core`의 `main`(이 문서와 설치 파일), frontend `Hello-KU-tty/program`의 `main`(PR #10의 "Kiro 채팅에서 열기" 패널 포함). `finals/kiro-native`·`finals/trial-feedback`은 `main`에 합쳤고 더 쓰지 않는다. 새 작업은 `main`에서 브랜치를 따서 `main`으로 PR한다.
- **설치 파일 바로 받기:** [0.2.13 Mac VSIX](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/macos/kiro-native/builder-helper-agent-panel-0.2.13-darwin-arm64.vsix). 받은 뒤 `shasum -a 256 <파일>`이 위 SHA-256과 같은지 확인한다. 학습자용 설치·사용 안내는 [설치 가이드](DOWNLOAD_GUIDE.md)에 따로 있고, 이 문서는 빌드·확인·패널 계약을 다룬다.
- **Mac(Apple Silicon):** 아래 [설치 전 준비](#설치-전-준비)와 [설치와 사용 흐름](#설치와-사용-흐름)대로 쓴다.
- **Windows:** frontend가 빌드·확인·업로드한다. 절차는 [Windows에서](#windows에서)에 있다(0.2.5부터).
- **패널 코드에 필요한 변경(0.2.9):** backend가 frontend 저장소 브랜치 `feat/k17-panel` 하나에 Next Move 카드(`feat/next-move-card`), 다시 로드 안내(`feat/reload-required-notice`), K17 패널 정리를 모았다. Windows 0.2.9를 빌드하기 전에 이 브랜치를 `main`에 합쳐 주세요(아래 [Windows 0.2.9 빌드 요청](#windows-029-빌드-요청-frontend)). host API(`frontend-host.d.cts`)의 `openProjectInKiro` 결과에 선택 필드 `freshSession`이 생겼다. 0.2.2의 Evidence 표시 검토도 그대로다([0.2.2에서 바뀐 점](#022에서-바뀐-점-analystevidence-정책)).

## Windows 0.2.13 빌드 요청 (frontend)

backend가 패널 정리(K23)와 결정 순간 Helper 안내(K24)를 program `main` `d314006`에 합치고 Mac 0.2.13을 만들어 실제 Kiro에서 확인했다. 할 일, 추가 확인 31~36, 올리기는 [0.2.13 프론트 인계](FRONTEND_HANDOFF_0.2.13.md)에 있다. 빌드는 사용자나 frontend가 한다.

## 0.2.13에서 바뀐 점

backend가 맡은 패널 정리와 결정 순간 Helper 안내다(TASKS K23·K24, [DECISIONS](DECISIONS.md) "Kiro-native 패널 정리(K23)", "결정 순간 Helper 안내(K24)"). DB 형식은 바뀌지 않았다.

- **패널(program `d314006`):**
  - 탭은 진행 · 학습 기록 두 개이고 도우미 탭은 없다. 패널 이름은 Vibe Helper다.
  - "지금 할 일" 카드는 상태마다 문장 하나와 행동 하나를 둔다. "Kiro 채팅에서 열기"는 이 창이 그 Project의 폴더가 아닐 때만 보인다.
  - 채팅에 보낼 말은 복사만 한다: `시작해 줘`, `다음 작업후보 N번 진행해`, 결정을 기다릴 때의 예시 질문 `/vibe-helper 이 선택지들이 뭐가 다른지 쉽게 알려줘`. 대신 보내지 않는다.
  - "이렇게 진행돼요" 4단계, 학습 기록은 열자마자 불러오고 학습자 원문만 인용, "결과 실행" 버튼 제거.
  - 창마다 그 폴더의 Project를 먼저 연다. 다른 Project를 보면 카드 위에 새 창에서 열기 안내가 있고 복사 문구는 없다.
- **host(`frontend-host.cjs`):** 창 상태 `kiroWindow(projectId)`, 새 창 대기 안내(신뢰 뒤 10~30초), 폴더를 못 쓰는 이유를 쉬운 말로.
- **Steering 0.9.5·0.9.6:** 답을 기록한 직후 진행 메모. 결정을 물을 때마다 몰라도 된다는 말과 `/vibe-helper` 예시, 자기 말로 묻기 권유. `/vibe-helper`로 시작하는 메시지는 Helper Steering이 없어도 읽기만 하는 질문이다.
- **미리 승인:** 이 컴퓨터 주소로 가는 curl의 여러 형태(`http://` 없음, 옵션 앞, 따옴표), `set -e`, `set -o pipefail`, `#` 주석 줄. 0.2.12 규칙을 가진 폴더는 0.2.13 Core가 시작할 때 바뀐다.
- **Discovery:** 1.4.0 그대로다.

## Windows 0.2.12 빌드 요청 (frontend)

**완료(2026-10-17):** 확인 1~8, 9, 14, 16과 26~28을 통과했고, 29는 나오지 않았다. 30은 이 PC에서 신뢰 창이 뜨지 않아 상위 폴더 신뢰 선택지를 보지 못했다. 이 PC는 부스 PC가 아니다. [0.2.12 Windows 확인](#0212-windows-확인-2026-10-17)

backend가 Windows 0.2.11 확인의 다섯 건(K21)과 사용자 Windows 실사용 2회의 후속(K22)을 처리해 Mac 0.2.12를 만들고 실제 Kiro에서 확인했다([Mac 0.2.12 확인](../tests/eval/results/kiro-0.2.12-mac-check.md)). 할 일, 답, 추가 확인 26~30, 패널 UI 요청은 [0.2.12 프론트 인계](FRONTEND_HANDOFF_0.2.12.md)에 있다.

## Windows 0.2.11 빌드 요청 (frontend)

**완료(2026-10-16):** program `main` `1eefe3f`(program#11·#12 합침)로 빌드했다. 확인 1~8, 9, 13, 14, 16과 22·23·25를 통과했고, 24는 나오지 않았다. [0.2.11 Windows 확인](#0211-windows-확인-2026-10-16)

backend가 Windows 0.2.10 확인의 요청 네 건을 처리해 Mac 0.2.11을 만들고 실제 Kiro에서 확인했다([0.2.11 확인](#0211-확인-2026-10-16-mac)). 할 일, 답, 추가 확인 22~25는 [0.2.11 프론트 인계](FRONTEND_HANDOFF_0.2.11.md)에 있다. program은 `main`으로 빌드한다. frontend의 두 PR을 먼저 합쳤다면 그 커밋을 알려 주세요. Mac도 같은 커밋으로 다시 빌드한다. 버전은 `0.2.11`로 나온다.

## Windows 0.2.10 빌드 요청 (frontend)

**완료(2026-10-15):** 확인 1~20 중 16을 뺀 모두 통과, 21은 해당 없음. [0.2.10 Windows 확인](#0210-windows-확인-2026-10-15)

backend가 Windows 0.2.9 확인의 세 건을 고쳐 Mac 0.2.10을 만들고 실제 Kiro에서 확인했다([0.2.10 확인](#0210-확인-2026-10-14-mac)). Windows 0.2.9는 올리지 않고 0.2.10으로 건너뛴다. 할 일과 추가 확인 18~21은 [0.2.10 프론트 인계](FRONTEND_HANDOFF_0.2.10.md)에 있다. 확인 1~17은 아래 0.2.9 요청의 목록을 그대로 쓴다. program은 `main`(`324214e`) 그대로 빌드한다. 버전은 `0.2.10`으로 나온다.

## Windows 0.2.9 빌드 요청 (frontend)

**중단(2026-10-14):** 확인 1~8 통과 뒤 세 건으로 막혔고, 0.2.10으로 건너뛴다([0.2.9 Windows 확인](#029-windows-확인-2026-10-14-중단)). 아래 확인 11~17은 0.2.10에서도 쓴다.

backend가 Mac 0.2.9를 만들고 실제 Kiro에서 확인했다([0.2.9 확인](#029-확인-2026-10-12-mac)). Windows 0.2.8은 만들지 않고 0.2.9로 건너뛴다. 아래 순서로 부탁해요. 리뷰할 곳과 Windows에서 특히 볼 곳은 [0.2.9 프론트 인계](FRONTEND_HANDOFF_0.2.9.md)에 있다.

1. **frontend 브랜치 합치기:** `Hello-KU-tty/program`의 `feat/k17-panel`(커밋 `4906b36`)을 `main`에 합친다. 이 브랜치는 `feat/next-move-card`(`6a6a557`)에서 분기했고 `feat/reload-required-notice`(`9ef88d6`)를 합쳐 두었다(충돌은 안내 문구 두 곳, backend가 풀었다). 합친 결과에서 typecheck 통과와 `npm test` 838개 통과를 backend가 확인했다.
2. **빌드:** backend `main`(`3721a76` 이후)과 합친 frontend `main`으로 [Windows에서](#windows에서)의 1~4대로 빌드한다. 버전은 `0.2.9`로 나온다.
3. **확인:** 0.2.7 확인 1~10과 아래 11~17을 한다. 0.2.9는 DB를 migration 0009까지 올리므로 설치 뒤 이전 버전으로 되돌리면 Core가 DB를 열지 못한다.
   11. **Next Move 카드:** Task를 마친 직후 빌더 탭에 "다음 한 걸음" 카드가 생기고 10초 안팎에 후보 3개로 바뀐다. 시작 버튼이 없다. Builder 완료 메시지 끝에 아이디어를 준비 중이라는 한 줄이 있다.
   12. **번호로 시작:** "다음엔 뭘 해 보면 좋을까?"에 Builder가 같은 후보를 번호로 전하고, "2번 해 보자"로 후속 Task가 생기며 카드가 사라진다.
   13. **새 세션과 Autopilot:** 신뢰하지 않은 빈 폴더를 열고 연결한다. "개발 명령 미리 승인"을 고르면 Kiro 설정 `kiroAgent.agentAutonomy`의 적용값이 `Autopilot`이다. Kiro 1.2.56은 기본값이 `Autopilot`이라 이미 그 값이면 `settings.json`에 키가 생기지 않는다(설정 화면 값으로 본다). 신뢰 → "다시 로드" → 4초쯤 뒤 Kiro 채팅에 새 세션이 열리고, 첫 턴이 파일 검토 없이(Autopilot) 돈다. 0.2.7에서 올린 설치는 승인 방식을 이미 골라 다시 묻지 않으므로, 먼저 명령 팔레트 "Vibe Helper: Change Command Approval"에서 미리 승인을 다시 고른다.
   14. **선택 위조 방지와 되돌리기:** Builder가 번호로 물으면 먼저 곁가지 질문을 한다. 기록되지 않고 다시 물어야 한다. 답한 뒤 "그건 내가 고른 게 아니야"라고 하면 같은 질문이 다시 열린다(패널 결정 줄이 "Kiro 채팅에서 답을 기다려요").
   15. **중단된 턴:** Builder가 만드는 중에 채팅의 Cancel로 멈춘 뒤 다음 발언을 보낸다. Core `activity_events`에 멈춘 턴의 `BUILDER_CHAT_TURN`(`interrupted: true`)이 새 발언보다 먼저 있다.
   16. **완료 뒤 서버와 브라우저:** Task가 끝나면 서버가 켜진 채 브라우저가 열리고(`Start-Process http://localhost:…`, 승인 창 없음) 메시지 끝에 주소가 있다.
   17. **패널과 메뉴:** `/` 메뉴에 `/vibe-helper`가 하나만 보인다. 빌더 탭은 상태 → 이번 작업의 학습 기록 → 다음 한 걸음 → 이번 작업의 결정 순서다. 긴 명령 중에도 Kiro 채팅이 터미널로 바뀌지 않는다. 0.2.7에서 올렸다면 처음 열 때 "원래 배치로 되돌리기"를 묻는다.
4. **올리기:** 확인한 VSIX와 `receipt.json`, `files.json`을 `releases/windows/kiro-native/`에 넣어 `main`에 올린다(0.2.7 파일은 교체). 커밋 메시지와 이 문서의 Windows 확인 절에 1~17 결과를 남긴다.
5. **설치 가이드 고치기:** 학습자용 [설치 가이드](DOWNLOAD_GUIDE.md)의 Windows 내려받기 링크·크기·SHA-256과 "Windows용 0.2.9는 준비 중" 문장, README "다운로드·설치"의 Windows 링크를 0.2.9로 바꾼다. 0.2.7 파일을 지우면 지금 링크가 끊기므로 4와 같은 커밋에서 바꾼다. 포스터의 설치 QR이 이 가이드를 가리킨다.

## Windows 0.2.7 빌드 요청 (frontend)

**완료(2026-10-11):** 결과는 [0.2.7 Windows 확인](#027-windows-확인-2026-10-11)에 있다. 아래는 원래 요청이다.

backend `main`과 frontend `main`으로 Windows 0.2.7을 빌드해 확인하고 올려 주세요. 절차는 [Windows에서](#windows에서)의 1~4와 같다. 확인 1~7에 아래 세 가지를 더해 결과를 커밋 메시지와 이 문서의 Windows 확인 절에 남긴다.

8. **늦은 신뢰:** 빈 폴더를 신뢰하지 **않은** 상태로 열고, 신뢰 설정에서 신뢰한 뒤 "이걸로 시작"(또는 Open Project in Kiro Chat)을 누른다. "이 창은 폴더를 신뢰하기 전에 열려서…다시 로드할까요?" 알림이 떠야 하고, 다시 로드 뒤 MCP 목록에 `vibe-helper Connected`, hook 2개 등록이 보여야 한다.
9. **채팅 Decision:** Builder가 번호 선택지로 물으면 "2번, 이유는 …"처럼 답한다. History나 Core에서 그 Decision이 학습자 선택으로 확정되고 학습자 발언이 연결됐는지 본다.
10. **완료 뒤 이어서 만들기:** Task가 완료된 뒤 같은 채팅에서 기능을 하나 더 부탁한다. 새 Task(이전 Task를 이어받음)가 생기고 Builder가 그 Task로 작업·완료하는지 본다.

## 0.2.12에서 바뀐 점

frontend Windows 0.2.11 확인(2026-10-16)과 사용자의 Windows 0.2.11 실사용 2회의 후속이다(TASKS K21·K22, [DECISIONS](DECISIONS.md) "Windows 0.2.11 확인 후속(K21)", "사용자 Windows 0.2.11 실사용 후속(K22)"). DB 형식은 바뀌지 않았다.

- **program `1eefe3f`:** 명령 팔레트 "Vibe Helper: Restore Kiro Layout", 패널이 Core 재연결 뒤 flow 포트를 다시 만든다.
- **Project 터미널의 npm:** user·global npm 설정이 같은 빈 파일이어서 npm 11이 시작하지 않던 것을 고쳤다. global은 새 빈 파일 `empty-global.npmrc`를 쓴다.
- **미리 승인:**
  - 인자 없는 `Out-String`과, 따옴표로 시작하는 이 컴퓨터 주소의 `Invoke-WebRequest`·`Invoke-RestMethod`(`-Uri` 없이)를 더했다.
  - 괄호·`try`·변수 대입 형태와 다른 호스트는 계속 묻는다.
  - 0.2.11 규칙을 가진 폴더는 0.2.12 Core가 시작할 때 새 규칙으로 바뀐다.
- **개념 이름:** `check_progress`가 확정 Spec의 개념 이름(`conceptNames`)을 돌려준다. `finish_task`는 그 이름의 개념만 기록한다(다른 이름은 `ignoredConcepts`, 거절은 하지 않음).
- **Steering 0.9.3·0.9.4:**
  - 첫 환경 확인은 버전 확인만 하고 운영체제 명령을 넣지 않는다.
  - `finish_task`의 개념은 `conceptNames` 그대로 쓴다.
  - Windows 서버 확인은 `Invoke-WebRequest http://localhost:<port> -UseBasicParsing | Select-Object -ExpandProperty StatusCode` 한 줄로 쓴다.
  - 종료 코드가 0이 아니면 실패로 말한다.
- **Discovery:** 1.4.0 그대로다. 예상 Decision을 늘리는 1.5.0 후보는 시험 뒤 채택하지 않았다([시험 기록](../tests/eval/results/discovery-spec-decisions-1.5.0-candidate.md)).

## 0.2.11에서 바뀐 점

frontend Windows 0.2.10 확인(2026-10-15)의 후속이다(TASKS K20, [DECISIONS](DECISIONS.md) "Windows 0.2.10 확인 후속(K20)"). frontend 코드와 DB 형식은 바뀌지 않았다.

- **Kiro 채팅 도구 입력:** Core의 MCP 입력 단계가 엄격한 schema 앞에서 한 번 다듬는다.
  - 비 ASCII 글자가 모두 `\uXXXX`로 적힌 문자열은 풀어서 저장한다. 원래 한글이 든 문자열은 그대로 둔다.
  - JSON 문자열로 온 배열·객체는 풀어서 받는다.
  - 다른 인자까지 한 문자열에 들어가면 다시 보내는 방법을 담은 오류로 거절한다(`… holds other arguments …`).
  - 도구 schema는 그대로다. Kiro가 `tool_call`의 `arguments` 자체를 문자열로 받아 거절하는 경우는 Core에 닿지 않는다(Builder가 다시 보냄).
- **미리 승인:**
  - 이 컴퓨터 주소(localhost·127.0.0.1)를 따옴표로 감싼 `open`·`Start-Process`·`start`·`curl`·`curl.exe`와, `Invoke-WebRequest`·`Invoke-RestMethod`의 `-Uri` 형태를 더했다.
  - 다른 호스트와 이어 붙인 명령은 그대로 묻는다.
  - 0.2.9~0.2.10 규칙을 가진 폴더는 0.2.11 Core가 시작할 때 새 규칙으로 바뀌고, 수동 승인으로 바꾸면 그 항목도 지워진다.
- **Steering 0.9.2:**
  - 도구 입력은 JSON 객체 하나로, 한글은 그대로 쓴다.
  - 시작 요청("계획대로 만들어 줘")은 어떤 선택도 정하지 않는다. 학습 목표 영역의 코드를 쓰기 전마다 실제 선택이 있는지 보고 있으면 그때 묻는다. 임시 구현을 먼저 쓰지 않는다.
  - 학습자를 3인칭으로 부르거나 규칙 용어를 쓰지 않는다. 직접 정한 것은 무엇으로 정했는지만 말한다. Spec 영역 머리글도 그렇게 바꿨다.
  - 서버 확인과 브라우저 열기는 한 줄 명령으로 쓴다(괄호로 감싼 `(Invoke-WebRequest …).StatusCode` 금지). Kiro가 포트 든 `open`·`Start-Process`를 거절하면 주소만 큰따옴표로 감싸 다시 실행한다.
- **완료 뒤 바꾼 선택:** 의도한 동작이다. 적용된 Decision은 그대로 두고, 바꾸는 요청은 후속 Task가 된다. Decision 기록에 변경이 남지 않는 것은 알려진 제한이다(아래 [알려진 제한](#알려진-제한)).

## 0.2.10에서 바뀐 점

frontend Windows 0.2.9 확인(2026-10-14)의 후속이다(TASKS K18, [DECISIONS](DECISIONS.md) "Windows 0.2.9 확인 후속(K18)"). frontend 코드와 DB 형식은 바뀌지 않았다.

- **Core 실행 파일 이름:**
  - Core와 Core가 쓰는 Kiro MCP bridge·hook 명령이 `vibe-helper-core`(Windows `vibe-helper-core.exe`)로 돈다. 관리 Node를 해시를 검증해 복사한 사본이다.
  - Builder가 `Get-Process -Name node | Stop-Process`, `taskkill /IM node.exe`, `killall node`, `pkill node`로 서버를 꺼도 Core와 bridge는 살아남는다.
  - Kiro-native host는 PATH의 Node를 Core 런타임으로 쓰지 않는다. 생성 프로젝트 터미널의 `node`는 그대로다.
- **Core 다시 띄우기:**
  - host는 Core 시작이 실패해도(`FAILED`) 5초에서 60초까지 간격을 늘려 다시 시도한다.
  - 신뢰한 Project 폴더 창에서는 패널 없이도 Core를 띄우고, 실패하면 "다시 연결" 알림을 한 번 보인다.
  - Core는 절전·멈춤 뒤 바로 닫지 않고 host에 갱신 유예를 다시 준다. 살아 있는 host는 갱신 없이 2분까지 기다린다. 마지막 host가 떠난 뒤 30초 종료는 그대로다.
- **Steering 0.9.1:**
  - 구현은 채팅에서 직접 하고, Kiro Workflow(`run_workflow`)나 하위 에이전트에 넘기지 않는다.
  - 서버는 자기가 띄운 PID나 그 포트를 쓰는 프로세스로만 끈다.
  - Vibe Helper 도구 자체가 사라지면 창을 다시 로드하라고 안내한다.
- **설치 가이드:** "Vibe Helper Core에 연결하지 못했어요" 알림, 도구가 끊겼을 때 다시 로드, Workflows 끄기를 문제 해결에 더했다.

## 0.2.9에서 바뀐 점

사용자 직접 체험(2026-10-12)의 후속이다(TASKS K17).

- **학습자 선택 위조 방지(Steering 0.9.0):** 체험에서 Builder가 답변 끝에 학습자 차례("user2번으로 가자")를 지어내고 바로 기록했다. Builder는 선택지를 보여 준 응답을 질문으로 끝내고 학습자의 말을 대신 쓰지 않는다. 질문 뒤 곁가지 질문은 답이 아니다. 기록이 거절되면 구현을 멈추고 다시 묻는다.
- **"내가 고른 게 아니야" 되돌리기:** `save_choice`의 `"not_mine"`(응답 `UNDONE`). Core는 진행 중인 Task면 같은 질문을 다시 열고, 그 선택을 출처로 한 이해 Evidence를 빼고 Concept State를 다시 계산한다(남은 근거가 없으면 OBSERVED). DB migration 0009(`decision_disputes`·`evidence_withdrawals`). 다른 막는 선택이 열려 있어도 다시 열 수 있다.
- **중단된 턴:** 학습자가 멈춘 턴은 Kiro가 Stop hook을 부르지 않는다. 다음 발언 때 Core가 Kiro 세션 기록에서 그 턴의 Builder 답을 읽어 새 발언보다 먼저 기록한다(`interrupted`).
- **미리 승인과 Autopilot:** "개발 명령 미리 승인"이 Kiro 설정 `kiroAgent.agentAutonomy`를 `Autopilot`으로 쓴다. 막 연결했거나 막 신뢰한 폴더에서는 host가 한 번 `kiroAgent.newSession`(채팅의 +)을 불러 새 세션을 연다. 신뢰 전에 Kiro가 만든 세션은 Supervised이고 hook이 없어서다. 미리 승인 목록에 브라우저 열기(`open`·`Start-Process`·`start`), `lsof *`, 메서드가 붙은 `curl`(로컬 주소)을 더했고, 0.2.7~0.2.8이 쓴 규칙은 다시 연결할 때 새 목록으로 바뀐다.
- **`/vibe-helper` 하나:** Kiro 채팅 Helper 에이전트 파일을 더 쓰지 않는다. Kiro는 작업 공간 에이전트를 `/` 메뉴에 "하위 작업 맡기기"로 보여 줘 두 항목이 헷갈렸다. 예전에 쓴 파일은 다시 연결할 때 지운다.
- **완료 뒤 서버:** Builder가 웹 앱·API 서버를 켜 둔 채 브라우저로 열고 주소를 알린다.
- **Next Move:** 후보 한 줄이 길이 상한을 조금 넘으면 실패 대신 '…'로 줄인다(실측에서 50자 benefit 하나로 두 번 다 실패).
- **패널(frontend `feat/k17-panel`):** 아래 [패널에서 다듬을 것](#패널에서-다듬을-것)의 0.2.9 항목.
- 근거: [DECISIONS](DECISIONS.md) "학습자 선택 위조 방지와 되돌리기(K17)", "체험 후속 정리(K17)", [SPEC](SPEC.md) `FR-DEC-007`.

## 0.2.8에서 바뀐 점

- **Builder가 묻는 기준(K14):** Builder는 실제 선택을 코드가 그 답을 필요로 할 때 하나씩 묻는다. Spec의 학습 영역이나 학습자 경험이 갈리는 선택은 묻고, 에이전트 담당 영역은 정한 뒤 밝힌다. 후속 Task도 `finish_task`가 성공해야 끝난다. 후속 Task를 시작한 `save_progress`·`ask_choice` 응답에 `followUpTask`(새 수락 기준)가 실린다. Steering 0.7.0.
- **Next Move(K15):** Task가 끝나면(후속 Task 포함) Core가 그 Task의 "다음 한 걸음" 생성 job을 만들고, Analyst와 따로 도는 worker가 바로 실행한다(kiro-cli, Discovery 하위 역할, Haiku 4.5, prompt `discovery.md` 1.4.0의 NEXT MOVE turn). 결과는 이 프로젝트를 키울 방향 3개다(제목·한 줄 설명·좋아지는 점·크기). 실제 Kiro에서 완료부터 후보 저장까지 8~9초가 걸렸다. 자동 재시도는 1회이고, 두 번 실패하면 패널의 "다시 만들기"만 새 시도를 연다.
- **Builder 채팅(Steering 0.8.0):** 완료 메시지 끝에 한 줄로 알리고 기다리지 않는다. 학습자가 물을 때만 `check_progress`의 `nextMove`를 번호와 함께 전한다. 학습자가 번호를 고르면 `save_progress` PLAN에 `nextMove`를 넘기고, Core가 학습자 발언의 번호와 맞는지 확인한 뒤 후속 Task를 만든다(후보 출처 보존). 후보는 Evidence·Concept State를 바꾸지 않는다.
- **패널(frontend `feat/next-move-card`):** 아래 [패널에서 다듬을 것](#패널에서-다듬을-것)의 Next Move 항목.
- **DB migration 0008:** `next_move_jobs`·`next_move_job_revisions` 표를 더한다. 0.2.8을 한 번 실행한 DB는 0.2.7이 열지 못한다.
- 근거: [DECISIONS](DECISIONS.md) "본선: Final Upgrade 대신 Next Move(다음 한 걸음)", [SPEC 5.8.1](SPEC.md#581-next-move다음-한-걸음), 실측 [Next Move 결과](../tests/eval/results/next-move-v1.4.0.md).

## 0.2.7에서 바뀐 점

- **Kiro 채팅 Builder 도구(K10):** Builder MCP 도구가 `check_progress`, `save_progress`, `ask_choice`, `save_choice`, `finish_task` 5개로 바뀌었다(MCP 목록에 `vibe-helper Connected (5 tools)`). 식별자·버전·멱등키는 Core가 채운다. Builder는 학습자가 고른 안(번호·추천·직접 낸 안)만 기록하고, Core가 학습자 발언(질문 전 발언, Helper 탭 발언 포함)을 메시지 ID로 Decision에 연결한다. 선택을 바꾸면 새 Decision으로 남는다. 근거는 [DECISIONS](DECISIONS.md) "Kiro 채팅 Builder 워크플로 재설계(K10)".
- **개발 명령 미리 승인(K11):** 처음 연결할 때 "개발 명령 미리 승인 / 수동으로 승인"을 묻는다. 명령 팔레트 **Vibe Helper: Change Command Approval**로 바꾼다. 결과의 `permissions`가 Kiro 규칙 파일 처리 결과다(이전의 `coreTools` 자리).
- **완료 뒤 이어서 만들기:** Task를 마친 뒤 학습자가 Builder 채팅에서 더 요청하면 같은 폴더에 다음 Task(이전 Task를 이어받음, 학습자 요청 원문이 목표)가 생기고 Kiro 연결이 그 Task로 옮겨 간다. 완료한 Task와 보고서는 그대로 남는다(SPEC FR-BLD-008). 패널은 Project의 현재 Task를 다시 읽으면 새 Task를 본다.
- **늦은 신뢰 다시 로드:** 신뢰하지 않은 상태로 연 창을 나중에 신뢰하고 연결하면 host가 다시 로드를 제안한다. frontend Windows 실측에서 찾은 문제다(Windows 전용 아님).
- **Steering 0.6.2:** 학습자 언어로 답하고, 완료 뒤 요청은 위 경로로 시작한다. Analyst 1.1.0.
- **frontend 수정 반영:** Windows의 사용자 위치 kiro-cli(`%LOCALAPPDATA%\Kiro-Cli`), Project 터미널용 사적 AppData 폴더(PowerShell 캐시가 Project 폴더에 생기던 문제), 패널의 "Kiro 채팅에서 열기"(PR #10).

## 0.2.6에서 바뀐 점 (버전 강제 완화)

- 버전은 의존성이 깨지지 않는 범위만 강제한다. 빌드는 Node 24.x(포장 SQLite 모듈의 ABI)와 pnpm 11.13.1 이상 11.x(lockfile)면 된다. 학습자는 여전히 Node·pnpm을 설치하지 않는다.
- kiro-cli는 최소 2.21.1만 요구하고 상한이 없다. 기본 설치 위치 다음에 PATH에서도 찾는다.
- Kiro IDE는 버전을 고정하지 않고 최신판을 기준으로 맞춘다([DECISIONS](DECISIONS.md) "버전은 의존성이 깨지지 않는 범위만").

## 0.2.5에서 바뀐 점 (Windows x64 지원)

- host가 macOS와 Windows에서 시작한다. Windows는 kiro-cli를 `Program Files\Kiro-Cli`, `%LOCALAPPDATA%\Kiro-Cli`, 그다음 PATH에서 찾는다.
- Kiro-native Core는 Kiro 실행 파일이 아니라 실제 Node(PATH의 24.18·24.19 또는 관리 Node)로 돈다. hook·MCP 명령에 Core의 Node 경로가 쓰이기 때문이다.
- Kiro 작업 폴더 해시, hook 명령 인용(Windows는 cmd.exe), 생성 폴더 터미널 PATH를 Windows에 맞췄다.
- 포장 스크립트를 하나로 합쳤다. Mac은 `pnpm panel:pack:macos <program>`, Windows는 `pnpm panel:pack:kiro-windows <program>`.
- macOS 동작은 바뀌지 않았다. 패널·host API 계약도 그대로다.

## 0.2.4에서 바뀐 점 (연결 유지와 발언 큐)

- **연결 복원:** Core가 시작할 때 이전에 연결한 Project를 다시 연결해 연결 파일과 작업 폴더의 hook·MCP·에이전트 파일을 새로 쓴다. Kiro를 껐다 켜거나 확장을 업데이트해도 **Open Project in Kiro Chat을 다시 할 필요가 없다.** 폴더가 없어졌으면 만들지 않는다. 권한 규칙은 다시 쓰지 않는다.
- **bridge가 새 연결을 따라감:** 같은 폴더·Project·역할이면 Builder·Helper MCP가 바뀐 연결을 따라가서 창을 다시 로드하지 않아도 된다. Core가 없는 동안에는 MCP 서버가 실패하지 않고 도구가 `VIBE_HELPER_NOT_CONNECTED`를 돌려주며, 시작 때 Core가 아직 없으면 최대 45초 기다린다.
- **발언 큐:** hook이 Core에 닿지 못한 학습자 발언을 연결 폴더의 사용자 전용 큐에 남기고, Core가 연결 직후와 hook 요청 때 순서대로 한 번씩 기록한다. 늦게 들어온 발언은 Core가 받은 시각으로 남는다. 끊긴 동안의 Helper 질문은 기록하지 않는다.
- **Steering 0.5.2:** 도구가 `VIBE_HELPER_NOT_CONNECTED`를 돌려주면 Builder는 Decision 없는 작업만 계속하고 Core가 받기 전에는 묻거나 적용·완료하지 않는다. Helper는 한 번 다시 시도한다.
- 근거와 보안 판단은 [DECISIONS](DECISIONS.md) "본선: Kiro 연결은 Core가 다시 시작해도 유지하고, 끊긴 동안의 학습자 발언은 큐로 보존". 패널·host 파일은 바뀌지 않았다.

## 0.2.3에서 바뀐 점 (Helper 에이전트 도구와 읽기 전용)

- **고친 문제:** 0.2.1·0.2.2의 `vibe-helper` 에이전트 파일에는 `tools`가 없었다. Kiro 1.2.56은 이때 사용자 에이전트에 도구를 하나도 주지 않아(Kiro 기본 `disclose_context`만 남음), Helper 탭이 `get_helper_context`를 부르지 못하고 승인 창 뒤 일반 설명으로 답했다. 0.2.1 재실측의 Helper 확인은 `/vibe-helper` 슬래시 명령이었고 에이전트 탭은 실제로 확인하지 않았다. 아래 0.2.1 항목의 "Helper 탭" 설명은 0.2.3부터 맞다.
- **도구:** 에이전트는 `tools: ["read", "@vibe-helper-helper"]`로 Kiro 내장 읽기 도구(파일 읽기, 진단, 검색)와 Helper Core 서버만 받는다. Builder 도구(작업 공간 MCP)는 계속 받지 않는다.
- **Core 연결 값:** Helper Core 서버는 연결된 Project·Task·correlation만 받는다. 에이전트 프롬프트에 그 세 값이 없어서, 도구가 열린 뒤에도 Helper가 Builder Steering에서 projectId·correlationId만 옮겨 적고 taskId를 빼 Core가 `AGENT_RUN_SCOPE_MISMATCH`로 거절했다. 이제 에이전트 프롬프트에 세 값을 그대로 넣는다(Builder Steering과 같은 방식).
- **Helper는 읽기 전용(사용자 결정):** Steering 0.5.1에서 "부탁하면 수정 가능" 규칙을 뺐다. 학습자가 고쳐 달라고 하면 Builder 탭에 부탁하라고 안내한다. `/vibe-helper` 슬래시 턴은 Builder 세션 안이라 같은 규칙을 프롬프트로만 지킨다. [DECISIONS](DECISIONS.md) "본선: Helper는 읽기 권한만".
- **바뀐 항목:** 0.2.2와 비교해 Core 묶음, Steering 원문(`portable/agent-prompts/kiro-steering.md`), manifest, 버전 표기 2곳. 이미 연결한 Project는 업데이트 뒤 **Open Project in Kiro Chat**을 다시 실행해야 새 에이전트 파일이 써진다.

## 0.2.2에서 바뀐 점 (Analyst·Evidence 정책)

패널·host·hook·Steering 파일은 0.2.1과 같다. 74개 항목 중 Core 묶음(`portable/bin/core.mjs`), 그 hash를 담은 `portable/manifest.json`, 버전 표기 2곳만 다르다. 근거와 위험은 [DECISIONS](DECISIONS.md)의 "본선: Analyst 기본 모델 Sonnet 5.5(대안 Auto)와 과대 제안의 최대치 저장"에 있다.

- **Analyst 모델:** kiro-cli Analyst가 `claude-sonnet-5.5`를 먼저 쓰고, kiro-cli가 "모델을 쓸 수 없음"으로 거절할 때만 `auto`로 넘어간다. 거절된 모델은 그 Core 프로세스 동안 다시 시도하지 않는다. Discovery·Helper 모델은 바뀌지 않았다.
- **과대 제안:** Analyst가 정책상 최대보다 높은 Concept State를 제안하면 거절하지 않고 정책 최대치로 받는다. Core는 상태를 올리지 않는다. 결정 설명(`explanation`)이 "…supporting `<받은 상태>`, the policy maximum; the Analyst proposed `<제안 상태>`." 형식이 되고, 원래 제안(`maximumSupportedState`)은 그대로 남는다.
- **패널 영향:** `OVERSTATED_MAXIMUM_STATE` 거절은 이제 상태를 붙인 모순(CONTRADICTION) 제안에서만 나온다. Evidence 화면이 이 사유 코드를 "과대 판정으로 버림"으로 보여 주고 있다면, 같은 사례가 이제 `ACCEPTED`(`VALID_USER_EVIDENCE`)로 오므로 받은 상태와 제안 상태가 다를 때 낮춰 받았다는 표시를 검토한다.

## 0.2.1에서 바뀐 점 (체험 피드백 K09)

- **Project 폴더:** 지금 연 폴더가 비어 있으면 **Open Project in Kiro Chat**이 그 폴더를 Project 폴더로 쓰고 같은 창에서 이어 간다. 파일이 있으면 새 폴더를 새 창으로 열지 묻는다. 이미 다른 폴더에서 만들고 있는 Project는 그 폴더를 연다.
- **도구 허용:** 처음 한 번 "Vibe Helper 도구를 묻지 않고 허용할까요?"를 묻고, 허용하면 Project 폴더마다 Kiro 권한 규칙 한 줄을 더한다. 파일 수정·명령 실행 확인은 그대로다.
- **Helper 탭:** Project 폴더에 `vibe-helper` 에이전트가 생긴다. Kiro 채팅에서 새 탭을 열고 에이전트 목록에서 `vibe-helper`를 고르면 Helper로 쓴다. 다른 탭 Builder의 진행 중 활동을 기록으로 참고한다. `/vibe-helper 질문`도 그대로 된다.
- **Steering 0.5.0:** 예상 Decision을 한꺼번에 묻지 않고 구현이 그 지점에 닿을 때 하나씩 묻는다. 묻기 전에 기록한다. 첫 빌드 전에 설치된 도구를 확인한다.
- **신뢰 안내:** 연결된 폴더가 신뢰되지 않았으면 신뢰를 안내하고, 신뢰한 뒤 창 다시 로드를 제안한다.
- **패널(프론트 `finals/trial-feedback`):** 후보를 찾는 동안 입력 폼 대신 로딩 카드, 후보 다듬기 버튼 4개 대신 **보완하기** 하나, 최신 라운드만 보이고 이전 후보는 접힘, "스펙" 대신 "계획", **이걸로 시작**을 계획 맨 위와 고치기 입력 위에 둠, 예상 Decision을 "만들면서 정하게 될 것들"로 표시.

## 예선 0.1.4와 달라진 점

| 항목 | 예선 0.1.4 | 본선 0.2.x |
| --- | --- | --- |
| 지원 Kiro | 1.1.70 고정(설치본 hash 확인) | 버전 고정 없음. 1.2.37·1.2.56에서 확인 |
| Discovery·패널 Helper·Analyst | Kiro IDE 내부 비공개 Agent 연결 | Core가 kiro-cli로 실행 |
| Builder | 패널이 시작하는 IDE 내부 실행 | 학습자의 Kiro 채팅(빈 현재 폴더 또는 생성 폴더) |
| Decision | 패널 카드 | Kiro 채팅에서 번호 선택지로 묻고 자연어 답을 기록. 패널 카드 경로도 남아 있음 |
| 준비 상태 | 1.1.70 확인 + worker 준비 | kiro-cli 설치 + `kiro-cli whoami` 성공 |

## 설치 전 준비

1. Apple Silicon Mac에 Kiro IDE 최신판을 설치하고 로그인한다(Kiro 버전은 고정하지 않는다).
2. Kiro CLI를 설치한다(kiro.dev의 Kiro CLI 설치 안내). host는 `~/.local/bin/kiro-cli`, `/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli`, 그다음 PATH 순서로 찾는다. 버전은 최소 2.21.1이고 상한은 없다(확인: 2.28.0).
3. 터미널에서 `kiro-cli login`. Builder ID 무료 계정과 본선 팀 계정(IAM Identity Center)에서 동작을 확인했다. IDE 로그인과 CLI 로그인은 따로다. 조직 계정은 IDE에서도 로그인해야 MCP가 열린다(로그인 전에는 `mcpEnabled: false`).
4. 예선 0.1.x를 쓰던 Kiro라면 모든 Kiro 창을 닫았다가 연다. 이전 Core가 끝나기 전에는 `CORE_UPDATE_WAITING_FOR_OWNER_EXIT`로 기다린다. 기존 History(`core-data`)는 그대로 읽힌다.

## 설치와 사용 흐름

1. Kiro Extensions(`Cmd+Shift+X`) → `…` → **Install from VSIX…**에서 위 파일을 고르고 다시 로드한다.
2. **Agent Panel**에서 학습 목표를 넣고 Discovery → 후보 선택 → Learning Spec 확정까지 기존 화면대로 진행한다.
3. 명령 팔레트 **Vibe Helper: Open Project in Kiro Chat** → Project를 고르면 Core가 Project 폴더(빈 현재 폴더 또는 생성 폴더)에 Steering·hook·MCP 설정·Kiro Spec을 쓴다(0.2.9부터 Helper 에이전트는 쓰지 않는다). 현재 폴더면 그대로, 생성 폴더면 새 Kiro 창으로 연다.
4. Kiro 채팅에서 **새 세션(+)**을 열고 만들기 시작한다(hook은 세션 시작 때 적용된다). Agent는 Core MCP 도구로 Task 상태를 읽고, 학습자가 정해야 할 것은 번호 선택지로 묻는다. 학습자가 채팅으로 답하면 Agent는 고른 안만 기록하고, Core가 학습자 발언을 그 Decision에 연결한다. Task를 마친 뒤 더 부탁하면 다음 Task로 이어 간다.
5. 학습자 발언은 hook으로 Core에 Evidence 원천(USER)으로 쌓인다. Decision이 끝나면 Analyst(kiro-cli, Sonnet 5.5, 쓸 수 없으면 Auto)가 분석하고, Core가 Concept State를 갱신해 `.vibe-helper/learner-profile.md`에 쓴다. 이 요약은 **새 채팅 세션부터** Agent에 반영된다(Steering은 세션 시작 때 고정).
6. Helper는 채팅에서 `/vibe-helper 질문`으로 부른다. 답은 Helper Episode로 기록된다(0.2.9부터 별도 Helper 에이전트 탭은 없다).
7. Task를 마치면 Agent Panel 빌더 탭의 "다음 한 걸음" 카드에 이 프로젝트를 키울 방향 3개가 10초 안팎에 뜬다(0.2.8). 마음에 드는 게 있으면 Kiro 채팅에 번호나 원하는 방향을 말하면 후속 Task로 이어지고, 아무것도 하지 않아도 된다.

Kiro를 껐다 켜거나 확장을 업데이트해도 0.2.4부터는 3번을 다시 하지 않는다. Core가 시작하면서 연결을 복원한다.

## Windows에서

**분담:** Mac 설치물은 backend가, Windows 설치물은 frontend가 빌드·확인·업로드한다([DECISIONS](DECISIONS.md) "본선: 플랫폼 분담"). 0.2.5부터 Kiro-native host·Core·hook·MCP bridge가 Windows x64를 지원한다. 본선 경로는 Kiro 내부 비공개 API 대신 공식 기능(Steering·hook·MCP·사용자 에이전트)과 kiro-cli를 쓰므로 frontend 코드는 그대로 빌드한다. 예선 Windows 설치물 0.0.18([WINDOWS_VSIX](WINDOWS_VSIX.md))은 Kiro 1.1.70 전용이라 본선 확인에 쓰지 않는다.

**Windows에서 확인된 범위:** Windows 분기(kiro-cli 위치, Kiro 작업 폴더 해시의 소문자·슬래시 정규화, cmd.exe용 hook 명령 인용, 생성 폴더 터미널 PATH, 실제 Node로 Core 실행)는 Windows를 흉내 낸 테스트와 Kiro 1.2.56 코드로 확인했다. 2026-10-10 Windows 11 x64 실기기(Kiro 1.2.56)에서 아래 1~7을 모두 통과했다([0.2.6 Windows 확인](#026-windows-확인-2026-10-10)). 2차 실측에서 생성 폴더(새 창) 경로와 Builder 완료까지 확인했다. 0.2.7에서 늦은 신뢰 다시 로드, 채팅 Decision 기록, 완료 뒤 이어서 만들기까지 확인했다([0.2.7 Windows 확인](#027-windows-확인-2026-10-11)).

### 1. 준비 (Windows 11 x64)

- Git, Node.js **24.x**(`node -v`, 권장 24.19.0), pnpm **11.13.1 이상 11.x**(`npm install -g pnpm`; pnpm 10 이상이면 저장소의 권장 pnpm으로 스스로 바꿔 실행), 기본 PowerShell. Node 메이저는 포장 SQLite 모듈이 Core의 Node 24와 맞아야 해서 24여야 한다. 이 도구들은 빌드하는 사람만 필요하고, 설치물을 쓰는 학습자는 Node·pnpm을 설치하지 않는다.
- Kiro IDE 최신판에 로그인. Kiro CLI를 Kiro 공식 안내대로 설치한다(최소 2.21.1, 상한 없음). 공식 설치 스크립트(`irm https://cli.kiro.dev/install.ps1 | iex`, 2.29.0)는 관리자 권한 없이 `%LOCALAPPDATA%\Kiro-Cli\`에 설치한다. host는 `C:\Program Files\Kiro-Cli\`, `%LOCALAPPDATA%\Kiro-Cli\`, 그다음 PATH에서 `kiro-cli.exe`를 찾으므로 다른 위치에 설치해도 된다. 설치 전에 열어 둔 Kiro 창은 새 PATH를 모르므로, 다른 위치에 설치했다면 Kiro를 완전히 종료했다가 연다. 새 터미널에서 `kiro-cli login` 후 `kiro-cli whoami`가 성공해야 한다. IDE와 CLI 로그인은 따로다.

### 2. 빌드

폴더 위치는 자유다. 아래 `C:\dev\...`는 예시이며 실제 위치로 바꾼다.

```powershell
git clone https://github.com/Hello-KU-tty/program C:\dev\program
Set-Location C:\dev\program
git checkout main
npm ci --ignore-scripts
npm run typecheck
npm test

git clone https://github.com/Hello-KU-tty/core C:\dev\core
Set-Location C:\dev\core
git checkout main
pnpm install --frozen-lockfile
pnpm panel:pack:kiro-windows C:\dev\program
```

결과는 `<core 폴더>\dist\windows-vsix-*\`의 `builder-helper-agent-panel-<버전>-win32-x64.vsix`, `receipt.json`, `files.json`이다. 버전은 Mac 설치물과 같은 번호다. 포장 Core만 따로 보려면 `node scripts\test-portable-core.mjs`(예선 Windows 검사)를 돌린다.

### 3. 설치한 Kiro에서 확인

1. Extensions(`Ctrl+Shift+X`) → `…` → **Install from VSIX…** → 다시 로드. Agent Panel이 Core에 연결된다. kiro-cli를 못 찾으면 `KIRO_CLI_NOT_INSTALLED`(이때 `where.exe kiro-cli` 결과를 남긴다), 로그인이 없으면 `KIRO_CLI_LOGIN_REQUIRED`.
2. 빈 폴더를 열고 신뢰한다. Agent Panel에서 학습 목표 → 후보 선택 → 계획 확정.
3. `Ctrl+Shift+P` → **Vibe Helper: Open Project in Kiro Chat** → Project 선택. 같은 창에 연결되고 `.kiro\hooks\vibe-helper.json`, `.kiro\settings\mcp.json`, `.kiro\steering\vibe-helper.md`가 생긴다(0.2.8까지는 `.kiro\agents\vibe-helper.json`도 생겼다). Kiro의 MCP 서버 목록에 `vibe-helper Connected (5 tools)`가 보여야 한다(0.2.6까지는 9 tools).
4. Kiro 채팅 새 세션에서 "Vibe Helper 도구로 작업 상태만 확인해서 한 줄로 알려줘. 코드는 만들지 마." → 답에 Task 상태(PENDING 등)가 나온다.
5. 같은 채팅에 `/vibe-helper 이 프로젝트에서 뭘 배우게 돼?`처럼 묻는다 → 확정 계획을 바탕으로 답하고, 파일을 고치지 않으며, 승인 창이 뜨지 않는다(0.2.8까지는 새 채팅 탭에서 에이전트 목록의 `vibe-helper`를 골랐다).
6. Kiro를 완전히 종료했다가 같은 폴더를 다시 열고 4를 반복한다. Open Project를 다시 하지 않아도 동작해야 한다.
7. Agent Panel의 History에서 4·5의 학습자 발언이 기록됐는지 본다.

### 4. 올리기와 문제 보고

- 확인한 VSIX와 `receipt.json`, `files.json`을 backend 저장소의 `releases/windows/kiro-native/`에 넣어 `main`에 커밋·푸시한다(또는 `main`으로 PR). 커밋 메시지에 위 확인 결과(0.2.7은 1~10)를 적는다.
- Windows 문제는 직접 고쳐도 된다. `main`에서 브랜치를 따서 `main`으로 PR을 올리고, `pnpm test:unit`, `pnpm test:integration`, `node --test examples/kiro-panel/test/*.test.cjs`를 돌린다. macOS 동작이 바뀌는 변경이면 PR에 적는다. backend가 검토해 Mac 설치물에도 넣는다.
- 직접 고치기 어려우면 단계 번호, 화면의 오류 코드, Kiro 버전(Help → About), `kiro-cli --version`, Kiro Output 패널의 `Kiro Logs`·`Kiro - MCP Logs`에서 `vibe-helper`가 들어간 줄을 남긴다. 토큰·계정 정보는 붙이지 않는다.

## 패널에서 다듬을 것

host API 형식은 [`examples/kiro-panel/src/frontend-host.d.cts`](../examples/kiro-panel/src/frontend-host.d.cts)가 기준이다. 프론트의 `vendor/frontend-host` 타입을 이 파일로 갱신한다.

- **준비 상태 표시:** `status.helperMode === 'KIRO_CLI'`. 실패 코드는 다음 두 가지다.
  - `status.errorCode === 'KIRO_CLI_NOT_INSTALLED'`: Core가 시작하지 않으므로 History도 열리지 않는다. 설치를 안내한다.
  - `status.nativeErrorCode === 'KIRO_CLI_LOGIN_REQUIRED'`: History는 읽히고 Agent 실행은 막힌다. `kiro-cli login`을 안내하고, 로그인 뒤 **Retry Core Connection**을 실행하게 한다.
- **Builder 탭:** 패널에서 Builder run을 시작하면 Core가 `BUILDER_RUNS_IN_HOST_CHAT`로 거절한다. 시작 버튼 자리에 "Kiro 채팅에서 열기"를 두고 `host.openProjectInKiro(projectId)`를 부른다(PR #10에서 반영). 결과의 `folder`는 `REGISTERED`(현재 폴더), `GENERATED`(생성 폴더), `CANCELLED`(학습자가 새 창을 거절)다. Spec 확정 전이거나 Task가 없으면 `KIRO_BIND_TASK_NOT_READY`다. 확인 창(명령 승인 방식, 새 창 열기, 신뢰, 다시 로드)은 host가 띄운다.
- **`reloadRequired`(0.2.7, 선택):** `true`면 이 창은 신뢰하기 전에 열렸거나 아직 신뢰되지 않아 Kiro가 hook·MCP를 읽지 않은 상태다. host가 신뢰·다시 로드 알림을 이미 띄우므로, `REGISTERED` 안내 문구를 "창을 다시 로드한 뒤 새 세션(+)에서 시작하세요"로 바꾸는 것을 권장한다.
- **Decision 카드:** 기본 경로는 채팅이다. 패널 카드로 확정해도 Core는 받지만 채팅 Agent는 다음 턴에 상태를 다시 읽어야 안다. 카드는 열린 Decision과 확정 결과를 보여 주는 쪽을 권장한다.
- **native worker 의존 제거:** `host.worker`는 남아 있지만 상태와 질문이 없다(`getStatus()`는 `undefined`, `listUserInputs()`는 빈 배열). native 질문 UI가 이것을 기다리지 않게 한다.
- **Evidence·Concept State 표시:** 기존 History/Evidence 조회 그대로다. 채팅 발언은 `USER_MESSAGE`, 채팅 확정 Decision은 `DecisionResolution.chatSource`(`mappedBy: 'BUILDER'`)로 구분된다.
- **Kiro-native 빌더 탭(0.2.9, `feat/k17-panel`):** 채팅에 없는 것만 보인다.
  - 순서: 상태 줄(Kiro 채팅이 기다리는 질문 강조) → 이번 작업의 학습 기록(`UI_READ_EVIDENCE_TRACE`에서 현재 Task의 `USER_UNDERSTANDING`만, 학습자 원문 인용) → 다음 한 걸음 → 이번 작업의 결정(한 줄씩 접기, 고른 안·반영 여부, 선택 버튼 없음). 대체된 결정(`replacesDecisionId`로 이어진 이전 것)은 숨기고 완료 판정에서도 뺀다.
  - Kiro 채팅에서 일어난 선택은 패널로 알려 주는 경로가 없어서, Next Move를 다시 읽을 때마다 스냅샷도 조용히 다시 읽는다(학습 기록은 15초마다). 실패하면 알림 없이 이전 화면을 둔다.
  - Discovery·Spec 단계는 예상 시간에서 1초씩 줄어드는 남은 시간을 보이고, 넘기면 "예상보다 조금 더 걸리고 있어요"로 바꾼다(첫 후보 30초, 첫 화면 보완하기 2분, 새 후보 45초, Spec 45초; `src/core/flow/flow-progress.ts`).
  - Spec의 "이걸로 시작"은 하단 고정 입력란 위에 하나만 둔다.
  - 패널을 오른쪽으로 옮기던 `revealAgentPanelOnRight`를 없앴다. Kiro에는 하단 패널 전체(터미널·출력)를 옮기는 명령만 있어 긴 명령 때 Kiro 채팅이 가려졌다. 이전 버전에서 올린 설치에는 한 번 "원래 배치로 되돌리기"(`workbench.action.resetViewLocations`)를 묻는다.
- **Next Move 카드(0.2.8, `feat/next-move-card`에 구현):** backend가 frontend 저장소에 직접 만들었다. 다듬을 때 아래 계약을 지킨다.
  - 조회: `client.execute({ kind: 'UI_READ_NEXT_MOVE', projectId, ...uiMetadata() })` → `NextMoveView` `{ status: 'NONE' | 'GENERATING' | 'READY' | 'FAILED', nextMoveJobId?, jobRevision?, sourceTaskId?, moves: [{ number, title, summary, benefit, size: 'SMALL' | 'MEDIUM' }], failureCode?, updatedAt? }`. 가장 최근 Task가 끝났고 그 Task의 job이 있을 때만 `NONE`이 아니다. 후속 Task가 시작되면 다시 `NONE`이다. 관련 개념은 Core 안에만 있고 응답에 없다.
  - 다시 만들기: `UI_RETRY_NEXT_MOVE { idempotencyKey, projectId, nextMoveJobId, expectedJobRevision }`는 `FAILED`이고 최신 완료 Task의 job일 때만 받는다. 아니면 `NEXT_MOVE_RETRY_NOT_ALLOWED`. 응답은 새 `NextMoveView`(`GENERATING`)다.
  - 패널 동작: Core가 패널로 알려 주는 경로가 없어서 controller가 바인딩된 Project에 대해 생성 중에는 1.5초, 그 밖에는 4초마다 다시 읽는다. job의 Task가 바뀌면(채팅에서 Task를 마쳤거나 후속 Task를 시작함) snapshot도 다시 읽어 빌더 머리글을 맞춘다. 읽기에 실패하면 마지막 카드를 그대로 둔다. 카드는 빌더 탭에만 있고, 생성 중 한 줄, 후보 3개와 "마음에 드는 게 있으면 Kiro 채팅에 번호나 원하는 방향을 말해 주세요. 지금 안 해도 돼요" 안내, 실패와 "다시 만들기" 버튼 하나다. 시작·선택 버튼과 알림은 두지 않는다(SPEC FR-NXT-007). Kiro-native에서는 예선의 Final Upgrade 영역을 숨긴다.
  - `vendor/frontend-client`는 backend `main` `f83560a`의 `pnpm client:build` 결과로 통째로 바꿨다(K10~K15 계약). `vendor/frontend-host`는 건드리지 않았다.
  - 다듬을 거리: 카드 항목 테두리가 Kiro 어두운 테마에서 거의 안 보인다(다른 카드와 같은 `--vscode-panel-border`). 300px 패널에서는 이미 반영된 Decision 카드가 위에 남아 있어 스크롤해야 카드가 보인다.

## 알려진 제한

- 확장 업데이트 뒤 기존 프로젝트의 hook·MCP 경로는 새 Core가 시작하면서 고친다(0.2.4). 그 전까지 몇 초 동안 Kiro가 옛 경로의 MCP 시작 실패를 표시할 수 있다.
- 연결은 Project당 하나다. 다시 연결하면 이전 연결 토큰은 폐기된다.
- Builder 채팅 단계(같은 창 연결 뒤 hook 기록, Steering 0.5.0의 Decision 시점, `/vibe-helper`의 Builder 활동 사용, 허용 규칙으로 Vibe Helper 도구 승인 창 0회)는 0.2.1·Kiro 1.2.37로 본선 계정에서 확인했다([K09 재실측](spikes/KIRO_NATIVE_K09_REMEASURE_20261009.md)). 0.2.3의 Builder Steering 내용은 같고 버전 표기만 0.5.1이다. Kiro 1.2.56에서 Builder 턴은 다시 확인하지 않았다.
- Core가 45초 넘게 뜨지 않으면 Builder·Helper MCP 시작이 실패하고 Kiro의 MCP 재연결이 필요하다. 끊긴 동안 친 학습자 발언은 큐로 보존되지만 Core가 받은 시각으로 기록되고, 끊긴 동안의 Helper 질문은 기록되지 않는다. 큐에는 redaction 전 원문이 Core가 읽을 때까지 사용자 전용 파일로 남는다(최대 1MB·200개).
- 신뢰 안내·다시 로드 알림(늦은 신뢰 포함)은 Windows 0.2.7 확인 8에서 실제 화면으로 확인했다. Windows에서는 새 폴더를 열면 신뢰 창이 Kiro 에이전트 초기화 뒤에 떠서, 열자마자 신뢰해도 Kiro는 신뢰 전 상태로 시작한다. 그래서 늦은 신뢰가 새 폴더의 기본 경로다. 도구 허용 동의와 새 창 확인(생성 폴더가 새 창으로 열림)은 기록으로 확인했다.
- 셸 명령은 "개발 명령 미리 승인"을 고르면 자주 쓰는 개발 명령은 묻지 않고, 삭제·종료·배포·push 같은 명령은 계속 묻는다(K11).
- Autopilot 설정(0.2.9)은 승인 방식을 고르는 순간에만 쓴다. 0.2.7~0.2.8에서 미리 승인을 고른 뒤 올린 설치는 규칙만 새 목록으로 바뀌고 Autopilot은 켜지지 않는다. "Vibe Helper: Change Command Approval"에서 다시 고르면 켜진다. Windows 포트 확인 명령(`netstat` 등)은 미리 승인 목록에 없다.
- Kiro 도구 호출 단계가 긴 한국어 입력을 문자열로 보낸 첫 호출을 거절할 때가 있다(`expected object, received string`). Builder가 바로 다시 보내 성공했다. Core에 닿기 전이라 0.2.11에서도 그대로다. Core에 닿는 이스케이프된 글과 문자열로 온 배열은 0.2.11부터 Core가 풀어서 받는다(K20). 완료 뒤 이어서 만든 첫 Task에서는 Builder가 이전 Task의 기준 키로 `finish_task`를 한 번 보냈다가 거절되고, `check_progress` 뒤 다시 보내 완료했다.
- Helper 답 수집은 Kiro 세션 기록 파일(비공개 형식)에 기대며, 못 읽으면 안내 문구로 기록한다.
- 완료된 Task의 선택을 학습자가 이유와 함께 바꾸면 후속 Task가 된다. 원래 Decision은 `APPLIED`로 남고, Decision 기록에는 변경이 남지 않는다. 학습자 말은 발언 기록으로 남는다(K20, 후속 Task의 Decision으로 남기는 방안은 본선 뒤 판단).
- 미리 승인 목록 밖의 형태는 승인 창이 뜬다. 괄호로 감싼 `(Invoke-WebRequest …).StatusCode`, 절대 경로 `/usr/bin/open`, `|| true`를 붙인 명령 등이다. Steering 0.9.2가 한 줄 명령과 따옴표 형태를 쓰게 한다.
- 지원 플랫폼은 Apple Silicon Mac과 Windows x64다. 그 밖의 플랫폼에서는 host가 `KIRO_NATIVE_HOST_PLATFORM_UNSUPPORTED`로 시작하지 않는다. Windows는 0.2.7에서 실기기 확인 1~10을 했다.
- Kiro는 최소 버전(VS Code 엔진 `^1.131.0`, 확인한 가장 오래된 Kiro 1.2.37)만 두고 최신판을 따라간다. 자동 업데이트되면 확인 루틴을 다시 돌린다. 데모 기기는 확인한 버전에서 자동 업데이트를 끈다. 1.2.4 → 1.2.37 → 1.2.56(2026-10-09)으로 바뀌었다. Builder 채팅 단계는 1.2.37에서, Helper 탭·hook 기록·도구 허용은 1.2.56에서 확인했다.

## 0.2.11 확인 (2026-10-16, Mac)

- **자동 검사(Node 24.19.0, backend `f5b5182` 기준, 이후 `af6942f`에서 adapter·연결 테스트 다시 실행):**
  - `pnpm typecheck` 통과.
  - unit 177 통과·3 skip, integration 561 통과·9 skip(새 3개), eval 47 통과·1 skip, 패널 CJS 192 통과·2 skip.
  - 0.2.11 포장에 `scripts/test-macos-package.mjs` 9개 PASS.
  - 바꾼 파일 Biome 오류 없음(원래 있던 경고 제외).
  - 새 연결 테스트는 풀기를 끈 빌드에서 Windows와 같은 증상(`\uc815\ub82c…` 저장)으로 실패하는 것을 확인했다.
- **모델 호출 없는 판정(kiro-cli):**
  - 따옴표 형태와 `-Uri` 형태는 허용된다.
  - 다른 호스트, 이어 붙인 위험 명령, 명령 치환, 괄호로 감싼 `.StatusCode`는 계속 묻는다.
  - 예전 명령 목록 3개는 판정이 그대로다.
- **실제 Kiro(격리 프로필, Kiro 1.2.56, 본선 계정, Workflow 켬, 모델 Auto):** 처음 보는 목표 네 개로 "계획대로 만들기 시작해 줘"를 보냈다. 기록은 [K20 실제 Kiro 확인](../tests/eval/results/kiro-steering-0.9.2-k20.md).
  - 0.2.10(Steering 0.9.1)은 선택 하나를 물어 Windows 증상이 재현되지 않았다. 하지만 데이터 구조를 스스로 정했고, 정렬을 임시로 먼저 짰고, "학습자"라고 말했다.
  - 0.2.11(Steering 0.9.2) 세 번은 모두 첫 Task에서 코드 전에 선택을 하나씩 물었다. 예상 Decision이 있는 Spec과 Personal Need가 있는 목표가 하나씩 들어 있었다. 세 번 모두 답 기록, `finish_task` 성공, 서버 유지와 브라우저 열기까지 갔다.
  - 마지막 빌드는 승인 창 0번이었고, `open "http://localhost:5174"`로 열었다.
  - Kiro가 `tool_call` 문자열 인자를 세 번 거절했고, Builder가 매번 객체로 다시 보내 성공했다. Core에 이스케이프된 글은 저장되지 않았다.
  - 0.2.10에서 연결한 폴더는 0.2.11 Core 시작 때 새 승인 규칙과 Steering 0.9.2를 받았다.
  - 남은 것: "화면 레이아웃·스타일은 제가 알아서 정할게요"처럼 담당을 말하는 표현이 약하게 남았다. 한 번은 예고한 선택의 코드를 먼저 써 두고 그 안을 추천했다.
  - 채팅 약 25.7크레딧.

## 0.2.12 Windows 확인 (2026-10-17)

frontend가 Windows 11 x64(10.0.26200, Node 24.19.0, pnpm 11.13.1)에서 backend `main` `e020bbc`과 program `main` `1eefe3f`로 빌드했다. 두 checkout 모두 깨끗했다. 결과는 2,608,078 bytes, SHA-256 `bd65be96e6ddb9beb9e92ed32d8faac2a471d5a0c542b1d861beb56aa34b9a4b`, 75 entries다.

**자동 검사(Windows):** program typecheck 통과, `npm test` 843 통과. backend unit 179 통과·1 skip, integration 557 통과·15 skip, 패널 CJS 193 통과·1 skip.

**실제 Kiro 환경:**
- Kiro 1.2.56(이 PC는 `update.mode: none`으로 자동 업데이트를 껐다), kiro-cli 2.29.0, 0.2.11에서 업그레이드
- Workflows 켬, 미리 승인, 모델 Auto
- 빈 창의 패널에서 처음 보는 목표(테슬라 로드스터 시뮬레이터)로 새 Project를 만들고, 생성 폴더를 새 창으로 열었다

| 확인 | 결과 |
| --- | --- |
| 1~8 | 통과 |
| 9 | 통과. 첫 Task에서 `check_progress` → 버전 확인(`node -v; npm -v; …`, 승인 없음) → `save_progress` → `ask_choice`(14:56:36). `run_workflow` 없음 |
| 14 | 통과. 답(14:57:17 확정) → "그건 내가 고른게 아니야"(턴 `interrupted`) → 이의 기록·같은 질문 다시 열림(14:57:30) → 곁가지 질문은 기록 없이 다시 물음 → 답으로 확정(14:58:11), 완료 때 `APPLIED` |
| 16 | 통과. `Invoke-WebRequest http://localhost:5173 -UseBasicParsing \| Select-Object -ExpandProperty StatusCode`와 `Start-Process "http://localhost:5173"`이 승인 없이 실행됐다 |
| 26 | 통과. `npm install`·`npm test`·`npm run build`가 `double-loading config` 없이 돌았다. 우회 명령 없음 |
| 27 | 통과. 명령 승인 창 0개(Kiro `remote/web_search` 도구 승인 1번뿐). `permissions.yaml`에 `Out-String`(134행)과 `Invoke-WebRequest "http://localhost:*`(135행). 0.2.11 폴더에도 생겼다 |
| 28 | 통과. `conceptUsage`에 계획의 두 개념("JSON 데이터 구조", "클라이언트 상태 업데이트 및 재렌더링"), `finish_task` 결과의 `ignoredConcepts`는 `[]`. 패널 학습 기록 탭에 두 개념이 "관찰만 되었어요"로 보인다 |
| 29 | 나오지 않음(종료 코드가 0이 아닌 명령 없음) |
| 30 | 새 창의 확장 호스트 시작(14:52:15.9) → Vibe Helper 활성화(14:52:20.4) 4.5초. 신뢰 창은 뜨지 않았다(사용자: 상위 폴더가 이미 신뢰돼 있었음). 그래서 "상위 폴더도 신뢰" 선택지는 보지 못했다. 이 PC는 부스 PC가 아니다 |

**참고:**
- **이해 근거 0건(의도한 동작):** 이번 Task의 학습자 이해 근거는 0건이다.
  - 첫 답의 근거는 인정됐다가 이의 제기로 철회됐다(`DECISION_NOT_CHOSEN_BY_LEARNER`).
  - 두 번째 답 "1번, … 코드가 단순한 게 좋다"는 곁가지 질문에 Builder가 "1번이 더 간단하다"고 답한 직후라 `DIRECTLY_LED`·`INSUFFICIENT_EVIDENCE`로 거절됐다.
  - 확인 14 절차 때문에 생긴 결과이고, 보수적 Evidence 원칙대로 동작했다.
- **패널 문제(frontend가 고친다):** 학습 기록 탭에 Evidence Analyst의 판정 메모가 그대로 보인다("인정된 근거 없음: Episode에서 … USER_DECISION reference … BUILDER_CHAT_TURN …"). 학습자가 읽을 문장이 아니다.

## 0.2.11 Windows 확인 (2026-10-16)

frontend가 Windows 11 x64(10.0.26200, Node 24.19.0, pnpm 11.13.1)에서 빌드했다.
- 빌드 출처: backend `main` `9314edb`, program `main` `1eefe3f`(program#11 배치 되돌리기 명령, #12 재연결 뒤 flow 포트). 두 checkout 모두 깨끗했다.
- 결과물: 2,606,726 bytes, SHA-256 `f00156f364b99c9bf6df4c406796582da3ef8e204b6bdf6d56361ea961f3fba2`, 75 entries.
- **Mac 0.2.11은 program `324214e`로 빌드됐으니 `1eefe3f`로 다시 빌드해 주세요.**

**자동 검사(Windows):** program typecheck 통과, `npm test` 843 통과. backend unit 179 통과·1 skip, integration 555 통과·15 skip, 패널 CJS 193 통과·1 skip.

**실제 Kiro 환경:**
- Kiro 1.2.56, kiro-cli 2.29.0, 0.2.10에서 업그레이드
- Workflows 켬(세션 `workflowsEnabled: true`), 미리 승인, 모델 Auto
- 새 폴더 `win-0.2.11`, 처음 보는 목표(주식 시뮬레이터)

| 확인 | 결과 |
| --- | --- |
| 1~8, 13 | 통과. 0.2.11 Core·bridge로 연결, 신뢰·다시 로드 뒤 새 세션에서 Vibe Helper 도구 사용 |
| 9 | 통과. **첫 Task에서** 코드 전에 선택을 물었다: `check_progress` → 환경 확인 → `save_progress` → 설정 파일 4개(`package.json`·`tsconfig.json`·`vite.config.ts`·`index.html`) → `ask_choice`(22:51:40, 종목·가격 데이터 구조). `run_workflow` 없음 |
| 14 | 통과. 답(22:53:29 확정) → "그건 내가 고른게 아니야"(22:53:32, 턴 `interrupted`) → 이의 기록·같은 질문 다시 열림(22:53:35) → 곁가지 질문은 기록 없이 다시 물음 → 답으로 확정(22:55:10), Task 완료 때 `APPLIED` |
| 16 | 통과. `Invoke-WebRequest http://localhost:5180 -UseBasicParsing \| Select-Object -ExpandProperty StatusCode`와 `Start-Process "http://localhost:5180"`이 승인 없이 실행됐다. 서버를 켠 채 완료 |
| 22 | 통과. 이 Project의 `decision_requests` 2건, `live_context_versions` 6건에 이스케이프 0건(이전 0.2.10 기록 3·7건만 남음). Kiro가 `ask_choice` 한 번을 `expected object, received string`으로 거절했고 Builder가 11초 뒤 다시 보내 성공 |
| 23 | 통과. 새 폴더와 `win-0.2.10` 폴더의 `permissions.yaml`에 `Start-Process "http://localhost:*"`(95행), `Invoke-WebRequest -Uri "http://localhost:*`(109행) |
| 24 | 나오지 않음 |
| 25 | 통과. Builder 글 4,107자에 "학습자", "영역", "정할 몫", "규칙" 0회 |

**참고:**
- 이번 Task의 승인 창은 한 번뿐이었다. 개발 환경 확인 `cmd /c ver; node -v; npm -v; pnpm -v; yarn -v; python3 --version; git --version`(22:49:50)이다. 여러 명령을 이어 붙인 형태라 묻는 것이 맞다.
- 0.2.10 요청 1-4(완료 뒤 이유와 함께 바꾼 선택이 후속 Task가 되는 것)는 의도한 동작으로 기록한다.

## 0.2.10 Windows 확인 (2026-10-15)

frontend가 Windows 11 x64(10.0.26200, Node 24.19.0, pnpm 11.13.1)에서 backend `main` `320c6aa`과 program `main` `324214e`로 빌드했다. 두 checkout 모두 깨끗했다. 결과는 2,604,187 bytes, SHA-256 `6682973aad3c5cc3119d135f6786c28792ad5518fdc27c9d597afb7bf15126b9`, 75 entries다.

- **자동 검사(Windows):** program typecheck 통과, `npm test` 838 통과. backend unit 179 통과·1 skip, integration 552 통과·15 skip, 패널 CJS 193 통과·1 skip.
- **실제 Kiro 환경:** Kiro 1.2.56, kiro-cli 2.29.0, 0.2.9에서 업그레이드, `kiroAgent.workflows.enabled: true` 그대로, 미리 승인, 모델 Auto. 새 폴더 `win-0.2.10`, 처음 보는 목표(롤 챔피언 백과사전).
- **계정 한도:** 첫 계정이 첫 Builder 턴 끝에 월 사용량 한도(`UsageLimitReachedError`)에 걸렸다. 그래서 그 턴은 `finish_task` 없이 끝났다. 다른 계정으로 로그인한 뒤 "작업 마무리해 줘"로 이어 갔다.

| 확인 | 결과 |
| --- | --- |
| 1~8 | 통과. 0.2.10 설치 뒤 `vibe-helper Connected (5 tools)`, hook 2개 |
| 9 | 통과. 후속 Task에서 `ask_choice`(22:16:51) → "1번, 통일성 있잖아" → 학습자 선택으로 확정, 발언 1개 연결 → `APPLIED`. 첫 Task(Workflow 켬)는 `run_workflow` 없이 채팅에서 만들었지만 선택을 묻지 않았다(`ask_choice` 0회) |
| 10 | 통과. 첫 Task 뒤 후속 Task 2개가 `COMPLETED`(22:22:23, 22:27:59). 확인 14에 쓴 네 번째 Task는 기록 시점에 `ACTIVE` |
| 11 | 통과. `TASK_COMPLETED` 22:09:43 → Next Move `SUCCEEDED` 22:09:54(11초), 후보 3개 |
| 12 | 통과. 채팅에 같은 후보를 번호로 전함 → "2번 해 보자"로 후속 Task, 카드 사라짐 |
| 13 | 통과. 신뢰 → 다시 로드 뒤 새 세션이 저절로 열림, 적용값 Autopilot |
| 14 | 통과. 답(22:51:04 확정) → "그건 내가 고른 게 아니야"(22:51:08, 턴 `interrupted`) → 이의 기록, 같은 질문이 새 Decision으로 다시 열림(22:51:15) → 곁가지 질문은 기록 없이 다시 물음 → 답으로 확정(22:51:57) |
| 15 | 통과. Cancel로 멈춘 턴이 `BUILDER_CHAT_TURN`(`interrupted: true`, 22:24:23.884)으로 다음 발언(22:24:23.890)보다 먼저 기록됨 |
| 16 | **실패.** 서버는 유지된다. 하지만 Builder가 `Start-Process "http://localhost:5173"`처럼 주소를 따옴표로 감싸 미리 승인 패턴 `Start-Process http://localhost:*`과 맞지 않았다. `(Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing).StatusCode`도 같은 이유로 승인 창이 떴다. 첫 승인 창은 14:54에 떠 15:20에 허용될 때까지 27분 동안 턴을 멈췄다. 세 번째 Task 뒤에는 브라우저를 열지 않았다 |
| 17 | 통과. `/` 메뉴에 `/vibe-helper` 하나(나머지는 Kiro 기본 하위 에이전트). 빌더 탭 순서가 맞음. 터미널이 채팅 자리로 바뀐 것은 0.2.7이 옮긴 배치가 남아 있었기 때문이다. 0.2.9 설치 때 "원래 배치로 되돌리기" 안내가 한 번 떴지만 적용되지 않았다(`vibeHelper.layoutRepairOffered: true`). View: Reset View Locations 뒤에는 정상 |
| 18 | 통과. Core와 bridge가 `vibe-helper-core.exe`, Project의 `mcp.json` `command`와 hook 명령도 같은 파일 |
| 19 | 통과. `Get-Process -Name node \| Stop-Process -Force`와 `taskkill /IM node.exe /F`로 node 27개 종료. Core(29716)와 bridge(28420)는 PID 그대로. 이어서 채팅의 `check_progress` 성공(22:36:40) |
| 20 | 통과. Core를 PID로 끄면 새 Core가 7초 만에 떴다. 다시 로드 뒤에는 8.2초였고, 두 경우 모두 bridge는 그대로였다. 절전 5분 5초(22:39:00~22:44:05) 뒤에도 Core와 bridge가 같은 PID로 살아 있었다 |
| 21 | 해당 없음. 서버를 끄는 명령이 나오지 않았다 |

**0.2.9 사건 질문에 대한 답**

1. **승인 창:** 11:51:43 `Start-Process -NoNewWindow -FilePath "node" …`와 11:52:02 `Get-Process -Name "node" … \| Stop-Process -Force` 모두 `pending_interaction`(`tool_approval`)이 떴다. 각각 11:51:46·11:52:05에 "Allow"(한 번)로 풀렸다. 사용자·작업 공간 `permissions.yaml`에 `Stop-Process`·`Get-Process` match는 없다. 즉 승인 규칙은 의도대로 동작했고, 사람이 허용했다.
2. **절전:** Windows 이벤트 로그(Kernel-Power 506/507) 기준이다. 13:08:33 Modern Standby 진입 → 13:23:27 잠깐 깨었다 다시 진입 → 14:40:36 깨어남. Core는 13:23:28에 종료했다. 14:47 패널 문구는 기억하지 못한다.
3. **확인 15:** 0.2.9 때 Cancel을 눌렀는지는 기억하지 못한다. 0.2.10에서는 눌렀고 위 15처럼 기록됐다.

**새로 발견한 것**

- **한글 인자 이중 이스케이프(backend 확인 요청):** Builder가 MCP 도구 인자의 한글을 `능력…`처럼 이스케이프된 글자 그대로 보낸다.
  - `ask_choice`: 두 번 모두 `question`·`reasonRequiredNow`·`recommendationRationale`이 그렇게 저장됐다. 그래서 패널 "Kiro 채팅이 답을 기다려요"와 결정 상자에 그대로 보인다. 같은 호출의 선택지 이름·설명은 정상 한글이었다.
  - `save_progress`(22:46:20): 인자 전체가 이스케이프된 채 `summary` 하나에 들어가 `kind` 검증 오류가 났다.
  - Core가 이런 문자열을 다시 쓰라는 오류로 돌려주거나 풀어서 저장하는 방안을 검토해 주세요.
- **말로 바꾼 선택:** 완료된 Task 뒤 "버튼 방식으로 바꿔볼래. 버튼이 한 번 클릭으로 볼 수 있어서"는 Decision 변경이 아니라 새 후속 Task로 처리됐다. 의도한 동작인지 확인이 필요하다.
- **배치 되돌리기(frontend):** "원래 배치로 되돌리기" 안내는 한 번만 뜬다. 놓친 학습자를 위해 명령 팔레트 명령으로 다시 열 수 있게 하는 것을 검토한다.
- **크레딧:** 첫 계정 약 4.5(한도 도달), 두 번째 계정 약 14.8.

## 0.2.10 확인 (2026-10-14, Mac)

- 자동 검사(backend `main` `dc5859e`, Node 24.19.0): `pnpm typecheck` 통과, unit 177 통과·3 skip, integration 558 통과·9 skip(새 6개), eval 47 통과·1 skip, 패널 CJS 192 통과·2 skip(새 5개), 0.2.10 포장에 `scripts/test-macos-package.mjs` 9개 PASS(Core 실행 파일 이름 확인 포함), 바꾼 파일 Biome 오류 없음(원래 있던 경고 제외).
- 실제 Kiro(격리 프로필, Kiro 1.2.56, 본선 계정, 0.2.9에서 업그레이드, `kiroAgent.workflows.enabled` 켬, 모델 Auto). 기록은 [K18 실제 Kiro 확인](../tests/eval/results/kiro-steering-0.9.1-k18.md).
  - 0.2.9 Core는 PATH의 Node로 돌고 있었다. 0.2.10에서는 Core와 bridge가 `vibe-helper-core`로 돌았다. Core가 시작하며 Project 폴더의 MCP·hook 명령과 Steering 0.9.1을 다시 썼다. `pgrep -x node`·`pgrep node` 목록에 둘 다 없었다.
  - Core를 PID로 강제 종료하면 2~3초 만에 새 Core가 떴고 bridge는 그대로였다(다시 로드 전후 모두). Kiro를 닫으면 23초 뒤 Core가 스스로 끝났다.
  - Workflow가 켜진 새 세션에서 후속 기능 요청을 채팅에서 만들었다: 후속 Task, 코드 직전 선택 하나를 묻고 질문으로 끝냄, 답 기록, 테스트 21개, `finish_task` 첫 시도 성공, `lsof -ti`로 포트 확인, 서버 유지와 브라우저 열기. workflow 문단을 뺀 대조 세션도 위임하지 않아, Workflow 위임은 이 계정에서 재현되지 않았다. Windows 0.2.10 확인 9·14가 이 부분을 판정한다.
  - frontend 확장이 활성화 때 패널을 열어서, 패널 없는 창에서 Core를 띄우는 경로는 실제 Kiro에서 만들 수 없었다(단위 테스트로 확인). 절전 뒤 유예와 `FAILED` 뒤 다시 시도도 단위 테스트로만 확인했다.
  - 약 7.9크레딧(채팅).

## 0.2.9 Windows 확인 (2026-10-14, 중단)

frontend가 Windows 11 x64(Kiro 1.2.56)에서 backend `main` `2dc5510`과 program `main` `324214e`로 빌드했다(2,602,425 bytes, SHA-256 `5a6b9830e6718e25d3105edafbe99466a7a00fa4c203e66e916d6d0aa256d144`, 미리 승인). 확인 1~8과 11은 통과했고, 12·13·16은 일부만 확인했다. 아래 세 건 때문에 나머지를 하지 못했다. backend 판단과 고친 내용은 [0.2.10 프론트 인계](FRONTEND_HANDOFF_0.2.10.md)에 있다.

1. Builder가 서버를 다시 띄우려고 `Get-Process -Name "node" | Stop-Process -Force`를 실행했다. 같은 관리 `node.exe` 위의 Core와 MCP bridge가 함께 죽었다. Core는 host가 3초 만에 다시 띄웠지만 bridge는 창을 다시 로드할 때까지(약 1시간) 돌아오지 않았다.
2. 창을 다시 로드한 뒤 기존 Core가 13:06 이후 lease 만료로 정상 종료했다. 아무도 새 Core를 띄우지 않아 bridge가 `VIBE_HELPER_NOT_CONNECTED`만 돌려줬다.
3. `kiroAgent.workflows.enabled: true`인 Kiro에서 Builder가 첫 Task와 후속 Task를 Kiro Workflow로 통째로 구현했다. Project 전체에서 `DECISION_REQUESTED`가 0건이라 확인 9·14를 하지 못했다.

## 0.2.9 확인 (2026-10-12, Mac)

- 자동 검사(backend `main` `3721a76`, Node 24.19.0): `pnpm typecheck`·`db:check` 통과, unit 177 통과·3 skip, integration 552 통과·9 skip, eval 47 통과·1 skip, 패널 CJS 187 통과·2 skip, 0.2.9 포장에 `scripts/test-macos-package.mjs` 9개 PASS, 바꾼 파일 Biome 통과(원래 있던 지적 제외). frontend `feat/k17-panel` typecheck 통과, `npm test` 838 통과.
- 패널 미리보기: 실제 webview 번들을 headless Chromium에서 1280·420·300px로 띄워 남은 시간 표시(첫 후보·보완·넘김·Spec), Spec 시작 버튼 하나, Kiro-native 빌더 탭 세 상태를 봤다. 가로 넘침과 콘솔 오류는 없었다.
- 실제 Kiro(격리 프로필, Kiro 1.2.56, 본선 계정, 0.2.8에서 업그레이드, 신뢰 켬):
  - 신뢰 전 창에서 Kiro가 바로 채팅 세션을 만들었다. 미리 승인 → 설정이 Autopilot. 신뢰 → 다시 로드 → 이전 세션을 불러온 뒤 4.4초 뒤 host가 새 세션을 열었고 첫 턴이 Autopilot으로 돌았다.
  - 처음 보는 목표(도서관 좌석 예약 API): 선택을 질문으로 끝냄, 곁가지 질문에 기록 없이 다시 물음, 답 기록. "내가 고른 게 아니야"는 처음에 다른 막는 선택이 열려 있어 거절됐다(고침, `372628b`). 고친 뒤 같은 질문이 다시 열리고 그 선택을 출처로 한 Evidence가 빠져 '데이터 모델링'이 EXPLAINED → OBSERVED가 됐다.
  - 만드는 중에 Cancel로 멈춘 턴은 다음 발언 때 `interrupted`로 먼저 기록됐다. Task를 마치며 서버를 켜 둔 채 브라우저를 열고 주소를 알렸다.
  - 패널: 학습 기록·결정 줄·다음 한 걸음이 보였다. 대체된 결정 때문에 완료한 Task가 '결정이 있어요'로 보이던 문제(`b4b8831`)와 Next Move 한 줄 길이 초과로 두 번 실패하던 문제(`3721a76`)를 고쳤고, 다시 만들기로 후보 3개를 확인했다.
  - "원래 배치로 되돌리기"로 터미널이 하단 패널로 돌아갔다. `/` 메뉴에 `/vibe-helper`가 하나만 보였다.
  - 승인 창은 `lsof` 포트 확인과 메서드가 붙은 `curl` 두 번이었고, 둘 다 미리 승인 목록에 더했다(실제 Kiro에서 다시 확인하지는 않음). 약 14.4크레딧.

## 0.2.8 확인 (2026-10-12, Mac)

- 자동 검사(backend `main`, Node 24.19.0): `pnpm typecheck`·`db:check` 통과, unit 177 통과·3 skip, integration 542 통과·9 skip, eval 47 통과·1 skip, 패널 CJS 187 통과·2 skip, 0.2.8 포장에 `scripts/test-macos-package.mjs` 9개 PASS. frontend `feat/next-move-card` typecheck 통과, `npm test` 828 통과(새 10개). `feat/reload-required-notice`와 합친 결과도 typecheck 통과, 829 통과.
- 패널 미리보기: 실제 webview 번들을 headless Chromium에서 1280·420·300px로 띄워 카드 네 상태(생성 중·후보·실패·최대 길이 문구)를 확인했다. 가로 넘침과 콘솔 오류는 없었다.
- 실제 Kiro(격리 프로필, Kiro 1.2.56, 본선 계정, K14 테스트 빌드 위에 설치): K14 Project의 DB가 0008로 올라가고 기록이 남았다. 한 채팅 세션에서 열린 선택에 답 → Builder 완료와 한 줄 안내 → 패널 생성 중(완료 1.9초 뒤) → 후보 3개(9.8초 뒤) → "다음엔 뭘 해 보면 좋을까?"에 Builder가 같은 후보를 번호로 전달 → "2번 해 보자"로 후속 Task(후보 출처 보존, 카드 사라짐) → 선택 하나 묻고 완료 → 고른 것을 반복하지 않는 새 후보(10.3초 뒤). job 8.3·8.9초, 같이 돈 Analyst 7.8·6.5초, 모두 첫 시도. 패널은 CDP로 webview DOM을 읽어 확인했다. 기록은 [Next Move 결과](../tests/eval/results/next-move-v1.4.0.md#실제-kiro-확인-028-2026-10-12).
- 알려진 점: Builder가 크기를 "(SMALL)"처럼 영어 값으로 전했다. 실패와 "다시 만들기"는 실제 화면에서 일어나지 않아 테스트로만 확인했다.
- 크레딧: 약 7.5(채팅 4턴 6.7, Analyst 3회, Next Move 2회).

## 0.2.7 Windows 확인 (2026-10-11)

frontend가 Windows 11 x64(Kiro 1.2.56, kiro-cli 2.29.0, 본선 계정)에서 backend `main` `4c6362c`와 frontend `main` `88275f6`으로 빌드하고 0.2.6 위에 설치해 확인했다. 화면 조작은 사용자가 했고, 판정은 Kiro 로그, 세션 기록, Core SQLite로 했다.

- **자동 검사(Windows):** `pnpm typecheck` 통과, unit 179 통과·1 skip, integration 524 통과·12 skip, 패널 CJS 188 통과·1 skip. frontend typecheck 통과, `npm test` 818 통과.
- **`scripts/test-portable-core.mjs`:** 실패(`RUNTIME_PROBE_REJECTED`). Kiro 실행 파일로 Core를 띄우는 예선 단계에서 막혔다. Kiro 1.2.56 Electron은 Node 24.21.0이지만 모듈 ABI가 149라 Node 24(ABI 137)용 SQLite 모듈을 못 읽는다. 본선 host는 Core를 실제 Node로 실행하므로 이 단계를 본선 기준으로 바꿀지 backend가 정한다.
- **확인 1~10 결과**

| 단계 | 결과 |
| --- | --- |
| 1 | 통과. Core가 PATH의 Node 24.18.0으로 `managed-kiro --kiro-cli %LOCALAPPDATA%\Kiro-Cli\kiro-cli.exe`, 기존 History Project 8개 |
| 2·3 | 통과. "이걸로 시작"이 같은 창에 연결(파일 10개), 다시 로드 뒤 `vibe-helper Connected (5 tools)`, hook 2개, Workspace Steering 2개. 이 창도 열 때는 신뢰 전 상태였다(위 알려진 제한) |
| 4 | 통과. 도구 1회로 "간단한 메모장 만들기 PENDING", 승인 창 없음 |
| 5 | 통과. `vibe-helper` 탭이 도구 1회로 확정 계획을 바탕으로 답함, 승인 창 없음 |
| 6 | 통과. Kiro 완전 종료 뒤 새 Core, Open Project 없이 4 성공 |
| 7 | 통과. 4·5·6 발언 `USER_MESSAGE`, `HELPER_RESPONSE`, `BUILDER_CHAT_TURN` 기록 |
| 8 | 통과. 신뢰하지 않고 연 창(hook 꺼짐)을 나중에 신뢰하고 "이걸로 시작" → 다시 로드 알림이 뜸 → 다시 로드 뒤 hook 2개 등록 |
| 9 | 통과(조건부). 첫 Builder 턴은 `ask_choice` 없이 Task를 완료했다(`openChoices` 빈 목록). 완료 뒤 "번호 선택지로 물어봐 줘"라고 하자 다음 Task에서 `ask_choice` → 학습자 "2번…" → `save_choice`. Decision 확정 `OPTION`, `chatSource.mappedBy: BUILDER`, Builder 탭 발언 1개 연결, 이후 적용까지 기록 |
| 10 | 통과(조건부). 완료 뒤 요청으로 Task 2(sequence 2)가 생기고 연결이 옮겨 갔다. Builder는 구현 뒤 `finish_task` 없이 턴을 끝냈다. "완료로 기록해 줘" 요청 뒤 첫 `finish_task`는 `TASK_ACCEPTANCE_RESULTS_INCOMPLETE`로 거절됐고, `check_progress` 뒤 다시 보내 완료했다. 완료 보고서 2개, 분석 작업 3건 모두 `SUCCEEDED` |

- **backend 검토 (Windows 전용 아님):**
  - 첫 턴 Builder가 정할 거리를 열지 않는다(0.2.6 2차 실측과 같다).
  - Builder가 구현 뒤 `finish_task`를 부르지 않고 턴을 끝낼 때가 있다.
  - **backend 처리(2026-10-12, K14):** 두 건 모두 고쳤고 다음 설치물에 들어간다. Steering 0.7.0은 실제 선택을 코드가 그 답을 필요로 할 때 하나씩 묻고(애매하면 묻기, 에이전트 담당 영역은 정하고 밝히기), 후속 Task도 `finish_task`가 성공해야 끝난 것으로 본다. 후속 Task를 시작한 `save_progress`·`ask_choice` 응답에 `followUpTask`(새 수락 기준)가 실리고, 기준이 맞지 않는 완료 거절은 필요한 키를 알려 준다. 근거는 [DECISIONS](DECISIONS.md) "본선: Builder가 학습자에게 묻는 기준", 실측은 [K14 기록](../tests/eval/results/kiro-builder-ask-k14.md). `scripts/test-portable-core.mjs`의 Kiro 런타임 단계는 아직 정하지 않았다.
- **frontend 할 일:** `reloadRequired`일 때 패널의 `REGISTERED` 안내를 "창을 다시 로드한 뒤 새 세션(+)에서 시작하세요"로 바꾼다. Windows에서는 새 폴더마다 이 경우라서 필요하다.
- **크레딧:** 이번 확인 약 15(계정 표시 15.1/50 이후 Builder 3턴 포함).

## 0.2.7 확인 (2026-10-11, Mac)

- 자동 검사(backend `main` `5f1257c`, Node 24.19.0): `pnpm typecheck`, unit 177 통과·3 skip, integration 527 통과·9 skip, eval 46 통과·1 skip, 패널 CJS 187 통과·2 skip, `scripts/test-macos-package.mjs` 9개 PASS, 바꾼 파일 biome 통과. frontend `main` `88275f6` typecheck와 `vitest` 818 통과.
- K10 실측(같은 0.2.7 번호의 이전 빌드): 채팅 Decision 평가 13개 중 11개, 실제 Builder·Helper 흐름으로 Task 완료와 판단 근거 Evidence([기록](../tests/eval/results/kiro-chat-decision-k10.md)).
- 이 빌드의 실측(격리 Kiro, 본선 계정, 신뢰 화면은 끔): K10 흐름에서 완료한 Project에 새 채팅 세션으로 "산 물건은 목록에서 지울 수 있어야겠어. 지우는 버튼도 넣어 줘."를 보냈다. Builder가 한국어로 답하며 선택지를 물었고 Core가 그 요청으로 다음 Task를 만들었다. Builder·Helper·hook 연결이 새 Task로 옮겨 갔고, 학습자 답("3번! …")이 그 Task의 Decision에 연결돼 확정·적용됐다. Builder는 구현·테스트 뒤 완료했다(첫 `finish_task`는 이전 Task 기준 키라 거절, 다시 보내 성공). Analyst 2건 성공, 판단 근거 Evidence EXPLAINED. 채팅 약 5.8크레딧.

## 0.2.6 Windows 확인 (2026-10-10)

frontend가 Windows 11 x64 실기기에서 처음 빌드하고 확인했다. Kiro 1.2.56, kiro-cli 2.29.0(본선 계정), 예선 0.0.19 위에 설치, 화면 조작은 사용자. 판정은 Kiro 로그·작업 폴더 파일·Core SQLite로 했다.

- **빌드 전 수정(backend `850b276`):** 공식 설치 스크립트로 깐 kiro-cli는 `%LOCALAPPDATA%\Kiro-Cli`에 있어서 host가 이 위치도 찾게 했다. Windows에서만 실패하던 테스트 13개(`new URL().pathname` 경로, POSIX mode 단언, `/` 경로 정규식)를 고쳤다. macOS 동작은 같다.
- **자동 검사(Windows):** `pnpm typecheck`, unit 179 통과·1 skip, integration 496 통과·12 skip, 패널 CJS 184 통과·1 skip, `scripts/test-portable-core.mjs` 전체 PASS(관리 Node 다운로드·hash 확인 포함). frontend `c2c873c` typecheck와 `npm test` 811 통과.
- **확인 1~7:** 모두 통과.
  1. Core가 PATH의 Node 24.18.0으로 `managed-kiro --kiro-cli %LOCALAPPDATA%\Kiro-Cli\kiro-cli.exe`를 실행했고, 기존 History(Project 6개)를 그대로 읽었다.
  2. 빈 폴더에서 학습 목표 → 후보 → 계획 확정까지 진행했다.
  3. Open Project가 같은 창에 연결했다. 이때 `.kiro\hooks`·`agents`·`settings\mcp.json`·`steering`·`specs`가 써졌고, hook 명령은 cmd.exe 인용이다. 창 다시 로드 뒤 `vibe-helper Connected`, hook 2개 등록(아래 첫 항목 참고).
  4. Builder 채팅에서 도구 1회로 `PENDING`을 받았다. 승인 창은 없었다.
  5. `vibe-helper` 탭이 도구 1회로 확정 계획을 바탕으로 답했다. 승인 창은 없었다.
  6. Kiro를 완전히 종료했다가 다시 열자 새 Core가 연결을 복원했고, Open Project 없이 4가 성공했다.
  7. Core에 4·5·6의 발언이 `USER_MESSAGE`(actor `USER`)로, Helper 답이 actor `AGENT/HELPER`로 기록됐다.
- **본 것 (Windows 전용 아님):**
  - 신뢰하지 않은 상태로 연 창에서 신뢰한 **뒤에** Open Project를 하면, Kiro가 창을 처음 열 때 꺼 둔 hook(`hooks.v2.executionDisabledUntrustedWorkspace`)과 작업 공간 MCP를 다시 읽지 않는다. 그래서 hook은 `(disabled)`, MCP 목록은 빈 채로 남는다. host의 다시 로드 안내는 연결된 폴더를 신뢰할 때만 떠서 이 순서에서는 나오지 않는다. 창을 다시 로드하면 된다.
  - 패널에서 "이걸로 시작"을 누르면 `BUILDER_RUNS_IN_HOST_CHAT` 오류 카드가 뜬다. 예상한 거절이며, 패널 쪽 할 일([패널에서 다듬을 것](#패널에서-다듬을-것)의 Builder 탭)이다.
- 크레딧: 채팅 3턴 약 0.79(0.26·0.27·0.26), Discovery·계획 생성 별도. 계정 표시 1.28/50.

### 2차 실측 (2026-10-11, backend `a405217` + 패널 `edf1751`)

- **패널(program `feat/kiro-chat-open`):** Kiro-native host이면 Builder 탭이 "Kiro 채팅에서 열기"(`host.openProjectInKiro`)만 보여 주고, "이걸로 시작"이 확정한 Project를 Kiro 채팅에 연결한다. 패널에서 Builder run을 시작하지 않으므로 `BUILDER_RUNS_IN_HOST_CHAT` 카드가 사라졌다. `KIRO_CLI_NOT_INSTALLED`·`KIRO_CLI_LOGIN_REQUIRED`·`KIRO_BIND_TASK_NOT_READY` 안내 문구도 넣었다.
- **생성 폴더 경로:** README가 있는 폴더에서 "이걸로 시작" → "새 창에서 열기" → Core 생성 폴더가 새 창으로 열림. 그 창은 신뢰된 상태로 열려 hook 2개가 바로 등록됐다(다시 로드 불필요).
- **Builder 턴:** "확정한 계획대로 만들기 시작해줘" 한 턴(10분, 8.25크레딧)에 `start_task` → `update_build_context` → `complete_task`까지 진행했다. Task `COMPLETED`, 완료 보고서(기준별 `PASSED`와 코드 근거), Analyst 분석 작업 `SUCCEEDED`. kiro-cli Analyst가 실제로 돈 첫 확인이다.
- **Decision (확인 못 함, Windows 전용 아님):**
  - 첫 턴의 Builder는 HTTP 메서드·상태 코드 같은 선택을 묻지 않고 혼자 정해서 완료했다.
  - 완료 뒤 "저장 방식을 번호 선택지로 물어봐"라고 하자 `request_user_decision`을 두 번 불렀다. 1차는 `context.blockingReason` 누락으로 입력 검증 실패, 2차는 Task가 `COMPLETED`라 `LIVE_CONTEXT_TASK_NOT_RUNNING`. 그래서 채팅 선택지와 학습자 답("2번. 파일에 저장하고 싶어서")은 `USER_MESSAGE`로만 남고 Decision은 없다.
  - backend 검토: 첫 턴에서 Decision을 열게 하는 Steering, 완료 뒤 변경 요청을 받을 경로(새 Task 등).
- **Windows에서 찾아 고친 것(backend `dca359b`):** Builder 셸 명령 뒤 생성 폴더에 `Microsoft\Windows\PowerShell\ModuleAnalysisCache`가 생겼다. `projectEnvironment`가 가리키는 사적 `home\AppData\Local`·`Roaming`이 없어서 Windows PowerShell의 `GetFolderPath(LocalApplicationData)`가 빈 값이 되고, 캐시를 현재 폴더에 쓴 것이다. `selectProjectToolchain`이 이 폴더들을 만들게 했다. 실제 PowerShell로 재현하는 테스트를 넣었다(수정 전 실패, 수정 후 통과). 이 수정이 들어간 설치 파일은 자동 검사로 확인했다.
- 크레딧: 이번 실측 약 10.2(Builder 8.25·1.49, Discovery·계획 별도). 계정 표시 2.3/50 → 약 12/50.

## 0.2.6 확인 (2026-10-10)

- 자동 검사: `pnpm typecheck`, unit 177 통과·3 skip, integration 500 통과·8 skip, 패널 CJS 182 통과·2 skip, `scripts/test-macos-package.mjs` 9개 PASS, biome 통과. preflight는 pnpm 11.14.2를 받고 11.13.0·10.x·npm·Node 26을 거절하는 것을 확인했다.
- macOS 격리 Kiro 1.2.56(모델 호출 없음, 일반 PATH로 실행): 0.2.5 위에 설치 → 새 Core가 관리 Node로 떠서 연결을 복원하고 두 MCP 서버가 다시 연결됐다.

## 0.2.5 확인 (2026-10-10)

- 자동 검사: backend `pnpm typecheck`, `pnpm test:unit` 177 통과·3 skip, `pnpm test:integration` 500 통과·8 skip, 패널 CJS 180 통과·2 skip, `scripts/test-macos-package.mjs` 9개 PASS, biome format·lint(소스 경로) 통과. 새 테스트: Windows 작업 폴더 해시·cmd.exe 인용, Windows host의 kiro-cli 위치와 실제 Node 실행, 지원하지 않는 플랫폼 거절, Windows 생성 폴더 터미널 PATH.
- macOS 격리 Kiro 1.2.56(모델 호출 없음): 0.2.4 위에 설치하고 Kiro를 다시 열자 새 Core가 연결을 복원했고 두 MCP 서버가 다시 연결됐다. hook 명령은 macOS 인용 그대로다.
- Windows 실측: frontend의 첫 빌드 확인으로 한다(위 [Windows에서](#windows에서)).

## 0.2.4 확인 (2026-10-10)

- 자동 검사: backend `pnpm typecheck`, `pnpm test:unit` 177 통과·3 skip, `pnpm test:integration` 498 통과·8 skip, `scripts/test-macos-package.mjs` 9개 PASS, biome format·lint(소스 경로) 통과. 새 integration: 새 Core의 연결 복원과 없어진 폴더 건너뛰기, 다시 연결 때 회수 표시 없음, 큐의 순서·중복 1회·안전하지 않은 큐 폐기, 실제 hook 스크립트의 큐 쌓기(접속 실패·회수, Stop 제외), 실제 bridge 프로세스의 시작 대기·새 연결 따라가기·연결 없음 결과·다른 폴더 거절.
- 격리 Kiro 1.2.56 프로필(본선 계정). 화면 조작과 화면 문구 확인은 Codex(`gpt-6-astra`, computer use), 판정은 Kiro 로그·세션 기록·Core SQLite와 화면 문구를 함께 봤다.
  - **Kiro 재시작 + 0.2.3 위 업데이트:** 직접 다시 연결하지 않았다. 옛 경로 MCP는 01:31:39에 시작 실패, 새 Core가 연결을 복원해 경로를 고친 01:32:05에 Kiro가 두 서버를 다시 연결했다. 화면: `vibe-helper Connected (9 tools)`, `vibe-helper-helper Connected (1 tool)`. Builder `get_build_status`, Helper `get_helper_context` 성공, 학습자 발언 `USER_MESSAGE` 기록, 승인 창 0회.
  - **열린 창에서 다시 연결:** 창 다시 로드 없이 같은 Builder 탭의 다음 `get_build_status`가 성공(bridge가 새 연결을 따라감).
  - **Core에 닿지 못한 발언:** hook 연결 파일을 닫힌 포트로 바꾼 상태(Core가 사라진 것과 같은 조건)에서 보낸 발언이 큐(0600)에 남았고 채팅은 막히지 않았다. 다음 연결 때 Core가 한 번 기록하고 큐를 지웠다.
- 크레딧: 이번 확인 직전 29.39(01:31 기록), 이후 채팅 3턴은 다음 창 로드 때 갱신된다.

## 0.2.3 확인 (2026-10-09~10)

- 자동 검사: backend `pnpm typecheck`, `pnpm test:unit` 177 통과·3 skip, `pnpm test:integration` 493 통과·8 skip(Helper 에이전트의 `tools`, 읽기 전용 문구, 프롬프트의 Core 연결 값 회귀 검사 포함), `scripts/test-macos-package.mjs` 9개 PASS, biome format·lint(소스 경로) 통과.
- 격리 Kiro 1.2.56 프로필(본선 계정)에서 0.2.3을 설치하고 생성 폴더 Project를 다시 연결했다. 화면 조작은 Codex(`gpt-6-astra`, computer use)가 했고 판정은 Kiro 로그·세션 기록·Core SQLite로 했다.
  - 채팅 모드 목록: Default, Spec, Quick Spec, Bug Fix, Plan, kirocrew 3개(사용자 전역 에이전트), `vibe-helper`.
  - `vibe-helper` 탭: 도구 8개(`toolCount: 8`), `get_helper_context` 성공(정책 `allow`, 승인 창 0회), 파일 검색·목록도 승인 없이 실행. 답은 확정 계획(오프라인 메모장, Task PENDING)을 바탕으로 했다.
  - Core: 질문과 답이 `USER_MESSAGE`·`HELPER_RESPONSE`로 기록.
  - 도중에 나온 실패 두 가지를 고쳤다(taskId 누락 → `AGENT_RUN_SCOPE_MISMATCH`, 위 0.2.3 항목). 다른 하나(다시 연결 뒤 옛 MCP 프로세스 → `BRIDGE_BINDING_REVOKED`)는 0.2.4에서 고쳤다.
- 0.2.2 실측(Kiro 1.2.56, 사용자 클릭): 도구 허용 동의 `ALLOW` 저장, 권한 규칙 `vibe-helper/*`·`vibe-helper-helper/*` 기록, 파일 있는 폴더에서 생성 폴더가 새 창으로 열림, Helper 탭 판별과 Core 기록 동작. Helper 도구는 위 문제로 실패했다.
- 확인하지 못한 것: Sonnet 5.5 Analyst의 실제 실행(이번 Helper 대화 Episode는 아직 분석되지 않음), Kiro 1.2.56의 Builder 턴.
- 크레딧: 이 확인 전체에서 계정 사용량 27.39 → 29.08(마지막 Helper 턴 전 기록). Discovery·계획 0.42, Core에 기록된 Helper 대화 4건, Codex가 한글 입력 누락으로 중단하고 다시 보낸 턴 2번을 포함한다.

## 0.2.2 확인 (2026-10-09)

- 자동 검사: backend `pnpm typecheck`, `pnpm test:unit` 177 통과·3 skip, `pnpm test:integration` 493 통과·8 skip(모델 순서와 "쓸 수 없음" 거절 처리, 정책 최대치 저장 포함), `scripts/test-macos-package.mjs` 9개 PASS. biome format·lint는 소스 경로(`apps packages scripts tests examples agents`)로 통과했다. 저장소 전체 `biome format .`은 사용자 실험 폴더 `.local-experiments/kiro-native-recovery/biome.json`의 중첩 설정 때문에 시작하지 못한다(그 폴더는 건드리지 않음).
- 포장 확인: 0.2.1과 항목별 hash를 비교해 Core 묶음·manifest·버전 표기 4개만 다름을 확인했다. Core 묶음에 Analyst 모델 순서와 정책 최대치 설명 문구가 들어 있다(0.2.1 묶음에는 없음).
- 격리 Kiro **1.2.56** 프로필(kiro-cli 2.28.0, 본선 계정)에 0.2.1 위로 설치: 기존 Core 데이터로 `CORE_CONNECTED`·`WORKER_READY`·`helperMode: KIRO_CLI`. 이어서 처음 보는 학습 목표(Personal Need 없음)로 Discovery 미리보기 10개(30초), 후보 선택·계획 생성(36초), 확정·Task 준비가 이 Core로 진행됐다. 창을 닫으면 Core가 26초 뒤 스스로 끝났다.
- 남은 확인: 신뢰·도구 허용·새 창 확인 창과 모드 목록의 `vibe-helper` 선택(사용자 클릭), Sonnet 5.5 Analyst의 실제 실행.

## 0.2.1 확인 (2026-10-09, 모델 호출 없음)

- 자동 검사: backend `pnpm test:unit` 177 통과·3 skip, `pnpm test:integration` 489 통과·8 skip(현재 폴더 등록과 거절 사례, Helper 탭 판별과 Builder 활동 첨부, 허용 규칙, 연결 API 검증 포함), 패널 host 11개를 포함한 패널 CJS 179 통과·2 skip, `scripts/test-macos-package.mjs` 9개 PASS. frontend `vitest` 811 통과, `tsc` 통과.
- 패널 화면: 실제 webview 묶음을 Chrome에서 1280px과 360px 폭으로 띄워 로딩 카드, 최신 라운드와 접힌 이전 후보, 보완하기 버튼, 두 개의 이걸로 시작, 예상 Decision 안내를 확인했다(Kiro 테마 변수는 임의 값).
- 격리 Kiro 1.2.37 프로필에 0.2.1을 설치하고 빈 폴더를 연 상태에서 연결 API를 host와 같은 인자로 불렀다. 결과는 `registered: true`, 그 폴더에 `.kiro/agents/vibe-helper.json`·hooks·Steering·MCP·Spec 기록, 권한 규칙 기록(`coreTools: WRITTEN`). 다시 로드 없이 Kiro가 Builder MCP 서버에 연결했고 `vibe-helper`를 작업 공간 에이전트로 등록했다. hook은 새 채팅 세션을 만들 때 2개가 적재됐다(그 전에는 0개).

## 0.2.0 검증 (2026-10-08)

격리 Kiro 1.2.37 프로필(`kiro.kiroAgent` 1.1.294)에 같은 내용의 VSIX(73개 항목 hash 동일, 압축 timestamp만 다름)를 설치했다. 합성 Campus Drop Project를 Core 데이터에 미리 넣었고, 판정은 Core SQLite의 구조화 필드로만 했다. 개인 Builder ID 무료 계정, Kiro 채팅과 Analyst 모두 Auto 모델.

| 단계 | 결과 |
| --- | --- |
| 확장 활성화와 Core 시작 | `CORE_CONNECTED`, `native: WORKER_READY`, `helperMode: KIRO_CLI`. Core 명령은 `managed-kiro --kiro-cli <설치 경로>` |
| Project 목록과 연결 | 합성 Project 표시. `openProjectInKiro` 성공, 생성 폴더가 새 창으로 열림. `.kiro/` Steering 0.4.0·hook·MCP·Spec과 `.vibe-helper/` 생성. hook·MCP 명령은 포장된 Node와 `portable/bin/` 스크립트를 가리키고 작업 폴더 파일에 토큰 없음 |
| 채팅 → hook | 첫 채팅이 `USER_MESSAGE`(actor `USER`)로 기록 |
| 채팅 Decision | Agent가 Core MCP로 상태를 읽고 3개 선택지 Decision(`PRODUCT_BEHAVIOR`, source `BUILDER`)을 요청. 자연어 답("1시간으로 할게. …")이 `selectionKind: OPTION`, `chatSource.mappedBy: BUILDER`로 확정 |
| Analyst와 상태 | DECISION Episode `ANALYZED`, 분석 작업 `SUCCEEDED`(kiro-cli). 제안 `JUSTIFIED_DECISION` → Core `ACCEPTED`(`VALID_USER_EVIDENCE`) → `link expiry` `DEMONSTRATED`. 학습자 요약 파일 갱신 |
| Discovery | 패널 host API로 새 학습 목표 Discovery 시작(enrichment 끔) → run `SUCCEEDED`, 미리보기 후보 10개(source `DISCOVERY`/`AGENT`) |

이번 검증에는 Kiro 채팅 2턴에 1.57크레딧이 들었다. Analyst 1회와 Discovery 미리보기 1회까지 합하면 약 2크레딧으로 추정한다.

자동 검사: 패널 host 8개, Core lifecycle 19개, 패널 CJS 전체 176 통과·2 skip, `pnpm test:unit` 177 통과·3 skip, `pnpm test:integration` 475 통과·8 skip, `scripts/test-macos-package.mjs` 9개 PASS. 마지막 검사는 포장 자산의 Core·SQLite lifecycle을 기존 `managed` 명령으로 확인하는 것이다. `managed-kiro`는 위 실제 Kiro 확인이 담당한다. 패널 화면 자체는 이번에 눈으로 확인하지 않았다.

## 다시 빌드

backend `main` checkout에서, Node 24.x·pnpm 11.13.1 이상 11.x로(권장 24.19.0·11.13.1):

```sh
pnpm install --frozen-lockfile
pnpm panel:pack:macos <frontend checkout 경로>        # Apple Silicon Mac
pnpm panel:pack:kiro-windows <frontend checkout 경로> # Windows x64
```

`dist/macos-vsix-*`에 VSIX, receipt와 `files.json`이 생긴다. 프론트 변경을 반영하려면 프론트 checkout을 고친 뒤 같은 명령을 다시 실행한다. `vibeHelper.openInKiro` 명령 등록은 패키징 단계에서 manifest에 더해지므로 프론트 `package.json`에 넣지 않아도 된다.
