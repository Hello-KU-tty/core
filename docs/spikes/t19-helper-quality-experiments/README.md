# Helper 근거 경계 실험 — 2026-09-28

판정: **v1.2.1 MIXED_NOT_ADOPTED**. Canonical Helper는 v1.2.0 원문으로 복귀했다. 기존 버전이 모든 의미 기준을 통과한다는 뜻은 아니다.

| 버전 / 합성 완료 Task | 전체 요청 시간 | 주요 관측 |
| --- | ---: | --- |
| v1.2.0 Map/Set 이전 | 39.030초 | 수동 집합 연산에서 표준 API 부재를 추론, EXCLUDED와 구현 부재를 혼동 |
| v1.2.0 Map/Set 반복 | 36.720초 | 위 두 단정은 반복하지 않음. Map.get O(1) 무조건적 표현은 남음 |
| v1.2.1 Map/Set | 36.575초 | API 부재를 주장하지 않음. 평균 비용·미확인 파일·계획상 제외를 구분 |
| v1.2.1 generator | 43.474초 | 긴 한 줄의 무제한 buffer 위험을 짚음. 그러나 첫 GB급 설명은 chunk·결과 수집 비용 없이 한 줄 메모리만 언급 |
| v1.2.1 union | 36.658초 | 타입/런타임 검증은 구분하지만 비정상 필드 조합을 아예 만들 수 없다는 과장이 남음 |

모두 실제 `program`의 ManagedAgentPort → HTTP/SSE → Core → 승인된 Mac native worker 요청이다. 새 v1.2.1 세 건은 SUCCEEDED/HELPER_RECORDED이고 Task COMPLETED를 유지했다. 같은 질문의 순차 호출은 Helper Episode/history를 늘리므로 fixed-context paired 정확도·속도 개선 증거가 아니다. 이번 입력은 이미 생성된 합성 앱이며 새 사용자 연구나 학습 Evidence가 아니다.

유니온 반례는 실제 생성 `src/domain.ts`의 `AvailableState`와 `EquipmentState`를 type-import했다. `{ status: 'Available'; borrower: string }`으로 정상 타입 지정한 변수를 두 타입에 할당해도 strict tsc가 통과했다. `any`나 강제 타입 변환은 쓰지 않았다. fresh literal의 초과 필드 거절과 구조적 할당 허용을 함께 확인했다. 단언·외부 입력만의 예외가 아니라 모델이 제시한 보장의 범위가 지나치게 넓다. 반례의 첫 tsc 호출은 TS5112(명령행 파일과 cwd tsconfig)였고, 독립 probe에 `--ignoreConfig`를 지정한 실행은 exit0였다. 저장소의 preflight/tsconfig는 변경하거나 우회하지 않았다.

v1.2.1은 코드 사실·일반 원리·환경 조건 구분, 수동 구현으로 API 부재를 추론하지 않기, EXCLUDED와 코드 부재 구분, 평균·타입·테스트 보장의 조건 구분이라는 일반 규칙만 추가했다. 특정 API/fixture 정답은 추가하지 않았다. 일부 답변의 조건 표기가 좋아졌으나 기본 버전도 같은 문제를 매번 보이지 않았고 다른 주제에서 중요한 과장이 남았다. 개선 효과를 충분히 입증하지 못해 추가 유료 문구 반복 없이 기각한다.

원문 SHA-256:

- v1.2.0: `c6a96ee7d34510e8097b8082bcc087f185ca915257023b8340089f88ed193231`
- v1.2.1: `03761b8670c755c56d38cfc4e02aa73b54fe046fe0339caa984bdba5fdd85301`

private synthetic root `<PRIVATE_MAC_EXPERIMENT_ROOT>`에 보고서와 반례를 보존한다:

- `native-helper-v3-dedup-complete-2.json`
- `native-helper-v120-dedup-repeat-0538.json`
- `native-helper-v121-dedup-0541.json`
- `native-helper-v121-streaming-0542.json`
- `native-helper-v121-unions-0543.json`
- `helper-unions-structural-counterexample.mts`

후보의 전체 check는 preparer test의 1.2.0 고정 기대값에서, panel tests 세 개는 personalization matrix의 1.2.0 gate에서 실패했다. 제품 native turn은 후보 version이 동기화된 Core/runtime으로 실행됐다. 이 두 legacy 평가 gate를 완화하지 않았으며 후보 기각 후 canonical/gate 일치를 복원하고 전체 검증을 다시 실행했다. 최신 검증 결과와 runtime/예산은 상위 journal과 resume 문서를 따른다.
