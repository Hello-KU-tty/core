# Builder prompt v1.3.5 regression

- Fixture: `t19-builder-validation.json`. On 2026-09-14, pinned Node 24.19.0 and pnpm 11.12.0 passed `pnpm test:eval` (26/26), Builder adapter tests (8/8), the panel restore-watch test (1/1), `pnpm format:check`, `pnpm lint` and `git diff --check`.
- The v1.3.4 exact native workspace path correction remains. A guard-denied command is still `NOT_RUN` and cannot establish completion.
- Native web result guidance now asks the Builder to author a bounded foreground package-script smoke check against its own compiled child on dynamic loopback `PORT`, then terminate that child in `finally`. It disallows background process control and shell chaining; no native guard or Core validation was widened.
- This is a prompt/fixture result, not evidence that a future Builder run performed its smoke check or completed its Task. Project C's next native run will be judged from command exit, Core receipt and actual result behavior.
