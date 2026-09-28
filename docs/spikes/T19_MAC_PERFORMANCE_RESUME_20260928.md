# Mac 성능 개선 Goal 재개 체크포인트

## 최종 종료 — 09:50 KST경 사용자 조기 마무리 승인

- 사용자가 추가 프론트 보고를 기다리지 말고 완료됐다면 종료하도록 지시했다. Mac 수정·검증을 마쳤으므로 예정10:00까지 대기하지 않는다. 아래 active/추가검사/receipt갱신 지시는 과거 체크포인트이며 이 절이 우선한다.
- 최종 전체검사 unit130+3SKIP/integration325+8SKIP/eval41/Campus3/smoke6/E2E12, 별도 panel161+2SKIP·build·실제 program consumer PASS.09:43 성능 재점검도 전체 응답·상태 동등과 개선 유지를 확인했다. 최종 제품 source는 이후 불변이다.
- 09:50:11 `stopped-runtime-audit-user-finish-0950.json` PASS: 실험Core lock 없음·owner보존·listener연결거절, SQLite50테이블 soak와동일, quick_check ok/FK0. 실험개발창/Core는08:41종료 상태이며 사용자 창·데이터·임시 산출물은 보존했다.
- 정제 receipt와 최종 인계는 사용자 조기 종료/최신검사/성능재점검/종료감사로 갱신한다. 연장구간 모델0, 마지막 계정815.91@08:33은 과거 관측이다. commit/push/프론트소스수정/새VSIX 없음. Windows 재평가와 상위T19/T19-N·MVP 완료는 별개로 남긴다.

## 사용자 연장 — 08:50 KST, 새 마감 오늘 10:00 KST (과거 기록)

- 사용자가 프론트 최신 실측 인계 B1–B5 수정에 집중하도록 마감을 **2026-09-28 10:00 KST / 2026-09-28T01:00:00Z**로 연장하고 계속 진행하라고 명시했다. 아래09:00 마감/작업종료 문구는 이전 단계 기록이며 현재 실행 지시는 이 절이 우선한다. Goal은 아직 complete 처리한 적 없고 active다. 사용자 `/goal edit` 뒤 내부 Goal objective도10:00로 바뀐 것을 **08:52경** `get_goal`로 확인했다. objective의9월29일은 기존 날짜 오기이며 ‘다음 도래10시’와 사용자 당일 연장 지시상9월28일10시가 실제 마감이다.
- 우선순위: B2 설치 경로가 다른 동일 package Core 재사용 방지·안전한 lease-aware 복구, B1 quota/auth/model RPC 오류의 안정된 분류/전달, B3 공식 재시도 및 durable 실패/History 범위, B4/B5 창·Trust·정리 경계. 프론트 저장소/요금설정/사용자 기존창/공유 실행을 무단 수정하지 않는다. 상한은 **계정 누적900** 그대로, 신규호출 중단880/새UI관측15분도 유지한다.
- 최신 frontend main0858811195753e5c7312a79f3aede53c9aff9571을08:45발견. [소스 대조/후속 항목](T19_FRONTEND_LATE_LIVE_TRIAGE_20260928.md)에 보고서를 전부 읽은 결과를 기록했다. controller/port/vendor는cce7751과 같지만 최신UI/source변경도 있으므로 전체프론트가package버전만달랐다는08:26기록은현재main설명이아니다. 프론트 계정1000소진 보고는 이 Mac 계정815.91과 별개다.
- 제품 수정 착수 전 상태: 기존 Mac 최적화의 fullcheck/패널/consumer/15분soak/원본해시감사는PASS. 이전 실험Core36678은STOPPED/exit0, 개발창도닫혀있다. 새로운 수정에 필요한 테스트부터 model0로 진행한다. 현재 public receipt의 완료상태/최종인계는09시기준 1차결과이며 이번 연장 작업 후 다시 갱신한다.

### 09:40 최종 수정 고정·인계 감사 체크포인트 (Goal active)

- 마감오늘10:00KST/01:00Z. 제품source현재고정,Goal아직active.09:34경B2추가race2개재현FAIL→수정: 느린maintenance중복금지·stop뒤RENEW금지·dispose가pending요청drain후RELEASE. lifecycle기존14+새3=17PASS. 원본`core-lifecycle-renew-race-before-split-0937.log`14PASS/2FAIL보존,수정후`core-lifecycle-renew-race-final-0939.log`17PASS. Windowsactualrace는검증안함.
- 최신fullcheck **check-frontend-lease-final-0940.log exit0**(실제09:35경시작): unit130+3skip/integration325+8skip/eval41/Campus3/smoke6/E2E12(54.0s). unit새2개는Windowsbuildpreflight우회없이write:false portablehost/runtimebundle/import/coreidentityexport 및실제classifier포함검사. integration은4실패후grant401/route404/descriptorREVOKED포함. panel **panel-handoff-final-0942.log161PASS+2skip**, `panel-build-handoff-final-0942.log`PASS, `program-consumer-handoff-final-0942.log`PASS. 세명령session22799exit0확인. 실행중Core/nativeworker/유료모델없음.
- 프론트답변 `docs/FRONTEND_LIVE_TEST_RESPONSE_20260928.md` 추가. B1codes/workerFAILED→CLOSED는성공아님/Coreterminal권위, B2업데이트대기, B3explicitretry와portcache업데이트/최대100runretention동시에key삭제·재시작시map소실, B4Trust, B5권한회수와process정리구분/Windows절차. durable실패History/abandon/B5실제process정책미해결명시. frontend직접쓰기/새VSIX/commit/push없음.
- 이전publicreceipt09:29는32artifactrefs·source21·prompt4auditPASS(`receipt-audit-frontend-0930.json`). **그후lifecycle/testsource변경으로최신receipt갱신이필요**: fullcheck0940/unit130/panel161/build&consumer0942/sourcehash22(bundleunit추가)/race전후artifact/Windows미검증/추가모델0 반영. 마지막audit는새파일명으로작성. 기존phaseOne관측/실패원본유지. 최종top인계status와TASKS/일지는이새체크포인트로갱신할것.
- 남은시간: source/receipt·문서검토, 필요시Windows준비코드읽기검증, 마지막프론트main조회/사용한Core정지·DB불변audit,마감10시직전최종safe검증. **새paid근거없고815.91@08:33freshness만료**,유료재개없음. 이전approveddev창/Core08:41종료유지,기존Kiro창/서버/임시DB삭제금지. Deadline도래시Goal완료는Mac개선시간창만이며T19/T19N·Windows/MVP완료아님.

### 09:20 프론트 수정 검증 체크포인트 (이전 기록)

- B2 source: `coreInstallationIdentity`/main owner/lifecycle 설치 비교, 실제 lease 보유자만 RELEASE, descriptor instance 교차 전송 금지. 추가로 준비가 실패하면 selected를 캐시하지 않아 retry가 private-directory/identity 검증을 건너뛰지 않는다. lifecycle14회귀 PASS; Windows actual managed test에동일내용 다른설치root/lease종료대기/History·credential보존 추가, 실제Windows는 NOT_RUN.
- B1 source: 새 `native-rpc-error.cjs`/native-client error own-property 처리. known structured type만7고정코드 분류, unknown/malformed/conflict generic, raw detail 미노출. classifier13/NativeClient5new/worker7new PASS. `native-failure-retry.integration.test.ts`는 실제SQLite/authHTTP/SSE/NativeRelay로4오류·samekey중복방지/newkey재시도·DBreopen시Project보존/runtransient 구분을 검사한다.
- Fullcheck `check-frontend-fixes-0910.log` (실제09:08경 시작) exit0: unit128+3skip,integration325+8skip,eval41,Campus3,smoke6,E2E12. 그뒤lifecycle retryguard·worker/Trust tests와consumer추가. panel155+2skip `panel-frontend-fixes-0919.log` PASS는lifecycle추가3test전. `panel-build-frontend-fixes-0919.log`는잘못된pnpm명령으로FAIL, 올바른`pnpm panel:build` `panel-build-frontend-fixes-0921.log` PASS(파일명은실제시간아님). worker첫회귀는permission모듈테스트stub누락으로실행전FAIL, 기존harness동일stub보완후12/12PASS. 제품gate를완화하지않음.
- `program-consumer-frontend-fixes-0920.log` PASS: 실제cce7751 controller/port/HTTP/SSE/SQLite + delayedAgentfixture. 4오류가PortError.message로보존,조회반복모델0,Core같은Project/Session새keyretry정확1회/새portrestore모델0. 옛port는실패runIDcache때문에옛오류유지하는현재frontend한계도재현했다. frontend직접수정0,latest085controller/port/vendor동일증거는08:45compare.
- Trust추가1회귀: 정확한 nativeErrorCode/History읽기/Agentmutation차단/사용자grant후worker1/errorclear/dispose후grant무효. B3durablefailure/abandon·B5bridge/Enterprise영향미해결. 항목별triage·DECISIONS·TASKS갱신. **남은10시까지** 최종source검토/필요회귀/새전체check·panelbuild/receipt&handoff최신085 및테스트해시반영/안전감사. Goal완료아직아님. 새paid불필요,마지막dashboard815.91@08:33은expired이므로paid전fresh조회필수. 실험Core/devwindow08:41종료상태유지,임시파일삭제없음.

### 09:00 B2 수정 후보·대상검증 (이전 기록)

- `packages/runtime/src/portable-core.ts`에 검증된 resource.root/executable/args/sorted env의 `coreInstallationIdentity` 해시를 추가하고 main owner에 runtimeIdentity를 기록했다. 이 해시는 권한을 부여하지 않으며 기존 package hash/exact source/path 검증은 유지한다.
- `core-lifecycle.cjs`는 package/identity 불일치(legacy missing 포함)에 lease를 갱신하지 않고45초 시작 예산 안에서 이전 owner 종료를 기다린다. 계속 살아있으면 CORE_UPDATE_WAITING_FOR_OWNER_EXIT. 소유PID를 강제종료/lock삭제하지 않는다. descriptor-instance 불일치 lease 전송을 막고 실제lease보유자만 RELEASE한다. 성공 시 errorCode:null로 이전 대기 오류를 지운다.
- 새CJS11회귀 PASS: 같은install공유/diffinstall·legacy·diffhash거절/45초상한/oldowner정상exit뒤replacement/no renew/no kill/invalidowner/descriptor회전. 기존frontendhost4회귀포함15PASS. runtime+HostLeases6PASS, pinnedtypecheckPASS(`typecheck-install-identity-0900.log`). Windows `test-managed-core.mjs`에 동일내용 다른설치path에서활성owner보호/lease종료대기/History와credential회전조건을 추가했지만 **Windows NOT_RUN**. 전체check/최종패키지검사는 아직 이 후보 이후 실행 전이다.
- 다음 B1 RPC 안전분류 작업. 설치된 MacKiro source는 internalError가 JSON.parse(error.message) 또는 `{details: message}`를 data로 넘기며, ModelRegistryUnavailableError/UnauthenticatedError도 -32000을 사용한다. 따라서 숫자 -32000만으로 auth를 단정하면 안 된다. `data.errorType/name/__type` 등 정확한 알려진 구조에서만 분류하고 알수없는/충돌은generic유지; rawmessage/토큰/경로전달금지. 현재상품 native-client는 여전히 generic NATIVE_RPC_REJECTED이며 B1 구현 전이다.

## 최종 Mac 작업 종료 체크포인트 — 08:43 KST

- 승인된 2026-09-28 09:00 KST 마감 전 Mac 개선·반복 측정·회귀·Windows 인계를 정리했다. 아래의 active/후보/미복귀/실행 중 표시는 **당시의 역사적 기록**이며 이 절이 우선한다. [최종 인계](T19_MAC_PERFORMANCE_HANDOFF_20260928.md)와 [정제 receipt](T19_MAC_PERFORMANCE_RECEIPTS_20260928.json)를 사용한다. T19/T19-N은 `[~]` 유지하며 MVP/Windows/학습 효과 완료가 아니다.
- 최종 전체 `check-final-0836.log` exit0: unit123+3SKIP, integration323+8SKIP, eval41, Campus3, smoke6, E2E12(53.6s). 별도 panel123+2SKIP, JSON/enrichment/CRLF/cancel34PASS, panel build, actualprogram consumer PASS. actualconsumer의 Agent는 delayed fixture다. source/prompt는 최종 검사 이후 변경하지 않았다.
- 실제 Core 15분 읽기 soak는86회·9,374view요청·16Project/77filtered view 모두 전체 응답 동등, SQLite50테이블/run 목록 불변, global idle, integrity PASS였다. RSS122080→최대/마지막245744KiB 관측은 누수 부재/부하 수용량 보장이 아니다. 모델0. `native-read-soak-0821.json` 원본 유지.
- **실행 종료:** 승인 Kiro 개발 창만08:41 UI로 닫았다. Core session36678/instancee334df8f-786e-45e5-8e22-0c2ea3cb5214는 전역idle 확인 후 Ctrl-C로 STOPPED/exit0. endpoint65164는 연결 거절, active lock 없음, stopped owner 보존. 종료 뒤50테이블 불변·quick_check ok·FK0(`stopped-runtime-audit-0843.json`). 다른 창/서버 종료 및 임시 파일 삭제 없음. 더 이상 이 session을 실행 중이라고 취급하지 않는다.
- 최종 계정 관측 **815.91 at08:33:55**, overagesDisabled.07:27 이후 유료모델0. 누적900상한을 유지했다. 다음 paid 실험에는 새 승인 시간·예산과 새 계정 관측이 필요하며 이번09:00 deadline runner를 그대로 재사용하지 않는다.
- frontend main73b57e2...c36은08:22 동일,08:26compare는 actualconsumer clone cce7751과 package version 한 줄만 다름을 확인했다. clone clean/프론트 수정0. canonical Discovery1.3.5/Builder1.3.10/Helper1.2.0/Analyst1.0.8(출력 구조 개선만)의 packaged SHA 일치. 의미 오류·생성 앱 경계 결함은 인계에 명시했다.
- 변경은 baseline04117c5 위 미커밋 worktree다. commit/push/배포 없음. 새 helper/test/fixture도 있으므로 `git diff`만 복사하면 누락된다. 기존 사용자 변경을 보존하고 Git 전달 방식 승인 후 필요한 신규 파일을 포함해 같은 소스를 Windows에서 평가해야 한다. 기존 frontend:handoff의 과거 Windows 검증 metadata를 이번 Mac 변경의 새 증거로 재사용하지 않는다.

## 이전 진행 체크포인트 — 08:08 KST (당시 Goal active)

- **08:14 추가progress(제품/prompt변경없음):** 완료streamingapp독립HTTP20개재실행→19PASS/소수limit하나expected400actual200FAIL재현. 각childcloseawait,20개모두health유지/outsidecanary누출0. 새`streaming-independent-http-repeat-0813.json` 보존. private`audit-streaming-runtime-boundaries.mjs`는compiledparse0.5→0수락/0→400을확인하고64KiB×128(8MiB) 개행없는line이첫yield전전체128chunk를소비함을재현(개행있는경우2prefetch). `streaming-runtime-boundaries-0813.json`실제08:12:14. src3+dist2SHA전후불변. GB/peakRSS측정아니고lineCountlimit≠bytebound기능반례다. 두보고서정제JSON추가,인계/journal기록. 단순prompttips추가로미검증채택하지않음. 현재08:14이므로9시까지마지막audit계속. 모델호출은07:27이후0.

- 이번turnprogress: Windowsportablebuild의Node/선택license gate가산출물삭제·bundle후에야실행됨을읽고,동일검증을첫output변경전으로이동. 새`scripts/portable-build-preflight.mjs`+8unit. 기존pin/regular/non-symlink/sidecar공식SHA유지,Maccrossbuild지원없음. 실제Macbuildentry예상NODE_DISTRIBUTION_UNVERIFIED 38ms/target전후없음검증`portable-build-early-reject-0802.json`실제08:00:04. WindowsbuildactualPASS아님. source/DECISIONS/인계/journal기록.
- 최신전체 **check-portable-preflight-0803.log exit0**: unit123+3SKIP,integration323+8SKIP,eval41,Campus3,smoke6,E2E12(53.9s). 첫0801log는새정렬test명시타입누락lintFAIL→그타입만고침. 이전서로semicolon실행한lint/format/diff의최종exit0는lintPASS증거아님(원본보존). 마지막0808 lint/format/diff는&&로실패전파PASS. productApplication/storage변경없고packagingscript만추가. Core36678재시작불필요,모델실행없음.
- [정제JSON근거](T19_MAC_PERFORMANCE_RECEIPTS_20260928.json)추가.9개비교의강조시나리오/14원본artifactSHA/선택현재source5개+prompt4개SHA/최신검사·취소·복원·Mac조기거절/사용량을whitelist. source5개는전체작업tree가아니라고명시,WindowsNOT_RUN. 현재source/prompt/원본SHA전부검증PASS,credential·대화원문·개인경로미포함. receipt현재IN_PROGRESS이므로마지막시각/검사/계정/Goal상태를9시정리때갱신. private`emit-mac-performance-receipt-data.mjs`로데이터생성되지만폴더전체dump하지않고선택필드만출력; localfile편집은apply_patch. generator출력limit초과초기실패뒤선택metrics로축소했고원본표본은삭제하지않음. docsJSON은Biomeignore라기본JSON2spaces그대로다.
- readonly`summarize-native-benchmarks`새summary0803:60actionreports55PASS/5FAIL. 비모델confirm/prepare·다른scenario·실패실험포함이므로nativecall수/의미품질rate로표현금지. frontendclonegitstatusclean;main마지막07:46same73b57e2. 최신계정815.91@07:47이후model0이며15분freshness는만료됐으므로새paid전새UI관측필수. 기본적으로더paid할증거없음. App/Storage/prompt/nativeWorker는아래07:49와동일,Core **session36678**/URL65164/instancee334... 유지.
- 다음: 현재08:08, **마감오늘09:00KST**까지Windows인계/최종품질·안전audit. 남은fullAggregate추가최적화는실제Analyst/Evidencecontext를만지므로단순히속도목표로범위를넓히지않았다. Builder1.3.10의정수경계/자원cleanup실패와Helper/Analyst의미한계를정확한실제코드·결과와대조해보고최종claim을검증하는것이유용하다. 불필요한prompt튜닝/모델반복금지. 마지막전역idle/사용량/소유Core·평가worker09시정리/검증receipt·인계최종화필요. commit/push/프론트수정/전역설정/임시파일삭제없음. Goal현재active;차단아님.

## 최신 진행 체크포인트 — 07:49 KST (Goal active)

- **07:53 후속(제품변경없음):** `repository.integration.test.ts`에 동률updatedAt·역순삽입·여러head revision111개에서 기존무제한SQL.slice와새LIMIT1/5/20/100의Ledger/Evidence순서를비교하는2회귀추가. storage대상15PASS(`ledger-tied-order-0754.log`,실제07:53:10). 기존SQL/제품수정없음. 최신전체321검사는이2test추가전이며다음전체예상323. 추가ad-hoc `biome check`는repo공식lint와달리import-assist정렬3개를요구해exit1(기존import포함); 무관한import전체재정렬하지않고공식lint/format로검증한다. lifecyclebench첫참조별도모듈옵션은공유errorclass가없는bundle이면negative동등성failclosed하며기본재현옵션을사용한다.

- 이번 turn은 실제 progress다. Analysis lifecycle5곳의 미사용fullLedger/proposal읽기를기존validatedEpisodeHistory로대체해 **채택**. Application only5calls; 실제Analystcontext/Evidencebatch판정/FinalUpgrade gate 그대로. 신규migration/cache/policy/protocol/prompt/frontend없음. `scripts/benchmark-analysis-lifecycle.mjs`는 독립DB/clock/id/warmup5+교대30/0·100·1000, 정상·stale/금지오류·idempotent재생응답과 **모든SQLite테이블** 매cycle동등성.1000개 close7.494→1.231ms/retry6.834→0.286/terminaltimeout6.316→0.220/submit12.761→7.013, 반복같은방향. full-reference재구성정확5method/driftfailclosed/errorclassidentity실제dist공유. AppSHA37ddb930...ae49e. initialfrozenbundle오류classidentity와불완전fixture실패로그보존,오류oracle완화없음.
- 최신전체 **check-analysis-lifecycle-0746-isolated.log exit0**: unit115+3SKIP,integration321+8SKIP,eval41,Campus3,smoke6,E2E12(53.5s).대상Application46PASS,actualprogramconsumerPASS`program-consumer-analysis-lifecycle-0748.log`(Agentdelayedfixture). 처음전체도구lint/다음4173기존서버충돌실패보존,지원VIBE_E2E_FRONTEND_PORT=4183으로GUI전체재검사. 기존4173서버건드리지않음. panel123+2SKIP/JSON18/측정16은07:32측정도구수정후PASS;그뒤제품CJS변경없음.
- currentCore **session36678**, `http://127.0.0.1:65164`, instance`e334df8f-786e-45e5-8e22-0c2ea3cb5214`; old81514idle→STOPPEDexit0. 승인KiroProject866...창만07:48:39idleReload WORKER_STARTED/CONNECTED. tempbundle/prompt는기존Current108그대로. native run/Analysis전역idle. 실제16Project/77filteredview 모든Snapshot/Evidence의재시작전후SHA **1cd273ee287488e190374baac188ad17cee3da80f63a42b1fc568bf698b6984b** 동일 (`native-views-before-lifecycle-0746.json`, `native-views-after-lifecycle-0749.json`). 다음변경비교는이새SHA사용.
- 지난07:27 actualnativecancelqueue **PASS** `native-helper-cancel-queue-final-0730.json`: CoreACK4.053/nativeterminal관측36.766ms; retryCore36.623Z→oldterminal36.630→newnative37.342. Helper2+정상Analyst1window7;취소checkpoint불변,회복Helper1개저장/자기AnalysisSUCCEEDEDproposal0후globalidle. 계측helper9tests+CRLF7PASS. old0610/0615FAIL+addendum은유지. 현재로그는runID결합typedACK가아니라격리worker순서증거다. 제품worker추가변경없음.
- 새dashboard **815.91 at07:47**,overagesDisabled,usagefile갱신. 07:27이후모델0. 신규880/절대900/15분freshness/오늘09:00마감유지. frontendmain07:46readonly재조회73b57e2...c36그대로. Discovery1.3.5/Builder1.3.10/Analyst1.0.8(구조개선만채택)/Helper1.2.0 그대로.
- [인계 초안](T19_MAC_PERFORMANCE_HANDOFF_20260928.md) 추가·갱신. Windows절차/명령/실측한계/미커밋/oldkitWindowsmetadata재사용금지기록. journal/DECISIONS/TASKS모두업데이트,상위T19/T19-N미완료. **남은09:00까지** 의미있는추가backend신뢰성/포터블·프론트계약검토→필요한작은검증을진행하고마감전에최신전체검사/계정표시/유휴·소유프로세스정리/인계최종화. 아직Goal완료아님. 새유료모델이필요한증거가없으면추가하지않는다. 임시파일삭제/commit/push/프론트수정/전역설정변경없음. CUA기존kiro바인딩유지;compaction뒤documentation먼저.

## 최신 진행 체크포인트 — 07:21 KST (Goal active)

- 이번 turn은 실제 progress다. **Analyst v1.0.8은 출력 구조 신뢰성 개선에 한정해 유지**하기로 판정했다. 원본107과 동일8개 inputSHA 비교: source-first 원본3/8(schema6/8)→후보6/8(schema8/8) 두회, collections/requests5/8동률(schema양쪽8), 새lifetimes/order/normalization4/8동률(schema1075/1088). 지연개선없음. 인용·선택의독립성·직접반복·계획/수행오분류는남는다. [전표본/판정](t19-analyst-prompt-experiments/README.md). 같은SHA cf848...cd9유지,새prompt튜닝없음. Discovery1.3.5/Builder1.3.10/Helper1.2.0그대로.
- 新완료artifacts: 107held-out `analyst-clean-jifKXQ`5/8,108held-out반복`YStmlG`5/8,108new`9U9wCq`4/8,107new`KvJxlO`4/8,107sourcefirst`PrAPJl`3/8. 모두finalIdletrue/retry0/Core변이0/Haiku/freshH. old108 source`7Fqxk4`/`Zb2rJL`와newbaseline8inputSHA일치. clean command에optional SHA-pinned107archive선택과thirdfixedcorpus를추가; 정상runtime임의override없음,8상한유지. exactSHA1.0.7 `0d0c7f...149c`;새fixture`evidence-analyst-paired-unseen-20260928.json`,기존109unseenNOT_RUN유지. 새fixture의NOT_RUN은immutable입력정의이며실행결과는별도metadata에보존한다.
- ROOT`audit-analyst-pure-policy.mjs`로모델원문→실제adapter parser→기존순수domain evaluator offline대조. 정확입력SHA검증/proposal-localConcept/priorEvidence없음,모델0/DB변이0. 직접인용변형·DIRECTLY_LED상승·MEDIUM/DEMONSTRATED는Core거절. 하지만108new미래타이머정리계획APPLICATION/MEDIUM/EXPLAINED는수락된다;107held/source의힌트뒤예측DEMONSTRATED도수락된다. 상태실제저장·전체alias/job/reducer검증아니며semantic모든오류차단으로표현금지. private7reports의`*-pure-policy-0715.json`과원문SHA보존.
- 최신 **전체check-analyst-paired-0718-gui.log exit0**: unit115+3SKIP,integration319+8SKIP,eval41,Campus3,smoke6,E2E12(53.7s). 처음제한sandbox `check-analyst-paired-0715.log`는E2E이전PASS뒤ChromiumMachPort시작실패12개/exit1;원본보존,허용권한으로전체명령재실행PASS. panel123PASS+2SKIP(`panel-analyst-paired-0715.log`),bridgeJSON/enrichment18PASS,actualprogramconsumerPASS(`program-consumer-analyst-paired-0718.log`),panelbuildPASS(`panel-build-analyst-paired-0720.log`). 기존lint warning2개보존.
- 전체검사뒤**측정도구만작은수정**: WindowsCRLF에서Evidence reference메서드marker불일치를찾고`scripts/benchmark-reference-source.mjs`로LF/CRLF경계만인식한다. 실제소스outside-method bytes유지,duplicate/missing/reversed drift거절. 7testPASS,실제currentSourceLF/CRLF의esbuild산출물동일. benchmark다시0/10/100/1000독립DB교대30전체응답동등성PASS(`evidence-crlf-reference-recheck-0724.json`,실제at07:20:40). 1000중1개116.649→1.571ms. 제품Application/Storage변경없음. 마지막format/diffcheckPASS;새benchmarkhelper추가후전체check재실행은아직안함(대상검증만).
- 실제nativeCore **session81514 유지**, `http://127.0.0.1:51786`, instance`523b3ff1-2095-4aca-8cd7-13389d77c6ee`. 16Project/77filteredview/Snapshot전체응답SHA006faee9...e8894그대로(`native-views-after-all-analyst-pairs-0715.json`,실제07:16:16). 전역idle. temp evalhost를새commandCurrent표기로재번들,승인창Project866...만07:21:38idleReload→WORKER_STARTED/CONNECTED. 현재lease/모델작업없음. Core재시작필요없음.
- 새 dashboard **815.47 at07:17:33KST**,overagesDisabled,usagefile갱신. 이후모델0. 신규880/절대900/15분freshness/09:00마감유지. 현재시각다시확인할것. frontendmain마지막조회06:49`73b57e2...c36`그대로,cloneprogram cce7751의controller/vendor는같고main차이는package0.0.3뿐. staleDiscoveryonly인계문서로현프론트작업을단정하지않는다.
- **다음:** 수정된native취소재요청runner의계측정합성을검토하고필요하면freshusage+idle후최대2Helper+정상Analyst로한번bounded재검증. 현runner가workerOffset뒤첫취소status를쓰므로foreign/priorlatecancel을첫자기AGENT_RUNNING_HELPER뒤로제한하는회귀가도움될수있다(실제버그단정/제품worker변경전증거필요). 기존0615FAIL과0623readonlyaddendum을덮어쓰지않는다. 이후최종인계요약/전후표/재현명령/Windows제출전평가절차를새문서로정리하고남은안전한backend검증을09:00까지진행. source/goal미완료아닌progress이며blocked아님. commit/push/frontend수정/tmp정리/기존handoffWindowsmetadata새Mac증거로재포장금지.

## 이전 진행 체크포인트 — 06:41 KST

- 이번 turn도 실제 progress다. **Evidence 조회 최적화 채택**: transaction-local validated trace/Project/Episode/session correlation 재사용 → optional conceptId의 parameterized accepted/proposal membership filter → validated `readEpisodeHistory`로 미사용Ledger/proposal hydration 제거. 기존 full aggregate/Analyst·가시성·현재rev/hash/schema·정렬·100Concept계약·Core정책·프로토콜/프론트·DB schema 유지. 핵심3파일 Application/ports/SQLite 외에 test/benchmark/consumer만변경.
- frozenApp `application-before-evidence-v1.mjs` SHA561a7eca...a6fa. 독립SQLite2/동일입력/clock/id/warmup5+교대30/전체Evidence·Helper·Snapshot deepEqual. sharedEpisode100전체196.814→12.630ms(SQL2811→813),1000중1개128.435→1.514ms(SQL8031→21). one-per-concept100전체116.076→16.012ms,1000중1개117.468→1.442ms. 재구성반복115.985→16.214/116.355→1.552. Core계산치이며모델/Windows/일반P95아님. staged중간성능/실패기록은journal보존.
- 재현 pinned typecheck뒤 `node scripts/benchmark-core-context.mjs NEW_REPORT 0,10,100,1000 --uncached-evidence-reference 0 --evidence-trace one-per-concept`. 마지막인자생략shared. baseline04117c5의Evidence메서드만현재소스에삽입한temporaryreference;markerdrift거절. private `evidence-history-shared-0638.json`, `evidence-history-many-0639.json`, `evidence-history-repro-0637.json`의JSON.at이실제시각. AppSHA35d34c86...bc34,Storagebbaafdee...e1fe.
- **최신전체check-evidence-history-0638.log exit0**: unit115+3SKIP,integration319+8SKIP,eval41,Campus3,smoke6,E2E12(53.7s). 대상22검사·actualprogramAgentController의empty/full/filteredEvidence+OBSERVED_ONLY/userUnderstanding0·format/diffcheck PASS. consumer `program-consumer-evidence-history-0637.log`는 실제controller/port/authHTTP/SSE/SQLite지만Agent경계delayedfixture다. 최초test오류2개(source/dist에러class혼합,필수helperConversationLimit누락)는test만수정,오류계약완화없음. CJS panel118PASS+2SKIP은이번turn취소회귀추가후결과이며그뒤제품CJS변경없음.
- **현재Core session81514**, URL`http://127.0.0.1:51786`, instance`523b3ff1-2095-4aca-8cd7-13389d77c6ee`. 이전38643정상종료. latest compiledEvidence최적화로드. 실제16Project/77filteredEvidence/모든Snapshot전체응답전후SHA006faee9...e8894동일+전역idle. `ROOT/audit-all-project-read-views.mjs`가before/afterreports생성;원본전후json보존. approvedKiroProject streaming`project_866f9b2a-77ca-4769-a776-4fa2dc207dcf`,06:40:02idleReload WORKER_STARTED. 실행중모델/lease없음.
- 계정 **fresh811.05 at06:35KST**,overagesDisabled,usagefile갱신. 그뒤모델0. 880새호출중단/900하드/15분freshness/09:00마감유지. 최신프론트main마지막조회05:56의73b57e2그대로이며이번turn재조회안함. promptDiscovery1.3.5/Builder1.3.10/Analyst1.0.8후보/Helper1.2.0변동없음.
- actualnative 취소실측wrapup: union/streaming각취소PASS,ACK5.834/3.838ms,nativeownedterminal관측527.215/527.948ms;새Helper42.458/38.503초PASS·같은pair재사용. streaming은Evidence/Analysis불변확인. 첫즉시재요청0610은취소빠라overlap미관측FAIL보존. 0615는새run21:14:56.787Z→이전nativecancelterminal56.957Z→새native58.016Z로**queueorder확인**,하지만마지막정상자동Analyst가끝나기전idleauditFAILED. 원본수정없고06:21read-onlyaddendum PASS로그JobSUCCEEDED/proposal0+globalidle확인. 새 runner는앞으로자기회복EpisodeAnalysis만최대60초기다리고durablecheckpoint결과를전체verdict와분리;수정runner유료재실행안함. VMworker회귀는CoreCANCELLED뒤ownedpromptterminal지연3ticks동안nextclaim없음을증명,model0.
- **다음작업:** 남은2시간여동안Analyst1.0.8후보의최종채택/복귀판정과최종인계정리. 108sourcefirst6/8두회/heldout5/8,107baseline2/7;엄격oracle완화금지. 필요하면같은입력의107baseline비교또는고정후unseen한정평가를실측하되현재cleancommand는1088cell두corpus만지원하고gate를무작정우회하지않는다. 이후genericbackend회귀/프론트main읽기전용재조회/최종전체check/채택·기각표/Windows평가절차. commit/push/frontend수정없음. oldfrontend:handoff의기존Windowsmetadata를새Mac증거로재사용금지.

## 이전 진행 체크포인트 — 06:00 KST

- 이번 turn은 **실제 개선 progress**다. `HELPER_GET_CONTEXT`의 최근closedEpisode20개에서 불필요한 fullEvidence/Ledger hydration을 제거했다. 새 `readRecentEpisodeHistoryForProject` port/SQLite reader로 Episode/Event만 검증하고 나머지 관련성·projection·personalization 로직은 그대로다. 기존fullAPI/Analyst 유지. query는같은project/status != OPEN/updated_at DESC/limit, shared `#episodeHistory`로 head/schema/hash/eventedge순서 유지. no cache/migration/protocol/frontend변경.
- **채택**: 대상19PASS(실재foreignProject격리·재오픈·status/현재rev·hash·limit·redaction·first5·전체Context동등성). `benchmark-core-context.mjs`를 frozenmjs 및 `--full-episode-reference`와5번째인자HelperhistoryCount0..50로 확장. 독립SQLite2개/동일clock·id·입력/warmup5+교대30/매전체응답deepEqual. 20대화+100/1000Concept 동결대비19.732→6.202ms/146.714→7.548ms, 재구성반복19.014→5.840ms/134.061→7.342ms, SQL315→275/299→259. 기본Decision1개만있는Helper0대화조건1000도22.168→6.587ms. Core계산수치이며 모델/Windows/일반P95아님.
- private reports `helper-history-before-0550.json`, `helper-history-paired-0553.json`, `helper-history-repro-repeat-0554.json`, `helper-history-empty-repro-0555.json`. 동결App `application-before-helper-history-v1.mjs` SHA41b47c3d...7c0f8c. 신규AppmoduleSHAeeff0194...655f5,Storage00782c94...973de. 파일명보다JSON.at이실제시각. 재현: pinned typecheck뒤 `node scripts/benchmark-core-context.mjs NEW_REPORT 0,100,1000 --full-episode-reference 20`.
- 최신전체 **check-helper-history-0556.log exit0**: unit115+3SKIP,integration316+8SKIP,eval41,Campus3,smoke6,E2E12(53.5s). actualprogram consumer PASS(`program-consumer-helper-history-0553.log`,모델경계delayedfixture). panelCJS117PASS+2SKIP은05:47후productCJS변경없음. 마지막format/diffcheckPASS. 첫테스트의detachedspy receiver오류만test수정, 제품 실패 은폐없음.
- 현재Core **session38643**, `http://127.0.0.1:59080`, instance`34dc5203-cd29-46c4-816d-dac00497e47a`, 최신compiledoptimization로드됨. 모델/Analysisidle. 최신snapshot고정correlation재시작감사SHA `f1bc53c863be0d67ed0f85bbb91c21140c0f503c38a0522882ce77e1118db234` 같음,TaskCOMPLETED/Helper2. 처음random SDKcorrelation으로rawhash비교실패한계측오류는journal에보존. 수정 전후Context동등성은benchmark로증명. 승인개발창Project`project_4c32f35a-daf7-483d-bac9-0254f31b5948`,idleReload05:58:08workerstarted. 앞선Core64550/15166정상종료.
- 새dashboard **808.72 at05:59**,overagesDisabled,usagefile갱신. hard900/신규880/15분freshness유지. Helper실험baseline1+후보3이이전조회후추가, 조회최적화는모델0. 프론트main재조회`73b57e2fe6a891b00e42088aed8d9fb7c9a36c36` 이전과동일.
- canonical Discovery1.3.5/Builder1.3.10/Analyst1.0.8후보/Helper1.2.0. **Helper1.2.1은기각·archive**, sourcecanonicaldiff없음,아래05:48과실험README참조. Analyst1.0.8의최종채택판정은아직남음.
- 다음작업: 실제nativeHelper취소/소유terminal확인/새요청회복/Project전환을bounded실측하거나취소복원race진단을진행. 신선한사용량·Coreidle/승인W확인후만paid,완료Builder재실행금지. 남은3시간동안추가작은병목·신뢰성개선, Analyst후보판정, 최종전체검사/채택·기각표/제출전Windows재평가절차를09:00전에정리. 구frontend:handoff의Windows검증metadata를Mac신규결과로재사용금지. push/commit/frontendedit없음.

## 이전 진행 체크포인트 — 05:48 KST

- Helper v1.2.1은 세 완료 합성 Task에서 실제 실행했으나 union 타입 보장 과장·일반 개선 근거 부족으로 **기각**, 원문1.2.0/SHA c6a96...193231로 복귀했다. [실험표](t19-helper-quality-experiments/README.md)에 baseline반복/후보3회/strict tsc 반례/기각 사유 기록. 새 source-specific 정답을 prompt에 넣지 않았으며 false model output을 수정해 성공으로 만들지 않았다.
- 복귀 전체 `check-helper-rollback-0547.log` exit0: unit115+3SKIP,integration314+8SKIP,eval41,Campus3,smoke6,E2E12(56.3s). panel CJS117PASS+2SKIP. 후보 시점 version 기대값/gate 실패는 별도 log 보존. canonical/helper adapter test/source에 최종diff없음. eval은기각archive/hash만추가.
- 현재 Core **session64550**, URL `http://127.0.0.1:55684`, instance `2bf63981-7410-4999-b4a4-bb9c0c6ca1e3`. 유휴Core69416을 정상종료하고 Helper1.2.0으로 재시작, temp host재번들·승인 창idleReload05:47:23. 활성Project `project_4c32f35a-daf7-483d-bac9-0254f31b5948`, 모델 실행 없음. Discovery1.3.5/Builder1.3.10/Analyst1.0.8후보/Helper1.2.0.
- **fresh usage806.59 at05:37**; 그 뒤 baselineHelper1+후보Helper3 호출. 05:47 statusbar807.72는 cached이며 freshness파일업데이트안함. 다음 유료 호출 전 freshdashboard 재조회. 하드900/신규880/15분 gate 유지.
- 다음은 실제 Helper Context의 최근closedEpisode20개가 사용하지 않는 전체 Evidence/Ledger를 읽는 병목이다. 기존 restore 전용 EpisodeHistory reader를 재사용 가능한 별도 recentclosedHistory port로 확장하는 작은 후보를 측정한다. 기존 full aggregate/Analyst 경로 유지, 전체ContextdeepEqual·순서/범위/hash회귀 및 실제 program소비검증 필수. 수정 전 Application을 private `application-before-helper-history-v1.mjs`로 동결했다. 아직 제품 source 변경/채택 전이다.

## 이전 진행 체크포인트 — 05:31 KST

- 이번 turn은 실제 개선 progress다. Project restore가 최근 Helper20개 각각에 불필요한 전체 Ledger/Evidence hydration을 수행하는 병목을 측정하고 제거했다. `EpisodeHistory` port + SQLite validated episode/events reader, Application summary 호출만 변경했다. full aggregate/Analyst 경로, latest20 순서·scope·head·event순서·hash/schema·역할별last5·redaction을 유지한다. 새 migration/cache/protocol/프론트 변경 없다.
- 변경 전 Application을 `<PRIVATE_MAC_EXPERIMENT_ROOT>/application-before-restore-v1.mjs`에 bundle로 동결. 실제 SQLite, 같은 DB의 read-only 비교, 교대30+warmup5, 모든 전체 Snapshot deep equality. delivery 전 Concept100/1,000 중앙값28.113→14.798ms/161.854→22.460ms. delivery 후 반복15.447→2.965ms/148.543→9.683ms, prepare109→69. 0개도2.210→1.825ms. Core 계산 비용이며 모델/HTTP/Windows/P95 일반 보장 아님. 유지 판정.
- 재현 script `scripts/benchmark-core-restore.mjs`는 `<새-report.json> 0,100,1000 --full-helper-reference after-delivery`로 현재 Application의 한 호출만 기존 full API로 되돌린 reference를 임시 생성할 수 있다. marker drift는 거절한다. 소스 수정 없음. 재구성 reference도147.151→9.867ms/동등성PASS였다. private JSON 보고서명은 journal에 기록했다.
- 최신 전체 `check-restore-0526.log` **exit0**: unit115+3SKIP, integration314+8SKIP, eval40,Campus3,smoke6,E2E12(54.6초). 대상17PASS, actual program controller/port+authenticated HTTP/SSE/SQLite 소비 PASS. script에 재현 reference 옵션/SHA metadata를 추가한 뒤 직접0/100/1000 실행과 format/diff-check PASS. 전체 check 이후 제품 source 변경 없음.
- 최신 Core **session59664**, `http://127.0.0.1:50705`, instance `92a1065d-18fa-435e-8c31-4e476e9cd2ca`. 기존Core98277 유휴 확인→정상 종료→새Application시작. 실제 완료 Project Snapshot SHA 전후 `951992857861e0c5db970e0835da7975c3c78863ced4536d54e62bfe4f027345`, Task COMPLETED/Helper1 유지. 승인 개발 창05:28 idle reload. 평가/모델 실행 중 없음. 이전session/instance는 역사적 기록이다.
- 역할/예산은 이전05:17과 같음: Discovery1.3.5, Builder1.3.10, Analyst1.0.8후보, Helper1.2.0. 마지막 **fresh dashboard는805.84 at05:08**이며 이후1회8-cell 비용 존재. 05:28 statusbar806.59는 cached 표시여서 freshness파일은 갱신하지 않았다. 다음 유료 호출 전 dashboard 새 조회 필수. 이번 restore 작업 모델0.
- 다음 가능한 실제 개선: 남은 Helper의 런타임/API 부재 단정 등 의미 품질 문제를 정확한 기존 출력으로 재현·작은 일반 규칙 후보와 반복 비교하거나, native 취소/복원 race를 실제 요청 경로로 더 검증한다. 근거 없는 poll interval/보안 gate 완화·frontend 변경은 하지 않는다. 09:00까지 최종 채택표·전후측정·전체검증·Windows 재평가 절차를 정리해야 한다. 기존 frontend:handoff script는 이전Windows검증 metadata를 그대로 재사용하므로 Mac에서 새Windows검증인 것처럼 재포장하지 않는다.

## 이전 진행 체크포인트 — 05:17 KST

- Goal active 재확인. 마감 **오늘 09:00 KST** 유지. 다음 단계는 프론트의 취소·복원·프로젝트 전환과 관련한 backend 병목/회귀 점검이다. prompt 실험을 계속하기 위한 새로운 근거가 없으면 작은 문구 변경을 무한 반복하지 않는다.
- 계정 새 대시보드 **805.84 at 05:08 KST**, overages disabled. 그 뒤 Haiku 8-cell 1회가 추가됐다. 이 수치를 최신 사용량으로 무기한 재사용하지 말고 다음 유료 batch 전에 UI를 새로 확인한다. 15분 freshness, 누적 880 신규 중단/900 절대 상한 유지.
- v1.0.8 final-check tail 반복은 `analyst-clean-3yom3V` **5/8**, 개선 근거 없어 기각. v1.0.9 순서표·중복 제거는 `analyst-clean-uzAF3h` **2/8**, 6개 필수 proposedCanonicalName 누락(5개 misconception도 누락)으로 기각. 모두 final idle true, retry0, Core mutation0. source-first 6/8 두 회보다 좋은 변형이 아니며 실패 원문/metadata를 보존했다.
- canonical **Analyst v1.0.8 후보로 복귀**. SHA `cf84876b9926c815562ab4481388dbff36b0d0083cfe8bade9d9b06a3cfd9cd9`. 아직 최종 채택 판정 전이다. Discovery1.3.5, Builder1.3.10, Helper1.2.0 그대로. v1.0.8/1.0.9 archive와 기각표 `docs/spikes/t19-analyst-prompt-experiments/README.md`. v1.0.9용 별도 unseen corpus는 작성/구조 검증만 했고 native NOT_RUN이다. 기존 두 corpus를 v1.0.9 unseen이라고 하지 않는다.
- 최신 Core 실행 session **98277**, URL `http://127.0.0.1:63572`, instance `2c5da948-d997-4475-92e0-78b5d3c97f7c`. 유휴 확인 후 이전 Core90927을 정상 종료하고 v1.0.8 빌드로 실행했다. temp eval-host를 tail wrapper 없이 재번들, 승인 개발 창을 05:17 idle Reload Window했고 `WORKER_STARTED` 확인. 현재 worker는 listening이며 실행 중 평가 없음. 승인 Project `project_866f9b2a-77ca-4769-a776-4fa2dc207dcf` 그대로. 다음 clean 평가 종료 시 다시 reloadRequired 규칙 적용.
- 최신 검증: 복귀 뒤 adapter/eval **45 PASS**, CJS **24 PASS**, panel build PASS, format/diff-check PASS. v1.0.9 당시 panel 전체116PASS+2SKIP였고 마지막 source 복귀/미실행 corpus test 추가 후에는 대상24개만 재검증했다. portable/runtime 14PASS+8SKIP; OS 전용 skip을 Windows actual PASS로 부르지 않는다. 마지막 전체 pnpm check는 여전히04:33이라 최종 전체 재검사 필요.
- CUA `kiro` 바인딩 유지. 간헐적 Computer Use inactive는 `getAXState`로 상태를 읽은 뒤 정상 복구됐으며 승인 우회 없음. compaction 뒤 documentation을 먼저 읽는다. 대시보드 닫기+명령 palette를 너무 연속 입력하면 palette가 안 열릴 수 있으므로 관찰 후 재시도한다. Update Now/전역 변경 금지.

## 이전 진행 체크포인트 — 04:52 KST

- 사용자가 재개한 Goal은 **active**다. 아래 03:18 정지 기록은 역사적 기록이며 현재 중단 상태가 아니다. 마감은 동일한 **오늘 09:00 KST**다. 새 계정 대시보드 **804.90 at 04:52 KST**, overages disabled. `account-usage-observation.json` 갱신. 누적 880 신규 호출 중단선·900 절대 상한 유지.
- Core는 실행 중: session **82980**, `http://127.0.0.1:52955`, instance `2cffaf34-8d89-4b01-96c5-e4840241ec8f`. 최신 Application lazy hydration·보호 H 복원 라우팅·빈 Builder resume 계약을 포함한다. native job/Analysis 유휴를 실제 clean 평가가 확인했다. connection.json은 출력하지 않는다.
- 승인 개발 창은 Project `project_866f9b2a-77ca-4769-a776-4fa2dc207dcf`를 열고 있다. **clean 평가 종료 후 worker lease는 resume:false로 해제**되므로 다음 native job 전에 idle Reload Window가 필요하다. 전역 앱 재시작/Update Now는 금지. CUA는 persistent `kiro` 바인딩을 사용하고 compaction 뒤 documentation을 먼저 읽는다.
- canonical prompt: Discovery **1.3.5** (기각한 phase/1.3.7/1.3.8은 archive), Builder **1.3.10** (관측 개선·잔여 결함), Analyst **1.0.8 후보** (미채택), Helper **1.2.0**. Analyst v1.0.8 SHA `cf84876b9926c815562ab4481388dbff36b0d0083cfe8bade9d9b06a3cfd9cd9`.
- 로그 도구 Builder 첫 turn 199.401초 / 추천 선택 뒤 resume **285.308초**, Task COMPLETED. 선택은 합성 UI 추천 click이며 Helper 실제 사용 true, rationale 없음. SDK `.ok` 잘못 검사한 뒤에도 이미 저장된 선택을 재전송하지 않고 read-back으로 확인했다. completion 제출 1회·scope 오류 0회. 생성 앱 independent build/typecheck/12 tests PASS; 20 HTTP probes 중 **19 PASS / fractional limit 1 FAIL**. 소유 OS 포트 child와 합성 canary만 사용. smoke 포트 예약 race·전체 deadline/종료 대기·긴 줄 메모리 제한도 남는다. 생성 앱 수동 패치 없음.
- Analyst baseline v1.0.7 Haiku 7-cell `analyst-clean-y3v4bO`: **2/7 PASS**. v1.0.8 Haiku `analyst-clean-7Fqxk4`, `analyst-clean-Zb2rJL`: 각각 **6/8 PASS**지만 다른 실패. 같은 v1.0.8 Sonnet `analyst-clean-ifArig`: **5/8 PASS**, 중앙값17.512초(Haiku9.669/9.359초). 기본 모델 변경 없음. 새로운 held-out corpus Haiku `analyst-clean-PwZQT3`: **5/8 PASS**. 전부 final idle true, retry0, Core mutation0. 새 입력의 미래 계획→가짜 선택, 직접 유도 반복, 인용 변형 오류가 남았다. 보수적 강도 불일치와 Core 상한 위반은 구분한다.
- clean command는 `Source-first regression` / `Held-out collections and requests` 두 고정 corpus를 선택한 뒤 exact catalog 모델과 8회 실행을 확인한다. 사용자 승인 임시 W/H scope adapter, all-deny, private path, Core idle, fresh H, 모델 ACK/log barrier를 유지한다. held-out에는 oracle에서 유래한 conceptCandidates/relatedConceptNames가 없다. 제품 legacy scope gate는 바꾸지 않았다.
- 전체 check **04:33 exit0**: unit115+3SKIP, integration311+8SKIP, eval40,Campus3,smoke6,E2E12(58.2초). 이후 eval45(adapter 포함)·actual program consumer PASS. 패널 전체 **115 PASS+2SKIP** 및 panel build PASS. 최신 composed-prompt SHA/bytes metadata 추가 후 대상 CJS22 PASS, format/diff-check PASS. 이 마지막 metadata 변경은 아직 eval bundle에 없으므로 다음 실측 전 재번들한다. canonical/model 변경 시 유휴 Core도 새 빌드로 재시작해야 exact version mismatch를 피할 수 있다.
- 다음 작업: Analyst의 남은 일반 정책/인용 오류에 대한 가설을 정해 반복 검증하거나 후보를 archive/복귀한다. 기존 fixture의 엄격한 oracle를 단순히 green으로 만들려고 완화하지 않는다. 다른 backend 병목·취소/복원·Windows model-0 회귀도 계속 확인하고 마지막에는 전체 검사/채택표/Windows 제출 전 절차를 정리한다. T19/T19-N은 계속 `[~]`, Goal 완료 또는 사용자 일시정지로 표시하지 않는다.

## 과거 사용자 요청 일시정지 — 03:18 KST

기록 시각: **2026-09-28 03:18 KST**. 사용자가 Codex 재시작을 위해 작업 마무리와 Goal 일시정지를 요청했다. 완료가 아니라 **사용자 요청에 따른 일시정지**다.

## 범위와 안전 경계

- 실제 마감은 **2026-09-28 09:00 KST / 2026-09-28T00:00:00Z**다. Goal 초기 objective의 9월 29일 표기는 잘못됐으며, 그 문장의 ‘다음 도래하는 오전 9시’와 실험 deadline은 9월 28일로 확정했다. 재개 때 현재 시각부터 확인하고 마감 이후 유료 호출을 하지 않는다.
- Kiro 상한은 **계정 누적 900크레딧**. 보수적 신규 호출 중단선은 880, 지연 정산 여유 20. 초기 756.89, 03:02 새 조회 775.12, 마지막 03:11 화면 표시 **776.64**(갱신 지연 가능). 이것을 현재 사용량으로 재사용하지 말고 새 대시보드를 확인한다. runner는 15분 넘은 관측을 거절한다.
- 사용자 승인: 분리된 Kiro 개발 창의 로컬 평가 확장, 그 창에서만 기존 Vibe Helper 패널 비활성화, 아래 합성 root만 사용. 기존 창/전역 설정/사용자 데이터/Kiro 업데이트/요금 설정 변경 금지. push/commit/배포/프론트 수정 승인 없음.
- Codex 화면 제어 도구가 로그인 변경/만료로 자동 보안 검토 실패했다. **우회하지 않는다.** 사용자가 Codex를 재시작한 뒤 로그인 및 화면 제어 정상 여부를 확인한다.
- Node 24.19.0 / pnpm 11.12.0: 모든 Node/pnpm 명령에 `env PATH="/opt/homebrew/opt/node@24/bin:$PATH"` 사용. 로컬 편집은 apply_patch, 포맷터는 Biome. 기존 untracked 파일과 사용자 변경 보존. tmp 삭제 금지.

## 정지 상태

- 실측 runner는 모두 종료했다. 마지막 SELECT는 11.869초, SUCCEEDED/DURABLE_RESULT.
- 소유한 실험 Core(session 30075, instance `bef80d5a-f839-43e2-9c43-300177b4f59a`, 이전 port 49608)는 Ctrl-C 후 **STOPPED / exit 0** 확인. 다른 서버를 종료하지 않았다.
- Kiro 개발 창(window 7, `[Extension Development Host] workspaces`)은 화면 제어 실패로 닫거나 reload하지 않았다. 평가 확장은 Core가 없으므로 새 job을 받을 수 없고 09:00 자체 stop timer가 있다. 창 종료 여부를 확인했다고 주장하지 않는다.
- SQLite, 생성 앱, 보고서, private connection/descriptor는 보존. credential이나 connection.json 본문을 출력하지 않는다.
- `git diff --check` PASS. 최신 변경 전체 `pnpm check`는 아직 필요하다.

## 파일/경로

- worktree: `<CORE_CHECKOUT>`
- branch `codex/windows-extension-runtime-20260923`, baseline HEAD `04117c520c10e732af709b0d064c020d1d001e55`.
- 합성 root: `<PRIVATE_MAC_EXPERIMENT_ROOT>`
- `baseline-runtime`: SQLite/생성 workspaces/connection. `eval-host/entry.cjs`와 `extension.cjs`: 승인된 임시 평가 확장.
- 실제 frontend clone `program`, main `cce7751dcd40732c700f5576a088ebdf6f91fac7`. 프론트 코드는 수정하지 않았다.
- 상세 일지: `docs/spikes/T19_MAC_PERFORMANCE_20260928.md`.
- read-only 요약기: `scripts/summarize-native-benchmarks.mjs`; 기존 `summary-0312.json`은 마지막 SELECT 이전. 결과 파일을 덮어쓰지 않는다.

## 확인된 개선과 검증

1. Application/SQLite 조회 최적화: Ledger head-only 조회, 최근 100개 중 유효 basis 5개에서 중단, 요청 내 Project/Helper Evidence 재사용. 독립 SQLite 두 개, 구 Application vs 새 Application 교대 30회, 모든 응답 deep equality. 100개 합성 이력의 Discovery delivery 전 43.168→3.154ms, delivery 후 11.785→1.602ms, 새 Helper context 32.119→14.958ms 중앙값. 모델 지연 개선으로 해석하지 않는다.
2. Mac bridge ESM createRequire packaging 복구 + 빌드 산출물 scope-guard startup smoke. 실제 bridge 사전 크래시 해결.
3. pinned Mac Kiro 1.0.794의 MCP catalog 준비 gate. 빈/foreign/malformed/허용 밖 catalog는 모델 시작 전 거절. guard 완화 없음.
4. 실제 program controller의 Builder `message: ""` 재개 허용. 추가 사용자 발언은 만들지 않으며 Helper/Discovery는 기존 검증 유지. SDK/HTTP/실제 program port 회귀 PASS, 실제 native 재개 후 Task COMPLETED.
5. Enrichment/JSON envelope 오류를 `isError: true`로 전달하며 코드/구조/JSON 부족 위치만 안전하게 진단. 입력을 자동 보정/제거하지 않고 Core 변이를 호출하지 않는다. 실제 stdio↔HTTP MCP↔Core 거절/정상 읽기/revoke 회귀 PASS. 재시도 절감의 인과 효과는 미확정.
6. 기존 4173 서버를 보존하기 위한 E2E frontend port override(4183).

전체 check 마지막 PASS(03:00 이후 prompt/진단 변경 전): unit 115 + 3 SKIP, integration 310 + 8 SKIP, eval 35, Campus Drop 3, smoke 6, E2E 12. frontend 49 files/537 tests PASS. 이후 targeted: JSON+enrichment 18 PASS, 실제 native binding 3 PASS, phase+eval 47 PASS, panel 110 PASS+2 SKIP, typecheck/panel build PASS. 최종 전체 검증은 다시 한다.

## 중요: 현재 작업 트리에는 아직 미채택 실험이 남아 있다

### Discovery v1.3.6 단계별 prompt — 채택하지 않기로 판정

현재 production source와 build에는 phase composer Trial B가 연결돼 있다. **재개 시 먼저 원래 full canonical v1.3.5 경로로 되돌리거나, 별도 승인된 실험으로 격리해야 한다. 이 상태를 최종 채택본이라고 전달하지 않는다.** 사용자 재시작 요청 때문에 rollback 편집은 아직 하지 않았다. 자신의 diff만 apply_patch로 되돌리고 사용자 파일은 건드리지 않는다.

관련 파일: `packages/kiro-adapter/src/native-discovery-prompt.ts` 및 test, native relay와 integration test, `examples/kiro-panel/src/native-runtime.cjs`와 test, discovery version source/docs, build/prepare scripts, eval harness와 phase fixture, personalization matrix version gate/test. Builder 1.3.9 변경이 같은 파일에 섞인 경우 구분한다. `prepare-native-agent.mjs`의 원본 Discovery 1.3.4는 이미 stale이므로 정상 full canonical인 **1.3.5**로 맞추는 것이 옳다.

- Trial A: preview 70.375초(11개 거절→10개), 37.294초. prompt 길이 지침 초과 45/50, 41/50. select 25.421초(오류 재시도), spec 51.867초(SPEC_RECOVERY 포함).
- Trial B: preview **26.262초**, 길이 초과 **34/50**, 의미 검토에서도 상태 관리 구조 반복·기술 용어/보장 과장이 남았다. select **11.869초**, 오류 0. 단일 select 개선으로 전체 채택하지 않는다.
- 원래 full prompt preview는 30.609초(30/50 초과), 25.863초(0/50), no-Personal-Need 22.794초(1/50). baseline도 의미 품질 한계가 있어 개선됐다고 주장하지 않는다.
- Trial B Project `project_9167ecfb-1129-4688-8760-0f060c50b013`, SELECT까지 저장. 보고서 `native-phaseb-preview-unions-1.json`, `native-phaseb-select-unions-1.json`.
- Trial A Project `project_44255deb-e1f2-4500-8206-dfbf2ebc4ba9`는 Spec draft, `project_74f0617d-2812-4dc1-8d67-546ffe281398`는 Preview.

### Builder v1.3.9 — 후보, fresh build 평가는 미완료

pending Decision 한 번 조회 후 turn 종료, compiled test 대상/Node 타입 의존성, 정적/런타임 보장 구분 추가. Canonical prompt와 adapter/build scripts/fixture 동기화됨. 기존 실패 Task 재개 94.639초, complete_task 1회로 Task COMPLETED. 하지만 fresh build의 polling/초기 test 실패 감소/의미 정확성 검증은 **미완료**, fixture `liveResult: PENDING` 유지. 완료 보고만 복구한 표본을 fresh 성능 개선으로 주장하지 않는다.

완료된 합성 Project 두 개:

- `project_4c32f35a-daf7-483d-bac9-0254f31b5948`: 첫 Builder 119.372초 Task ACTIVE/Decision 대기 → 실제 Helper 34.499초 → 합성 추천 선택(설명 없음) → 빈 메시지 재개 327.627초 Task COMPLETED. 17개 test/HTTP smoke. 타입 보장 과장 주석 발견.
- `project_74dd732b-d1c8-4db0-8902-b5684eb08d89`: Builder v1.3.8 423.936초 turn 종료지만 Task ACTIVE. complete_task 4회 모두 outer `}` 부족으로 JSON 거절. 진단용 복사만 검사, 자동 수정 제출 안 함. v1.3.9 명시적 재개 94.639초 완료.

첫 프로젝트 추천 클릭에 Analyst가 잘못 낸 Evidence 3개는 Core가 모두 INSUFFICIENT_EVIDENCE로 거절했다. 학습 상태 상승은 없고 구현 Concept 5개 OBSERVED만 기록. Analyst 품질 개선 후보이나 아직 prompt 수정 없음.

## 재개 순서

1. 현재 시각/사용자 재개 확인, Goal 상태 확인. 09:00 KST 이후면 새 모델 실측 없이 최종 정리.
2. repo AGENTS와 필수 문서, 이 파일/일지 확인. 사용량 새 대시보드 확인 전 새 Kiro 호출 금지. CUA 보안 검토 실패 우회 금지.
3. 미채택 Discovery 경로를 full canonical로 복귀하고 tests를 맞춘다. Builder 후보는 fresh 실제 검증하거나 충분한 검증 없이 채택하지 않는다.
4. pinned `pnpm typecheck`, `pnpm panel:build`; actual eval-host bundle을 새 compiled runtime으로 다시 만들고 **idle인 개발 창만 reload**. 이전 Kiro 창에 새 prompt가 자동 적용됐다고 가정하지 않는다.
5. Core 재시작: `VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H=1 pnpm core:native --root <PRIVATE_MAC_EXPERIMENT_ROOT>/baseline-runtime --port 0` (pinned PATH). 연결 파일은 새 instance로 갱신된다. Kiro exact source/기존 trust는 유지.
6. `scripts/benchmark-native-discovery.mjs`/`benchmark-native-build.mjs`는 실제 program adapter를 bundle해 HTTP/SSE/Core/Kiro로 한 번씩 호출한다. 새 report path, 최신 usage/observedAt 필수. runner PASS와 durable Task COMPLETED를 구분한다.
7. 최종 `VIBE_E2E_FRONTEND_PORT=4183 pnpm check`, panel/native bridge 별도 tests, actual program consumer. Windows actual 평가를 Mac branch tests로 대체하지 않는다.
8. 사용자에게 결과/기각 실험/남은 Windows 확인/누적 사용량을 명확히 전달. commit/push는 하지 않는다.
