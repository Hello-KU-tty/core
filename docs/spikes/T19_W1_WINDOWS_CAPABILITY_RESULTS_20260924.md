# T19-W1 Windows capability 실측 결과

> 2026-09-24 KST · branch `codex/windows-extension-runtime-20260923` · baseline `b88ae5f`.
> **W1 bounded capability PASS. W2 착수 근거 확보.** 현재 Kiro에서 한 창 custom Agent 병행은 FAIL이며, 두 창 분리에서만 병행 PASS다. 제품 설치·단일 창 UX·전체 수직 흐름 완료를 뜻하지 않는다.
> [승인 계획](../T19_W1_WINDOWS_CAPABILITY_PLAN.md), [Windows 인계](../WINDOWS_EXTENSION_HANDOFF_20260923.md), [sanitized receipt](T19_W1_WINDOWS_RECEIPTS_20260924.json), [진단 사용법](../../examples/windows-capability/README.md).

## 1. 확인한 실행 조합

| 항목 | 관측값·판정 |
| --- | --- |
| OS | Windows x64, build 26200 |
| 개발 도구 | Node 24.19.0 / pnpm 11.12.0; preflight 및 frozen install PASS |
| Kiro IDE / API | 1.1.14 stable / 1.131.0 |
| Kiro commit | `f694ef1b025756b1ae27ae7c3d9ed4215b0160fe` |
| Kiro Agent | 1.1.28 |
| 실제 extension-host / child | Node 24.18.0 / Electron 42.7.0 / Node-API 10 / win32-x64 |
| Agent bundle SHA-256 | `af4e05df0677587e689883ccbbb19bb853517d8127c5caaec66511408e4ca5da` |
| 모델 | Kiro의 기존 `auto`; routed model을 추정하지 않음 |
| runtime 후보 1: Kiro child | **PASS**, `process.execPath` + `ELECTRON_RUN_AS_NODE=1`, 실제 SQLite·Core·stdio bridge 실행 |
| runtime 후보 2: 기존 Node | 제품 후보로 **NOT_TESTED**; Kiro 후보가 통과하여 fallback 불필요 |
| runtime 후보 3: 전용 Node | 제품 fallback으로 **NOT_TESTED**; 전용 개발 도구 준비·실행과 구분 |
| 다른 IDE/Agent, Windows ARM64 | **NOT_TESTED**, 제품 지원 gate에 추가하지 않음 |

계획 작성 때 manifest는 IDE 1.0.337이었다. 실제 host 검증 전 설치본은 위 버전으로 변경되어 있었다. 이 작업은 IDE를 업데이트하거나 downgrade하지 않았다. 실제 source와 SHA를 다시 확인하여 진단 경로에 pin했고, 기존 Mac 제품 gate·Homebrew 경로를 광범위하게 풀지 않았다. Kiro executable의 Authenticode 상태는 `Valid`였다.

개발용 Node·pnpm·Playwright browser는 전용 임시 도구 폴더에 준비했다. global PATH, 사용자 Node/pnpm 설치, shell profile은 변경하지 않았다. official Node ZIP SHA-256은 `57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73`, pnpm npm 배포물 SHA-512는 `ggpvvQ2fBMImY4ACrq0eRTQKkTndXcB3wdg+9EqiSByOtmN7TJqmlqPH41uoGOSc8nIT5fK5ETjQm3o+JuiYug==`로 확인했다. 기존 lifecycle 허용 정책은 변경하지 않았다.

## 2. Core·MCP·Windows 경계

| 검증 | 판정과 실제 증거 |
| --- | --- |
| child 실행/API | **PASS**. Kiro child exit 0, fetch/WebSocket 존재 |
| SQLite prebuild | **PASS**. win32-x64 driver load, disk transaction commit/rollback, 한글 값 재조회, close/reopen `quick_check=ok` |
| 실제 Core | **PASS**. migration/reopen, loopback HTTP, SDK health·Project 조회. worker 미연결 stub은 실행 시 오류를 내며 native 성공으로 계산하지 않음 |
| 인증 | **PASS**. 인증 없는 Core 요청 401 |
| SDK stdio MCP | **PASS**. initialize → tools/list → tools/call → 실제 Core context. role 전체 catalog Discovery 6, Builder 7, Helper 1 |
| scope 거절 | **PASS**. 다른 Project 요청 `AGENT_RUN_SCOPE_MISMATCH`; Helper의 Decision mutation 도구 호출 거절 |
| native turn의 최소 catalog | Discovery는 Core 2개, Builder는 read/write/shell 및 Core 2개. Helper는 **빈 catalog**; Core가 context를 조회해 전달 |
| revoke | **PASS**. SDK bridge의 revoke 뒤 호출 거절, live run 종료/취소 후 binding HTTP 401 및 descriptor `REVOKED` |
| ACL·경로 | **PASS**. private DACL/현재 owner 검사, 한글·공백 경로의 Core/bridge 실행, junction·hardlink·Everyone-readable 합성 descriptor 거절 |
| 종료 감사 | **PASS**. 마지막 run의 DB 3개 read-only reopen, 모두 `quick_check=ok`, foreign key 위반 0. descriptor 6개 회수, 소유 profile Kiro process 0 |

진단 자료와 합성 DB는 OneDrive 밖의 private 임시 root에 보존했다. repository에는 버전·count·state·시각·hash·synthetic receipt ID만 옮겼다. credential, 연결 descriptor 원문, 사용자 SID/절대 경로, raw IDE log, DB, 모델 대화 원문은 포함하지 않았다.

permission callback은 owned session/toolCallId를 대조하고 두 파일의 정확한 write와 `node --test src/native-event.test.ts` 한 명령만 allow-once했다. 그 외 search/execute 요청은 reject-once ACK로 기록했다. 이는 **bounded guard 검증**이며 Windows OS-level shell confinement을 입증한 것은 아니다.

## 3. 승인된 native 8회 결과

Discovery와 Builder는 **서로 다른 합성 Core fixture**다. Discovery→Spec→Builder가 이어진 제품 수직 흐름으로 표시하지 않는다. canonical Discovery 1.3.5 / Helper 1.2.0을 포함한 Agent prompt 정책과 version은 변경하지 않았다.

| Turn | 실행 | 결과 |
| --- | --- | --- |
| 1 | custom Helper | **PASS**. 4,370ms, 29 chunks, tool-less 답변 99자를 실제 Core에 저장 |
| 2 | Discovery PREVIEW | **PASS**. 40,089ms, Core preview 10개, session revision 1; 선택·Spec 단계는 실행하지 않음 |
| 3 | Builder 취소 | **PASS**. native `cancelled` 239ms, Core `CANCELLED`, binding 401 |
| 4 | Builder 재실행 | **PASS**. 두 TypeScript 파일 작성·허용 테스트 실행, native `end_turn` 89,294ms, Core `SUCCEEDED`, Context v2 |
| 5 | 같은 창 custom Helper | 응답·Core 저장은 **PASS**, 병행은 **FAIL**. Builder 뒤에야 첫 응답이 도착 |
| 6 | 별도 창과 함께 Builder | **PASS**. 76,874ms, 파일 2개, native execute receipt exit 0, Core `SUCCEEDED`, Context v2 |
| 7 | 별도 창 Helper 취소 | **PASS**. native `cancelled` 284ms, Core `CANCELLED`, binding 401 |
| 8 | 별도 창 Helper 재실행 | **PASS**. 4,004ms, Core `SUCCEEDED/HELPER_RECORDED`; Builder 진행 중 종료 |

Discovery preview round: `candidate_preview_round_6745b037-6c34-4fa3-a8ea-5fd96240e0d7`.

최종 별도 창 run의 Core receipt:

- Builder: `run_1a69d5f9-67a0-4295-85a1-059d3cf75c5a` → `SUCCEEDED/TURN_ENDED`.
- Helper cancel: `run_3251e60c-4beb-427e-bb4a-569bad71612a` → `CANCELLED/NONE`.
- Helper reuse: `run_32eedc7a-59be-4584-9e3f-bf6f6d2def58` → `SUCCEEDED/HELPER_RECORDED`.

취소 뒤 재사용은 **새 native session으로 다음 Core run이 성공**한 관측이다. 동일 native session 재사용이나 제품 panel의 세션 수명주기 검증으로 확대하지 않는다. Helper turn 5는 최신 Context v2를 읽었고, 병행 turn 8은 Builder가 첫 Context를 publish하기 전의 실제 Core snapshot(v0)을 읽었다. 존재하지 않는 진행 context를 성공으로 꾸미지 않았다.

### 병행·stream 판정

첫 단일 창 실험에서 Builder terminal은 epoch ms `1790181854397`, Helper 첫 chunk는 `1790181856773`이었다. 요청 구간만 겹쳤고 실제 응답은 뒤따랐으므로 병행 FAIL이다.

분리된 창에서는 Builder `windowId=1`, Helper `windowId=2`를 관측했다. Builder 시작을 0으로 한 실제 시각:

| 사건 | 경과 ms |
| --- | ---: |
| Builder 첫 chunk | 3,171 |
| 재실행 Helper prompt 시작 | 3,375 |
| Helper 첫 chunk | 5,923 |
| Helper terminal | 7,379 |
| Builder terminal | 76,874 |

Builder 135 chunks, Helper 13 chunks가 관측됐고 각 마지막 chunk는 terminal보다 192ms/783ms 앞섰다. native observer → Core `onEvent` 경로를 실제 사용하며 text는 줄 단위 buffer에서 redaction한 뒤 전달하고 Tool event는 kind/status만 전달했다. 짧고 줄바꿈 없는 Helper text는 안전한 buffer flush 시점에 묶여 전달될 수 있다. 이 시각은 **native 수신 시각**이며 완성 제품 Webview의 paint latency나 전체 SSE 화면 검증으로 표현하지 않는다. 기존 Core stream/redaction 회귀는 별도로 통과했다.

### 한 창 protected built-in Helper를 사용하지 않은 이유

설치 source의 `ExperimentsService.isEnabled`는 승격 목록을 먼저 검사한다. 이 버전의 목록에는 `agentArtifacts`가 있고, `getClientTools`가 `ToolCreateArtifact`를 추가한다. 해당 artifact tool은 기존 capability mapper의 차단 대상으로 확인되지 않았다. stable `getExperiments`가 빈 객체여도 이 기능이 OFF라는 과거 Mac 가정은 성립하지 않는다.

따라서 **기존 protected built-in 경로는 이 Windows 조합에서 UNSUPPORTED**로 두고 모델을 호출하지 않았다. vendor 수정·실험 플래그 변경·보안 gate 삭제는 하지 않았다. 별도 Development Host의 custom Helper empty catalog와 all-deny를 모델 없이 먼저 확인한 뒤 남은 3회만 실행했다. 두 창 제품 UX를 채택한 결정은 아니며 W2/W3에서 별도 설계 판단이 필요하다.

## 4. 원래 실패 기록과 후속 확인

원본 host report `36c528e4-bc6d-4e54-97d3-b72f276bc2b8`의 최종 `builder.status`는 **FAIL**이다. native 3개 run과 권한/병행/파일 검사는 통과했지만, 독립 `node --test` 검증에서 exit 0 뒤 stdout에 `# fail 0`이 있으리라 가정한 assertion이 실패했다. 기본 reporter 출력은 TAP이 아니었다. 이 원본을 PASS로 덮어쓰지 않았다.

후속 `audit-windows-host.mjs`는 기록된 SHA-256과 같은 두 파일을 찾아 **동일 Kiro runtime에서 `--test-reporter=tap`으로 다시 실행**했다. 결과는 exit 0, **9 passed / 0 failed**다. DB/ACL/terminal/revoke 감사도 통과하여 별도 `followupAudit.status=PASS`를 기록했다. 이 재검증은 모델 turn을 쓰지 않았다. harness는 이후 TAP을 명시하고 native gate 실패가 Core 성공으로만 합산되지 않도록 보강했다.

재현 중의 다른 실패도 구분한다.

- extension test mode의 workspace trust가 false였으므로 사용자가 신뢰·로그인한 activation mode로 전환했다. UI 접근 timeout 때 신뢰 상태를 직접 확인했다고 주장하지 않았다.
- 처음 발견한 Windows cloud session bucket 불일치는 설치 source의 drive 경로 slash/lowercase 정규화를 반영해 해결했다.
- 새 창 실행에서 Electron Node 모드 상속과 동일 extension-development 경로 재사용이 나타났다. child 환경에서 해당 모드를 제거하고 합성 root에 별도 metadata 확장 identity/path를 두어 해결했다. 실패 시 모델은 호출하지 않았다.
- E2E 최초 실행은 Chromium 미설치로 실패했다. 승인된 전용 browser 폴더에 Playwright 대응 Chromium을 준비한 뒤 최종 check를 통과했다.
- 마지막 전체 check 첫 시도는 새 감사 스크립트 format에서 멈췄다. formatter 적용 후 전체 check를 다시 통과했다.

## 5. 변경과 회귀

| 변경 | 이유·검증 |
| --- | --- |
| private directory/descriptor ACL 검사 | POSIX uid/mode만으로 Windows를 거절하던 조건을 현재 owner와 보호된 DACL 검사로 대체. 과도한 ACL을 묵시적으로 고치지 않음. junction/hardlink/readable descriptor negative test |
| cloud bucket 경로 정규화 | 설치된 Windows source와 같은 slash/lowercase hash. Windows 대소문자·POSIX 대소문자 구분 test |
| Crew prompt/경로 portability | CRLF→LF canonical prompt 처리, build 산출물 path guard에 platform separator, smoke path에 posix relative representation |
| fixture portability | Windows directory alias는 junction, file alias는 hardlink로 실제 거절 검사. ACL 작업 완료를 고정 sleep 대신 조건 polling |
| native-runtime test seam | 접근 검사 주입을 명시해 Mac Homebrew 실제 파일 존재에 의존하지 않는 test. 제품 기본 access 검사·exact pin은 그대로 |
| 진단·감사 | `examples/windows-capability`, `probe-windows-host.mjs`, `audit-windows-host.mjs`. 모델 turn ledger와 source SHA pin |
| 생성 파일 | LF 정책 `.gitattributes`, 생성 panel runtime은 `.gitignore`; 원본 prompt 내용/정책 불변 |

최종 검증 command와 결과:

| 명령/검증 | 결과 |
| --- | --- |
| `pnpm preflight`, `pnpm install --frozen-lockfile` | PASS |
| `pnpm check` | **exit 0**: format/lint/typecheck/db, unit 91, integration 270 + 기존 skip 1, eval 34, Campus Drop 3, build, smoke 6, E2E 12 |
| `pnpm panel:build` | exit 0 |
| 관련 panel CJS 4개 파일 | 18 passed; native-runtime, native-installation-source, protected-lifecycle, single-host-capability |
| 실제 생성 파일 TAP 감사 | 9 passed, exit 0; native execute receipt도 exit 0 |
| 최종 소유 Kiro process | 0; 사용자 일반 창을 대상으로 종료하지 않음 |

관련 CJS 명령:

```powershell
node --test examples/kiro-panel/test/native-runtime.test.cjs examples/kiro-panel/test/native-installation-source.test.cjs examples/kiro-panel/test/protected-lifecycle.test.cjs examples/kiro-panel/test/single-host-capability.test.cjs
```

E2E는 기존 Core/Crew browser 회귀이며 실제 native 모델의 전체 수직 흐름을 대체하지 않는다. 기존 Mac live PASS는 과거 baseline으로 보존하고 이번 Windows test로 재검증했다고 표시하지 않는다.

## 6. 다음 단계

W1의 필수 runtime/Core/bridge/역할별 native/Windows 경계/취소·새 실행/병행 gate를 위의 구분된 근거로 충족했다. **T19-W1 `[x]`, T19-W2만 `[>]`**로 둔다. T19 `[-]`와 T19-N `[~]`의 미완료 범위는 그대로다. W2 구현은 이번 작업에서 시작하지 않았다.

W2는 Kiro child 재사용을 첫 portable runtime 후보로 삼을 수 있다. 다만 제품 source/runtime descriptor, source checkout 없는 SQLite·migration·prompt package, offline/download/corruption, 자동 lifecycle은 아직 없다. 생성 앱 Node/pnpm은 이번 테스트의 process PATH를 사용했으므로 W4의 자동 도구 준비도 미완료다.

W3에서 한 창 protected Helper의 버전 변화와 두 창 방식의 수명주기/UX를 명시적으로 해결해야 한다. 현재 Windows source에 기존 Mac single-host gate를 무조건 확대해서는 안 된다. 일반 설치/clean Windows, Analyst 의미 품질, 실제 사용자 Evidence, 결과 앱 전체 실행과 다음 개인화는 W5/T19-N의 후속 검증이다. 추가 live 실험은 **8회 한도를 모두 사용했으므로 새 승인**이 필요하다. commit/push/IDE 변경은 수행하지 않았다.
