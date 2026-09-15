# Builder prompt v1.3.4 regression

- Fixture: `t19-builder-validation.json`, checked by `tests/eval/eval-harness.test.ts` on 2026-09-14. The pinned Node 24.19.0 / pnpm 11.12.0 evaluation suite passed 26/26; `pnpm format:check` and `pnpm lint` also passed.
- `get_builder_task` exposes the Core-root-relative path as `project.generatedWorkspacePath`. The native Agent is already running in that resolved project's workspace, so the prompt names the exact field and tells it to write root `package.json` as `package.json`, without prepending `projects/<projectId>` a second time.
- The fixture continues to require that a denied shell command remains `NOT_RUN` and cannot establish Builder completion. It retains the bounded lockfile-prepare and frozen-install commands.
- This is a source and fixture correction following Project B's observed nested app files. The current Dev Host/native run had not been rebuilt or reloaded with v1.3.4 at this evaluation checkpoint; subsequent root repair must be judged from the actual Agent files and Core receipts, not this test alone.
