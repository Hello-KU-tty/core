# Discovery Agent v1.0.0 evaluation result

- Date: 2026-08-26
- Input: synthetic unseen `webhook-lens.json`; no Personal Need or personal data
- Runtime: Kiro CLI 2.19.2, Agent Engine v2, model `auto`, role-bound stdio MCP
- Prompt: `docs/agent-prompts/discovery.md` version 1.0.0
- Stored fixture: Agent-authored semantic fields are preserved; server-issued identifiers, timestamp and redaction status are normalized and manually checked before commit.

## Result

- A three-Candidate run completed end to end through Kiro, the role-bound MCP process, Application and SQLite in about 100 seconds.
- The first eight-Candidate run reached the context tool but exceeded the 360-second bound after Kiro injected the undocumented `__tool_use_purpose` transport field into the submit payload. Strict validation rejected that extra field.
- The Agent tool boundary now accepts that Kiro-owned transport field and removes it before building the Application command. The exact eight-Candidate payload from the failed live run was replayed through the current MCP server, Application and SQLite and was accepted at Discovery Session revision 2.
- Reusing the timed-out Kiro session after the adapter fix later lost its stdio MCP transport, so an uninterrupted eight-Candidate live run is not claimed as passed.
- The normalized eight-Candidate fixture passes the strict Discovery contract and exact structural-signature scorer. Human review passes semantic diversity and Concept Necessity.

The transport timeout is retained as a known evaluation-runner reliability limitation. It does not replace the successful three-Candidate live proof or the exact eight-Candidate payload replay with a mock result.
