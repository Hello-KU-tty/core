# 예선 기간 승인·상태 메모 이력

이 문서는 예선 제출까지 `PROJECT_BRIEF.md`, `docs/SPEC.md`, `docs/ARCHITECTURE.md` 머리에 누적된 승인·상태 메모를 원문 그대로 옮긴 기록이다. 링크만 새 위치 기준으로 고쳤다. 현재 유효한 범위는 각 원 문서 본문과 `docs/DECISIONS.md`를 따른다.

## PROJECT_BRIEF.md 머리 메모

> Mac 보완 게시 승인: 사용자가 Mac0.1.3·관련 Core 수정·개발자 ZIP·문서를 기존 `Hello-KU-tty/core`에 `@hurdooagent` 권한으로 push하는 방식을 확인·승인했다. 아래 과거 push 금지는 이 범위에서 해제한다. Windows0.0.18 설치물·program 저장소·영상과 GitHub 조직/저장소 설정은 변경하지 않는다. 다운로드 경로를 유지하고 버전·hash·검증 범위를 명시한다.
> 실제 검증 재개 승인: 사용자가 이전에 제시한 격리 합성 폴더의 신뢰와 계정 누적2,000크레딧 이내 사용을 승인했다. Mac0.1.2 설치본으로 검증하며 시작·생성 프로젝트 폴더만 신뢰하고 profile/계정 저장 영역은 신뢰하지 않는다. 후속 승인으로 기존 Kiro 창은 정상 종료할 수 있으며, 저장하지 않은 변경·기존 자료 보존, 초과 과금 비활성·push 금지를 유지한다.
> 복구 보완 승인: 후속 감사의 Mac 업그레이드·이동된 프로젝트 복구, 설치본 native 검증, 제출 문서 정합성과 조직 소개 초안을 보완한다. 이번 결과는 로컬 commit까지만 수행하고 push·GitHub 설정/게시 변경은 하지 않는다. 실제 모델 검증은 현재 사용량과 정확한 합성 workspace Trust 승인을 확인한 경우에만 진행한다.
> 상태: 구현 전 승인된 입력 브리프
> 후속 승인: MVP/Task 완료는 Builder·Helper 대화의 종료가 아니다. 사용자는 같은 프로젝트에서 실행·설명·수정 요청을 계속 보낼 수 있다. 완료 기록과 workspace를 보존한 후속 작업, 정확한 도구 거부 표시를 구현·검증하고 새 VSIX의 Kiro 재시작 적용과 기존 GitHub 저장소 게시까지 수행한다.
> 2026-09-29 후속 승인: 사용자가 실행 환경 변경 후 기록된 Node/pnpm 재사용과 도우미 중복 답변 요약의 개선 또는 제거를 요청했다. 실제 Helper 답변·사용자 질문·내부 Evidence 기록은 유지하며, UI의 중복 요약 영역을 제거한다.
> 게시 승인: 사용자가 원격 최신 상태와 로컬 Mac 작업을 통합하고 Mac VSIX·개발자 ZIP·양쪽 README를 갱신한 뒤 commit/push하도록 승인했다. 후속 지시에 따라 공개 frontend 0.0.18(a61d408)과 대응 Core(7b35217)를 기준으로 한다. 기존 다운로드 URL은 유지하되 변경 버전·출처·검증 범위는 공개한다. 사용자 확인에 따른 실제 사용 인터뷰는 정성 근거이며 정량 학습 효과로 확대하지 않는다. 영상은 별도 담당 작업으로 보존한다.
> 2026-09-29 Mac 배포 승인: 사용자가 Mac 배포용 VSIX 생성을 요청했다. Windows VSIX는 Windows에서 별도로 만든다. 우선 darwin-arm64/Kiro 1.1.70의 설치 자산·Core 자동 기동을 구현하고 실제 검증 범위를 명시한다. Intel Mac과 공개 게시를 포함하지 않는다.
> 2026-09-29 제출 준비 후속: 사용자가 최신 프론트 인계를 기준으로 남은 작업 수행을 요청했다. 기존 승인된 Windows 제품 요구 안에서 현 PC의 kit 갱신·프론트 기능 회귀·설치 후보와 제출 자료를 준비한다. 9/28 Mac 작업의 Windows 제외는 당시 실행 한도이며, 이번 자동 검사/설치를 실제 native 업그레이드·사람 평가 완료로 확대하지 않는다.
> 2026-09-29 유지보수 승인: 프론트 B7~B11 보완에 포함해 broken pnpm 11.12.0 개발·생성 앱 pin을 11.13.1로 교체한다. Node 24.19.0·frozen install·권한 경계는 유지하며 과거 도구 실측 기록은 당시 사실로 보존한다.
> 작성 기준일: 2026-08-24
> 범위 갱신: 2026-09-07 사용자 승인으로 T19에 자체 Kiro IDE 패널의 Discovery·Spec·Builder·Helper·History 실제 연결과 frontend 로컬 실행 인계를 포함한다.
> 실험 승인: 2026-09-12 사용자는 별도 worktree에서 Kiro IDE 내장 Agent를 실행기로 쓰는 T19-N 실험을 승인했다. 기존 CLI/Crew 경로와 T19 Windows 완료 gate는 유지하며, 내장 경로의 지원·권한·Core 연결·stream·중지는 실측 전 제품 기능으로 간주하지 않는다.
> 수직 흐름 승인: 2026-09-12 사용자는 같은 분리 worktree에서 native Discovery부터 Builder 파일·Decision, Helper, 사용자 Evidence·Episode·Analyst와 다음 개인화까지 실제 Core 상태로 검증하도록 승인했다. 사람의 선택·발언은 명시적 합성 UI 입력으로만 대체하고 Agent 작성물로 이해 상태를 올리지 않는다. 기존 CLI/Crew 기본 경로와 Windows gate는 유지한다.
> 4시간 전환 판단 승인: 2026-09-15 사용자는 09:58~13:58 UTC 동안 득실 중심의 최소 실제 검증을 끝낸 뒤 IDE-only frontend 개발 전환·인계를 판단하도록 승인했다. 안전·데이터·provenance 경계는 유지하고 기존 CLI 코드는 즉시 삭제하지 않는다. 미실행 Windows·장기 안정성·정밀 CLI 비교는 미지원/미검증으로 분리하며, 실제 안전 또는 동작 실패는 전환 판단에서 숨기지 않는다. [4시간 계획](../../spikes/T19_NATIVE_IDE_ONLY_4H_CUTOVER_PLAN_20260915.md)을 따른다.
> 제품 설치 요구 갱신: 2026-09-23 사용자는 Windows 중심 실사용과 Kiro 확장 설치만으로 Core backend까지 자동 작동하는 경험을 필수로 명확히 했다. 기존 런타임 재사용과 필요한 도구의 조건부 자동 준비 방향을 승인했다. 다음 개발은 native recovery 기준에서 분기한 Windows 브랜치로 이어가며, 요구 승인과 Windows 실행 검증은 구분한다. [Windows 인계](WINDOWS_EXTENSION_HANDOFF_20260923.md)를 따른다.
> 제출 준비 재개: 2026-09-28 사용자는 백엔드와 별도 `vibe-helper-frontend` checkout을 함께 수정해 최종 제출을 준비하도록 승인했다. 프론트 변경은 기능 동작·성능 보완에 필요한 최소 범위로 제한하고 기존 디자인·흐름을 유지한다. 이번 작업에서는 Windows 전용 작업과 호환성 검증을 제외하며 macOS에서 실제 프론트를 연결해 검증한다. Windows 제품 요구 자체를 삭제하거나 Mac 결과를 Windows PASS로 표시하지 않는다. 중대한 Mac 호환성 장애는 사용자에게 보고한다.

## docs/SPEC.md 머리 메모

### 복구 보완

- Mac 생성 앱 Node는 확장 설치 폴더가 아닌 해시 검증된 private cache에서 실행한다. 기존 설치 경로를 가리키는 기록은 동일 제품의 상위 버전에서만 검증·이관한다. 외부 Node 교체·downgrade·변조 허용은 하지 않는다.
- 등록 프로젝트가 이동/삭제된 경우 해당 경로를 재생성하거나 자동 재연결하지 않는다. private 도구 기록과 공용 shim을 검증해 새 프로젝트 사용은 허용하며, 존재하는 workspace의 launcher 변조는 계속 거절한다.
- 문서의 과거 제출·검증 기록과 현재 정성 사용자 검증을 구분한다. 조직 소개는 로컬 게시 초안이며 이번 작업은 commit만 한다.

### 1. 상태(당시)

- 후속 실제 검증은 사용자 승인된 격리 폴더와 누적2,000크레딧 한도에서 Mac0.1.2 설치본의 수직 흐름을 확인한다. 신규 UI 호출은1,980 이상에서 중단하고 각 단계 전 최신 사용량을 관측한다. 과거900/880 한도는 당시 기록이며 이번 승인에만 새 한도를 적용한다. 실제 사람의 이해 평가로 계산하지 않는다.

- 승인 범위는 원격 동기화, 공개 frontend 0.0.18 기준 Mac 설치물과 재현 가능한 개발자 소스 ZIP, 실제 사용 인터뷰를 반영한 README 및 commit/push다. 링크 주소는 유지하고 내용의 버전·출처를 명시한다. 새 모델 호출·새 사용자 연구·영상 제작은 포함하지 않는다.

- 2026-09-29 사용자 요청으로 Mac 배포용 VSIX를 추가한다. 첫 대상은 darwin-arm64/Kiro 1.1.70이며 source checkout 없이 Core 자동 기동, 분리된 사용자 데이터와 생성 프로젝트 도구를 제공한다. Windows 설치물은 별도 Windows 작업으로 유지한다. 실제 Agent 완주는 패키징/모델0 검증과 구분한다.

- 2026-09-29 최신 프론트 인계 후속은 기존 Windows 제품 범위의 kit·pnpm 업그레이드·0.0.10 설치 후보와 실제 frontend 자동 검사를 포함한다. Spec 복귀는 기존 FR-DIS-013대로 저장 후보/입력을 보존하는 화면 이동이며, 새 Session 생성은 명시적 새 후보 요청으로 미룬다. [현재 제출 gate](SUBMISSION_READINESS_20260929.md).

- 2026-09-29 B7~B11 유지보수는 pnpm 11.13.1 exact pin, MCP 시작 진단, shell 실패 계약, 도구 표시 분류와 Builder 사용자 언어 정책을 포함한다. 실제 Windows/Kiro 재실측과 모델 응답 품질은 자동 fixture만으로 완료 판정하지 않는다.

- 2026-09-28 제출 준비 재개는 백엔드와 실제 프론트의 기능·성능 보완 및 macOS 검증을 포함한다. 프론트 디자인·흐름은 유지하며 Windows 전용 검사·패키징은 이번 실행에서 제외한다. 기존 Windows·실제 사용자 연구 acceptance는 별도 근거가 필요한 항목으로 남긴다.
- 상태: T00~T18 구현 완료, T19 자체 IDE 패널 연동 구현·검증 사용자 승인(2026-09-07), 진행 중. frontend 대상은 Windows이며 push는 별도 승인 대기다.
- 2026-09-23 사용자는 Windows 중심의 확장 단독 설치 경험과 런타임 재사용 방향을 승인했다. T19-W의 Core 자동 기동·패키징은 MVP 필수이며 실제 Windows 지원은 아직 미검증이다. [Windows 인계](WINDOWS_EXTENSION_HANDOFF_20260923.md)를 따른다.
- 2026-09-15의 마지막 4시간은 pin한 macOS Kiro 일반 profile에서 P3 Builder/late Helper 반복·확인된 Helper 취소 재사용·새 실제 Decision 해결/Builder 적용을 최소 실측한 뒤 IDE-only frontend 착수 가능 범위를 판정한다. 기존 CLI 구현은 삭제하지 않고 Windows·장기 안정성·정밀 CLI 비교를 완료로 간주하지 않는다. [판정 계획](../../spikes/T19_NATIVE_IDE_ONLY_4H_CUTOVER_PLAN_20260915.md)을 따른다.

이 문서는 제품 요구사항의 구현 기준이다. 완료된 기능과 예정된 구현의 검증 상태는 [TASKS.md](../../TASKS.md)에서 구분한다.


## docs/ARCHITECTURE.md 머리 메모

### Mac 도구 복구 경계

- `acquireCoreNode`는 검증된 Mac 설치 Node/라이선스를 private hash-addressed cache에 원자적으로 복사한다. 모든 재사용에서 byte hash를 검사하고 실행 probe를 유지한다.
- 이전 bundled Node 기록은 같은 확장의 단조 증가 버전과 정확한 이전 `portable/bin/node` 경로에 한해 새 cache descriptor로 정규화한다. shared shim·workspace launcher·descriptor의 중간 상태는 정확한 이전/새 바이트만 허용한다.
- 사라진 workspace는 canonical한 가장 가까운 부모와 ENOENT를 확인한 뒤 도구 선택에만 기록을 재사용한다. 임의 경로 검색·프로젝트 이동·source 수정·기록 삭제는 하지 않는다. 존재하는 링크/비공개 권한 위반·변조는 복구 근거가 아니다.

### 1. 상태(당시)

- native 검증은 수정하지 않은 Mac0.1.2 VSIX와 격리 Kiro profile을 사용한다. 제품의 기본 global storage/Core/workspace 경로와 별도 Helper 창을 유지한다. 개발 harness의900/880 admission을 우회하거나 제품 결과로 혼동하지 않으며 실제 계정 dashboard를 단계별 관측한다. 계정 자료를 복사하지 않는다.

- 배포 갱신은 명시적으로 지정한 frontend checkout에서 Mac 확장을 빌드하고 Core와 frontend 출처를 receipt에 남긴다. 개발자 ZIP은 오래된 부분 덮어쓰기 kit 대신 두 저장소 소스와 프론트의 검증된 기존 Windows portable 자산을 포함한 재현용 snapshot이다. Mac portable은 공식 arm64 Node를 포함해 별도로 빌드한다. 기존 URL은 호환 진입점이며 불변 artifact 식별자는 버전·SHA-256으로 구분한다.

- 2026-09-29 Mac VSIX는 기존 frontend provider·Core lease lifecycle·native worker를 재사용한다. darwin-arm64 자산 검증과 Mac 도구 경로를 추가하며 Node 공식 배포본과 라이선스를 포함해 Homebrew/source checkout 의존을 없앤다. SQLite·prompt·권한 계약은 유지한다.

- 2026-09-28 통합 개선은 별도 `vibe-helper-frontend` checkout의 기존 port/controller/webview를 그대로 사용한다. Mac 검증에서는 현재 Windows portable 자산을 실행·변조하지 않고 검증된 Mac source runtime과 동일 HTTP/SSE 계약을 사용할 수 있는지 먼저 확인한다. 개발 검증용 연결과 Windows 제품 설치 지원은 구분한다.
- 상태: 사용자 승인 완료, T18 Campus Drop Golden Path 구현 및 검증 완료
- T03 versioned contract와 Agent/UI runtime validation, T04 pure reducer와 Evidence policy v1.0.0, T05 SQLite schema/repository/migration, T06 application use case와 역할 고정 MCP server, T07 criterion 기반 evaluation contract와 harness, T08 Candidate loop, T09 Discovery와 Learning Spec, T10 native workspace lifecycle, T11 Builder와 Decision gate, T12 bounded Helper context, T13 Evidence Analyst와 durable Analysis Job, T14 Crew backend와 session restore, T15 Discovery/Spec UI, T16 conversation-first Agent Mode, T17 Evidence Trace와 다음 대화 개인화, T18 hidden Analyst worker·local result runtime·optional Final Upgrade까지 구현됐다.
- 2026-09-07 T19 범위는 자체 IDE 패널의 Discovery·Spec·Builder·Helper·History 실제 연결과 frontend 로컬 실행 인계로 갱신됐다. [상세 구현 계획](T19_IMPLEMENTATION_PLAN.md)의 구현·검증은 승인됐고 진행 중이다. frontend 대상은 Windows native 실행이며 push는 별도 승인 대상이다. 아래 새 transport 설계의 실제 capability는 아직 검증 중이다.
- 2026-09-15 사용자는 [4시간 IDE-only 전환 판단](../../spikes/T19_NATIVE_IDE_ONLY_4H_CUTOVER_PLAN_20260915.md)을 승인했다. 이는 pin한 macOS Kiro의 native adapter를 IDE frontend의 우선 개발 seam으로 쓸지 판단하는 범위이며, deterministic Core와 기존 CLI adapter를 삭제하거나 Windows/장기 안정성을 소급 승인하지 않는다.
- 2026-09-23 Windows 우선·확장 단독 설치 경험을 승인했다. 2026-09-24 W2/W3에서 portable runtime과 extension-managed Core lifecycle, Windows 실제 Discovery·별도 창 Helper를 검증했다. W4는 기존/미설치 도구 환경의 native Builder와 결과 HTTP를 검증했다. 아래 11.4절의 clean 설치 전체 흐름과 출하 안정성은 W5 gate로 남는다.

