# T15 first-Candidate alternatives spike

- Target: Kiro Crew 0.3.0 with the redacted real-time collaboration fixture.
- Baseline: current Haiku four-Candidate detailed Round stored in 50.132 seconds.
- Count and detail changes: Haiku ten compact but complete Candidates stored in 33.940 seconds. Haiku six compact and four ultra-compact ended without a durable Round because their tool envelopes were not executable.
- Model change: Luna six compact Candidates stored in 14.420–16.063 seconds when successful, but the exact-envelope variant succeeded in only three of four attempts. Luna ten succeeded once in 19.991 seconds and then reproduced a durable failure during the next two-attempt batch.
- Prompt-size change: the initial-only prompt did not stabilize latency or tool use. Luna ten took 70.837 seconds; Haiku ten and Luna six ended without durable results.
- Parallel generation: two uncoordinated Haiku batches of five both stored within 24.561 seconds, but human review found four semantically overlapping directions and there was no atomic combined Round. Partitioned batches later reproduced a no-durable failure.
- Hedging: concurrent Luna and Haiku doubled Agent calls and both ended without a durable Round after 43.194 seconds.
- Decision: no tested count, detail, prompt, model, parallel, or hedged variant satisfies both the 30-second gate and durable reliability. The production package remains Haiku v1.1.6.
- Recommended next design, pending user approval: store ten lightweight, unique previews through a smaller initial contract, then enrich those fixed preview identities in the background. This preserves ten eventual detailed options without asking two independent Agents to invent overlapping lists. A selected preview should be prioritized, and Spec creation should wait for that Candidate's complete revision.
- Limitation: the preview/enrichment contract itself was not implemented or directly timed in this spike; the recommendation is an inference from the measured output size, tool-envelope failures, and parallel duplicate rate.
