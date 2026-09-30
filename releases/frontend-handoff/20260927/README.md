# Hello Vibe 개발자 소스 — 2026-09-30

[frontend-handoff-20260927.zip](https://github.com/Hello-KU-tty/core/raw/refs/heads/main/releases/frontend-handoff/20260927/frontend-handoff-20260927.zip)을 바로 내려받고 [receipt](frontend-handoff-receipt.json)의 SHA-256을 확인한다. 제출한 다운로드 주소를 유지하기 위해 경로·파일명은 그대로 두었으며 내용은 2026-09-30에 갱신했다.

**Mac0.1.3 복구 보완을 포함한 검증된 ZIP**이다. 사용자 승인으로 기존 다운로드 경로에 제공한다. 동결 ZIP 안의 미게시 문구는 빌드 당시 기록이며 최신 게시 상태와 hash는 이 저장소의 receipt를 기준으로 한다. Windows portable은 기존 원본을 유지한다.

이제 과거 부분 update kit이 아닌 **backend/ + frontend/ 전체 실행 소스 snapshot**이다. 이전 kit이나 checkout에 덮어쓰지 말고 새 폴더에 압축을 푼다. 20260926 kit 적용은 필요하지 않다. ZIP은 VSIX가 아니다.

- Core 소스: commit `d8768d166dbe6d763bce13bd000c2fd54140407f`와 후속 문서·소스 묶음 목록 보완. Mac Node cache·구 설치 제거/프로젝트 이동 복구와 임시 경로 native 설정 충돌 수정을 포함한다.
- 프론트 소스: [e65cd7f](https://github.com/Hello-KU-tty/program/commit/e65cd7ff341e34bd6b160c468225819b0ab02254); 기능 기준 a61d408, 버전 0.0.18, kit 2026.09.30.1.
- SOURCE_MANIFEST.json에 모든 backend/frontend 파일의 SHA-256을 기록했다. 문서의 개인 경로만 일반화했고 실행 소스와 테스트는 그대로다. Core dirty 표시는 제외된 로컬 자료·배포 파일 갱신도 반영하며 Git 이력·PDF/PPTX·DB·대화·개발 node_modules는 포함하지 않는다. 파일 hash가 snapshot의 정확한 기준이다.
- Node.js 24.19.0·pnpm 11.13.1을 사용한다. ZIP 최상위 README 및 [다운로드·빌드 안내](../../../docs/DOWNLOAD_GUIDE.md#7-vsix가-작동하지-않을-때-개발자용-대안)를 따른다.
- Windows portable은 공개 frontend의 원본 자산·라이선스를 포함한다. Mac은 backend/에서 `pnpm panel:pack:macos ../frontend`로 별도 빌드한다.
- Mac 압축 해제본의 전체 check·807개 프론트 테스트·Mac 재빌드를 검증했다. VSIX0.1.3 재빌드72항목 hash가 로컬 Mac 후보와 일치한다. 최종 ZIP에는 실행 소스가 같은 상태에서 후속 문서와 소스 선택 목록·회귀만 추가했다. 새 Windows 설치나 실제 모델 완주를 이번 자동 검사로 주장하지 않는다. ZIP 내부 보고는10:57까지의 동결 기록이며, 이후 승인된 Decision 반영·취소·재개 결과는 저장소의 [실제 설치본 검증 보고](../../../docs/MAC_NATIVE_VERIFICATION_20260930.md)에 추가했다. 검증 후 제품 소스·ZIP bytes/hash는 변경하지 않았다.

ZIP: **4,858,103 bytes**, SHA-256 `ab5aa41082f732cf026691d0b188ac0feed503299b457d0b8e0e94c684859f69`, 877 files. 이전 kit·Mac0.1.1~0.1.2 소스와 당시 검증 기록은 Git 이력에 보존한다.
