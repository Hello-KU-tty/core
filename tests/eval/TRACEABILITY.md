# MVP acceptance criterion 추적표

T09 시점의 평가는 계약·품질 실패 검출 기반, 실제 Candidate Agent 회귀, Learning Spec prompt regression과 bounded live Spec 저장을 포함한다. 아래 `현재 근거`는 완료된 검증만 뜻하며, 실제 수직 흐름 완료 판정은 `최종 검증` 작업에서 수행한다.

| Acceptance criterion | 현재 test/eval 근거 | 현재 보장 | 최종 검증 |
|---|---|---|---|
| AC-MVP-001 | unseen/Personal Need corpus, `candidate-mode-collapse`, actual Kiro `discovery-agent-v1-webhook` regression | 고정 taxonomy 없이 unseen goal에서 생성한 8개 후보의 strict contract, 구조 차이와 기록된 의미 다양성·Concept Necessity review | T21 |
| AC-MVP-002 | Candidate reducer와 Application integration의 PIN/REJECT/MERGE/REVISE/SHRINK/EXPAND/REGENERATE/SELECT, MCP adapter contract | feedback-to-round lineage, stale target 거절, UI-only 명시적 selection과 terminal Discovery | T21 |
| AC-MVP-003 | `spec-scope-leak`, prompt v1.1.0 `learning-spec-v1.1-webhook`, Spec domain/Application/MCP integration, actual Kiro selected-Candidate→DRAFT Spec run | 세 scope, selected-Candidate revision, direct/Agent 조정, 명시적 확정, 확정 전 Task 차단, Learner Focus 전용 Evidence target과 실제 role-bound MCP 저장 | T15, T21 |
| AC-MVP-004 | Builder Task/Completion Report contract와 application integration test | 실제 build 흐름에 필요한 DTO·상태 경계 | T10, T18, T21 |
| AC-MVP-005 | `stale-context`, `context_fresh`, role server contract test | stale/incomplete Context와 Helper read-only 경계 검출 | T10, T12, T16, T21 |
| AC-MVP-006 | `trivial-decision`, application Decision lifecycle test | 사소한 질문과 실제 Decision 계약·상태 전이 구분 기반 | T11, T16, T18, T21 |
| AC-MVP-007 | `false-mastery`, `false-misconception`, domain Evidence reducer test | Agent-authored source 분리와 사용자 claim provenance | T13, T17, T21 |
| AC-MVP-008 | `evidence_policy`, Evidence reducer reason-code test | Analyst proposal을 Core가 재현 가능하게 채택·거절 | T13, T17, T21 |
| AC-MVP-009 | SQLite `readEvidenceTrace` integration test, Concept Ledger reducer test | Evidence→Decision→Ledger trace의 저장·복구 | T13, T17, T21 |
| AC-MVP-010 | Concept Ledger/storage integration test | 과거 Evidence를 조회할 durable state 경계 | T17, T21 |
| AC-MVP-011 | Task Completion Report contract와 application integration test | 결과 경로·검증 결과의 구조화 계약 | T18, T21 |
| AC-MVP-012 | Agent boundary와 role server contract test | 두 surface가 공유할 stable Core/MCP 계약 | T19, T21 |
| AC-MVP-013 | `redaction-leak`, storage unsafe-payload test, Agent authorization/path test | secret·민감 경로와 역할 권한 위반 검출 | T20, T21 |
| AC-MVP-014 | Campus Drop + 3 unseen inputs, deterministic calibration baseline | 전체 flow E2E가 사용할 재현 가능한 다중 입력 corpus | T18, T21 |

경로는 이 디렉터리를 기준으로 한 eval 이름 또는 repository 내 test 파일 이름이다. T21 traceability report는 이 표를 실제 E2E 결과와 알려진 제한으로 갱신한다.
