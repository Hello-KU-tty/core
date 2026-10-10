# T19-W3 확장 lifecycle과 frontend 통합

> 2026-09-24 · 사용자 `T19 W3` 요청으로 착수. 기준: 상위 다섯 문서, Windows 인계, W1 실측과 W2 package 계약.

- 기존 portable runtime 선택과 별도 Core process, SQLite migration/검증 backup, SDK generation/no-auto-replay를 재사용한다. 추가 dependency, prompt 정책/version 변경은 계획하지 않는다.
- private global storage 아래 Core data와 tools를 분리한다. 여러 창은 단일 Core lock/instance와 인증된 host lease를 공유한다. 한 창 종료와 workspace reload 사이에는 Core를 유지하고 마지막 lease 종료 후 30초 유예를 지나면 정상 종료한다. Core crash 시 다른 창이 새 instance에 read-only 복원한다. 실패 반복은 제한하고 명시적 재시도를 제공한다.
- Core 초기화와 migration을 DB owner lock 안에서 수행한다. extension package fingerprint가 다른 실행 중 owner에는 update 대기를 표시하고 임의 종료하지 않는다. 새 package는 이전 owner 종료 후 migration/backup하며 더 오래된 schema package는 거절한다.
- Windows Kiro 1.1.14/Agent 1.1.28/API 1.131.0과 W1 source hash만 native custom role을 허용한다. Mac protected built-in Helper gate는 그대로 둔다. Helper 보조 창 또는 직렬 실행 UX는 사용자 선택에 따라 연결한다.
- 하나의 VSIX에 기존 실제 Discovery/Spec/Builder/Helper/History 패널과 lifecycle 상태/재시도를 포함한다. Webview에는 credential/connection 경로를 전달하지 않는다. 실제 저장 결과는 Core 조회로 확인한다.
- 검증: checkout 밖 한글/공백 경로 packaged 실행, 복수 manager 경쟁, 종료/IPC 단절/crash, credential rotation/no-replay, pending migration backup와 downgrade 거절, native source/catalog/권한 회귀, 설치 host activation 및 `pnpm check`. clean 무개발도구 전체 수직 흐름은 W5, 생성 앱 toolchain은 W4다.
- 모델 호출은 필요한 최소 합성 실행으로 제한하고 native 준비와 실제 저장을 분리 기록한다. 자동 다운로드는 W2의 검증 경로만 사용한다. 기존 사용자 data/설정/환경은 변경하지 않으며 commit/push/공개 배포는 하지 않는다.
