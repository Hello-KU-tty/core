# Discovery Agent v1.1.6 Spec recovery result

- Target: Kiro Crew 0.3.0, redacted synthetic real-time collaboration fixture
- Normal Spec Agent: injected Core snapshot plus `submit_learning_spec` only
- Recovery Spec Agent: `get_discovery_context` plus `submit_learning_spec`, selected only when context injection is unavailable
- UI completion recovery: one automatic re-dispatch when a Spec stream ends without a durable revision; a second no-tool completion becomes a visible retry state
- Haiku observation: one of two final raw refinement turns skipped its tool; the successful turn stored revision 2 in 23.384 seconds
- Model comparison: Terra stored first/refined Spec in 43.257/14.270 seconds; Auto stored them in 39.240/36.027 seconds. Both exceeded the 30-second gate on at least one Spec phase, so Haiku remains selected with bounded recovery.
- Browser regression: stale UI protocol rejection, in-flight slot re-entry without duplicate dispatch, first Spec revision 1, normal refinement revision 2, and one no-tool refinement recovered to revision 2 all passed.
- User-approved final gate rerun: first Candidate 50.132 seconds, MERGE 13.226 seconds, first Spec 18.860 seconds, and Spec revision 2 refinement 23.097 seconds. The Spec and refinement paths passed, but the first Candidate exceeded 30 seconds.
- Remaining limit: T15 remains active only for first-Candidate latency. In-flight page re-entry is outside the MVP acceptance boundary, and the user already approved the UI/UX and actual Spec revision 2 to Builder transition.
