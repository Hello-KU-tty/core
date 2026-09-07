# Builder 1.3.1 — 검증 실행/보고 회귀

2026-09-07, T19. canonical source: docs/agent-prompts/builder.md.

- 동기: 실제 1.3.0이 guard-denied cd-chain 명령 후 PASSED를 주장했고 독립 TypeScript build가 실패했다. 해당 실패의 code/DB/report는 보존했다.
- 변경: 허용 단일 command, 생성 프로젝트에 의존성 선언, 실제 성공 결과만 PASSED, 미실행 NOT_RUN/실패 FAILED, 미검증 시 complete_task 금지. Core 상태를 hard-code하거나 validation을 완화하지 않았다.
- fixture: t19-builder-validation.json. blocked command와 실행 불가 상태가 완료/통과 근거가 아님을 prompt 계약 평가로 확인한다. 기존 T18 결과 manifest/Final Upgrade/Evidence bound fixture도 유지한다. fixture 자체는 모델 행동 성공의 증거가 아니다.
- 실제 후속 표본: CLI2.21.1/v2/claude-haiku-4.5, 새 Personal-Need 합성 Project. 실제 Builder/Helper/Decision 후 Agent-authored code를 별도 폴더로 복사해 npm ci --ignore-scripts/build/test(13개)를 통과했다. Core 완료5/loopback health/History 복원도 확인했다. 상세 환경·실패는 docs/spikes/T19_LOCAL_RUNTIME_RESULTS.md에 있다.
- 제한: 한 표본이며 모델 정직성이나 모든 generated project의 품질을 보장하지 않는다. completion report와 independent build/test 증거를 구분한다. Windows gate는 미검증이다.
