# Builder prompt 1.3.8 검증

- 날짜: 2026-09-24
- 변경: Windows 보호 실행기가 검증한 제한된 pnpm-workspace 설정을 유지한 채 script 없는 lockfile 갱신 후 frozen install을 다시 수행할 수 있다. 다른 native 경로와 검증되지 않은 설정의 거절, 실제 검증 전 완료 금지는 유지한다.
- fixture: tests/eval/fixtures/prompt-regressions/t19-builder-validation.json. 승인 설정의 Windows refresh 허용, 미검증 설정 거절과 frozen install 후 실제 검증을 기록한다. 특정 프로젝트나 성공 문구에 대한 예외는 없다.
- 실행: pnpm exec vitest run tests/unit/native-permission.test.ts packages/kiro-adapter/test/builder-agent.test.ts tests/eval/eval-harness.test.ts — 3 files, 55 tests PASS.
- 실측: copied package의 보호 runner에서 승인 설정의 lock refresh/frozen install 및 외부 lifecycle/npmrc 거절 PASS. 원본 결과는 dist/w5-tool-recovery-final.log와 dist/project-tool-recovery-receipt.json이다.
- 경계: fixture/도구 검증은 실제 native Builder의 Task 완료나 의미 품질 PASS를 대신하지 않는다. 실제 Windows 후속 결과는 docs/spikes/T19_W5_WINDOWS_RELEASE_RESULTS_20260924.md를 따른다.
