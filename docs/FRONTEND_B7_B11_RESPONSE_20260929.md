# 프론트 B7~B11 백엔드 답변 — 2026-09-29

대상: [프론트 보고서 B7~B11](https://github.com/Hello-KU-tty/program/blob/27754559fc38a61a04551a1fd8d40b175c8106a2/BACKEND_LIVE_TEST_ISSUES_20260928.md).
적용 소스: 이 문서를 포함하는 `codex/windows-extension-runtime-20260923` 커밋. [이전 B6 답변](FRONTEND_LIVE_TEST_RESPONSE_20260929.md)의 수정도 포함한다.

## 전달 요약

| 항목 | 이번 반영 | 남은 확인 |
| --- | --- | --- |
| B7 | MCP bridge 시작·Core 연결·IDE 초기화·첫 tools/list의 고정 진단, opening 실패 시 observer 정리 기록, 다음 명시적 요청의 새 session 회귀 | Kiro 내부 MCP pool 초기화 실패 원인과 Windows 실제 재발 여부는 미확정. 자동 창 종료·gate 완화는 하지 않음 |
| B8 | lockfile 거절 상세 코드, timeout 형식 안내, 빈 검증/NOT_RUN 완료 거절 | 보고 당시 입력값이 없어 어떤 config/timeout이 원인이었는지 단정 불가. 실제 Builder 재시도 필요 |
| B9 | SDK tool 분류 fallback, 부분 activity 갱신의 분류 유지, 파일 없음 코드 | frontend는 새 SDK로 갱신하고 파일 없음 문구 연결. 모르는 오류는 일반 실패 유지 |
| B10 | 개발·생성 앱 pnpm **11.13.1** exact pin, 공식 archive SHA-512, 다운로드/압축 해제/캐시 검증 갱신 | Windows에서 새 kit/VSIX 생성·설치·재실측 필요. 이번 전달은 소스이며 ZIP 제공이 아님 |
| B11 | Builder prompt **1.3.11**, 사용자 언어·한국어 기본·내부 규칙 인용 방지, fixture와 버전 연결 | 실제 Kiro 출력의 언어 품질은 미실측. 기계적 fixture PASS와 구분 |

새 HTTP endpoint, SDK 호출 메서드, DB migration은 없다. 기존 protocol 1을 유지한다. frontend 저장소는 이번 작업에서 수정하지 않았다.

## B10 — 먼저 도구와 kit 갱신

원인은 frontend의 설치 방식이 아니라 backend의 폐기된 pin이었다. pnpm 공식 소스는 `11.12.0`과 `11.13.0`을 `BROKEN_RELEASES`로 차단하고, npm metadata는 `11.13.1` 이상을 안내한다. 이번에는 major 변경 없이 최소 정상 버전 `11.13.1`로 맞췄다. [공식 차단 근거](https://github.com/pnpm/pnpm/blob/main/pnpm11/engine/pm/commands/src/self-updater/installPnpm.ts), [11.13.1 배포 metadata](https://registry.npmjs.org/pnpm/11.13.1).

- Node는 **24.19.0** 그대로다. `packageManager`, `engines.pnpm`, preflight, AGENTS와 개발 인계 문서를 동기화했다. frozen lockfile과 lifecycle 허용 범위를 유지한다.
- 생성 앱용 `PROJECT_PNPM`도 같은 버전이다. 공식 archive 8,692,720 bytes / 891 files의 SHA-512를 고정했다. 긴 파일명을 위한 bounded GNU `L` metadata만 허용하며 symlink/hardlink/PAX·경로 이탈은 계속 거절한다. 압축 해제 상한은 48MiB다.
- 실제 private acquisition, offline cache 재사용, 변경된 archive의 hash 거절, script/pnpmfile 실행 없이 lock 생성까지 검증했다. 기존 사용자 도구와 전역 PATH는 변경하지 않았다.
- 기존 생성 앱이 `packageManager: "pnpm@11.12.0"`을 선언했다면 새 보호 실행기는 그 설정을 허용하지 않는다. Builder가 생성 앱의 선언을 `pnpm@11.13.1`로 맞추고 아래 lock 갱신/설치를 수행해야 한다. 사용자 소스나 기존 lock을 자동 삭제하지 않는다.

Windows 개발자는 설치된 pnpm의 공식 version 전환 절차로 `11.13.1`을 준비한 뒤 다음을 실행한다. `11.13.0`은 사용하지 않는다. 제품 사용자의 별도 Node/pnpm 설치 요구로 바뀐 것은 아니다.

```sh
node --version
pnpm --version
# 각각 v24.19.0 / 11.13.1인지 확인
pnpm install --frozen-lockfile
pnpm check
pnpm frontend:handoff
```

kit 적용/VSIX 조립은 [Windows quickstart](FRONTEND_WINDOWS_QUICKSTART.md)와 [update kit 절차](FRONTEND_HANDOFF_20260927.md)를 따른다. 기존 kit의 파일명/kitVersion만으로 최신 소스라고 판단하지 말고 **manifest의 backendHead와 실제 파일 hash**를 확인한다. 오래된 vendor bundle에 frontend만 reload하면 반영되지 않는다. 새 Windows ZIP/receipt가 제공됐다고 주장하지 않는다.

## B7 — MCP 초기화 진단과 복구 경계

bridge는 stdout의 MCP JSON-RPC를 건드리지 않고 stderr에 내용 없는 고정 코드만 기록한다. Kiro의 해당 MCP server 로그에서 같은 실패 시각의 마지막 단계를 확인할 수 있다.

| 마지막 진단 | 확인된 단계 |
| --- | --- |
| `BRIDGE_STAGE_PROCESS_STARTED` | bridge 모듈 시작. 없음은 시작 **미관측**이며 spawn 실패를 단정할 수 없음(import 실패·로그 수집 문제 포함) |
| `BRIDGE_STAGE_BINDING_VALIDATED` | private descriptor, 역할·workspace·loopback 범위 검증 완료 |
| `BRIDGE_STAGE_CORE_CONNECTING` | Core HTTP MCP 연결 시도 중 |
| `BRIDGE_STAGE_CORE_CONNECTED` | Core MCP 초기화 완료 |
| `BRIDGE_STAGE_CORE_TOOLS_LISTED` / `BRIDGE_STAGE_CORE_CATALOG_VERIFIED` | Core 목록 수신 / 발급된 정확한 목록과 일치 |
| `BRIDGE_STAGE_STDIO_READY` | IDE의 stdio 요청을 받을 준비. IDE 접속 완료를 뜻하지 않음 |
| `BRIDGE_STAGE_STDIO_INITIALIZED` | IDE의 `notifications/initialized` 수신 |
| `BRIDGE_STAGE_STDIO_TOOLS_LISTED` | IDE의 첫 `tools/list` 처리 |
| `BRIDGE_FAILED_AFTER_<단계>` | bridge 시작 예외가 발생한 마지막 단계. 뒤의 기존 안전한 오류 코드와 함께 확인 |

각 단계는 process당 한 번만 기록한다. token, descriptor 내용, URL, 개인 경로, tool argument는 기록하지 않는다. bridge의 tools/list 성공과 **Agent catalog에서 MCP가 실제로 보이는 것**도 별개다. 마지막 단계까지 도달했어도 catalog가 비어 있으면 기존 `NATIVE_ROLE_CATALOG_UNVERIFIED`로 모델 호출 전에 중단한다.

opening 실패 시 `OPENING_OBSERVER_CLOSED_HELPER` 같은 worker 진단을 추가했다. 이미 생성된 session에는 cancel을 요청하고 observer 연결을 닫는다. 다음 명시적 요청은 새로운 `session/new`로 시작한다. 이 기록은 Kiro 내부 session/MCP process 종료 확인이 아니다. 같은 실패 요청을 자동으로 재전송하지 않는다.

**자동 창 재시작은 적용하지 않았다.** Kiro 공유 MCP pool의 안전한 dispose/recreate 근거가 없고 다른 작업을 중단할 수 있기 때문이다. 재발하면 먼저 active run이 없는지 확인하고 전용 Helper 창만 사용자가 닫았다가 다음 명시적 Helper 요청으로 다시 연다. Builder 창·다른 Project 창·공유 PID를 일괄 종료하지 않는다. Builder 종료 직후 실패했다는 시간 관계만으로 Builder가 원인이라고 확정하지 않는다.

## B8 — 허용 shell 형식과 완료 판정

각 명령은 별도의 foreground tool call로 실행한다. Windows 보호 실행기에서는 다음 형태를 사용한다.

```json
{
  "command": ".\\.kiro\\vibe-tools.cmd pnpm run build",
  "cwd": ".",
  "timeout": 120000,
  "run_in_background": false
}
```

- `timeout`: **밀리초**, 생략/null 또는 1~300000 정수. 문자열·0·음수·소수·상한 초과는 거절한다. 설치된 Kiro shell schema의 milliseconds 설명과 대조했다. 시간 초과 시 partial output은 성공 증거가 아니다.
- `ignoreWarning`: 생략/null/false. `warning`: 생략/null. `run_in_background`: 생략/false. 명령 연결, 다른 cwd와 검토되지 않은 필드는 허용하지 않는다. prompt는 가장 단순한 명시적 false/정수 입력을 안내한다.
- 최초/변경 후 lock 준비: `.\.kiro\vibe-tools.cmd pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile`.
- 실제 설치: `.\.kiro\vibe-tools.cmd pnpm install --frozen-lockfile`.
- 각각 별도 실행: `.\.kiro\vibe-tools.cmd pnpm run build`, `pnpm test`, `pnpm run typecheck`, `pnpm run smoke` (뒤 세 명령에도 같은 보호 실행기 접두어 적용).
- macOS/CLI native에서는 Windows 접두어를 붙이지 않는다. 기존의 더 좁은 workspace 설정 부재/상위 설정 격리 조건을 유지한다.

lock 준비에는 정규 단일-link `package.json`과 안전한 lock이 필요하다. `.npmrc`, `.pnpmfile.cjs/.mjs`는 거절한다. Windows의 `pnpm-workspace.yaml`은 현재 package `.`와 esbuild/better-sqlite3에 한정된 기존 allowlist 형태만 허용한다. lock 준비는 dependency 설치·테스트 성공이 아니다.

기존 `PERMISSION_GUARD_BUILDER_SHELL_LOCKFILE_PREPARE_DENIED` 앞에 `LOCKFILE_MANIFEST_MISSING`, `LOCKFILE_MANIFEST_UNSAFE`, `LOCKFILE_PACKAGE_CONFIG_PRESENT`, `LOCKFILE_WORKSPACE_CONFIG_REQUIRES_LAUNCHER`, `LOCKFILE_WORKSPACE_CONFIG_UNSAFE`, `LOCKFILE_WORKSPACE_CONFIG_DENIED`, `LOCKFILE_FILE_UNSAFE` 중 상세 이유를 기록한다. `TIMEOUT_INVALID` 앞에는 `TIMEOUT_TYPE_INVALID`, `TIMEOUT_INTEGER_REQUIRED`, `TIMEOUT_BELOW_MINIMUM`, `TIMEOUT_ABOVE_MAXIMUM`을 기록한다. 모두 같은 worker prefix를 사용하며 입력 원문은 남기지 않는다.

Core는 기존 FAILED 거절에 더해 **빈 `validationResults` 또는 NOT_RUN이 있으면 `TASK_VALIDATION_NOT_RUN`으로 완료를 거절**한다. report/Task 완료 상태는 저장하지 않는 것을 실제 Application/SQLite 회귀로 확인했다. Agent가 제출한 PASSED는 독립적인 실행 receipt가 아니므로 실제 test 실행까지 입증했다고 확대하지 않는다. `SUCCEEDED` run 역시 Task 완료를 뜻하지 않으며 기존 `classifyBuilderTurn()`을 계속 사용한다.

## B9 — frontend 적용

- `projectRunEvent()`의 TOOL `tool`은 이제 null 대신 알려진 tool명, `core`, protocol 분류(`read/search/write/shell/think/fetch`), `user_input`, 기존 CLI title 또는 최후의 **`unknown`**을 반환한다. 지원하지 않는 tool을 읽기 등으로 추정하지 않는다. 표시용 fallback은 권한 판단에 쓰지 않는다.
- 같은 toolCallId의 부분 갱신에서 입력과 user-input 분류를 유지한다. 다른 호출의 내용을 섞지 않는다.
- 실패한 native read의 구조화된 ENOENT 또는 제한된 오류 prefix(`ENOENT`, `File not found:`)만 **`errorCode: "NATIVE_FILE_NOT_FOUND"`**로 보낸다. 임의 출력의 언급·정상 file content·shell 실패는 이 코드로 바꾸지 않는다. `status`는 **FAILED 유지**다.
- frontend 권장 문구: `파일이 아직 없습니다` / `프로젝트 구성을 확인하는 중 해당 파일을 찾지 못했습니다`. 파일이 불필요한 탐색인지 필수 파일 누락인지는 이 코드만으로 판단하지 않는다. 다른 실패는 기존 실패 안내를 유지한다.

## B11 — Builder 서술 언어

canonical Builder prompt와 adapter/CLI/native/package의 version 연결을 **1.3.11**로 올렸다. 사용자 언어, 명시적 언어 요청 우선, 불명확할 때 한국어 기본을 적용한다. 진행 TEXT뿐 아니라 사용자에게 표시되는 Context·Decision·Report의 서술도 같은 정책이다. 영어 코드·기술명이 섞였다고 전체 설명을 영어로 바꾸지 않도록 했다.

“규칙 몇 번에 따라”, 도구 식별자로 진행을 설명하는 대신 지금 할 일·선택 이유·관찰 결과를 설명하도록 했다. 실제 ToolCall, schema 식별자, 파일명, 명령과 오류 코드는 그대로 유지한다. frontend의 사후 번역·TEXT 숨김은 필요하지 않다.

새 fixture는 한국어/영어, 명시적 영어 요청, Personal Need 유무, 내부 규칙 인용 금지와 명령 원문 보존을 검토 대상으로 고정한다. **현재 검증은 prompt/version 연결의 기계적 회귀이며 실제 모델 응답 품질 PASS가 아니다.** [평가 기록](../tests/eval/results/builder-agent-v1.3.11.md).

## 검증 결과와 프론트 회신 요청

검증 환경: macOS arm64, Node 24.19.0, pnpm 11.13.1. 실제 모델 호출 0회. Windows 실제 kit 생성/설치는 미실행.

- frozen install, 공식 archive SHA-512/891 files, 실제 managed acquisition/offline 재사용/무스크립트 lock 생성: PASS.
- `pnpm check`의 E2E 이전 단계: format/lint/typecheck/db, unit 171 + skip3, integration 375 + skip8, eval42, Campus3, build, smoke6 PASS. 기존 lint warning2/info16 유지.
- E2E는 sandbox의 Chromium Mach-port 실행 거절을 별도 환경 실패로 기록했고, 같은 테스트를 허용된 실행 환경·4273 포트에서 재실행해 **12 PASS**(53.9초)했다. 기존 사용자 서버를 보존했다.
- `pnpm panel:build`, `pnpm client:build` PASS. 확장 CJS와 bridge lifecycle 검사 합계 **169 PASS + 기존 skip2**.

새 kit 적용 뒤 backendHead/VSIX 버전, pnpm 버전, B7 마지막 bridge 단계와 worker/terminal 오류 코드, B8 상세 guard 코드·Task 완료 여부, B9 표시와 B11 한국어 진행 설명 여부를 회신해 주면 된다. token·개인 경로·대화 원문은 보내지 않는다. credits/overage를 자동 변경하거나 이 테스트를 위해 다른 계정으로 바꾸지 않는다.
