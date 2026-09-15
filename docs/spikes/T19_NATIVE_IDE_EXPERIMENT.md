# T19-N: Kiro IDE 내장 Agent 실행기 실험

> 2026-09-12, 분리 worktree `codex/kiro-native-integration-8f429f44`의 실측과 설치본 변경 후 재측정. T19 전체 완료 또는 제품 기본 실행기 변경이 아니다.

> 이 문서는 초기 IPC/MCP 조사 당시 상태를 보존한다. 뒤이어 stdio Core 연결과 단계별 실제 native 실행을 검증한 현재 판정은 [전체 흐름 결과](T19_NATIVE_FULL_FLOW_RESULTS.md)를 따른다. 아래의 "미완료"는 초기 조사 시점의 표현이다.

## 결과

초기 설치 Kiro IDE 1.0.337 / bundled `kiro.kiroAgent` 1.0.653 / VS Code API 1.109.5에서 내장 Agent에 연결하는 **비공개** local observer WebSocket/ACP 경로를 찾고, 별도 profile의 합성 custom Agent로 mode 선택, 텍스트 이벤트, `end_turn`, `cancelled` 응답을 실측했다. 후속 설치본은 IDE 1.0.437 / extension 1.0.794 / VS Code API 1.109.5이며 같은 workspace-bound endpoint·mode 선택이 다시 확인됐다. IDE가 제공한 endpoint handle은 정확히 일치하는 합성 workspace에서만 메모리 내 사용했으며 Kiro 인증 저장소나 기존 session을 읽지 않았다. 일반 extension API로 제공된 기능이라고 주장하지 않는다.

Core 쪽은 Node 24.19.0 / pnpm 11.12.0의 기존 ApplicationService·SQLite·role-bound MCP를 재사용한다. CLI 실행 파일이 존재하지 않는다고 지정해도 `core-only` backend가 Core API를 열고, Agent run은 `NATIVE_RUNTIME_NOT_ATTACHED` 503으로 차단한다. 별도 disk SQLite의 합성 Builder Task에 project/task/correlation과 종료 수명을 묶은 MCP handler를 등록하고 canonical Builder config를 생성했다. 직접 MCP contract test에서 실제 Core Task read, 다른 project scope 거절, revoke 후 인증 거절을 확인했다.

**내장 Agent→Core MCP 호출은 미완료다.** 초기 전용 profile에서 `kiroAgent.configureMCP=Disabled`, `getCanEnableMCP=false`와 managed-setting 쓰기 오류를 보고 자체 `mcpReady` gate로 prompt 전에 중단했으나, 이 판정은 실제 연결 실패의 증거가 아니었다. 새 설치본의 전용 trusted workspace에 공식 `.kiro/settings/mcp.json`을 추가하니 같은 초기 진단값에서도 합성 stdio 서버가 시작되고 `initialize`·`tools/list`를 받았다. exact custom mode의 합성 read-only turn은 `tools/call`·실제 handler 실행·`end_turn`까지 확인했다. 설정값은 초기화와 관리 설정의 진단값으로만 남기고 자체 선차단을 제거했다. 기존 사용자 profile/설정이나 조직 정책은 변경하지 않았다.

실제 Task-bound HTTP Core 경로는 Kiro의 `server/discover`에 MCP `2026-07-28`와 `tools` capability를 JSON-RPC result로 반환했지만, 이후 `tools/list`·`tools/call`과 Core `executeAgent` receipt는 없었다. 그 turn의 redaction된 Agent 응답도 `get_builder_task`가 현재 도구 목록에 없다고 밝혔다. 따라서 Core Task read는 미검증이며 HTTP modern handshake의 후속 등록 문제와 안전한 stdio Core 구성 중 하나를 다음 단계에서 해결해야 한다. 공식 SDK v2는 `server/discover`를 2026-era 협상으로 정의하므로 이를 곧바로 프로토콜 불일치라고 단정하지 않는다.

| 능력 | 이번 실측 | 한계 |
|---|---|---|
| IDE custom Agent 로딩 | 이전 버전은 목록 id, 새 버전은 ACP mode option·선택 응답 확인 | 일반 workspace trust UI 초기화는 별도 확인 필요 |
| 내장 Agent mode | `session/new` mode 선택지와 `set_config_option` 반환 `currentValue` 일치 | 비공개 version-pinned IPC |
| native invoke / wire stream / 종료 | 합성 무도구 turn에서 `agent_message_chunk`, marker, `end_turn`; 새 버전의 stdio tool turn도 완료 | adapter의 UI 텍스트는 안전상 turn 종료 후 redaction 전달(`AFTER_TURN`), live 텍스트 parity 없음 |
| native cancel | 합성 무도구 turn에서 cancel 요청 뒤 최종 `stopReason=cancelled` | Builder tool·write 중지와 재개는 미검증 |
| CLI 없는 Core | 별도 disk DB에서 Core API와 bound MCP 준비 | native Agent run은 아직 연결되지 않아 503 |
| native MCP 도구 | 새 버전 exact role에서 합성 stdio `tools/call`·handler 실행 확인 | Core HTTP의 실제 `get_builder_task` 호출은 없음 |
| native Builder→Core Task | Task-bound HTTP Core가 `server/discover`/tools capability 응답 | Kiro의 후속 `tools/list`·`tools/call` 및 Core receipt 없음 |
| Builder 파일/Decision | 미검증 | IDE file/shell containment·Core Decision side effect 미검증 |
| Helper·Analyst·Episode·개인화 | Helper 제한 config와 Core catalog만 test | 독립 live Agent session, UI source provenance, Analyst job은 미검증 |
| Windows | 미검증 | T19 기존 Windows gate 유지 |

## 구현 경계

- `examples/kiro-native-host/native-client.cjs`는 설치 버전, canonical 단일 workspace endpoint, trust와 role config를 확인한 뒤 소유한 session 하나만 열고 정확한 mode를 선택한다. 이전 버전의 Agent 목록 명령은 1.0.794에서 제거돼 새 버전은 ACP mode option과 선택 응답으로 역할을 확인한다. `configureMCP`·초기 `getCanEnableMCP`는 기록하지만 실제 attach의 선차단 조건으로 쓰지 않는다. endpoint token은 출력·저장하지 않는다. 동일 numeric id의 서버 요청을 RPC 응답으로 오인하지 않으며 지원되지 않는 client 요청을 받으면 연결을 닫는다.
- 취소 요청은 확인으로 세지 않는다. `stopReason=cancelled`일 때만 `NATIVE_CANCELLED_CONFIRMED`로 분류하고 응답이 없으면 `NATIVE_CANCEL_UNCONFIRMED`로 실패한다. 원시 text chunk는 callback에 전달하지 않고 최대 1 MiB의 turn 텍스트를 공통 redactor로 처리한 뒤 반환한다. `textDelivery=AFTER_TURN`이므로 기존 Builder live UI와 동등하지 않다.
- `apps/local-backend/src/native-core-binding.ts`는 Builder의 기존 7개 Core tool 또는 선택한 부분집합, Helper의 `get_helper_context`만 허용한다. Handler 자체는 기존 role-bound factory를 사용하며 project/task/correlation·active 수명과 별도 bearer로 제한한다. `core-only --native-role ...`은 저장된 Task와 canonical workspace를 확인한 뒤 전용 descriptor를 만들고 종료 시 credential을 폐기한다.
- `scripts/prepare-native-agent.mjs`는 기존 canonical prompt 버전을 확인하고 IDE에 유효한 config를 생성한다. CLI 전용 `allowedTools`/`toolsSettings`와 범용 도구를 넣지 않고 file/shell을 deny한다. 따라서 현재 Builder는 Core read 실험만 가능하고 실제 파일 쓰기 능력을 갖춘 Builder로 포장하지 않는다. Helper config는 단일 read tool만 가진다. Kiro IDE native hook의 containment는 아직 검증되지 않았다.
- 기존 CLI/Crew `start`의 동작을 유지하고 late MCP handler 등록 회귀를 검증했다. WorkflowRuntime, Analyst worker, Core/MCP contract는 변경하지 않았다. `core-only`는 기존 runtime API를 가짜 native 성공으로 연결하지 않는다.

## 재현

분리 worktree에서 고정 toolchain으로 실행한다. 아래 스크립트는 새 합성 profile/workspace/DB를 만들고 기존 사용자 DB/workspace/config를 사용하지 않는다. Kiro 실행에는 설치된 `/Applications/Kiro.app/Contents/MacOS/Electron`을 사용하며 `kiro-cli`를 모델 실행기로 호출하지 않는다.

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
pnpm install --frozen-lockfile
pnpm typecheck
node scripts/test-core-only.mjs
node scripts/test-native-ipc.mjs
node scripts/test-native-turn.mjs
VIBE_NATIVE_CANCEL_TEST=1 node scripts/test-native-turn.mjs
node scripts/test-native-core-gate.mjs
node scripts/test-native-mcp-current.mjs
node scripts/test-native-stdio-call.mjs
node scripts/test-native-core-call.mjs
```

마지막 HTTP Core runner는 현재 `NATIVE_CORE_READ_UNCONFIRMED`와 종료 코드 1이 기대 관측이다. `test-native-mcp-current.mjs`는 서버 시작·초기화·목록까지, `test-native-stdio-call.mjs`는 합성 도구의 실제 호출까지 각각 확인한다. 두 성공을 실제 Core Task read로 합치지 않는다.

실제 측정 파일: 초기 role/mode `/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-native-ipc-YjNSyM/result.json`, 무도구 turn `/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-native-turn-TfJWOT/result.json`, cancel `/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-native-turn-o6JVYC/result.json`, 새 버전 mode `/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-native-ipc-eEI5Ou/result.json`, 정상 workspace MCP initialize/list `/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-native-mcp-current-lFn0u4/mcp-events.jsonl`, 합성 stdio tool call `/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-native-stdio-call-TEGhPv/result.json`와 같은 폴더의 `mcp-events.jsonl`, HTTP Core 무호출 `/private/tmp/vibe-native-core-call-14eMJx/verification.json`, modern discovery `/private/tmp/vibe-native-core-call-vWJGhj/verification.json`(NO_PROMPT). 초기 설정 오판은 `/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-native-inline-mcp-kY1bTt/result.json`와 `/private/tmp/vibe-native-core-WqPHqQ/native-result.json`에 남아 있다. 초기 공개 API 조사는 [앞선 격리 probe](/private/tmp/vibe-helper-native-probe-nsxsTxjf/REPORT.md)에 있다. 새 runner는 완료 후 자체 loopback credential을 revoke하고 파일을 삭제하지 않는다.

초기 `pnpm check`는 format/lint/typecheck/Drizzle/unit/integration/eval/Campus/build/smoke까지 통과했다. sandbox의 Chromium MachPort 권한 오류로 E2E 단계에서 종료돼, 같은 worktree의 `pnpm test:e2e`만 정상 브라우저 권한으로 다시 실행해 12/12 통과했다. 후속 version/gate 수정 뒤 native client·preparer·Core binding·server targeted 4파일/16테스트와 신규 CJS syntax 검사를 통과했다. 부모 독립 재실행에서도 초기 native no-tool turn과 관련 test 15개가 통과했다. 전체 check 단일 명령의 성공 exit code는 아직 기록되지 않았고, clean checkout·Windows·일반 사용자 IDE profile은 검증하지 않았다.

## 다음 gate

Kiro HTTP MCP가 modern `server/discover` 이후 Core `tools/list`와 `get_builder_task`를 호출하지 않는 원인을 분리하거나, 성공을 확인한 stdio에 실제 run-bound Core를 안전하게 구성해야 한다. 성공 기준은 **Core `executeAgent`의 scope-valid success receipt**이며 단순 Agent 설명이나 `tool_activity`는 부족하다. 이어 Builder write/shell의 IDE native containment, Decision 요청/결정적 UI 해결/재개, Helper 독립 read-only session, 사용자 UI 원문 provenance와 Episode, 실제 Analyst job·다음 개인화, UI stream parity 및 Windows를 각각 검증해야 한다. 조직 정책이나 일반 사용자의 기존 세션에서 대신 시험하지 않는다.

참고: [Kiro MCP 문서](https://kiro.dev/docs/mcp/), [Kiro MCP configuration](https://kiro.dev/docs/mcp/configuration/), [Kiro custom Agent 설정](https://kiro.dev/docs/custom-agents/configuration-reference/), [MCP TypeScript SDK protocol versions](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md), [Kiro IDE diagnostics](https://kiro.dev/docs/chat/diagnostics/), [VS Code Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust). 문서는 지원 범위 참고이며 위 결과는 설치본 실측으로만 판정했다.
