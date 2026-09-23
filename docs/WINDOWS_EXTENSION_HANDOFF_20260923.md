# Windows 확장 설치·런타임 후속 인계

> 작성: 2026-09-23 KST. 사용자와 합의한 요구와 구현 방향을 기록한다. 이번 인계는 문서 작업이며 Windows 실행·패키징·다운로드 기능은 아직 구현/검증되지 않았다.
> 작업 브랜치: `codex/windows-extension-runtime-20260923`. 분기점: `codex/kiro-native-recovery-20260913`의 `21674e8`; native 구현 baseline: `445497b`.
> 다음 작업은 [TASKS.md](TASKS.md)의 T19-W1이다. 상위 요구는 [PROJECT_BRIEF.md](../PROJECT_BRIEF.md) → [SPEC.md](SPEC.md) → [ARCHITECTURE.md](ARCHITECTURE.md) → [DECISIONS.md](DECISIONS.md) 순서로 읽는다.

## 1. 사용자가 확정한 목표

1. 실사용자는 대부분 Windows 사용자다. Windows native 실행이 제품의 필수 완료 조건이다.
2. Kiro IDE 설치·본인 로그인 후 제품 확장을 설치하고 패널을 열면 Core backend까지 자동으로 작동해야 한다.
3. 사용자가 repository를 clone하거나 Node/pnpm을 별도 설치하고, backend를 터미널에서 켜거나 `connection.json` 경로를 입력하게 하지 않는다.
4. 이미 사용할 수 있는 runtime을 재사용하고 필요한 도구만 자동 준비한다. 불필요한 버전 exact pin과 모든 runtime을 포함한 큰 패키지를 제품 사용자에게 요구하지 않는다.
5. native Kiro Agent 경로를 계속 개발한다. 기존 CLI/Crew source는 보존하지만 native 실패를 CLI·Mock 성공으로 바꾸지 않는다.

이 목표는 자동 다운로드가 필요 없는 offline 최초 실행 보장이 아니다. Kiro 로그인·모델 사용, 필요한 runtime과 생성 앱 의존성 다운로드에는 network가 필요할 수 있다. 사용자 데이터의 새로운 외부 전송이나 hosted 배포 승인은 포함하지 않는다.

## 2. 브랜치와 Windows에서 이어받는 방법

`main`의 당시 HEAD `c8b3425`에는 native recovery의 네 commit이 없다. recovery branch를 그대로 변경하는 대신 그 최신 HEAD `21674e8`에서 Windows branch를 만들어 Mac 실측 기준을 보존한다. 이 branch는 frontend repository `Hello-KU-tty/program`이 아니라 backend repository `Hello-KU-tty/core`의 후속 작업이다.

이번 요청은 local commit까지이며 push/remote 변경/PR/merge는 포함하지 않는다. 아래 명령은 **해당 branch가 별도로 push된 뒤** Windows의 clean 개발 checkout에서 사용한다. remote에 없으면 전달 미완료이며 `main`에서 작업을 재시작하지 않는다. 이미 local branch가 있으면 새로 만들지 말고 기존 상태부터 확인한다.

```powershell
git clone https://github.com/Hello-KU-tty/core.git
Set-Location core
git fetch origin
git switch --track origin/codex/windows-extension-runtime-20260923
git status --short
git log -5 --oneline
```

- 이 checkout은 개발자용이다. 최종 제품 사용자는 위 명령을 실행하지 않는다.
- branch에 committed source만 재현의 입력으로 삼는다. Mac worktree의 untracked probe·`.vscode` 설정·생성 runtime·DB·token을 복사하지 않는다. build에 누락 source가 있으면 필요한 파일을 개별 감사해 추가하며 untracked 전체를 넣지 않는다.
- 저장소 개발 도구는 현재 Node.js `24.19.0`, pnpm `11.12.0`, frozen install이다. 사용자 runtime 허용 범위 확대와 개발 pin은 별개다. 다음 세션에서도 `.node-version`, engines와 preflight를 우회하지 않는다.
- frontend가 보고한 pnpm `11.12.0` 실패/`12.4.2` 사용은 별도 재현 항목이다. 이번 Mac 확인은 `pnpm --version` 성공뿐이며 새 frozen install의 성공/실패 검증이 아니다. Windows에서 실제 설치 오류를 확인한 뒤 필요하면 개발 toolchain 변경을 결정·검증한다.
- 기존 clone의 변경은 보존한다. reset/clean/일괄 stash로 이관하지 않는다. push는 사용자 요청 범위와 GitHub 계정/대상 repository 지침을 따른다.

## 3. 현재 사실과 아직 아닌 것

| 항목 | 2026-09-23 확인 상태 |
| --- | --- |
| Core `/health`, application, run CRUD/cancel, SSE | backend source에 존재. 이번 검토에서 Windows 실행은 하지 않음 |
| private `connection.json` 생성 | source에 존재. 제품의 자동 연결 관리자와 Windows ACL 실측은 후속 |
| frontend | [연결 요청서](https://github.com/Hello-KU-tty/program/blob/main/BACKEND_CONNECTION_REQUEST.md)는 vendored SDK와 Discovery/Spec/History adapter 준비를 보고함. 전체 native 실행 완료 증거는 아님 |
| native Agent 실행 | 과거 macOS/arm64 exact pin의 제한적 실측. Windows 및 다른 Kiro source는 미검증 |
| 패키징 | reference VSIX는 UI/host/worker/bridge/prompt를 포함하지만 backend·Node·DB를 포함하지 않음. Homebrew 경로·source checkout 의존성이 남음 |
| `/health` 성공 | Core 접속 확인. 현재 `liveModelVerified: false`이며 worker attach·Agent 성공을 보장하지 않음 |
| Evidence/개인화 | 과거 semantic quality 실패·미검증 항목 유지. 설치 성공이 학습 효과 성공은 아님 |

과거 Mac pin: IDE `1.0.437`, extension-host API `1.109.5`, Kiro Agent `1.0.794`, Core Node `24.19.0`. 이를 Windows 지원 조합으로 복사하지 않는다. 현재 설치 가능한 Windows Kiro의 버전·architecture·capability부터 기록하며 사용자 IDE를 임의 downgrade하지 않는다.

## 4. 다른 확장에서 확인한 방식과 선택

다음 공식 source/문서는 2026-09-23 조회했다. 변경 가능한 upstream이며 Windows 구현 시 확인한 revision/version도 결과에 기록한다.

| 사례 | 관찰 | 우리에게 적용할 부분 |
| --- | --- | --- |
| [Microsoft ESLint client](https://github.com/microsoft/vscode-eslint/blob/main/client/src/client.ts) | server JS module, IPC transport, 선택적 runtime 경로 | extension JS와 별도 Core process를 유지하면서 editor runtime 재사용 |
| [VS Code languageclient](https://github.com/microsoft/vscode-languageserver-node/blob/main/client/src/node/main.ts) | runtime 미지정 시 `child_process.fork`, Electron child 환경 설정 | 실행 파일뿐 아니라 child args/env·종료 수명까지 함께 관리. Core API를 LSP로 변경할 필요는 없음 |
| [Microsoft .NET Install Tool](https://github.com/dotnet/vscode-dotnet-runtime/blob/main/Documentation/commands.md) | `findPath`로 기존 runtime 탐색, `acquire`로 user-level runtime 준비 | 기존 설치/검증된 cache 재사용과 조건부 다운로드·오류 복구 |
| [Red Hat Java](https://github.com/redhat-developer/vscode-java#setting-the-jdk) | platform별 embedded JRE와 project JDK 구분 | 확장 실행 도구와 생성 앱 build/run 도구를 구분 |

이 source는 구현 패턴의 근거이며 해당 확장 설치나 dependency 추가가 필요하다는 뜻은 아니다. [Electron `runAsNode`](https://www.electronjs.org/docs/latest/tutorial/fuses#runasnode)는 제품 빌드에서 꺼질 수 있다. Windows Kiro에서 지원되는지 확인하고, 꺼져 있으면 Kiro binary/fuse/보안 설정을 바꾸지 않는다.

선택 순서:

```text
backend + MCP bridge runtime
  1. Kiro 내장 runtime으로 child 실행 + 필수 API/SQLite 검사
  2. 불가능하면 기존 호환 Node 검사
  3. 둘 다 불가능하면 확장 전용 portable Node 준비/검증
  → 같은 Core/HTTP/SSE/role-bound MCP 계약 사용

생성 앱 build/run 도구
  기존 호환 Node/pnpm → 부족한 도구만 확장 전용 폴더에 준비
  → native Agent shell과 result launcher가 실제로 사용함을 확인
```

- runtime version 범위는 테스트 후 선언한다. `better-sqlite3 13.0.3`의 [binding](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/binding.gyp)은 Node-API 10을 요구한다. [Node-API 호환성](https://nodejs.org/api/n-api.html)에 따라 capability·architecture·native load/transaction을 검사하며 `Node >=22`만으로 충분하다고 하지 않는다.
- runtime 선택 실패와 Agent source/권한 실패는 별개다. Node fallback이 Kiro native 실패를 해결하거나 provider를 바꾼다는 뜻은 아니다.
- `process.execPath`가 일반 `node.exe`인지 Kiro executable인지 구분하고, 검증한 bootstrap args/env와 함께 취급한다. 이 값 하나만 바꿔서 완료하지 않는다.
- backend의 pnpm/build 도구는 VSIX 실행 요구가 아니다. 현재 Builder prompt는 pnpm을 요구하므로 project toolchain 준비와 shell 전달을 후속 구현에 포함한다. npm으로 임의 전환하거나 prompt/fixture·install-script 정책을 우회하지 않는다.

## 5. 최종 설치물 명세 — 목표, 아직 미제작

| 시점 | 제공/생성할 것 | 범위 |
| --- | --- | --- |
| VSIX | UI·이미지·extension host·SDK | product frontend와 backend integration을 단일 사용자 설치 경험으로 조합 |
| VSIX | compiled Core JS와 runtime JS dependencies | source workspace symlink, tests, compiler 등 devDependencies 제외 |
| VSIX | native worker·MCP bridge·guard·canonical prompts | Agent prompt/version·role 권한 유지 |
| VSIX | 해당 platform SQLite binary와 JS wrapper | 우선 win32-x64. 다른 OS/arch prebuild·C++ build source 제외 |
| VSIX | migration SQL·journal, runtime/asset metadata·checksum·license | DB 자체와 credential은 제외 |
| 첫 활성화 | private data root, SQLite DB, connection descriptor, 제한된 logs | extension 설치 폴더 밖의 사용자별 storage, Windows ACL 적용 |
| 필요 시 첫 실행 | portable Node runtime | Kiro/기존 Node/검증된 cache가 사용 불가할 때만 다운로드 |
| 첫 프로젝트 build 전 필요 시 | project Node/pnpm | 기존 호환 설치 재사용, managed runtime 중복 다운로드 회피 |
| 프로젝트별 | 생성 코드, 앱 의존성, build output | Core가 발급한 workspace, frozen install과 lifecycle allowlist |

별도 SQLite server, Kiro CLI, Docker/WSL, cloud backend, 로컬 LLM model을 제품의 필수 설치물로 추가하지 않는다. Kiro Agent는 사용자의 로그인과 host 제공 기능을 이용한다. backend를 위해 Python/C++ compiler를 사용자에게 설치하게 하지 않고 prebuilt library를 검증한다. 생성 앱의 임의 native dependency까지 compiler 없이 설치된다고 보장하지 않는다.

조건부 다운로드는 신뢰할 출처·artifact identity·hash/signature 검증, 임시 staging과 완료 표시, 중단/재시도, version별 cache와 소유권을 설계한다. 관리자 권한·전역 PATH 변경·기존 사용자 설치 덮어쓰기는 하지 않는다. 앱별 subprocess에만 명시적인 tool 경로/env를 전달하며 Kiro Agent shell에 전달 가능한 방식은 실측으로 정한다. 구현되지 않은 자동 준비 명령이나 설정을 실행 안내로 제공하지 않는다.

### 실제 확인한 용량과 측정할 항목

- [공식 npm archive](https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-13.0.3.tgz)의 `prebuilds/win32-x64.node`: 압축 전 **1,989,632 bytes**. 이는 SQLite binary 하나이며 JS/migrations/다른 구성요소 또는 최종 VSIX 크기가 아니다.
- [Node 24.19.0 Windows x64 전체 ZIP](https://nodejs.org/dist/v24.19.0/node-v24.19.0-win-x64.zip): HEAD `Content-Length` **37,304,352 bytes**. 조건부 다운로드 후보의 과거 기준값이지 필요한 최소 파일 크기나 확장 기본 크기가 아니다.
- 최종 VSIX compressed bytes, 설치 후 assets bytes, managed runtime/cache bytes, 첫 생성 앱 의존성 bytes, Core idle/active RSS를 구분 측정한다. runtime 파일 재사용이 child process의 RAM 사용량을 없애지는 않는다. 아직 총 용량·메모리·최초 준비 시간은 미측정이다.

## 6. 현재 source의 변경 지점

| source | 확인한 가정 / 필요한 변경 |
| --- | --- |
| [local backend main](../apps/local-backend/src/main.ts) | repository 상대 root·exact Node·수동 init/start. packaged assets와 mutable root 분리, supervised start |
| [native runtime](../examples/kiro-panel/src/native-runtime.cjs), [runtime config](../examples/kiro-panel/runtime-config.json) | macOS/arm64·Homebrew path·exact source 고정. Windows 지원표와 runtime descriptor 추가 |
| [native relay](../apps/local-backend/src/native-agent-relay.ts) | prompt/source path와 stdio `command` 하드코딩. packaged resource·runtime descriptor 주입 |
| [native client](../examples/kiro-native-host/native-client.cjs) | stdio command·args·env exact 검증. 새 검증된 descriptor를 허용하되 권한을 넓히지 않음 |
| [native worker](../examples/kiro-panel/src/native-worker.cjs), [bridge](../scripts/native-core-stdio-bridge.mjs) | runtime 전달, role binding/revoke, Windows descriptor ACL·path·stream/cancel 검사 |
| [result runtime](../packages/runtime/src/result-runtime.ts) | `spawn(process.execPath)`와 축소 env. generated app용 runtime descriptor·Windows owned process 종료 필요 |
| [storage](../packages/storage-sqlite/src/database.ts), [migration](../packages/storage-sqlite/src/migration.ts) | platform native loading, packaged migration path, disk transaction/backup·reopen 검증 |
| [private files](../apps/local-backend/src/private-files.ts) | Windows ACL branch는 있지만 실제 ACL·한글/공백 경로·junction 검증 필요 |
| [panel build](../scripts/build-kiro-panel.mjs), [VSIX packaging](../scripts/package-kiro-panel.mjs) | 현재 Core 제외, Unix zip 명령. OS별 artifact 목록·Windows 재현 가능한 packaging과 누출 검사 |
| [connection manager](../examples/kiro-panel/src/core-connection.cjs), [frontend guide](FRONTEND_IDE_IMPLEMENTATION_GUIDE.md) | 수동 connection 설정을 manager 내부로 이동, generation/no-replay 유지 |

Core/MCP schema·SDK 계약은 유지한다. source pin, role catalog, workspace·shell guard, Helper/Analyst read-only, Evidence provenance는 runtime portability와 독립적으로 검증한다.

## 7. Windows 작업 순서와 완료 증거

상세 task 상태는 TASKS.md만 갱신한다. W1부터 순서대로 진행하고 다음 착수 표시 `[>]`는 하나만 유지한다.

1. **T19-W1 — capability와 지원표:** Windows OS/arch, 설치 Kiro/Agent/API/host Node versions를 비밀 없이 기록한다. editor child runtime, SQLite load·disk transaction/reopen, MCP bridge, native Discovery 제출·Builder 작은 write/test·Helper read-only·stream/cancel/revoke를 합성 scope에서 확인한다. unsupported/failure는 해당 단계의 원인으로 남긴다.
2. **T19-W2 — portable assets/runtime:** W1에서 확인한 방식으로 runtime descriptor와 resource root를 분리하고 Node 탐색·검증·cache/acquisition, platform SQLite, Core/bridge/prompt/migration artifact를 구성한다. acquisition의 중단·손상·offline 재시도를 검증한다.
3. **T19-W3 — 확장 lifecycle/프론트 연결:** backend 시작·자동 connection 전달·native worker 준비·중복 창·종료·crash·rotation·DB update/backup을 구현한다. source checkout 없이 활성화하고 frontend 상태 계약을 확인한다.
4. **T19-W4 — Builder toolchain:** 기존/미설치 Node·pnpm 모두에서 native Agent shell과 result launcher가 선택한 도구로 frozen install/build/test/실제 HTTP smoke를 수행하게 한다. 사용자의 global 설정과 일반 프로젝트를 변경하지 않는다.
5. **T19-W5 — clean Windows 제품 검증:** 개발용 source/Node/pnpm 없는 일반 사용자 환경에서 최종 VSIX만 설치하고 새 목표→Discovery·선택·Spec→Builder/Helper·실제 Decision→결과 실행→재시작 History를 검증한다. USER/Agent 출처와 분석 성공/실패·다음 context 전달을 확인하며 실제 사람 학습 효과를 주장하지 않는다.

W1의 최소 source 진단은 W2~W5의 installer 성공을 의미하지 않는다. W5에서는 기존 Node 재사용, Node 없는 자동 준비, 한글/공백 경로, 여러 창, runtime 다운로드 실패, 취소·재시작, DB migration/backup과 사용자 데이터 보존을 포함한다. 실제 패키지에서 clean Windows에 필요한 native system dependency도 확인하며 compiler 설치로 우회하지 않는다.

개발 source 변경에 맞는 unit/contract/storage/adapter/eval/IDE 검증과 최종 `pnpm check`를 수행한다. 이번 문서 commit은 Markdown/local link·task 상태·Git diff 검사 대상이며 app test 실행을 Windows 성공으로 기록하지 않는다.

## 8. 프론트 담당자와의 인계 계약

- backend/adapter 담당: Core package, runtime 선택·획득, lifecycle, native worker/bridge/permission, 지원표와 오류 코드, auto-connection, project toolchain과 Windows 검증 결과.
- frontend 담당: 기존 `LocalCoreClient`와 Discovery/Spec/History 연결, host의 준비·연결·복구·실패 상태 표시, 실제 Builder/Helper stream·Decision·Result·Evidence UI, 명시적 demo mode.
- 사용자 설치물은 하나의 제품 확장으로 통합한다. source repository 분리와 사용자 설치물 분리는 같은 뜻이 아니다. frontend repository에는 배포 가능한 adapter/assets 계약으로 전달하고 private native 구현을 별도로 재작성하게 하지 않는다.
- `backend connected`, `native worker ready`, `actual result stored`를 구분한다. frontend의 macOS/arm64 gating은 Windows 실측된 capability 표로 교체하며, 조건을 지우는 것만으로 live를 허용하지 않는다.
- protocolVersion 1, idempotency, expected revision, redaction, connection generation/no-auto-replay와 USER provenance를 유지한다. backend 재시작 후 read-only durable restore를 먼저 하며 불확실한 mutation을 자동 재생하지 않는다.

## 9. 다음 세션에 전달할 시작 요청

> 이 repository의 `codex/windows-extension-runtime-20260923` branch에서 Windows 작업을 이어가라. AGENTS.md와 상위 다섯 문서, `docs/WINDOWS_EXTENSION_HANDOFF_20260923.md`를 읽고 TASKS.md의 T19-W1부터 시작하라. 목표는 Windows 사용자가 Kiro 확장 설치만으로 Core와 native Agent를 사용하는 것이다. 먼저 현재 Windows/Kiro의 runtime·SQLite·native Agent capability를 검증하고, Kiro runtime → 기존 Node → 필요한 경우 private 자동 준비 순서로 구현한다. 개발 pin·권한·provenance를 우회하지 말고 Windows PASS를 Mac 결과로 대체하지 마라. 기존 untracked 파일은 보존하고 합성 데이터로 검증하라. 제품 런타임 허용 범위와 개발 toolchain을 구분하며 실패는 명시적으로 기록하라. push·공개 배포·데이터 경계 변경은 별도 요청 범위를 따른다.
