# 본선 Mac 설치물 0.2.1 (Kiro-native) 프론트 인계

본선 방향([PROJECT_BRIEF §0](../PROJECT_BRIEF.md))에 맞춰 Mac 설치물의 host를 Kiro-native로 바꿨다. 0.2.1은 첫 실사용 체험 피드백(K09)을 반영했다. 프론트 담당자가 설치해 패널을 다듬을 수 있는 상태다.

- 설치 파일: [`releases/macos/kiro-native/builder-helper-agent-panel-0.2.1-darwin-arm64.vsix`](../releases/macos/kiro-native/builder-helper-agent-panel-0.2.1-darwin-arm64.vsix) · 41,536,528 bytes · SHA-256 `bea07d49ed29dc4a4435b0c53fe95b9aef4b1d4400fe613cd6a942b537c5d5af` · [receipt](../releases/macos/kiro-native/macos-vsix-receipt.json) · [항목별 hash](../releases/macos/kiro-native/files.json)
- 빌드 출처: backend `4def349`(`finals/kiro-native`), frontend `c2c873c`(`program` 저장소 `finals/trial-feedback` 브랜치, 로컬 commit). 0.2.0(frontend `e65cd7f`)은 Git 이력에 있다.

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
| 지원 Kiro | 1.1.70 고정(설치본 hash 확인) | 버전 고정 없음. 1.2.37에서 확인 |
| Discovery·패널 Helper·Analyst | Kiro IDE 내부 비공개 Agent 연결 | Core가 kiro-cli로 실행 |
| Builder | 패널이 시작하는 IDE 내부 실행 | 학습자의 Kiro 채팅(빈 현재 폴더 또는 생성 폴더) |
| Decision | 패널 카드 | Kiro 채팅에서 번호 선택지로 묻고 자연어 답을 기록. 패널 카드 경로도 남아 있음 |
| 준비 상태 | 1.1.70 확인 + worker 준비 | kiro-cli 설치 + `kiro-cli whoami` 성공 |

## 설치 전 준비

1. Apple Silicon Mac에 Kiro IDE를 `/Applications/Kiro.app`으로 설치하고 로그인한다.
2. Kiro CLI를 설치한다(kiro.dev의 Kiro CLI 설치 안내). host는 `~/.local/bin/kiro-cli`, 그다음 `/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli` 순서로 찾는다. 버전은 2.21.1 이상 2.x여야 한다(확인: 2.28.0).
3. 터미널에서 `kiro-cli login`. Builder ID 무료 계정으로 동작을 확인했다. IDE 로그인과 CLI 로그인은 따로다.
4. 예선 0.1.x를 쓰던 Kiro라면 모든 Kiro 창을 닫았다가 연다. 이전 Core가 끝나기 전에는 `CORE_UPDATE_WAITING_FOR_OWNER_EXIT`로 기다린다. 기존 History(`core-data`)는 그대로 읽힌다.

## 설치와 사용 흐름

1. Kiro Extensions(`Cmd+Shift+X`) → `…` → **Install from VSIX…**에서 위 파일을 고르고 다시 로드한다.
2. **Agent Panel**에서 학습 목표를 넣고 Discovery → 후보 선택 → Learning Spec 확정까지 기존 화면대로 진행한다.
3. 명령 팔레트 **Vibe Helper: Open Project in Kiro Chat** → Project를 고르면 Core가 Project 폴더(빈 현재 폴더 또는 생성 폴더)에 Steering·hook·MCP 설정·Helper 에이전트·Kiro Spec을 쓴다. 현재 폴더면 그대로, 생성 폴더면 새 Kiro 창으로 연다.
4. Kiro 채팅에서 **새 세션(+)**을 열고 만들기 시작한다(hook은 세션 시작 때 적용된다). Agent는 Core MCP 도구로 Task 상태를 읽고, 학습자가 정해야 할 것은 번호 선택지로 묻는다. 학습자가 채팅으로 답하면 Agent가 원문을 인용해 기록하고 Core가 인용을 검증한다.
5. 학습자 발언은 hook으로 Core에 Evidence 원천(USER)으로 쌓인다. Decision이 끝나면 Analyst(kiro-cli, Auto)가 분석하고, Core가 Concept State를 갱신해 `.vibe-helper/learner-profile.md`에 쓴다. 이 요약은 **새 채팅 세션부터** Agent에 반영된다(Steering은 세션 시작 때 고정).
6. Helper는 새 채팅 탭에서 `vibe-helper` 에이전트를 고르거나, 채팅에서 `/vibe-helper 질문`으로 부른다. 답은 Helper Episode로 기록된다.

## 패널에서 다듬을 것

host API 형식은 [`examples/kiro-panel/src/frontend-host.d.cts`](../examples/kiro-panel/src/frontend-host.d.cts)가 기준이다. 프론트의 `vendor/frontend-host` 타입을 이 파일로 갱신한다.

- **준비 상태 표시:** `status.helperMode === 'KIRO_CLI'`. 실패 코드는 다음 두 가지다.
  - `status.errorCode === 'KIRO_CLI_NOT_INSTALLED'`: Core가 시작하지 않으므로 History도 열리지 않는다. 설치를 안내한다.
  - `status.nativeErrorCode === 'KIRO_CLI_LOGIN_REQUIRED'`: History는 읽히고 Agent 실행은 막힌다. `kiro-cli login`을 안내하고, 로그인 뒤 **Retry Core Connection**을 실행하게 한다.
- **Builder 탭:** 패널에서 Builder run을 시작하면 Core가 `BUILDER_RUNS_IN_HOST_CHAT`로 거절한다. 시작 버튼 자리에 "Kiro 채팅에서 열기"를 두고 `host.openProjectInKiro(projectId)`를 부른다. 결과의 `folder`는 `REGISTERED`(현재 폴더), `GENERATED`(생성 폴더), `CANCELLED`(학습자가 새 창을 거절)다. Spec 확정 전이거나 Task가 없으면 `KIRO_BIND_TASK_NOT_READY`다. 확인 창(도구 허용, 새 창 열기)은 host가 띄운다.
- **Decision 카드:** 기본 경로는 채팅이다. 패널 카드로 확정해도 Core는 받지만 채팅 Agent는 다음 턴에 상태를 다시 읽어야 안다. 카드는 열린 Decision과 확정 결과를 보여 주는 쪽을 권장한다.
- **native worker 의존 제거:** `host.worker`는 남아 있지만 상태와 질문이 없다(`getStatus()`는 `undefined`, `listUserInputs()`는 빈 배열). native 질문 UI가 이것을 기다리지 않게 한다.
- **Evidence·Concept State 표시:** 기존 History/Evidence 조회 그대로다. 채팅 발언은 `USER_MESSAGE`, 채팅 확정 Decision은 `DecisionResolution.chatSource`(`mappedBy: 'BUILDER'`)로 구분된다.

## 알려진 제한

- 확장을 업데이트하면 기존 프로젝트의 hook·MCP 명령이 이전 확장 폴더 경로를 가리킨다. 업데이트 뒤에는 그 프로젝트에서 **Open Project in Kiro Chat**을 다시 실행한다.
- 연결은 Project당 하나다. 다시 연결하면 이전 연결 토큰은 폐기된다.
- 0.2.1의 채팅 단계(같은 창 연결 뒤 hook으로 기록되는지, Steering 0.5.0의 Decision 시점, Helper 탭이 Builder 활동을 쓰는지, 허용 규칙이 승인 창을 없애는지)는 모델 크레딧이 필요해 아직 확인하지 않았다(K09).
- Workspace Trust 화면과 도구 허용 확인 창은 실제 화면으로 보지 않았다. 아래 검증은 격리 프로필에서 trust를 끄고 했다.
- Helper 답 수집은 Kiro 세션 기록 파일(비공개 형식)에 기대며, 못 읽으면 안내 문구로 기록한다.
- Mac 전용이다. Windows에서는 host가 `KIRO_NATIVE_HOST_MAC_ONLY`로 시작하지 않는다.
- Kiro는 자동 업데이트된다. 이번 작업 중에도 1.2.4에서 1.2.37로 바뀌었고, hook 동작은 1.2.37에서 다시 확인했다.

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

backend `finals/kiro-native` checkout에서, Node 24.19.0·pnpm 11.13.1로:

```sh
pnpm install --frozen-lockfile
pnpm panel:pack:macos <frontend checkout 경로>
```

`dist/macos-vsix-*`에 VSIX, receipt와 `files.json`이 생긴다. 프론트 변경을 반영하려면 프론트 checkout을 고친 뒤 같은 명령을 다시 실행한다. `vibeHelper.openInKiro` 명령 등록은 패키징 단계에서 manifest에 더해지므로 프론트 `package.json`에 넣지 않아도 된다.
