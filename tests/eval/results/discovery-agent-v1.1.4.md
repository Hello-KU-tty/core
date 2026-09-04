# Discovery Agent v1.1.4 ephemeral context regression

- Date: 2026-09-04
- Canonical prompt: `docs/agent-prompts/discovery.md` version `1.1.4`
- Model: `claude-haiku-4.5`
- Fixture: `discovery-v1.1.4-fast-context`
- Result: PASS

The redacted live Kiro CLI 2.21.0 run used a matching validated Core snapshot, called `get_discovery_context` zero times, called `submit_candidate_round` once and durably stored four Candidates in 23,289 ms. The full turn ended in 26,017 ms. All optional `evaluation` and `risks` fields were omitted, reducing the Candidate payload from the preceding 10,731-byte over-generation to 6,456 bytes.

Strict contract and structural-signature checks passed. Human review found distinct rehearsal, game, auction and team-board interactions, and confirmed that real-time bidirectional state synchronization is necessary to each core experience. This single run proves the fast-path behavior and quality fixture, not P95; target Crew repetitions remain the T15 gate.
