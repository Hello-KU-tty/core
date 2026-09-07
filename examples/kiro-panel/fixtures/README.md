# 명시적 mock 개발 자료

`run-states.json`의 `base`와 선택한 `variants[name]`를 합쳐 SDK의 `localRunSchema.parse({...base,...variant})`로 validation한다. loading/partial/failed/stale/cancelled/durable-result 화면용이며 CI가 모든 variant를 검사한다. 부분 enrichment의 실제 후보는 snapshot의 preview와 candidateEnrichments를 별도로 표시한다. run 상태만으로 후보를 만들지 않는다.

Candidate/Spec/Task/Context/Decision의 작은 합성 자료는 `packages/contracts/test/fixtures.ts`, 연속 흐름은 `tests/e2e/campus-drop-session.fixture.json`, unseen 입력은 `tests/eval/fixtures/inputs`를 참고하고 SDK의 대응 schema를 적용한다. 실제 Core 저장/API 성공으로 위장하거나 production DB에 Agent 대신 제출하지 않는다. mock/live 배지를 명시하고 live 실패 시 mock fallback하지 않는다. 이 예제의 기본 runtime은 live뿐이며 mock fixture는 화면 개발 참조다.
