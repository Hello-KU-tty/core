# 백엔드 변경 내역 — 2026-09-28 프론트 연동 개선

> 브랜치: `codex/windows-extension-runtime-20260923`
> 짝이 되는 프론트: `Hello-KU-tty/program`의 `FRONTEND_CHANGES_BY_BACKEND_20260928.md`가 들어 있는 커밋

2026-09-28 하루 동안 백엔드 Codex 세션이 실제 프론트(`Hello-KU-tty/program`)를 Mac에서 연결해 검증하면서 백엔드와 프론트를 함께 수정했다. 이 문서는 그중 **백엔드 쪽 변경 범위**를 정리한다. 이 세션은 19시경 중단됐다. 중단 직전 소스를 새 폴더에 풀어 독립 재현한 결과(`SOURCE_REPRODUCIBILITY_20260928.md`)가 있고, 커밋한 코드 파일의 해시가 그 재현 archive와 같음을 확인했다. 재현 이후에 바뀐 것은 문서뿐이다.

---

## 1. 이미 올라가 있던 부분 — `5af5eb0` (09-28 10:45, push 완료)

프론트 보고서 `BACKEND_LIVE_TEST_ISSUES_20260928.md`에 대한 답변 커밋이다. 상세 내용은 `FRONTEND_LIVE_TEST_RESPONSE_20260928.md`에 있다.

| 요청 | 반영 |
| --- | --- |
| B1 `NATIVE_RPC_REJECTED`가 한도 초과를 숨김 | structured RPC 오류를 `NATIVE_QUOTA_EXCEEDED`, `NATIVE_AUTH_REQUIRED`, `NATIVE_ACCESS_DENIED`, `NATIVE_MODEL_UNAVAILABLE`, `NATIVE_RATE_LIMITED`, `NATIVE_SERVICE_UNAVAILABLE`로 분류해 run `errorCode`와 worker 상태에 싣는다. |
| B2 확장 업데이트 뒤 옛 Core 재사용 | package hash뿐 아니라 설치 root와 runtime identity까지 비교한다. 다르면 옛 Core의 lease를 갱신하지 않고 `CORE_UPDATE_WAITING_FOR_OWNER_EXIT`를 낸다. |
| B3 같은 Project에서 PREVIEW 재시도 | 기존 `startRun({ kind: "DISCOVERY", phase: "PREVIEW" })`에 새 idempotency key를 쓰는 명시적 재시도 계약을 확인했다. |
| B4 창 전환과 Trust | Trust gate와 사용자 승인 뒤 복구를 회귀 테스트로 확인했다. |

---

## 2. 이번 커밋 — `5af5eb0` 이후 미커밋이던 개선

### 2-1. 제품 코드
| 파일 | 내용 |
| --- | --- |
| `packages/application/src/redaction.ts`, `application-service.ts` | **저장 전 텍스트 마스킹 경계**. Discovery 입력과 구조화된 설명 텍스트에도 기존 redaction을 적용한다(`redactContractText`). 원본을 schema로 검증한 뒤 가리고, 같은 schema로 다시 검증한다. 멱등성 충돌 검사에는 원본 해시만 보관한다. 파일 참조 경로에 민감 문자열이 있으면 `SENSITIVE_REFERENCE_PATH`(사용자 조치 필요)로 거절한다. 마스킹된 세션은 `redactionStatus: VERIFIED_REDACTED`로 표시한다. |
| `packages/application/src/redaction.ts`(`SensitiveTextStream`), `packages/runtime/src/workflow-runtime.ts`, `apps/local-backend/src/native-agent-relay.ts` | **스트림 마스킹**. native TEXT와 runtime SSE를 조각별로 가리면 한 글자씩 나뉘어 온 credential을 놓쳤다. 끝의 64자와 미완성 민감 구간만 보류하고 나머지는 바로 내보낸다. 실패하면 보류분을 버린다. |
| `packages/runtime/src/result-runtime.ts` | **생성 앱 최신성**. 같은 프로젝트의 서버가 살아 있으면 무조건 재사용하던 탓에, 후속 Task에서 바뀐 모듈이 반영되지 않았다(회귀 2건 재현). 이제 manifest, 경로, 컴파일 출력, `package.json`과 lock 파일로 bounded fingerprint(최대 4096개, 64MB)를 만들고, 값이 다르면 서버를 교체한다. |
| `examples/kiro-panel/src/native-permission.cjs` | native 셸의 `pnpm`/`npm` 명령은 상위 폴더에 `pnpm-workspace.yaml`, `.npmrc`, `.pnpmfile.*`이 있으면 거부한다(`ANCESTOR_PACKAGE_CONFIG_DENIED`). 생성 앱이 저장소의 상위 workspace를 물려받던 문제를 막는다. |
| `apps/local-backend/src/native-agent-relay.ts`, `scripts/native-receipt-scope.mjs`, `examples/kiro-native-host/*.cjs` | 하드코딩된 개인 홈 경로를 `homedir()`로 바꿨다. Mac이 아닌 플랫폼은 항상 packaged 경로를 쓴다. `/private/tmp` receipt는 정규화된 경로만 허용한다. |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | `@esbuild-kit/core-utils`의 transitive `esbuild` 0.18.20을 0.28.2로 override했다(`pnpm audit` 0건). |

### 2-2. 개발과 검증 도구 (제품 동작에 영향 없음)
| 파일 | 내용 |
| --- | --- |
| `examples/program-macos-dev/`, `scripts/prepare-program-macos-dev.mjs` | 실제 프론트 checkout을 번들링해 Mac Kiro에서 띄우는 **개발 검증용 host**. Windows 제품 entry와 `vendor/portable`은 바꾸지 않는다. 계정 사용량을 새로 관측한 경우에만 모델 요청을 허용한다(`model-admission.cjs`). |
| `scripts/test-program-consumer.mjs` | 실제 프론트 provider/controller/port와 webview를 인증 HTTP/SSE와 SQLite Core에 붙이는 consumer 검사. PREVIEW 중 provider 리로드 뒤 자동 화면 갱신, History 복원, 명시적 재시도, 오류 코드 전달, 메시지 검증 같은 **프론트 수정의 백엔드 호환성**을 여기서 확인한다. |
| `scripts/create-source-candidate*.mjs`, `scripts/preview-program-accessibility.mjs` | 두 저장소의 private 소스 후보를 만들고 검증하는 도구, 접근성 미리보기 도구. |
| 테스트 | `redaction-stream`, `redaction-boundary`, `result-runtime`, `native-permission`, `native-agent-relay`, `server`, `native-receipt-scope` 회귀를 추가·보강했다. |

### 2-3. 문서
`PROJECT_BRIEF.md`, `README.md`, `docs/ARCHITECTURE.md`, `DECISIONS.md`, `SPEC.md`, `TASKS.md`를 갱신했다. 추가한 문서는 `FRONTEND_MAC_PROGRESS_20260928.md`, `NEXT_SESSION_HANDOFF_20260928*.md`, `SOURCE_REPRODUCIBILITY_20260928.md`, `SUBMISSION*.md`, `T20_AUDIT_20260928.md`이다.

### 2-4. 일부러 커밋하지 않은 것
09-13~15에 만든 옛 native 실험 파일(`examples/kiro-native-host/test-*.cjs`, `extension.cjs`, `examples/kiro-panel-helper-host/`, `scripts/test-native-*.mjs`, `docs/spikes/t19-kiro-parser-repro-20260913/`, `.vscode/`)은 이번 작업과 무관하다. source 후보에서도 제외했던 파일이라 로컬에 그대로 남겼다.

---

## 3. 프론트와의 호환성

- 프론트 수정(리로드 뒤 Discovery 재구독, History 화면 복원, PREVIEW 재시도, 오류 안내)은 기존 SDK 메서드만 쓴다. **현재 프론트의 Windows kit(`vendor/portable`, 20260927 기준)으로도 동작한다.**
- 다만 `5af5eb0`의 B1/B2와 이번 2-1 변경은 **Windows kit에 아직 들어가지 않았다.** Windows에서 한도 초과가 제대로 분류되거나 옛 Core가 교체되려면 이 브랜치로 Windows에서 새 kit와 VSIX를 만들고 검증해야 한다(`WINDOWS_RESUME_20260928.md`). Mac 결과로 Windows PASS를 주장하지 않는다.

---

## 4. 검증 (2026-09-28, macOS arm64, Node 24.19.0, pnpm 11.12.0)

| 검사 | 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` → `pnpm check` | PASS: unit 137 (+3 skip), integration 365 (+8 skip), eval 41, campus-drop, smoke 6, Chromium E2E 12. lint는 기존 warning/info만 있다. |
| `pnpm panel:build` | PASS |
| `node --test examples/kiro-panel/test/*.test.cjs` | 161 PASS, 2 SKIP, 0 FAIL |
| `node --test examples/program-macos-dev/test/*.test.cjs` | 41 PASS |
| `node --test scripts/*.test.mjs` | 60 PASS |
| `node scripts/test-program-consumer.mjs <program checkout>` | PASS (지연 deterministic fixture, 모델 호출 0) |
| 프론트 `npm ci` → typecheck → test → build | 55 files / 719 PASS |

모든 자동 검사는 모델을 호출하지 않는다. 실제 native 모델 경로는 Codex 세션이 Mac에서 Builder Task 완료까지 확인했다(`FRONTEND_MAC_PROGRESS_20260928.md`). Windows와 사람 대상 평가는 아직 남아 있다.
