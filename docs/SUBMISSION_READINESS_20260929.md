# 제출 전 작업 결과 — 2026-09-29

> **역사 기록:** 아래 상태·승인·미완료 항목은 9월29일 당시 기록이다. 현재 사용자 인터뷰·제출 화면·게시본과 새 로컬 후보는 [9월30일 상태](VALIDATION_STATUS_20260930.md)를 따른다. 아래 `dist/` 산출물은 공개 저장소에 없는 과거 로컬 파일이므로 다운로드 링크가 아니다. 현재 파일은 [다운로드 가이드](DOWNLOAD_GUIDE.md)에서 선택하고 해당 파일의 receipt와 hash를 대조한다.

**후속 실측 예정:** 사용자 요청에 따라 **이쪽(core 작업 환경)에서 현재 제출 후보 확장을 Kiro에 적용하고 프론트 실측을 진행할 예정**이다. 사용자가 직접 입력·사용할 창도 준비한다. 확장 설치와 실측 대상 Workspace Trust는 승인되었으며, 양쪽 변경은 `hurdoo` 계정으로 `Hello-KU-tty`의 기존 원격 저장소에 commit/push한다. 아래 자동 검증 기록과 이후 실제 관측은 구분한다.

**실측 준비 후속:**0.0.10 재조립·설치, 제품 workspace Trust, 실제 PREVIEW1회/10후보(32.812초), Kiro 재시작·History 복원과 저장 hash 불변을 확인했다. 직접 입력 가능한 창을 열어 두었다. 최신 사용량836.18/2000, Overages Disabled. core 소스 commit `bc8570b` push 완료, program `deef685`는 HURDOO의 Write 권한 대기다. 현재 설치 VSIX와 정확한 관측 범위는 [실측 준비 기록](FRONTEND_LIVE_READY_20260929.md)을 기준으로 한다. 아래 내용은 그 이전 자동 검증 시점이다.

**판정: 자동 검증·설치 후보 준비 완료, 최종 제출 gate는 열려 있음.** 최신 프론트 인계 `program@82f55ff`의 `NEXT_STEPS_20260929.md`를 기준으로 실제 Windows checkout에서 작업했다. 9월 28일 Mac 결과는 당시 실측으로 보존한다.

## 이번에 처리한 항목

| 항목 | 결과 |
| --- | --- |
| 미반영 `e3532b7` | 현재 backend `8265e9d`에 이미 포함됨. 새 kit에 반영 |
| 외부 pnpm 교체 | JS/CMD/EXE 선택의 공용 shim·launcher·descriptor 업그레이드 및 중단 후 재시도 회귀. 같은 제품 상위 버전/같은 Node/정확한 파일만 허용 |
| kit 생성 자동화 | 실제 관리 파일 hash로 적용 receipt 또는 이전 manifest 대조. 옛 checkout만 고정 baseline 검색. 버전 인자/자동 증가·적용 receipt 지원 |
| 20260929 기준 복원 | 원래 outer manifest는 이 PC에 없음. 깨끗한 프론트 HEAD의 추적 파일 118개와 portable manifest가 전부 일치하는지 확인해 별도 출처로 기록 |
| 프론트 반영 | 실제 `program`에 새 kit과 기능 수정 적용. 관리 파일 118개 hash 일치 |
| 이전 후보 보기 | Spec에서 돌아가도 Session/Spec/candidate/input 보존. 기존 Spec 재열기는 모델0. 명시적 새 후보 요청만 같은 Project에 새 Session과 preview1회 생성 |
| 제품 버전 | package.json 및 오래된 package-lock root 버전을 함께 0.0.10으로 맞춤. Node pin 유지 |
| 설치물 | Windows VSIX 0.0.10 생성, archive 내부 파일 검증, Kiro1.1.70 CLI 설치·설치 목록 확인 |

현재 Kiro 기본 profile의 설치 전 확장 목록은 비어 있었다. 따라서 **0.0.9→0.0.10 실사용 업그레이드 PASS가 아니다.** 기존 사용자 데이터·전역 Node·로그인·Trust·과금 설정은 변경하지 않았다. commit/push/공개/외부 제출도 수행하지 않았다.

## 검증 근거

- Node **24.19.0**, pnpm **11.13.1**, PowerShell. 공식 pnpm archive의 고정 SHA-512 검사 후 작업 폴더에서만 사용했다. frozen install과 기존 lifecycle 정책을 유지했다.
- backend `pnpm check` 전체 exit0: unit **178 PASS+1 SKIP**, integration **391 PASS+1 SKIP**, eval **42**, Campus Drop **3**, smoke **6**, E2E **12**. lint의 기존 경고/정보는 남으며 오류0이다.
- 확장/native CJS **169 PASS**, 새 kit 선택·업데이트 프로세스와 pnpm 교체 회귀 포함. 기계적 회귀를 실제 native 모델 품질로 계산하지 않는다.
- 실제 frontend: `npm ci --ignore-scripts`, typecheck, **56 files / 753 tests**, build PASS. 설치 시 npm audit **0**. 검증 사본과 실제 checkout 양쪽 통과.
- 실제 provider/controller/port→인증 HTTP/SSE→SQLite 소비 PASS. Agent 경계는 지연된 deterministic fixture이며 모델 호출 **0**. 저장 후보 복귀·Spec 재열기에서 durable 상태 불변, 명시적 재생성에서 Session 변경과 preview1회 확인.
- Spec 복귀 실패/입력 수정/중복 클릭/화면 이탈 후 늦은 응답, 현재 Spec 재열기와 renderer 버튼 연결 회귀 PASS. 선택 완료된 다른 후보를 기존 Session에 다시 선택하지 않으며 새 후보 요청으로 진행한다.
- 소스 ZIP의 별도 압축 해제본에서 lockfile 설치, backend 전체 check, frontend753/typecheck/build, panel build→native169+source selector6, 실제 consumer를 재실행해 PASS. 검증 후 소스781개 hash가 동일하다. 같은 PC의 OS·도구·package store를 사용한 결과이며 새 PC/오프라인 재현은 아니다. [명령과 재현 범위](SOURCE_REPRODUCIBILITY_20260929.md).

초기 실패도 보존했다. sandbox가 registry·Windows 사용자/상위 폴더 조회를 막아 허용된 실행 환경에서 재검증했다. 파일 symlink 생성 권한 부재는 실제 Windows junction의 생산 코드 거절 검사로 대체했다. 내용이 같은 Helper prompt의 CRLF checkout을 저장소 규칙 LF로 맞춰 고정 hash를 복원했다. Playwright Chromium 미설치는 지원된 기존 Edge 채널/임시 profile로 해결했다. 사용자 브라우저 프로필은 사용하지 않았다.

최종 소스 diff 검사는 통과했다. frontend 전체 `git diff --check`는 kit이 그대로 복사한 SQL의 CRLF와 배포본 Node 라이선스의 공백을 보고한다. 이 파일들의 내용과 kit hash를 수동 변경하지 않았다. 검증 사본의 중첩 `biome.json`이 원본 포맷 검사를 막는 문제는 사본을 저장소 밖 전용 임시 폴더로 옮겨 해결했고781개 source hash를 다시 확인했다.

## 로컬 검토 후보

| 파일 | SHA-256 |
| --- | --- |
| 당시 `dist/frontend-handoff-20260929-2.zip` | `4fee043ea0470623e986f374fb247e27611197a2c47a3ac94cee28b1d3658be1` |
| 당시 `dist/submission-20260929/builder-helper-agent-panel-0.0.10-win32-x64-272221b7adbf.vsix` | `cbe71c2afe0f99fd25ca5e9d96e77e3cdc4486e12262ba52465a7d4b0ccbe6ce` |
| 당시 `dist/submission-20260929/vibe-helper-source-20260929.zip` | `26b9261887fc41f180e9177ceba968d71ba65f40527649781c43a3fc685a512b` |

kit **125 files / 5,061,731 bytes**, VSIX **71 files / 2,560,126 bytes**, source ZIP **783 files / 2,427,105 bytes**. kit manifest는 `backendHead=8265e9d...`, `backendWorkingTreeDirty=true`를 명시한다. 미커밋 수정이 있으므로 HEAD만으로 재현된다고 주장하지 않는다. source781개의 파일별 hash manifest를 동봉했으며 ZIP·VSIX·소스는 모두 로컬 검토본이다. ZIP 내부 문서의 동결 후 재현 결과는 외부 receipt에 기록했다. [kit 절차](FRONTEND_HANDOFF.md), [kit 검증 receipt](spikes/T19_FRONTEND_HANDOFF_UPDATE_20260929_2.json), 당시 로컬 `dist/submission-20260929/source-receipt.json`.

## 아직 필요한 작업

1. **실제 모델/업그레이드:** 최신 계정 사용량과 Overages 관측, 검증할 기존 프로젝트 및 정확한 Workspace Trust 확인. 인계의 누적900/신규 중단880 제한은 유지하며 과거 관측으로 새 호출하지 않는다. 기존·신규 Builder, B6 두 창, B7 Helper bridge 단계, B8 실제 shell/완료 거절, B11 한국어, 결과 실행·Decision/추가질문·Evidence/분석 재시도·Final Upgrade·다음 개인화·재시작 History를 후보 설치물에서 확인한다.
2. **B3:** 실패 Discovery의 durable 이유와 abandon 계약은 미구현이다. 지금은 transient run이 Core 재시작 후 없어질 수 있다. 데이터 정리·삭제를 임의 구현하거나 기존 DB를 지워 복구하지 않는다.
3. **사람 근거:** 실제 초보 pilot/동의된 증언·일반 Kiro baseline·검증된 fallback 영상이 없다. SPEC10.2를 임의 완료하지 않는다. 기존 Analyst 의미 오류와 Helper 설명 오류도 한계로 남는다.
4. **제출 요건/최종 고정:** 9월29일 공식 홈페이지를 재확인했으며 공개 일정은 예선8/18~9/29다. 정확한 마감 시각·파일 형식·제출 채널은 확인되지 않았다. 새 참가자 안내와 제출 범위 판단이 필요하다. [공식 안내](https://ku-aws-challenge.framer.ai/)

Discovery 단계 Helper 노출 확대와 frontend Node engine 완화는 이번 수정에 포함하지 않았다. 승인된 exact 개발 pin과 Helper 역할 경계를 유지한다. 공개/업로드·commit/push는 사용자가 범위를 지정한 뒤 진행한다.
