# Builder 1.3.11 — language and validation boundaries

- Canonical source: `docs/agent-prompts/builder.md`; adapter, native preparation and Crew packaging declare 1.3.11.
- Fixture: `builder-v1.3.11-language-and-validation.json`. Korean and English inputs, an explicit English request, Personal Need present/absent, internal-rule/tool narration negatives and verbatim command/error preservation are review cases.
- Mechanical regression checks required policies and version wiring. Previous 1.3.10 fixture/native observations remain historical and are not relabeled.
- Shell timeout is milliseconds, 1..300000 integer when supplied; guard limits are unchanged. Core rejects empty validation/NOT_RUN completion reports, tested at reducer and Application/SQLite boundaries. This does not prove independently that agent-authored PASSED reports correspond to executed commands.
- On Node 24.19.0 / pnpm 11.13.1, prompt evaluation 42/42 passed in the repository check. No live model was invoked. Language quality, actual Kiro narration and Windows Builder behavior remain NOT_RUN for this revision, not automatic PASS.
