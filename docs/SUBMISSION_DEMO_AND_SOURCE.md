# 제출 데모와 소스 범위

2026-09-28 준비 초안. 비공개 source 검토 후보의 독립 재현을 통과했다. 외부 제출, commit/push, 공개 배포는 하지 않았다. 공식 제출 형식과 실제 사람 pilot/baseline의 처리에 대한 사용자 확인이 남아 있다.

## 데모 설명 순서

아래는 공개 발표의 확정 시간표가 아니라 짧은 기술 시연용 순서다. 실제 사람의 학습 성과를 연기하거나 미실행 화면을 실제 모델 결과로 소개하지 않는다.

1. **문제:** “코드가 완성된 것과 사용자가 이해한 것을 분리한다.” 학습 목표와 선택적인 Personal Need를 설명한다.
2. **만들기:** 저장된 검증 프로젝트의 후보/Spec과 실제 Decision 이력을 설명한다. Builder와 Helper의 역할·권한 차이를 보여준다. 실제 모델을 새로 호출할 경우 아래 admission 조건을 먼저 충족한다.
3. **실행:** Core가 소유한 결과 앱을 Chrome에서 연다. 전체8권→읽음5권→안 읽음3권·평점순을 확인한다. 이 앱은 합성 입력으로 실제 Builder가 만들고 후속 Task에서 수정한 결과다.
4. **정직한 Evidence:** 실제 Evidence 화면의 “아직 사용자 이해로 인정된 근거가 없어요”와 OBSERVED_ONLY를 보여준다. Agent 코드와 대리 선택을 사람 이해로 인정하지 않은 이유를 설명한다.
5. **다음 작업:** 관측 기반 trace가 다음 Helper와 Final Upgrade 준비에 쓰인 흐름과 후속 Task 완료를 설명한다. 이를 학습 성과 검증으로 바꾸지 않는다.
6. **한계:** 최초 서버/브라우저 실행 불일치, Helper 순서 오류, Analyst 계획/수행 혼동, 사람 pilot와 일반 Kiro 비교 미실시를 명시한다.

## 라이브/대체 시연 규칙

- 저장된 완료 상태와 결과 앱의 read-only 시연은 추가 모델 호출 없이 가능하다. Core의 실행 URL은 매번 반환된 loopback URL을 사용하며 특정 포트를 제품 계약으로 고정하지 않는다.
- 새 native 시연은 정확한 검증 host/version, 작업 폴더 Trust, Node/pnpm pin, 기존 작업 idle과 최신 dashboard 관측이 필요하다. 이번 사용자 예산은 계정 누적900, 신규 호출 중단선880이며 관측은15분 이내/overages Disabled여야 한다. admission을 갱신하기 위해 과거 timestamp/claim을 고치지 않는다.
- 실제 실패가 나면 실패 상태와 재시도/History 복원을 보여준다. 검증 UI를 mock 성공으로 전환하지 않는다.
- fallback은 같은 Core 계약과 실제 저장된 결과의 시연 또는 실제 화면 녹화로 준비한다. 현재는 Chrome 결과/첫 안내 screenshot만 있고 전체 fallback 영상은 없다. screenshot을 전체 녹화나 사람 실험으로 표시하지 않는다.
- 19:06 Chrome으로 다시 읽은 [공식 FAQ](https://ku-aws-challenge.framer.ai/)는 본선에서 준비한 예제뿐 아니라 새 입력에 대한 실제 동작을 확인한다고 설명한다. 저장 결과나 녹화는 장애 시 설명 보조이지 이 live 요구를 충족한 대체품이 아니다. 예선 파일 형식·마감 시각·제출 채널의 추가 안내는 여전히 보이지 않았다.
- 화면 녹화 전 계정 표시, 개인 경로, connection descriptor, raw 대화/terminal과 다른 사용자 창이 포함되지 않게 확인한다. 추가 캡처·업로드/공개 권한은 별도 확인한다.

## 소스 포함 범위

두 저장소의 미커밋 변경이 있으므로 기준 commit 두 개만 보내면 현재 수정이 빠진다. 최종본 고정 시 파일별 SHA manifest와 검증 시각을 함께 만들어야 한다. 무관한 미추적 실험을 `git add .` 또는 작업 트리 전체 archive로 섞지 않는다.

| 대상 | 원칙 |
| --- | --- |
| backend | 검토한 app/package/src/test, contracts, canonical prompts, migrations, package/lock/toolchain/config와 실행 scripts |
| Mac 개발 host | `examples/program-macos-dev/`, 준비·consumer·모델0 preview script. 제품 Mac 지원이 아닌 검증 harness임을 명시 |
| frontend | 실제 src/test/media/build config/package.json/package-lock.json. 별도 소스 버전/manifest를 backend와 함께 고정 |
| 문서 | README, 승인된 명세/설계/결정, 제출 초안, NFR/검증 보고서의 정제 사본 |
| 실행 가능한 예제 | Campus Drop fixture와 정제된 생성 앱 소스/package/lock/테스트. 합성 예제임을 명시 |
| Windows kit | 9/29 kit2026.09.29.2·VSIX0.0.10 자동 검증/CLI 설치 완료. 실제 native 업그레이드는 별도 미검증. [최신 hash/범위](SUBMISSION_READINESS_20260929.md) |

제외: `.git`, `.data`, `.local-experiments`, `node_modules`, package cache, 생성 DB/WAL/SHM/backup, connection/token/credit/admission 파일, `.env`, raw 대화/terminal/로그, 실제 사용자 경로가 포함된 private receipt, Kiro profile/설정/로그인 자료, 임시 폴더 전체. LICENSE/제3자 notice는 실제 포함 dependency/asset에 맞춰 보존한다.

`node scripts/create-source-candidate.mjs <FRONTEND_CHECKOUT>`은 Git checkout의 tracked allowlist+검토된 신규 파일만 새 private 폴더에 복사한다. 각 파일의 원본/사본 SHA, 문서 경로 일반화 여부와 합성 redaction fixture 예외 수를 기록하며 runtime/test를 정제해서 바꾸지 않는다. 링크/비정규 파일/덮어쓰기와 알려진 secret 패턴을 거절한다. 이 도구는 archive 생성·설치·모델 호출·업로드를 하지 않으며 결과는 `PRIVATE_REVIEW_CANDIDATE_NOT_RELEASE`다. 검증을 위해 별도 archive를 만들고 새 폴더에 풀어 frozen install/전체 검사와 native 회귀·actual consumer를 수행한다. 실패 후보를 지우거나 결과를 수정하지 않는다.

첫 후보의 backend 전체/프론트719 검사는 통과했지만 native 회귀에 필요한 과거 prompt2개가 빠졌다. 두 archive prompt를 포함한 수정 후보752개는 전체·E2E·추가 회귀210+2SKIP·actual consumer와 검사 후 SHA 확인을 통과했다. [정확한 archive hash와 재현 결과](SOURCE_REPRODUCIBILITY_20260928.md)를 따르며 첫 후보는 전달하지 않는다. 역사적 internal 문서 일부는 의도적으로 제외하므로 남은 과거 링크가 전체 저장소 이력을 제공한다고 주장하지 않는다.

## 최종 고정 체크리스트

- [x] 실제 프론트와 backend의 자동 검사 및 bounded Mac native 결과를 분리해 기록
- [x] 최신 생성 앱의17 tests/HTTP smoke/Chrome 필터·정렬 확인
- [x] 기능·보안·접근성 변경과 알려진 의미 오류 기록
- [x] 모델 비용815.91→835.96 및900 상한 유지 기록
- [ ] 실제 초보 사용자 pilot/증언·일반 Kiro baseline 자료 또는 제한 제출에 대한 사용자 판단
- [ ] 참가자 공식 파일 형식·제출 채널·마감 시각 확인
- [x] 비공개 소스 후보의 allowlist·알려진 민감 패턴 검사·SHA manifest·독립 source 재현
- [ ] 사용자 범위 판단과 공식 양식에 맞춰 최종 제출물을 다시 고정
- [ ] 같은 계약의 fallback 시연/영상 검증
- [ ] 필요한 경우 사용자 지정 GitHub 방식·공개/업로드 범위 승인
- [ ] 사용자 최종 제출 승인과 실제 제출 확인

기술 테스트 통과만으로 위 미완료 항목을 체크하지 않는다.
