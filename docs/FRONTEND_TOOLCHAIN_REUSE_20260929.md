# 생성 앱 도구 재사용과 Helper 중복 요약 제거 — 2026-09-29

사용자가 실행 환경에 따른 Builder 오류 재발 방지와 잘린 도우미 답변 요약의 개선 또는 제거를 요청했다. `program` 0.0.17과 backend kit 2026.09.29.4에 수정했다. Core 기준 `c0c1c49`, frontend 기준 `e1cffdd` 위의 미커밋 작업이며 commit/push하지 않았다.

## 변경

기존 오류 `PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED`는 Kiro를 실행한 프로세스의 PATH가 달라져 저장된 기존 Node 대신 관리 Node를 선택하면서 발생했다. Core는 이제 private project descriptor·생성 workspace launcher·공유 pnpm shim을 확인하고 기록된 Node/pnpm을 먼저 재검증해 재사용한다. 관리 도구는 cache hash도 확인한다. 실제 도구가 사라지거나 버전이 바뀌면 명확한 오류를 표시하며 다른 도구로 자동 교체하지 않는다. 기존 제품 업그레이드·pnpm pin 이전과 변조 거부 경계는 유지한다.

Helper의 `도우미 답변 요약`은 `text.trim().slice(-240)`으로 저장된 응답 끝부분을 다시 보여주던 영역이었다. 해당 UI 영역을 제거했다. 실시간 전체 답변·사용자 질문·상태와 내부 Helper/Evidence 기록은 보존했다. 전체 답변의 영속 저장이나 새 요약 모델 호출을 추가한 것은 아니다. 재접속 후 전체 답변 복원은 이번 변경 범위가 아니다.

## 검증

모든 검증은 현재 Windows x64 PC에서 Node 24.19.0 / pnpm 11.13.1과 PowerShell로 실행했다. Agent는 합성 fixture이며 이번 검증의 모델 호출은 0회다.

| 검증 | 결과 |
| --- | --- |
| Core `pnpm check` | PASS: unit 179(+skip 1), integration 402(+skip 1), eval 42, Campus Drop 3, smoke 6, Edge E2E 12; format/lint/typecheck/db/build 통과 |
| 도구 재사용·shim·업그레이드 회귀 | 3파일 28테스트 PASS, 새 재사용 검사 11개 포함 |
| 확장 host CJS | 169 PASS |
| 최종 kit 적용 후 frontend | typecheck, 57파일/800테스트, build PASS |
| 실제 프론트/Core 소비 | 실제 provider/controller, 인증 HTTP/SSE와 SQLite PASS; 지연 합성 Agent |
| 배포 runtime 도구 검사 | 기존 Node/pnpm와 관리 Node/pnpm 모두 개발 PATH 없는 새 프로세스에서 offline 재사용 PASS |
| 배포 runtime 실행 | 두 경우 모두 frozen install, build, test, smoke, 감독된 HTTP 앱 실행 PASS; 선택한 Node 사용 및 민감 환경 제외 확인 |
| 실패 경계 | 도구 누락·버전 변경·launcher/shim/descriptor 변조·downgrade 회귀, offline·hash mismatch·network·cancel·hardlink 거부 PASS |
| kit 및 VSIX 무결성 | kit 적용 전 검사, 적용 후 118 관리 파일 hash, VSIX 내부 71 파일 hash PASS |

검증 receipt: [T19_FRONTEND_HANDOFF_UPDATE_20260929_4.json](spikes/T19_FRONTEND_HANDOFF_UPDATE_20260929_4.json). 추가 생성 receipt는 `dist/project-tools-receipt.json`, `dist/frontend-consumer-receipt.json`, `dist/vsix-delivery-20260929-0.0.17/program-vsix-receipt.json`에 있다. 기존 lint warning과 Vite 설정 안내는 남아 있으나 검사 실패는 없다.

추가 Git whitespace 검사는 Core와 프론트 app source에서 PASS다. 프론트 전체 `git diff --check`는 재생성된 portable SQL의 CRLF와 upstream Node LICENSE 공백을 보고한다. `git diff --ignore-space-at-eol --exit-code -- portable/drizzle portable/licenses/node-LICENSE`로 해당 파일들의 실질 내용 변화가 없음을 확인했다. 배포 manifest hash와 일치하는 원본 바이트를 유지하며 생성물에 별도 공백 수정을 하지 않았다.

## 산출물과 한계

- VSIX: `dist/vsix-delivery-20260929-0.0.17/builder-helper-agent-panel-0.0.17-win32-x64-828aca63a3be.vsix`
- 크기: 2,570,177 bytes, SHA-256 `b4634b3ef9c899a7295b5317b25293ad002545bb09126fe64f0afa8c5344bcd3`
- Update kit: `dist/frontend-handoff-20260929-4.zip`, SHA-256 `4404de358c9be302f83b205ff2201944a10cc05eb03b0c14267c68036a23f72d`
- 지원 기준은 기존 Windows x64 / Kiro 1.1.70 / Agent 1.1.158이다. 다른 PC·지원 외 버전·설치 후 0.0.17 native Builder/Helper 모델 실행은 이번에 검증하지 않았다.
- 이 작업에서 실행 중 Kiro를 교체하거나 새 VSIX를 설치하지 않았다. 기존 실제 프로젝트와 실행 세션은 유지했다. 전체 제품 수직 흐름의 완료 또는 모든 Builder 오류의 부재를 뜻하지 않는다.
