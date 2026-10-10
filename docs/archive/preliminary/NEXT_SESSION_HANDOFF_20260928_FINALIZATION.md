# 최종화 후속 인계 — 2026-09-28 19:10 KST

내부 재개용 문서다. 아래 개발 경로·private artifacts를 그대로 제출물에 포함하지 않는다. 이전 `NEXT_SESSION_HANDOFF_20260928.md`는 그 시점 기록으로 보존했다.

## 완료와 남은 판단

- 사용자: backend와 별도 frontend 직접 수정 승인. 기능/성능/보안/접근성 최소 변경, 디자인/탐색 유지. Windows 전용 검증 제외. 브라우저는 Chrome. 기존 프로필 유지, 정확한 workspaces만 Trust. commit/push/공개 배포/외부 제출은 아직 승인 없음.
- T19-F1~F6 완료. 실제 Mac/frontend/native는 새 Personal Need 없는 프로젝트의 후속 Task까지 완료했다. 기본 앱의 서버/브라우저 제약 불일치를 실제 후속 Builder가 수정했고, 최신 소스17 tests·HTTP smoke·Chrome 필터/정렬 PASS.
- T20은 열린 상태. 현재 bounded 보안/접근성/복구 audit와 code 수정은 끝났으나 모든 일반 설치 OPS·보조공학 조합을 인증하지 않았다. Windows 제외를 제품 Windows PASS로 바꾸지 않는다. T21 이후 전부 완료로 세지 않는다.
- 사람 pilot·동의된 증언/일반 Kiro baseline이 없다. 사용자에게 제한을 명시한 기술 검증본으로 제출 준비를 진행할지 알림형 입력 요청을 보냈으며 아직 답변이 없다. SPEC10.2를 임의 완화하지 않는다. 공식 홈페이지 외 새 참가자 안내도 없으며 마감은 사용자 기준 내일9/29, 정확한 시각/형식/채널은 미확인.
- Analyst1.0.8의 미래 계획/실제 수행 오분류와 Helper의 동률 책 순서 오류는 남는다. 합성 모델 회귀를 사람 학습 효과로 제시하지 않는다. source/schema 정확성과 자연어 의미 정확도를 구분한다.

## 최신 검사

- 최신 수정 source 후보의 독립 압축 해제본에서 backend `pnpm check`19:04~19:05 exit0: unit137+3SKIP, integration365+8SKIP, eval41, Campus3, smoke6, E2E12. 기존 코드의18:22 검사도 보존한다.
- frontend `npm ci --ignore-scripts`/typecheck/55 files·719 tests/build/audit0 exit0. backend frozen install/schema export/audit0도 exit0. 후보 키보드4회귀를 추가했으며 실제 Chrome에서 선택 후 focus 유지/Tab/Enter/입력 보존을 확인했다.
- panel build, native161+2SKIP·개발 host41·receipt3·source 선택기5 =210 PASS+2SKIP, 실제 provider/controller/port→인증 HTTP/SSE→SQLite consumer PASS. consumer 모델은 deterministic fixture이며 PREVIEW16/JIT3/SPEC4/BUILDER2.
- 두 저장소 diff whitespace check PASS. 알려진 token/PEM의 제한된 정적 scan은 backend 합성 redaction fixture2개만 일치, frontend/정제 제출 문서는0. 전체 archive audit는 아니다.
- 의존성은 frontend esbuild0.28.2/Vitest4.1.11, backend의 `@esbuild-kit/core-utils@3.3.2>esbuild`만0.28.2 override. lifecycle 허용 확대 없음. 초기 pnpm purge 요구는 기존 metadata store 경로를 명시해 해결했고 디렉터리를 지우지 않았다.

## 비공개 소스 후보와 후속 판단

- 전달 가능한 기술 검토 후보: `/private/tmp/vibe-helper-source-candidate-ECybyr/vibe-helper-source-candidate.tar.gz`, 별도 `VALIDATION.json`. archive SHA `68b22872cc3d09f74897a988fe7730f1caaa648b6bce2817d90e736e6f543314`, 내부 manifest SHA `857d705a4ba4f281270ea183251640818b94b0633ae5a8aff855654e8f6b23cb`.
- backend577+frontend175=752개 source, metadata2개. `source/`는 고정 사본, `reproduction/`은 압축 해제 후 설치/테스트한 사본이다. 압축 전·해제 후·전체 검사 후 source hash가 일치한다. DB/descriptor/log/admission/개인 설정/Windows kit는 archive에 없다. 정제된 문서 사본2개 외 runtime/test bytes는 그대로다.
- 첫 후보 `/private/tmp/vibe-helper-source-candidate-iLrJmA/`는 prompt2개 누락으로 native2 FAIL이 있었으며 최종 전달 대상이 아니다. 수정 후보는 전체 재검증을 통과했다. 첫 cache/store만 재사용했고 새 node_modules를 설치했다. 파일은 모두 보존한다.
- 최신 공개 가능한 검증 설명은 `docs/SOURCE_REPRODUCIBILITY_20260928.md`다. archive 내부 문서는 검사 전 고정본이므로 재검증 중이라는 그 시점 설명이 남으며 외부 VALIDATION receipt가 결과를 갱신한다. 이후 source를 바꾸고 같은 hash 결과를 재사용하지 않는다.
- 19:06 공식 홈페이지를 Chrome으로 재확인했다. 새 파일 형식/채널/정확한 마감 시각은 없었고 본선 FAQ는 새 입력의 live 동작도 요구한다. 저장 결과/영상이 이 요구를 대체하지 않는다.
- 기술 소스까지 준비된 상태로 사용자에게 알림형 범위 결정 질문을 새로 보냈다. 사람 pilot·일반 Kiro baseline 부재, Analyst 의미 오류·일반 Mac 설치 미검증을 명시하고 제한 제출용 범위를 확정할지 물었다. 외부 제출/공개는 별도 승인이다. 아직 답이 없으면 기존 SPEC/goal을 임의로 완료하지 않는다. 이번 goal turn은 실제 코드·검증·artifact 진척이 있었으므로 연속 blocked turn으로 세지 않는다.

## 실행 중인 검증 환경

- backend cwd: `/Users/hurdoo/coding/projects/vibe-helper/.local-experiments/kiro-native-recovery`
- frontend: `/Users/hurdoo/coding/projects/vibe-helper-frontend`
- 실제 개발 stage: `.data/frontend-macos/program-HfYWrp`
- Core root: `/private/tmp/vibe-helper-macos-core-NUiLzPJr`
- 최신 전용 Core exec session47364, port49746, instance`2ad1ce53-9cc5-4c41-9bd3-884260f2f039`. 내부 descriptor의 token은 출력하지 않는다. 재시작 시 모든 run/analysis idle을 확인하고 같은 root/DB를 보존한다.
- Core는 `VIBE_NATIVE_SINGLE_WINDOW_BUILTIN_H=1`과 pinned Node24.19.0으로 기동했다. 새 프로필/로그인/global setting 변경 없음. Trust는 이 root의 `workspaces`만 승인됐으며 `/private/tmp` 전체는 아니다.
- Chrome 결과 앱: `http://127.0.0.1:50223/`(Core 재시작 시 변경 가능). 안 읽음3/평점순, console 오류0. 해당 탭을 deliverable로 표시했다.
- 실제 Kiro 개발 창은 `project_b05aeafb-95b5-463b-8375-8e32cccb7770`.19:03 최신719개 테스트 기준 frontend/packaged bridge를 적용해 완료 Task·Helper 대화·WORKER_CONNECTED를 복원했다. Core process는18:25 T20 backend가 실행 중이며 새 홈 경로 계산은 동일 계정의 같은 legacy 경로를 만들므로 active isolated root에는 영향이 없다. 현재 Task COMPLETED, Helper idle, Evidence 이해0/관찰-only7개.
- 이전 `program-8zfaOT`/Core session78921/port55903와 이전 DB/Decision/개발 창은 보존했다. 승인 없이 닫거나 삭제하지 않는다. 사용자 서버4173도 유지했고 E2E만4183으로 실행했다.
- 새 첫화면용 empty Core session6767와 Chrome 고정 transport preview session43776은 검사 후 종료했다. 그 임시 폴더/파일은 삭제하지 않았다. 별도 개발 창은 Kiro가 기존 창을 재사용해 초기 화면 native 검증에 쓰지 않았다.

## 실제 모델 증거

- 프로젝트`project_b05aeafb-95b5-463b-8375-8e32cccb7770`, Spec CONFIRMED revision2. Core Project 상태는 BUILDING이며 전체 Project 완료는 선언하지 않는다.
- 기본 Task`task_7d5390ee-263e-4bc9-8530-1b2afe23ba16` COMPLETED revision3.
- Final Upgrade Task`task_4ea4de53-a400-402f-9d68-8e2d9b8a2cc9` COMPLETED revision3, report`completion_report_4e3392b0-7b7a-41cf-8d75-1d3cc9f47b22`.
- 마지막 Builder`run_79d4d157-55b5-4ec3-b4a5-8f940ff7a624` SUCCEEDED/TURN_ENDED. 재시작 후 transient runs는[]이므로 과거 실행을 사라졌다고 재실행하지 않는다.
- 개인화 trace`personalization_4a46f6a5-7a02-498e-8959-d69e198dd821`, basis5는 관측/Agent 근거다. 분석5건 SUCCEEDED, 인정된 사용자 이해0. 실사용자 성과 아님.
- 최신 소스 fresh 검사본`/private/tmp/vibe-helper-upgrade-check-gRgn33mu`. 원본·복사본 어느 것도 자동 삭제하지 않는다.
- screenshot: Core root의 `chrome-reading-upgrade.png`, `chrome-privacy-keyboard.png`, `chrome-candidate-keyboard.png`. 뒤2개는 실제 renderer + 고정 상태로 모델0임을 이미지에도 표시했다. 이미지 조작 없이 보존한다.

## 비용과 재개 규칙

- 시작815.91→최신835.96, 증가20.05. 계정 상태의 plan/covered 표시 변경은 외부 상태이며 우리가 변경하지 않았다. 승인 상한은 여전히 누적900, 신규 호출 중단선880이다.
-19:03 Kiro status에서835.96/updated just now. 마지막 실제 dashboard 관측은17:25의829.38/overages Disabled. T20 중 새 모델0.
- 기존 private admission의17:25 timestamp는 만료됐다. timestamp를 늘리거나 claim을 삭제하지 않는다. 새 호출 전에 실제 dashboard의 used/overages를 새로 확인한다. 전체 계정의 하드 비용 제한을 구현한 것은 아니다.
- shell은 항상 Node24 pin을 앞에 둔다: `env PATH=/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin ...`. frontend는 npm이며 pnpm을 사용하지 않는다.
- 로컬 수정은 apply_patch. frontend는 현재 sandbox 바깥이므로 필요한 escalation을 요청한다. `/private/tmp` 정리는 하지 않는다. git 기존 미추적 실험을 소유한 변경으로 추정하거나 add-all하지 않는다.

## 다음 순서

1. 사용자 입력/새 제출 안내를 먼저 확인한다. 제한 승인 없이는 제출 기준을 내려서 완료 처리하지 않는다.
2. [제출 초안](../../SUBMISSION.md), [데모·소스 범위](../../SUBMISSION_DEMO_AND_SOURCE.md), [T20 감사](T20_AUDIT_20260928.md), [준비 대조](SUBMISSION_READINESS_20260928.md)를 기준으로 미완료 항목만 처리한다.
3. source allowlist/SHA manifest·독립 재현은 위 private 후보로 완료했다. 형식/범위 확정 후 새 최종본이 필요하면 후보를 새 hash로 다시 고정한다. fallback recording은 없으며 기존 screenshot/저장 결과를 전체 live 시연이나 사람 실험으로 바꾸지 않는다. 전체 작업 트리/개인 DB/descriptor/로그/오래된 Windows binary를 묶지 않는다. 최종 공개/업로드는 승인 뒤에만 한다.
4. 최신 technical source 검사 PASS와 bounded 실제 Mac 성공은 보존하되 Windows 제품화·모든 의미 품질/사람 평가 완료로 확대하지 않는다.
