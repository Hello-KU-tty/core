# Discovery Agent v1.0.1 evaluation result

- Date: 2026-08-26
- Input: synthetic unseen `webhook-lens.json`; no Personal Need or personal data
- Runtime: Kiro CLI 2.19.2, Agent Engine v2, model `claude-haiku-4.5`, effort `low`, role-bound stdio MCP
- Prompt: `docs/agent-prompts/discovery.md` version 1.0.1
- Stored fixture: Agent-authored semantic fields are preserved; server-issued identifiers, timestamp and redaction status are normalized and manually checked before commit.

## Result

- A fresh uninterrupted run completed `get_discovery_context`, generated and submitted eight Candidates, stored Candidate Round 1 through MCP, Application and SQLite, returned `DISCOVERY_ROUND_STORED`, and exited normally in about 90 seconds.
- SQLite contained all eight Candidate revisions and Discovery Session revision 2. Kiro's session metadata confirmed that the configured model was `claude-haiku-4.5` rather than an `auto` fallback.
- The normalized output passes the strict Discovery contract and exact structural-signature scorer. Human review passes semantic diversity and Concept Necessity.
- Prompt v1.0.1 limits structured descriptions and rationales to concise sentences and minimal useful lists. It does not contain fixture-specific candidate names or answers.

## Host reliability finding

- Fresh Kiro CLI 2 `auto` runs remain variable: runs that spend roughly 170 seconds generating the single eight-Candidate tool input can fail the first submit with `Transport closed` before Core receives a request.
- The exact failed payload succeeds immediately through both the official in-memory MCP transport and a fresh official stdio MCP client connected to the same server, Application and SQLite. The failure is therefore classified as a Kiro CLI 2 client/MCP lifecycle defect, not a Candidate contract, Core or storage defect.
- Server logging notifications did not prevent the client-side closure and were removed. A Kiro Agent Engine v3 probe was not accepted as a comparison because v3 required upgrading the v2 custom Agent and fell back to the default Agent in non-interactive mode.

The live regression command uses Haiku by default to keep the one-call round below the observed risky duration. `VIBE_HELPER_LIVE_EVAL_MODEL=auto` remains available to reproduce the host defect. This is an evaluation-runner fallback, not the final product model choice; model comparison remains T24 work.
