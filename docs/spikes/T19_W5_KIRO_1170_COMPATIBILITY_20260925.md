# W5 Kiro 1.1.70 호환성 선검증

> 최신 후보는 0.3.11이다. PowerShell 모듈 상속과 CP949 한글 batch 경로 문제를 보완했다. 프로세스 범위 shell integration 복구 후 원본 native Task COMPLETED·후속 Helper·결과 HTTP·History까지 PASS다. [최신 실측](T19_W5_WINDOWS_PROCESS_SHELL_RESULTS_20260925.md)을 따른다. 일반 1.1.70 지원과 W5 완료는 아직 아니며 아래 ACTIVE·승인 대기는 이전 기록이다.

## 현재 버전 완료 요청 후 추가 검증

- **환경 정정:** 사용자가 현재 PC는 이번 작업에서 Kiro부터 새로 설치한 clean Windows라고 확인했다. 이전 기기의 환경 부재 기록을 적용한 판단과 별도 PC/VM·gate 분리 질문은 철회한다. 이후 임시 검증 도구를 준비한 사실은 초기 상태와 구분해 기록한다. 환경 확보는 전체 제품 흐름 PASS와 구분한다.
- 사용자 “지금 버전으로 w5 완료해”에 따라 기존 12회 이후의 실행은 원본 hash를 연결한 새 receipt로 기록했다. VSIX 0.3.11을 기존 합성 profile에 실제 업데이트했고 동일 Node/pnpm과 durable Task·선택·Helper 보존을 확인했다.
- 13번째 Builder는 원본 `mockFetch.ts`의 비어 있지 않은 배열 타입/fallback, test 파일 glob, `smoke.ts`의 child close 대기와 자연 종료를 직접 수정했다. 수정된 원본의 **변경 없는 복사본**은 보호 launcher로 lock/frozen install, build, typecheck, 17 tests, smoke를 모두 exit 0으로 통과했다. 결과 감독기도 HTTP 200(1,188 bytes)과 정상 종료를 확인했다. 이것은 모델이 실제 수정한 코드의 독립 검증이며 원본 Task 완료를 대체하지 않는다.
- 원본 native shell은 허용된 명령에도 command echo만 반환하고 종료값을 알 수 없어 모델에 exit -1로 전달했다. 첫 lockfile의 실제 생성 시각은 이 실행 안에 있으므로 “실행 자체가 전혀 없었다”는 Agent 설명을 사실로 확정하지 않는다. Core는 임의 probe와 launcher 밖 실행을 계속 거절했다.
- [Kiro 공식 Windows shell 문서](https://kiro.dev/docs/ide/chat/terminal/)와 exact 설치 source의 기본 terminal profile 선택을 확인했다. 합성 profile에만 `/d` Command Prompt를 설정해 14번째 Builder를 비교했으나 동일한 출력/종료값 누락으로 Task ACTIVE가 유지됐다. 일반 사용자 profile과 OS 설정은 바꾸지 않았다. 추가 모델 호출 전에 모델 0회 터미널 관측 검사를 진행한다.
- **실제 실행 중 취소 PASS:** 설치된 0.3.11 SDK로 별도 합성 Discovery를 만들고 실제 TEXT 후 취소했다. cancel 응답 9ms, terminal CANCELLED/NONE, Task 미생성, History 조회에 따른 새 run 없음. cancel 응답 시간은 전체 native 종료 지연 측정과 구분한다.
- **현재 패키지 회귀 PASS:** 0.3.11 packaged lifecycle 8개, portable 11개. Core 기동 관측 753–897ms(Kiro/기존 Node/관리 Node), 정확한 package resource·ACL·cache 손상·취소·재시작 검증. private 관리 Node 획득 검사는 92,825,416 bytes를 새 합성 cache에 받았으며 전역 설치는 없다. 전체 제품 `pnpm check`와 CJS 결과는 같은 0.3.11의 기존 통과 결과이며 제품 코드 변경 없이 불필요하게 재실행하지 않았다.
- 일반 1.1.70 모드의 Cloud 증거 제약은 유지한다. exact source를 추가 조사한 결과, 빈 replica에서 `notEnabled`가 반환될 때 상태 파일도 갱신하지 않으므로 오래된 cache나 파일 부재를 새 양성 증거로 바꿀 수 없다. debug 의존을 제거한 일반 지원 성공으로 표시하지 않는다.
- **터미널 진단 결과:** 지정 PowerShell과 Kiro 기본 profile 모두 30초 동안 shell integration API가 준비되지 않았다. Kiro의 실제 PowerShell 시작 명령은 제공 스크립트 dot-source를 `try/catch {}`로 감쌌다. 같은 기본 Windows PowerShell의 모델 0회 로드 검사는 `Restricted`, `FullLanguage`, `PSSecurityException/UnauthorizedAccess`를 반환했다. [읽기 전용 재현 스크립트](../../scripts/probe-windows-shell.mjs)를 추가했다. 일반 [VS Code 문서](https://code.visualstudio.com/docs/terminal/shell-integration)도 Windows integration에 PowerShell 스크립트 실행 권한이 필요하다고 명시한다. 코드페이지 비교 명령은 integration 준비 전 실패했으므로 비교 성공으로 기록하지 않는다.
- **응답 대기·정리:** 영구 정책을 유지한 채 검증 terminal process에만 RemoteSigned를 적용할지 질문했으며 아직 답변이 없어 적용하지 않았다. 별도 clean Windows 검증 분리 질문은 현재 PC의 초기 상태 확인에 따라 철회했다. 검증 창·대기용 test process·추가 진단 driver를 종료/제거했고, 합성 profile에 이번에 만든 terminal 설정도 원래 부재 상태로 복원했다. 원본 receipt·Task·생성 앱과 검증 자료는 보존했다. 최종 format/lint/diff 검사는 PASS이며 lint의 기존 info 14개는 오류가 아니다.

## 창 복구 후 12번째 요청까지의 실측과 당시 판단

- 화면에서 승인 대상이 개발 실행 환경의 `PSReadLine.format.ps1xml`임을 확인했다. Microsoft 서명 Valid이며 launcher 자체에 대한 승인이 아니었다. 자식 process의 `PSModulePath`만 제외하면 Windows 기본 PSReadLine 2.0.0이 실행 정책 Restricted 그대로 import된다. OS 정책·TrustedPublisher·방화벽·사용자 환경 변수는 변경하지 않았다. [Microsoft의 중간 process 상속 설명](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_psmodulepath?view=powershell-7.6)과 일치한다.
- 첫 복구에서 검증자가 `--without-project-tools`를 잘못 지정해 기존 도구와 다른 선택을 유도했다. 11번째 요청은 `FAILED/NONE`, `PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED`로 모델 전 거절됐다. 옵션 조합을 거절하도록 고치고 기존 descriptor의 Node/pnpm을 offline 검사로 대조한 뒤 마지막 12번째 요청을 수행했다. 자동 재전송하지 않았으며 모든 원본 hash/실패 계보를 남겼다.
- 마지막 native Builder는 승인 입력 없이 명령을 수행했으나 `PROJECT_TOOL_FAILED`로 끝났다. Core Task ACTIVE·완료 보고 없음이며 모델 요청 한도는 12/12회다. 원본 code와 상태는 보존했다. 검증용 Kiro/Core는 종료됐고 동일 synthetic root 프로세스 부재를 확인했다.
- **CP949 재현:** 실제 코드페이지 949에서 UTF-8 batch가 한글 descriptor 경로를 MISSING으로 해석했다. Node의 동일 경로 확인과 같은 보호 runner의 직접 실행은 성공해 pnpm까지 도달했다. 0.3.11의 batch/shim은 시스템 chcp를 명시적으로 사용해 코드페이지를 저장하고 UTF-8 실행 후 원래 값과 exit code를 복원한다. 정확한 legacy 내용의 migration과 변조 거절을 유지했다. 실제 한글·공백 경로 CP949 실행 및 exit 7/949 복원, migration/기존 경계 8 tests PASS다.
- **0.3.11 전체 check PASS:** unit 105, integration 298 + 기존 skip 1, eval 35, Campus Drop 3, build, smoke 6, 설치된 Edge E2E 12. 별도 확장 CJS 105/105 PASS. 로그는 Git 제외 `.data/w5-cp949-check.log`, `.data/w5-cp949-cjs.log`에 있다.
- **0.3.11 package PASS:** VSIX 2,322,447 bytes, 설치 7,450,323 bytes, SHA-256 `77a4bdc99b73980a4b2fb2fd69d261ced8ebe24b9170c754e8293ef066ae7092`.
- **생성 앱 원본 복사본, 모델 0회:** 보호 launcher의 lock/frozen install PASS·코드페이지 949 복원. 실제 compile은 `src/mockFetch.ts`의 `FetchedData | undefined` 처리 누락(TS2345)으로 FAIL이다.
- **보완 복사본, 모델 0회:** undefined guard를 추가하면 build/typecheck PASS지만 `node --test dist/`가 디렉터리를 모듈로 실행하려 해 FAIL이었다. 별도 복사본에서 test glob `dist/*.test.js`를 추가 보완한 뒤 build/typecheck/17 tests PASS. 수정 두 곳과 전후 hash를 receipt에 기록하며 원본 Project의 수정·Agent 성공으로 집계하지 않는다.
- **남은 종료 오류:** 생성 smoke는 health/UI/main.js HTTP를 확인한 뒤 Node/libuv `UV_HANDLE_CLOSING` assertion, exit 3221226505로 FAIL이었다. 동일 보완 복사본을 제품 ResultRuntimeSupervisor로 실행한 별도 검사는 HTTP 200·1,188 bytes·감독기 close PASS다. smoke 실패를 성공으로 덮지 않는다.

**판단 권고:** 1.1.70의 진단 모드에서 핵심 연결과 실제 앱 실행 가능성은 확인했지만 일반 지원 제약 해제는 보류한다. debug 증거 의존, 원본 Task의 실제 Builder 수정/완료, 생성 smoke 종료 오류, 후속 Helper·개인화 및 기존 fresh/clean Windows gate가 남았다. 사용자의 판단 뒤 새 한정 native 검증 계획으로 이어간다. 추가 전역 설치나 영구 설정 변경은 하지 않았다.

## 승인 후 보완과 후속 실측

- 기존 source pin을 보존하고 IDE 1.1.70 / Agent 1.1.158의 exact metadata·SHA-256을 검사하는 **명시적 W5 진단 경로**를 추가했다. 일반 실행에서는 여전히 거절한다.
- 새 Agent는 Cloud 설정이 없을 때 기존 세션 tool receipt를 생략한다. 공식 API로 대체하지 못했으며 설치본 소스에서 확인한 `cloudConfig.manifest.notEnabled`와 `cloudConfig.pull.silent`의 양성 증거를 검사한다. `KIRO_LOG_LEVEL=debug`는 검사 자식 process에만 전달한다. 영구 설정·Kiro 소스는 수정하지 않는다.
- 로그에 session ID가 붙지 않으므로 소유 세션의 fresh metadata, 정확한 workspace, 모델 실행 전 상태와 함께 조회 구간 전체를 검사한다. 초기 구현은 직렬 구간만 받았고, 0.3.8에서 workspace 전환 시 Kiro 자체 세션과 Builder의 동시 생성 때문에 차단됐다. 0.3.9는 최대 8개 생성 세션의 모든 silent 반환과 모든 reconciliation의 `notEnabled` 종료가 확인돼야 통과한다. fallback·설정 변경·불완전 로그·선행 모델 요청은 거부한다.
- **실제 Helper 1회 PASS:** 08:18:54–08:19:07 UTC. source/cloud/memory/hook/deny gate 통과 후 canonical Helper prompt 1.2.0과 Core 합성 context를 사용했다. turn 4,237ms, 첫 응답 3,498ms, 32 chunks, 105자 응답과 Core 요약 저장을 확인했다. 모델 자동 재호출은 없다.
- **VSIX 0.3.8 fresh no-Personal-Need:** 실제 preview 10개, JIT 상세화, SHRINK 수정, Spec 생성·수정과 확정·Task 준비가 저장됐다. 명시적 native 요청 6회 중 앞선 Discovery 5회 성공, Builder는 모델 prompt 전 Cloud 검사에서 실패했다. 조회 실패는 0회다.
- **0.3.9 복구:** 원본 terminal FAIL receipt와 hash를 보존하고 동일 durable Project/Task를 검증한 뒤 새 Builder 요청으로 이어간다. 첫 복구 observer는 draft revision 2를 confirmed revision 3과 비교하는 기존 driver 오류로 새 요청 없이 중단됐다. Core의 `confirmed = draft + 1` 계약에 맞춰 driver와 회귀 fixture를 수정했다. 재개 흐름은 fresh 완주로 집계하지 않는다.
- 재사용 Node의 LICENSE 누락은 공식 v24.19.0 LICENSE를 workspace 안에 준비해 해결했다. 선택적 `VIBE_NODE_DISTRIBUTION_LICENSE` 경로는 SHA-256 `148eacf7863ef4329224a29398623077200a27194aa075569faf4a0a85566ca5`가 일치해야 사용할 수 있다. Node 중복 설치나 라이선스 생략은 없다.
- **0.3.9 package PASS:** VSIX 2,321,468 bytes, 설치 7,447,021 bytes, SHA-256 `f827c992a1c4173a947122922902a8cfeb21cd5bdd07375fb925097bcf567df8`.
- 0.3.9에서 Builder Decision, 별도 창 Helper의 응답 저장, Decision 적용과 자동 Analyst 실행을 확인했다. Builder가 쓰기에 Windows 절대 경로를 사용하고 shell에 `description`을 넣어 기존 guard가 거절했다. 원본 미완료 turn을 보존한다. 0.3.10은 진단 profile에서 이 형식만 추가 인식하며 Core의 실제 경로·보호 경로·명령 제한을 그대로 적용한다. `.kiro`로 향하는 junction도 canonical target으로 거절하는 회귀를 추가했다. 관련 22 tests PASS.
- **0.3.10 package PASS:** VSIX 2,321,834 bytes, 설치 7,448,568 bytes, SHA-256 `88ef944621ea24ef1e8ba7723dd84816c3d539467a9f78e5874931b38bf8c6fd`. 0.3.9의 packaged lifecycle 8개도 PASS였다. 해당 검사는 추가 Node 다운로드 없이 실행했다.
- 최초 겹친 Cloud 조회의 실제 저장 로그를 새 검증기로 읽기 전용 재검증한 결과 PASS였다. 모델 호출은 없고 원본 FAIL은 유지한다. 이후 재개에서 실제 Builder/Helper/Analyst gate 통과도 별도로 확인했다.
- 전체 check의 최초 format 실패는 Windows checkout CRLF였으며 기존 `.gitattributes` LF 규칙으로 정상화했다. 다음 integration 실행의 ACL test 3건은 TEMP 8.3 alias, relay test 1건은 비동기 revoke 파일 저장 관측 경쟁이었다. production 권한 gate를 완화하지 않고 fixture의 canonical path와 bounded 관측 대기를 수정했다. 수정된 9 tests 및 driver 11 tests PASS.
- Playwright는 기존 frozen 개발 의존성을 사용한다. `VIBE_E2E_BROWSER_CHANNEL=msedge`로 설치된 Edge 153.0.4234.48의 임시 profile을 사용하며 별도 Chromium을 다운로드하지 않는다. 기본 Chromium 설정은 유지한다.
- **0.3.10 변경 후 최종 `pnpm check` PASS:** format/lint/typecheck/DB 검증, unit 105, integration 296 + 기존 skip 1, Agent eval 35, Campus Drop 3, build, smoke 6, E2E 12. E2E reporter의 project 이름은 `chromium`이지만 실제 channel은 위 Edge다. 확장 CJS 104/104도 별도로 PASS했다. 로그는 Git 제외 `.data/w5-1170-check-final.log`, `.data/w5-1170-cjs-final.log`에 있다.
- **0.3.10 실제 Builder 결과:** 기존 선택·Task를 보존한 continuation에서 TypeScript 상태/전이·화면·서버·테스트·manifest 파일을 실제 작성했다. 쓰기·디렉터리 조회가 allow-once 이후 성공했다. 누적 명시적 native 요청은 10/12회, 조회 실패 0회다. 보호 launcher의 lock 준비 명령도 Core guard는 허용했지만, terminal 출력은 PowerShell의 `[V]/[D]/[R]/[A]` 실행 승인 입력으로 끝났다. lock/frozen install/build/test/smoke의 성공을 관찰하지 못했으며 Task는 ACTIVE, `TASK_COMPLETION_NOT_RECORDED`다. 이것은 자동 승인 리뷰 거절이 아니고 실제 Kiro 터미널 초기화/실행 환경의 문제다.
- **확인된 OS 상태와 남은 진단:** Agent 터미널은 Windows PowerShell 5.1이며 Kiro의 `shellIntegration.ps1`을 dot-source하는 시작 명령을 사용한다. 별도 `-NoProfile -NonInteractive` 조회의 기본 execution policy는 Restricted였다. 실제 승인 대상 파일은 아직 확정하지 않았으며, Agent가 launcher 자체의 문제라고 설명한 것을 사실로 단정하지 않는다. 정책·TrustedPublisher·방화벽은 변경하지 않았다. 화면을 가리는 Node.js 네트워크 허용 알림은 사용자에게 취소로 닫도록 요청했다. 그 뒤 실제 터미널 승인 대상을 확인해야 한다.

일반 모드는 debug 증거가 없으므로 지원 제약을 아직 풀지 않는다. 두 입력의 fresh 수직 완주, 실행 중 취소·재시작·clean Windows·전체 GUI/의미 품질과 상위 완료 gate는 남아 있다. 아래의 모델 0회·미완료 표기는 **보완 전 선검증 시점**을 뜻한다.

[후속 실측 receipt](T19_W5_KIRO_1170_ADAPTATION_RECEIPTS_20260925.json)는 실제 Helper와 각 packaged 시도·복구를 구분하며 경로·대화·인증 정보는 포함하지 않는다.

## 범위와 환경

- Windows x64 build 26200, IDE 1.1.70, Agent 1.1.158, API 1.131.0.
- 설치 commit: `8ce1870416c7dc7e51fffb01765d93ef7ad55102`.
- Agent entry SHA-256: `cf6a5124f2fed75144b9d4236e0ffff85a5b22732d739807070783323c071b87`.
- 제품의 기존 1.1.14/1.1.28 source gate는 유지한다. 후보 진단만 위 exact 설치를 확인한다.
- Kiro 일반 profile·credential을 복사하지 않고 별도 합성 profile/workspace를 사용한다. 사용자 위임에 따라 그 workspace의 Trust만 UI로 처리한다.
- 최초 진단은 모델 호출 0회. 기존 Core/SQLite/MCP와 native metadata/권한·catalog/cloud/memory attestation을 분리해 판정한다.

## 환경 준비 관측

- 기존 Node 24.19.0 재사용, pnpm 11.12.0 공식 tarball의 결정 기록 SHA-512 일치 확인.
- pnpm 및 캐시는 `.data/w5-tools/`, 의존성은 `node_modules/`와 `.pnpm-store/`에 준비했다. 전역 설치/영구 PATH 변경 없음.
- `pnpm install --frozen-lockfile`, `pnpm preflight`, package 명령의 TypeScript build 통과. 실행된 dependency lifecycle은 기존 allowlist의 esbuild뿐이다.
- 최초 package 실행은 sandbox 폴더 접근 오류. 권한 승인 후 재실행은 재사용 Node 배포물 옆의 `LICENSE` 부재로 실패했다. 제품 호환성 실패와 구분하며 Node 중복 설치·라이선스 생략으로 우회하지 않았다.
- Playwright 라이브러리는 frozen 개발 의존성에 포함됐다. 별도 Chromium 다운로드와 E2E/전체 `pnpm check`는 아직 실행하지 않았다.
- private 경로/로그는 `.data/`에 보존하고 공개 가능한 metadata만 이 문서에 남긴다.

## 검증 순서

1. exact 후보 설치 metadata와 source hash를 읽기 전용으로 확인한다.
2. host Node의 실제 child 실행·SQLite transaction/reopen·Core/SDK/MCP를 확인한다.
3. 합성 workspace의 정확히 한 native endpoint, custom role, 권한 explain과 tool catalog를 확인한다.
4. 기존 cloud/memory/hook attestation이 같은 경계로 통과하는지 확인한다. 실패 시 모델 요청 전에 멈추고 원인을 분리한다.
5. 통과한 범위와 필요한 변경을 바탕으로 사용자에게 1.1.70 지원 반영 판단을 요청한다. 전체 수직 흐름·취소·clean Windows 완료와 구분한다.

## 최초 선검증 결과 (보완 전)

[경로·대화·인증 정보를 제외한 receipt](T19_W5_KIRO_1170_COMPATIBILITY_RECEIPT_20260925.json). 모델 호출 **0회**, 제품 지원 제한 변경 없음. 진단은 2026-09-25 07:38:42–07:41:06 UTC이며 Workspace Trust 대기 시간을 포함한다.

| 검사 | 결과 | 의미와 한계 |
| --- | --- | --- |
| 기존 제품 설치본 gate | 예상대로 거절 | `NATIVE_KIRO_INSTALLATION_SOURCE_UNVERIFIED`. 1.1.14/1.1.28 pin을 유지했다. |
| 후보 설치본·host | 확인 | IDE 1.1.70 / Agent 1.1.158의 exact metadata·SHA-256 일치. 실제 Kiro host는 Node 24.18.0, Electron 42.7.0, N-API 10. 개발용 Node 24.19.0 요구와 별도 관측이다. |
| host child·SQLite | PASS | 기존 runtime probe가 실제 Kiro 내장 Node에서 transaction/reopen 및 Core 저장소를 실행했다. |
| Core SDK·MCP bridge | PASS | Discovery 6개, Builder 7개, Helper 1개 도구와 scope mismatch 거절·binding 폐기, 미인증 HTTP 401, shutdown 확인. Kiro Agent의 populated MCP catalog 검증과는 다르다. |
| native RPC·역할 선택 | PASS | 합성 workspace에 속한 endpoint 정확히 1개, protocol 1, 세션 생성·custom mode 선택 성공. |
| tool-less 역할 권한·catalog | 관측 일치 | `fs_read`, `fs_write`, `shell`, `web_search`, `mcp` explain 모두 deny, catalog 빈 배열. 실제 write/shell 실행 검사는 수행하지 않았다. |
| memory·command hooks | PASS | 기존 session memory 비활성 확인 및 hook 경로 부재 검사 통과. |
| cloud 확인 | **FAIL** | `NATIVE_CLOUD_TIMEOUT`. 자체 세션 metadata는 있으나 `messages.jsonl`이 없어 기존 receipt 검증을 통과하지 못했다. |
| 모델·수직 흐름 | 미실행 | 기존 preflight가 중단시켰다. Discovery 이후 모델 동작, Builder/Helper 동시성, 취소, 전체 fresh 완주 여부는 판단할 수 없다. |

## 실패 원인과 영향

기존 `native-cloud-pull-attestation.cjs`는 모델 시작 전 자신의 세션에 남은 `fetch_cloud_config` 완료 기록과 `notEnabled`/`retracted: false` 결과를 요구한다. 메시지 파일이 없으면 재시도 후 15초에 실패한다.

위 SHA-256의 설치된 Agent 소스를 읽기 전용으로 대조했다. `pullCloudConfig`는 cloud service의 `isEnabled()`가 false이면 바로 반환한다. 활성 경로에서도 `L8o`는 `notEnabled`이며 retraction이 없으면 silent를 선택하고, `pullCloudConfig`는 deterministic tool event를 기록하지 않고 반환한다. 즉, 기존 검증기가 필수로 요구하는 기록을 새 버전이 생략하는 경로가 존재한다. 실제 합성 세션을 이후 다시 확인했을 때에도 `session.json`만 있었다.

이는 이번 timeout과 일치하는 소스 근거다. **기록이 없다는 사실만으로 실제 계정의 cloud 설정 비활성이나 안전성을 증명하지는 않는다.** timeout 연장이나 메시지 부재를 성공으로 처리하는 수정으로 해결하면 안 된다. 새 버전에서 소유 세션에 대한 동등한 비활성 증거를 얻는 방법을 먼저 입증해야 한다.

따라서 현재 판정은 **Core 기반은 동작하지만 native adapter의 버전별 검증 보완이 필요함**이다. 단순 버전 숫자 변경만으로 1.1.70을 지원할 수 있다는 판정은 아니다. 실제 Agent turn을 진행하지 않았으므로 추가 차이의 규모도 아직 확정하지 못했다.

## 현재 기기의 코드 회귀와 빌드

- `pnpm preflight`, `pnpm panel:build`의 TypeScript build와 패널 bundle 생성 PASS.
- `pnpm exec vitest run tests/unit/native-client.test.ts`: **46/46 PASS**. 고정 fixture/contract 검사이며 실제 1.1.70 live 성공을 뜻하지 않는다.
- `node --test <examples/kiro-panel/test/*.test.cjs>`: 최초 **101/102 PASS**, 1건은 빌드 전 `dist/extension.cjs` 부재. `pnpm panel:build` 후 그 `packaged-activation.test.cjs`를 다시 실행해 **1/1 PASS**. 총 102개 각각 PASS를 확인했으며 전체를 한 번 더 실행한 결과로 표기하지 않는다.
- 새 진단 launcher Biome check와 CJS syntax check PASS.
- Windows portable packaging은 재사용 Node 배포물의 `LICENSE` 부재로 미완료다. Kiro 버전 문제와 구분하며, 올바른 라이선스를 포함한 패키징 환경 준비가 필요하다.
- Chromium·E2E·전체 `pnpm check`, 일반 VSIX 설치·fresh 양쪽 수직 흐름은 이번 기기에서 미검증이다.

## 재현과 남는 파일

고정 Node 24.19.0/pnpm 11.12.0으로 frozen install 및 TypeScript build를 먼저 수행한 뒤 `node scripts/probe-windows-compatibility.mjs <Kiro.exe 절대 경로>`를 실행한다. 후보가 자동 업데이트되어 metadata/hash가 달라지면 중단되며 새 후보 확인이 필요하다.

launcher는 `%TEMP%/vibe-w5-compat-*` 아래 private profile·extensions·합성 workspace를 만든다. 새 창의 Trust를 처리하면 기존 runtime probe와 metadata-only probe가 실행된다. `--resume-trust`는 기존 receipt가 Trust 대기인 경우에만 허용하며, 이전 검사 host 종료 확인 후 사용한다. 완료 후 검사 창을 닫고 다음 판단까지 receipt를 보존한다.

위치·PID는 Git 제외 `.data/w5-1170-location.json`, 진단 원본은 `.data/w5-1170-receipt.json`에 있다. 도구/cache·`node_modules`·`.pnpm-store`와 private 임시 profile 외에 Kiro가 사용자 `.kiro/sessions` 및 로그를 만들 수 있다. 전역 도구 설치나 영구 PATH 변경, Chromium 다운로드는 하지 않았다. 무흔적 실행으로 표현하지 않는다.

## 최초 판단 요청과 승인

**권장: 1.1.70 대응 수정과 재검증을 진행하되, 검증 통과 후 지원 범위를 갱신한다.**

1. 기존 pin을 보존하면서 1.1.70/1.1.158의 exact source profile 및 native adapter 분기를 준비한다.
2. 새 cloud 동작에서 동등한 비활성/세션 경계 증거를 얻을 수 있는지 입증하고 회귀 검사를 추가한다. 증명할 수 없으면 지원 보류를 유지한다.
3. 새 Agent의 실제 Core MCP catalog·권한을 확인하고, bounded 모델 실측과 W5의 fresh 수직 흐름·취소·재시작 검증으로 진행한다. 패키징 LICENSE 준비도 해결한다.
4. 실제 통과한 설치본만 지원 대상으로 문서화한다. 이번 결과만으로 W5나 상위 작업을 완료 처리하지 않는다.

이 변경 착수 여부는 사용자가 요청한 판단 지점이었다. 사용자가 “그렇게 보완한 다음 작업 진행”을 승인했으므로 구현·검증을 재개했다. 일반 제품 gate는 검증 완료 전에 넓히지 않는다.
