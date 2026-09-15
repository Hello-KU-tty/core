# Builder prompt v1.3.3 regression

- Fixture: `t19-builder-validation.json`, checked by `tests/eval/eval-harness.test.ts` on 2026-09-13. The 25/25 evaluation suite passed.
- The prompt keeps a guard-denied command at `NOT_RUN`, not `PASSED` or Task completion, and distinguishes the Core data-root `workspacePath` from native cwd `.`.
- For a fresh native generated workspace, it directs the Agent to author `package.json`, prepare a missing lock only with `pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile`, then use frozen install and separate pnpm validation commands. Existing CLI/Crew npm wording remains conditional and unchanged.
- Native permission focused tests 10/10 passed. A separate pinned pnpm 11.12.0 `/private/tmp` fixture proved lock creation without `node_modules` or lifecycle sentinel, local pnpmfile suppression, and subsequent frozen esbuild install. These tests do not substitute for a live native Builder run, and the controlled global-pnpmfile configuration did not trigger a hook, so global-hook suppression is not claimed as independently proven.
