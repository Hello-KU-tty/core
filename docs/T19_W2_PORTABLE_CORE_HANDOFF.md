# T19-W2 portable Core 인계

> 2026-09-24 · Windows x64 Core package와 runtime 준비. [결과](spikes/T19_W2_PORTABLE_CORE_RESULTS_20260924.md), [계획](T19_W2_PORTABLE_CORE_PLAN.md). 자동 확장 lifecycle·실제 Windows native worker 연결은 T19-W3다.

## 생성과 검증

개발자는 기존 Node **24.19.0**, pnpm **11.12.0**와 frozen 설치를 사용한다. Windows의 공식 Node distribution에는 `node.exe` 옆 `LICENSE`가 있어야 한다. build는 공식 실행 파일 SHA-256을 확인한다. 새 dependency/install script는 없다.

```powershell
pnpm core:portable
pnpm panel:pack:windows
pnpm test:portable "<설치된 Kiro.exe 절대 경로>"
pnpm check
```

- `dist/portable-core-win32-x64/`: source checkout 없이 실행하는 Core package.
- `dist/portable-win32-x64/vibe-helper-portable-core-0.1.0-win32-x64.vsix`: W3 통합용 W2 artifact. explicit runtime 진단 command만 제공하며 자동 기동 완제품이 아니다.
- `dist/portable-win32-x64/receipt.json`: VSIX checksum·파일 수·실측 용량.
- `dist/portable-w2-receipt.json`: 합성 Windows 실측 결과. 모델을 호출하지 않는다.

빌드는 자신의 `dist` 하위 generated output만 교체한다. 기존 macOS `panel:build`/`panel:pack` 경로는 보존한다. Windows 이외 target, ARM64와 새 Node version은 검증 전 거절한다. 실제 IDE 설치·marketplace 게시·최종 frontend 통합은 이 명령의 완료 판정에 포함하지 않는다.

## 패키지 계약

| 경로 | 책임 |
| --- | --- |
| `manifest.json` | schema 1, win32-x64, 지원 Node version, prompt version, 모든 파일 SHA-256/bytes |
| `bin/core.mjs` | 별도 process의 Core/SQLite/HTTP/SSE/native relay |
| `bin/bridge.mjs` | Core-issued binding으로 제한한 stdio MCP |
| `bin/runtime.cjs` | resource 검사, runtime 선택/probe/cache/acquisition/recovery API |
| `bin/client.cjs` | `connectLocalCore`, `readLocalConnection`; 기존 SDK의 인증된 client |
| `bin/probe.cjs` | 후보 process의 필수 API·Node-API·SQLite transaction/rollback/reopen 검사 |
| `bin/guard.mjs`, `bin/native-worker.cjs` | 기존 guard/worker의 빌드 자산. Windows native host gate는 W3에서 별도 통합 |
| `agent-prompts/` | canonical 네 prompt; 정책/version 변경 없음 |
| `drizzle/` | SQL migration과 `_journal.json`; snapshot/source/type/test 제외 |
| `node_modules/` | SQLite runtime JS·win32-x64 prebuild 하나, Drizzle의 두 CJS runtime entry bundle |
| `licenses/` | runtime 의존성 license/NOTICE와 Node distribution LICENSE |

리소스 폴더는 immutable로 취급한다. manifest 없는 파일, hash 불일치, directory alias/junction, file symlink/hardlink와 traversal을 거절한다. hash manifest는 신뢰한 extension 설치의 무결성 검사이며, 공격자가 설치본 전체를 바꾸는 경우의 서명 검증을 대체하지 않는다.

## W3 host에서 사용할 API

host가 제공한 private storage의 parent는 먼저 준비하되 기존 임의 directory의 ACL을 자동 수정하지 않는다. `selectCoreRuntime`의 `privateRoot`는 그 아래의 새 전용 도구 directory다. 아래는 W3 integration 예시이며 이 세션에서 자동 activation을 구현했다는 뜻은 아니다.

```javascript
const { selectCoreRuntime, runtimeEnvironment, recoverCoreAcquisition } =
  require('./portable/bin/runtime.cjs')

const { runtime, resources, rejected } = await selectCoreRuntime({
  resourceRoot: path.join(extensionPath, 'portable'),
  privateRoot: path.join(globalStoragePath, 'core-tools'),
  kiroExecutable: process.execPath,
  signal: abortController.signal,
})
```

`runtime`은 executable, 고정 args, 필요한 env, source, nodeVersion, platform, arch와 napi를 가진다. 선택 순서는 **Kiro child → PATH의 기존 Node → private cache → 공식 Node 획득**이다. 실패 후보의 `rejected`에는 경로/원문 stderr 대신 source와 제한된 오류 code만 남는다. `nodeExecutables`는 테스트·host 통합의 명시적 후보 목록이며 사용자 shell 문자열이 아니다. `offline: true`이면 기존 runtime/cache만 사용한다.

Kiro child는 `ELECTRON_RUN_AS_NODE=1`을 사용한다. 선택된 descriptor의 args/env를 함께 전달하고 `process.execPath`만 Node로 간주하지 않는다. `runtimeEnvironment`는 inherited Node injection 및 Electron launch mode를 제거한 뒤 선택한 env를 적용한다. runtime 선택은 Kiro Agent source/권한 검증을 대신하지 않는다.

Core의 별도 private data directory는 resource/tool directory와 구분한다. 패키지의 `core.mjs init --root <dataRoot>`는 migration과 초기화를, `core.mjs native --root <dataRoot> --port 0`은 native relay가 있는 Core를 시작한다. packaged 경로는 `--root`를 필수로 하고 리소스와 data의 포함·중첩을 거절한다. 개발용 `doctor`/CLI command와 개발 exact pin 우회에는 사용하지 않는다.

Node `spawn(runtime.executable, [...runtime.args, resources.core, ...args], { env: runtimeEnvironment(runtime), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })`로 실행할 수 있다. 소유 parent의 IPC `VIBE_CORE_SHUTDOWN` 또는 IPC disconnect는 종료/revoke/DB close를 요청한다. 다중 창 owner, crash reconciliation, credential rotation, 업데이트·backup 정책은 W3에서 완성한다. `NATIVE_READY`는 Core relay 기동만 의미하며 실제 native Agent 성공이 아니다.

Core가 만든 `connection.json`은 host에서 SDK로 읽고 Webview에 token/절대 경로를 전달하지 않는다. 저장 상태를 먼저 복원하고 불확실한 mutation을 자동 재생하지 않는다. relay가 생성하는 role config는 packaged prompt/bridge와 실제 Core executable/env를 사용하며 tool catalog·permission·scope·revoke는 기존 계약을 유지한다.

## 획득과 실패 복구

- 공식 고정 HTTPS URL `https://nodejs.org/dist/v24.19.0/win-x64/node.exe`, redirect 금지, 150MiB 상한, 120초 timeout, pinned SHA-256 검증 후에만 실행한다. 공식 출처와 hash는 [결정 기록](DECISIONS.md)에 남겼다.
- 새 `download-<uuid>`에서 `.partial`을 기록하고 checksum·runtime probe 성공 뒤에만 완료 marker와 version cache를 publish한다. 부분 다운로드를 재개하는 Range 요청은 쓰지 않고 새 staging에서 명시적으로 재시도한다.
- cache도 실행 전 exe hash·완료 marker·private ACL을 재확인한다. 손상 cache는 `.invalid-<uuid>`로 보존하고 재획득한다. 기존 사용자 Node/global PATH는 수정하지 않는다.
- `RUNTIME_OFFLINE_UNAVAILABLE`, `RUNTIME_DOWNLOAD_UNAVAILABLE`, `RUNTIME_DOWNLOAD_INTERRUPTED`, `RUNTIME_DOWNLOAD_CANCELLED`, `RUNTIME_DOWNLOAD_HASH_MISMATCH`, `RUNTIME_ACQUISITION_BUSY`를 UI 준비/실패 상태로 매핑한다.
- 취소/일반 실패의 lock은 정리된다. process crash로 남은 lock은 사용자의 명시적 복구 action에서 `recoverCoreAcquisition(cacheRoot)`를 호출한다. owner가 종료됐을 때만 lock을 archive하며 살아 있거나 불명확한 owner는 건드리지 않는다. PID 재사용은 보수적으로 busy로 남는다.
- 중단 staging, probe DB와 quarantine은 private root에 남는다. W3 storage 수명/정리 정책에서 현재 사용 중인 실행 파일과 사용자 DB를 구분해야 한다. 기본 설치 bytes에는 이 진단/임시 자료를 합산하지 않는다.

## 이어갈 gate

W1의 한 창 custom Helper 병행 FAIL과 protected built-in Helper 미지원은 그대로다. W2의 worker bundle은 legacy 개인 경로·개발 probe를 제외하고 해당 경로를 fail-closed로 유지한다. W3는 Windows source attestation, portable descriptor의 worker 전달, Helper 실행 방식, 단일 제품 frontend와 자동 lifecycle을 연결해야 한다. 생성 앱 Node/pnpm은 W4, 개발 도구 없는 clean Windows 설치와 실제 새 Discovery→Spec→Builder/Helper→결과·History는 W5에서 검증한다.
