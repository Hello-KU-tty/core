# Vibe Helper

Vibe Helper는 코딩 초보자가 자기에게 실용적인 TypeScript 서비스를 고르고, Kiro Builder와 함께 실제로 만들며, 필요한 순간 Helper와 대화해 개념을 익히도록 돕는 build-first 개발 환경이다. 제품은 개발을 교육용 단계로 끊지 않고 실제 Decision, 작업 맥락과 사용자 행동에서 나온 Evidence를 다음 설명과 project 추천에 연결한다.

현재 repository는 T00~T15의 승인·구현·검증 결과를 포함한다. Discovery→Learning Spec→Builder/Decision→Helper→Event/Episode→Evidence/Concept State Core 흐름과 durable SQLite 복구, 역할별 Kiro adapter, Crew App shell 및 실제 Discovery/Spec 사용자 흐름이 연결돼 있다. 다음 작업은 T16 Agent 중심 Build·Helper 동시 UI와 Decision UI이며, `spikes/kiro-crew/`의 코드는 외부 기능 경계를 확인하기 위한 폐기 가능한 실험물이다.

## 문서 읽는 순서

1. `PROJECT_BRIEF.md`: 승인된 목표, 범위와 제약
2. `docs/SPEC.md`: 검증 가능한 제품 요구와 완료 조건
3. `docs/ARCHITECTURE.md`: system boundary, data flow와 test 전략
4. `docs/DECISIONS.md`: 승인된 판단, 제안과 spike 항목
5. `docs/TASKS.md`: MVP 이전·대회 제출 전·대회 이후 실행 순서
6. `docs/agent-prompts/`: Discovery, Builder, Helper와 Evidence Analyst의 prompt 계약

`PROJECT_SPEC.md`와 `CONVERSATION_RECORD.md`는 합의의 상세 배경을 보존하는 참고 자료다.

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

MVP host는 Kiro/Crew이고 Agent 중심 Crew App을 primary surface로 삼는다. Code 중심 Kiro surface는 같은 Core 상태를 읽는 thin prototype으로 검증한다. Bedrock 별도 경로, Claude Code·Codex adapter, 기존 project import와 cloud sync는 MVP 범위 밖이다.

## 현재 상태

| 구간 | 상태 | 완료된 결과 |
| --- | --- | --- |
| T00~T07 | 완료 | 승인 문서, Kiro/Crew capability spike, pnpm/TypeScript workspace, strict contract, deterministic reducer, SQLite repository, 역할 고정 MCP와 평가 harness |
| T08~T13 | 완료 | Candidate revision loop, Learning Spec, 실제 Builder/Decision, read-only Helper, Event/Episode와 no-tool Evidence Analyst |
| T14 | 완료 | Crew Node backend, same-origin HMAC 경계, Project History와 durable session 복원, Builder/Helper slot binding |
| T15 | 완료 | Korean-first Discovery/Spec UI, 10개 durable preview와 순차 background enrichment, selection narrowing, Spec revision·Builder 진입, target Crew 설치·복구 검증 |
| 다음 | T16 | Agent 중심 Build·Helper 동시 UI와 Decision UI |

T15의 최종 설치본은 `claude-haiku-4.5`와 Discovery prompt v1.1.9를 사용한다. unseen WebRTC 입력에서 preview 10개를 23.241초에 저장했고, 기존 MERGE 13.226초·첫 Spec 18.860초·Spec 수정 23.097초와 함께 대표 interaction 30초 gate를 통과했다. 두 enrichment batch는 identity와 부분 저장을 보존하며 complete Round로 수렴했고, preview에서 선택하거나 펼친 검토 상태도 전환 뒤 유지된다. 최종 `pnpm check`는 unit 2개, integration 189개, eval 17개, smoke 6개와 Chromium E2E 11개를 통과했다.

알려진 제한으로 첫 유용 반응은 아직 3~5초 stretch goal에 도달하지 않았고, 최종 측정에서 complete Round까지 148.371초가 걸려 그동안 SELECT와 refinement가 잠긴다. 장기 P95와 background 수렴 분포는 T21에서 검증한다. 실행 중 Agent stream/progress의 화면 이탈 후 재연결은 MVP 보장 범위가 아니지만, 저장 완료된 Project·Session·Task·Decision·Context는 Core에서 복원한다.

평가 실행법과 자동/사람 review 경계는 `tests/eval/README.md`, Agent 회귀 결과는 `tests/eval/results/`, AC 추적표는 `tests/eval/TRACEABILITY.md`에 있다. T01의 상세 계획과 결과는 `docs/spikes/KIRO_CREW_CAPABILITY_SPIKE.md`, `docs/spikes/KIRO_CREW_CAPABILITY_RESULTS.md`에 있다.

## 로컬 개발

필수 도구는 Node.js 24.19.0과 pnpm 11.12.0이다. `.node-version`, `engines`와 preflight가 다른 runtime을 거절한다.

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
```

T02 package는 후속 작업의 위치와 dependency 방향을 고정했고 T03~T07은 versioned contract, deterministic reducer, durable SQLite repository, Agent/UI 공통 use case, 역할 고정 MCP catalog와 평가 기반을 구현했다. T08~T13은 네 Agent의 prompt·adapter와 Candidate/Spec/Build/Decision/Helper/Evidence 수직 Core 흐름을 연결했다. T14~T15는 그 상태를 실제 Crew App backend와 Discovery/Spec UI에서 복원·조작하고 target Kiro 설치본까지 검증했다.
