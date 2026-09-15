# Evidence Analyst v1.0.7: claim temporality and clean choice context

## Status

One bounded native run completed on 2026-09-15. The v1.0.6 fixture and live artifact remain immutable and are not reinterpreted by this revision.

- Artifact: `/var/folders/xh/38rknrn120zbrn1yvj22bdr00000gn/T/vibe-native-clean-eval-4O67Iu/metadata.json`
- Artifact SHA-256: `0cf9a2110c82a60970a6d0784c1277c980ebeb58a12cfbc52970874271036a2d`
- Artifact mode: `0600`
- Fixture SHA-256: `da66110931da50dda4215694a0ec78907a2758cfe33f04ead0a62d12d7768a50` (`JSON.stringify(fixture)`, not source-file bytes)
- Analyst prompt SHA-256: `0d0c7f132f75f36246b87447d57ff5c6d0b7b9ed4d1eb368e792bdc25cea149c`
- Model: exact catalog-confirmed `claude-sonnet-4.5`; configuration `NOT_EXPOSED`; window `2`
- Operational result: `7/7 COMPLETE`, retry `0`, runtime Core mutation `0`, final idle `true`
- Deterministic result: `FAILED`, with `3/7` exact fixture-oracle passes

This was synthetic prompt-compliance evaluation. It ran no Core Evidence acceptance, accepted zero Evidence, and does not establish reducer behavior or human learning.

## Change

- A `PREDICTION` must concern a specific result that had not yet been observed at the time of the user statement.
- A timeless conditional definition remains an explanation, and a completed action plus observed result remains an application rather than a second future prediction.
- The existing strong independent future-prediction policy remains unchanged.
- The reasoned-choice Decision context recommends the other option and does not pre-supply the user's rationale.
- The fixture oracle requires at least one state-supporting Proposal for positive cases and rejects every Proposal outside the allowed claim profiles. It accepts one combined Proposal, multiple claim-level Proposals, or a conservative subset instead of requiring exact fragment recovery or exactly one Proposal.
- Direct user sources may be a non-empty, duplicate-free subset of the fixture allowlist. A `JUSTIFIED_DECISION` still has to cite the matching `USER_DECISION`.

## Cases

The seven synthetic cases cover request-only, a lightly hinted future plan containing a prediction, a timeless independent definition, a clean reasoned choice, a completed action and observation, a directly led repeat, and an independent strong future prediction in a cache domain.

## Bounded verdict

The result is not “3/7 general model accuracy.” Its honest breakdown is:

- Three confirmed deterministic passes: request-only produced no Proposal; the directly led repeat produced non-state-supporting `REPHRASE`; the concrete future cache intervention produced `STRONG`, `INDEPENDENT`, `DEMONSTRATED` predictions. The last result confirms that the existing strong independent future-prediction policy was not broadly lowered.
- Three genuine failures: the future-plan case added a weak `APPLICATION` despite explicitly acknowledging that the action had not happened; the timeless boundary definition again produced a second `STRONG PREDICTION / DEMONSTRATED`; and the reasoned-choice case classified both claims as `INDEPENDENT` rather than `LIGHT_HINT` and also failed exact quote provenance for one claim.
- One qualitative semantic pass with an oracle false-negative: the performed case produced two `APPLICATION / STRONG / INDEPENDENT / DEMONSTRATED` Proposals and no `PREDICTION`. Root's read-only UI review found the resize-and-overflow claim and the separate `Undo로 원래 배치를 복구했습니다` claim semantically appropriate. The latter is a conservative exact source substring, but it does not contain the fixture's compound excerpt joining overflow and Undo, so the deterministic claim-profile matcher rejected it. Metadata remains `FAILED` and `humanReviewStatus: NEEDS_REVIEW`; this root review is not user or human-learning validation.

The reasoned-choice output contained the observed excerpt `경계를 �넘으면 저장을 보류하겠습니다.` with a U+FFFD replacement character while its `originalExpression` was normal. The source-quote mismatch is certain. Whether the replacement originated in model output, vendor transport, or another upstream decode layer is `UNDETERMINED`; it must not be labeled a model hallucination from this artifact.

## Transport inspection boundary

The repository-side protected native path does not decode each Agent text chunk from bytes. `native-client.cjs` receives each WebSocket event as an already-decoded JavaScript string, parses the whole JSON-RPC message, and appends `update.content.text` to the result with string concatenation. Its `Buffer.byteLength` calls only enforce bounds after decoding. The registered clean-evaluation command injects `openProtectedBuiltinH` directly, and the runner passes the returned redacted string to the evaluator without another byte decoder. The protected-tool module only checks feature flags.

Therefore this source inspection found no repository-side per-chunk `Buffer.toString('utf8')` or non-streaming `TextDecoder` that would explain a split multibyte Korean character. WebSocket or vendor layers upstream of `event.data` were not byte-captured, so this run cannot identify the U+FFFD origin. No retry or diagnostic model turn was performed.

## Stop condition

v1.0.7 improved the completed-action case and retained the legitimate future-prediction positive, but it did not reliably distinguish timeless definitions or future intent. Further prompt or fixture tuning is stopped for this bounded run. Any later oracle revision must be a new fixture revision and must not retroactively change this artifact or its deterministic `FAILED` result.
