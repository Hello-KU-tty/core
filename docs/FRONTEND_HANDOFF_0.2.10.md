# 0.2.10 프론트 인계 (2026-10-14)

Windows 0.2.9 확인에서 보내 준 세 건(TASKS K18)을 backend에서 고쳤다. Mac 0.2.10을 만들어 실제 Kiro에서 확인했다. 이번에는 **frontend 코드 변경이 없다.** 고친 곳은 모두 backend(Core, host, Steering)이고, host는 VSIX의 `portable/bin`으로 들어간다. 빌드 절차와 지난 기록은 [Kiro-native 인계](FRONTEND_KIRO_NATIVE_HANDOFF.md)에 있다.

| 할 일 | 어디서 | 끝난 기준 |
| --- | --- | --- |
| 1. 질문 세 개에 답하기 | 0.2.9를 확인한 Windows PC | 아래 [1](#1-029-사건에-대한-질문) |
| 2. Windows 0.2.10 빌드와 확인 | backend `main`, program `main`(`324214e` 그대로) | 아래 [2](#2-windows-0210-빌드와-확인)의 확인 |
| 3. 올리기와 링크 바꾸기 | `Hello-KU-tty/core`의 `main` | VSIX·receipt·files, 설치 가이드, README를 한 커밋에 |

- **Mac 0.2.10:** [`builder-helper-agent-panel-0.2.10-darwin-arm64.vsix`](../releases/macos/kiro-native/builder-helper-agent-panel-0.2.10-darwin-arm64.vsix) · 41,609,475 bytes · SHA-256 `a7dc53d4acd27df203f62c774c1a8acd0b747ef85630c15c99735a636bdff510`
- **빌드 출처:** backend `main` `dc5859e`(깨끗한 worktree), program `main` `324214e`(Windows 0.2.9와 같은 트리).
- **바뀐 동작:** [0.2.10에서 바뀐 점](FRONTEND_KIRO_NATIVE_HANDOFF.md#0210에서-바뀐-점). Mac 실측: [K18 실제 Kiro 확인](../tests/eval/results/kiro-steering-0.9.1-k18.md).
- **DB:** 0.2.10은 migration이 없다. 0.2.9 DB를 그대로 쓰고 0.2.9로 되돌려도 열린다.

## 보내 준 세 건에 대한 backend 판단

1. **이름으로 node 종료:**
   - Core와 bridge·hook은 이제 `vibe-helper-core.exe`라는 이름으로 돈다. 해시를 검증한 관리 Node 사본이다.
   - Kiro-native host는 PATH의 `node.exe`를 Core 런타임으로 쓰지 않는다.
   - Steering 0.9.1이 서버를 PID나 포트로만 끄게 하고, 이름으로 일괄 종료하지 못하게 한다. Vibe Helper 도구가 사라지면 Builder가 창을 다시 로드하라고 안내한다.
   - 미리 승인 목록은 바꾸지 않았다. `Get-Process`·`Stop-Process`·`taskkill`은 처음부터 목록에 없다. 그래서 우리 규칙상 Kiro가 물었어야 한다(아래 질문 1).
2. **다시 로드 뒤 Core가 다시 뜨지 않음:**
   - host의 Core 점검은 한 번 `FAILED`가 되면 영구히 멈췄다(45초 시간 초과, 60초 안 두 번 재시작 등).
   - Core는 lease를 벽시계로 재서, 절전에서 깨어나면 host가 갱신하기 전에 닫혔다.
   - 0.2.10에서는 다음과 같이 바뀐다.
     - host가 `FAILED` 뒤에도 5초에서 60초까지 간격을 늘려 다시 시도한다.
     - Core는 절전·멈춤 뒤 갱신 유예를 다시 주고, 살아 있는 host는 2분까지 기다린다.
     - 연결된 Project 폴더 창에서는 "Vibe Helper Core에 연결하지 못했어요 … [다시 연결]" 알림이 한 번 뜬다.
   - 정확한 계기는 아래 질문 2로 좁힌다.
3. **Workflow 위임:**
   - Kiro는 `kiroAgent.workflows.enabled`가 켜진 세션의 지침에 "**항상** `run_workflow`로 만들고 실행하라"를 넣는다.
   - Workflow 안의 계획 에이전트는 여러 안이 있으면 스스로 고른다. 그래서 학습자 선택이 빠진다.
   - Steering 0.9.1이 "구현은 이 채팅에서 직접, workflow·하위 에이전트에 넘기지 않기"를 넣었다.
   - Mac에서는 Workflow를 켜도 대조 세션까지 위임하지 않아 재현되지 않았다. 그래서 확인 9·14를 **Workflow를 켠 그대로** 다시 봐 주세요.
   - 학습자의 전역 설정은 바꾸지 않는다. 설치 가이드 문제 해결에 "Disable Workflows" 안내를 넣었다.

## 1. 0.2.9 사건에 대한 질문

0.2.10 확인 전에 0.2.9 기록에서 확인해 주세요. 토큰·대화 원문은 붙이지 말고 해당 줄의 종류와 명령만 알려 주세요.

1. **11:51:46·11:52:06 명령에 승인 창이 떴나요?**
   - `%USERPROFILE%\.kiro\sessions\<작업 폴더 해시>\sess_*\messages.jsonl`에서 그 시각 근처의 `pending_interaction`(`tool_approval`)과 `interaction_resolved`를 봐 주세요.
   - `%USERPROFILE%\.kiro\settings\permissions.yaml`(사용자)과 `%USERPROFILE%\.kiro\workspace-roots\<해시>\permissions.yaml`(작업 공간)에 `Stop-Process`·`Get-Process`·`Start-Process`가 든 `match`가 있는지도 봐 주세요. Kiro의 "항상 허용" 기본 패턴은 `Stop-Process *`처럼 명령 이름 전체다.
2. **13:06~14:47 사이에 PC가 절전·화면 잠금에 들어갔나요?** 14:47에 패널 상태 문구(Core 연결 실패 코드 등)가 무엇이었나요?
3. **확인 15:** 정지 버튼을 실제로 눌렀는지 알려 주세요. 0.2.10에서 다시 볼 때 같은 절차로 하면 된다.

## 2. Windows 0.2.10 빌드와 확인

- **절차:** [Windows에서](FRONTEND_KIRO_NATIVE_HANDOFF.md#windows에서)의 1~4. backend `main`은 이 문서가 올라간 커밋 이후, program `main`은 `324214e` 그대로다. 버전은 `0.2.10`으로 나온다.
- **업그레이드 전:**
  - 열려 있는 Kiro 창을 모두 닫는다. 0.2.9 Core가 끝나기 전에는 새 host가 "이전 버전의 Core를 기다리는 중"으로 남는다.
  - 0.2.10은 처음 열 때 관리 Node `node.exe`를 `vibe-helper-core.exe`로 한 번 복사한다(약 80MB).
  - PATH에 Node 24.18·24.19가 있어 그걸 쓰던 설치는 관리 Node를 처음 한 번 내려받는다.
- **확인 항목:** 0.2.9에서 끝낸 1~8은 설치·연결만 다시 본다. 못 한 9~17과 아래 18~21을 한다. 사건 조건대로 `kiroAgent.workflows.enabled: true`를 그대로 둔다.
  - 9·14는 처음 보는 목표로 새 Project를 만들고, 첫 발언 "계획대로 만들기 시작해 줘"로 본다. Builder가 `run_workflow` 없이 채팅에서 만들고 선택을 번호로 묻는지 본다. 세션 기록에 `run_workflow`가 있으면 그 턴의 시각과 Builder 문장을 알려 주세요.

추가 확인 18~21:

18. **실행 파일 이름:** 작업 관리자(세부 정보)나 `Get-Process vibe-helper-core | Select-Object Id,Path`에서 Core와 bridge가 `vibe-helper-core.exe`로 보인다. `Get-Process -Name node -ErrorAction SilentlyContinue`에는 둘이 없다. Project 폴더 `.kiro\settings\mcp.json`의 `command`와 `.kiro\hooks\vibe-helper.json`의 명령이 `...\core-tools\runtime-cache\node-24.19.0-win32-x64\vibe-helper-core.exe`다.
19. **이름으로 종료해도 살아남기:**
    - Builder 턴이 없을 때, 별도 PowerShell에서 `Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force`를 실행한다. 이 PC의 다른 node 프로세스도 꺼지니 주의한다.
    - 그 뒤 Core PID와 bridge PID가 그대로이고, Kiro 채팅에서 "지금 진행 상황 알려 줘"에 Builder가 `check_progress`를 정상으로 부른다.
    - `taskkill /IM node.exe /F`로도 한 번 본다.
20. **Core가 다시 뜨기:**
    - `Stop-Process -Id <Core PID> -Force`로 Core만 끄면 몇 초 안에 새 Core가 뜨고(`connection.json`의 `backendInstanceId`가 바뀜), bridge PID는 그대로다.
    - 창을 다시 로드한 뒤에도 같은 시험을 한다.
    - 가능하면 PC를 절전에 넣었다가(5분 이상) 깨운 뒤 Core가 살아 있는지 또는 새로 떴는지 본다.
21. **Builder가 서버를 다시 띄울 때:** 9~16 사이 Builder가 서버를 끄거나 다시 띄우면 그 명령 원문을 알려 주세요. PID(`Stop-Process -Id`)나 포트(`Get-NetTCPConnection -LocalPort`)로 꺼야 맞다. 이 둘은 미리 승인 목록에 없어 승인 창이 뜬다. 정상이다.

**확인 13 문구:** Kiro 1.2.56은 `kiroAgent.agentAutonomy` 기본값이 `Autopilot`이다. 그래서 미리 승인을 골라도 `settings.json`에 키가 생기지 않을 수 있다. "적용값이 Autopilot"(설정 화면 값 또는 첫 턴이 파일 검토 없이 진행)이면 통과로 본다. [인계 문서](FRONTEND_KIRO_NATIVE_HANDOFF.md#windows-0210-빌드-요청-frontend)의 문구도 고쳤다.

## 3. 올리기

- 확인한 VSIX와 `receipt.json`, `files.json`을 core의 `releases/windows/kiro-native/`에 넣고 0.2.7 파일을 교체한다. 0.2.9 Windows는 올리지 않고 0.2.10으로 건너뛴다.
- 같은 커밋에서 [설치 가이드](DOWNLOAD_GUIDE.md)의 Windows 링크·크기·SHA-256과 "Windows용 0.2.10은 준비 중" 문장, README의 Windows 링크를 0.2.10으로 바꾼다. 0.2.7 파일을 지우면 지금 링크가 끊기기 때문이다. 포스터의 설치 QR이 설치 가이드를 가리킨다.
- 커밋 메시지와 [인계 문서](FRONTEND_KIRO_NATIVE_HANDOFF.md)의 Windows 확인 절에 결과(9~21과 질문 답)를 남긴다.

## 막히면

[0.2.9 인계의 "막히면"](FRONTEND_HANDOFF_0.2.9.md#4-막히면)과 같다. 0.2.10에서 Core가 뜨지 않으면 알림의 오류 코드를 함께 알려 주세요. 관리 Node 사본 문제(`RUNTIME_CACHE_CORRUPT` 등)일 수 있다. 백신이 `vibe-helper-core.exe`를 막았다면 그 알림 문구도 알려 주세요.
