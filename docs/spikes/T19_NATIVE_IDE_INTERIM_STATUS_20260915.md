# T19-N Kiro IDE 내장 Agent 중간 현황

기준 시점: 2026-09-15. 이 문서는 새 실험 결과가 아니라 [마지막 8시간 bounded 판정](T19_NATIVE_IDE_ONLY_LAST_8H_20260915.md)을 제품 의사결정용으로 압축한 현황 보고서다.

## 지금 내릴 수 있는 판정

**단일 Kiro IDE 창에서 외부 Agent CLI 없이 Builder와 뒤늦은 Helper 질문을 병행하는 경로는 확인됐다.**

같은 Extension Development Host `windowId=4`에서 W Builder의 실제 파일 변경과 protected H Helper 답변이 겹쳤고, Helper가 먼저 끝난 뒤 Builder가 작업과 Core mutation을 계속했다.

따라서 “병행 Helper를 위해 외부 Agent CLI가 반드시 필요하다”는 기술적 명제를 다시 탐색할 필요는 없다. 관련 구현이 바뀔 때 좁은 동시성 회귀를 확인하면 충분하다.

이 결론은 Kiro IDE 1.0.437 / Agent extension 1.0.794, macOS, Extension Development Host, 비공개 local mux/ACP observer와 source-pin gate 조합에 한정된다.

일반 VSIX, Windows, Kiro 업그레이드와 장기간 반복 운용은 아직 검증되지 않았다. private API라고 무조건 불가능한 것도, 현재 pin 성공이 안정된 공개 계약인 것도 아니다.

CLI와 지연·비용·성공률을 같은 입력으로 비교하지 않았으므로 성능 동등성은 미확인이다. CLI 기본 경로 교체 판단과 T19-N·전체 MVP 완료는 유보한다.

## 상태 구분

| 구분 | 현재 상태 | 판단 |
| --- | --- | --- |
| 확인된 능력 | 한 창 W Builder + H Helper 병행 | 넓은 가능성 탐색은 종료한다. |
| 수정이 재현된 결함 | Helper Evidence 전달 starvation, pnpm 설정 원인 | 실제 적용 범위를 구분해 좁게 회귀한다. |
| 원인은 알지만 제품 수정이 남은 결함 | reconnect, Builder 수명, transport 복구 | 정해진 통과 조건으로 닫는다. |
| 설계·지원 전략이 필요한 경계 | Evidence 의미, private API 지원, 간접 shell 격리 | 단순 버그 수정으로 해결을 보장하지 않는다. |
| 순수 미검증·승인 보류 | VSIX, Windows, 실제 Decision 선택, CLI 대조 | 기술 실패로 기록하지 않는다. |

## 지금 내려도 되는 결정

- 기존 deterministic Core와 SQLite 계약을 전면 재작성할 필요는 없고, IDE session·권한·stream·취소·reconnect는 별도 host adapter 구현으로 인계할 수 있다.
- frontend UI만 구현해서 끝낼 수 없고, Core와 adapter 사이의 검증 가능한 handoff 계약이 필요하다.
- CLI 기본 경로는 유지한다. P1~P5 조건이 끝나기 전에는 교체 판단을 내리지 않는다.
- 생성 앱의 품질 결함은 대표 결과물 완주·복구 검증에 사용하되 IDE 동시성 가능성과 분리한다.
- 8시간 bounded 제품 철학·대체 가능성 평가는 가능성과 한계를 함께 판정해 끝났지만 T19-N은 `[~]`, 전체 MVP는 미완료다.

## 확인된 능력

- Discovery, Spec, Builder, Helper, Analyst가 같은 deterministic Core lineage와 로컬 SQLite를 사용했다.
- W Builder는 생성 workspace 안에서 파일을 바꾸고 Core Task·Live Context·Completion을 갱신했다.
- Builder 실행 중 나중에 제출한 Helper 질문이 같은 창의 별도 protected H session에서 먼저 끝났다.
- Helper와 Analyst에는 session `all deny`, catalog, hook, cloud pull, memory, feature flag gate를 적용했다.
- H의 예상 밖 tool call은 허용하지 않고, W Builder만 role-bound Core mutation 도구를 받았다.
- Builder text delta, tool 상태, 파일 변경과 Core 결과의 redacted 요약이 자체 패널에 표시됐다.
- 이 stream은 작업을 관찰할 수 있지만 Kiro full transcript나 diff renderer와 동일하다는 증거는 아니다.
- 소유 `cancelled` terminal을 확인한 H session은 같은 pair에서 재사용됐다.
- Builder 590초 soft budget은 소유 cancel ACK를 확인하고 실패로 끝났으며 성공으로 오인하지 않았다.
- G Task는 세 번째 정상 Builder turn에서 Core `COMPLETED`와 native `end_turn`에 도달했다.
- G 앱의 drag, 한 번 undo/redo, 새 분기와 같은 origin reload 저장은 브라우저에서 동작했다.
- Evidence 직접 인용 두 필드의 USER_MESSAGE exact-substring 검사가 실제 수락·거절에 적용됐다.
- 같은 Task USER Evidence가 lexical 5건에 밀리던 선택 결함은 수정 후 실제 UI trace에서 USER 2건+lexical 3건 전달을 확인했다.
- 마지막 항목은 **전달 수리 PASS**이며 Evidence 의미 또는 Helper 답변 개선 PASS는 아니다.

## 알려진 결함과 해결 가능성

| 항목 | 현재까지 확인한 것 | 남은 일 |
| --- | --- | --- |
| frozen install | 별도 app-only copy에서 `allowBuilds.esbuild=true`만으로 install/test/type/build/smoke 통과 | 원본 G 적용은 승인 때문에 안 됐다. 승인된 Task에서 적용·회귀한다. |
| backend reconnect | 오래된 패널 token이 `LOCAL_AUTH_FAILED`; 같은 창 새 패널은 정상 연결 | 저장된 Core 상태·작업 화면 복원과 새 요청 인증 갱신을 구현하고 진행 중 작업과 충돌하지 않게 한다. |
| Builder 수명 | 600초 미확인 cancel 뒤 590초 confirmed cancel로 경계를 개선 | 긴 작업 분할 UX와 실패 뒤 pair 재준비·Task 재개를 반복한다. |
| Agent transport | Preview count·Spec envelope 실패 원인을 분리하고 선택한 복구 경로를 확인 | 자동·무개입 복구 PASS가 아니며 envelope/Core 오류를 계속 구분한다. |
| Evidence 의미 | exact quote는 확인하지만 미래 계획을 APPLICATION, 설명을 DECISION으로 과대평가 | 일반 의미 규칙·Core 정책·평가 전략을 함께 결정해야 한다. |
| private observer | pin한 Dev Host에서 실제 작동 | 지원 버전, VSIX 패키징, upgrade fail-closed 전략이 필요하다. |
| 간접 shell | 직접 경로·cwd·명령 guard는 작동 | package script의 OS write는 별도 sandbox 결정이 필요하다. |

## Evidence와 개인화의 정확한 현재 상태

- exact-quote gate는 잘못된 직접 인용을 거절했고 실제 정확한 인용은 통과시켰다.
- 그 뒤에도 미래 검증 규칙을 `APPLICATION/DEMONSTRATED`로 수락한 의미 과대평가가 있었다.
- 기존 오수락 행은 보존돼 있어 전달 개선이 오염된 근거를 더 잘 전달할 수도 있다.
- 같은 Task USER 최대 두 자리 예약은 starvation을 고쳤지만 현재 질문과의 의미 관련성을 보장하지 않는다. 기존 A′/B 두 쌍에서 B는 `personalization`과 `relevantLedgerEntries`만 뺐다.
- B에도 `recentEpisodes`의 USER excerpt와 Helper summary가 남았으므로 no-history 대조군이 아니다.
- 두 쌍 모두 curated Ledger의 뚜렷한 행동상 이득을 보이지 않았고 synthetic Evidence도 의미상 오염돼 있었다.
- 다음 평가는 출처가 명시된 오염되지 않은 새 사례에서 실제 행동·설명과 요청·미래 계획 반례를 구분하고, 합성/실제 provenance와 힌트 의존도를 기록해야 한다.
- quote, source, signal, prompt dependence, maximum state, Core 수락과 다음 답변의 유용한 차이를 각각 판정한다.

## 제품 결과물 결함과 IDE 교체 경계

- Kiro Builder shell은 Node 26.4.0, 제품 지정과 독립 QA는 Node 24.19.0이었다.
- 생성 앱은 Node24 test 25/25, typecheck, app-only copy build·smoke를 통과했다.
- 원본 frozen install은 esbuild policy로 실패했고, 정확한 설정 해결은 별도 복사본에서만 재현했다.
- E는 기본 날짜의 timezone 경계, F는 entity가 섞인 위험 URL sanitizer 경계가 남았다.
- G 앱은 방 크기 100에서 가구가 밖으로 나가는 실제 geometry 결함이 있다.
- localStorage는 같은 origin reload에서는 유지됐지만 backend restart로 port가 바뀐 origin에는 이어지지 않았다.
- Discovery v1.3.5 unseen 결과의 사람 평가는 유망 2, 조건부 4, 약함 4였다.
- 이 문제들은 제품 MVP를 막지만 한 창 W/H transport를 다시 미확인으로 만들지는 않는다.
- 반대로 한 창 transport 성공도 Discovery, Evidence, 실제 Decision, 결과물 품질을 대신하지 않는다.

## 순수 미검증과 승인 보류

- 일반 VSIX에 bridge, prompt, panel asset과 Node runtime을 올바르게 포함하는 패키징은 미검증이다.
- 일반 설치 macOS에서 activation, connection, H/W session, permission과 취소가 같은지 미검증이다.
- Windows observer, path 정책, process 수명과 UI 동작은 T19 외부 gate로 남아 있다.
- E의 실제 제품 Decision 선택은 자동 승인 검토가 두 번 거절했다.
- F의 보안 Decision은 같은 경계를 예상해 선택 자체를 시도하지 않았다.
- Decision 적용→Builder 재개가 기술적으로 실패했다고 쓰지 않고, 승인 가능한 정상 기회에 한 번 연결한다.
- CLI와 IDE의 같은 입력·모델 기준 latency, cost, completion, retry 비교는 없다.

## 다시 하지 않아도 되는 검증

- 다른 child-agent API를 찾아 한 창 병행 가능성을 처음부터 재탐색하지 않는다.
- 확인한 W write와 late H answer overlap을 goal마다 반복해 새 기능처럼 세지 않는다.
- 수동 가능성 탐색은 반복하지 않지만 H deny/catalog/cloud/memory gate는 현재 계약대로 매 session 준비·role 변경과 관련 구현 또는 Kiro 버전 변경 때 확인한다.
- 같은 synthetic 오염 DB에서 A′/B를 더 반복해 개인화 효과를 추정하지 않는다.
- mock Golden Path나 source fixture를 native 모델 실측으로 환산하지 않는다.

## 다음 작업 패키지와 통과 조건

### P1. IDE adapter 제품 패키징 — IDE host adapter 담당

- 일반 VSIX에 runtime 자산을 묶고 repo-relative 의존을 제거한다.
- macOS 일반 설치 한 창에서 activation→H 준비→W Builder→late Helper→cancel/reconnect를 한 번 완주한다.
- backend instance/token 변경 뒤 저장된 Core 상태·작업 화면을 복원하고 새 요청 인증을 갱신해야 한다. 진행 중 native stream 재연결은 현재 MVP 필수 조건이 아니며, 복구 중 작업 충돌은 막아야 한다.
- 사용자가 실제 작업·오류·파일 변경을 파악하고 후속 입력을 보낼 수 있어야 한다.

### P2. Evidence 의미 경계 — Core와 Analyst 담당

- 계획, 설명, 선택, 실제 적용을 구분하는 일반 fixture와 Core 기대값을 고정하고, provenance·힌트 의존도가 명시된 오염되지 않은 사례에서 실제 행동·설명과 request-only·미래 계획 반례를 검증한다.
- 오염된 기존 행을 성공 근거로 쓰지 않고 `recentEpisodes`와 curated Ledger의 변수를 분리한다.
- 깨끗한 Evidence가 다음 Helper와 unseen Discovery에 실제로 유용한 차이를 만드는지 확인한다.

### P3. 반복 수명·권한 — IDE host adapter와 backend 공동 담당

- 같은 설치에서 최소 회귀 묶음으로 Builder+late Helper 3회를 반복하고 active job 0, binding 전부 REVOKED를 확인한다.
- H confirmed cancel 재사용과 Builder budget 실패 뒤 새 pair·Task 재개를 각각 포함한다.
- unknown tool, catalog/hook/cloud 변화와 stale connection은 fail-closed여야 한다.
- 간접 OS write는 지원할 sandbox 수준을 먼저 결정한다. 3회 성공은 장기 안정성이나 latency SLA 통계가 아니라 lifecycle 회귀에 한정한다.

### P4. 제품 수직 품질 — Core·패널·Builder, 사용자 승인 가능한 시점

- 실제 제품 동작이 다른 Decision의 사용자 선택·이유를 받는다.
- Core resolution/application→Builder 재개→구현·결과 차이를 한 lineage로 확인한다.
- Personal Need 유·무의 서로 다른 unseen goal에서 Discovery 후보의 실제 용도·상호작용·범위를 평가한다.
- 대표 결과물을 실행하고 restart 뒤 저장 복원과 E/F/G에서 발견한 날짜·sanitizer·geometry·origin 결함의 회귀를 확인한다.
- E의 거절된 선택과 F의 보류된 선택을 synthetic UI/API로 우회하지 않으며 이 보고서가 새 승인을 요청하지도 않는다.

### P5. Windows와 CLI 교체 판단 — 통합 책임자

- Windows에서 P1과 핵심 P3를 반복한다.
- 대표 Task로 CLI와 IDE의 완료율, 지연, retry와 운영 비용을 비교한다.
- P1~P4, Windows, rollback이 통과할 때만 CLI 기본 경로 교체를 판단한다.

## 현 단계 종료 의미

8시간 bounded goal은 제품 철학에 맞는 IDE-only 대체 가능성과 한계를 평가해 **동시성은 가능하고 전체 제품 합격은 보류**라는 결론을 냈으므로 종료됐다. 답은 **가능하지만 pin한 조건부 prototype이며 CLI 기본 경로 교체 수준은 아니다**이다.

이는 feasibility 판정 완료이며 구현이나 MVP 완료가 아니다. T19-N은 `[~]`로 유지하고, 다음 검증은 P1~P5에만 묶어 광범위한 경로 탐색으로 되돌아가지 않는다.

근거: [최종 실측 보고서](T19_NATIVE_IDE_ONLY_LAST_8H_20260915.md), [IDE adapter 인계 계약](T19_NATIVE_IDE_ADAPTER_CONTRACT_20260915.md), [Evidence 인용 경계](T19_NATIVE_EVIDENCE_QUOTE_BOUNDARY_20260915.md), [승인된 제품 브리프](../../PROJECT_BRIEF.md), [Discovery v1.3.5 평가](../../tests/eval/results/discovery-agent-v1.3.5.md).
