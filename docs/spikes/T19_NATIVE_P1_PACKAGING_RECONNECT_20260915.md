# T19-N P1 native panel 패키징·재연결 구현 기록

작성 기준: 2026-09-15. 이 문서는 pin한 한 창 W Builder + protected built-in H Helper/Analyst 경로의 P1 source 구현, 일반 설치와 idle backend rotation 실측, 아직 남은 active-operation gate를 분리한다. 기존 CLI/Crew 기본 경로를 교체하거나 T19-N을 완료로 선언하지 않는다.

## 구현 결과

`examples/kiro-panel`은 더 이상 실행 중인 extension bundle 위치에서 저장소의 `scripts/native-core-stdio-bridge.mjs`를 상대 경로로 찾지 않는다. 패키지는 다음 자산을 extension root 안에 함께 둔다.

- `dist/extension.cjs`: frontend client, redaction, private Kiro observer와 panel adapter가 포함된 기존 extension-host 호환 Node 18 target bundle
- `media/panel.html`, `media/panel.js`: Webview 자산
- `runtime/native-core-stdio-bridge.mjs`: MCP SDK, contract schema와 transport 보정을 포함한 독립 ESM bundle
- `runtime/agent-prompts/*.md`: build 시점 canonical Discovery, Builder, Helper, Evidence Analyst prompt
- `runtime/manifest.json`: 지원 source, host/runtime pin과 각 runtime asset의 SHA-256 integrity digest

runtime resolver는 extension root의 real path 안에 있는 regular, non-symlink, single-link asset만 읽고 manifest digest를 모두 확인한다. 이 digest는 package 내부 asset 무결성 확인용이지 publisher signature나 authenticity 증명이 아니다. 다음 source 하나만 현재 지원 대상으로 인정한다.

| 경계 | pin |
| --- | --- |
| Kiro IDE | 1.0.437 |
| extension host API (`vscode.version`) | 1.109.5 |
| Kiro Agent extension | 1.0.794 |
| OS / architecture | macOS / arm64 |
| Node executable | `/opt/homebrew/opt/node@24/bin/node` |
| Node version | 24.19.0 정확히 일치 |
| runtime source ID | `KIRO_IDE_1.0.437_AGENT_1.0.794_MACOS_ARM64` |

Node binary 자체는 VSIX에 복제하지 않는다. machine-scoped extension configuration은 위 절대 경로 한 값만 허용하며 실행 전 `--version`을 shell 없이 호출해 정확한 version을 확인한다. 다른 OS, architecture, VS Code engine, Agent version, runtime source, Node path/version, 누락·변조·symlink asset은 명시적인 code로 fail-closed한다.

Agent version source는 같은 extension host에서 `vscode.extensions.getExtension`이 보일 것이라고 가정하지 않는다. 실행 중인 `vscode.env.appRoot`가 canonical `/Applications/Kiro.app/Contents/Resources/app`와 정확히 같은지 확인하고, 그 안의 `product.json`과 `extensions/kiro.kiro-agent/package.json`만 읽는다. app identity/version/API/commit/quality와 Agent publisher/name/version/main이 위 pin과 정확히 일치해야 하며 두 manifest는 root containment, regular non-symlink, single-link, 128 KiB size bound를 통과해야 한다. `product.overrides.json`이 있거나 matching manifest를 다른 canonical root에 복제한 경우도 거절한다. 이는 실행 중인 pin의 metadata source 확인이며 binary signature나 OS sandbox 증명이 아니다.

backend가 one-run workspace에 만든 Agent config는 native session을 열기 전에 packaged prompt와 정확히 같은지 확인한다. binding/workspace와 config의 private-file 경계를 확인하고 `.kiro/agents` parent와 config leaf의 canonical path가 정확히 같은 workspace 안인지 확인한 뒤 MCP command의 Node와 bridge path만 package 내부의 검증된 값으로 materialize한다. symlink parent로 workspace 밖 regular file을 가리키는 경우 쓰기 전에 거절한다. 이후 기존 `boundedCoreRole`이 도구, permission, binding, prompt와 MCP 전체 형태를 다시 검증한다. token이나 authorization은 Webview, manifest 또는 status에 복사하지 않는다.

## 재연결 계약

panel은 connection descriptor에서 만든 healthy client 하나를 재사용한다. 일반 read/mutation에서는 `LOCAL_AUTH_FAILED`, `BACKEND_RESTARTED_RELOAD_CONNECTION`, `CORE_CONNECTION_UNAVAILABLE`만 stale connection 후보로 본다. SSE 경계에서만 SDK의 `STREAM_DISCONNECTED_RESTORE_PROJECT`와 Node fetch reader가 socket 단절 시 던질 수 있는 raw `TypeError`도 bounded disconnect로 취급한다.

| 실패 지점 | 동작 |
| --- | --- |
| History, Project snapshot, run 목록, Evidence/Analysis 같은 read | descriptor를 single-flight로 다시 읽고 새 client에서 실패한 read를 한 번만 재시도한다. |
| UI command, 새 Discovery/run, Decision, cancel 같은 mutation | 새 descriptor와 client는 준비하지만 원래 mutation을 다시 보내지 않고 `CORE_CONNECTION_ROTATED_ACTION_NOT_REPLAYED`로 실패한다. 이후 저장된 Core snapshot만 다시 읽는다. |
| 진행 중 SSE | 기존 controller를 중단한다. 이전 run ID에 자동 재연결하거나 새 run을 시작하지 않는다. 현재 backend의 durable run 목록과 Project snapshot만 복원하고 중단된 stream을 다시 시작하지 않았음을 표시한다. |
| native worker의 기존 claimed job | 기존 connection을 가진 job의 status poll/delivery 실패가 해당 turn을 중단한다. panel reconnect가 Agent job이나 Builder mutation을 재생하지 않는다. worker poll은 descriptor를 매 tick 새로 읽되 source/path가 다른 worker로 바뀌면 reload-required로 닫힌다. |

같은 backend instance에서 token만 바뀐 경우도 새 client generation으로 취급한다. 회전 시 모든 panel-owned SSE를 먼저 중단하고, 회전 전에 시작한 restore sequence를 즉시 무효화한다. generation마다 정확히 한 번 예약한 recovery restore만 History, Project snapshot, Analysis/Evidence, run 목록을 읽으며 active/terminal SSE를 reattach/replay하지 않는다. recovery 중 새 mutation/cancel/user-input 응답은 queue하지 않고 `CORE_CONNECTION_RECOVERY_IN_PROGRESS_RETRY_ACTION`으로 명시 실패한다. refresh는 같은 recovery promise를 기다린다. 회전을 발견한 mutation handler도 별도 restore를 만들지 않고 같은 promise가 끝날 때까지 `busy`와 `ready` 경계를 유지한다. 따라서 늦은 구 generation 응답이 새 화면을 덮거나 실패한 사용자 조치가 뒤늦게 실행되지 않는다.

패키징 스크립트 자체는 extension 설치나 profile을 변경하지 않는다. 향후 별도 승인된 VSIX 설치는 선택한 Kiro profile의 이 extension 등록·활성화만 바꾸며 vendor Kiro/Agent extension, workspace trust, hook, security/global 설정은 변경하지 않는다. Kiro와 정확한 Node binary는 이미 설치돼 있어야 한다. runtime 중 extension이 쓰는 것은 Core가 승인된 생성 workspace에 만든 해당 one-run `.kiro/agents/<role>.json`의 검증된 runtime command/path뿐이다. backend 자체를 설치하거나 시작하지 않는다.

## 패키징과 검증 방법

`pnpm panel:build`는 Node 18 target extension/IDE test bundle과 Node 24 target packaged bridge, prompt, digest manifest를 만든다. product manifest는 `vibeHelper.localPanel`, finite synthetic validation인 `vibeHelper.nativeCleanEvaluationRun`과 startup activation만 광고한다. source에 남은 broad historical feasibility/eval command는 package command surface로 제공하지 않는다. synthetic command가 참조하는 fixture, contracts와 pure prompt composer는 `dist/extension.cjs`에 정적으로 bundle되어 설치 후 repository-relative read를 만들지 않는다. `pnpm panel:pack`은 `package.json`, `dist/extension.cjs`, 두 Webview asset, runtime manifest와 그 manifest가 열거한 다섯 asset만 별도 staging directory에 복사하고 로컬 `/usr/bin/zip`으로 최소 VSIX 2.0 구조를 만든다. archive CRC와 정확한 entry whitelist를 `/usr/bin/unzip`으로 다시 확인한다. `dist/ide-test.cjs`, source, test, fixture는 별도 archive entry로 들어가지 않는다.

이 machine에는 공식 `@vscode/vsce`가 설치되어 있지 않으므로 새 dependency를 받지 않고 이미 있는 zip을 사용한다. 이 최소 archive가 `vsce package`와 동등하다고 주장하지 않으며 Kiro installed-extension parser acceptance는 live install gate로 남긴다. staging과 VSIX는 `/private/tmp/vibe-helper-kiro-panel-*` 아래에 남기며 자동 삭제하지 않는다.

source 단계 focused regression은 다음을 실행한다.

```text
/opt/homebrew/opt/node@24/bin/node --test \
  examples/kiro-panel/test/core-connection.test.cjs \
  examples/kiro-panel/test/native-runtime.test.cjs \
  examples/kiro-panel/test/restore-watch.test.cjs \
  examples/kiro-panel/test/run-streams.test.cjs
```

검증 범위는 healthy same-instance reuse, 동시 stale read/mutation의 single-flight recovery, 실제 loopback HTTP SDK SSE EOF와 response-lost mutation, active mutation 실패/no replay, 기존 SSE 중단/no auto reattach, recovery barrier와 late restore 무효화, relocated staged extension의 package-local asset/config 사용, parent-symlink write escape 거절, unsupported runtime source fail-closed다. build 뒤 bundle된 ESM bridge는 DB/model 없이 invalid descriptor를 안전하게 거절하는 process smoke를 추가로 실행한다.

첫 archive `/private/tmp/vibe-helper-kiro-panel-vsix-w3C68X/vibe-helper-local-panel-0.1.0.vsix`는 root 독립 검사에서 entry 12개, `dist/ide-test.cjs` 부재, product command `vibeHelper.localPanel` 하나, runtime asset 5개 digest와 canonical prompt 4개 byte 일치가 확인됐다. 일반 Kiro profile parser도 `Completed installing extension`으로 통과했지만 activation은 아래 developer probe eager-load 문제로 실패했다. `/private/tmp` artifact와 설치 흔적은 이 구현 작업에서 삭제하거나 직접 수정하지 않았다.

2026-09-15 0.1.1 P1 source/package 검증 결과:

- `pnpm panel:pack`: preflight, shared typecheck, extension/runtime build와 exact archive verification PASS
- `node --test examples/kiro-panel/test/*.test.cjs`: 58/58 PASS
- `pnpm exec vitest run tests/unit/native-client.test.ts`: 41/41 PASS
- 기존 source subagent/invoke probe test: 5/5 PASS
- repo 없는 relocated install layout에서 최종 `dist/extension.cjs` activation 및 `vibeHelper.localPanel` 등록: PASS
- packaged ESM bridge process smoke: exit 1과 `BRIDGE_SCOPE_REQUIRED` 확인, dynamic-require startup 오류 없음
- script Biome check와 `git diff --check`: PASS
- 교정 VSIX: `/private/tmp/vibe-helper-kiro-panel-vsix-jAqL3F/vibe-helper-local-panel-0.1.1.vsix` (560,600 bytes)
- 교정 VSIX SHA-256 integrity digest: `9aea50644bcb4d17cc4a8ee2e2843c051101b4211ff19ff33e6d02f8d273d5e3`
- packaged prompt versions: Discovery 1.3.5, Builder 1.3.6, Helper 1.2.0, Evidence Analyst 1.0.6

## 일반 설치 activation 실패와 0.1.1 교정

2026-09-15 일반 Kiro profile은 0.1.0 VSIX parser/install을 통과했고 `~/.kiro/extensions/vibe-helper.vibe-helper-local-panel-0.1.0`에 exact package asset이 설치됐다. 그러나 ordinary G window를 포함한 extension host activation은 매번 `SINGLE_HOST_PROBE_SERVER_SCRIPT_MISSING`으로 실패했다. bundle load graph는 `extension.cjs` → `native-worker.cjs` → `native-client.cjs` → `single-host-subagent-probe.cjs`였고, 마지막 module의 top-level initializer가 설치 package에 의도적으로 없는 repository-only `scripts/single-host-probe-mcp.mjs`를 즉시 찾았다. 그래서 `activate`가 `registerCommand`에 도달하지 못해 palette 항목 실행이 `command vibeHelper.localPanel not found`가 됐다. reload로 바뀌지 않는 deterministic package activation 오류였다.

0.1.1은 `native-client.cjs`의 developer-only subagent/invoke probe import를 기존 `probeMode` 분기 안으로 lazy-load했다. side-effect-free workspace/role 상수는 product module에 고정하고 실제 source probe module을 명시적으로 사용할 때 서로 byte-equivalent 값인지 확인해 drift를 fail-closed한다. product permission, runtime, workspace와 window gate는 바꾸지 않았다. historical probe는 source에서 그대로 실행되며 기존 5개 regression이 통과한다. 새 regression은 최종 build bundle을 repo가 없는 임시 installed-layout로 복제하고 최소 VS Code mock으로 실제 `activate`를 호출해 `vibeHelper.localPanel`이 한 번 등록되는지 확인한다. 0.1.1의 일반 Kiro parser/install/activation은 root CUA gate로 남는다.

실제 일반 Kiro profile에서 0.1.1 parser/install과 extension activation은 통과했고 `vibeHelper.localPanel`도 등록·실행됐다. 다음 fail-closed gate는 `NATIVE_RUNTIME_AGENT_SOURCE_UNSUPPORTED`였다. installed manifest, built-in extension UI와 vendor package는 모두 Agent 1.0.794여서 version mismatch 증거는 없었다. renderer log는 `kiro.kiroAgent`를 별도 dedicated extension host에 배치한다고 명시했다. pin된 Kiro extension API 구현도 기본 `getExtension(id)`가 caller host의 `mine` registry만 조회하며 proposed `extensionsAny`가 없으면 cross-host 조회 인자를 비활성화한다. 따라서 ordinary panel host에서 `getExtension('kiro.kiroAgent')`이 `undefined`인 것이 정확한 실패 원인이었다. Agent activation 순서나 version pin 완화로 해결할 문제가 아니다.

## 0.1.2 isolated-host source 교정과 bounded synthetic command

0.1.2는 product native runtime, product-mode native client, protected H/barrier와 protected feature flag gate를 위 canonical running-app manifest attestation 하나에 묶었다. product path에서 cross-host `getExtension`이나 `activate()`를 호출하지 않는다. 구 1.0.653 Dev Host와 standalone historical probe의 기존 API 경로는 명시적인 non-product branch에만 남겼으며 product fallback으로 사용하지 않는다. startup metadata 확인이 실패한 Promise는 timer나 자동 loop 없이 해제한다. 같은 시점의 caller는 하나의 attempt만 공유하고, 이후 사용자가 `localPanel`을 다시 실행할 때만 source를 새로 검증한다.

동일 0.1.2는 별도 `vibeHelper.nativeCleanEvaluationRun` command를 등록한다. 이는 catalog-confirmed 단일 model로 최대 13개 synthetic cell만 명시적 QuickPick과 modal 확인 뒤 실행하고 retry 0, Core mutation 0, operational failure stop, final idle 확인과 `resume:false` release를 적용한다. 결과 Webview는 scripts disabled와 `default-src 'none'`이며 metadata artifact는 0600으로 쓴다. 이 command는 historical broad eval command를 다시 노출하지 않으며 결과를 human Evidence나 학습 proof로 자동 승격하지 않는다.

0.1.2 focused/package 검증 결과:

- canonical Kiro installation/source + runtime/retry CJS: 10/10 PASS
- native client + protected flag source: 48/48 PASS
- 전체 panel CJS: 81/81 PASS, 여기에는 13-cell command 6/6과 repo 없는 relocated final bundle activation/두 product command 등록이 포함된다.
- `pnpm panel:pack`: preflight, shared typecheck, final extension/runtime rebuild와 exact 12-entry archive verification PASS
- actual pinned `/Applications/Kiro.app/Contents/Resources/app` read-only attestation: Kiro 1.0.437, API 1.109.5, stable commit pin과 Agent 1.0.794 PASS
- packaged ESM bridge invalid-descriptor smoke: exit 1과 `BRIDGE_SCOPE_REQUIRED`, startup dynamic-require 오류 없음
- VSIX: `/private/tmp/vibe-helper-kiro-panel-vsix-u30pMN/vibe-helper-local-panel-0.1.2.vsix` (592,175 bytes)
- VSIX SHA-256 integrity digest: `b2582b7544eb46a928ece8252c525e250ec6af8e030648a048243eb55555e8f6`
- staging: `/private/tmp/vibe-helper-kiro-panel-stage-HJTewY`; runtime asset digest 5개와 prompt version Discovery 1.3.5 / Builder 1.3.6 / Helper 1.2.0 / Evidence Analyst 1.0.6 PASS

## 0.1.3 Analyst-only package 준비

P2가 canonical Evidence Analyst v1.0.7과 새 7-cell Analyst-only command source를 freeze한 뒤 P1은 extension registration interface나 권한을 바꾸지 않고 package version을 0.1.3으로 올렸다. command title도 실제 범위인 `Vibe Helper: Run Bounded Synthetic Validation (7 Analyst cells)`로 좁혔다. historical v1.0.3/v1.0.4 evaluator test는 exact v1.0.7→v1.0.6 inverse를 기존 v1.0.6→v1.0.5 inverse 앞에 추가하고, 저장된 v1.0.5 SHA-256과 v1.0.4 hash를 그대로 확인한다.

최종 0.1.3 pre-install 검증 결과:

- `pnpm panel:pack`: Node 24.19.0 preflight, shared typecheck, extension/runtime build와 exact archive verification PASS
- 전체 panel CJS 87/87 PASS; P2의 최종 Analyst source/oracle, repo 없는 relocated final bundle activation과 두 product command 등록을 포함한다.
- native client + protected source 48/48 PASS
- packaged ESM bridge invalid-descriptor smoke: exit 1과 `BRIDGE_SCOPE_REQUIRED`
- VSIX: `/private/tmp/vibe-helper-kiro-panel-vsix-JGEmwa/vibe-helper-local-panel-0.1.3.vsix` (575,538 bytes)
- VSIX SHA-256 integrity digest: `88f21a8bfef37355b143c549d6cf6ef112b30c32b2e058c6c42ba6593a31f3c4`
- staging: `/private/tmp/vibe-helper-kiro-panel-stage-9Bz3EZ`; exact 12 entries, runtime asset digest 5개, prompt version Discovery 1.3.5 / Builder 1.3.6 / Helper 1.2.0 / Evidence Analyst 1.0.7 PASS
- Kiro install parser와 installed activation/live 7-cell은 아직 PENDING이다. 기존 일반 profile 0.1.2의 live P3가 진행되는 동안 install/reload를 수행하지 않는다.

## 일반 설치와 idle backend rotation 실측

Root가 0.1.2 VSIX의 SHA-256 `b2582b7544eb46a928ece8252c525e250ec6af8e030648a048243eb55555e8f6`을 다시 확인한 뒤 ordinary Kiro profile 설치를 수행했다. parser install과 Developer: Reload Window 뒤 `localPanel`이 자동 생성됐고 canonical running-app Agent source gate도 통과했다. Settings 검증용 탭을 닫은 뒤 panel 본문, History 10개와 G의 durable Core 상태가 렌더됐다. 창은 Dev Host가 아닌 일반 title이었고 Kiro와 Vibe Helper Webview 모두 같은 ordinary window `parentId=2`였다.

재연결 전 fresh SDK와 DB 읽기 전용 감사에서 backend instance는 `306464aa-c282-47b0-9af1-a333468de360`, owner PID는 55228, active run 0, Analysis Job 45개 모두 `SUCCEEDED`, binding 113개 모두 `REVOKED`, descriptor mode `0600`이었다. Root는 PID 55228에 정상 SIGTERM을 보내 종료를 확인했고 lock 부재와 port closed를 확인한 뒤 같은 Core root를 `singleWindow=1`, `diagnostics=1`, port 58498로 정상 시작했다. 새 instance는 `ae629c61-b180-40da-942f-d883b06ceae7`, owner OS PID는 84455, tool exec session은 59168이었다. 이 PID·session·instance는 해당 실측 snapshot이며 이후 현재값으로 가정하지 않는다.

기존 열린 panel에서 사용자가 History/상태 새로고침을 한 번 클릭하자 `Core 연결을 갱신하고 저장된 상태를 다시 읽었습니다.`가 표시됐다. 새 SDK snapshot은 Project 10, current-instance run 0/active 0, G `BUILD`, current Task `task_bb5d8928-5b20-43f8-9767-db5070b3122f` `COMPLETED`, pending Decision 0, Helper conversation 8, Completion Report 있음이었다. binding 113개는 계속 모두 `REVOKED`, connection mode는 `0600`, Analysis Job 45개는 모두 `SUCCEEDED`, SQLite `quick_check=ok`였다. 따라서 ordinary installed panel의 idle instance/token rotation 뒤 explicit read-only durable restore는 PASS다.

같은 최종 source에서 root의 전체 `pnpm check`도 exit 0이었다: format/lint/typecheck/DB, unit 88/88, integration 271/271, eval 33/33, Campus Drop 3/3, build, smoke 6/6, GUI E2E 12/12(53.0초). 이 결과를 진행 중 SSE나 mutation uncertainty의 live 검증으로 확대하지 않는다.

남은 P1/P3 live gate는 다음과 같다.

1. 일반 profile/window 2의 단독 H confirmed cancel과 prepare 재발급 없는 pair 재사용은 PASS다. 실제 Builder 활동과 late Helper 성공을 세 번 겹치는 P3 및 새 Decision/resume는 아직 남아 있다.
2. active SSE 또는 응답 유실 가능 mutation과 겹친 회전에서 명시 실패와 duplicate run/Core mutation 부재를 확인한다. idle restore PASS가 이 race를 대신하지 않는다.
3. terminal 뒤 active job 0과 binding `REVOKED`를 다시 확인한다.

진행 중 native stream 자체의 재연결은 현재 P1 MVP 필수 조건이 아니다. backend가 canonical prompt를 읽어 최초 run config를 만드는 경로는 아직 backend distribution 경계에 속한다. 이번 VSIX는 생성된 run config가 package runtime만 실행하도록 바꾸지만, 저장소 없이 backend 자체를 설치·기동하는 배포물까지 제공하지 않는다. Windows와 다른 Kiro/Agent source도 미지원이며 일반화된 불가능이 아니라 별도 검증 대상이다.

## `docs/DECISIONS.md` 반영 문안

아래 요지는 shared 결정 기록의 `2026-09-15: pin한 native IDE panel의 독립 VSIX와 무재생 재연결` 항목에 반영했다.

```text
- 2026-09-15 T19-N P1에서 native IDE panel은 pin별 독립 VSIX로 패키징한다. 현재 지원 source는 macOS arm64의 Kiro IDE 1.0.437 / extension-host API 1.109.5 / Kiro Agent 1.0.794 / Node.js 24.19.0이며 runtime source ID와 Node executable `/opt/homebrew/opt/node@24/bin/node`를 machine configuration과 package manifest 양쪽에서 정확히 일치시킨다. VSIX는 Node 18 target extension bundle, Webview asset, 독립 Node 24 target stdio Core bridge와 build 시점 canonical Agent prompt를 포함하고 SHA-256 integrity digest, package-root containment, regular non-symlink file을 activation 전에 검증한다. digest는 publisher signature/authenticity 증명이 아니다. 지원하지 않는 source·OS·architecture·version·Node·asset은 fallback하지 않고 fail-closed한다. backend connection/token 또는 instance가 바뀌면 History·Project snapshot·run 목록 같은 read만 새 descriptor에서 한 번 재시도한다. 실패 응답이 유실됐을 수 있는 mutation과 진행 중 SSE/native turn은 자동 replay·reattach하지 않고 명시 실패한 뒤 generation별 durable Core restore 하나만 수행한다. 패키징은 설치/profile을 바꾸지 않고, 향후 승인된 설치는 선택한 profile의 이 extension 등록·활성화만 바꾸며 vendor extension, trust, hook, security/global 설정을 변경하지 않는다. 이 결정은 pin한 source의 배포 경계를 정하며 `vsce` 동등성, Kiro install parser acceptance, 일반 설치 macOS 회귀, Windows, backend 자체의 독립 distribution과 CLI 기본 경로 교체를 승인하거나 완료하지 않는다.
```
