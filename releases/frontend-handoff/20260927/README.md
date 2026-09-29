# Hello Vibe 개발자 소스 — 2026-09-30

[frontend-handoff-20260927.zip](frontend-handoff-20260927.zip?raw=true)을 **Download raw file**로 내려받고 [receipt](frontend-handoff-receipt.json)의 SHA-256을 확인한다. 제출한 다운로드 주소를 유지하기 위해 경로·파일명은 그대로 두었으며 내용은 2026-09-30에 갱신했다.

이제 과거 부분 update kit이 아닌 **backend/ + frontend/ 전체 실행 소스 snapshot**이다. 이전 kit이나 checkout에 덮어쓰지 말고 새 폴더에 압축을 푼다. 20260926 kit 적용은 필요하지 않다. ZIP은 VSIX가 아니다.

- Core 소스: [b7beeb3](https://github.com/Hello-KU-tty/core/commit/b7beeb33a140c0a88643a424a7b6b65e1d04e0fa).
- 프론트 소스: [e65cd7f](https://github.com/Hello-KU-tty/program/commit/e65cd7ff341e34bd6b160c468225819b0ab02254); 기능 기준 a61d408, 버전 0.0.18, kit 2026.09.30.1.
- SOURCE_MANIFEST.json에 모든 backend/frontend 파일의 SHA-256을 기록했다. 문서의 개인 경로만 일반화했고 실행 소스와 테스트는 그대로다. Core dirty 표시는 제외된 로컬 자료가 남아 있기 때문이며 Git 이력·PDF/PPTX·DB·대화·개발 node_modules는 포함하지 않는다.
- Node.js 24.19.0·pnpm 11.13.1을 사용한다. ZIP 최상위 README 및 [다운로드·빌드 안내](../../../docs/DOWNLOAD_GUIDE.md#7-vsix가-작동하지-않을-때-개발자용-대안)를 따른다.
- Windows portable은 공개 frontend의 원본 자산·라이선스를 포함한다. Mac은 backend/에서 `pnpm panel:pack:macos ../frontend`로 별도 빌드한다.
- Mac 압축 해제본의 전체 check·807개 프론트 테스트·Mac 재빌드를 검증했다. VSIX 재빌드 72항목 hash가 게시된 Mac 파일과 일치한다. 새 Windows 설치나 실제 모델 완주를 이번 Mac 검사로 주장하지 않는다.

ZIP: **4,837,102 bytes**, SHA-256 `97bd37eee0df6b91bf798eb23843b2422d07a7010e4dcb54ac5d19a29e3c21b6`, 872 files. 이전 20260927 kit과 당시 검증 기록은 Git 이력에 보존한다.
