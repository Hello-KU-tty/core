# 9월28일 프론트 실측 보고에 대한 백엔드 후속 답변

상태: Mac 수정·검증 완료.09:50 KST경 사용자 승인으로 추가 보고 대기를 종료했다. 아래 Windows 후속 항목은 완료 처리하지 않는다.

대상: `Hello-KU-tty/program` main `0858811195753e5c7312a79f3aede53c9aff9571`의 `BACKEND_LIVE_TEST_ISSUES_20260928.md`. 현재 변경은 백엔드 **미커밋 작업 트리**에 있다. 새 Windows VSIX/kit은 아직 만들어 전달하지 않았고 프론트 소스를 직접 수정하지 않았다. Mac 테스트 성공과 Windows 실제 연결 성공을 구분한다.

## 반영 상태

| 요청 | 백엔드 반영 | 프론트/Windows 후속 |
| --- | --- | --- |
| B2 업데이트 후 옛 Core 재사용 | portable 내용뿐 아니라 설치 root/실행 runtime identity 비교. 다르면 옛 lease를 갱신하지 않고 정상 종료를 최대45초 기다림 | 같은 bytes를0.0.2/0.0.3의 다른 설치 경로에서 실행하는 Windows 재현 필요 |
| B1 `NATIVE_RPC_REJECTED`가 quota 등 원인을 숨김 | 알려진 structured RPC 오류를 안전한 고정 코드로 분류해 worker와 run에 전달 | 실제 Windows RPC가 해당 type을 보내는지 확인. 자유문장만 오면 generic 유지 |
| B3 같은 Project PREVIEW 재시도 | 기존 `startRun`으로 새 key를 사용한 명시적 재시도 확인. Project/Session 보존 | 재시도 UI와 port의 캐시 run ID 갱신 필요. 재시작 후 durable 실패 이력/abandon은 미구현 |
| B4 창/Trust | 정확한 Trust gate·사용자 grant 후 복구 회귀 확인 | 생성 폴더 전환/별도 Helper 창을 안내. 원래 폴더 자동 복귀 없음 |
| B5 잔여 bridge/role 파일/Enterprise 정책 | 실패 즉시 Core 권한 회수·경로 제거·descriptor REVOKED 확인 | 실제 Windows 프로세스 생명주기/조직 정책 영향은 미확정. 임의 종료·파일 삭제·정책 우회 없음 |

## B2: Core 업데이트 대기와 복구

`host.getStatus().errorCode === 'CORE_UPDATE_WAITING_FOR_OWNER_EXIT'`이면 다른 설치 경로/버전의 Core가 아직 살아 있다는 뜻이다. 설치 경로가 다른 동일 package hash, identity가 없는 구형 owner도 이 검사를 거친다.

1. 기존 창의 진행 중 작업이 있다면 끝내거나 사용자가 명시적으로 중지한다.
2. 그 Core를 사용하는 이전 확장 host를 닫는다. 새 host는 이전 owner를 강제 종료하지 않는다.
3. 마지막 lease가 없어진 뒤 기존30초 유예에 따라 종료된다. 새 host의 `retry()`로 다시 준비한다.
4. 새 instance를 확인하고 History를 restore한다. 이전 실행을 자동 재전송하지 않는다.

준비 성공 시 `errorCode`는 `null`로 해제된다. 다른 창이 계속 lease를 갱신하면45초 뒤에도 실패하는 것이 의도된 보호 동작이다. 이것을 무조건 재시도 loop로 감추지 않는다. 새 host/portable/runtime을 함께 빌드·교체해야 하며 옛 kit의 파일 일부만 섞지 않는다.

## B1: 프론트 오류 안내

Core `run.errorCode`에 아래 코드가 들어가며 worker 진단 이벤트는 `AGENT_FAILED_<코드>`다. 곧이어 `AGENT_SESSION_CLOSED_DISCOVERY` 같은 정리 상태가 최신 worker 상태를 덮을 수 있다. **session closed는 성공을 뜻하지 않으므로 실패 판단은 Core terminal run의 status/errorCode를 기준으로 한다.** 현재 program 포트는 코드를 `PortError.message`에 보존하지만 상위 분류는 `unknown`이다. 사용자 안내를 세분화할 때 이 고정 값을 사용하고 provider 원문·로그·토큰을 webview로 넘기지 않는다.

| 코드 | 안내 방향 |
| --- | --- |
| `NATIVE_QUOTA_EXCEEDED` | Kiro 사용량 확인. 자동 재시도/초과 과금 활성화 없음 |
| `NATIVE_AUTH_REQUIRED` | 사용자 로그인 상태 확인 |
| `NATIVE_ACCESS_DENIED` | 계정·조직 권한 확인; 정책 우회 없음 |
| `NATIVE_MODEL_UNAVAILABLE` | 지원 모델/서비스 확인; 자동 모델 교체 없음 |
| `NATIVE_RATE_LIMITED` / `NATIVE_SERVICE_UNAVAILABLE` | 일시 오류 안내, 사용자 명시적 재시도 |
| `NATIVE_RPC_REJECTED` | 원인 미확정. quota/Trust라고 추정하지 않음 |

서비스 로그의 `ServiceQuotaExceededException`과 실제 JSON-RPC 응답은 서로 다를 수 있다. 이번 매핑은 안전한 structured type이 있을 때만 적용한다. 별도 quota preflight API는 없으며 사용량 부족을 알아보기 위해 반복 모델 호출하지 않는다. 프론트 보고의1000/1000 계정과 이 Mac 작업의815.91 관측 계정은 별개다.

## B3: PREVIEW만 같은 Project에서 명시적으로 다시 실행

재시도 버튼의 사용자 요청을 받았을 때 host에서 다음 순서로 처리한다. History restore나 화면 열기만으로 이 코드를 호출하지 않는다.

1. `restoreProject(projectId)`로 최신 `discoverySession`/revision과 저장 결과를 읽는다. 이미 durable preview가 있으면 이를 표시한다.
2. `listRuns(projectId)`에서 active Discovery가 있으면 새 run 대신 기존 run에 다시 붙거나 사용자 중지/대기를 안내한다. 확정 Spec/Task가 있으면 PREVIEW를 다시 만들지 않는다.
3. 새로운 시도에만 새 `entityId('idem')`를 만들고 다음 요청을 보낸다. 전송 결과가 유실됐을 때 자동으로 새 key를 만들어 재전송하지 않는다.

```ts
const accepted = await host.client.startRun({
  kind: 'DISCOVERY',
  phase: 'PREVIEW',
  projectId: snapshot.project.id,
  discoverySessionId: snapshot.discoverySession.id,
  expectedSessionRevision: snapshot.discoverySession.revision,
  idempotencyKey: newAttemptKey,
  enrichAfterPreview: false,
});
```

4. **현재 `LocalCoreDiscoveryPort.previews`의 Session→run ID를 `accepted.id`로 갱신한다.** 기존 `generatePreviewRound()`를 다시 호출하는 것만으로는 새 시도가 시작되지 않는다. 옛 run ID를 남겨 놓으면 별도 새 run이 성공했어도 옛 실패가 계속 보인다.
5. `watchRun(accepted.id, …)`로 완료를 기다린 뒤 restore한다. `SUCCEEDED`와 `DURABLE_RESULT` 및 실제 preview를 함께 확인한다. 실패면 같은 Project/Session을 유지하며 오류를 표시한다.

Core는 revision/active run/idempotency/확정 상태를 다시 검사한다. **같은 runtime에 run 기록이 남아 있는 동안** 같은 key는 같은 run이고 새 key는 새 시도다. runtime은 전체 run을 최대100개 유지하며 오래된 terminal run을 제거할 때 그 key도 제거한다. 따라서 재시작뿐 아니라 retention 범위를 지난 key도 영구 중복 방지 수단이 아니다. `RUN_NOT_FOUND_RESTORE_PROJECT`이면 먼저 durable 상태를 restore하고 사용자 새 시도를 받아야 한다. Core 재시작 후 run/key map은 사라져도 Project/Session/저장 결과는 남는다. 마지막 실패의 durable 표시와 실패 Project abandon/delete API는 이번에 추가하지 않았다.

## 창·Trust·정리 안내

worker가 generated root 안의 발급 workspace로 현재 창을 전환할 수 있다. 해당 폴더의 Trust 승인과 새 host 준비가 필요하며 Helper는 별도 보조 창을 쓴다. 자동 원래 폴더 복귀는 없다. `WORKSPACE_SWITCH_UNCONFIRMED`만으로 Trust 거절을 단정하지 않고, 실제 `nativeErrorCode: NATIVE_WORKSPACE_TRUST_REQUIRED`와 구분한다. Trust가 없어도 History는 읽을 수 있다.

실패하면 Core grant는 즉시 revoke되고 route는 제거된다. 합성 HTTP 검사에서 옛 handler는401, 옛 공개 MCP 경로는404, descriptor는 `REVOKED`였다. 프로세스가 보이는 것과 Core 쓰기 권한이 남은 것은 다르다. 그래도 실제 Windows에서 남은 bridge PID와 role 파일의 종료/보존 정책은 별도 검증이 필요하다. Kiro가 소유한 프로세스를 추정으로 kill하지 않는다.

## 전달 전 검증 순서

1. 같은 최종 백엔드 소스로 Windows Node24.19.0/pnpm11.12.0 및 exact Kiro1.1.70/Agent1.1.158/API1.131.0 gate를 확인한다.
2. `pnpm check`, `pnpm panel:build`, CJS 회귀, actual program consumer를 실행한다.
3. `pnpm test:managed`의 동일bytes/다른설치root 테스트와 History/credential 회전을 실제 Windows에서 확인한다.
4. quota가 남은 승인 계정에서 오류 코드와 같은 Project 명시적 retry, 생성 폴더 Trust/재로드/Helper 창/취소를 실측한다. quota를 일부러 소진하거나 overage를 켜지 않는다.
5. 새 Windows receipt와 파일 inventory로 kit/VSIX를 만든다. **기존20260927 verification metadata를 이번 변경의 새 Windows PASS처럼 재사용하지 않는다.**

검증 수치와 상세 근거는 [Mac 전체 인계](spikes/T19_MAC_PERFORMANCE_HANDOFF_20260928.md), [B1–B5 상세 대조](spikes/T19_FRONTEND_LATE_LIVE_TRIAGE_20260928.md)에 있다. 이번 답변 자체는 외부 전송·push가 아니라 로컬 인계 초안이다.
