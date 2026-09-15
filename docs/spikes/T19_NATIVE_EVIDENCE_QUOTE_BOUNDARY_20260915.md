# Native Evidence 인용 출처 검증

## 판정 근거

`PROJECT_BRIEF.md`의 보수적 Evidence와 원문 trace, `docs/SPEC.md`의 FR-EVD-005/007/010, `docs/agent-prompts/evidence-analyst.md`의 출력 규칙은 `concept.originalExpression`을 사용자가 실제 쓴 짧은 표현, `redactedEvidenceExcerpt`를 사용자 발언에서 인용한 짧은 근거로 정의한다. 설명이나 의역은 `rationale`에 둘 수 있지만 직접 인용 두 필드의 대체물이 아니다.

F 흐름의 native Analyst 1.0.4 H3에서는 의미상 사용자 예측에 맞는 Proposal 하나가 `PREDICTION`/`MEDIUM`/`LIGHT_HINT`/`EXPLAINED`로 수락됐으나, 위 두 직접 인용 필드가 참조한 USER_MESSAGE Event의 redactedExcerpt와 정확히 일치하는 부분 문자열이 아니었다. 이 불일치는 부모 실험의 Core DB 읽기 전용 검증에서 관찰됐다. 이 문서에는 사용자 발언·전체 모델 출력·민감 로그를 복제하지 않는다. 앞선 수락 Evidence 하나의 인용은 실제 원문 부분 문자열로 확인됐다. 기존 수락 행과 그 파생 상태는 보존하며 소급 수정하지 않았다.

## 좁은 Core 수정

`evaluateEvidenceProposal()`은 현재 Episode에 있는 직접 사용자 참조만 확인하고 인용문은 검증하지 않았다. 이제 cited source가 가리키는 Event payload가 USER_MESSAGE일 때, `concept.originalExpression`과 `redactedEvidenceExcerpt` 각각이 그 referenced Event의 redactedExcerpt 중 하나에 정확히 포함돼야 한다. 조건을 만족하지 않으면 기존 `INVALID_REFERENCE` 결정으로 Proposal을 거절한다. 두 문자열이 반드시 같은 Event에 있어야 한다고 강제하지 않으며, 의미적 참·거짓을 Core가 추정하지 않는다. USER_MESSAGE Event ID를 `USER_ACTION` reference로 제출해도 같은 인용 검사를 적용한다.

USER_DECISION과 다른 USER_ACTION Event에는 검증할 사용자 문장이 Activity payload에 없을 수 있다. 그 경우 기존 source·rationaleProvided·Strength 정책을 유지하며, 이 변경으로 인용 정확성을 증명했다고 주장하지 않는다. 해당 출처의 정확한 문장 검증은 계약에 검증 가능한 텍스트가 제공될 때 별도로 다뤄야 한다.

## 재현과 검증

- Domain 회귀: 정확한 원문은 수락하고, `originalExpression`만 의역, Evidence excerpt만 의역, 둘 다 의역, Episode 안의 인용되지 않은 다른 메시지에서 가져온 문장, USER_ACTION으로 재표기한 USER_MESSAGE의 의역을 거절한다.
- Application 통합: 의역 Proposal과 `INVALID_REFERENCE` 결정은 보존하지만 accepted Evidence와 Ledger는 생성하지 않고 Analysis Job의 거절 건수를 기록한다.
- Node.js 24.19.0 / pnpm 11.12.0에서 `pnpm test:unit` 82/82, `pnpm test:integration` 260/260, `pnpm test:eval` 29/29, 관련 두 파일의 focused Vitest 46/46, `pnpm typecheck`, `pnpm format:check`를 통과했다. 실제 Kiro 모델 재호출은 이 수정의 검증으로 세지 않는다.

## Golden Path fixture 회귀 발견

부모의 전체 `pnpm check`에서 Chromium E2E 12개 중 Campus Drop Golden Path 하나만 실패했다. 같은 시험의 mock Analyst가 Episode의 canonical Concept 이름을 `concept.originalExpression`에도 복사했으나, 그 이름은 직접 참조한 USER_MESSAGE 원문에 없었다. 새 Core 정책의 거절은 정상이다. `redactedEvidenceExcerpt`는 해당 원문 전체와 정확히 같았다.

Golden Path의 합성 사용자 메시지가 만료 `expired`와 첫 성공 후 `consumed` 전이를 직접 설명하도록 보강하고, 그 메시지의 정확한 71자 부분 문자열을 별도 fixture 필드로 명시해 mock Analyst의 `originalExpression`에 사용했다. 제안 canonical 이름과 `EXPLAINED` 기대값은 유지했으며 fixture 사전 검증으로 향후 인용 불일치를 조기에 드러낸다. 수정 뒤 TypeScript typecheck와 format 검사는 통과했다. Chromium E2E 재실행은 부모가 수행할 예정이므로 이 문서에서 PASS로 기록하지 않는다.
