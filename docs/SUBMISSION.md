# Vibe Helper — 만들면서 이해의 근거를 남기는 AI 개발 도우미

기술 설명 · 상태 정정. 이 Markdown은 제출된 발표 PDF 자체가 아니다. 사용자 제공 제출 화면에서 조직 GitHub, 다운로드 가이드와 별도 업로드 PDF가 제출된 것을 확인했다. [현재 제출·검증 상태](VALIDATION_STATUS_20260930.md)를 먼저 참고한다.

사용자 확인에 따라 실제 사용 후 정성 인터뷰를 수행했다. 참여자 수·원문·정량 학습 효과·일반 Kiro 비교 결과는 이 문서에서 새로 주장하지 않는다. 아래 수직 흐름과 검사 수치는 **9월 28~29일 당시 기술 검증 기록**이며, 새 Mac 설치물의 모델 완주와 사람 학습 효과를 증명하지 않는다.

## 문제와 접근

AI가 코드를 완성했다고 사용자가 그 코드를 이해했다고 할 수는 없다. Vibe Helper는 먼저 실행 가능한 작은 프로젝트를 만들고, 그 과정에서 사용자의 질문·선택 이유·설명과 Agent가 작성한 내용을 구분해 기록한다. 학습 목표는 필수이고 개인적인 필요는 선택이다. 특정 예제 목록만 보여주는 대신 Discovery가 프로젝트 후보를 제안한다.

Discovery는 후보와 학습 범위를, Builder는 실제 코드·테스트와 Decision을, Helper는 현재 코드에 대한 읽기 전용 설명을 담당한다. Evidence Analyst의 제안은 최종 판정이 아니다. deterministic Core가 출처·참조·상태 상한·revision을 검증해 수락/거절하고 근거를 남긴다. 단순 카드 클릭, Agent 설명과 테스트 성공만으로 사용자 이해 수준을 올리지 않는다.

## 구현 경계

| 구성 | 책임 |
| --- | --- |
| 별도 Kiro frontend | Discovery/Spec, Builder/Helper, Decision, History, Evidence와 다음 작업 연결 |
| 인증된 local Core/SDK/MCP | 역할별 계약, 중복·오래된 요청 거절, durable 복원, 허용 도구 경계 |
| SQLite + 생성 workspace | 프로젝트·Event/Episode·Evidence 저장과 생성 코드 분리 |
| 결과 실행 supervisor | 검증된 manifest/경로, 소유한 loopback child, 변경된 결과의 재실행 |

MVP는 Kiro-only, 새 TypeScript 프로젝트, local 실행이다. 별도 Bedrock, 다른 coding-agent adapter, 기존 프로젝트 import나 cloud sync는 추가하지 않았다. Kiro 모델 호출에는 필요한 입력과 코드 문맥이 전달되므로 완전한 offline 서비스라고 설명하지 않는다.

## 실제로 확인한 수직 흐름

Mac의 고정된 Kiro 개발 환경에서 실제 프론트와 native 모델로 다음을 확인했다.

1. 개인적인 필요 없이 TypeScript 객체 배열의 filter/map 학습 목표를 입력했다.
2. 동적 후보10개→독서 기록 선택→JIT 상세화→Spec 확정→Builder Task로 이어졌다.
3. Builder가 데이터 출처 Decision을 만들었고, 명시적 선택/재개 후 기본 Task를 완료했다. Helper 질문과 분석은 별도 역할에서 동작했다.
4. 최초 앱이 Spec과 달리 서버에서 배열을 처리한 문제를 발견했다. 이를 성공으로 숨기지 않고 후속 Task를 통해 브라우저 ES module 실행으로 수정했다.
5. 과거 관측을 바탕으로 생성된 개인화 trace를 선택해 Final Upgrade Task를 준비하고 실제 Builder가 완료했다. 새 소스 복사본은 고정 설치·typecheck·build·17 tests·HTTP smoke를 통과했다.
6. Chrome에서 전체8/읽음5/안 읽음3, 평점 내림차순과 동률 제목순을 확인했다. 코드 변경 뒤 구 서버가 재사용되던 결함도 수정했다.
7. 재시작 후 완료 작업·저장 대화·분석 결과가 복원됐다. 분석5건은 성공했지만 사용자 이해 Evidence는0, 개념은 OBSERVED_ONLY였다. 대리 클릭을 실제 학습으로 집계하지 않았다.

검증 환경은 Kiro1.0.437/Agent1.0.794/API1.109.5, macOS arm64, Node24.19.0/pnpm11.12.0이다. Windows 제품 패키지를 Mac 제품으로 바꾼 것이 아니라 기존 보호 경계를 유지한 개발 host를 사용했다. 다른 Kiro 버전과 일반 Mac 설치 지원을 주장하지 않는다.

## 자동 검사와 안전 보완

| 검사 | 결과 |
| --- | --- |
| 실제 frontend (9/29 Windows) | 고정 설치/typecheck/56 files·753 tests/build PASS; 0.0.10 kit 적용 후 실제 checkout 재검증 |
| backend `pnpm check` (9/29 Windows) | unit178, integration391, eval42, Campus3, smoke6, E2E12 PASS; 별도2 SKIP |
| native 소스 회귀 / Mac 개발 host | 9/29 CJS169 PASS. 이전 Mac 격리 환경/예산41 PASS는 당시 결과 |
| 실제 provider→HTTP/SSE→SQLite | PASS. 모델 경계는 deterministic fixture이며 native 검사와 분리 |
| 의존성 감사 | frontend npm/backend pnpm 공개 audit 각각0건(2026-09-28 관측) |
| 독립 소스 재현 |752개 파일의 고정 archive를 새 폴더에서 설치·검사·빌드하고 검사 후 SHA 일치 PASS. [후보 hash·검사 보고서](SOURCE_REPRODUCIBILITY_20260928.md) |

첫 사용 수집 안내, 민감 텍스트의 저장 전 masking, 여러 응답 조각에 걸친 secret masking, 경로와 역할 검사, 실패/취소/재시도 및 늦은 응답의 프로젝트 혼입 방지를 보완했다. 입력 초안과 후보 선택 후 키보드 초점을 보존하고, 상태와 오류는 색상 외 텍스트로 표시한다. 자세한 요구사항별 근거와 미검증 항목은 [T20 감사](T20_AUDIT_20260928.md)에 있다.

## 실행과 재현

backend와 frontend는 별도 저장소다. 현재 개발 pin인 Node24.19.0/pnpm11.13.1을 선택하고 backend에서 실행한다.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm panel:build
node --test examples/kiro-panel/test/*.test.cjs
node --test examples/program-macos-dev/test/*.test.cjs
```

frontend에서는 npm 잠금파일을 사용한다.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
```

그 뒤 backend에서 `node scripts/test-program-consumer.mjs <FRONTEND_CHECKOUT>`을 실행한다. E2E 기본 포트가 사용 중이면 사용자 서버를 종료하지 않고 `VIBE_E2E_FRONTEND_PORT`로 빈 포트를 지정한다. 실제 Mac 개발 실행은 [별도 harness 안내](../examples/program-macos-dev/README.md)를 따른다. 유료 모델 호출은 로그인, 정확한 Workspace Trust와 새로운 사용량/예산 관측이 필요하다. 자동 검사만 실행하면 실제 모델을 부르지 않는다.

## 알려진 제한

- 실제 사용 후 정성 인터뷰는 있으나 일반 Kiro 비교와 정량 학습 효과 검증은 없다. 학습 향상·완주율·비용 우월성을 주장하지 않는다.
- Analyst는 미래 계획을 실제 수행으로 잘못 분류할 수 있다. Core의 구조·출처 검증이 자연어 의미까지 보장하지 않는다. [기존 전표본 결과](spikes/t19-analyst-prompt-experiments/README.md)를 보존하며, 모델 품질 전체 PASS로 표시하지 않는다.
- Helper의 실제 설명에서 평점 동률 책 순서 오류가 있었다. 실행 결과와 설명을 각각 검증해야 한다.
- 9/29의 Windows0.0.10은 과거 검사 대상이다. 현재 Windows0.0.18과 Mac 후보의 정확한 버전·hash·검증 범위는 [설치 안내](DOWNLOAD_GUIDE.md)를 따른다. 새 Mac 설치본 native 전체 흐름은 미검증이다.
- Mac Apple Silicon 설치 parser·실제 Core/SQLite·도구는 자동 검증했다. Intel Mac, 모든 키보드/보조공학 조합, 장기 안정성과 모든 Kiro 버전의 호환성은 인증하지 않았다. 생성 코드는 OS 수준 sandbox가 아니다.
- redaction은 알려진 형태 중심이며 모든 개인정보를 탐지하지 못한다. 비밀정보를 입력하지 않아야 한다. local reset/export/자동 삭제는 아직 제공하지 않는다.

제출 화면에는 자료 제출 마감과 업로드 PDF·조직 링크·다운로드 가이드 저장 상태가 표시되어 있다. 이 화면은 마감 뒤 수정 허용이나 심사 시작 시각을 증명하지 않는다. 영상 교체는 별도 담당 작업이며 이 변경에서는 수정하지 않았다. [현재 상태](VALIDATION_STATUS_20260930.md)와 [과거 데모·소스 준비 기록](SUBMISSION_DEMO_AND_SOURCE.md)을 구분한다.
