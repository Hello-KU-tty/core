# T19-W3 확장 lifecycle 인계

> 2026-09-24. [계획](T19_W3_LIFECYCLE_PLAN.md), [실측 결과](spikes/T19_W3_LIFECYCLE_RESULTS_20260924.md), [Windows 설치 요구](WINDOWS_EXTENSION_HANDOFF_20260923.md), [W2 runtime 계약](T19_W2_PORTABLE_CORE_HANDOFF.md)을 따른다. 제품 지원 범위와 생성 앱 도구 준비·clean install gate는 구분한다.

## 설치와 책임

- `pnpm panel:pack:windows`는 `dist/portable-win32-x64/vibe-helper-portable-core-0.2.0-win32-x64.vsix`를 만든다. 하나의 VSIX에 실제 Discovery·Spec·Builder·Helper·History 패널, SDK, native worker, Core, bridge와 W2 리소스를 포함한다.
- `Vibe Helper: Open`이 제품 패널을 연다. 확장은 startup에서 runtime을 선택하고 private `globalStorage/core-data`를 초기화한다. 사용자가 server를 띄우거나 connection 경로를 입력하지 않는다. runtime cache는 `core-tools`에 분리한다.
- Kiro source gate는 Windows x64 Kiro **1.1.14**, Agent **1.1.28**, API **1.131.0**과 W1에서 확인한 commit/source hash를 요구한다. Node fallback은 이 gate를 해제하지 않는다. Workspace Trust 승인은 Kiro의 사용자 단계다.
- 실제 Windows 실행은 W2 descriptor의 Kiro Node **24.18.0**을 사용했다. 개발 pin은 Node **24.19.0**, pnpm **11.12.0**이다. canonical prompt/version과 dependency는 변경하지 않았다.

## 소유권과 복구

- `core-lifecycle.cjs`는 resource/runtime 검증, private root, 단일 owner lock, package fingerprint, health와 인증된 host lease를 관리한다. 초기화·migration도 owner lock 안에서 수행한다.
- Core는 창별 process group과 분리해 숨겨진 child로 실행한다. 각 host는 2초마다 lease를 갱신한다. 창 하나가 닫혀도 다른 창의 Core를 종료하지 않으며, 마지막 lease가 사라진 뒤 30초 유예를 지나면 Core가 DB와 Agent binding을 닫는다. crash한 host의 lease도 만료한다.
- 죽은 PID의 lock만 archive한다. 복구 경쟁은 exclusive recovery marker와 owner 재확인으로 제한한다. PID 재사용·불명확한 owner·복구 marker가 남은 상황은 임의 삭제하지 않고 보수적으로 실패시킨다.
- Core crash 시 새 credential/instance를 발급한다. SDK generation 변경은 기존 stream을 끊고 durable snapshot만 복원한다. 응답을 받지 못한 mutation은 자동 재전송하지 않는다. Core 재기동이 늦어도 다시 연결된 뒤 read-only 복원을 시도한다.
- 60초 안에 반복되는 자동 재기동은 두 번으로 제한한다. `Vibe Helper: Retry Core Connection`으로 명시적으로 다시 시도할 수 있다.
- 다른 package fingerprint의 살아 있는 owner는 종료하지 않고 `CORE_UPDATE_WAITING_FOR_OWNER_EXIT`를 표시한다. 모든 이전 창 종료 후 재시도한다. pending migration은 SQLite backup/quick_check를 거치며, 최신 DB를 구버전 package가 여는 경우 `DATABASE_NEWER_THAN_PACKAGE`로 거절한다. backup·quarantine·사용자 DB를 자동 삭제하지 않는다.

## Windows native Agent와 패널

- native private API는 기존 adapter에 유지한다. Windows의 custom role metadata, 실제 session mode, memory/cloud pull, tool catalog와 permission을 검증한 뒤 모델 요청을 보낸다. 새 창의 Agent endpoint 등록은 bounded read-only 대기로 처리하며 모델 요청을 재생하지 않는다.
- Helper/Analyst는 Core가 발급한 전용 workspace를 별도 Kiro 창에서 실행한다. 사용자 승인에 따라 필요한 순간 창을 자동으로 연다. Builder가 실행 중이어도 Helper 대기 여부를 확인하되 같은 host에서 다른 custom role을 동시에 claim하지 않는다.
- Helper/Analyst의 파일·shell·웹 접근을 허용하지 않는다. Helper의 MCP는 발급된 Core scope로 제한하며 Analyst는 tool-less다. Windows에서 macOS protected built-in Helper를 활성화하지 않는다.
- runtime 준비, Core 연결, worker 준비와 실제 run 결과·저장은 별도로 표시한다. Trust 전 열어 둔 패널도 승인 뒤 worker의 질문과 상태 구독을 이어받는다. credential·connection 경로는 webview에 전달하지 않는다.

## 재현

```powershell
pnpm check
pnpm test:managed
pnpm test:managed-host "<설치된 Kiro.exe 절대 경로>" --live --hold
pnpm test:managed-host "<설치된 Kiro.exe 절대 경로>" --helper --window-lifecycle --hold --reuse "<이 실행기가 만든 임시 root>"
```

- `test:managed`는 checkout 밖 한글·공백 경로에서 실제 packaged Core/SQLite와 SDK로 startup 경쟁, reload, crash/rotation, update/backup·downgrade를 확인한다. 업데이트 migration은 복사된 합성 package에만 추가한다.
- `test:managed-host`는 별도 임시 profile에 제품 VSIX와 검증기 VSIX를 설치한다. `--hold`는 Workspace Trust를 기다리는 창을 자동 종료하지 않는다. `--reuse`는 이 실행기가 만든 private 임시 root만 허용한다. 정상 프로필을 수정하지 않는다.
- `--live`는 실제 Discovery preview 1회를 요청한다. `--helper`는 Core가 정지한 상태에서 명시적 합성 Task fixture만 준비하고 실제 Helper 요청·별도 창·Core 저장을 확인한다. fixture는 실제 Builder 실행이나 사용자 학습 Evidence가 아니다.
- `--window-lifecycle`는 성공한 Helper 창을 남기고 owner 창을 닫은 뒤, 35초 동안 같은 Core instance가 유지되는지 확인하고 마지막 창 종료 후 정상 종료를 확인한다. 실패한 run은 자동 재생하지 않으며 다음 명시적 검증 실행이 새 요청을 만든다.

## 후속 범위

W4는 생성 TypeScript 앱의 Node/pnpm 전달과 자동 준비, W5는 개발 도구 없는 clean Windows 환경의 전체 수직 흐름과 출하 검증이다. W3의 작은 합성 Task·native 저장 결과를 해당 gate 완료나 실제 학습 효과로 확대하지 않는다. 기존 T19/T19-N의 미완료 항목도 유지한다.
