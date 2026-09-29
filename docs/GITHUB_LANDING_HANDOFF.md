# GitHub 첫 화면 게시 초안

이번 작업은 로컬 commit만 수행한다. 조직 `.github` 저장소 생성, profile push, description/homepage/pinned repository 변경은 **하지 않았다**. 아래 내용은 사용자가 별도로 게시할 때의 초안이다.

## 준비된 내용

- [profile README 원문](github-profile/README.md): 조직 `.github` 저장소의 `profile/README.md`에 넣을 본문이다. core의 `.github/README.md`에 두는 것과 다르다.
- 조직 description: `Hello Vibe — 만들면서 이해의 근거를 남기는 Kiro 기반 바이브코딩 개발 환경`
- core description: `Hello Vibe Core: local SQLite, role-scoped MCP, Agent runtime, packaging and verification`
- program description: `Hello Vibe Kiro IDE frontend: Discovery, Builder, Helper and project history`
- 조직·두 저장소 homepage 제안: `https://github.com/Hello-KU-tty/core/blob/main/docs/DOWNLOAD_GUIDE.md`
- 고정 저장소 제안: `core`, `program` 순서.

## 게시 시 확인

1. profile의 소개·시연·설치·역할·검증 한계가 현재 README와 일치하는지 확인한다. 영상은 별도 담당 결과를 받은 뒤 실제 재생과 내용까지 검수한다.
2. Mac 후보와 개발자 ZIP을 먼저 게시하고 공개 URL에서 받은 hash가 receipt와 같은지 확인한다. 현재 로컬 후보는 아직 공개 다운로드에 반영되지 않았다.
3. 새 `VALIDATION_STATUS_20260930.md`도 게시된 뒤 profile 링크가 열리는지 확인한다.
4. 조직 권한과 GitHub 계정/대상에 대한 승인을 확인한 뒤 `.github` profile과 metadata를 반영한다. 이 문서는 실행 스크립트나 자동 승인 지시가 아니다.
5. 제출된 조직 URL과 다운로드 가이드 URL은 바꾸지 않는다. 업로드된 발표 PDF의 수정은 별도 제출 채널이며 저장소 수정으로 대체되지 않는다.
