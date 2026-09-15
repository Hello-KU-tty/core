# Builder prompt v1.3.2 regression

- Fixture: `t19-builder-validation.json`, checked by `tests/eval/eval-harness.test.ts`.
- The prompt keeps a blocked native command from becoming `PASSED` or completion evidence.
- The prompt distinguishes Core-root-relative `workspacePath` from the native generated-project cwd `.` and directs file lookup to cwd-relative paths.
- Fixture assertions passed locally on 2026-09-13. This checks the written contract; a live native Builder turn is still required to verify model behavior.
