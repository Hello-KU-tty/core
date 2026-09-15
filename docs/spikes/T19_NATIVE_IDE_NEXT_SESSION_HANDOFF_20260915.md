# T19-N 다음 세션 인계

> **최신 continuation:** 이 문서 이후의 package/reconnect와 clean Evidence 상태는 [T19_NATIVE_P1_P2_CONTINUATION_20260915.md](T19_NATIVE_P1_P2_CONTINUATION_20260915.md)를 먼저 읽는다.

작성 기준: 2026-09-15 12:02 KST. 이 문서는 `/new` 뒤 현재 bounded 결과를 잃지 않고 다음 검증 묶음으로 이어가기 위한 작업 인계다.

## 다음 세션의 첫 행동

1. repository root의 `AGENTS.md`를 먼저 확인한다.
2. 문서 우선순위대로 [PROJECT_BRIEF](../../PROJECT_BRIEF.md) → [SPEC](../SPEC.md) → [ARCHITECTURE](../ARCHITECTURE.md) → [DECISIONS](../DECISIONS.md) → [TASKS](../TASKS.md)를 읽는다.
3. T19 현황은 [중간 현황](T19_NATIVE_IDE_INTERIM_STATUS_20260915.md) → [IDE adapter 계약](T19_NATIVE_IDE_ADAPTER_CONTRACT_20260915.md) → [마지막 8시간 상세 보고](T19_NATIVE_IDE_ONLY_LAST_8H_20260915.md) 순서로 읽는다.
4. 현재 시간과 두 worktree의 branch·HEAD·status, runtime lock·connection·health·SQLite metadata와 active run/job/binding을 읽기 전용으로 다시 확인한다.
5. Kiro 창·workspace·extension host·panel·앱 server는 root만 Computer Use로 다시 관찰하며 아래 역사적 PID, port, windowId와 agent ID를 현재값으로 가정하지 않는다.
6. support boundary를 판정한 뒤 P1→P2 계획부터 시작하고, 사용자의 새 명시 요청 없이 새 goal이나 시간 budget을 만들지 않는다.

## 역할과 협업 방식

- root agent는 계획, 범위 판단, 승인 경계, 최종 검증과 보고를 소유한다.
- 실제 Kiro UI와 브라우저 Computer Use는 root만 수행한다.
- 실제 구현과 문서 작성은 사용자 지시대로 Sol 계열 xhigh agent에게 구체적이고 독립적인 하위 작업으로 배정한다.
- 기존 agent ID 재사용을 가정하지 않는다. 가용하면 사용자 승인 모델 `gpt-5.6-sol`, `reasoning_effort=xhigh`로 새 Sol을 만들 수 있지만 독립 작업과 파일 소유권·완료 조건을 먼저 적는다.
- 단순 상태 확인이나 하나의 작은 문서 수정 때문에 불필요한 하위 agent를 만들지 않는다.
- shared worktree의 변경은 즉시 보이므로 같은 파일을 동시에 수정하지 않고, 모델·Core job·backend restart·panel bundle 시점은 root가 조율한다.

## Git과 작업 공간 기준선

- 원본 repository: `/Users/hurdoo/coding/projects/vibe-helper`.
- 분리 worktree: `/Users/hurdoo/coding/projects/vibe-helper/.local-experiments/kiro-native-recovery`.
- 2026-09-15 12:02 KST 당시 원본은 clean `main`, recovery는 `codex/kiro-native-recovery-20260913`, 양쪽 HEAD는 `c8b342532f331ccf1e0ca77944ebc4aefc1913f9`였다.
- recovery에는 tracked 수정 45개와 여러 untracked 문서·adapter·test가 있다. 여러 날의 T19 실험이 섞인 보존 대상이다.
- 사용자 변경을 reset, checkout, clean, stash 또는 삭제하지 않는다.
- `/private/tmp/vibe-helper-native-impl-8f429f44`는 gitdir이 사라진 prunable 항목이며 사용 경로가 아니지만 prune하거나 삭제하지 않는다.
- commit과 push는 요청하지 않았으므로 하지 않는다.

## 최신 판정

**pin한 macOS Dev Host에서 한 Kiro 창의 Builder와 late Helper 병행은 실제 성공했다.**

Kiro IDE 1.0.437 / Agent extension 1.0.794의 같은 Extension Development Host `windowId=4`에서 W Builder의 파일 변경 중 H Helper가 뒤늦은 질문에 답했고 Builder가 계속 진행했다.
과거 별도 H 창을 사용한 두 창 결론은 역사적 실험이다. 현재 확인된 한 창 경로를 부정하지 않는다.

외부 Agent CLI가 이 동시성에 기술적으로 필수라는 명제는 기각됐다.
광범위한 child-agent·queue 가능성 탐색을 다시 시작할 필요는 없다.
관련 adapter 변경 뒤 정해진 동시성 회귀를 수행하면 된다.

다만 제품 철학 전체, 일반 배포, Evidence 의미, 실제 Decision, 반복 운영, 결과물 품질과 CLI cutover는 미완료다.
CLI 기본 경로 교체 판단은 유보한다.
8시간 bounded 평가는 feasibility와 한계를 판정해 완료됐지만 T19-N은 `[~]`, MVP는 미완료다.

완료된 goal의 실제 경과는 7시간 23분 17초였다. 이는 과거 기록이며 새 8시간 승인이나 새 budget이 아니다.

완료 objective는 단순 동시성이 아니라 PROJECT_BRIEF의 제품 철학과 Builder 중 독립 Helper를 만족하는 IDE-only 경로를 구현·실측하고 가능·불가·미검증을 판정하는 것이었다.

## 현재 한 창 경로

- backend opt-in은 `VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H=1`이다.
- `VIBE_NATIVE_PERSISTENT_DIAGNOSTICS=1`은 실험 receipt 계측이며 제품 기능 필수 조건이 아니다.
- W는 생성 Project workspace의 custom Discovery/Builder session이고 H는 같은 window/host의 승인된 helper cwd에 둔 built-in Helper/Analyst session이다.
- H Helper와 Analyst는 W Builder `session/new` 전에 준비한다.
- H 각 session에 `all deny`를 seed하고 policy explain, catalog, hook, cloud pull, memory와 feature flag를 검사하며, barrier와 W-open 이후 attestation을 통과해야 prompt를 허용한다.
- session 준비·role 전환과 관련 구현 또는 Kiro 버전 변경 때 이 gate를 다시 실행한다.
- Helper와 Analyst 직렬화는 adapter의 보수적 선택이다. W/H 동시 모델 실행과 H 내부 직렬화는 다른 판정이며 Kiro의 본질적 제한으로 주장하지 않는다.
- private mux/ACP observer는 설치 source와 버전에 pin하고 불명확하면 fail-closed한다. private API를 무조건 불가능하다고 단정하거나 공개 API만 유일한 해법으로 정하지 않는다.
- deterministic Core, local backend, SQLite와 stdio bridge는 별도 로컬 비-Agent 프로세스로 남는다.
- Agent CLI 없음과 전체 단일 프로세스는 같은 주장이 아니다.
- CUA는 평가 구동 도구일 뿐 제품 runtime이나 두 번째 Helper host가 아니다.
- `examples/kiro-panel-helper-host`의 두 host 경로는 역사적 실험이며 현재 검증 경로가 아니다.

## 이미 수정하고 실제 확인한 것

- Core가 Evidence 두 인용 필드의 cited USER_MESSAGE exact substring을 검사하며, 잘못된 인용은 `INVALID_REFERENCE`로 거절하고 정확한 인용은 실제 수락 경로를 통과시켰다.
- lexical 5건이 같은 Task USER Evidence를 굶기던 문제를 고쳐 Task USER 최대 2건, lexical, 나머지 Task 근거 순으로 전체 5건을 채운다.
- 수정 뒤 같은 실제 G 질문의 UI trace에서 USER_UNDERSTANDING 2건과 lexical 3건 전달을 확인했다.
- 이는 인용·전달 경계의 PASS이지 Evidence 의미나 개인화 효과 PASS가 아니다.
- D Preview 11건 실패에는 strict count를 유지하는 bounded 구조화 오류 경계를 추가했다.
- Builder 600초 미확인 cancel 앞에 최대 590초 soft cancel을 두고 소유 terminal ACK를 구분하며, 확인된 budget cancel도 성공으로 바꾸지 않는다.

## 남은 Evidence와 개인화 한계

- 미래 검증 계획을 `APPLICATION/DEMONSTRATED`로 수락한 의미 과대평가가 있었다.
- 설명을 `JUSTIFIED_DECISION`으로 수락했지만 실제 대안 선택이 없는 사례도 있었다.
- 기존 오수락 Evidence와 파생 state는 소급 수정하지 않고 보존했다.
- 전달 개선은 오염된 Evidence를 더 잘 노출할 수 있으므로 truth 개선과 구분한다.
- A′/B 두 쌍에서 B는 `personalization`과 `relevantLedgerEntries`만 제거했고 `recentEpisodes`의 USER excerpt와 Helper response summary는 남았다.
- 따라서 B는 no-history/no-Evidence 대조군이 아니라 curated Ledger 두 필드 제거 조건이다.
- 두 비교에서 다음 검증 추천은 대체로 같아 뚜렷한 개인화 행동 이득이 관찰되지 않았다.
- 같은 synthetic DB와 오염 Evidence로 A/B 횟수를 늘려 효과를 주장하지 않는다.
- 다음 사례는 합성/실제 provenance와 힌트 의존도를 명시하고 실제 행동·자기 설명, request-only 문장, 미래 계획을 분리한다.
- 깨끗한 Evidence가 다음 Helper와 unseen Discovery에 실제로 유용한 차이를 만드는지 확인해야 한다.

## 알려진 운영·제품 결함

- backend restart 뒤 열린 panel은 이전 token 때문에 `LOCAL_AUTH_FAILED`였고 같은 창의 새 panel은 복구됐지만 자동 인증 갱신은 구현되지 않았다.
- 저장된 Core 상태·작업 화면·새 요청 인증 복원이 필요하며 진행 중 작업과 충돌하면 안 된다.
- 진행 중 native stream reattach는 현재 MVP 필수 완료 조건이 아니다.
- G Builder는 600초 cancel 미확인, 590초 cancel 확인을 거쳐 세 번째 turn과 수동 follow-up 뒤 Core completion에 도달했다.
- 이는 선택한 복구 경로의 성공이며 무개입·저마찰·장기 안정성 증거가 아니다.
- Kiro native Builder shell은 Node 26.4.0, 프로젝트 계약과 독립 검증은 Node 24.19.0이었다.
- 원본 G의 frozen install은 esbuild policy로 실패했고, 별도 app-only copy에서 `allowBuilds.esbuild=true`만 적용한 frozen install과 후속 검증은 통과했다.
- 이 해결은 원본 G에 적용되지 않았으며 승인된 후속 Task가 필요하다.
- E에는 기본 날짜 timezone, F에는 entity를 섞은 위험 URL sanitizer, G에는 작은 방의 가구 overflow 결함이 남았다.
- G localStorage는 같은 origin reload에는 유지됐지만 backend restart 뒤 새 port origin에는 이어지지 않았다.
- Discovery v1.3.5 unseen 결과의 사람 평가는 유망 2, 조건부 4, 약함 4였다.
- 이 품질 결함들은 MVP를 막지만 한 창 W/H transport의 가능성을 다시 미확인으로 만들지는 않는다.

## 승인과 안전 경계

- 신뢰가 승인된 범위는 `/Users/hurdoo/Library/Application Support/VibeHelper/NativeExperiment-20260913/debug-launcher`와 `/Users/hurdoo/Library/Application Support/VibeHelper/NativeExperiment-20260913/runtime/workspaces`다.
- 원본 repository, 상위 폴더 또는 다른 workspace로 trust를 확대하지 않는다.
- E의 제품 Decision 선택은 자동 검토가 두 번 거절됐고 F 보안 Decision은 선택 시도 없이 보류했다. G 후속 Task 준비와 Kiro reload도 자동 검토가 거절됐다.
- 이 네 경계는 IDE 기능 실패로 기록하지 않는다.
- 거절된 선택이나 Task를 다른 panel action, API, Core call 또는 직접 파일 수정으로 우회하지 않는다.
- 새 사용자 승인 없이는 해당 행동을 실행하지 않고 독립적인 source·test·문서 준비를 계속한다.
- runtime SQLite를 직접 seed, update, delete하거나 기존 Evidence·Decision을 정정하지 않는다.
- 정상 승인 UI→Core 흐름과 직접 DB 변조를 구분한다.
- connection/token/credential 값을 출력하지 않고 connection·binding descriptor의 0600 권한을 유지한다.
- `/private/tmp`의 기존 artifact와 directory는 삭제하지 않는다.
- 설치 Kiro, global profile, permission, hook와 사용자 데이터는 임의로 바꾸지 않는다.
- commit, push, remote 변경은 요청 전 수행하지 않는다.

## runtime 위치와 역사적 snapshot

- runtime root: `/Users/hurdoo/Library/Application Support/VibeHelper/NativeExperiment-20260913/runtime`.
- SQLite metadata 경로: 위 root의 `data/vibe-helper.sqlite`.
- connection descriptor와 backend lock은 위 runtime 안에 있다.
- repository 계약은 Node 24.19.0과 pnpm 11.12.0이다. 다음 세션은 설치된 Node 절대 경로와 실제 launch owner를 읽기 전용으로 확인한다.
- `core:native`는 `pnpm preflight` 뒤 local backend를 `native` 모드로 시작하며 native entry는 `start(false, true)`를 사용한다.
- `panel:build`는 typecheck 뒤 `scripts/build-kiro-panel.mjs`를 실행한다.
- 재시작할 때는 위 runtime을 명시적 `--root`로 사용하고 `VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H=1`을 유지해야 한다.
- 현재 backend owner와 idle을 확인하지 않고 재시작하거나 기본 `.data/local`에 새 DB를 만들지 않는다. 동작 명령은 현재 launch source를 확인한 뒤 정한다.
- 2026-09-15 07:36 KST 마지막 감사 때 backend PID는 37581, port는 58498이었다.
- 당시 backend는 `READY`, G app server는 57196, native binding은 113/113 `REVOKED`, Analysis active는 0이었고 SQLite `quick_check=ok`, connection·lock mode는 0600이었다.
- 이 값은 모두 **역사적 snapshot**이며 `/new` 뒤 현재 PID, port, instance, binding, job 또는 app 생존을 뜻하지 않는다.
- 다음 세션은 token을 출력하지 않는 read-only health/metadata 검사로 현재값을 다시 구한다.
- 역사적 `windowId=4`와 extension host PID도 재사용을 가정하지 않는다.

## 마지막 검증 이력의 정확한 표현

- 한 번의 전체 `pnpm check`는 format, lint, typecheck, DB, unit, integration, eval, build와 smoke를 통과한 뒤 E2E 단계에서 멈췄다.
- 해당 E2E는 test assertion 전 sandbox의 macOS `MachPortRendezvous` 권한 오류로 Chromium을 시작하지 못했다.
- 따라서 그 `pnpm check` 전체 명령이 exit 0이었다고 쓰지 않는다.
- 같은 코드의 별도 허용된 GUI 환경 Playwright E2E는 12/12 통과했다.
- 마지막 Helper basis Core 수정은 Node24 integration 263/263, typecheck, build, format과 diff-check를 통과했다.
- 개별 시점의 eval·panel·focused test 수치는 [상세 보고](T19_NATIVE_IDE_ONLY_LAST_8H_20260915.md)를 따른다.
- 문서만 바꾸는 이번 인계에는 새 test가 필요하지 않다.
- 다음 변경은 해당 파일 범위의 focused 검증 후 필요한 경계만 넓힌다.

## 다음 작업의 유한한 순서

1. 승인 불필요한 P1 source·VSIX packaging·reconnect 설계를 현재 support boundary에 맞게 준비한다.
2. P2 Evidence 의미 경계의 fixture, Core acceptance와 clean personalization 평가 계획을 준비한다.
3. 변경 전 현재 Kiro/version/workspace/runtime 상태를 다시 관찰하고 source-pin 전제를 확인한다.
4. P1·P2의 reviewable 구현과 focused test가 준비되면 기존 사용자 승인과 도구 권한 범위 안에서 적용한다.
5. P3 최소 회귀 묶음으로 한 창 Builder+late Helper를 3회 확인한다.
6. P3에는 H confirmed cancel 재사용, Builder budget 실패 뒤 pair 재준비·Task 재개를 포함한다.
7. 매 H session 준비의 deny/catalog/hook/cloud/memory gate와 terminal 뒤 binding revoke를 확인한다.
8. 3회 결과는 lifecycle 회귀일 뿐 장기 안정성·latency SLA 통계로 확대하지 않는다.
9. 사용자 승인 가능한 시점에 P4 실제 Decision→Core application→Builder 재개를 한 lineage로 확인한다.
10. P4에는 Personal Need 유·무 unseen Discovery와 대표 결과물 실행·restart 저장·알려진 결함 회귀를 포함한다.
11. 대상 Windows 환경이 준비되면 P5에서 핵심 P1·P3를 반복한다.
12. 대표 Task의 CLI/IDE 완료율, 지연, retry와 운영 비용을 비교하고 rollback을 확인한다.
13. P1~P5의 권위 있는 통과 조건은 [중간 현황](T19_NATIVE_IDE_INTERIM_STATUS_20260915.md)을 따른다.
14. 이 순서는 새 무한 탐색 목록이 아니며 완료 조건을 충족한 package는 다시 가능성 탐색으로 되돌리지 않는다.

## 코드와 문서 지도

- 제품 원칙·범위: [PROJECT_BRIEF](../../PROJECT_BRIEF.md), [SPEC](../SPEC.md), [TASKS](../TASKS.md).
- 현황·판정: [중간 현황](T19_NATIVE_IDE_INTERIM_STATUS_20260915.md), [8시간 상세 보고](T19_NATIVE_IDE_ONLY_LAST_8H_20260915.md).
- 책임·실행 순서: [IDE adapter 계약](T19_NATIVE_IDE_ADAPTER_CONTRACT_20260915.md).
- quote 정책: [Evidence 인용 경계](T19_NATIVE_EVIDENCE_QUOTE_BOUNDARY_20260915.md), [`evidence-policy.ts`](../../packages/domain/src/evidence-policy.ts).
- Helper context·personalization: [`application-service.ts`](../../packages/application/src/application-service.ts), [`repository.ts`](../../packages/storage-sqlite/src/repository.ts).
- backend job·binding: [`native-agent-relay.ts`](../../apps/local-backend/src/native-agent-relay.ts), [`native-core-binding.ts`](../../apps/local-backend/src/native-core-binding.ts).
- panel lifecycle: [`extension.cjs`](../../examples/kiro-panel/src/extension.cjs), [`native-worker.cjs`](../../examples/kiro-panel/src/native-worker.cjs).
- private session gate: [`native-client.cjs`](../../examples/kiro-native-host/native-client.cjs), [`native-protected-tools.cjs`](../../examples/kiro-native-host/native-protected-tools.cjs).
- cloud·memory gate: [`native-cloud-pull-attestation.cjs`](../../examples/kiro-native-host/native-cloud-pull-attestation.cjs), [`native-memory-attestation.cjs`](../../examples/kiro-native-host/native-memory-attestation.cjs).
- stdio/Core transport: [`native-core-stdio-bridge.mjs`](../../scripts/native-core-stdio-bridge.mjs), [`role-server.ts`](../../apps/mcp-server/src/role-server.ts).
- Agent source: [`docs/agent-prompts`](../agent-prompts/), [Discovery v1.3.5 평가](../../tests/eval/results/discovery-agent-v1.3.5.md).

## 다음 세션에 붙일 짧은 prompt

```text
분리 worktree /Users/hurdoo/coding/projects/vibe-helper/.local-experiments/kiro-native-recovery 를 재사용해 T19-N을 이어가 주세요.
먼저 /Users/hurdoo/coding/projects/vibe-helper/.local-experiments/kiro-native-recovery/docs/spikes/T19_NATIVE_IDE_NEXT_SESSION_HANDOFF_20260915.md 를 읽으세요.
현재 Git·시간·runtime·Kiro UI를 read-only로 다시 관찰하고 역사적 PID/window/port를 가정하지 마세요.
root는 계획·판정·검증과 Computer Use만 맡고, 실제 구현·문서는 가용하면 gpt-5.6-sol reasoning_effort xhigh에 구체적 파일 소유권을 주어 배정하세요.
한 창 Builder+late Helper 가능성은 이미 확인됐으므로 광범위한 경로 탐색을 재시작하지 말고,
INTERIM_STATUS의 P1 packaging/reconnect와 P2 Evidence 계획부터 유한한 통과 조건으로 진행하세요.
CLI 기본 경로, 원본 clean repository, dirty recovery worktree와 기존 DB/Decision/Evidence를 보존하세요.
새 사용자 승인 없이 거절된 Decision·Task·reload를 UI/API/직접 수정으로 우회하지 마세요.
새 goal이나 시간 budget은 제가 명시적으로 요청할 때만 만드세요.
```
