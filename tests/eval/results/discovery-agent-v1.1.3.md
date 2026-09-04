# Discovery Agent v1.1.3 selection narrowing regression

- Date: 2026-09-03
- Canonical prompt: `docs/agent-prompts/discovery.md` version `1.1.3`
- Fixture: `discovery-v1.1.3-narrow-merge`
- Result: PASS

The redacted Round 2 fixture contains one current Candidate revision derived from both selected parents and carries no unselected Candidate reference. Strict contract validation passed. Human review confirmed that the merged service needs both a transaction boundary for overlapping reservations and a scheduler for durable follow-up work, so narrowing did not turn either selected behavior into decorative technology.

Application integration and UI E2E separately enforce the state transition: the Core rejects the former carry-unaffected MERGE shape, preserves all prior revisions in immutable history, and exposes only the merged result as the current shortlist.
