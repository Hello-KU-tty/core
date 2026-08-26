# Vibe Helper

Vibe Helper는 코딩 초보자가 자기에게 실용적인 TypeScript 서비스를 고르고, Kiro Builder와 함께 실제로 만들며, 필요한 순간 Helper와 대화해 개념을 익히도록 돕는 build-first 개발 환경이다. 제품은 개발을 교육용 단계로 끊지 않고 실제 Decision, 작업 맥락과 사용자 행동에서 나온 Evidence를 다음 설명과 project 추천에 연결한다.

현재 repository는 bootstrap 문서, T01 Kiro/Crew capability probe, T02 TypeScript workspace skeleton, T03 공유 contract/runtime validation, T04 deterministic domain reducer, T05 SQLite persistence, T06 application/MCP 권한 경계, T07 평가 harness와 T08 Discovery Agent 반복 Candidate loop를 포함한다. 다음 작업은 T09 Learning Spec 생성·조정·확정이며, `spikes/kiro-crew/`의 코드는 외부 기능 경계를 확인하기 위한 폐기 가능한 실험물이다.

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

## 현재 착수점

T00~T08이 완료됐고 현재 착수 작업은 T09 Learning Spec 생성·조정·확정이다. T08은 canonical Discovery prompt v1.0.1, Kiro용 최소 입력 tool adapter, feedback-to-round revision loop와 UI-only 명시적 선택을 구현했다. 실제 Kiro CLI 2/Haiku의 fresh 8-Candidate round가 MCP→Application→SQLite에 저장됐고, 느린 `auto` run의 stdio lifecycle 결함은 T15·T19·T21 재검증 gate로 남겼다. 평가 실행법과 자동/사람 review 경계는 `tests/eval/README.md`, 현재 Agent 회귀 결과는 `tests/eval/results/discovery-agent-v1.0.1.md`, AC 추적표는 `tests/eval/TRACEABILITY.md`에 있다. T01의 상세 계획과 결과는 `docs/spikes/KIRO_CREW_CAPABILITY_SPIKE.md`, `docs/spikes/KIRO_CREW_CAPABILITY_RESULTS.md`에 있다.

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
pnpm build
pnpm test:smoke
pnpm test:e2e
```

## Workspace 경계

```text
apps/crew-app             Crew App 실행·bundle 경계
apps/mcp-server           MCP process composition root
packages/contracts        runtime schema와 shared DTO
packages/domain           deterministic entity·policy·reducer
packages/application      use case와 transaction boundary
packages/storage-sqlite   SQLite repository와 migration
packages/kiro-adapter     Crew slot·polling·SSE transport 격리
tests/eval                평가 calibration과 실제 Agent prompt 회귀 경계
```

T02 package는 후속 작업의 위치와 dependency 방향을 고정했고 T03~T06은 versioned contract, deterministic reducer, durable SQLite repository, Agent/UI 공통 use case와 역할 고정 MCP catalog를 구현했다. T07은 contract·revision·provenance 기반 자동 scorer와 기록된 사람 review, redacted fixture corpus, calibration baseline 및 Evaluation Run SQLite 이력을 추가했다. T08은 같은 경계 위에 Discovery Agent prompt와 feedback action별 Candidate lineage, role-bound submit adapter, 실제 Kiro 출력 회귀 fixture를 연결했다.
