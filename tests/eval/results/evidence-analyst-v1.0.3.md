# Evidence Analyst v1.0.3 required expression regression

The native built-in Analyst completed two turns for the stored E Episode on 2026-09-14 at 18:13 UTC. Both returned parseable fenced JSON. Fixed metadata showed 2 and 3 Proposals respectively; every Proposal included `concept.proposedCanonicalName` but omitted required `concept.originalExpression`. Core rejected both as `ANALYST_INVALID_RESULT`. The Episode and synthetic evaluator-authored USER input remain distinct from accepted learning evidence.

The canonical prompt now says every Proposal needs a nonempty, short phrase copied from a direct USER Event. If no such phrase exists, the Analyst must omit that Proposal and return an empty result with `noEvidenceReason` when none remain. The native transport repeats this general contract after the Episode context, where it is visible at response time. It does not fabricate or fill a missing user phrase.

The personal-data-free fixture `evidence-analyst-v1.0.3-required-expression.json` verifies three deterministic boundaries: an exact phrase from the synthetic USER message forms a valid Proposal; omitting it fails the strict schema; an empty Proposal list with a reason is valid. Focused eval: 3/3 passed. This validates the contract and prompt wording, **not** live v1.0.3 model compliance. A new native Analyst result and Core receipt are required for that claim.
