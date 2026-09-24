# Windows W1 developer capability probe

이 디렉터리는 제품 확장이 아닌 합성 진단용 Development Host다. 제품의 Mac source/runtime gate를 완화하지 않는다. [승인 계획](../../docs/T19_W1_WINDOWS_CAPABILITY_PLAN.md)과 [실측 결과](../../docs/spikes/T19_W1_WINDOWS_CAPABILITY_RESULTS_20260924.md)를 먼저 읽는다.

- 정확한 Windows x64 Kiro IDE 1.1.14 / commit `f694ef1b025756b1ae27ae7c3d9ed4215b0160fe` / Agent 1.1.28 / API 1.131.0 및 Agent bundle SHA-256에 한정한다.
- 개발 Node 24.19.0 / pnpm 11.12.0으로 frozen install 및 build가 선행돼야 한다. 실제 Core/bridge probe는 Kiro extension host의 `process.execPath`와 `ELECTRON_RUN_AS_NODE=1`을 사용한다.
- `%TEMP%/vibe-w1-host-XXXXXX`의 private ACL 아래 profile, extensions, 합성 workspace, DB, descriptor와 결과를 둔다. 실제 사용자 project를 넘기지 않는다. 신뢰·로그인은 사용자가 검증 profile에서 직접 한다.
- 기본 호출은 모델 turn을 실행하지 않는다. `--helper-live`, `--discovery-live`, `--builder-live`만 명시적으로 모델을 호출한다. root의 `model-turns.json`은 8회 상한이며 **이번 실험은 이미 8회를 사용했다.** ledger 초기화나 다른 root로의 한도 우회는 승인 범위가 아니다.
- `--dual-host`는 같은 합성 profile에서 서로 다른 진단 확장 경로로 Helper 창을 열고 신뢰·exact workspace·별도 windowId·empty tool catalog를 검증한다. UI가 잠깐 보일 수 있다. launcher는 결과 뒤 자신의 Kiro PID tree만 종료한다.
- `--builder-live` 단독 시 Builder 취소/재실행, 동시 custom Helper, Helper 취소/재실행을 시도한다. 동일 host의 queue 때문에 중간 실패할 수 있다. `--dual-host --builder-live`는 Builder 1회와 별도 host Helper 취소/재실행 2회다. 이전 Builder 취소 검증의 후속 실험이며 전체를 다시 실행하는 명령이 아니다.
- native 모델은 Kiro의 기존 `auto` 선택을 사용하며 API key나 다른 provider를 추가하지 않는다. Discovery와 Builder는 서로 다른 Core fixture다. Helper context는 Core가 조회하여 전달하며 모델의 자체 mutation 도구는 없다.
- live metadata 실패, 승인되지 않은 도구/권한, source 불일치, cloud hook 또는 memory gate 실패는 중단한다. metadata만 성공하거나 Core health만 성공해도 live PASS로 만들지 않는다.

개발 도구 경로를 process PATH에 먼저 설정한 PowerShell에서 사용하는 형태:

```powershell
# 기존 승인된 private root에서 모델 없이 metadata 확인
node scripts/probe-windows-host.mjs $kiroExe $probeRoot --activation --dual-host

# 기존 receipt와 같은 hash의 파일을 확인하는 후속 감사. 모델 호출 없음.
node scripts/audit-windows-host.mjs $probeRoot $runId $kiroExe
```

감사 도구는 원본 host report를 고치지 않는다. DB를 read-only로 다시 열고 private ACL, `quick_check`, foreign key, terminal state, revoked descriptor를 검사한다. 생성한 테스트를 Kiro Node의 명시적 TAP reporter로 다시 실행하며 별도의 `audit-<runId>.json`을 만든다. 원본 report의 실패 원인과 후속 판정을 함께 읽는다.

이 harness는 bounded fixture에서 허용한 두 파일과 한 테스트 명령만 승인한다. Windows OS-level shell sandbox, 일반 설치의 lifecycle, 전체 수직 흐름, Analyst 품질이나 제품의 두 창 UX를 검증·승인한 것으로 쓰지 않는다.
