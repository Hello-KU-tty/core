# Builder prompt v1.3.6 regression

- Fixture: `t19-builder-validation.json`. The prompt keeps the exact native workspace-root instruction, requires actual command evidence for `PASSED`, and does not turn a denied tool into a completed Task.
- A dependency change after initial lock creation now calls for the same bounded, script-free lockfile-only command while `.npmrc`, `.pnpmfile.cjs` and `pnpm-workspace.yaml` are absent. It still requires `pnpm install --frozen-lockfile` for actual installation before typecheck, test, build and owned-child smoke validation.
- This fixture and the synthetic local-package lock-refresh test do not count as a native Project C Builder result; its new run needs its own permission, command-exit, Core Completion and browser evidence.
- At 2026-09-14 01:49 UTC, pinned Node 24.19.0/pnpm 11.12.0 checks passed: `pnpm test:eval` 26/26, focused native permission plus Builder adapter 18/18, codec plus real local pnpm refresh 8/8, full `pnpm check` including Playwright 12/12 in the approved GUI environment, and `pnpm panel:build`. No C native Agent outcome is inferred from these repository tests.
