# 제출 준비 대조 — 2026-09-28

**현재 판정: 제출 후보 미완료.** 이 문서는 공개 평가 항목과 현재 검증 자료의 대조표이지, 제출 완료 보고서나 참가자 실험 결과가 아니다. Windows 전용 검증은 사용자의 이번 작업 제외 범위이며 완료로 세지 않는다.

**제출 일정 갱신:** 사용자가2026-09-28에 “내일까지 제출이며 추가 참가자 안내는 아직 없다”고 확인했다. 따라서 준비 기준일은2026-09-29다. 같은 날 재확인한 [공식 홈페이지](https://ku-aws-challenge.framer.ai/)도 예선 기간을8/18~9/29로 표시한다. 구체적인 마감 시각·제출 채널·파일 형식은 미확인이다. 현재 공개 기준에 맞춰 코드·Markdown·실행/검증 자료를 준비하고 추가 안내에 맞춰 형식만 확정한다.

## 확인한 외부 요건

2026-09-28에 읽은 [고려대학교 × AWS AI Innovators Challenge 공식 안내](https://ku-aws-challenge.framer.ai/)는 다음 배점을 공개한다. 기술과 서비스 완성도에 합계 60점이 배정돼 있다. 공개 페이지의 일정에는 연도가 없어 이번 제출의 확정 마감 시각으로 사용하지 않는다.

| 공개 평가 항목 | 배점 | 현재 연결할 수 있는 프로젝트 자료 | 부족한 근거 |
| --- | ---: | --- | --- |
| 목적 부합성 | 10 | [승인된 문제·범위](../../../PROJECT_BRIEF.md), build-first 수직 흐름 | 실제 초보 사용자의 필요·완주 관찰 |
| 데이터 활용성 | 10 | [역할·출처·Evidence 설계](../../ARCHITECTURE.md), [평가 경계](../../../tests/eval/README.md) | 사람 annotation과 동의받은 최소 데이터 |
| 기술적 우월성 | 30 | deterministic Core, 역할별 권한, durable 복원, 자동 회귀와 제한된 Core 성능 비교 | 동일 조건의 일반 Kiro baseline, 남은 Evidence 의미 오류 |
| 서비스 활용성·완성도 | 30 | [실제 프론트 수정·Mac 검사](FRONTEND_MAC_PROGRESS_20260928.md), 후속 Task까지 bounded native 완주·Chrome 결과 실행 | 일반 제품 설치와 실사용 근거 |
| 제출 코드·Markdown | 10 | [README](../../../README.md), 명세·결정·테스트·인계 | 제출 형식 확인, 최종 소스/자료 범위 고정과 비밀정보 검사 |
| 최종 발표 | 5 | 검증 결과와 제한을 구분한 설명 자료 | 공식 발표 시간·형식, 검증된 live/backup demo |
| 대중 평가 | 5 | 해당 없음 | 실제 행사 투표이며 로컬 개발로 검증할 수 없음 |

공개 안내에는 AWS 지원 LLM API 활용과 Kiro 지원이 명시돼 있다. 이 저장소는 승인된 Kiro-only MVP를 유지하며, 이를 이유로 Bedrock 경로나 새 hosted 배포를 추가하지 않는다. 별도의 참가자 제출 양식·분량·채널·공개 링크 권한·영상 조건은 공개 페이지에서 확인하지 못했다. 사용자에게 별도 안내문을 요청했으며, 확인 전 임의로 확정하거나 제출하지 않는다. 위 배점의 근거는 같은 [공식 안내](https://ku-aws-challenge.framer.ai/)다.

## 현재 실행 근거

기준 소스는 backend `5af5eb0`와 frontend `0858811`에 이번 미커밋 변경을 적용한 상태다. commit SHA만으로 이번 수정까지 재현된다고 주장하지 않는다.

| 검증 | 확인한 결과 | 주장할 수 없는 것 |
| --- | --- | --- |
| frontend | 고정 설치, typecheck, 55 files / 719 tests, build PASS, audit0; 독립 source 복사본에서도 통과 | 실제 모델의 의미 정확도 |
| actual frontend consumer | 실제 provider/controller/port → 인증 HTTP/SSE → SQLite PASS | Agent 경계는 지연 fixture이며 native 성공 아님 |
| 입력 경계 | 32건 parser FAIL과 혼합 명령 1건 FAIL 재현 후 수정; 잘못된 메시지 Core 요청0 | 전체 제품 보안 감사 완료 |
| 프로젝트 전환 경합 | 24건 await 경합+1건 이전 화면 잔존 FAIL 재현 후 수정; 실제 HTTP 지연/History 전환 회귀 PASS | native 모델 작업 완료 |
| 재시도/입력 복구 | 13건+실제 버튼 revision0 FAIL 재현 후 수정; webview bootstrap→Core의 단일 재시도·WAITING 갱신과 Mac 입력 상한 UI PASS | 합성 Analysis fixture를 실제 모델 분석으로 간주 |
| backend 전체 검사 | unit137+3SKIP, integration365+8SKIP, eval41, Campus3, smoke6, E2E12 PASS | SKIP된 Windows 검사 성공 |
| Mac native source 회귀 | 161 PASS+2SKIP, panel build PASS | 다른 Kiro 버전의 호환성 |
| Mac 개발 host 예산/Trust/환경 | 41 PASS, 별도6프로세스의2회 admission 상한과 재로드·손상·한도·분석 재시도·폴더별 환경 검사 | 실제 계정 billing hard cap, 자동 후속 모델 비용 상한 |
| 실제 Mac frontend 화면 | 제한 안내·History·좁은 폭·입력/초안·완료 복원·Evidence 관찰-only 표시 확인; Chrome 실제 renderer로 첫 안내/Tab/후보 선택 후 focus·입력 보존 검사 | 모든 보조공학 도구/OS 접근성 인증 |
| 이번 native 실측 | 새 Discovery3단계→실제 Decision→기본 Task COMPLETED→Chrome→Evidence-aware Helper(basis5)→후속 Task COMPLETED→최신 앱; 사용량815.91→835.96 | 사람의 학습 성과; 새 관측 없는 추가 호출 |
| Mac 실행 환경 | 기존 프로필·정확한 workspaces Trust, 폴더별 비영구 Node24 PATH, 독립 앱 lock/node_modules 및 fresh 복사본 frozen install/typecheck/build/17 tests/smoke PASS | Mac 일반 제품 설치 지원, 다른 Kiro 버전/Windows 검증 |
| 생성 결과 최신성 | 구서버 재사용·manifest 미재검증2건 재현 후 bounded content 검사와 소유 child 교체8 tests 및 전체 회귀 PASS | 생성 코드의 OS sandbox |
| T20 보안·복구 | 저장 전 structured redaction/원본 hash idempotency/민감 참조 거절/분할 TEXT 마스킹과 DB·SSE·native 회귀 PASS; [감사 대응표](T20_AUDIT_20260928.md) | 임의 개인정보 탐지, 기존 DB 정리, 모든 제품 OPS 완료 |
| 개발 의존성 감사 | frontend npm audit0, backend pnpm audit0; esbuild/Vitest 기존 도구 갱신·단일 transitive override·frozen install/schema export PASS | 취약점이 영원히 없다는 보증 또는 penetration test |
| 독립 source 재현 | 선택한752개 source를 archive/압축 해제/새 고정 설치한 뒤 전체 검사, frontend719, 추가210+2SKIP, actual consumer와 검사 후 hash 일치 PASS; [고정 hash/실패 이력](SOURCE_REPRODUCIBILITY_20260928.md) | 공개 승인, 일반 Mac/Windows 설치물, 사람 실험 완료 |

상세 실패·재실행 조건과 사용량 정책은 [Mac 진행 기록](FRONTEND_MAC_PROGRESS_20260928.md)에 있다. 승인 상한은 계정 누적900이며 추가900이 아니다. 새 모델 요청 전 15분 이내 관측과 신규 호출 중단선880을 적용한다.

## 모델 없는 재현 순서

Node24.19.0/pnpm11.12.0 및 `.node-version`/preflight를 유지한다. backend checkout에서:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm panel:build
node --test examples/kiro-panel/test/*.test.cjs
node --test examples/program-macos-dev/test/*.test.cjs
node scripts/test-program-consumer.mjs <FRONTEND_CHECKOUT>
```

consumer 실행 전 frontend checkout에서 기존 lockfile로 `npm ci --ignore-scripts`, `npm run typecheck`, `npm test`, `npm run build`를 수행한다. consumer는 새 합성 DB를 무시되는 `.data/frontend-handoff/` 아래 생성하며, 최신 도구는 부모 디렉터리도 준비한다. 기존 사용자 DB를 대상으로 하지 않는다. 결과 `dist/frontend-consumer-receipt.json`에는 정제된 검사 항목과 fixture 호출 수만 남는다.

E2E 기본 포트가 점유돼 있다면 사용자 서버를 종료하지 말고 빈 포트를 `VIBE_E2E_FRONTEND_PORT`로 지정한다. 이번 Mac에서는4183을 썼다. GUI/browser 실행 권한 오류를 앱 테스트 PASS로 기록하지 않는다.

실제 프론트의 Mac 개발 실행은 [개발 harness 안내](../../../examples/program-macos-dev/README.md)를 따른다. 이는 Windows 제품 패키지가 아니라 검증용 seam이며 frontend manifest/portable 지원 범위를 바꾸지 않는다. 모델 없는 검사만으로 지원 버전을 늘리지 않는다.

## 제출 전 반드시 남아 있는 항목

1. **실제 연결의 범위:** Personal Need 없는 독서 기록 시나리오는 후속 Task 완료와 최신 Chrome 결과 실행까지 통과했다. 최초 앱의 서버 실행 불일치는 실제 후속 Builder로 수정했고 Helper의 동률 순서 설명 오류는 남은 품질 기록이다. 일반 Mac 제품 설치·다른 Kiro 버전·이번 제외 범위인 Windows PASS는 아니다.
2. **안전·복구의 범위:** [T20 감사](T20_AUDIT_20260928.md)에 첫 안내·redaction·keyboard/label·실패/취소/복원과 미검증 OPS를 매핑했다. bounded Mac/자동 회귀만으로 모든 접근성·제품 lifecycle 보장을 선언하지 않는다.
3. **의미 품질:** Analyst1.0.8은 출력 구조 개선에 한정한다. 미래의 계획을 실제 수행으로 오인한 기존 실패가 남아 있어 false mastery 안전성을 일반화할 수 없다. [원본/후보 전표본](../../spikes/t19-analyst-prompt-experiments/README.md)을 보존한다.
4. **실제 사용자와 비교:** [SPEC10.2](../../SPEC.md#102-대회-제출-준비-완료-조건)는 초보 사용자 검증·동의된 증언·일반 Kiro baseline을 요구한다. 합성 fixture·개발자의 대리 클릭·LLM 평가를 이를 대신하는 사람 결과로 세지 않는다. 참가자 모집/동의/외부 전달은 별도 사용자 조율이 필요하다.
5. **제출물 고정:** [제출 Markdown 초안](../../SUBMISSION.md), [데모·소스 범위](../../SUBMISSION_DEMO_AND_SOURCE.md), [비공개 소스 후보의 독립 재현](SOURCE_REPRODUCIBILITY_20260928.md)을 준비했다. 실제 안내에 맞는 최종 형식과 fallback recording은 아직 없다.19:06 공식 FAQ 재확인에서 본선은 새 입력의 실제 동작도 확인한다고 명시돼 있어, 저장 결과/영상만으로 live 요구를 충족했다고 하지 않는다. 계정 token, connection descriptor, DB, raw 대화, 민감 경로, 과거 private 실험 산출물은 제외한다. 현재 작업 트리를 통째로 archive하지 않는다.
6. **전달 권한:** commit/push/공개 배포는 이번에 하지 않았다. 외부 제출이나 공개 채널 변경 전 사용자에게 범위·계정·대상 승인을 받아야 한다.

상위 T19/T19-N, T20~T30과 최종 제출 준비 완료는 이 대조표로 닫지 않는다. 후속 검증 결과 또는 사용자가 명시적으로 승인한 제한이 있을 때만 관련 결정과 task를 갱신한다.
