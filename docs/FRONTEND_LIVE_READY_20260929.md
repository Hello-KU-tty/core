# 현재 확장 설치와 프론트 실측 준비 — 2026-09-29

**후속 업데이트:** 새 후보 표시 누락을 수정한0.0.11에 이어, 스펙 확정→Builder 시작을 연결한 **0.0.12**를 설치했다. 현재 설치 파일과 실제 Builder 시작은 [후속 기록](FRONTEND_BUILDER_START_FIX_20260929.md)을 따른다. 아래0.0.10은 최초 준비 당시의 기록이다.

**직접 사용 준비 완료.** 이쪽(core 작업 환경)에서 현재 제출 후보를 다시 조립·설치하고, 실제 Discovery와 재시작 History 복원을 확인했다. 사용자 직접 실측은 준비된 Kiro 창에서 이어서 진행할 예정이다.

## 현재 제출 후보

- 제품: `vibe-helper.builder-helper-agent-panel` **0.0.10**, Windows x64.
- backend 소스 commit: `bc8570b3d763a756710db214eacc44921e87be27`.
- frontend 소스 commit: `deef685b39065efae590b89ee76be1e5855f84a5`.
- 적용 kit: **2026.09.29.2**, 관리 파일118개 대조 PASS.
- [현재 VSIX](../dist/submission-live-20260929/builder-helper-agent-panel-0.0.10-win32-x64-272221b7adbf.vsix): 71 files / 2,560,126 bytes.
- SHA-256: `b9afb36290830d1c3babe39f8e7e0496b147eb77d1f4af698d5564984f8b8021`.
- [VSIX receipt](../dist/submission-live-20260929/program-vsix-receipt.json). 이전 후보와 내부 파일 inventory hash는 같고 재압축한 ZIP metadata 때문에 archive SHA는 다르다. 현재 설치·직접 사용 기준은 이 파일이다.

검증된 프론트 소스를 다시 빌드하고 kit hash를 확인한 뒤 조립했다. 실행 중인 동일 버전의 첫 재설치는 Windows 파일 잠금으로 실패했다. 준비용 Kiro 창을 정상 종료하고 재설치해 성공했으며, 설치 목록도0.0.10이다. 폴더나 사용자 DB를 삭제해 복구하지 않았다.

## 실제 관측

| 항목 | 관측 |
| --- | --- |
| Kiro / Agent | 지원 조합1.1.70 / 1.1.158, 기존 로그인 사용 |
| Trust | 사용자 사전 승인에 따라 제품 전용 `core-data/workspaces`만 신뢰. 전역 Trust 비활성화 없음 |
| Core | 설치물 자동 기동, 실제 연결 안내 표시, 로컬 SDK health/History 조회 성공 |
| 사용량 사전 | 계정 대시보드835.96/2000, Overages Disabled(조직 관리) |
| 실제 PREVIEW | 합성 학습 목표 하나를 UI로 제출. 10개 후보 저장, `SUCCEEDED`, 오류 없음 |
| 실행 시간 | Core run 수락02:42:46.671Z → 완료02:43:19.483Z, **32.812초** |
| 재시작 | 준비용 창을 정상 종료·재실행하고 동일 Project/Session/후보가 보존됨 |
| History | 이어서 보기로 동일10개 후보 표시, 재시작 후 새 run0 |
| 저장 상태 | envelope correlation을 제외한 Project/Session/Discovery context/Spec/Task/Decision hash가 재시작·History 열기 전후 동일 |
| 사용량 사후 |836.18/2000. 표시된 추정 사용량 증가0.22; 이번 표본을 일반 비용으로 확대하지 않음 |

입력에는 `[합성 실측]`을 명시했고 Personal Need는 입력하지 않았다. 실제 사용자 인터뷰·이해 Evidence나 사람 pilot 결과가 아니다. PREVIEW operation1회만 실행했으며 Spec/Builder/Helper/Analyst operation을 추가하지 않았다. 예산은 누적900, 신규 호출 중단880을 계속 유지한다.

후보 설명은 한국어지만 round 요약 한 줄은 영어로 표시됐다. 이번 한 표본으로 한국어 품질·B11·전체 수직 흐름 통과를 주장하지 않는다. 재시작 후 transient run 목록은 비워졌지만 저장 후보는 유지됐다. B3 durable 실패 이력/abandon 구현은 여전히 별도다.

## 사용자가 바로 시작하는 방법

Kiro의 **workspaces** 창을 열어 둔 상태다. 왼쪽 **Agent Panel**의 빈 **학습 목표**에 원하는 내용을 입력하고 **후보 만나기**를 누른다. 개인적인 필요·최근의 어려움·현재 실력은 선택 입력이다. 저장된 합성 실측은 이전 프로젝트의 **이어서 보기**로 확인할 수 있다.

현재 폴더는 기본 Kiro profile의 `%APPDATA%/Kiro/User/globalStorage/vibe-helper.builder-helper-agent-panel/core-data/workspaces`다. Builder가 생성 프로젝트로 이동하면 이 승인된 루트의 하위 폴더에서 실행된다. 전역 Node, 로그인·과금 설정과 기존 다른 프로젝트는 변경하지 않았다.

## Git 전달 상태

- `hurdoo` 사용자 요청에 따라 기존 Credential Manager의 정확한 `HURDOO` 계정을 확인했다. token은 파일이나 출력에 남기지 않았다.
- `Hello-KU-tty/core`: 소스/인계 commit `bc8570b` push 완료, 원격 HEAD 일치 확인.
- `Hello-KU-tty/program`: 소스/인계 commit `deef685` 완료. GitHub API의 해당 계정 `permissions.push=false`를 확인해 push를 보류하고 Write 권한을 요청했다. 권한 없는 push를 반복하지 않는다.
- 소문자 계정 선택이 만든 인증 대기는 종료하고 저장된 대문자 계정을 사용했다. 로그인·token 생성·계정 교체는 수행하지 않았다.

후속 문서 commit은 위 소스 commit과 별개다. 공식 대회 제출·release 업로드는 하지 않았다. 기존 프로젝트0.0.9 업그레이드, Builder/Helper와 결과 실행·Evidence·다음 개인화, 사람 pilot·baseline·영상은 [남은 검증](SUBMISSION_READINESS_20260929.md)이다.
