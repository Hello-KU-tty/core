# W5 Windows 프로세스 범위 shell integration 검증

## 환경과 범위

현재 PC는 사용자가 Kiro부터 새로 설치한 clean Windows 환경이다. 초기 상태와 이후 준비한 임시 검증 도구를 구분한다. Kiro 1.1.70 / Agent 1.1.158, VSIX 0.3.11에서 검증했다. 일반 profile·registry·전역 PATH·TrustedPublisher·방화벽은 변경하지 않았다.

합성 Kiro의 자식 환경에만 `PSExecutionPolicyPreference=RemoteSigned`를 전달했다. [Microsoft 문서](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1)의 Process 범위이며 영구 정책 변경이 아니다. 전후 별도 기본 PowerShell에서 effective Restricted, MachinePolicy/UserPolicy/CurrentUser/LocalMachine/Process 모두 Undefined를 확인했다. 검증 자식에서만 Process와 effective가 RemoteSigned였다.

## 모델 없는 실제 terminal 관측

- Kiro stable terminal shell integration API가 준비되어 명령 출력과 종료 이벤트를 반환했다.
- 정책 조회, 일반 출력, batch 코드페이지 전환·복원, 전환 뒤 출력은 종료 코드 0이었다.
- 의도한 `cmd /d /c exit 7`은 종료 코드 1로 전달됐다. 처음 exact 7을 기대한 검사는 FAIL로 보존했다.
- 설치된 `shellIntegration.ps1`은 `$FakeCode = [int]!$global:?`로 성공/실패를 0/1로 전송한다. 해당 소스 hash를 고정한 읽기 전용 재평가에서 성공 0·실패 nonzero 구분과 출력 수신은 PASS다. 정확한 native 종료 코드 7 보존을 주장하지 않는다.
- 스크립트 SHA-256: `cc0e9dae2ef39261a53dd69477fd01600e2c2ef7a0bc619af72b2b35a020a081`.
- 로컬 receipt: `dist/windows-process-shell-receipt.json`(최초 엄격 검사 FAIL), `dist/windows-process-shell-assessment.json`(동일 관측의 성공/실패 판정 PASS). 모델 호출 0회다.

## 원본 Task 복구 완료

14번째 실패의 SHA-256 `6ed326b0397bd40bbee5836f0c5579eb692565333fd47c65e49ea1f2a85ab75e`를 보존하고 새 Builder 요청 15와 Helper 요청 16을 보냈다. 이전 요청·Decision 선택은 재전송하지 않았다.

- 실제 Builder가 원본 workspace에서 frozen install, build, typecheck, 17 tests, HTTP smoke를 각각 실행해 출력과 종료 코드 0을 확인했다.
- Task COMPLETED, Core completion report 존재, 기존 Decision 적용 1건을 확인했다. 성공한 복사본 결과로 완료를 대신하지 않았다.
- 설치된 SDK의 결과 실행 HTTP 200, 1,188 bytes; 분석 3건 SUCCEEDED; 후속 Helper 성공.
- 질문과 이유 없는 선택에 USER_UNDERSTANDING Evidence는 0, Concept State는 OBSERVED를 유지했다. 후속 Helper에는 EVIDENCE_AWARE context의 근거 3개가 전달됐다. 이것이 실제 사람의 이해 향상을 뜻하지 않는다.
- History 조회와 복원은 새 run을 만들지 않았다.

## 후속 재현

검증용 Kiro와 driver는 일반 사용자 profile과 분리한다. 원본 복구는 fresh 완주로 세지 않는다. 새 Personal Need 유무 흐름은 각각 새 receipt와 최대 12회 명시적 native 요청으로 검증한다.

```powershell
node scripts/test-managed-host.mjs '<Kiro.exe>' --vertical --without-project-tools --personal-need --hold --kiro-1170-diagnostic --process-shell-integration --clean-windows-user-confirmed --reuse '<기존 합성 root>'
```

`--personal-need`를 제외하면 다른 새 입력을 사용한다. `--clean-windows-user-confirmed`는 사용자 확인의 provenance만 기록하며 제품 흐름 PASS를 생성하지 않는다. `--process-shell-integration`은 진단 수직 검증에만 허용되고 effective 및 영구 정책 불변을 먼저 확인한다.

일반 1.1.70 지원은 아직 debug Cloud 증거에 의존한다. 현재 진단 완주와 확장 설치만으로 자동 준비되는 일반 배포 완료는 구분한다. 양쪽 fresh 결과와 제품 지원 판정은 후속 기록으로 갱신한다.
