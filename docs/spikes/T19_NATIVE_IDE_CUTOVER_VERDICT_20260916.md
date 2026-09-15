# T19-N IDE cutover 경영 판정

작성 기준: 2026-09-16 KST. 상세 receipt는 [4시간 계획·결과](T19_NATIVE_IDE_ONLY_4H_CUTOVER_PLAN_20260915.md), [P1/P2 continuation](T19_NATIVE_P1_P2_CONTINUATION_20260915.md), [P2 v1.0.7 결과](../../tests/eval/results/evidence-analyst-v1.0.7.md), [이전 0.1.2 P2 baseline](T19_NATIVE_P2_LIVE_CLEAN_EVAL_20260915.md), [IDE adapter 인계 계약](T19_NATIVE_IDE_ADAPTER_CONTRACT_20260915.md)과 [frontend IDE 인계](../FRONTEND_IDE_HANDOFF_20260915.md)에 있다.

## 결론

| 판단 대상 | 판정 | 범위 |
| --- | --- | --- |
| frontend의 IDE-first 계약·화면 개발 착수 | **GO** | 기존 Core DTO, extension-host client, package-local panel과 명시된 오류 상태를 기준으로 개발을 시작한다. |
| pin한 macOS Kiro의 native IDE 흐름 | **EXPERIMENTAL GO** | Kiro IDE 1.0.437 / Agent 1.0.794 / macOS arm64의 일반 profile, private adapter와 fail-closed gate에 한정한다. |
| Evidence 의미 품질의 production readiness | **NO-GO** | v1.0.7 live 7-cell은 operational pass지만 deterministic quality `FAILED`(3/7)다. |
| Windows·다른 Kiro 버전·일반 배포 | **NO-GO** | 실행·지원 계약이 검증되지 않았다. |
| CLI/Crew 기본 경로의 삭제·교체 | **NO-GO** | 동등한 latency/cost/completion/retry/rollback 비교가 없고 productization gap이 남았다. |
| T19-N·전체 MVP 완료 | **아님** | T19-N은 `[~]`를 유지한다. |

## 이 판정을 지지하는 최소 실측

- 0.1.3 VSIX는 exact 12 entries/runtime assets 5개와 canonical prompt를 포함하고 ordinary Kiro install parser, install, reload, activation, pinned source gate와 worker 연결을 통과했다. archive SHA-256은 `88f21a8bfef37355b143c549d6cf6ef112b30c32b2e058c6c42ba6593a31f3c4`다.
- 일반 profile의 같은 `windowId=2`에서 protected H cancel을 native ACK와 Core `CANCELLED`로 확인한 뒤 같은 prepared pair의 Helper가 성공했다. 별도 Builder 실행에서는 W의 실제 read와 late H가 세 번 모두 겹쳤고 H1/H2/H3가 각각 Core `SUCCEEDED`였다.
- 합성 G lineage의 실제 Core Decision request→ordinary UI resolution→same-scope application→Builder resume가 이어졌다. Task는 `COMPLETED` revision 5, Completion Report가 저장됐다. 이는 실제 durable contract test이지 실제 사용자의 자기작성 이유나 인간 학습 Evidence가 아니다.
- 생성 앱은 native Node 26.4.0 경로의 33 tests/typecheck/build/smoke를 통과했다. 별도 app-only fresh copy도 Node 24.19.0 / pnpm 11.12.0 frozen install, 33 tests, typecheck, build와 HTTP smoke를 통과했다. 제품 UI는 invalid geometry reject, history 비생성, Undo/Redo 보존과 same-origin reload 복원을 실제 Chrome에서 통과했다.
- 종료 감사는 active run/Analysis 0, Analysis 51건 전부 `SUCCEEDED`, binding 115건 전부 `REVOKED`/0600, SQLite `quick_check=ok`였다. 최종 source의 `pnpm check`도 unit 88, integration 271, eval 34, Golden Path 3, smoke 6, GUI E2E 12/12를 포함해 exit 0이었다.

## 성공으로 확대하지 않는 항목

- Analyst v1.0.7은 7/7 operation, retry 0, Core mutation 0, final idle을 통과했지만 quality는 3/7 `FAILED`였다. 미래 의도와 timeless 문장 분류, choice-hint dependence와 exact-quote mismatch가 남아 Evidence production readiness는 막는다. quote의 `U+FFFD`가 모델, vendor transport 또는 다른 upstream decode 중 어디서 생겼는지는 `UNDETERMINED`다.
- generated app의 최소 치수 warning은 위반 가구 subset의 최소 치수만 표시해 전체 배치의 최소 치수로 오해될 수 있다(예: width 120 vs 전체 360). invalid input을 수락하지는 않았지만 minor UX 결함이다. backend restart로 origin이 바뀌는 persistence는 고치거나 다시 실행하지 않았다.
- active SSE 또는 response-uncertain mutation 중 backend rotation의 live no-replay/duplicate 방지는 source regression만 있고 live 미검증이다.
- `PersonalizationTrace` 생성과 실제 성공한 `HELPER_RECORDED` eligibility가 아직 동일 계약이 아니다. 취소 trace가 후보에 보일 수 있어 이번에는 SDK로 대조한 성공 trace를 수동 선택했다.
- backend 독립 installer/service, connection onboarding과 private API 안정 지원이 없고, generated package script의 W 밖 간접 side effect에 대한 OS-level confinement은 입증되지 않았다.
- Windows, 장기 반복 운용, 다른 Kiro/Agent version과 CLI 대비 비용·지연·완료율·retry·rollback은 실행하지 않았다.

## 시간과 인계

승인된 원래 판단창은 2026-09-15 09:58~13:58 UTC였다. 약 31분의 실제 작업 뒤 0.1.3 install/reload와 G Task action-time 승인을 기다리는 동안 deadline이 지났고 사용자가 14:43 UTC 이후 재개를 승인했다. 따라서 이 결과를 wall-clock 4시간 성공이나 새 4시간 deadline으로 기록하지 않는다. 승인 대기 뒤 실제 bounded run이 끝나 위 판정을 내린 것이다.

Frontend는 [frontend IDE 인계](../FRONTEND_IDE_HANDOFF_20260915.md)의 DTO·상태·오류 seam으로 착수한다. native 실행은 위 exact pin의 실험 기능으로 표시하고, Evidence confidence/학습 성공이나 production-ready 문구를 만들지 않는다. 기존 CLI/Crew source는 유지하며 원본 main은 변경하지 않고 recovery worktree의 dirty 이력을 보존한다. commit/push는 이 판정에 포함하지 않는다.
