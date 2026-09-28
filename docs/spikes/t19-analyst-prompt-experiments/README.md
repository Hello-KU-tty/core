# T19 Analyst 후보와 기각 실험

모든 실측은 2026-09-28 승인된 Mac 개발 창, synthetic/redacted 입력, exact catalog 모델, fresh 보호 H, retry 0, Core mutation 0에서 수행했다. 품질 oracle 통과율은 사용자 학습이나 일반 정확도가 아니다. Core 정책·엄격한 출력 schema·기존 oracle는 완화하지 않았다.

| 변형 | 입력/모델 | 결과 | 판정 |
| --- | --- | --- | --- |
| v1.0.7 baseline | 원본 7개 / Haiku | 2/7, schema 실패 2개 | 기존 기준 |
| v1.0.8 source-first | 원본+bare click 8개 / Haiku 2회 | 6/8, 6/8; schema 실패 없음 | 후보, 의미 오류 잔존 |
| v1.0.8 source-first | 같은 8개 / Sonnet | 5/8, schema 실패 없음 | 모델 변경 근거 없음 |
| v1.0.8 별도 입력 | collections/requests 8개 / Haiku | 5/8, schema 실패 없음 | 후보의 한계 확인 |
| CANONICAL_FINAL_CHECK_TAIL_V1 | v1.0.8 원본 8개 / Haiku | 5/8 | 기각; 상한/의존성 오류 잔존 |
| v1.0.9 순서표·중복 제거 | 같은 원본 8개 / Haiku | 2/8, schema 실패 6개 | 기각; 필수 필드 누락 퇴행 |

v1.0.8 SHA: `cf84876b9926c815562ab4481388dbff36b0d0083cfe8bade9d9b06a3cfd9cd9`. v1.0.9 SHA: `ad839e32fd2e22f3071fbd1e8ea60d8069ef3657f5035019769786661a09a77f` (7,063자). 이 폴더의 원문은 재현용 archive이며 제품 prompt import가 아니다.

tail 변형은 기존 v1.0.8의 마지막 `## 최종 출력 점검`부터 EOF까지를 byte 그대로 합성 Episode와 기존 transport footer 뒤에 `\n\n`으로 한 번 더 붙였다. 절 SHA `51a94c448fbfce8d40e0562d2c08cd1cf668ac3e4c65211a3de4a6c5cb697274`, 1,485 bytes. 임시 wrapper는 role hash/version/synthetic provenance를 고정했고 runtime/Core 정책은 바꾸지 않았다. 결과 `analyst-clean-3yom3V`와 실제 composed prompt SHA는 private 평가 artifact에 남긴다.

v1.0.9 결과 `analyst-clean-uzAF3h`: request-only와 bare click만 통과했다. 나머지 모두 proposedCanonicalName 누락, 5개는 misconception도 누락했다. 이 때문에 schema-valid Proposal인 것처럼 보정하거나 재채점하지 않는다. 유효하지 않은 원문에서 선택 의존성·직접 반복 상한 오류도 관찰됐지만 fixture PASS로 집계하지 않는다.

v1.0.9의 기존 두 corpus는 입력/oracle를 보존한 회귀용이며 unseen이라고 부르지 않는다. 별도 `evidence-analyst-v1.0.9-unseen.json`은 고정 SHA 이후 작성한 새 입력이나 **native 실행 전** 후보가 기각됐다. 이 입력의 모델 품질은 NOT_RUN이다. 나중에 재사용할 때 prompt와 실제 입력·oracle SHA를 다시 기록하고 다른 버전의 unseen 결과로 소급 표시하지 않는다.

05:14에는 canonical을 v1.0.8 후보로 복귀했다. 이 시점의 잠정 상태는 아래 07:15 판정이 갱신한다. v1.0.9는 제품 채택본이 아니다.

## 07:15 최종 후보 판정: v1.0.8 유지, 출력 구조 신뢰성 개선에 한정

원본 v1.0.7과 후보 v1.0.8의 **동일한 8개 입력**을 비교했다. source-first는 원래 7개를 그대로 두고 bare click 1개만 추가한 코퍼스다. 각 pair의 8개 `inputSha256`이 전부 일치함을 검사했다. 모든 실행은 Haiku, fresh 보호 H, retry 0, Core mutation 0, final idle true다. 아래 속도는 cell wall time의 중앙값(짝수 표본의 가운데 두 값 평균)이며 세션 준비/검증을 포함한다. 시간순 실행이지 무작위 대규모 A/B 실험이 아니다.

| 같은 입력 묶음 | v1.0.7 oracle / schema / 중앙값 | v1.0.8 oracle / schema / 중앙값 |
| --- | --- | --- |
| Source-first 8개 | 3/8 · 6/8 · 8.471초 | 6/8 · 8/8 · 9.669초; 반복 6/8 · 8/8 · 9.359초 |
| Collections/requests 8개 | 5/8 · 8/8 · 7.701초 | 5/8 · 8/8 · 8.202초 |
| 새 lifetimes/order/normalization 8개 | 4/8 · 5/8 · 8.963초 | 4/8 · 8/8 · 8.915초 |

원본 artifacts는 각각 `analyst-clean-PrAPJl`, `analyst-clean-jifKXQ`, `analyst-clean-KvJxlO`; 후보는 `7Fqxk4`/`Zb2rJL`, `YStmlG`, `9U9wCq`다. 이전 후보 held-out `PwZQT3` 5/8도 보존하며 유리한 표본만 남기지 않았다. 원본 prompt SHA는 `0d0c7f132f75f36246b87447d57ff5c6d0b7b9ed4d1eb368e792bdc25cea149c`다.

새 입력은 두 원문의 SHA를 고정한 뒤 작성했고 양쪽 결과를 보기 전에 oracle를 고정했다. 원본/후보 모두 `conceptCandidates`가 비어 있다. 앞선 held-out은 원본→후보, 새 입력은 후보→원본 순서로 실행했다. 이 순서 보완을 무작위 배정이나 통계적 검정으로 표현하지 않는다. 기존 v1.0.9 NOT_RUN 코퍼스의 실행 결과를 소급 만들지 않았다.

**유지 이유:** 회귀 코퍼스의 반복 개선과 별도 두 코퍼스에서의 출력 구조 준수(각 8/8)를 관측했다. 기본 모델·Core 정책·strict parser는 바꾸지 않는다. 기존 parser가 허용하는 fenced JSON도 schema-valid에 포함되므로, 이를 JSON-only 지시 준수라고 부르지 않는다. 모델 호출 지연은 개선되지 않았으며 실제 운영 재시도 감소량도 측정하지 않았다.

**남은 제한:** 새 입력의 oracle 통과율은 각각 동률이며 실패 항목도 달라졌다. 선택 의존성, 인용 변형, 직접 반복의 강도, 계획/완료 수행 혼동이 남아 있다. 전체 의미 품질 PASS, 사람 이해 판정 정확도, Windows 평가 완료 또는 일반 성능 향상으로 확대하지 않는다. 특히 미래 계획을 APPLICATION으로 부르는 오류는 단순 schema 검증으로 해결되지 않는다. 이 제한은 상위 T19/T19-N 완료를 막는 기존 의미 품질 과제에 남긴다.

### 실제 저장 없이 기존 Core 정책과 대조

private `audit-analyst-pure-policy.mjs`는 저장된 모델 원문을 실제 adapter parser로 읽고, 입력 SHA가 같은 합성 Episode/Decision resolution에 기존 순수 `evaluateEvidenceProposal`을 적용했다. Proposal-local Concept·prior Evidence 없음이며 alias 처리, 저장 transaction, Analysis job, Concept State reducer를 실행한 end-to-end 검증은 아니다. 모델/DB 변이 0, 원문·fixture·정책 module SHA를 별도 보고서에 기록했다.

- 잘못된 인용은 `INVALID_REFERENCE`, DIRECTLY_LED 반복의 MEDIUM/EXPLAINED는 `INSUFFICIENT_EVIDENCE`, MEDIUM/DEMONSTRATED는 `OVERSTATED_MAXIMUM_STATE`로 거절됐다. Analyst oracle 실패를 곧바로 실제 상태 상승으로 세지 않는다.
- 반면 새 후보의 미래 타이머 정리 계획은 APPLICATION/MEDIUM/EXPLAINED로 잘못 분류됐고, 순수 정책은 이를 수락했다. 같은 발언에 실제 원인 예측이 있지만 수행했다고 말하지 않았으므로 Signal 오류는 남는다. 원본의 held-out/회귀에서도 LIGHT_HINT 예측을 DEMONSTRATED로 올린 proposal은 순수 정책이 수락했다. Agent가 붙인 의존성·Signal의 의미를 Core가 완전히 검증한다고 주장하지 않는다.
- 보수적 강도 불일치, prompt의 더 좁은 상한, Core의 deterministic 상한 위반을 분리한다. 자연어를 fixture-specific 정규식으로 분류하거나 schema/정책/oracle를 약하게 만들어 점수를 올리지 않았다.

출력 구조 개선만 채택하며 의미 품질 실패는 공개한다. 제출 전 Windows와 최종 전체 회귀는 이 판정과 별도 검증으로 남긴다.
