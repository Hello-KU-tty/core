# Discovery Agent v1.1.2 bounded starter regression

- Date: 2026-09-03
- Canonical prompt: `docs/agent-prompts/discovery.md` version `1.1.2`
- Fixture: `discovery-v1.1.2-starter-webhook`
- Result: PASS

The redacted four-Candidate starter fixture passed the strict Discovery contract without `evaluation` or `risks`. Every Candidate uses one target user, two core concepts, three MVP features and one or two entries per scope. Automated contract-integrity and exact structural mode-collapse scorers passed. Recorded human review also passed semantic diversity and Concept Necessity: configuration gating, webhook replay, form-state simulation and database-row normalization remain meaningfully different, and runtime validation plus explicit variant discrimination is central to every interaction.

This is a deterministic prompt/contract regression, not a claim that a new live Kiro run met the 60-second latency target. Target latency is measured separately after the updated Crew package is installed.
