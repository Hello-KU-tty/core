# Vibe Helper

Vibe Helper는 코딩 초보자가 자기에게 실용적인 TypeScript 서비스를 고르고, Kiro Builder와 함께 실제로 만들며, 필요한 순간 Helper와 대화해 개념을 익히도록 돕는 build-first 개발 환경이다. 제품은 개발을 교육용 단계로 끊지 않고 실제 Decision, 작업 맥락과 사용자 행동에서 나온 Evidence를 다음 설명과 project 추천에 연결한다.

현재 repository는 T00~T18의 승인·구현 결과를 포함한다. Discovery→Learning Spec→Builder/Decision→Helper→Episode 단위 Evidence 분석→다음 개인화→사용자 선택 Final Upgrade→실행 가능한 local 결과까지 하나의 durable 수직 흐름으로 연결돼 있다. 다음 작업은 T19 자체 Kiro IDE 패널과 프론트 실제 연동이며, Discovery·Spec mock 교체부터 Builder·Helper 연결까지 범위가 승인됐다. `spikes/kiro-crew/`의 코드는 외부 기능 경계를 확인하기 위한 폐기 가능한 실험물이다.

## 문서 읽는 순서

1. `PROJECT_BRIEF.md`: 승인된 목표, 범위와 제약
2. `docs/SPEC.md`: 검증 가능한 제품 요구와 완료 조건
3. `docs/ARCHITECTURE.md`: system boundary, data flow와 test 전략
4. `docs/DECISIONS.md`: 승인된 판단, 제안과 spike 항목
5. `docs/TASKS.md`: MVP 이전·대회 제출 전·대회 이후 실행 순서
6. `docs/agent-prompts/`: Discovery, Builder, Helper와 Evidence Analyst의 prompt 계약

`PROJECT_SPEC.md`와 `CONVERSATION_RECORD.md`는 합의의 상세 배경을 보존하는 참고 자료다.

2026-09-23부터의 다음 작업은 [Windows 확장 설치·런타임 인계](docs/WINDOWS_EXTENSION_HANDOFF_20260923.md)다. 주 사용 환경은 Windows이며 Kiro 확장 설치만으로 Core와 native worker를 자동 준비하는 것이 제품 목표다. Kiro 내장 runtime → 기존 호환 Node → 필요한 경우 private runtime 자동 준비 순서로 검증한다. native recovery `21674e8`에서 분기한 `codex/windows-extension-runtime-20260923`에서 이어가며 Windows 지원·설치물은 아직 미검증/미제작이다.

프론트 담당자는 [IDE-only frontend 가이드](docs/FRONTEND_IDE_IMPLEMENTATION_GUIDE.md)에서 SDK·native worker 경계와 UI 계약을 확인한다. [기존 프론트 개발 안내](docs/FRONTEND_INTEGRATION.md)와 [최초 T19 계획](docs/T19_IMPLEMENTATION_PLAN.md)의 PowerShell/CLI 수동 실행은 개발 재현 경로다. 사용자 repository checkout·backend 명령·connection 경로 설정을 제품 완료 조건으로 삼지 않는다. native Windows 실측, 확장 lifecycle·패키징과 전체 수직 흐름 검증은 T19-W에서 진행한다. push는 요청 범위와 저장소 Git 지침을 따른다.

기존 CLI 독립 개발 경로는 `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm core:init` → `pnpm core:doctor --live` → `pnpm core:start`다. live 진단은 본인 Kiro 모델 사용량을 소비하며 native IDE 검증을 대신하지 않는다. Crew secret이나 `/api/test/agent`는 사용하지 않는다. `pnpm client:pack`으로 외부 소비 SDK를 만들고 `pnpm panel:build` 후 Kiro에서 `examples/kiro-panel`을 F5로 실행한다. 지원 버전·Windows gate·인증 파일 취급은 위 개발 안내를 먼저 읽는다.

## MVP 수직 흐름

```text
Learning Goal
  → 반복 가능한 Project Discovery
  → LEARNER_FOCUS / AGENT_SUPPORT / EXCLUDED Learning Spec
  → 실제 TypeScript Builder 작업
  → 실제 Decision에서 Helper와 사용자 판단
  → Event / Episode / Evidence proposal
  → deterministic Concept State
  → 다음 Helper 설명과 Discovery 개인화
```

MVP host는 Kiro/Crew이고 Agent 중심 Crew App을 primary surface로 삼는다. Code 중심은 자체 Kiro IDE 패널에서 Discovery·Spec·Builder·Helper를 같은 Core 상태와 실제 Agent에 연결하는 prototype으로 검증한다. Bedrock 별도 경로, Claude Code·Codex adapter, 기존 project import와 cloud sync는 MVP 범위 밖이다.

## 현재 상태

| 구간 | 상태 | 완료된 결과 |
| --- | --- | --- |
| T00~T07 | 완료 | 승인 문서, Kiro/Crew capability spike, pnpm/TypeScript workspace, strict contract, deterministic reducer, SQLite repository, 역할 고정 MCP와 평가 harness |
| T08~T13 | 완료 | Candidate revision loop, Learning Spec, 실제 Builder/Decision, read-only Helper, Event/Episode와 no-tool Evidence Analyst |
| T14 | 완료 | Crew Node backend, same-origin HMAC 경계, Project History와 durable session 복원, Builder/Helper slot binding |
| T15 | 완료 | Korean-first Discovery/Spec UI, 10개 durable preview와 순차 background enrichment, selection narrowing, Spec revision·Builder 진입, target Crew 설치·복구 검증 |
| T16 | 완료 | conversation-first Builder/Helper UI, 실제 Decision handoff, native transcript와 완료 결과 |
| T17 | 완료 | Project Evidence Trace, bounded cross-project retrieval, immutable personalization provenance |
| T18 | 완료 | hidden Evidence Analyst worker, strict loopback 결과 실행기, optional Final Upgrade, Campus Drop 실행 fixture |
| 외부 검증 대기 | T19 | 독립 backend·SDK·최소 Kiro 패널 구현/로컬 검증 통과, Windows native 인계 gate 미검증 |
| 후속 계획 | T19-W | Windows native 실측, runtime 재사용, 확장 자동 기동, Builder 도구 준비와 clean 설치 검증. 다음 착수는 TASKS.md 참조 |

T18의 Campus Drop fixture는 TypeScript runtime boundary, SQLite metadata와 blob file 분리, SHA-256 token digest, expiry와 1회 consume를 실제 build/test/HTTP 실행으로 검증한다. 제품 결과 실행기는 workspace 안의 strict `.vibe-helper/result.json`과 compiled JavaScript만 읽고, symlink containment를 확인한 뒤 최소 환경의 Node child를 `127.0.0.1` 동적 port에서 감독한다.

알려진 제한으로 첫 유용 반응은 아직 3~5초 stretch goal에 도달하지 않았다. 전체 background 상세 수렴은 최종 측정에서 148.371초였지만 사용자 진행 조건은 아니며, 장기 P95와 background 분포는 T21에서 검증한다. 실행 중 Agent stream/progress의 화면 이탈 후 재연결은 MVP 보장 범위가 아니지만, 저장 완료된 Project·Session·Task·Decision·Context는 Core에서 복원한다.

평가 실행법과 자동/사람 review 경계는 `tests/eval/README.md`, Agent 회귀 결과는 `tests/eval/results/`, AC 추적표는 `tests/eval/TRACEABILITY.md`에 있다. T01의 상세 계획과 결과는 `docs/spikes/KIRO_CREW_CAPABILITY_SPIKE.md`, `docs/spikes/KIRO_CREW_CAPABILITY_RESULTS.md`에 있다.

## 로컬 개발

필수 도구는 Node.js 24.19.0과 pnpm 11.12.0이다. `.node-version`, `engines`와 preflight가 다른 runtime을 거절한다.

이는 repository 개발용 pin이다. 제품 사용자 runtime은 T19-W에서 호환 범위와 capability를 검증해 분리하며, 현재 개발 pin을 우회하는 지침이 아니다.

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
```

`pnpm check`는 formatting, lint, TypeScript build/typecheck, unit, SQLite integration, evaluation calibration, package-boundary 및 artifact smoke와 Chromium E2E를 실행한다. 개별 명령은 다음과 같다.

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:eval
pnpm test:eval:live-discovery # local Kiro 로그인 환경에서 실행하는 bounded live probe
pnpm test:eval:live-spec      # selected Candidate에서 draft Spec을 저장하는 bounded live probe
pnpm test:eval:live-builder   # Decision gate를 포함한 bounded Builder live probe
pnpm test:eval:live-helper    # current context 기반 read-only Helper live probe
pnpm test:eval:live-analyst   # closed Episode→no-tool Analyst→Core Evidence live probe
pnpm test:campus-drop        # Golden Path fixture build, unit와 실제 HTTP 회귀
pnpm build
pnpm test:smoke
pnpm test:e2e
```

## Workspace 경계

```text
apps/crew-app             Crew App 실행·bundle 경계
apps/crew-backend         Crew reverse proxy와 role-bound HTTP MCP composition root
apps/mcp-server           MCP process composition root
packages/contracts        runtime schema와 shared DTO
packages/domain           deterministic entity·policy·reducer
packages/application      use case와 transaction boundary
packages/storage-sqlite   SQLite repository와 migration
packages/kiro-adapter     Crew slot·polling·SSE transport 격리
tests/eval                평가 calibration과 실제 Agent prompt 회귀 경계
tests/campus-drop-generated 실행 가능한 Campus Drop Golden Path fixture
```

T02 package는 후속 작업의 위치와 dependency 방향을 고정했고 T03~T07은 versioned contract, deterministic reducer, durable SQLite repository, Agent/UI 공통 use case, 역할 고정 MCP catalog와 평가 기반을 구현했다. T08~T13은 네 Agent의 prompt·adapter와 Candidate/Spec/Build/Decision/Helper/Evidence 수직 Core 흐름을 연결했다. T14~T18은 그 상태를 실제 Crew App에서 복원·조작하고, Evidence 기반 다음 행동과 실행 가능한 local 결과까지 확장했다.
