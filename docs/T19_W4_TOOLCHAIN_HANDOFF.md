# T19-W4 생성 앱 도구 인계

> 2026-09-24. 상태와 최종 검증은 [TASKS.md](TASKS.md), [W4 계획](T19_W4_TOOLCHAIN_PLAN.md), [실측 결과](spikes/T19_W4_TOOLCHAIN_RESULTS_20260924.md)와 [receipt](spikes/T19_W4_TOOLCHAIN_RECEIPTS_20260924.json)를 따른다. W5 clean Windows 전체 수직 흐름은 별도다.

## 제품 동작

- Core는 계속 Kiro child runtime을 우선 사용한다. Builder와 결과 앱은 별도 일반 Node descriptor를 사용한다. 기존 Node 24.18.0/24.19.0 및 pnpm 11.12.0을 확인하고, 없으면 private `core-data/project-tools`에 필요한 도구만 준비한다. repository 개발 pin은 24.19.0/11.12.0 그대로다.
- Node는 W2의 공식 executable/hash/probe를 재사용한다. pnpm은 고정 npm tarball의 SHA-512를 확인한 뒤 일반 파일만 staging에 추출한다. cache는 원본 tarball hash와 전체 파일 inventory/content를 재검사한다. 완료되지 않은 stage는 후보가 아니며 손상 cache는 quarantine한다. acquisition lock 복구에는 W2의 `recoverCoreAcquisition`을 해당 node-cache/pnpm-cache에 적용할 수 있다.
- Core가 Builder job을 발급하기 전에 도구와 `.kiro/vibe-tools.cmd`를 준비한다. canonical Builder 1.3.7은 Windows에서 `.\.kiro\vibe-tools.cmd pnpm ...`와 `.\.kiro\vibe-tools.cmd node --test`를 사용한다. native worker는 이 launcher·descriptor·workspace를 검증하고 기존 one-time permission, foreground, timeout과 command guard를 적용한다. 일반 명령 연결·전역 설치·범용 새 tool은 추가하지 않는다.
- launcher와 descriptor는 Agent가 수정할 수 없는 `.kiro`/private tool root에 둔다. cmd 실행 전 Node/Electron injection 환경을 제거하고 실제 child에는 제한된 OS 변수, 선택 Node/pnpm, private pnpm home/config/cache만 전달한다. user/global PATH나 npm 설정은 변경하지 않는다.
- dependency install은 frozen 명령으로 수행한다. 초기/갱신 lock은 기존 script-free 명령만 허용한다. pnpm의 run/test 자동 설치는 error 정책으로 제한하며 root install lifecycle, local npmrc/pnpmfile, 임의 package build 허용을 거절한다. 지원 workspace config는 `packages: [.]`, `allowBuilds`, `onlyBuiltDependencies`의 esbuild/better-sqlite3 범위다. 다른 설정은 조용히 무시하지 않고 명시적으로 실패한다.
- result launcher는 같은 선택 Node와 제한 env로 manifest entry를 실행한다. Kiro executable을 일반 Node로 전달하지 않는다. frontend result manifest와 Core/Evidence 계약은 그대로다.
- 새 generated workspace는 Core의 Windows private-directory policy로 생성한다. 실행 기록은 보호된 launcher 명령과 실제 exit code를 수용하며 shell 권한 허용은 기존 guard에서 별도로 결정한다. result 도구 준비 실패는 `RESULT_PROJECT_RUNTIME_UNAVAILABLE`로 전달한다.

## 개발자 검증

```powershell
pnpm check
pnpm test:project-tools "<기존 pnpm.cjs 또는 pnpm.cmd 절대 경로>"
node scripts/test-project-tool-recovery.mjs
pnpm test:managed-host "<Kiro.exe 절대 경로>" --builder-tools --hold
pnpm test:managed-host "<Kiro.exe 절대 경로>" --builder-tools --without-project-tools --hold
```

미설치 환경 driver가 중간 조회에서 `CORE_CONNECTION_UNAVAILABLE`로 실패했지만 원래 run이 완료된 경우, `node scripts/observe-project-tool-run.mjs "<Kiro.exe 절대 경로>"`로 동일 synthetic root/run만 다시 관측할 수 있다. Core instance 일치, 실제 native command events, managed descriptor와 Kiro child의 결과 HTTP를 검증한다. 최초 실패 receipt를 보존하며 Agent 요청을 다시 시작하지 않는다.

- tool 검증은 checkout 밖 한글·공백 경로에서 기존 도구와 PATH에 Node/pnpm이 없는 환경을 각각 만든다. 합성 TypeScript 앱의 lock/frozen install/build/test/HTTP와 실제 executable을 확인한다. recovery 검증은 직전 검증기의 private 임시 cache만 사용한다.
- host 검증은 별도 Kiro profile에 VSIX 0.3.0과 검증 extension을 설치하고 합성 생성 workspace를 직접 연다. 실제 Builder shell의 명령·exit code·HTTP smoke를 수집한다. packaged ResultRuntimeSupervisor 실행은 별도 관측이며 합성 Task의 Core 완료 보고나 학습 Evidence를 만들지 않는다. 미설치 환경의 중간 조회 오류 후 성공 재관측과 초기 workspace 전환 host crash는 결과 보고서에 구분해 남겼다.
- `--without-project-tools`는 그 합성 Kiro process의 PATH에서 개발 도구를 제외한다. OS에 도구가 아예 없는 clean machine 검증은 W5다. Workspace Trust가 필요한 경우 Kiro의 기존 사용자 단계를 유지한다.
- 다운로드·준비 실패는 run 오류 code로 반환하며 Agent 요청을 성공으로 대체하거나 자동 재생하지 않는다. 도구 선택이 기존 발급 descriptor와 달라지면 임의 덮어쓰기 없이 `PROJECT_TOOLCHAIN_CHANGED_RESTART_REQUIRED`로 거절한다. 기존 도구 제거·경로 이동 뒤의 descriptor migration은 아직 지원하지 않는다.

## 남은 경계

Kiro/Agent source pin, Helper 별도 창, 사용자/Agent provenance와 lifecycle 경계는 W3를 유지한다. package script의 간접 OS 쓰기를 완전히 격리한 sandbox는 아니다. 생성 앱 runtime 확장, ARM64, 전체 clean install, Discovery→Builder 전환 안정성과 최종 frontend 출하 판정은 W5의 실제 결과가 필요하다.
