# 실제 프론트 기능 복구와 Mac 검증 — 2026-09-28

이 문서는 이번 세션의 결과다. 최종 제출 완료나 Windows 새 패키지 검증을 뜻하지 않는다. 최신 결과는 아래19:06 갱신, [T20 감사](T20_AUDIT_20260928.md)와 [독립 소스 재현](SOURCE_REPRODUCIBILITY_20260928.md)을 따른다. 실제 Mac 수직 흐름은 후속 Task까지 완료했고, 제출에는 사람 검증·비교와 공식 안내 확인이 남아 있다.

## 범위와 기준

- backend `5af5eb0`, frontend `0858811`에서 시작했다. 별도 frontend checkout은 `/Users/hurdoo/coding/projects/vibe-helper-frontend`다.
- 사용자가 양쪽 직접 수정을 승인했다. 프론트 디자인·탐색 흐름은 유지하며 기능·성능에 필요한 변경만 한다.
- Windows 전용 검증·kit/VSIX 재조립, commit/push/공개 배포는 수행하지 않았다. 기존 미추적 실험과 사용자 서버를 보존했다.
- 누적 Kiro 상한900, 신규 호출 중단선880, 관측 유효기간15분이다. 15:36 이전은 모델0 검사였고 승인 후에는 아래 native 실측을 진행했다. 최신18:26 Kiro 상태 표시835.96(시작815.91 대비20.05)이며, 마지막 dashboard의 overage Disabled 관측은17:25다. T20은 모델0이며 새 호출은 새 dashboard 관측 없이는 시작하지 않는다.

## 19:06 후속 — 초점 유지와 private source 재현

- 후보 선택 후 DOM 교체로 키보드 초점이 BODY로 사라지는 문제를 실제 Chrome에서 재현하고 수정했다. 표시 내용이 같은 hydration은 DOM을 유지하며 상세화 재생성에서는 동일 Project/session의 활성 후보 버튼만 복원한다. 다듬기 초안/초점을 보존하고 디자인/카드 순서는 바꾸지 않았다.4개 회귀 중 수정 전3 FAIL, 수정 후55 files/719 tests·typecheck·build PASS다.
- OS 홈+동일 고정 하위 경로로 legacy Mac 개인 경로를 제거하고 receipt의 경로 이탈 철자를 거절했다. scope/소유자/권한 검사와 Trust는 유지한다. 실제 새 모델 호출은 없었다.
- backend577+frontend175의 private archive를 새 폴더에 압축 해제해 frozen install, backend 전체(E2E12), frontend719, 추가 Node210+2SKIP, actual consumer, Mac 개발 host 번들을 통과했다. 전후752개 source hash가 일치했다. 첫 후보에서 빠진 평가 archive prompt2개는 원본을 추가해 재검증했으며 실패 후보는 보존했다. 정확한 전달 대상 hash와 제한은 위 독립 소스 보고서를 따른다.
- 기존 Kiro 개발 stage를719 기준으로 rebuild/reload했고 완료 Task/report·Helper2대화·WORKER_CONNECTED가 모델0으로 복원됐다.19:03 계정 표시는835.96으로 유지됐지만 dashboard/overage 관측과 admission은 갱신하지 않았다. 공식 홈페이지도 다시 확인했고 새 제출 파일 형식/채널/마감 시각 안내는 보이지 않았다. 본선 FAQ의 새 입력 live 요구를 저장 결과 시연으로 대신했다고 하지 않는다.
- 소스 후보는 기술 재현 PASS이지 최종 제출 범위 승인이나 일반 제품 설치물은 아니다. 사용자에게 사람 pilot/일반 Kiro 비교 부재와 의미 품질 한계를 명시한 제출용 범위 판단을 알림형 입력 요청으로 보냈다. 답변 전 SPEC10.2와 상위 goal을 완료로 낮추지 않는다.

## 구현한 변경

1. 같은 입력의 실패 PREVIEW는 Project/Session을 유지한다. durable 결과를 먼저 복원하고 active PREVIEW가 있으면 재부착한다. 사용자 새 시도만 새 idempotency key를 사용하며 중복 클릭은 하나로 합친다. 실패·취소·응답 유실을 성공으로 바꾸지 않는다.
2. quota/auth/access/model/rate/service와 generic 오류를 구분하는 고정 안내를 추가했다. provider 원문은 내보내지 않는다. Trust와 미확인 workspace 전환, 이전 Core 소유자 종료 대기를 분리했다. 기존 화면에 필요한 오류 안내만 표시한다.
3. 신규 Discovery의 Core Project ID를 Builder/Helper 및 `bhlr.lastProjectId`에 연결했다. 기존 test처럼 ID를 미리 seed하지 않은 실제 provider consumer에서 원래 실패를 재현한 뒤 수정했다.
4. 재실행과 History 선택 시 기존 Discovery·Spec·Build 화면을 읽기 전용으로 복원한다. Core에 준비된 Task가 있으면 아직 `SPEC_REVIEW` 상태여도 `suggestedSurface=BUILD`를 따른다. 재확정·새 Task·새 모델 호출은 없다.
5. 프로젝트 전환은 기존 스트림 구독만 끊으며 Core 실행을 취소하지 않는다. 늦은 결과가 다른 프로젝트 화면을 덮지 않는다. Builder/Helper 구독을 분리해 Helper가 Builder 중지 대상을 바꾸지 않게 했다. 중복 Builder 클릭과 cancel SSE가 HTTP보다 빠른 순서를 회귀로 검사했다.
6. Flow 웹뷰에는 준비 상태의 projectId/status만 보내며 host-only workspacePath 필드를 제거했다. 닫힌 패널의 타이머·콜백을 무효화한다.
7. 실제 Mac 화면에서 Trust 미승인인데 입력 후 생성 버튼이 활성화되는 문제와, History/상태 갱신 시 미전송 초안이 지워지는 문제를 발견했다. 두 회귀를 FAIL로 재현한 뒤 화면·controller의 unavailable 실행 차단과 초안 보존을 추가했다. History 읽기는 유지한다.
8. Flow 웹뷰의 discriminator만 검사하던 parser를 bounded payload·허용된 필드·참조 revision 검증으로 보완했다. 같은 메시지에 `type`과 `kind`를 섞어 Agent도 실행되는 경로를 provider에서 차단했다. parser32건과 실제 wiring1건의 FAIL을 먼저 재현했으며, actual consumer에서는 잘못된 메시지10종의 Core 요청0과 정상 입력/History의 동작을 함께 확인했다. 도메인 의미·권한 검증은 계속 controller/Core 책임이다.
9. 프로젝트 전환/복귀/패널 폐기에 걸친 Decision·native 답변·workspace/result 열기·Evidence·Final Upgrade 경합24건을 재현했다. 각 await와 최종 웹뷰 응답 전에 같은 바인딩인지 확인해 늦은 후속 동작/화면 갱신을 막았다. 이미 Core가 수락한 동작을 자동 취소하지 않는다. 이전 Evidence·업그레이드 선택·입력 잔존도 FAIL 재현 후 프로젝트가 바뀔 때만 비우며 같은 프로젝트의 상태 갱신은 초안을 보존한다.
10. Mac 개발 host의 분석 재시도는 예산 가드를 지나지 않았고 host별 log counter는 동시6요청을 모두 허용했다. 두 합성 FAIL을 재현한 뒤 분석 재시도도 같은 제한을 적용하고 배타적 claim 생성으로 관측당2회를 공유하게 했다. Trust와 budget은 독립 검사하며 read-only/중지는 유지한다. 프론트에는 실제 quota 초과와 다른 '최신 사용량 관측 필요' 고정 안내를 추가했다. 제품 quota 기능이나 billing hard cap은 아니다.
11. 실제 분석 재시도 버튼의 revision0을 durable 실패 job 조회로 해결하고, 성공 후 다시 읽은 Evidence를 버리지 않고 화면으로 전송한다. 같은 job의 중복 클릭은 단일 mutation이다. 명시적 positive revision은 Core의 stale 검사를 유지하고, 조회 실패/대상 없음/바인딩 변경 시 mutation을 막는다. Evidence 판정/자동 retry 정책은 그대로다.
12. 기존 Core 한도(선택 입력4000자·피드백 대상8개)를 기존 validation/composer 안내에 연결했다. 초과 입력과 합치기 초안은 보존하며 교정 후 다시 제출할 수 있다. 필드나 탐색을 추가하지 않았다.
13. 창 재시작 시 진행 중 Discovery를 host-only hint로 다시 구독하고 완료 후 durable 화면을 갱신한다. Core 조회→SSE→snapshot만 사용하고 모델 호출/이전 intent replay는 없다. Spec 준비 전 버튼과 복원 중 SELECT 로컬 전이를 막으며 초안을 보존한다.
14. 명시적 Evidence 조회 때 Helper의 durable 분석 상태도 새로 읽는다. 오래된 PENDING_ANALYSIS 표시를 갱신하고 추가 await 전후 프로젝트 전환/복귀/폐기를 검사한다. 자동 polling·새 분석은 추가하지 않는다.

## 검증

| 경계 | 결과 | 실제 모델 여부 |
| --- | --- | --- |
| 기존 frontend 기준선 | 50 files / 540 PASS | 없음 |
| PREVIEW 실패 재현 | 수정 전 6 FAIL | 없음 |
| 신규 Project 연결 재현 | 수정 전 persisted Project ID 없음으로 FAIL | 없음 |
| 최종 frontend 고정 설치/typecheck/test/build | 55 files / 715 PASS, npm audit0 | 없음 |
| 실제 frontend provider/controller/port + 인증 HTTP/SSE + SQLite | PASS, PREVIEW16/JIT3/SPEC4/BUILDER2 fixture 호출; 실행 중 창 복원/terminal 자동 갱신 포함 | 지연 deterministic fixture, native 아님 |
| 실제 HTTP 늦은 Evidence 응답 + History 전환 | 이전 Project 응답의 웹뷰 전송0, 새 Agent0 | 없음 |
| 실제 webview bootstrap/client/renderer의 재시도 버튼 + Core | revision0 FAIL 재현 후 durable 조회→단일 mutation→WAITING 표시·버튼 제거 PASS; DOM은 메모리 test harness | 합성 Analysis job, 없음 |
| backend `pnpm check` | unit137 + 3 SKIP, integration365 + 8 SKIP, eval41, Campus3, smoke6, E2E12 PASS; pnpm audit0 | 없음 |
| 기존 Mac source 별도 검사 | 161 PASS + 2 SKIP, panel build PASS | 없음 |
| 개발 host admission/격리 환경 회귀 | 41 PASS, 서로 다른 Node6프로세스에서도2회만 허용; 손상/만료/한도/Trust/재로드/실패/폴더별 환경 검사 | fake Core/native, 없음 |
| 실제 Mac Kiro frontend 웹뷰 | 최신 번들 reload, 제한 모드 안내·History 조회·약300px 폭, 비어 있지 않은 입력에서 생성 버튼 차단·조회 후 초안 보존 확인 | 없음 |
| 실제 Mac native 수직 흐름 | PREVIEW/JIT/SPEC→Decision→기본 Task 완료→Helper/Evidence-aware trace→후속 Task 완료→Chrome 결과 실행, 독립 복사본17 tests/smoke PASS | 실제 native + 합성 사용자 입력, 사람 학습 결과 아님 |

최초 전체 검사에는 기존 사용자 서버의 4173 포트 충돌이 있었다. 이를 종료하지 않고 `VIBE_E2E_FRONTEND_PORT=4183`을 사용했다. 이후 Chromium은 sandbox Mach-port 권한으로 시작 실패했으며, 필요한 실행 권한으로 동일 테스트를 재실행해 12 PASS를 확인했다. 검사 조건·assertion을 완화하지 않았다.

정제 consumer receipt는 `dist/frontend-consumer-receipt.json`에 생성된다. private 검증 자료는 무시되는 `.data/frontend-macos/program-8zfaOT/`에 보존했다. 원본 로그·DB·connection descriptor는 제출물에 포함하지 않는다.

## Mac 개발 검증용 실행부

Windows portable의 Node/SQLite 및 exact source gate를 Mac 지원처럼 수정하지 않았다. `scripts/prepare-program-macos-dev.mjs <frontend-checkout>`은 실제 frontend provider/webview/media와 backend의 기존 attested Mac worker/runtime를 ignored 개발 디렉터리에 빌드한다. frontend 제품 manifest/portable은 그대로다.

검증 pin은 Kiro 1.0.437 / Agent 1.0.794 / API 1.109.5 / arm64 / 외부 Node 24.19.0이다. Windows 제품 pin 1.1.70 / 1.1.158 / 1.131.0과 구별한다.

개발용 host는 credit observation 파일이 없으면 새 UI 모델 요청을 거절한다. fresh observation 하나당 최대 두 요청(JIT+SPEC)을 허용하며 재로드로 카운터가 초기화되지 않는다. 이는 개발 검증 가드이며 계정의 실제 billing hard cap이나 제품 quota 기능이 아니다. 후속 Analyst를 포함한 실행을 관찰하고 단계별 실제 사용량을 다시 확인해야 한다.

F5에서 Analysis 명시적 재시도까지 admission 대상으로 보완했다. private stage의 claim을 배타적으로 만들어 여러 host/process 사이의 슬롯을 공유하며, 예전 log admission도 센다. 실패한 dispatch나 audit 파일 갱신으로 슬롯을 환급하지 않는다. 관측·audit의 손상/과대/비정규 파일·symlink는 fail-closed이고 prompt/entity ID/credential은 기록하지 않는다. `node --test examples/program-macos-dev/test/*.test.cjs`로34개 독립 모델0 회귀를 재현한다. 자세한 운영 경계는 [개발 harness README](../../../examples/program-macos-dev/README.md)에 있다.

### 15:36 이전 모델0 원기록

당시 실제 frontend는 개발 창에서 보였다. Kiro가 backend 폴더의 Workspace Trust를 요구해 사용자에게 **해당 폴더만** 승인 여부를 질문했다. 상위 `.local-experiments` 신뢰, 자동 Trust 설정, 계정/overage 변경은 하지 않았다. 제한 모드를 선택해 비모델 UI 검사를 진행했다.

종료 전 확인에서 별도 개발 Core는 Project0/active run0이다. UI 계정 표시는 reload 후에도815.91로 갱신됐다. credit observation 승인 파일은 만들지 않았으며 신규 유료 요청은 가드로 차단된다. 개발 Core는 loopback에서, 개발 창은 Restricted Mode에서 후속 승인 검증용으로 유지했다. 기존 사용자 서버/창과 데이터는 건드리지 않았다.

12:35경 F3/F4를 포함한 최신 번들을 다시 로드했다. 한글 목표를 붙여 넣고 History 새로고침을 눌러 초안 유지·생성 버튼 disabled·Trust 안내를 재확인했다. Kiro 업데이트는 적용하지 않았으며 usage815.91이 `updated just now`로 표시됐다. 이 관측도 15분을 넘으면 유료 호출 근거로 재사용하지 않는다.

12:50 후속 감사에서 F5 번들을 실제 창에 다시 로드했고 Restricted Mode/Trust 안내와 usage815.91 갱신을 확인했다. 전체 backendcheck(E2E12 포함)와 기존 native161+2SKIP도 다시 PASS였다. Core는 인증된 SDK health/list 조회로 여전히 Project0/active run0, 실제 stage의 credit observation 없음/admission metadata0을 확인했다. 합성 회귀가 만든 임시 metadata와 실제 승인 파일을 혼동하지 않는다.

13:10~13:12 F6 번들을 실제 개발 창에 reload했다.4001자 입력 시 오류 안내, History 조회 후 입력 보존,4000자로 교정 시 안내 제거를 확인했다. 테스트로 작성한 입력만 비웠고 Restricted Mode/Trust 차단은 유지했다. 전체 backendcheck는 E2E12까지 exit0(`backend-check-evidence-refresh.log`)이었다. usage815.91이 새로 갱신됐으며, 인증 SDK 조회에서 Project0/active run0/credit observation 없음/admission metadata0을 다시 확인했다. 실제 모델0이다.

## 15:36 이후 승인 재개 — native 실측 진행 중

사용자가 현재 backend 폴더의 Workspace Trust를 승인하고 진행을 요청했다. 해당 폴더만 Trusted 목록에 추가했으며 Git 확장이 별도로 요구한 상위 `vibe-helper` 저장소 Trust는 허용하지 않았다. 반복 대화상자로 검증용 창을 닫고 `--disable-extension vscode.git`의 공식 비영구 옵션으로 그 창만 다시 열었다. 사용자 다른 창·영구 설정·Kiro 버전은 유지했다. 이 옵션은 현재 Mac 검증 환경의 한계로 기록하며 제품 해결로 주장하지 않는다.

15:41 fresh usage815.91/overage Disabled 확인 후 private 개발 관측을 생성했다. 실제 frontend에 합성 TypeScript 정규화/필터 학습 목표와 공용 장비 점검 Personal Need를 입력했다. 실제 native PREVIEW1회가 SUCCEEDED/DURABLE_RESULT이고 후보10개가 저장됐다. 사용량은15:45에816.1/overage Disabled로 재확인했다. 테스트 입력/클릭은 자동화된 합성 검증이며 실제 학습자 성과가 아니다.

native 준비 중 동일 개발 창이 승인 폴더 아래의 생성 `core/workspaces`로 전환·reload됐다. 완료 뒤에도 프론트는 초기 입력 화면에 남았지만 History의 이어서 보기로 저장된10개 후보가 추가 run 없이 복원됐다. 재시작 중 진행되던 Discovery의 terminal 재조회/화면 갱신 누락을 F2에서 보완한다. 실제 모델 완주·F2 완료는 아직 아니다.

15:47까지 JIT와 SPEC도 SUCCEEDED/DURABLE_RESULT였고 Spec 확정/Task 준비가 실제 frontend에서 연결됐다. 15:49 usage816.33/overage Disabled를 관측했다. Builder는 Task를 ACTIVE로 전이했으나 Decision 도구가 `BRIDGE_ENVELOPE_JSON_INVALID`로3회 실패했다. 15:56 실제 중단 버튼으로 CANCELLED를 확인했으며 완료/학습 증거로 표시하지 않는다. 이후 Helper는 작업이 claim되지 않아 `NATIVE_IDE_WORKER_UNAVAILABLE`로 실패했다. Mac 개발 Core 시작 명령에 기존 승인된 `VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H=1`이 빠져 Windows 별도 H 창 라우팅을 선택한 것이 원인이었다. idle 상태에서 개발 Core에만 기존 protected H 경로를 적용하며 제품 권한/지원 pin/Windows 경로는 바꾸지 않는다.

16:03 프론트695 tests/typecheck PASS. reload 중 Discovery 재부착12건과 Spec 미준비/unavailable/Discovery 진행 중 버튼3건을 FAIL로 재현한 뒤 수정했다. host-only run hint→read-only SSE→durable 재조회만 수행하며 자동 모델 재실행은 없다. 프로젝트 전환/폐기/timeout은 구독만 중단한다. actual provider+HTTP/SSE+SQLite에서 PREVIEW를 지연하고 창을 재생성해 화면 자동 반영과 Agent 추가0을 확인했다(전체 fixture PREVIEW16/JIT3/SPEC4/BUILDER2). native 성공으로 확대하지 않는다.

검사 과정에서 잘못 선택한 pnpm 실행기가 자동 생성한 frontend pnpm-lock.yaml/pnpm-workspace.yaml 두 파일만 제거했고 기존 package-lock.json으로 `npm ci --ignore-scripts` 복원했다. 기존 package/lock은 수정하지 않았다. npm audit의 개발 의존성4건(vitest critical 포함)은 제출 전 별도 점검 항목으로 남겼다. 강제 upgrade나 test UI/server 실행은 하지 않았다.

## 16:19 상태 및 후속 재개 — 기존 프로필 유지·최소 환경 수정

protected H 설정을 적용한 뒤 같은 Helper 질문이 SUCCEEDED/HELPER_RECORDED로 저장됐다. 후속 Analyst는 SUCCEEDED/acceptedCount0이며 설명 요청과 Agent 답변을 사용자 이해 증거로 인정하지 않았다. 실제 Evidence 화면에도 근거 없음 사유를 확인했다. Builder를 같은 Task에서 명시적으로 재개하자 도메인 코드/테스트를 만들고 실제 아키텍처 Decision을 저장한 뒤 pending Resolution을1회만 조회하고 TURN_ENDED로 종료했다. Task는 BLOCKED이고 Completion은 없다. 최초 JSON3회 실패와 후속 재개 성공을 모두 보존한다.

Builder의 셸은 Node26.4.0이었고 pnpm install 출력은 상위 repository의14개 workspace를 대상으로 했다. 생성 앱에는 자체 pnpm-lock.yaml/node_modules가 없으므로 보고된 build/test 성공을 독립 앱 성공으로 인정하지 않는다. backend tracked lock/package 변화는 없지만 이를 OS 수준 무영향 증명으로 확대하지 않는다. 상위 pnpm-workspace.yaml/.npmrc/.pnpmfile을 만나는 기본 native package 명령을 metadata 조회만으로 fail-closed 처리했다.7개 FAIL 재현 후 관련20PASS/2Windows SKIP, frontend699/typecheck/build, actual consumer 및 전체 backendcheck(E2E12)가 통과했다. 기존 Windows 보호 실행기 경로는 변경하지 않았다.

새 Builder 실행은 중단했다. 처음 별도 프로필을 제안했으나 필수라는 근거가 없어 철회했고, 정확한 로그를 넣은 알림형 질문에 사용자가 기존 프로필 유지·최소 환경 수정을 승인했다. 저장소 밖의 전용 Core와 생성 폴더에만 적용하는 Node24 터미널 설정을 우선 모델0으로 검증한다. 새 폴더 Trust는 정확한 경로로 별도 확인하며 재로그인/새 프로필/계정 설정 변경은 하지 않는다. 현재 Core는 재시작 후 Helper1성공/Builder1TURN_ENDED, active run0이고 이전 transient run은 종료 전 결과를 위에 기록했다. 실제 DB/대화/Decision은 보존했다.

16:19 usage820.91/overage Disabled를 확인했다. 마지막 admission 관측은817.77이며2개 슬롯이 이미 소비되어 새 호출에 재사용할 수 없다. 과거 claim 삭제/관측시각 연장은 하지 않는다. 검증 로그는 private stage의 `backend-check-native-boundary.log`에 보존했다.

## 16:40 격리 환경 재개

기존 프로필 유지·최소 수정 및 `/private/tmp/vibe-helper-macos-core-NUiLzPJr/workspaces`만의 Trust 승인을 받았다. root는 새 합성 DB이며 이전 stage의 DB/Decision/창을 삭제하거나 이관하지 않았다. 기존 개발 창 닫기는 자동 검토에서 거절돼 그대로 보존했다. 같은 extensionDevelopmentPath로 새 창을 요청하면 기존 개발 창이 재사용됨을 확인했고, 원래 config를 복원한 뒤 새 stage `program-HfYWrp`를 빌드해 두 창을 분리했다. 일반 사용자 창과 프로필·로그인·전역 설정·shell rc는 바꾸지 않았다.

개발 harness의 isolated Core는 소유자/0700/정규 경로/상위 package 설정/단일 trusted folder를 검증하며, 폴더별 비영구 environment collection으로 PATH를 process creation과 shell integration에 적용한다.7개 환경 검사와 기존34개 budget 검사, stage 재빌드의 외부 Core 경로 보존을 통과했다. 실제 새 Kiro 통합 터미널 화면에서 Node24.19.0/pnpm11.12.0을 확인했다. native Builder 명령에서의 독립 install/build는 아직 후속 실측 대상이며 OS sandbox나 Mac 제품 지원이라고 주장하지 않는다.

16:40 usage820.91/overage Disabled를 재확인하고 새 stage에 새 관측을 기록했다. 과거 claim은 보존했다. 이번에는 Personal Need 없이 TypeScript 객체 배열의 filter/map 조합을 목표로 실제 frontend의 새 PREVIEW를 시작했고10개 후보가 durable 저장됐다. 이는 합성 입력이며 사용자 학습 성과가 아니다.

## 16:42~17:24 독립 앱 완료·Chrome 실행·후속 개인화 준비

- 새 Core의 Personal Need 없는 독서 기록 프로젝트는 PREVIEW10개→선택 JIT→SPEC 확정→Task 준비를 실제 프론트/native로 수행했다. Builder가 데이터 출처 Decision을 저장했고, 합성 UI에서 내장 샘플을 선택한 뒤 명시적으로 재개했다. Task `task_7d5390ee-263e-4bc9-8530-1b2afe23ba16`은 revision3/COMPLETED, completion report는 `completion_report_7f35ac05-cee6-4cf7-864d-ab5e213f084b`다. Run 성공만으로 Task 완료를 추정하지 않았다.
- 첫 Builder `run_b4ba6309-8f3f-484e-b2ab-c4c5c72ec0fa`는 독립 앱 lockfile/node_modules를 생성하고 typecheck/build와 도메인6개 검사를 수행했다. 처음 테스트 경로 실패→script 교정도 stream에 보존했다. 후속 `run_5f1021ab-5e5f-468d-a578-d160b9652f3f`는 Decision 적용 후 웹서버·13 tests·HTTP smoke·result manifest를 만들고 Task를 완료했다. 이전 상위 workspace14개 성공과 구별한다.
- 원본 node_modules의 frozen install이 purge 확인을 요구해 중단했다. 당시 재사용 환경 차이는 관찰했으나 원본 생성 앱의 근본 원인은 확정하지 않았다. 원본을 지우지 않고 source/package/lock/tsconfig/scripts만 새 private 폴더에 복사했다. 이 독립 복사본은 Node24.19.0/pnpm11.12.0에서 frozen install/typecheck/build/13 tests/health+screen+asset smoke가 모두 exit0이다.
- 실제 프론트 결과 실행으로 Core 소유 loopback 서버가 시작됐다. SDK 재조회는 RUNNING/reused=true였다. Safari 화면 제어가 허용되지 않아 설정을 바꾸지 않았으며, 사용자가 Chrome을 지정한 뒤 Chrome에서 같은 앱의 전체8/읽음5/안 읽음3 및 평점 내림차순을 확인했다. 외부 배포나 새 사용자 데이터는 없다.
- 프론트 후속13개 회귀를 추가했다: stream/context revision 갱신 중 Decision/native 초안 보존4개; resolved Decision 중복 제출 차단은 이4개에 포함된다. 완료/Decision 재시작 복원5개와 작업 폴더/결과 실행2개, Final Upgrade 참조 채움/새 Task 갱신2개다. 동일 Task의 완료 report 및 미적용 Decision을 검사하고, 결과 실행은 명시적 버튼으로만 수행한다. 디자인/CSS/탐색 구조와 Core 권한은 유지했다. 새 작업 준비는 새 모델 시작이 아니다.
- 완료 후 Helper `run_1812ef3d-682f-4aa0-9c03-6d3931446923`는 실제 파일의 filter/map과 서버 실행 위치를 설명했다. Evidence-aware trace `personalization_4a46f6a5-7a02-498e-8959-d69e198dd821`에 basis5개가 있어 실제 SDK eligibility를 통과했다. 관측/Agent 근거를 사람의 이해 성과로 바꾸지 않는다.
- **품질 한계:** 최초 완료 앱은 정적 브라우저 TypeScript라는 Spec과 달리 Node 서버에서 배열을 처리한다. Helper가 이 불일치를 드러냈고, 설명 속 평점 동률 두 책의 순서도 실제 Chrome과 다르다. 실제 모델의 정확도를 전체 PASS로 표현하지 않는다. 후속 Task에서 원래 브라우저 실행 제약을 맞추는 검증을 진행한다.
- 17:08 계정 사용량828.81/overage Disabled를 관측했다. 새 호출 전 유효기간과 누적900/중단선880을 계속 확인한다. 계정 plan 표시 변경은 외부 상태이며 우리가 계정·요금제를 변경하지 않았다.

## 17:38~18:27 후속 Task 완료 및 최종 hardening

- Final Upgrade Task `task_4ea4de53-a400-402f-9d68-8e2d9b8a2cc9`가 revision3/COMPLETED가 됐다. 실제 Builder `run_79d4d157-55b5-4ec3-b4a5-8f940ff7a624`는 브라우저 ES module에서 filter→map→sort를 실행하도록 원래 제약을 복구했다. 기존 화면, 샘플과 의존성은 유지했다. Completion report는 `completion_report_4e3392b0-7b7a-41cf-8d75-1d3cc9f47b22`다. Core Project 상태는 BUILDING이며 Project 전체 완료를 만들어 기록하지 않았다.
- 별도 소스 복사본에서 frozen install/typecheck/build/17 tests와 health·HTML·CSS·client/domain module HTTP 검사를 통과했다. 서버 HTML은 빈 표 shell이고 실제 Chrome DOM에는8개 행이 생겼으며, 전체8/읽음5/안 읽음3 및 평점·제목 동률 순서를 확인했다. URL은 필터 적용 전후 `/`이고 console 오류는 없었다. 최신 Core 재시작 후에도 Chrome에서8→안 읽음3/평점순을 확인했다.
- 기존 결과 실행기의 모듈 변경/manifest 미재검증 실패2건을 수정하고8개 회귀를 통과했다. 건강한 서버라도 compiled output/package/lock fingerprint가 바뀌면 소유 child만 교체하며, symlink·과대 파일·부적합 manifest는 거절한다.
- Analyst5건은 SUCCEEDED, 사용자 이해로 인정된 Evidence는0이다. 실제 Evidence UI는7개 개념을 OBSERVED_ONLY로 표시한다. Agent 코드·추천 선택·설명 요청을 사람 이해 성과로 올리지 않았다는 이 시나리오의 결과이며, 기존 미래 계획 의미 오류의 해결 증거는 아니다.
- T20에서 첫 사용 데이터 안내, 한국어 문서 언어, 키보드로 접근 가능한 스트림/도구 출력/저장 대화 label을 추가했다. 기존 CSS·탐색 구조는 유지했다. Chrome 실제 renderer+고정 transport에서 안내·Tab 순서·History 후 초안 유지·console 오류0을 확인했다. 새 빈 Kiro 개발 창 시도는 기존 창을 재사용해 별도 초기 화면 검증에 쓰지 않았고, 사용자 창·프로필·Trust를 바꾸지 않았다.
- 구조화된 입력의 저장 전 redaction, 민감 파일 참조 거절, 원본 요청 hash 기반 idempotency와 조각 경계 TEXT redaction을 보완했다. 초기 긴 credential은 기존 storage guard가 거절했던 것이며 DB 유출을 확인했다고 주장하지 않는다. native/SSE의 한 글자 delta 유출은 합성 FAIL2건으로 재현했다. 경로 뒤 정상 문장을 과도하게 가리는 회귀1건도 고친 뒤 전체 검사를 통과했다.
- frontend 고정 설치/715 tests/build/audit0, backend 고정 설치/schema export/전체 check(integration365/E2E12)/audit0, native161+2SKIP와 개발 환경41, actual consumer가 PASS다. backend install은 기존 metadata의 store 경로를 명시해 node_modules purge 없이 esbuild1개 교체/구 의존성2개 제거로 완료했다. 일반 사용자의 파일이나 임시 검증 폴더는 삭제하지 않았다.
- 모델과 분석이 모두 idle인 상태에서 전용 Core와 실제 개발 번들을 갱신했다. 완료 Task/report·Helper 대화2개·Analyst5건 및 관찰-only Evidence를 읽기 전용으로 복원했다. 초기 전체 응답 hash는 요청별 correlationId까지 포함해 달라졌으므로 byte-identical 복원의 근거로 사용하지 않는다. metadata와 실제 UI 복원 및 자동 저장 회귀로 판단했다.

## 재개 후에도 유지하는 gate

- 기존 backend 폴더와 새 격리 workspaces만 Trust 승인됐고 최신 frontend/backend 변경을 개발 번들에 반영했다. 위 bounded native 흐름은 완료했으나 다른 환경/일반 제품 설치의 성공으로 확대하지 않는다. 과거 expired benchmark의 deadline을 늘려 재사용하지 않는다.
- 기존 frontend `vendor/portable`은 이전 Windows kit다. 새 backend 수정이 포함된 Windows 배포물 검증·교체는 이번 제외 범위이며 Mac source 성공으로 대체하지 않는다.
- T20 범위별 감사 결과는 별도 문서에 남겼으며, 일반 설치 OPS와 전체 assistive-technology 검증까지 완료했다고 주장하지 않는다. T21 전체 MVP, Evidence 의미 품질과 실제 사용자 pilot/일반 Kiro 비교, 공식 제출 형식·fallback recording은 아직 완료 판정하지 않는다. 특히 과거 Analyst의 미래 계획을 실제 수행으로 오인한 한계는 이 프론트 수정으로 해결되지 않았다.
- 실제 참가자 결과나 Windows 검증을 만들어내지 않는다. 외부 확인/승인이 필요한 사항은 사용자와 조율한다.
- 공식 공개 배점과 현재 증거/미확인 제출 형식은 [제출 준비 대조표](SUBMISSION_READINESS_20260928.md)에 분리했다. 참가자 별도 제출 안내를 요청했으며, 제출 시각·분량·채널을 가정하지 않는다.
