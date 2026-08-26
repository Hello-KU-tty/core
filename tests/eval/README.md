# Evaluation harness

T07은 Agent를 구현하기 전에 품질 실패를 재현할 수 있는 redacted fixture, criterion 단위 scorer와 baseline 형식을 고정한다. 실행은 repository root에서 다음 명령을 사용한다.

```bash
pnpm test:eval
```

## 구성

- `fixtures/inputs`: Campus Drop과 서로 다른 unseen Learning Goal. Personal Need가 있는 입력과 없는 입력을 모두 포함한다.
- `fixtures/manifests`: fixture 종류, contract domain, 자동/사람 criterion과 version을 선언한다.
- `fixtures/subjects`: scorer 자체를 보정하는 good/bad Agent 출력과 Core 입력이다.
- `fixtures/reviews`: 의미 판단이 필요한 criterion에 대한 기록된 사람 review다.
- `fixtures/agent-runs`: 실제 Agent 출력에서 서버 메타데이터만 정규화한 prompt-version 회귀 fixture와 사람 review다. calibration corpus에는 섞지 않는다.
- `baselines/calibration-v1.json`: 현재 scorer가 good/bad 보정 사례를 구별하는지 고정한 결과다.
- `results`: 실제 Agent 실행 조건, 성공 범위와 알려진 실행 제한을 사실대로 기록한다.
- `src`: fixture loader, scorer registry, harness와 Evaluation Run/Baseline artifact 생성기다.
- `TRACEABILITY.md`: AC-MVP-001~014의 현재 test/eval과 최종 검증 작업을 연결한다.

## 자동 검증과 사람 review

| 평가 영역 | 자동 검증 | 사람 review |
|---|---|---|
| Discovery | strict Candidate/Candidate Round contract, 정확히 반복된 구조 signature | 문제·사용자·상호작용·data shape의 의미적 다양성, Concept Necessity |
| Learning Spec | fixture가 선언한 세 scope 경계와 excluded MVP feature | 목표에 맞는 교육·제품 범위인지 |
| Live Context | context version과 필수 Decision/Concept 포함 여부 | 후속 Agent 응답의 의미적 충분성 |
| Decision | strict contract | 사용자에게 물을 만큼 중요한 실제 선택인지 |
| Evidence | production deterministic Evidence policy의 outcome/reason | false mastery와 false misconception의 claim 의미 |
| Redaction | synthetic sentinel과 user-home path 잔존 여부 | 새로운 민감정보 유형의 맥락별 검토 |

사람 review가 없으면 harness는 통과로 추정하지 않고 `NEEDS_REVIEW`를 반환한다. `FAILED`는 기대한 품질 차이를 검출한 결과일 수 있고, scorer 실행 자체의 실패인 `ERROR`와 구분한다. 그래서 calibration run은 의도적으로 실패해야 하는 negative fixture를 포함해도 `COMPLETED`다.

자동 scorer는 제목이나 문장 같은 고정 답안을 비교하지 않는다. strict contract, fixture가 명시한 속성, revision/provenance와 production Core outcome을 검사한다. 정확한 구조 signature 검사는 mode collapse의 하한선이며 의미적 다양성을 대신하지 않는다.

## Baseline 경계

`calibration-v1.json`은 제품이나 Kiro Agent의 성능 baseline이 아니다. 좋은 사례는 통과하고 false mastery, false misconception, stale context, scope leak, trivial Decision, mode collapse와 redaction leak은 의도대로 구별하는지 확인하는 harness calibration이다. Generic Kiro, simple memory와 ablation 비교는 실제 Agent가 연결된 뒤 T24에서 같은 `BaselineResult` 계약으로 기록한다. 가중 점수와 threshold는 T22 protocol 동결 전에는 도입하지 않는다.

T08부터 실제 Kiro 출력은 `fixtures/agent-runs`에서 별도 회귀 사례로 검증한다. 이 사례는 prompt와 transport 변경의 회귀를 잡지만 T07 scorer calibration이나 T24 비교 baseline을 대신하지 않는다.

새 fixture는 개인정보·credential·실제 사용자 경로를 포함하지 않고 `containsPersonalData: false`, `redactionStatus: VERIFIED_REDACTED`를 유지해야 한다. 자동 criterion을 추가하면 scorer registry와 good/bad 보정 사례를 함께 추가한다.
