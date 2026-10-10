# 9월 29일 프론트 B6 후속 답변

> **최신 추가 답변:** [B7~B11 보완·pnpm 11.13.1·프론트 적용 안내](FRONTEND_B7_B11_RESPONSE_20260929.md). 아래 pnpm 11.12.0 검증 수치는 B6 당시 기록이며 현재 개발 pin은 11.13.1이다.

대상: [프론트 B6 추가 커밋](https://github.com/Hello-KU-tty/program/commit/031ae154b9172701caa1d3b79fdb404f0f5ae52c).
수정 backend: [`a4a6632`](https://github.com/Hello-KU-tty/core/commit/a4a6632), 브랜치 `codex/windows-extension-runtime-20260923` (T19-F7).
아래는 소스 수정과 macOS 모델 없는 검증이며, Windows 새 kit/VSIX 설치·실제 두 창 검증 완료 기록이 아니다.

## 전달 요약과 프론트 적용 항목

B6의 같은 폴더 다중 창 거절을 재현했고, 현재 worker의 창을 선택하도록 백엔드 소스를 수정했다. 기존 B1~B5의 반영/잔여 항목은 [9월 28일 답변](FRONTEND_LIVE_TEST_RESPONSE_20260928.md)과 [백엔드 변경 내역](BACKEND_CHANGES_20260928.md)을 참고한다. 이 문서는 새로 추가된 B6의 답변이다.

1. **적용 대상:** 위 수정 커밋을 포함한 backend로 Windows kit/VSIX를 새로 생성·반영해야 한다. 이번 전달물은 수정 소스와 검증 결과이며 새 Windows 설치물은 아직 제공하지 않았다. 기존 `20260927` kit를 그대로 쓰면 B6 수정이 적용되지 않는다. 기존 [Windows 재개 안내](WINDOWS_RESUME_20260928.md)의 빌드·인계 절차를 따른다.
2. **프론트 코드:** SDK/HTTP 메서드 변경은 필요 없다. 아래 표의 terminal `run.errorCode`에 안내 문구를 연결한다. 새 worker 진단 두 개는 진행/복구 안내이며 성공 판정에 사용하지 않는다.
3. **실패 복구:** 같은 생성 폴더를 연 창 중 사용할 창 하나를 남기고, 기존 Project의 PREVIEW를 명시적으로 재시도한다. 다른 Project를 새로 만들거나 History 진입만으로 재실행할 필요는 없다. 자세한 재시도 계약은 [이전 답변의 B3](FRONTEND_LIVE_TEST_RESPONSE_20260928.md#b3-preview만-같은-project에서-명시적으로-다시-실행)를 따른다.
4. **확인 회신:** 새 kit/VSIX의 버전·backend 커밋, 두 창 조건에서의 terminal run 상태/오류 코드, preview 저장 여부를 알려 주면 된다. 실패 시 worker 상태와 창 ID 일치 여부를 함께 남기되 token·개인 경로·대화 원문은 보내지 않는다.

PR #8 적용과 B6 수정 kit 반영은 각각 필요 여부를 확인해야 한다. 저장된 후보 복원과 native 연결 실패는 다른 단계이며, 이번 소스 검증을 Windows 실제 성공으로 표시하지 않았다.

## 수정

- 같은 canonical 폴더를 연 endpoint가 여러 개여도 **현재 worker가 속한 창 ID**와 일치하는 endpoint 하나를 선택한다. registry 순서에 의존하지 않는다. 다른 창에 접속한 뒤 세션을 만드는 방식은 사용하지 않는다.
- 창 ID는 Kiro가 확장에 제공하는 `ExtensionContext.logUri`의 `window<id>/exthost/<extension-id>` 구조에서 구한다. local URI, 양의 safe integer, 현재 확장 ID를 확인한다. 경로·token은 UI로 전달하거나 새 로그에 기록하지 않는다. 로그 내용·사용자 환경변수·job payload는 ID source가 아니다.
- ID가 있는데 현재 창 endpoint가 아직 등록되지 않았으면 기존 startup 예산 안에서 기다린다(500ms 간격, 일반 10회/Windows 60회). 다른 창만 남아 있어도 fallback하지 않는다. 구조를 인식하지 못해 ID가 없으면 종전의 단일 workspace endpoint 조건을 유지한다.
- Discovery/Builder/Windows Helper·Analyst와 Mac protected Helper·Analyst/barrier 모두 같은 선택 규칙을 사용한다. 기존 설치 source, Trust, 역할·권한·workspace 검사는 유지한다.
- 생성 폴더로 전환하기 전에 registry를 읽는다. 그 폴더의 유효한 endpoint가 이미 있으면 현재 창을 보존하고 기존 창 worker가 같은 Core의 pending job을 처리하도록 기다린다. 해당 창이 없어지면 다음 polling에서 정상 전환할 수 있다. registry 조회 실패를 창 0개로 취급하지 않는다.

## 프론트 오류/상태 안내

| 값 | 의미와 안내 |
| --- | --- |
| run `NATIVE_ENDPOINT_AMBIGUOUS` | 현재 창을 유일하게 식별할 수 없거나 같은 ID의 endpoint가 중복이다. **“같은 생성 폴더를 연 Kiro 창을 하나만 남기고 다시 시도해 주세요.”** 관련 없는 작업 창·별도 Helper 창을 모두 닫으라는 뜻은 아니다. |
| run `NATIVE_ENDPOINT_MISSING` | startup 예산 동안 현재 창/폴더의 endpoint가 준비되지 않았다. 해당 창의 확장 준비·Trust를 확인하고 같은 Project에서 명시적으로 재시도한다. Trust 문제라고 자동 단정하지 않는다. |
| run `NATIVE_ENDPOINT_INVALID` / `NATIVE_WINDOW_ID_INVALID` | endpoint 또는 host identity가 유효하지 않다. 지원 설치 조합과 확장 reload를 확인한다. 다른 창으로 자동 우회하지 않는다. |
| worker `WORKSPACE_WINDOW_AVAILABLE` | 대상 생성 폴더의 기존 창을 찾았다. 그 창의 패널·Core/worker 준비와 Workspace Trust를 확인한다. 이 상태만으로 job claim이나 모델 성공을 뜻하지 않는다. |
| worker `WORKSPACE_ENDPOINTS_UNAVAILABLE` | 창 registry를 읽지 못했다. 확장 준비/reload 후 재시도하며 현재 폴더를 바꾸지 않는다. |

기존 worker `AGENT_FAILED_<code>` → relay completion → Core terminal `run.errorCode`와 SDK `watchRun` 경로는 그대로 사용한다. `AGENT_SESSION_CLOSED_*`는 성공 판정이 아니다. 프론트가 오류 문구를 표시할 때 terminal run의 `status/errorCode`를 사용한다. 새 SDK 메서드/HTTP protocol/DB migration은 없다.

기존 대상 창의 endpoint 존재가 **그 창의 이 제품 worker 연결까지 보장하지는 않는다.** 다른 profile·확장 비활성·Trust 대기인 경우 기존 창의 패널을 확인해야 한다. 다른 창의 확장을 자동 활성화하거나 사용자 동의 없이 Trust를 바꾸지 않는다. pending job이 만료되면 같은 Project/Session의 명시적 PREVIEW 재시도 경로를 사용한다.

PR #8은 저장된 후보 복원이며 이번 native 연결 전 실패와 별개다. Core 재시작 뒤 run 오류가 사라지는 B3는 기존 transient run 계약의 한계로 남긴다. History 조회만으로 실패한 모델 요청을 자동 재전송하지 않는다.

## 창 identity의 source 근거

macOS 설치 Kiro 1.0.437 / 내장 Agent 1.0.794, IDE commit `5349479558af37fecbfcdb58c199ee59d86d4dd3`의 설치 파일을 읽어 확인했다. 사용자 창·설정·로그 내용은 변경하거나 읽지 않았다.

| 설치 파일 (`Contents/Resources/app` 기준) | SHA-256 |
| --- | --- |
| `out/vs/workbench/workbench.desktop.main.js` | `8ba4a424b6aeda52644358e6a520f18b4eacf2496f085508edc9169e934cee0b` |
| `out/vs/workbench/api/node/extensionHostProcess.js` | `9a11ae42c40931328f16491f406f2e7e53abee0ff7b00a8ad6a0c2731e3956d0` |

workbench의 `windowLogsPath`는 `logsHome/window${this.d.windowId}`, `extHostLogsPath`는 그 아래 `exthost`다. extension host 초기화의 `logsLocation`은 이 경로이고 `ExtensionContext.logUri` getter는 `logsLocation`과 현재 `identifier.value`를 결합한다. `kiro.agentRegistry.registerAgentEndpoint`도 native host의 `windowId`로 등록한다. 이 세 연결이 현재 창 ID 판별의 근거다. source layout을 범용 VS Code 공개 window ID API로 주장하지 않는다.

## 검증

2026-09-29 macOS arm64 / Node 24.19.0 / pnpm 11.12.0에서 다음을 통과했다. 실제 모델 호출은 0회다.

| 검사 | 결과 |
| --- | --- |
| `pnpm check`의 format/lint/typecheck/migration/unit/integration/eval/Campus Drop/build/smoke | PASS. unit 156 + 기존 skip 3, integration 365 + 기존 skip 8, eval 41, Campus Drop 3, smoke 6. 기존 lint warning 2/info 16은 유지. |
| 별도 포트의 `pnpm test:e2e` | Chromium 12 PASS. |
| `pnpm panel:build` | PASS. |
| 확장 CJS 전체 검사 | 167 PASS, 기존 skip 2. |
| 최신 panel build 후 설치 경로 이동/라우팅 검사 | 5 PASS. 저장소 밖으로 옮긴 새 번들 activation 포함. |

첫 `pnpm check`는 기존 사용자 서버가 사용하는 4173 포트에서 E2E 시작 전에 중단됐다. 기존 서버를 보존하고 `VIBE_E2E_FRONTEND_PORT=4273`으로 분리했다. sandbox의 macOS Chromium Mach-port 거절로 브라우저가 실행되지 않은 시도도 별도로 남기며, 이후 허용된 실행 환경에서 동일 E2E 12개를 통과했다. 제품 코드나 검증 기준을 바꾸어 우회하지 않았다.

```sh
pnpm check
VIBE_E2E_FRONTEND_PORT=4273 pnpm test:e2e
pnpm panel:build
node --test examples/kiro-panel/test/*.test.cjs
```

- Node 24.19.0 / pnpm 11.12.0, macOS arm64에서 실행한다.
- endpoint 두 창의 순서 반전·다른 폴더·own ID 부재/중복/invalid·늦은 등록·연결 전 거절을 검사한다.
- worker context→일반 role/protected H/barrier의 ID 전달, 기존 대상 창 1개/2개·창 소멸·foreign 창·registry 부재를 검사한다.
- 실제 인증 HTTP/SSE/SQLite 경로에서 B6/MISSING의 오류 보존, 권한 즉시 회수, 동일 Project 명시적 재시도, restore의 모델 재호출 0을 검사한다.

## Windows 인계 후 확인

수정된 native worker/host를 포함하는 **새 kit와 VSIX가 필요하다.** 기존 `20260927` vendor bundle에는 이번 수정이 없다. frontend만 reload하거나 PR #8만 적용해서는 갱신되지 않는다.

1. 지원 Windows Kiro 1.1.70/Agent 1.1.158에서 실제 extension context의 구조와 registry window ID가 일치하는지 확인한다. 확인 자료에는 숫자 ID/일치 여부만 남긴다.
2. 같은 생성 폴더를 연 두 창에서 명시적 PREVIEW를 시작한다. job을 claim한 worker와 선택 endpoint ID가 같고 후보가 durable 저장되는지 확인한다.
3. 생성 폴더 창이 이미 열린 상태에서 다른 작업 폴더의 패널로 PREVIEW를 시작한다. 현재 폴더가 유지되고 기존 창이 처리하는지 확인한다.
4. 기존 창의 worker/Trust가 준비되지 않은 경우 상태 안내와 명시적 복구를 확인한다. 오류/취소를 성공으로 표시하지 않는다.
5. 별도 Helper 창·Builder/Helper 역할 분리·확장 reload/업데이트 뒤 동일 경로를 재확인한다.

Windows 실측을 수행하기 전에는 이 플랫폼의 실제 B6 해결 완료로 표시하지 않는다.
