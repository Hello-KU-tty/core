# Vibe Helper

Vibe Helper는 코딩 초보자가 자기에게 실용적인 TypeScript 서비스를 고르고, Kiro Builder와 함께 실제로 만들며, 필요한 순간 Helper와 대화해 개념을 익히도록 돕는 build-first 개발 환경이다. 제품은 개발을 교육용 단계로 끊지 않고 실제 Decision, 작업 맥락과 사용자 행동에서 나온 Evidence를 다음 설명과 project 추천에 연결한다.

현재 repository는 구현 전 bootstrap 문서와 T01 Kiro/Crew capability probe를 포함한다. 제품 application code는 아직 시작하지 않았고, `spikes/kiro-crew/`의 코드는 외부 기능 경계를 확인하기 위한 폐기 가능한 실험물이다.

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

T00 기본안과 T01 실행은 2026-08-24 승인됐다. 사용자가 Kiro·Kiro Crew 설치와 로그인을 완료했으며, T01은 macOS에서 app build/install, `vibe-helper-probe` 단일 신뢰, enable과 Gateway restart까지 진행됐다. 현재는 Crew dashboard의 실제 render·두 chat slot·permission runtime 검증 단계다. 상세 계획과 중간 결과는 `docs/spikes/KIRO_CREW_CAPABILITY_SPIKE.md`, `docs/spikes/KIRO_CREW_CAPABILITY_RESULTS.md`에 있다.

구현 명령은 아직 존재하지 않는다. workspace와 명령이 T02에서 실제로 만들어지면 이 문서를 그 검증 결과와 함께 갱신한다.
