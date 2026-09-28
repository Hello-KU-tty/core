# 독립 소스 재현 — 2026-09-28 19:06 KST

판정: **기술 소스 재현 PASS, 최종 제출/출시 승인 아님.** 소스 archive는 로컬 비공개 후보이며 업로드·commit/push는 하지 않았다. 실제 사람 pilot/일반 Kiro baseline, 알려진 Agent 의미 오류, 공식 제출 형식과 사용자 범위 판단은 그대로 남는다.

## 고정한 후보

- 파일명: `vibe-helper-source-candidate.tar.gz`
- archive SHA-256: `68b22872cc3d09f74897a988fe7730f1caaa648b6bce2817d90e736e6f543314`
- 내부 `SOURCE_MANIFEST.json` SHA-256: `857d705a4ba4f281270ea183251640818b94b0633ae5a8aff855654e8f6b23cb`
- backend577 + frontend175 =752개 소스와 manifest/후보 README2개. 현재 미커밋 변경을 포함하며 backend `5af5eb0`, frontend `0858811`만으로는 재현되지 않는다.
- source 선택기와5개 회귀는 `scripts/create-source-candidate*.mjs`다. 압축 전 파일 목록을 고정하고 새 폴더로 압축 해제해 모든 hash와 추가 파일 부재를 확인했다. 아래 전체 검사 후에도752개 파일의 hash가 일치했다.
- 문서2개의 개인 경로만 사본에서 일반화했다. 코드·테스트·canonical/archived prompt bytes는 변경하지 않았다. manifest에 원본/사본 hash와 변환 여부를 함께 남겼다.
- 고정된 redaction 합성 키2개만 정확한 fixture 경로+값의 hash로 예외 처리했다. 다른 파일/다른 키는 차단한다. 이 검사는 알려진 패턴 중심이며 완전한 개인정보 감사가 아니다.
- `.git`, 개인 설정, DB/descriptor/admission, 로그/대화, 설치된 의존성, Windows binary/kit, 무관한 미추적 실험은 제외했다. 공유 테스트가 필요한 Windows 소스 module은 남겼으며 Windows 실행 성공으로 표시하지 않는다. 일부 과거 내부 문서 링크는 포함하지 않은 이력을 가리킨다.

archive 옆 `VALIDATION.json`은 해당 SHA에 대한 검사 결과다. archive 안의 문서는 검증 전 고정된 시점 기록이므로, 그 안의 “수정 후보 재검증 중” 상태는 이 별도 receipt가 갱신한다. archive를 나중에 수정하고 같은 검증 결과를 재사용하지 않는다. 재생성한 후보는 새 hash와 검증이 필요하다.

## 새 폴더에서 수행한 검사

Node24.19.0/pnpm11.12.0/npm11.17.0, macOS arm64. 두 저장소 모두 새 `node_modules`였다. 첫 후보에서 비어 있던 전용 cache/store로 다운로드했고, 수정 후보에서는 같은 잠금파일에 대한 전용 registry cache만 재사용했다. 기존 작업 폴더의 설치물·dist·DB를 복사해 성공시킨 것이 아니다.

| 검사 | 결과 |
| --- | --- |
| backend frozen install | PASS; 허용된 esbuild lifecycle만 실행 |
| `pnpm check` | PASS: unit137+3SKIP, integration365+8SKIP, eval41, Campus3, smoke6, Chromium E2E12 |
| format/lint/typecheck/db/build | PASS; 기존 lint2 warnings/16 infos, error0 |
| frontend frozen npm install/typecheck | PASS; `npm ci --ignore-scripts` |
| frontend tests/build | 55 files/719 tests PASS; 기존 Vite future configLoader 경고는 숨기지 않음 |
| 양쪽 공개 의존성 audit | 각각0건(해당 시점 관측) |
| panel build | PASS; 실제 bridge startup scope guard까지 확인 |
| native/개발 host/receipt/source 선택기 | 210 PASS,2 SKIP,0 FAIL |
| 실제 frontend consumer | provider/controller/port+webview 회귀→인증 HTTP/SSE→SQLite PASS. Agent는 지연 fixture: PREVIEW16/JIT3/SPEC4/BUILDER2 |
| Mac 개발 host 번들 | 두 압축 해제 소스에서 `BUILT_MODEL_0`; 새 Trust/IDE 실행/모델 호출 없음 |
| 검사 후 원본 소스 hash |752개 모두 일치 |

실제 사용자 서버4173은 건드리지 않고 E2E는4184를 사용했다. 모델 호출은0회였다. 설치와 모든 테스트의 PASS가 모델 의미 정확도, 사람 학습 효과, 일반 Mac 제품 설치나 제외한 Windows 검증을 대신하지 않는다.

## 첫 후보의 실패 보존

첫750개 후보의 archive SHA는 `219229c490862e1ee2d17f43f1095e0a425828df5e4388a1491345acc7c7d376`다. backend 전체와 frontend719는 통과했지만 native 회귀가 참조하는 과거 Analyst1.0.8/1.0.9 prompt2개가 누락돼2 FAIL이었다. 두 원본 파일을 추가하고 전체 검사를 다시 수행했다. 테스트를 끄거나 prompt/oracle/hash assertion을 변경하지 않았으며 첫 후보도 삭제하지 않았다. 이 첫 archive를 최종 후보로 전달하지 않는다.

## 사용 전 확인

먼저 archive와 manifest hash를 위 값과 대조한다. `backend/docs/SUBMISSION.md`의 모델0 재현 순서를 따르되 새 모델 검증은 별도의 정확한 Kiro version/Trust와 최신 예산 관측이 필요하다. 잠금파일이나 toolchain pin을 무시하지 않는다. 이 소스 묶음에는 private 연결 정보가 없으며, Windows kit나 지원되는 Mac 설치 파일이 들어 있지 않다.
