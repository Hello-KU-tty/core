# Campus Drop generated-result fixture

This is a reproducible generated-workspace fixture, not a production recommendation template.

- Learner focus: TypeScript runtime boundaries, SQLite metadata, file/blob separation, and token/expiry state transitions.
- Actual Decision: the accepted Golden Path consumes a token after its first successful download; the rejected alternative allows reuse until expiry.
- Agent support: HTTP parsing, filesystem permissions, SQLite setup, and compact UI details.
- Excluded: login, permanent retention, large/multipart upload, object storage, hosted deployment, and LAN/public binding.
- Evidence bound: Builder code and passing tests support only `OBSERVED`; a user explanation can support at most `EXPLAINED`, a justified independent decision/application at most `DEMONSTRATED`, and this same flow never asserts `TRANSFERRED`.

Commands: `pnpm build`, `pnpm test`, and `pnpm start`. The runtime receives `HOST=127.0.0.1` and a dynamic `PORT`, as declared by `.vibe-helper/result.json`.
