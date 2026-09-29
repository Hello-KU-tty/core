# Windows 소스 후보 재현 — 2026-09-29

**판정: 별도 압축 해제본의 자동 재현 PASS.** 실제 모델 호출·사람 pilot·기존 프로젝트 업그레이드 검증과 외부 제출은 이 판정에 포함하지 않는다.

## 고정한 후보

- [소스 ZIP](../dist/submission-20260929/vibe-helper-source-20260929.zip): 2,427,105 bytes / 783 files. SHA-256 `26b9261887fc41f180e9177ceba968d71ba65f40527649781c43a3fc685a512b`.
- `SOURCE_MANIFEST.json`: 소스781개의 크기와 SHA-256, 원본 hash와 문서 경로 일반화 여부. manifest SHA-256 `5b0f6dd8e4501298b55335dc5c8b6f7e31275f01a93b6d62e4ccfc61874d8126`.
- backend base `8265e9da79d40964a0a2c794121887f06e89da7f`, frontend base `82f55ffa821d8e3f5d4ab071e543278e4fbb04e6`. 이번 미커밋 수정은 각 파일 hash로 고정했다. 제품 버전0.0.10.
- `.git`, local DB, 사용자 생성 workspace, 로그, 환경 변수 파일, 의존성 설치 폴더와 Windows 바이너리 설치물은 포함하지 않는다. Windows VSIX는 [별도 후보](SUBMISSION_READINESS_20260929.md)다.
- 명시적 allowlist와 알려진 home/credential 패턴을 검사했다. 이 검사는 모든 민감 정보의 부재를 증명하는 완전한 DLP가 아니다. runtime/test bytes는 수정하지 않고 문서 사본의 개인 경로만 일반화했다.

## 실행 순서와 결과

Node24.19.0, pnpm11.13.1, npm10.8.2, Windows/PowerShell에서 ZIP을 새 폴더에 풀고 시작했다. 같은 PC의 package cache/store와 설치된 Edge를 사용했다. 기존 `node_modules`나 빌드 산출물을 복사하지 않았다.

| 위치 | 명령/검증 | 결과 |
| --- | --- | --- |
| backend | `pnpm install --frozen-lockfile` (검증된 기존 store 지정) | PASS |
| backend | `pnpm check` | format/lint/typecheck/db/build PASS; unit178+skip1, integration391+skip1, eval42, Campus3, smoke6, E2E12 |
| frontend | `npm ci --ignore-scripts`, `npm run typecheck`, `npm test`, `npm run build` | 56 files / 753 tests PASS; audit0 |
| backend | `pnpm panel:build` | PASS |
| backend | `node --test examples/kiro-panel/test/*.test.cjs scripts/create-source-candidate.test.mjs` | native169+source selector6 = 175 PASS, skip0 |
| backend | `node scripts/test-program-consumer.mjs ../frontend` | provider/controller/port→인증 HTTP/SSE→SQLite PASS |
| source root | manifest781개 파일의 SHA-256 재계산 | 설치·빌드·검사 전후 모두 동일 |

E2E는 `VIBE_E2E_BROWSER_CHANNEL=msedge`, `VIBE_E2E_FRONTEND_PORT=4273`을 지정하고 임시 브라우저 profile을 사용했다. 프로젝트의 정확한 Node/pnpm preflight와 lifecycle allowlist는 유지했다. lint에 기존 경고2/정보21이 있으며 오류는 없다.

Consumer의 PREVIEW17/ENRICH_SELECTED3/SPEC4/BUILDER2는 지연된 deterministic fixture 횟수다. 실제 모델 호출은0이다. 후보 복귀·현재 Spec 재열기의 durable 데이터 불변과 명시적 재생성의 새 Session/preview1회도 검증했다.

첫 native 검사는 `panel:build`를 생략해 packaged-activation1건이 `dist/extension.cjs` 부재로 실패했다(174 PASS/1 FAIL). 파일을 별도로 복사하거나 검사를 건너뛰지 않고 사본에서 `pnpm panel:build`를 실행한 뒤175개 모두 통과했다. 첫 실패 로그도 로컬에 보존했다.

검증을 마친 사본은 원본 저장소 내부의 중첩 Biome root 충돌을 피하도록 OS의 전용 임시 폴더로 이동했다. 이동 후에도781개 source hash가 일치했다. 실제 frontend 소스 diff 검사는 통과했으며, 전체 diff에는 관리 SQL의 CRLF와 공식 Node 라이선스 공백 경고가 남는다. 배포 파일을 수동 정제해 kit hash를 바꾸지 않았다.

## 전달과 한계

[외부 receipt](../dist/submission-20260929/source-receipt.json)는 고정 ZIP hash에 위 후속 결과를 연결한다. ZIP 안 문서와 manifest의 `Independent source verification` 대기는 동결 당시 상태이며 archive를 사후 수정하지 않았다. 이 보고서는 ZIP 동결 후 작성되었다.

새 PC·오프라인 설치·실제 Kiro activation/모델 품질의 재현 결과는 아니다. 설치된0.0.10의 live 흐름과 기존0.0.9 프로젝트 업그레이드, 사람 근거·baseline·fallback 영상, 제출 형식은 [잔여 작업](SUBMISSION_READINESS_20260929.md)에 남아 있다. commit/push/공개/외부 전송은 수행하지 않았다.
