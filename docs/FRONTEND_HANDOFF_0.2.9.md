# 0.2.9 프론트 인계 (2026-10-13)

backend가 사용자 직접 체험의 후속(TASKS K17)을 마치고 Mac 0.2.9를 만들어 실제 Kiro에서 확인했다. frontend에 부탁할 일은 아래 세 가지다. 이 문서에는 이번에 할 일만 모았다. 빌드 절차와 지난 기록은 [Kiro-native 인계](FRONTEND_KIRO_NATIVE_HANDOFF.md)에 있다.

| 할 일 | 어디서 | 끝난 기준 |
| --- | --- | --- |
| 1. 패널 브랜치 합치기 | `Hello-KU-tty/program`의 `feat/k17-panel`을 `main`으로 | `main`에서 typecheck와 `npm test` 통과 |
| 2. Windows 0.2.9 빌드와 확인 | Windows 11 x64, Kiro 최신판 | 확인 1~17 |
| 3. 올리기와 링크 바꾸기 | `Hello-KU-tty/core`의 `main` | VSIX·receipt·files, 설치 가이드, README를 한 커밋에 |

- **Mac 0.2.9:** [`builder-helper-agent-panel-0.2.9-darwin-arm64.vsix`](../releases/macos/kiro-native/builder-helper-agent-panel-0.2.9-darwin-arm64.vsix) · 41,607,751 bytes · SHA-256 `922d73b7afcfb39f144c257c41ae5d95ad7fd63cbfc8fd45e55771c7e3603239`
- **빌드 출처:** backend `main` `3721a76`, frontend `feat/k17-panel` `4906b36`. 그 뒤 backend `main` 커밋은 문서만 바꿨으므로 최신 `main`으로 빌드해도 된다.
- **0.2.9에서 바뀐 동작 전체:** [0.2.9에서 바뀐 점](FRONTEND_KIRO_NATIVE_HANDOFF.md#029에서-바뀐-점). Mac 실측 결과: [0.2.9 확인](FRONTEND_KIRO_NATIVE_HANDOFF.md#029-확인-2026-10-12-mac).

## 1. `feat/k17-panel` 합치기

- 브랜치: <https://github.com/Hello-KU-tty/program/tree/feat/k17-panel>
- PR 열기: <https://github.com/Hello-KU-tty/program/compare/main...feat/k17-panel>
- program `main`(`88275f6`) 위의 커밋 5개다. `feat/next-move-card`와 `feat/reload-required-notice`가 이미 들어 있으니 두 브랜치는 따로 합치지 않아도 된다.

| 커밋 | 내용 |
| --- | --- |
| `9ef88d6` | frontend가 만든 다시 로드 안내(`feat/reload-required-notice`). 신뢰 전에 열린 창이면 다시 로드하라고 알린다 |
| `6a6a557` | "다음 한 걸음" 카드(K15, `feat/next-move-card`). `vendor/frontend-client`를 backend `f83560a`의 `pnpm client:build` 결과로 교체 |
| `202f64f` | K17 패널: 빌더 탭 정리, Discovery·Spec 남은 시간, 하단 패널 이동 제거 |
| `b4b8831` | 바꾼 결정 때문에 완료한 Task가 "결정이 있어요"로 보이던 문제 수정(실측에서 발견) |
| `4906b36` | `feat/reload-required-notice`를 합친 커밋 |

- **충돌 해결(`4906b36`):** `src/core/agent/agent-controller.ts`의 연결 안내 두 곳이 겹쳤다.
  - `RELOAD_REQUIRED` 문구 끝에 "다시 로드하면 Kiro 채팅에 새 세션이 열려요"를 붙였다.
  - 신뢰된 창에서 host가 새 세션을 열면(`freshSession: true`) 새 문구 `REGISTERED_FRESH`를 쓴다.
  - 문구는 자유롭게 다듬어도 된다.
- **backend가 확인한 것:** 합친 결과에서 typecheck와 `npm test` 838개 통과(Mac). 빌더 탭은 webview 미리보기로 1280·420·300px 폭에서 보고, 실제 Kiro(Mac)에서도 봤다.

## 2. 리뷰할 곳

host가 `kiro`가 아닌 예선 패널 경로의 화면과 동작은 바꾸지 않았다.

- **`src/extension.ts`(하단 패널 이동 제거)**
  - `revealAgentPanelOnRight`를 지웠다. Kiro에는 우리 뷰 하나만 옮기는 명령이 없다. 그래서 대체 경로 `workbench.action.movePanelToSecondarySideBar`가 터미널·출력이 든 하단 패널 전체를 Kiro 채팅 자리로 옮겼고, 긴 명령이 돌면 채팅이 터미널에 가려졌다(체험 피드백).
  - 이제 활동 바의 자기 자리에서 focus만 한다(`revealAgentPanel`).
  - 이전 버전에서 올린 설치에는 한 번 "원래 배치로 되돌리기"를 묻는다. 누르면 `workbench.action.resetViewLocations`를 실행한다. 올린 설치인지는 전역 상태에 `vibeHelper.`·`bhlr.` 키가 있는지로 본다. 새 설치에는 묻지 않는다.
  - 테스트: `test/extension-layout.test.ts`.
- **`src/core/agent/agent-controller.ts`, `agent-view-model.ts`(Kiro 채팅 상태 따라가기)**
  - Kiro 채팅의 선택을 패널로 알려 주는 경로가 없다. 그래서 Next Move를 다시 읽을 때마다(생성 중 1.5초, 그 밖 4초) 스냅샷도 조용히 다시 읽는다.
  - 학습 기록(`UI_READ_EVIDENCE_TRACE`, 최대 10개)은 15초마다 읽는다. 실패하면 알림 없이 이전 화면을 둔다.
  - 결정마다 `chosenLabel`(고른 안)과 `replaced`(`replacesDecisionId`로 다음 결정에 대체됨)를 계산한다. 대체된 결정은 숨기고 완료 판정에서도 뺀다.
  - 연결 안내는 `REGISTERED`, `REGISTERED_FRESH`, `GENERATED`, `RELOAD_REQUIRED` 네 가지다.
- **`src/webview/agent/agent-render.ts`, `src/agent-panel-view-provider.ts`(빌더 탭과 CSS)**
  - Kiro-native(`data-host="kiro"`)의 빌더 탭은 채팅에 없는 것만 보인다.
  - 순서: 상태 줄(Kiro 채팅이 기다리는 질문을 `data-waiting`으로 강조) → 이번 작업의 학습 기록(현재 Task의 `USER_UNDERSTANDING`, 학습자 원문 인용) → 다음 한 걸음 → 이번 작업의 결정.
  - 결정은 한 줄씩 접고(`details.agent-decision-compact`) 선택 버튼을 두지 않는다. 선택은 Kiro 채팅에서 한다.
  - 완료 문구에서 report id를 뺐다.
- **Discovery·Spec 남은 시간**
  - 파일: `src/core/flow/flow-progress.ts`(새 파일, 예상 시간과 문구), `flow-controller.ts`(작업별 진행, 이어지는 작업은 남은 시간을 이어 감), `flow-snapshot.ts`, `src/webview/flow/countdown.ts`(새 파일, 1초 tick), `flow-render.ts`.
  - 예상 시간에서 1초씩 줄이고, 넘기면 "예상보다 조금 더 걸리고 있어요"로 바꾼다.
  - 예상값은 실측 기준이다: 첫 후보 30초, 첫 화면 보완하기 2분, 새 후보 45초, Spec 45초.
  - Spec 위쪽 "이걸로 시작" 버튼을 없앴다. 하단 고정 입력란 위에 하나만 남는다.
- **`vendor/frontend-host/index.d.ts`:** backend `main`의 host 타입으로 맞췄다. `openProjectInKiro` 결과는 다음과 같다.
  - `coreTools`가 `permissions`로 바뀌었다(K11, 패널은 쓰지 않음).
  - 선택 필드 `reloadRequired`(0.2.7)와 `freshSession`(K17)이 있다.
- **`vendor/frontend-client`:** `6a6a557`에서 K10~K15 계약으로 바꿨다. K17 계약 변경(`save_choice`의 `"not_mine"`, 채팅 턴의 `interrupted`)은 패널이 쓰지 않아 다시 만들지 않았다.
- **다듬을 거리(선택):** 다음 한 걸음 카드 항목 테두리가 Kiro 어두운 테마에서 거의 안 보인다.

## 3. Windows 0.2.9 빌드·확인·올리기

- **절차:** [Windows에서](FRONTEND_KIRO_NATIVE_HANDOFF.md#windows에서)의 1~4. program은 `feat/k17-panel`을 합친 `main`으로 빌드한다. 버전은 `0.2.9`로 나온다.
- **확인 항목:** [Windows 0.2.9 빌드 요청](FRONTEND_KIRO_NATIVE_HANDOFF.md#windows-029-빌드-요청-frontend)의 1~17.
- **기록 보존:** 0.2.9는 Core DB를 migration 0009로 올리고, 그 뒤에는 0.2.7로 되돌릴 수 없다. 기존 기록을 지키려면 설치 전에 Kiro를 닫고 `%APPDATA%\Kiro\User\globalStorage\vibe-helper.builder-helper-agent-panel\`을 통째로 복사해 둔다.

Windows에서 특히 봐 주세요. 아래는 Mac에서만 실측했거나 Windows가 다르게 동작하는 곳이다.

- **확인 13(새 세션과 Autopilot):** Windows는 신뢰 창이 Kiro 에이전트 초기화 뒤에 뜬다. 그래서 신뢰 → 다시 로드 → 4초쯤 뒤 새 세션이 열리는 늦은 신뢰가 기본 경로다. 새 세션이 열리는지, 첫 턴에서 파일 수정 검토 창 없이 진행되는지 본다. 열리지 않으면 `%USERPROFILE%\.kiro\sessions\` 아래에 새 `sess_*` 폴더가 생겼는지 함께 알려 주세요.
- **확인 15(중단된 턴):** Core가 Kiro 세션 기록(`%USERPROFILE%\.kiro\sessions\<작업 폴더 해시>\sess_*\messages.jsonl`)을 읽는다. Windows 해시 규칙(소문자·슬래시 정규화)은 Helper 답 수집과 같은 코드이고, 이번 경로는 Windows를 흉내 낸 테스트로만 확인했다.
- **확인 16(완료 뒤 브라우저):** Steering은 Windows에서 `Start-Process http://localhost:<port>`로 열게 한다. 미리 승인 목록에 `Start-Process`·`start`의 로컬 주소, `curl.exe`의 로컬 주소가 있다. 이 규칙들은 단위 테스트만 했다.
- **포트 확인 명령:** Mac의 `lsof *`는 미리 승인했지만, Windows의 `netstat`·`Get-NetTCPConnection`은 목록에 없다. 승인 창이 뜨면 명령 원문을 알려 주세요. backend가 목록에 더할지 정한다.
- **0.2.7에서 올린 폴더:** 미리 승인을 골랐던 폴더는 0.2.9 Core가 시작하며 다시 연결할 때 권한 파일(`%USERPROFILE%\.kiro\workspace-roots\<해시>\permissions.yaml`)을 새 목록으로 바꾸고, `.kiro\agents\vibe-helper.json`을 지운다. Autopilot 설정은 승인 방식을 고르는 순간에만 쓴다. 승인 방식은 설치당 한 번만 묻기 때문에, 0.2.7에서 이미 고른 설치는 새 폴더에서도 다시 묻지 않고 Autopilot도 켜지지 않는다. 그런 설치에서 확인 13을 할 때는 먼저 명령 팔레트의 "Vibe Helper: Change Command Approval"에서 미리 승인을 다시 고른다.

**올리기:**

- 확인한 VSIX와 `receipt.json`, `files.json`을 core의 `releases/windows/kiro-native/`에 넣고 0.2.7 파일을 교체한다.
- 같은 커밋에서 [설치 가이드](DOWNLOAD_GUIDE.md)의 Windows 링크·크기·SHA-256과 "Windows용 0.2.9는 준비 중" 문장, README의 Windows 링크를 0.2.9로 바꾼다. 0.2.7 파일을 지우면 지금 링크가 끊기기 때문이다. 포스터의 설치 QR이 설치 가이드를 가리킨다.
- 커밋 메시지와 [인계 문서](FRONTEND_KIRO_NATIVE_HANDOFF.md)의 Windows 확인 절에 1~17 결과를 남긴다.

## 4. 막히면

- backend 코드의 Windows 문제는 지금처럼 core `main`으로 PR해도 된다. `pnpm test:unit`, `pnpm test:integration`, `node --test examples/kiro-panel/test/*.test.cjs`를 돌린다.
- 직접 고치기 어려우면 다음을 남겨 주세요.
  - 확인 번호와 화면의 오류 코드
  - Kiro 버전(Help → About)과 `kiro-cli --version`
  - Kiro Output 패널 `Kiro Logs`·`Kiro - MCP Logs`에서 `vibe-helper`가 들어간 줄
- 토큰·계정 정보와 대화 원문은 붙이지 않는다.
