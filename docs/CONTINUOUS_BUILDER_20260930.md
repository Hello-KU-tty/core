# 완료 후 지속 대화와 도구 제한 표시 — 2026-09-30

사용자는 완료된 MVP에서도 실행·설명·수정 요청을 계속 보내고 Builder와 Helper를 사용할 수 있어야 한다고 명시했다. 또한 `권한이 거부되어 일부 작업을 수행하지 못했어요`가 완료 뒤에도 남는 문제를 보고했다. 새 VSIX 생성·Kiro 재시작 적용·버전 갱신·소스 및 설치본 push를 승인했다. 기존 `@HURDOO` 인증과 `Hello-KU-tty/core`, `Hello-KU-tty/program`의 main 게시 승인을 사용한다.

## 원인과 변경

프론트가 `TASK_COMPLETED`에서 입력과 전송을 비활성화했고, Core도 같은 완료 Task의 재시작을 거절했다. 단순히 버튼을 푸는 것만으로는 해결되지 않았다. 이제 명시적 비어 있지 않은 Builder 요청에서 UI 계약 `UI_PREPARE_FOLLOW_UP_TASK`를 호출해 다음 Task를 준비한다. 현재 완료 Task·revision·완료 보고·workspace를 검증하고 sequence를 증가시킨다. 같은 workspace와 선행 Task 연결을 유지하며 이전 완료 보고는 변경하지 않는다. 멱등 요청은 같은 결과를 반환하고 중복 클릭은 한 실행으로 합친다. History·복구·빈 메시지는 후속 Task를 만들지 않는다. 별도 Evidence 기반 Final Upgrade는 선택 기능으로 유지한다.

Builder는 `previousCompletionReport`를 이전 Agent 작업 맥락으로 받고 현재 사용자 요청을 수행한다. 이 보고를 사용자 이해의 Evidence로 취급하지 않는다. Builder prompt **1.3.12**는 실행·설명·변경 후속 요청과 설명에 불필요한 구현·검증 강요 금지를 명시한다. `builder-v1.3.12-continuous-work.json`의 한국어·영어, Personal Need 유무, RUN/EXPLAIN/CHANGE 규칙을 기계적으로 검사했다. 실제 모델 품질 PASS 판정은 하지 않았다. Helper는 완료 Task에서도 기존 read-only 계약으로 동작한다.

실제 기존 작업의 허용/거부 상태 코드를 확인했을 때 전체 권한 상실은 아니었다. 일부 shell 형식·허용하지 않은 명령·삭제 도구가 거부된 뒤 다른 도구와 검증은 성공했다. 과거 `PERMISSION_DENIED`가 전역 경고로 남는 것이 UI 문제였다. 새 worker는 toolCallId와 원인 코드만 해당 도구 행에 연결한다. 프론트는 `요청 제한`을 실패 수와 구분해 표시하고 완료 후 전역 경고를 없앤다. 원래 도구 상태, 실행되지 않은 사실과 권한 정책을 보존한다. 민감 경로·raw input·세션 원문은 새 이벤트에 넣지 않는다.

0.0.17의 저장된 Node/pnpm 재사용과 잘린 Helper 중복 요약 제거도 포함한다. 해당 변경 기록은 [도구 재사용 검증](FRONTEND_TOOLCHAIN_REUSE_20260929.md)을 참고한다.

## 검증

현재 Windows x64 / Node 24.19.0 / pnpm 11.13.1에서 수행했다.

| 검사 | 결과 |
| --- | --- |
| Core `pnpm check` | PASS: unit 179(+skip 1), integration 411(+skip 1), eval 43, Campus Drop 3, smoke 6, Edge E2E 12, format/lint/typecheck/db/build |
| `node --test examples/kiro-panel/test/*.test.cjs` | 171 PASS; 거부 이벤트의 안전한 원인·도구 상관 관계 포함 |
| 프론트 typecheck / 전체 test / build | 57파일·807테스트 PASS |
| `node scripts/test-program-consumer.mjs ../program` | 실제 provider/controller + 인증 HTTP/SSE + SQLite 회귀 PASS |
| `node scripts/test-builder-follow-up.mjs ../program` | 완료 뒤 Builder 3회·Helper 3회, 중복 전송 1회 실행, 이전 보고·소스 보존, 패널 복구 무변경 PASS |
| 최종 packaged project-tools | 기존 Node/pnpm와 관리 Node/pnpm 모두 PATH 없는 새 프로세스 재사용, 실제 frozen install/build/test/smoke/HTTP 앱 PASS |
| 실패 경계 | offline, hash mismatch, network failure, cancellation, launcher 변조, descriptor hardlink 거부 PASS |
| 새 kit 적용 | 2026.09.30.1, 관리 파일 118개 hash PASS |
| VSIX / 설치 파일 | 패키지 71개 파일; 설치된 프론트 번들 2개와 portable 64개 hash 일치 |
| 실제 Kiro 재시작 | 모든 창 정상 종료 → CLI 0.0.18 설치 → 동일 프로젝트 재개; 연결 정상, 완료 보고 유지, Builder·Helper 입력/전송 활성, 기존 권한 경고 없음 |

프론트 명령은 설치된 `node_modules/typescript/bin/tsc -p ./ --noEmit`, `node_modules/vitest/vitest.mjs run`, `esbuild.mjs`를 Node로 실행했다. 이 환경에 npm shim이 없어 package scripts와 같은 엔트리를 사용했다. 도구 재사용 검사는 `node scripts/test-project-tools.mjs <pnpm 11.13.1 pnpm.cjs 절대 경로>`다. 상대 경로를 넘긴 첫 시도는 기존 도구로 인정되지 않아 fixture 기대값에서 실패했으며 절대 경로로 재현한 두 경우가 모두 PASS다.

기존 lint warning·Vite 설정 안내는 남아 있다. 생성 SQL의 CRLF와 Node LICENSE 공백은 `git diff --ignore-space-at-eol`로 실질 변화가 없음을 확인하고 배포 manifest hash와 일치하는 원본 바이트를 보존했다. 설치기가 `package.json`에 넣는 `__metadata` 외 manifest 의미는 소스와 동일하다.

## 산출물과 한계

- [Windows 0.0.18 VSIX](../releases/windows/0.0.18/builder-helper-agent-panel-0.0.18-win32-x64-74208fffa5c0.vsix?raw=true): 2,573,191 bytes, SHA-256 `8da34ce191799cbae5e19d11ed41e3148cd52bec7d174d3196dc192047aa5211`.
- [패키지 receipt](../releases/windows/0.0.18/program-vsix-receipt.json), [kit 생성 시점 검증](spikes/T19_FRONTEND_HANDOFF_UPDATE_20260930_1.json). kit 생성 시점의 프론트 전체 검증 대기 상태는 위 최종 결과로 해소됐다.
- 로컬 생성 receipt: `dist/frontend-consumer-receipt.json`, `dist/builder-follow-up-receipt.json`, `dist/project-tools-receipt.json`. 개인 데이터나 설치 프로필을 저장소에 추가하지 않았다.
- 자동화 Agent는 합성 fixture이며 모델 호출 0회다. 설치 후 UI·파일 검증은 완료했지만 0.0.18의 실제 native 모델 전체 수직 흐름과 다른 PC는 검증하지 않았다. 권한 제한을 모두 제거하거나 모든 모델·도구 실패가 없어졌다고 주장하지 않는다.

## 게시 결과

Core 소스·VSIX·다운로드 문서는 [`8ce42db`](https://github.com/Hello-KU-tty/core/commit/8ce42db58f4bda761d29d9315d31d907b427c05d), 프론트 0.0.18은 [`a61d408`](https://github.com/Hello-KU-tty/program/commit/a61d408b8ad19ed4baf3ead72701821885b3b768)로 각 기존 main에 push했다. 작업 중 추가된 upstream README의 Hello Vibe 이름과 15초 소개 영상 커밋을 먼저 통합했다. GitHub에서 실제 VSIX를 다시 내려받아 위 SHA-256과 일치함을 확인했고 원격 다운로드 가이드의 새 링크도 확인했다. T19-F17의 소스 수정도 이 게시에 포함됐다.
