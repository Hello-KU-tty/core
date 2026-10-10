# Mac 백엔드 성능 개선 → Windows 재평가 인계

Git 전달 후 재개는 [Windows 재개 지침](../archive/preliminary/WINDOWS_RESUME_20260928.md)을 먼저 본다. 아래 미커밋/미푸시 표기는 Mac Goal 종료 시점의 검증 snapshot이며 이후 승인된 Git 전달과 구분한다.

**Mac 작업 완료 — 2026-09-28 09:50 KST경 사용자 조기 마무리 승인:** 예정된10:00까지 추가 보고를 기다리지 않고 종료한다. 1차 성능 개선 뒤 최신 프론트 B2/B1을 수정하고 복구 계약을 보강했다. 프론트 담당자용 [후속 답변](../archive/preliminary/FRONTEND_LIVE_TEST_RESPONSE_20260928.md), [B1–B5 상세 대조](T19_FRONTEND_LATE_LIVE_TRIAGE_20260928.md)와 [정제된 JSON 근거](T19_MAC_PERFORMANCE_RECEIPTS_20260928.json)를 함께 본다. 아래 수치는 Mac 검증이며 새 Windows 평가·VSIX 전달을 뜻하지 않는다.

## 결과 요약

프론트 요청·응답 계약을 유지하면서 Core의 반복 조회 비용을 줄였다. 실제 Kiro 실행의 빈 Builder 재개와 Helper 취소 후 회복도 확인했다. prompt 실험은 성공한 실행과 의미 품질을 분리했고, 효과가 입증되지 않은 Discovery·Helper 변형은 되돌렸다.

- 현재 변경은 `codex/windows-extension-runtime-20260923`의 **미커밋 작업 트리**에 있다. 기준 HEAD는 `04117c520c10e732af709b0d064c020d1d001e55`다. commit/push, 프론트 소스 변경, 배포는 하지 않았다.
- 프론트 읽기 전용 기준은 `Hello-KU-tty/program` main `0858811195753e5c7312a79f3aede53c9aff9571`(08:45 발견,09:48:52 원격 재확인)이다. 실제 consumer clone은 `cce7751`이다. 이후 네 commit은 package/report/UI/surface test의5파일을 바꿨고 controller/port/vendor는 같다. **최신 UI 자체는 여기서 실행하지 않았다.** 이전08:26의 package 한 줄 차이는 당시 main73b57e2에 대한 기록이다. 프론트 Windows 보고는 연결 준비 후 PREVIEW 실패이며 전체 연결 완료가 아니다.
- local protocol 1, SDK 계약, revision/idempotency, source/provenance, Builder workspace 권한과 read-only Helper/Analyst 경계를 유지한다. DB migration이나 새 dependency를 추가하지 않았다.
- 계정 누적 사용량은 08:33 새 대시보드 기준 **815.91**. 사용자 절대 상한 900, 보수적 신규 호출 중단선 880, 관측 유효기간 15분을 적용했다. 초과 과금은 disabled 그대로다. 계정 표시 증가는 개별 호출의 확정 청구액이나 이 작업만의 비용과 같다고 가정하지 않는다.

## 10시 연장: 프론트 실측 요청 반영

| 항목 | 이번 수정·확인 | 남은 검증 |
| --- | --- | --- |
| B2 옛 설치 경로의 Core 재사용 | resource/runtime identity를 package hash와 함께 비교. 다른 install/legacy owner에 lease를 갱신하지 않고 정상 종료 대기. 실패 준비의 retry 우회와 느린 주기RENEW/종료 경합도 보강 | 같은 portable bytes·다른 설치 root의 실제 Windows 자동 연결·History/credential 보존 |
| B1 quota/auth/model 오류 은폐 | 알려진 bounded structured RPC 오류만 고정 코드로 분류. native-client→worker→Core run→실제 program port 전달 확인. 원문/토큰 노출·자동 유료 retry 없음 | Windows 실제 RPC type이 남아 있는지 확인. service log만 있으면 원인 분류를 보장하지 않음 |
| B3 PREVIEW 재시도 | 새 key의 기존 `startRun`으로 같은 Project/Session 재시도, same-key 중복 방지, durable restore 무재실행 | frontend 옛 run ID cache 갱신. durable 실패 History/abandon API는 미구현 |
| B4 Trust·B5 권한 회수 | Trust 전 History/실행 차단, 사용자 grant 후 worker 준비. 실패 즉시 grant401·route404·descriptor REVOKED 확인 | Windows 창 전환/프로세스 종료/role file 정리/Enterprise 정책 영향은 미확정 |

구체적인 오류 코드와 재시도 순서는 [프론트 후속 답변](../archive/preliminary/FRONTEND_LIVE_TEST_RESPONSE_20260928.md)에 있다. 새 dependency/DB migration/protocol 변경, 프론트 직접 수정, 사용자 기존 창/공유 Core의 강제 종료는 없다. 이 연장 구간의 모델 호출은0회다.

## 채택 변경과 측정 범위

| 변경 | Mac 관측 | 유지한 경계 |
| --- | --- | --- |
| Ledger head 조회·Discovery first5·Helper lazy hydration | 합성 100개 이력의 Discovery 전달 전 43.168→3.154ms, 전달 후 11.785→1.602ms | 선택된 최신 head/hash, 우선순위·관련성·provenance, 전체 응답 동등 |
| Project 복원의 최근 Helper history 전용 조회 | 1,000 Concept·20대화, 전달 후 148.543→9.683ms; SQL prepare 109→69 | 최근20/역할별 last5, 현재 revision·Episode/Event 무결성·redaction |
| Helper Context의 최근 closed Episode history 조회 | 1,000 Concept·20대화 146.714→7.548ms; prepare 299→259 | 같은 Task/Concept 관련성·first5 요약, full aggregate/Analyst 정책 |
| Evidence 요청 내 검증 결과 재사용·단일 Concept SQL filter·history reader | 공통 Episode/100개 전체 196.814→12.630ms; 1,000개 중1개 128.435→1.514ms | accepted/proposal 양쪽 membership, rejected-only Concept, 현재 head·가시성·순서·100개 전체 응답 제한 |
| Concept마다 별도 Episode인 Evidence 조회 | 100개 전체 116.076→16.012ms; 1,000개 중1개 117.468→1.442ms | 공통 Episode에만 유리한 조건과 구분, 모든 전체 응답 deep equality |
| Analysis lifecycle의 Episode/Event 전용 조회 | 1,000개: 대화종료 7.494→1.231ms, 재시도 6.834→0.286ms, terminal timeout 6.316→0.220ms, 결과제출 12.761→7.013ms | 다섯 호출만 변경, 실제 Analyst context/Evidence 판정 full aggregate 유지, 정상·오류·재생 응답 및 모든 DB 테이블 동등 |

각 수치는 해당 최적화의 변경 전 동결 Application 또는 해당 옛 호출/메서드만 재구성한 reference와 비교한 **Core 계산 비용**이다. 실제 SQLite와 합성 입력, warm-up 5회, 교대 30회, 같은 입력/clock/id를 사용했다. 표의 p50은 nearest-rank(정렬된 30개 중 15번째)다. HTTP·모델·생성 앱의 총 지연, 일반 P95, Windows 성능 또는 사람 학습 효과로 확대하지 않는다. frozen 비교와 재구성 비교는 별도 기록이며 lifecycle 표는 다섯 호출을 재구성한 reference 기준이다.

09:43 최종 compiled Core에서 재구성 reference와1,000 Concept 조건을 다시 비교했다. 전체 응답 동등성을 유지하면서 restore139.345→9.665ms, 별도 Episode의 단일 Concept Evidence114.954→1.499ms, Analysis 대화종료7.438→1.353ms였다. lifecycle은 정상·오류·재생 응답과 모든 SQLite 테이블도 같았다. 모델0회이고 원본 표를 대체하거나 서로 다른 비교 baseline의 개선율을 합산하지 않는다.

추가로 유지한 변경:

- Mac ESM bridge의 `createRequire` packaging 수정 및 scope guard 시작 검사.
- 고정 Mac Kiro Agent의 MCP catalog 준비 확인. 빈 catalog를 기다리는 한정 경로이며 foreign/malformed/금지 도구는 계속 거절한다.
- 실제 프론트가 보내는 Builder `message: ""` 재개 허용. 필수 string/trim/최대 길이, Task/revision/idempotency와 권한은 유지한다. 임의 사용자 발언이나 Decision 이유를 만들지 않는다.
- JSON/enrichment 실패의 안전한 진단과 `isError: true` 전달. 실패한 Agent 출력을 자동 수정해 Core에 제출하지 않는다.
- 단일 창의 보호 H 요청을 검증된 Project W로 이동시키는 유휴 라우팅 보완. 실행 중 창 이동이나 Windows 별도 H 정책 변경은 없다.
- 기존 4173 서버를 보존할 수 있는 E2E frontend port override.
- Windows portable 빌드의 Node 배포본·license 검증을 산출물 변경 전으로 이동. 지원하지 않는 Mac Node로 실행하면 기존 출력 삭제/새 부분 출력 생성 전에 거절한다. 기존 Windows Node SHA/sidecar license pin과 regular/non-symlink 조건을 유지하며 Mac cross-build 지원을 추가하지 않았다.

## Agent prompt 판정

| 역할 | 최종 유지 버전 | 판정과 남은 제한 |
| --- | --- | --- |
| Discovery | 1.3.5 | phase 분리와 1.3.7/1.3.8은 안정적인 길이·다양성·정확도 개선을 입증하지 못해 기각 |
| Builder | 1.3.10 | pending Decision 1회 조회 후 대기, 일반 런타임 경계·검증 규칙 보완. 실제 완료를 확인했지만 생성 앱 결함과 지연 제한은 남음 |
| Helper | 1.2.0 | 1.2.1은 타입 보장 과장과 개선 근거 부족으로 기각. baseline도 설명 정확도 한계가 있음 |
| Evidence Analyst | 1.0.8 | 출력 구조 신뢰성 개선에 한정해 유지. 의미 품질·지연 개선 완료가 아님 |

Analyst 동일8개 source-first는 원본 3/8 대비 후보 6/8 두 회였다. 별도 collections/requests는 5/8 동률, 새 lifetimes/order/normalization은 4/8 동률이었다. 새 묶음의 schema-valid는 원본 5/8, 후보 8/8이지만 실패 항목도 달라졌다. 직접 반복의 과대평가·인용 변형·선택 의존성·미래 계획/완료 수행 혼동이 남는다. 기존 Core는 잘못된 인용과 DIRECTLY_LED 상승 등을 거절하지만 자연어 의미 오류를 모두 막지 못한다. 순수 정책 대조에서 미래 계획을 APPLICATION으로 분류한 출력은 수락 가능했다. [원문·전체 표본·한정 판정](t19-analyst-prompt-experiments/README.md)을 참조한다.

Builder의 새 streaming 목표는 첫 turn 199.401초, Helper 34.031초, 명시적 빈 메시지 resume 285.308초 뒤 Task COMPLETED였다. 생성 앱 build/typecheck/자체12 tests는 통과했으나 독립 HTTP probe 20개 중 fractional limit 1개는 실패했다. 포트 예약-해제 race, 전체 smoke deadline/종료 대기, 긴 한 줄 메모리 한계도 남는다. 생성 앱을 수동으로 고쳐 Builder 성과로 세지 않았다. 다른 목표/이력의 turn 시간끼리 prompt 개선율을 계산하지 않는다.

08:12 생성 앱 재점검도 HTTP 19/20으로 같았다. 소스가 양의 정수를 요구한다고 설명하지만 0.5를 수락해 0으로 정규화하고 HTTP 200을 반환한다. 별도 8MiB(64KiB×128)의 개행 없는 한 줄은 첫 yield 전 128개 청크를 모두 소비했고, 같은 크기의 개행 있는 청크는 2개 prefetch 뒤 첫 줄을 냈다. 이는 줄 수 limit이 바이트 메모리 상한을 뜻하지 않음을 보이는 작은 기능 반례이지 GB급·peak RSS 측정이 아니다. 현재 생성 src/dist 5파일 SHA를 검사 전후 비교해 불변을 확인했다. 새 모델 호출은 없다.

## 검증 상태

09:35경 시작한 lease 경합 수정 후 전체 검사 `VIBE_E2E_FRONTEND_PORT=4183 pnpm check` exit0(`check-frontend-lease-final-0940.log`; 파일명 시각과 실제 실행 시각은 다를 수 있음):

- unit 130 PASS + 3 SKIP, integration 325 PASS + 8 SKIP.
- eval 41, Campus Drop 3, smoke 6, E2E 12 PASS.
- 별도 panel CJS 161 PASS + 2 SKIP(`panel-handoff-final-0942.log`), panel build PASS(`panel-build-handoff-final-0942.log`). JSON/enrichment·CRLF reference·취소 계측 합계34 PASS는08:36 이후 해당 소스 변경이 없었다.
- 실제 program controller/port + 인증 HTTP/SSE + SQLite consumer PASS(`program-consumer-handoff-final-0942.log`). 기존 수직 흐름 외에4오류코드/같은Project명시적retry/옛port실패run캐시를 검사했다. Agent 경계는 delayed fixture이며 native 모델 실측과 다르다.
- 실패 후 grant401·route404·descriptor REVOKED assertion과 in-memory portable host/runtime 번들 검사는 최신 전체검사에 포함됐다. lifecycle17검사는 별도CJS에 포함된다. worker의 FAILED 이벤트 뒤 session closed로 바뀌어도 Core 실패를 성공으로 표시하지 않는 안내와 대상검사를 추가했다. 제품 코드는 최신 전체검사 이후 바뀌지 않았다.
- 실제 native 합성 DB 16개 Project, 77개 filtered Evidence view, 전체 Snapshot/전체 Evidence가 전후 byte 해시와 deep equality로 같았다. 최종 조회 당시 native run/Analysis도 유휴였다.

08:20–08:35에는 같은 실제 Core에서 15분 읽기 반복 검증을 추가했다. 86회·조회 9,374건 모두 전체 응답이 같았고, 매회 SQLite 50개 테이블의 전체 행/hash와 run 목록도 불변이었다. 시작/종료 global idle, `quick_check: ok`, foreign-key 위반 0이다. RSS 관측은 시작 122,080KiB, 최대/마지막 245,744KiB였으며 이 짧은 고정 데이터 검사를 메모리 누수 부재나 부하 수용량 보장으로 해석하지 않는다. 모델 호출은 0회다.

첫 sandbox 전체 검사의 E2E 12개는 Chromium MachPort 권한 때문에 앱 시작 전에 실패했다. 원본 실패를 보존하고 GUI 실행이 허용된 권한으로 **동일 전체 명령**을 다시 실행해 통과했다. Windows 전용 SKIP을 Windows PASS로 세지 않는다. 전체 검사 이후 수정한 측정 도구는 별도 대상 검증 결과를 아래/실험 일지에 기록한다.

lifecycle 후속 전체 검사는 측정 도구 lint와 기존 개발서버4173 포트 충돌로 각각 한 번 실패했다. 도구만 고치고 지원된4183 테스트 포트로 격리해 전체 명령을 통과했다. 기존 서버를 종료하거나 재사용해서 통과시키지 않았다. 실제 native Core 재시작 전후 16Project/77filtered view SHA `1cd273ee…6984b`가 같고 자동 재실행 없이 유휴다. lifecycle 비교 도구의 첫 bundle 오류 class identity/불완전 fixture 실패도 원본 로그를 보존했다.

후속 Ledger 동률 정렬 회귀2개와 portable preflight8개가 포함됐다. 새 정렬 테스트의 명시적 타입 누락 lint는 수정 후 전체 검사를 재실행했다. Mac의 실제 `build-portable-core.mjs win32-x64` 호출은38ms에 예상한 `NODE_DISTRIBUTION_UNVERIFIED`로 종료되고 target 출력이 계속 없었다. **이는 Windows 빌드 성공이 아니라 안전한 조기 거절 검증**이다. Windows에서는 원래 검증된 Node 배포본과 license로 실제 빌드/실행을 별도로 확인해야 한다.

07:21 이후 측정 도구 보완:

- Windows CRLF checkout에서 비교용 Evidence 메서드 경계를 찾도록 LF/CRLF 지원. 7개 회귀와 실제 소스의 두 줄바꿈 형식에서 동일 esbuild 산출물, 독립 DB 재측정·전체 응답 동등성을 확인했다. 원본 소스의 줄바꿈을 바꾸지 않는다.
- 취소 계측은 첫 해당 시간대 Helper 시작 뒤에 나타난 순서 있는 native 종료/재사용 로그만 인정하고, 재요청 뒤 정상 Analyst endpoint를 Helper와 분리한다. 대상9검사와 07:27 실제 재실행 모두 PASS다. 아래처럼 Core/native/저장/후속 Analyst를 별도로 확인했다.

## 취소·복원: UI와 native 종료는 구분

실제 program/native Helper 취소 두 건의 Core ACK는 5.834/3.838ms, native 소유 terminal 관측은 527.215/527.948ms였다. 취소 답변은 저장하지 않았고, 뒤의 새 Helper는 42.458/38.503초에 성공하며 같은 pair를 재사용했다. Core CANCELLED만으로 이미 실행 중인 native 파일/shell 단계가 즉시 끝났다고 표현하지 않는다.

즉시 재요청 표본에서는 새 run이 이전 native terminal 170ms 전에 Core에 수락되고, 모델 실행은 terminal 뒤에 시작됐다. 당시 harness는 정상 후속 Analyst가 끝나기 전에 idle을 검사해 FAILED였다. 원본을 보존하고 후속 read-only 감사에서 자기 Episode Analyst 성공·proposal0·전역 idle을 따로 확인했다. 새로운 harness의 성공 여부를 이전 실패 파일에 덮어쓰지 않는다. Worker 단위 회귀도 Core CANCELLED 후 owned prompt terminal이 늦는 동안 다음 claim을 하지 않음을 확인했다. 모든 race나 Windows의 보조 창 종료를 검증했다고 확대하지 않는다.

07:27 새 재실행 `native-helper-cancel-queue-final-0730.json`은 전체 PASS다. Core ACK 4.053ms, native 종료 관측 36.766ms(각각 취소 요청 시점부터)였다. 새 요청 생성 `22:27:36.623Z` → 이전 native terminal `36.630Z` → 새 native 시작 `37.342Z`로 7ms의 실제 겹침을 관측했다. 회복 Helper 1개만 저장되고 자기 Episode Analyst도 SUCCEEDED 후 전역 idle을 확인했다. 취소 checkpoint의 Project/Task/Context/Decision/완료 보고/대화/Evidence/Analysis는 그대로였으며, context-read personalization trace 증가는 이해 근거로 세지 않았다. 실제 Helper endpoint 2개와 후속 Analyst 1개는 같은 window7이었다. 이는 유휴에서 시작한 격리 worker 로그 순서의 증거이지 run ID에 결합된 typed native ACK나 모든 race의 증명은 아니다.

## 제출 전 Windows 재평가 순서

먼저 **최종 Mac 변경과 같은 소스**를 Windows로 전달해야 한다. 현재 미커밋이므로 Git 전달 방식/commit·push는 사용자 승인 후 별도 수행한다. `git diff`만 복사하면 새 helper·test·평가 fixture 같은 미추적 파일이 빠지므로 필요한 신규 파일도 검토해 포함해야 한다. 기존 사용자의 변경을 포함한 작업 트리를 무작정 덮어쓰지 않는다.

1. Windows x64에서 Node 24.19.0/pnpm 11.12.0 preflight를 통과한다. 새 checkout 설치는 `pnpm install --frozen-lockfile`. 설치된 Kiro 1.1.70 / Agent 1.1.158 / API 1.131.0 및 exact source gate를 확인한다. 버전이 다르면 pin을 우회하지 말고 capability/설치 검증 대상으로 분리한다.
2. `pnpm check`, `pnpm panel:build`, 아래 추가 검사와 actual program consumer를 실행한다. 실패는 원본을 보존한다. stale SDK와 새 portable을 섞지 않는다.
3. 새 로컬 보고서 경로에서 Core 성능 비교를 실행한다. 같은 입력과 전체 응답 동등성을 먼저 보고, 속도는 Windows 자체 전후 값으로 보고한다.
4. Windows portable SQLite·Core 자동 lifecycle·생성 앱 도구 준비·일반 설치를 검증한다. 기존 `scripts/test-portable-core.mjs`, `test-managed-core.mjs`, `test-managed-host.mjs`, `test-project-tools.mjs`와 [W5 결과/절차](T19_W5_KIRO_1170_GENERAL_MODE_RESULTS_20260925.md)를 사용하되 현재 산출물의 새 receipt를 만든다. Mac에서 이 Windows 전용 명령을 통과했다고 표시하지 않는다.
   - B2의 **같은 내용/다른 설치 root**와 기존 host가 계속 쓰는 경우를 확인한다. old owner의 강제 종료/lease 갱신이 없어야 하고 정상 lease 만료 뒤 새 Core의 History와 credential 회전을 확인한다.
   - B1은 민감 원문 없이 실제 RPC type 형태를 확인하고 run/worker 코드와 사용자 안내를 대조한다. B3은 사용량/Trust 원인을 해결한 뒤 같은Project 새key retry와 frontend run 캐시 갱신을 확인한다. quota를 일부러 소진하거나 overage를 켜지 않는다.
5. 실제 프론트에서 Personal Need 있음/없음의 서로 다른 unseen 목표로 Discovery→선택/JIT→Spec 수정/확정→Builder→Decision→Helper→사용자 선택→명시적 빈 메시지 재개→Task COMPLETED/결과 앱을 확인한다. 추천 클릭의 이유를 자동 생성하지 않는다.
6. 긴 Builder와 Helper의 별도 H 창, 취소 후 native 정리 상태, 즉시 새 요청, Project 이동, 창 재로드, Core 재시작과 History 복원을 확인한다. mutation 응답 유실은 자동 재전송하지 않는다. restore만으로 모델이 다시 시작되면 실패다.
7. Evidence 전체/단일 Concept, rejected-only Concept, Analyst 실패 표시, Final Upgrade eligibility를 확인한다. card click·Agent 코드·질문만으로 이해 상태가 오르지 않아야 한다. helper 성공과 Task 완료, schema-valid와 의미 정확도를 구분한다.
8. 생성 앱 자체 test 외에 잘못된 runtime 입력, 경계값, 종료/포트 충돌, 메모리 제한을 독립 확인한다. 이번 fractional limit 실패와 이전 JSON null crash를 재현 입력에 포함하되 해당 문구만 통과시키는 prompt를 만들지 않는다.
9. 마지막으로 실제 Windows 검증 receipt와 새 kit 버전/파일 inventory를 연결해 인계한다. **현재 `frontend:handoff`는 20260927의 Windows 검증 metadata를 재사용하므로 이번 Mac 변경의 새 검증본처럼 바로 실행·배포하지 않는다.** 새 검증 기록과 manifest를 준비한 뒤 kit을 만든다. 프론트 저장소의 직접 수정/push는 이번 작업에 포함되지 않는다.

### 재현 명령

아래 명령은 저장소 root, pinned toolchain, 새 보고서 디렉터리에서 사용한다. `<PROGRAM_CHECKOUT>`은 읽기 전용 참조 프론트 경로다. `NEW_*.json`은 기존 파일을 덮어쓰지 않는 새 경로여야 한다.

```text
pnpm preflight
pnpm typecheck
node --test examples/kiro-panel/test/*.test.cjs
node --test scripts/native-json-envelope.test.mjs scripts/native-discovery-enrichment.test.mjs
node --test scripts/benchmark-reference-source.test.mjs scripts/native-helper-cancel-observation.test.mjs
node scripts/test-program-consumer.mjs <PROGRAM_CHECKOUT>

node scripts/benchmark-core-restore.mjs NEW_RESTORE.json 0,100,1000 --full-helper-reference after-delivery
node scripts/benchmark-core-context.mjs NEW_HELPER.json 0,100,1000 --full-episode-reference 20
node scripts/benchmark-analysis-lifecycle.mjs NEW_LIFECYCLE.json 0,100,1000 --full-lifecycle-reference
node scripts/benchmark-core-context.mjs NEW_EVIDENCE_SHARED.json 0,10,100,1000 --uncached-evidence-reference 0 --evidence-trace
node scripts/benchmark-core-context.mjs NEW_EVIDENCE_SEPARATE.json 0,10,100,1000 --uncached-evidence-reference 0 --evidence-trace one-per-concept
```

비교 reference는 현재 Storage/다른 Application 경로를 그대로 두고 해당 옛 호출/메서드만 재구성한다. 기준 Git object `04117c5`가 없거나 함수 경계가 달라지면 fail-closed한다. 이 명령은 합성 DB만 만들며 모델을 호출하지 않는다. `benchmark-native-*.mjs`는 **실제 유료 호출**이고 1차 실행기의09:00 deadline guard를 유지했으므로 나중 Windows 평가에 그대로 쓰지 않는다. 사용자 연장은10시였지만 이후 모델0회이며 guard를 늘려 새 호출하지 않았다. Windows 평가에는 새로 승인된 시간·예산·실험 scope를 먼저 정해야 한다.

## 기록 위치와 완료 구분

[상세 실험 일지](T19_MAC_PERFORMANCE_20260928.md), [재개 체크포인트](T19_MAC_PERFORMANCE_RESUME_20260928.md), [결정 기록](../DECISIONS.md), [작업 계획](../TASKS.md)에 채택·기각·실패와 각 private artifact 이름을 남겼다. 원본 SQLite·합성 생성 앱·로그·평가 응답은 승인된 임시 실험 root에 보존하며 외부 인계물에 credential/connection descriptor/대화 원문을 포함하지 않는다. 임시 파일 정리는 사용자에게 맡긴다.

08:41 승인된 실험 개발 창만 닫고, 전역 유휴·모든 조회 응답 불변을 다시 확인한 뒤 소유 Core를 정상 종료(exit0)했다. 08:42 재검사에서 active lock이 없고 기존 listener는 연결 거절 상태이며, SQLite 50개 테이블은 soak 때와 같고 무결성 검사도 통과했다. 다른 Kiro 창·기존 개발 서버는 종료하지 않았고 임시 DB·생성 앱·보고서도 삭제하지 않았다.

이번 Mac 개선의 정리와 상위 T19/T19-N·MVP 완료는 다르다. Windows 실제 재평가, Analyst 의미 품질, 사람 학습 효과는 미검증 또는 남은 과제로 계속 표시한다. 다음 실행은 이 인계의 Windows 체크리스트와 새 시간·예산 승인을 기준으로 진행한다.
