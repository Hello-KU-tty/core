# 프론트 마감 직전 실측 보고 대조

확인: 2026-09-28 08:45–08:50 KST, 후속 수정·검증 및09:50경 사용자 조기 종료 승인 반영. 프론트 main이 `0858811195753e5c7312a79f3aede53c9aff9571`로 갱신된 것을 원격 확인에서 발견했다. [프론트 원본 보고](https://github.com/Hello-KU-tty/program/blob/0858811195753e5c7312a79f3aede53c9aff9571/BACKEND_LIVE_TEST_ISSUES_20260928.md)를 전부 읽고 현재 백엔드 소스와 대조했다. 사용자의10시 연장으로 **B2/B1 백엔드 수정과 Mac 회귀 검증을 마쳤다. Windows 실제 재현 해결·새 VSIX 전달은 아직 아니다.**

## 최신 상태와 계약 비교

- 프론트 보고상 exact Windows pin과 Core/Trust/History/worker 준비는 통과했다. Discovery 실측은 실패했고, 그 계정은 1000/1000·overage disabled라고 보고했다. 이 Mac 작업의 별도 계정 관측815.91과 합치지 않는다. 프론트 계정 설정·요금을 변경하지 않았다.
- actual consumer에 사용한 `cce7751`부터 최신 main까지 네 commit, 변경 파일은 `package.json`, 새 실측 보고, `src/agent-panel-view-provider.ts`, `src/webview/main.ts`, 새 surface test다. controller/port/vendor 코드는 그대로여서 기존 consumer 검사의 해당 소스는 여전히 동일하다. **최신 UI 표시 변경 자체는 여기서 실행·검증하지 않았다.**
- 프론트가 요청한 VSIX0.0.3의 Windows 실제 완주는 이 Mac Core/합성 Agent consumer 결과로 대신할 수 없다. 같은 최신 소스의 Windows 평가가 다음 단계다.

## B2 — 동일 package hash의 다른 설치 경로 Core 재사용: 수정, Windows 검증 남음

수정 전 `apps/local-backend/src/main.ts`는 owner에 PID/instance/package manifest hash를 기록했다. `examples/kiro-panel/src/core-lifecycle.cjs`는 살아 있는 검증된 owner의 package hash가 같으면 lease를 갱신하고 연결했고 설치 경로 identity는 비교하지 않았다. 반면 Windows `materializePackagedRoleRuntime`는 역할 파일의 bridge/Node/환경을 현재 host runtime과 정확히 비교한다. 따라서 같은 portable contents를 다른 확장 설치 경로에서 사용하는 조건이 프론트 오류와 일치한다.

실제 lifecycle 모듈을 격리 VM에서 실행해 동일 hash owner에 `CORE_CONNECTED/SHARED`, 기존 lease RENEW, replacement launch0을 재현했다. `equal-package-core-reuse-0850.json`의 실제 시각은08:48이며 **KNOWN_GAP_REPRODUCED_NOT_FIXED**다. 실제 network/process/model 호출0이고 Windows 설치 실측은 아니다. source SHA `f44edffe8af4113a7ef4f4b02550b5b93b577ef32f205bbbac569c86c1bb087b`.

수정 후 검증된 resource root와 Node executable/args/env의 SHA-256 `runtimeIdentity`를 private owner에 기록하고 package hash와 함께 비교한다. 서로 다르거나 legacy owner에 identity가 없으면 **기존 owner의 lease를 갱신하지 않고** 최대45초 정상 종료를 기다린다. 마지막 기존 host의 lease 만료 후 새 Core를 시작하며, 다른 창이 계속 사용하면 `CORE_UPDATE_WAITING_FOR_OWNER_EXIT`를 반환한다. 다른 창/실행을 강제 종료하거나 role 경로 검증을 느슨하게 하지 않는다. 기존 창에서 작업을 마친 뒤 해당 host를 닫고 새 host의 `retry()`로 다시 준비한다. Kiro 전체 종료를 자동으로 수행하지 않는다.

잘못된 runtime identity/private directory로 준비가 실패하면 부분 준비 상태를 캐시하지 않는다. 명시적 재시도에서도 같은 검증을 다시 거친다. lease는 검증한 backend instance에만 전송하고 실제 lease를 얻은 host만 해제한다. descriptor가 교체됐으면 새 Core에 옛 lease RELEASE를 보내지 않는다. 성공 시 대기 오류를 `null`로 지운다.

실제 lifecycle CJS의 격리 clock/owner/lease 17회귀로 검증했다. 마지막3개는 느린 주기RENEW 중복, dispose보다 늦은RENEW 완료, stop뒤 끝난health에 대한 검사다. 이전 구현의2개FAIL을 보존하고 주기요청1개 dedup·종료전 drain·stop뒤새갱신금지로 보강했다. runtime identity/HostLeases 검사도 유지한다. `scripts/test-managed-core.mjs`에는 **같은 portable bytes·다른 설치 root**에서 활성 owner 보존→이전 lease 종료→새 instance/credential·동일 History를 검사하는 Windows 재현을 추가했다. 이 실제 Windows 검사는 아직 실행하지 않았다.

## B1 — RPC 오류 분류: 제한된 분류·전달 구현, Windows 실제 payload 확인 남음

수정 전 `examples/kiro-native-host/native-client.cjs`의 응답 처리는 모든 `message.error`를 `NATIVE_RPC_REJECTED`로 바꿨다. 따라서 프론트가 Kiro service log에서 찾은 quota 원인이 Core에 전달되지 않은 현상과 일치한다. 다만 service log body가 실제 JSON-RPC error payload와 같다고 가정할 수는 없다.

새 `native-rpc-error.cjs`는 own structured type/name/code, 최대4KiB의 JSON-object serialization과 한정된 details wrapper만 읽는다. 알려진 type은 아래 고정 코드로 바꾸며 자유문장 keyword 추정은 하지 않는다. Kiro의 `-32000`은 auth/model registry가 공유하므로 숫자만으로 auth라고 판단하지 않는다. malformed/상충/미지정 오류는 generic이다. 토큰·경로·request ID·provider message는 새 오류에 복사하지 않는다. 원문으로부터 오류를 분류했다고 의미 품질이나 quota 잔여량을 안다는 뜻은 아니다.

| `run.errorCode` / worker `AGENT_FAILED_…` suffix | 프론트 안내·재시도 경계 |
| --- | --- |
| `NATIVE_QUOTA_EXCEEDED` | 사용량 확인. 자동 재시도/초과 과금 활성화 금지 |
| `NATIVE_AUTH_REQUIRED` | 사용자 로그인 확인 후 명시적 새 시도 |
| `NATIVE_ACCESS_DENIED` | 계정·조직 권한 확인. 정책 우회 금지 |
| `NATIVE_MODEL_UNAVAILABLE` | 지원 모델/서비스 상태 확인. 임의 모델 자동 교체 없음 |
| `NATIVE_RATE_LIMITED` / `NATIVE_SERVICE_UNAVAILABLE` | 일시 오류로 안내하고 사용자 재시도 제공; 현재 자동 재전송 없음 |
| `NATIVE_RPC_REJECTED` | 원인 미확정. quota/Trust로 단정하지 않음 |

확인한 pinned Mac Agent source의 RequestError serialization/model-registry 타입과 프론트가 보고한 service exception을 근거로 한 한정 매핑이다. Windows가 structured type을 지우고 자유문장만 내보내면 여전히 generic이다. Windows 실제 JSON-RPC 응답에서 **민감 원문 없이 type/code의 형태를 확인하는 재검증이 필요**하며 이번 합성 주입 test를 그 실측으로 세지 않는다. 별도 quota preflight API는 검증·추가하지 않았다.

분류13회귀, 실제 native-client response 처리5회귀, worker→complete/status의7회귀, 실제 인증 HTTP/SSE·SQLite·NativeRelay 실패/재시도 integration, 실제 program port의4개 오류 전달을 확인했다. worker는 코드만 전달하고 native session을 닫으며 자동 새 prompt를 보내지 않는다. 이후 `AGENT_SESSION_CLOSED_*`가 latest worker status가 될 수 있으므로 session close를 성공으로 해석하지 않고 **terminal Core run의 FAILED/errorCode**로 판단한다. 현재 program은 이를 `PortError.message`에 보존하지만 일반 `code`는 `unknown`이다. 프론트는 메시지의 고정 코드로 안내를 구체화하되 원문 오류를 표시하지 않는다.

## B3 — 재시도는 기존 계약, durable 실패 표시는 미구현

같은 Project의 실패 PREVIEW는 기존 `startRun` 경로로 **사용자가 명시적으로** 재시도할 수 있다. 먼저 restore로 최신 Project/Discovery Session과 revision을 읽고 active run/현재 저장 결과를 확인한다. 실패가 확정된 뒤 새 시도에는 새 idempotency key를 사용한다. 같은 살아 있는 runtime에 해당 기록이 남아 있는 동안 이전 key를 다시 보내면 이전 run을 돌려준다. 최대100개 retention에서 오래된 terminal run이 제거되면 그 key도 제거되므로 영구 dedup으로 해석하지 않는다.

필수 값은 `kind: 'DISCOVERY'`, `phase: 'PREVIEW'`, `projectId`, `discoverySessionId`, `expectedSessionRevision`, `idempotencyKey`다. preview만 필요하면 `enrichAfterPreview: false`를 명시한다. quota/Trust 등 원인을 먼저 해결하고 자동 재전송하지 않는다. 저장된 preview가 있으면 기존 runtime은 이를 재생성하지 않고 durable 상태를 먼저 본다. 확정 Spec/생성 Task가 있으면 `DISCOVERY_ALREADY_CONFIRMED`, stale revision과 active run도 거절한다.

`WorkflowRuntime`의 run/idempotency map은 메모리다. Core 재시작 이후 `listRuns`가 비어 있는 것은 현재 설계와 일치한다. Project/Session/Evidence 등의 durable 상태가 사라졌다는 뜻은 아니다. 마지막 preview 실패를 History/snapshot에 durable로 노출하는 필드와 공개 Project abandon/delete 명령은 이번 변경에 추가하지 않았다. 이는 별도의 저장/계약/프론트 표시 설계가 필요한 남은 요구다.

실제 program `LocalCoreDiscoveryPort.generatePreviewRound()`는 `previews` map의 옛 run ID를 다시 기다릴 뿐 새 PREVIEW를 시작하지 않는다. 별도 새 run이 성공해도 같은 port의 옛 map을 그대로 두면 옛 오류가 계속 반환된다. 재시도 UI를 연결할 때 `startRun`의 새 run ID로 map을 갱신하고 완료를 기다린 뒤 restore해야 한다. 현재 consumer test는 기존 port의 알려진 제한을 재현하고, Core의 새 key retry가 정확히1회 실행되고 새 port의 restore가 같은 Project/Session의 durable preview를 모델 없이 읽는 것을 검증한다. frontend 소스 자체는 수정하지 않았다.

HTTP integration은 quota/auth/model/unknown 네 실패 후 각각 같은 key 재조회·새 key 명시적 재시도·새 native job·자동 job 없음·Project/Session 보존을 검사한다. 실제 SQLite close/reopen 뒤 run 목록만 비고 Project/Session은 유지되는 것도 확인했다. 실패한 빈 Project를 자동 삭제하거나 `COMPLETED`로 꾸미지 않는다.

## B4/B5 — 창 전환과 정리: 일부 소스 확인, 원인 미확정

worker는 pending job이 있는 generated root 내부로만 `vscode.openFolder(..., { forceNewWindow: false })`를 요청한다. 별도 Helper workspace는 별도 창이다. 현재 구현은 실패/종료 시 원래 폴더로 자동 복귀하지 않는다. target workspace가 실제로 활성화·신뢰되고 새 host가 준비돼야 한다.

`WORKSPACE_SWITCH_UNCONFIRMED`는 약1.5초 뒤 현재 폴더가 target과 다를 때 기록된다. 이 코드만으로 Trust 거절을 단정할 수 없다. 기존 다른 창 활성화/host reload 타이밍도 구분해야 하므로 이를 곧바로 `NATIVE_WORKSPACE_TRUST_REQUIRED`로 치환하지 않았다. 사용자 승인 없이 Trust 설정을 바꾸지 않는다.

정확히 Trust가 없는 host의 `nativeErrorCode`는 이미 `NATIVE_WORKSPACE_TRUST_REQUIRED`다. 추가 host 회귀는 History 조회 가능/Agent mutation 차단/사용자 Trust grant 후 worker1개 준비·오류 해제/종료 후 grant 무효를 검증했다. 이는 합성 VSCode event 검사이고 Windows Trust 창의 실제 클릭·재로드 타이밍 검증은 아니다. 원래 폴더 자동 복귀는 실행 중 작업/다른 사용자 창을 이동시킬 위험이 있어 추가하지 않았다.

남은 bridge PID, 여러 role file, Enterprise `autonomousAgentsDisabled`의 실제 영향은 이 보고만으로 정상/누수/차단을 확정할 수 없다. 해당 Windows의 endpoint/session 소유권, 종료 이벤트와 정제 로그를 함께 확인해야 한다. 임의 프로세스 종료나 역할 파일 삭제는 수행하지 않았다.

실패/재시도 integration은 실제Core에서 실패 즉시 옛 grant handler401·공개MCP경로404·descriptor REVOKED를 추가 확인했다. 잔여 프로세스 존재와 Core 권한 유지는 별개지만, 이 검사로 Windows의 실제 프로세스 종료를 완료 처리하지 않는다.

## 인계 판정

기존 Mac 성능 개선과 전체 회귀 결과는 유지한다. **B2/B1은 소스 수정·Mac 회귀, B3은 공식 Core 재시도 확인과 frontend cache 조치 안내, B4는 정확한 Trust gate 회귀**까지 진행했다. B3 durable 실패/abandon과 B5 프로세스·정책 영향은 미해결로 남긴다. 최신 Windows 프론트 end-to-end 연결 완료나 새 kit 전달로 표시하지 않는다. 동일 최종 소스로 Windows B2 relocation→B1 actual payload→B3 retry UI→B4/B5 lifecycle 순서로 재검증한다.10시 deadline 이후 새 유료 실측·공유 Core 교체·새 kit 배포를 자동으로 시작하지 않는다.
