# T19-N 4시간 IDE-only 전환 판단 계획

작성 기준: 2026-09-15. 원래 승인된 시간창은 09:58~13:58 UTC(18:58~22:58 KST)였다. 약 31분의 실제 작업 뒤 0.1.3 install/reload와 G 후속 Task의 사용자 action-time 승인을 기다리는 동안 13:58 UTC deadline이 지났고, 사용자는 14:43 UTC 이후 두 action을 모두 명시 승인했다. 이는 새 4시간으로 deadline을 조용히 재설정한 것이 아니며 wall-clock 4시간 성공을 주장하지 않는다. 재개 후 남은 gate는 실제 active 작업 시간과 승인 대기 시간을 분리해 기록한다. 목표는 새 가능성을 넓게 찾는 것이 아니라 실제 득실을 가장 빨리 확인하고 IDE-only frontend 개발을 시작할 수 있는 범위를 인계하는 것이다. 기존 CLI/Crew source, deterministic Core, 보안·데이터·Evidence provenance 경계는 유지한다. T19-N은 `[~]`다.

## 현재 출발점

- 일반 Kiro profile의 0.1.2 VSIX는 install parser, activation, pinned product/Agent source gate, Local panel 렌더와 Project G durable restore를 통과했다.
- backend는 `singleWindow=1`, `diagnostics=1`, port 58498의 instance `ae629c61-b180-40da-942f-d883b06ceae7`로 살아 있고, worker는 09:59:18 UTC `WORKER_CONNECTED`였다. 최근 read-only 감사에서 active run/Analysis는 0, Analysis 45건은 `SUCCEEDED`, binding 113건은 모두 `REVOKED`, SQLite `quick_check=ok`였다.
- G의 현재 BUILD Task는 `COMPLETED`, pending Decision은 0이다. 완료 Task에 Builder를 임의 재실행하거나 과거 거절된 G 후속 Task 준비와 E/F Decision을 다른 API로 우회하지 않는다. 새로운 후속 Task는 현재 panel의 eligible final-upgrade UI와 사용자의 구체적 승인으로만 만든다.
- 한 Extension Development Host에서 Builder W + late protected H Helper, H cancel 확인 뒤 pair 재사용, 같은 G Task의 세 Builder turn 완료는 과거 각각 실측됐다. 이번 gate는 이를 일반 설치 profile의 같은 `windowId=2` 제품 경로와 새 Decision/resume lineage에서 가장 작게 회귀한다.

## 최종 live 결과

일반 0.1.2 profile/window 2에서 새 Task 승인을 기다리는 동안 H cancel/reuse를 독립 검증했다. Helper run `5357ab47-…-03b66201`은 10:06:09.341 UTC `RUNNING` 뒤 부분 text가 있던 상태에서 root가 해당 run만 중지했고, Core는 10:06:28.801 UTC `CANCELLED`, worker는 10:06:28.849 `BUILTIN_H_CANCEL_CONFIRMED_REUSABLE`와 10:06:28.876 `AGENT_FAILED_NATIVE_H_CANCELLED_CONFIRMED`를 기록했다. 부분 답은 완료 답변이나 Evidence로 세지 않았다.

재사용 Helper run `81f5b900-ce3d-40f0-9f15-30abce96049f`는 10:07:23.428 UTC `RUNNING`, 10:07:38.967 `AGENT_ENDED_HELPER`, Core `SUCCEEDED/HELPER_RECORDED`와 UI `SUCCEEDED`였다. pair prepare marker는 최초 한 번뿐이고 source의 기존 pair branch와 일치한다. 별도 session ID receipt가 없으므로 새 native `session/new` 0건까지 주장하지 않는다. 뒤이은 자동 Analyst도 10:07:41.402~10:07:47.537 UTC 정상 종료했다. protected H prompt는 job마다 repository의 canonical prompt를 읽으므로 이 Analyst는 10:05:24 UTC 이후 hot-edited v1.0.7 prompt를 사용했지만 backend dist는 아직 같은 source로 재빌드되지 않은 상태였다. 따라서 이 실행은 H transport/lifecycle 종료 확인일 뿐 의미 품질 결과로 쓰지 않는다. 최신 read-only 상태는 Analysis 46건 전부 `SUCCEEDED`, accepted Evidence 76·Proposal 46 불변, 두 새 run terminal(`CANCELLED`, `SUCCEEDED`), binding 113건 전부 `REVOKED`/0600이다. 질문은 합성 request-only이고 수행·학습 주장이나 새로운 학습 성공 근거가 아니다.

따라서 일반 profile의 **단독 confirmed H cancel + pair reuse gate는 PASS**다. Builder overlap 성공 횟수는 여전히 0/3이며 다음 P3에서만 센다. Final Upgrade trace 목록에서는 취소 run에서 파생된 항목을 고르지 않고 실제 완료 Helper trace만 선택한다. 선택된 trace가 기존 오염 가능성이 있는 G Evidence를 포함하면 Task 발급 provenance로만 기록하고 개인화 품질 성공 근거로 재사용하지 않는다.

P2 v1.0.7 source freeze 뒤 0.1.3 package도 pre-install까지 준비했다. VSIX는 `/private/tmp/vibe-helper-kiro-panel-vsix-JGEmwa/vibe-helper-local-panel-0.1.3.vsix`, 575,538 bytes, SHA-256 `88f21a8bfef37355b143c549d6cf6ef112b30c32b2e058c6c42ba6593a31f3c4`다. exact 12 entries, runtime asset 5개, prompt D1.3.5/B1.3.6/H1.2.0/A1.0.7, panel CJS 87/87, native source 48/48와 packaged bridge fail-closed smoke가 통과했다. command는 7 Analyst cell만 실행한다. package 생성 당시 일반 Kiro parser/install/activation과 live 7-cell은 PENDING이었으며, 이후 승인된 install/reload 결과는 아래에 별도로 기록한다.

최종 freeze source에서 root의 Node 24.19.0 `pnpm check`가 완전히 exit 0이었다: format/lint 257 files, unit 88, integration 271, eval 34, Golden Path 3, smoke 6, GUI E2E 12/12(52.6초). active run 0에서 기존 backend PID 84455를 정상 SIGTERM한 뒤 같은 DB/root/port 58498, `singleWindow=1`, `diagnostics=1`로 source와 prompt가 맞는 backend를 다시 시작했다. 최신 instance는 `efcccfb9-2df6-4b80-acb3-19753356379e`, exec session은 99694다.

14:43 UTC 이후 사용자가 0.1.3 install/reload와 G geometry/frozen-install 합성 Decision Task를 모두 명시 승인했다. Root는 승인된 VSIX를 ordinary Kiro UI로 설치해 성공 알림을 확인하고 `Developer: Reload Window`를 한 번 실행했다. installed package manifest 0.1.3, Command Palette의 exact 7-Analyst command 등록·activation, worker `STARTED` 14:45:19.254 / `CONNECTED` 14:45:19.256 UTC까지 확인됐다. 따라서 0.1.3 **install parser/install/reload/activation/source-worker 연결은 PASS**다. 앞선 0.1.2 결과를 자동 상속한 것이 아니다. backend `efcccfb9-2df6-4b80-acb3-19753356379e`는 변경 없이 healthy/active 0이었다.

P2 live 7-cell은 14:45:55.607 UTC isolated idle 뒤 exact catalog의 Sonnet/Haiku를 표시했고 root가 Sonnet 4.5와 명시 run modal을 선택했다. 최종적으로 7/7 operation은 `COMPLETE`, retry 0, Core mutation 0, `finalIdle: true`였지만 deterministic quality는 **`FAILED`(3/7)**였다. 미래 의도의 잘못된 `APPLICATION`, timeless 문장의 강한 `PREDICTION`, choice-hint dependence와 exact-quote mismatch는 실제 품질 blocker다. quote의 `U+FFFD` 발생 계층은 repository transport 검사로도 특정하지 못해 `UNDETERMINED`로 남긴다. 수행 보고 case의 compound-excerpt oracle false negative도 분리했으며, transport 완료를 Evidence 품질이나 일반 정확도 PASS로 바꾸지 않는다.

## P3 live trajectory

Root는 승인된 G 입력을 ordinary UI로 14:54:26.675 UTC 제출해 sequence-2 Task `task_5ceddc6a-8993-475f-8c3a-dcd750373b9a`를 만들었다. 실제 초기 status는 `PENDING` revision 1이었고, source Task suffix는 `70b3122f`, 사용한 trace는 실제 닫힌 Helper conversation과 대조한 `personalization_e378c12e-1d09-4a56-88b6-b7fe9b8e937f`였다. 취소 Helper trace는 사용하지 않았다.

B1 `run_eb40721e-9973-49d4-b03b-e20631167fca`는 14:55:25.393 UTC 시작, 14:55:28.829 H ready, 14:55:29.687 memory barrier와 native `RUNNING` 뒤 실제 `BUILDER_START_TASK`가 성공해 Task가 `ACTIVE` revision 2가 됐다. late H1 `run_a88d85d6-d231-4293-b0e0-950f46deddd7`은 14:56:47.382 `RUNNING`, 14:57:18.051 native end, 14:57:18.071 Core `SUCCEEDED`였다. Builder W의 실제 file read 14:57:04.258~.259가 H1 구간과 겹쳤고 H1 뒤에도 W는 `RUNNING`이었다. 따라서 일반 profile의 bounded overlap은 **1/3 PASS**다. 동일 window metadata의 최종 대조는 뒤에 수행한다. 자동 Analyst도 14:57:20.453~14:57:25.054 UTC terminal이었다.

B1에서 `version`과 결합 command 형태의 shell 요청 두 건은 기존 guard가 거절했다. 원문 command는 기록하지 않는다. source가 허용하는 exact syntax는 `pnpm run build`, `pnpm run typecheck`, `pnpm run smoke`, `pnpm test`, `pnpm install --frozen-lockfile`이며 `node --version`, `pnpm --version`, `pnpm build` 또는 결합 명령을 새로 허용하지 않는다. 후속 turn에는 기존 허용 syntax만 명시하고 source/permission을 확대하지 않는다. 이 snapshot에서 B1은 계속 실행 중이고 static repro read까지만 확인됐으며 test와 새 Decision의 durable request/resolution/application은 아직 `PENDING`이다.

B1은 14:58:45.091 UTC `SUCCEEDED/TURN_ENDED`로 끝났다. 그 전에 새 Decision `decision_3b86c12f-d65e-4e83-81c8-40084dbda394`가 14:58:18.792 UTC context version 2에서 실제 요청됐다. Root는 승인된 합성 option 1(`selectedOptionId` suffix `67ad413`)과 비어 있지 않은 test rationale, `helperUsed: true`를 ordinary UI로 제출했고 resolution `decision_resolution_7d1b2576-6d0e-4524-b0cb-86544c119abf`가 14:59:47.373 UTC 저장됐다. Task는 `ACTIVE` revision 4, pending Decision 0이었다.

B2 `run_717e56b8-4e35-42eb-a24a-866b16ff6558`는 15:00:54.773 UTC 생성, 15:00:59.153 native `RUNNING`이었다. `BUILDER_GET_DECISION_RESULT`가 성공했고 application `decision_application_0e65077f-d30b-4b77-8d2e-2bcf5538f46e`가 15:03:49.001 UTC exact Decision/resolution/Task/correlation 및 context version 3에 맞게 저장됐다. 따라서 합성 test-lineage의 실제 Core request→resolution→application과 Builder resume는 **P4 bounded PASS**다. 이는 root가 승인된 입력을 수행한 `source: USER` contract test이며 실제 사용자의 자기작성 rationale나 인간 학습 Evidence가 아니다.

H2 `run_2ed0c8e6-e5e0-4e80-aa46-522793da24aa`는 15:02:53.553~15:03:10.204 UTC native 실행 뒤 Core `SUCCEEDED`였고 Builder W search/read 15:03:00 및 15:03:04.322~.980과 겹쳤다. H3 `run_24a5be70-5bd2-4eea-8404-667011d4536e`도 15:05:27.015~15:05:37.677 UTC native 실행 뒤 Core `SUCCEEDED`였고 W read 15:05:33.486~.487과 겹쳤다. H1+H2+H3으로 실제 W read와 native H가 겹친 bounded 반복은 **3/3 PASS**다. Root가 세 Helper 모두 ordinary profile의 같은 `windowId=2`임을 최종 대조했다.

B2의 W write 요청은 15:05:29/44 UTC `TOOL_ID_MISMATCH`로 기존 guard가 거절했지만, source나 permission을 넓히지 않고 설치본의 허용된 `STR_REPLACE` 형태로 15:05:58 회복해 실제 generated source 변경이 이어졌다. 이 거절을 write 성공으로 세지 않는다. B2는 15:09:54.910 UTC `SUCCEEDED/TURN_ENDED`로 끝났고 Task는 `COMPLETED` revision 5가 됐다. Completion Report `completion_report_269d7e80-0002-415f-81de-f1f095a5c478`는 15:08:20.316 UTC 완료됐으며 같은 applied Decision을 가리킨다. 마지막 source mtime 15:07:25.525 UTC는 Completion과 native end보다 앞선다.

B2의 native shell은 기존 Kiro Node 26.4.0 / pnpm 11.12.0에서 33 tests, typecheck, build, smoke를 통과했다. 처음 두 frozen install은 esbuild build policy 때문에 명시 실패했고, 승인된 generated app 범위에 `allowBuilds.esbuild=true`를 적용한 뒤 실제 postinstall과 검증이 통과했다. 이를 제품의 지정 Node 24 호환 증거로 대신하지 않고, root가 app-only fresh copy `/private/tmp/vibe-g-cutover-frozen-DfU8O7`에서 별도로 확인했다. 24개 source file의 SHA-256은 원본과 같고 `.kiro`, `.vibe-helper`, dependency, dist가 없는 상태에서 Node 24.19.0 / pnpm 11.12.0 frozen install(shared warm store), 33 tests, typecheck, build, HTTP smoke가 모두 통과했다.

정상 제품 UI의 실제 결과 URL은 port 63269에서 healthy였다. Root의 Chrome 검증에서 width 100/101과 depth 250은 거절되고 직전 유효값으로 복원됐으며 거절 입력은 history를 만들지 않았다. 유효 width 450, Undo 400, invalid 100 뒤 보존된 Redo, Redo 450, 같은 origin reload의 450×300 복원이 모두 동작했고 console warning/error는 0이었다. 최소 치수 경고는 위반 가구 subset의 최소값만 표시해 전체 배치의 최소 치수로 오해될 수 있다(예: width 120 vs 전체 360). backend restart로 origin이 바뀌는 persistence는 수정·재실행하지 않았다.

## P3/P4 최소 재현

시작 전에 root가 UI와 SDK를 다시 읽어 0.1.3 activation/source gate, `WORKER_CONNECTED`, `isolatedEvaluation=false`에 해당하는 정상 polling, run/Analysis active 0, 모든 기존 binding `REVOKED`, panel의 G restore와 후속 Task eligibility를 확인한다. 0.1.3 install/reload와 G geometry/frozen-install 합성 Task/Decision 입력은 사용자의 실행 승인을 받았다. P2 evaluation은 `resume:false`이므로 완료 뒤 normal worker polling을 위해 승인된 reload가 다시 필요하며, `NATIVE_EVAL_RELOAD_REQUIRED` 상태나 보이지 않는 eligibility에서는 P3를 시작하지 않는다.

1. 새 Task 승인 대기와 병렬로, 현재 G에 단독 Helper를 시작해 `AGENT_RUNNING_HELPER`에서 **그 Helper run만** panel로 취소한다. 같은 소유 H session의 terminal `NATIVE_H_CANCELLED_CONFIRMED`, worker `BUILTIN_H_CANCEL_CONFIRMED_REUSABLE`, Core run `CANCELLED`와 binding revoke를 확인한다. 부분 답은 완료 답/Evidence로 세지 않는다. 같은 Project의 새 Helper 질문을 보내 `AGENT_ENDED_HELPER`와 같은 `windowId=2`를 확인한다. 취소 뒤 `BUILTIN_H_HELPER_ANALYST_PREPARED`가 재발급되지 않고 source의 기존 `protectedPair` branch로 성공한 것까지 pair 재사용 증거다. 별도 session ID receipt가 없으면 native `session/new` 0건까지 주장하지 않는다. 이 단독 gate는 Builder + late Helper 횟수에 넣지 않는다.
2. panel의 **개선 Task 준비**에서 사용자가 승인한 G geometry/frozen-install 범위의 새 sequence-2 합성 Task 하나만 만든다. Root가 승인된 test input을 ordinary UI로 제출했으며 실제 초기 status는 `PENDING` revision 1이었다. 첫 native Builder의 `start_task` 성공 뒤 `ACTIVE` revision 2를 확인했다. 사용자가 매 합성 선택을 직접 클릭할 필요는 없다.
3. 첫 Builder turn에는 먼저 실제 갈림길을 점검하고 구현 전에 두 실행 가능한 대안의 Core Decision을 요청하도록 한다. `JOB_CLAIMED_BUILDER` → `BUILTIN_H_READY_BEFORE_BUILDER` → `BUILTIN_H_MEMORY_BARRIER_ATTESTED` → `AGENT_RUNNING_BUILDER`와 Builder Core receipt가 나온 뒤 자연스러운 실제 W 작업 구간에 첫 late Helper를 시작해 완료한다.
4. B1이 만든 **새** pending Decision을 panel에 표시하고 root가 사전 승인된 합성 option/custom proposal과 비어 있지 않은 test rationale을 ordinary UI로 제출한다. SDK에서 같은 project/task/correlation의 durable resolution과 pending 제거를 확인한다. Core 계약상 이 입력은 `source: USER`로 저장되지만 실제 사용자가 직접 작성한 이유, 실제 인간 이해나 human Evidence라고 부르지 않는다. card click만 Evidence로 올리지 않는다.
5. 다음 Builder turn은 같은 Task를 재개해 `BUILDER_GET_DECISION_RESULT`와 `BUILDER_APPLY_DECISION` 성공 뒤 선택된 구현·검증을 수행한다. W의 실제 read/write 또는 Core mutation이 진행되는 동안 아직 필요한 late Helper를 순차로 보내 총 세 번의 완료된 overlap을 채운다. resolved만 있고 application이 없거나 다른 Decision ID이면 중단한다.
6. 자연스러운 Builder 작업이 끝나면 `complete_task`를 수행한다. Task `COMPLETED`, Completion Report, Builder/Helper/Analyst terminal, active run/Analysis 0, 모든 새 binding `REVOKED`, 생성 파일 마지막 변경이 completion/native 종료보다 앞서는지를 최종 확인한다.

실제 Builder 활동과 겹쳐 성공한 late Helper가 합계 세 번이어야 `Builder + late Helper >= 3`이다. 별도의 첫 Helper 취소는 횟수에 넣지 않는다. 세 번을 맞추려고 Builder를 인위적으로 대기시키거나 590초 예산 실패를 만들거나 불필요한 세 번째 Builder run을 추가하지 않는다. 자연스러운 Task가 먼저 끝나면 모자란 겹침을 성공으로 계산하지 않고 PARTIAL로 기록한다.

## PASS와 즉시 중단 표식

P3 overlap 3/3과 P4 actual Core Decision/resume는 위 receipt로 bounded PASS다. H1/H2/H3의 같은 `windowId=2`, B2 implementation/test/Completion, Task `COMPLETED` revision 5와 최종 Core/DB idle까지 확인됐다. 마지막 감사에서 active run/Analysis는 0, Analysis 51건은 모두 `SUCCEEDED`, binding 115건은 모두 `REVOKED`/0600, SQLite `quick_check=ok`였다. accepted Evidence 80, Proposal 47, Ledger 54, Completion 12는 승인된 합성 G 실행 뒤 집계이며 실제 인간 학습이나 Evidence 품질 성공을 뜻하지 않는다. 여기서 **actual Decision**은 진짜 Core durable request/resolution/application 전이를 뜻하며 실제 사람 학습이나 사용자의 자기작성 이유를 뜻하지 않는다. UI text나 Agent의 성공 설명만으로 대체하지 않는다.

다음은 즉시 STOP이다: `NATIVE_H_CANCEL_RACED_OR_UNCONFIRMED`, `BUILTIN_H_FAIL_CLOSED`, 다른/없는 window ID, mutation tool 불가나 scope mismatch가 같은 turn에서 회복되지 않음, stale/과거 Decision 선택, 외부 workspace 또는 global/profile/trust 변경 요구, binding/Analysis가 terminal idle로 돌아오지 않음. 실패는 exact code와 마지막 durable state로 남기고 승인 범위를 넓히지 않는다.

## IDE-only frontend 인계 판정

최종 판정은 **pin한 macOS Kiro의 실험적 IDE-only native 흐름과 frontend 계약·화면 개발 인계는 GO**다. 이미 있는 Core snapshot/run/SSE/Decision/Evidence 계약과 package-local panel assets를 개발 seam으로 삼을 수 있다. 이는 CLI 코드 삭제나 일반 출시가 아니다. **Evidence 의미 품질의 production readiness, Windows 지원, 일반 Kiro 버전 지원과 CLI/Crew 기본 경로 교체는 NO-GO**다.

착수를 막는 hard gap은 일반 profile에서 P3/P4가 실제 실패하는 경우, exact Kiro source/permission/catalog gate 실패, backend/worker lifecycle이 정상 polling으로 복귀하지 않는 경우, Decision provenance 또는 binding revoke가 불명확한 경우다. 이들은 UI mock이나 수동 DB 수정으로 가리지 않는다.

착수와 병행해 명시할 productization gap은 backend가 아직 repo/runtime lifecycle에 의존하는 점, machine-scoped connection-file onboarding·start/stop/update UX 부재, private Kiro API와 macOS arm64 exact pin, 진행 중 SSE/mutation rotation의 live 미검증이다. 중간 우선순위 Known issue로, Helper invocation 전에 만든 Personalization Trace와 실제 성공한 `HELPER_RECORDED`를 현재 Final Upgrade eligibility가 구분하지 않아 취소 run의 trace도 선택지에 보일 수 있다. 이는 cancel 버튼 실패나 권한 누수가 아니다. 이번 live는 SDK에서 대조한 완료 Helper trace만 수동 선택하며 Core/DTO를 확대하지 않는다. 정식 계약은 Core가 동일 correlation의 닫힌 Helper response를 확인하고 권위 있는 eligible 목록을 UI에 주는 방향을 별도 검토한다. Windows 지원, 장기 안정성, CLI와의 정밀 latency/cost/rollback 비교는 시간 대비 이번 4시간에 실행하지 않되 미지원/미검증으로 표시한다. frontend 세부 seam과 화면 인계는 [IDE frontend 인계](../FRONTEND_IDE_HANDOFF_20260915.md)에서 별도 관리한다.

## 시간 상한

- 0~15분: 문서 고정, 현재 idle/eligibility gate, exact 실행 순서 확정.
- 다음 60~90분: P3/P4 한 lineage. 한 단계가 hard STOP이면 반복 탐색 대신 blocker를 고정한다.
- 병렬 30~45분: P2 prompt/fixture/oracle의 bounded Analyst-only 수정과 재평가. 기존 오염 G Ledger를 양성 근거로 쓰지 않는다.
- 남은 시간: 필요한 최소 source patch와 회귀, 합의된 경우에만 새 VSIX package/install, frontend 인계·cutover 판정. live run 중 install/reload는 하지 않는다.

원본 main worktree는 변경하지 않고 recovery worktree의 dirty history를 보존한다. commit/push는 이 계획에 포함하지 않는다.

최종 경영 판정과 인계 경계는 [IDE cutover verdict](T19_NATIVE_IDE_CUTOVER_VERDICT_20260916.md)에 압축했다. T19-N과 전체 MVP는 완료가 아니다.
