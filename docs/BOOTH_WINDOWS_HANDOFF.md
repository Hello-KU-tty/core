# 부스 체험 노트북 인계 (Windows, AI Tech Day 2026-10-20)

이 문서는 Windows 부스 노트북의 Codex가 위에서부터 그대로 따라 하도록 쓴 것이다. 브랜치는 `booth/demo-kit`, 키트는 [`booth/windows-kit/`](../booth/windows-kit/)다. **[사람]** 표시 단계는 Kiro 화면 조작이다. 사람이 하거나, computer use가 되면 Codex가 한다. 그 앞에서 멈추고 무엇을 할지 알린다.

## 0. 만들 결과

노트북을 매장 체험용 노트북처럼 만든다.

- 바탕화면에 아이콘 두 개가 있다.
  - **① 처음부터 만들어 보기:** 빈 폴더에서 Discovery부터 시작한다.
  - **② 결정하는 순간 체험하기:** 미리 만든 Project가 Builder의 번호 선택지 직전에서 멈춰 있다.
- 아이콘을 누를 때마다 부스 Kiro를 닫는다. 그 모드의 처음 상태로 되돌린 뒤 다시 연다. 막히면 "Kiro 닫고 아이콘 다시 누르기"가 유일한 복구 방법이다.
- Kiro 가운데에 그 모드의 안내 탭이 열린다. 바탕화면 배경에도 안내가 있다.
- 10분 동안 입력이 없으면 부스 Kiro를 닫고 바탕화면으로 돌아간다. 아무도 안 보는 Builder 턴도 이때 끝난다.
- 방문자 기록(채팅, Core DB)은 지우지 않고 `C:\HelloVibeBooth\archive`에 남는다.

②의 동작 원리는 다음과 같다.

1. 원본(golden)에는 Builder가 `ask_choice`로 선택을 기록하고 턴을 끝낸 상태의 Core 데이터와 Project 폴더가 들어 있다.
2. 아이콘을 누르면 원본을 되돌리고 **새 채팅 세션**으로 연다.
3. 방문자가 `이어서 해줘`를 보내면 Builder가 `check_progress`로 열린 선택을 받아 같은 선택지를 다시 묻는다.

①은 빈 폴더와 원본 Core 데이터로 되돌린다. 패널은 Project 폴더가 아닌 창에서 마지막으로 본 Project를 다시 연다. 그래서 부스 프로필에 저장된 그 값(`bhlr.lastProjectId`)도 지운다.

예전 채팅 세션을 되살리지 않는 이유가 있다. Kiro를 다시 켠 뒤의 예전 세션은 Vibe Helper 도구 호출이 헛돌 수 있다(Steering 0.9.7, `kiro-steering.md` 0.9.7 항목). 새 세션 동작은 Mac 0.2.14에서 확인했다(2026-10-20 00:51).

- 열린 선택이 하나 있는 Project 창의 새 세션에 `이어서 해줘`를 보냈다.
- Builder가 `check_progress` 뒤 같은 선택을 번호와 `/vibe-helper` 예시로 다시 물었다.
- 63초, 0.82크레딧이 들었다.

## 1. 전제 확인 (Codex)

1. core 저장소에서 `git fetch origin` 후 `git switch booth/demo-kit`을 실행한다. 아래 경로는 저장소 루트 기준이다.
2. Windows 11 x64와 Windows PowerShell 5.1(기본 `powershell.exe`)을 쓴다.
3. Kiro IDE 최신판이 설치돼 있는지 확인한다. 보통 `%LOCALAPPDATA%\Programs\Kiro\Kiro.exe`다.
4. `kiro-cli --version`이 2.21.1 이상이고, 본선 계정으로 로그인돼 있는지 확인한다. Discovery와 Analyst가 kiro-cli로 돈다.
5. `releases\windows\kiro-native\builder-helper-agent-panel-0.2.14-win32-x64.vsix`가 있는지 확인한다. SHA-256은 `9501810e74d229c62a4b99b49ec35c3aec3ac266e1fed27601bfacc1295ed927`([설치 가이드](DOWNLOAD_GUIDE.md))이고, setup이 해시를 출력한다.
6. 권장: 개인 파일과 로그인이 없는 Windows 계정에서 진행한다. 방문자는 Kiro 채팅에 무엇이든 입력할 수 있고 명령 승인도 누를 수 있다.

키트는 부스 전용 Kiro 프로필(`C:\HelloVibeBooth\kiro-profile`, 확장은 `kiro-extensions`)을 쓴다. 평소 Kiro 프로필과 설정은 건드리지 않는다. 경로를 바꾸려면 setup 전에 사용자 환경 변수 `HELLO_VIBE_BOOTH_ROOT`를 `setx`로 설정한다. 바탕화면 아이콘도 이 값을 읽는다.

## 2. 설치 (Codex)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File booth\windows-kit\setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File booth\windows-kit\check.ps1
```

`setup.ps1`이 하는 일은 다음과 같고, 다시 실행해도 된다.

- `C:\HelloVibeBooth` 폴더들을 만든다.
- 부스 프로필 설정을 쓴다(목록은 `BoothCommon.ps1`의 `$BoothSettings`).
  - 창 복원·업데이트 끔
  - workspace trust 끔
  - Kiro workflows 끔
  - Autopilot
  - 안내 탭은 Markdown 미리보기로 연다
- Kiro의 `bin\kiro.cmd`로 VSIX를 부스 프로필에 설치한다. `kiro.cmd`가 없으면 경고만 낸다. 그때는 3단계에서 부스 Kiro가 열리면 Extensions → Install from VSIX로 설치한다.
- 바탕화면 아이콘 ①·②를 만든다.
- `C:\HelloVibeBooth\operator\` 운영자 바로가기를 만든다(② 준비 시작, ② 원본 저장, 상태 확인, 자동 초기화 일시정지·재개).
- 시작 프로그램에 자동 초기화를 등록하고 바로 실행한다.
- 바탕화면 배경을 바꾼다. 원래 배경은 `booth.json`에 기록한다.

옵션은 `-IdleMinutes 10`, `-SkipWallpaper`, `-SkipVsix`, `-Vsix <경로>`가 있다.

`check.ps1`에서 남아도 되는 항목은 `② 원본 없음` WARN뿐이다. FAIL이 있으면 고치고 다시 확인한다.

설치 중 바탕화면 아이콘 배치를 확인한다. 아이콘이 왼쪽 위에 있어야 배경 안내("← 왼쪽 위 아이콘")와 맞는다. 다른 바탕화면 아이콘은 사용자에게 물어보고 숨긴다(바탕화면 우클릭 → 보기).

## 3. ② 원본 만들기 (약 15분, 크레딧 10~20)

1. (Codex) `booth\windows-kit\stage.ps1`을 실행한다.
   - 자동 초기화를 멈춘다.
   - 지금 Core 데이터를 archive로 옮긴다. 새 Core로 시작하기 위해서다.
   - 빈 `projects\decision` 폴더로 부스 Kiro를 연다.
2. **[사람]** 부스 Kiro에서 진행한다.
   1. Kiro가 로그인을 물으면 본선 계정으로 로그인한다. Vibe Helper 패널이 준비되기를 기다린다. 처음이면 Node 24.19.0을 내려받아 1~2분 걸린다. 내려받기 동의를 물으면 동의한다.
   2. 패널에 배우고 싶은 것을 입력한다. Personal Need는 비운다. 권장 문구는 `여러 명이 동시에 신청해도 정원이 넘치지 않게 만드는 법을 배우고 싶어요`다(본선 영상 녹화 때 끝까지 확인한 목표).
   3. 후보를 하나 고르고 **이걸로 시작**을 누른다. "명령을 실행할 때 어떻게 승인할까요?" 창이 뜨면 **개발 명령 미리 승인**을 고른다. 부스 프로필에 한 번 저장돼 방문자에게는 다시 묻지 않는다.
   4. 오른쪽 채팅에서 Builder가 일한다. 명령 승인이 뜨면 내용을 읽고 승인한다.
   5. Builder가 번호 선택지를 묻고 턴이 끝나면(입력칸이 다시 활성화) 거기서 멈춘다. **답하지 않는다.**
   6. Builder가 묻지 않고 Task를 끝내 버리면 1단계부터 다른 후보로 다시 한다. 선택이 Task 끝 무렵에 나올수록 좋다. 답한 뒤 2~3분 안에 끝나야 방문자가 학습 기록까지 볼 수 있다.
3. (Codex) `booth\windows-kit\save-golden.ps1`을 실행한다.
   - 부스 Kiro를 닫고 Core가 스스로 끝나기를 최대 75초 기다린다.
   - `golden\`에 Core 데이터와 Project 폴더를 저장하고 자동 초기화를 다시 켠다.
   - 마지막 채팅에 `mcp_vibe_helper_ask_choice`가 없거나 이미 답한 상태(`save_choice`가 뒤에 있음)면 경고한다. 경고가 나오면 2단계로 돌아간다.

## 4. 리허설 (아이콘 클릭과 채팅은 [사람])

각 항목의 결과를 기록한다.

| # | 할 일 | 통과 기준 |
| --- | --- | --- |
| a | 바탕화면 ② 더블클릭 | "준비하고 있어요" 창 뒤 Kiro가 최대화로 열린다. 가운데에 ② 안내 탭(미리보기)이 있고, 채팅은 빈 새 세션이며, 패널에 그 Project가 보인다 |
| b | 채팅에 `이어서 해줘` | 1~2분 안에 Builder가 원본과 같은 선택을 번호로 묻는다(새로 만들거나 다른 걸 먼저 짓지 않음) |
| c | `/vibe-helper 1번이랑 2번은 뭐가 달라?` | 파일 수정이나 명령 없이 설명하고, 고르면 보내 달라는 말로 끝난다 |
| d | `1번, <이유 한 문장>` | 패널 진행 탭에 고른 것이 남고 Builder가 이어서 만든다 |
| e | 진행 중에 ② 다시 더블클릭 | 진행 중이던 Kiro가 닫히고 a와 같은 처음 상태로 열린다. `C:\HelloVibeBooth\archive`에 새 폴더가 생긴다 |
| f | ②를 쓴 다음 바탕화면 ① 더블클릭 | 빈 폴더로 열리고 패널이 프로젝트 찾기 화면이다. ② 프로젝트나 "이전 프로젝트를 불러오지 못했습니다"가 보이면 실패다. 목표를 넣으면 30초~1분 안에 후보가 나온다(시작까지 누를 필요는 없음) |
| g | 자동 초기화 | `C:\HelloVibeBooth\booth.json`의 `IdleMinutes`를 `1`로 바꾸고 1분 30초 동안 입력하지 않는다. 부스 Kiro가 닫히고 바탕화면이 보이면 통과. 끝나면 `10`으로 되돌린다(재시작 불필요) |
| h | 아이콘 빠르게 두 번 더블클릭 | Kiro가 한 번만 열린다 |
| i | `check.ps1` | FAIL 없음, `② 원본 저장됨` |

**실패하면 볼 곳**

- `C:\HelloVibeBooth\logs\booth-<날짜>.log`
- 부스 프로필 Kiro 로그: `C:\HelloVibeBooth\kiro-profile\logs`
- 채팅 기록: `%USERPROFILE%\.kiro\sessions\<hash>\sess_*\messages.jsonl`

**Mac에서 확인하지 못해 Windows에서 처음 보는 부분**

| 부분 | 확인할 것 | 다르게 동작할 때 |
| --- | --- | --- |
| `Kiro.exe --new-window <폴더> <안내 파일>` | 안내 파일이 같은 창에 열리는지 | 안내 탭을 빼고 배경과 종이 안내로 대신한다 |
| `bin\kiro.cmd --install-extension` | 부스 프로필에 설치되는지 | 부스 Kiro 화면에서 VSIX를 설치한다 |
| 부스 Kiro 종료 | `CloseMainWindow`와 강제 종료로 끝나는지 | `Get-BoothProcessIds` 대상 확인 |
| 원본 복사 | robocopy 제외 규칙(`backend.lock`, `backend.stopped-*`, `backend.abandoned-*`, `connection.json`)이 맞는지, `/SJ`로 pnpm junction이 그대로 복사되는지(② 되돌린 뒤 Builder가 의존성을 다시 설치하지 않으면 통과) | `BoothCommon.ps1`의 `Invoke-Mirror` 수정 |
| 채팅 기록 | Windows `session.json`의 `workspacePaths` 경로가 `C:\HelloVibeBooth\projects` 아래로 인식되는지 | `Test-PathUnder` 수정 |
| 마지막 프로젝트 지우기 | ①을 열기 전에 `Clear-LastProject`가 부스 프로필의 `state.vscdb`에서 Hello Vibe의 `bhlr.lastProjectId`만 지우는지(Hello Vibe가 받아 둔 `core-tools\...\vibe-helper-core.exe`의 `node:sqlite` 사용) | 로그의 `clear-last-project` 줄을 본다. 실패하면 방문자가 패널에서 처음 화면으로 가야 한다 |

## 5. 행사 중 운영 (사람)

- **큰 모니터:** 노트북을 주 디스플레이로 두고 확장 모드로 연결한다. 큰 모니터에서 Edge로 `booth\windows-kit\attract.html`을 열고 F11을 누른다. 소개 영상이 반복된다.
- **설명할 때:** Kiro를 열어 둔 채 오래 설명하면 `operator\자동 초기화 일시정지·재개`를 실행한다. 끝나면 다시 실행해 켠다.
- **크레딧:**
  - ①에서 Builder 턴은 선택을 물으면 끝나서 방치돼도 보통 한 턴에서 멈춘다.
  - ②는 `이어서 해줘` 약 1, 답한 뒤 끝까지 5~15 정도로 예상한다.
  - 점심때 Kiro 계정 사용량을 확인한다.
- **②가 이상해졌을 때:** 다른 선택을 묻거나 원본이 깨졌으면 `operator\1. ② 준비 시작` → 3단계 → `operator\2. ② 원본 저장`으로 다시 만든다.
- **창이 멈췄을 때:** Kiro를 닫고 아이콘을 다시 누른다. 그래도 안 되면 `check.ps1`과 로그를 본다.

## 6. 행사 뒤

- `booth\windows-kit\teardown.ps1`을 실행한다. 아이콘, 시작 프로그램, 자동 초기화를 지우고 배경을 되돌린다. `C:\HelloVibeBooth`는 남긴다.
- `archive\`는 방문자 대화와 Core DB다. 저장소, fixture, 메신저에 올리지 않는다. 지울 때는 사용자에게 묻는다.

## 7. Codex 작업 규칙과 보고

- 스크립트를 고쳐야 하면 `booth/windows-kit/`에서 고친다.
  - `.ps1`은 UTF-8 **BOM 포함**을 유지한다. Windows PowerShell 5.1은 BOM 없는 파일의 한글을 깨뜨린다.
  - PowerShell 7 전용 문법(`??`, `? :`, `&&`)을 쓰지 않는다.
- 고친 내용은 보고한다. commit과 push는 사용자가 요청할 때만 한다.
- `C:\HelloVibeBooth`의 내용(archive, logs, golden)은 저장소에 넣지 않는다.
- 이름으로 프로세스를 일괄 종료하지 않는다(`taskkill /IM node.exe` 같은 것). 키트는 부스 프로필 경로가 명령줄에 있는 프로세스와 그 자식만 끈다.

**보고에 넣을 것**

- 1단계 확인 결과
- `check.ps1` 출력
- ② 원본의 목표와 Builder가 묻는 선택
- 리허설 a~i 결과
- 쓴 크레딧
- 고친 파일과 이유
- 남은 문제
