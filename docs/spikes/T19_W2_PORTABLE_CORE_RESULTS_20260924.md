# T19-W2 Windows portable Core 결과

> 2026-09-24 · **W2 완료**, W3 다음 착수. [계획](../T19_W2_PORTABLE_CORE_PLAN.md), [adapter 인계](../T19_W2_PORTABLE_CORE_HANDOFF.md), [sanitized receipt](T19_W2_PORTABLE_RECEIPTS_20260924.json).
> W2는 Core/bridge 배포 자산과 runtime 준비 검증이다. Windows native Agent 전체 기능, 확장 자동 연결과 clean 설치 완료를 뜻하지 않는다. 이번 모델 호출은 **0회**다.

## 구현과 실측

| 항목 | 결과 |
| --- | --- |
| 지원 target | win32-x64. ARM64/다른 OS의 새 portable package는 미지원 |
| Kiro child | 설치 Kiro 1.1.14의 Node 24.18.0/Electron 42.7.0/NAPI 10, `ELECTRON_RUN_AS_NODE=1` PASS |
| 기존 Node | 공식 Node 24.19.0/NAPI 10 PASS. Kiro 실패 시 fallback 관측 |
| managed Node | 공식 HTTPS 다운로드, pinned SHA-256, Node 24.19.0/NAPI 10 PASS |
| runtime probe | 세 후보 모두 SQLite disk transaction·rollback·한글 값·reopen/quick_check PASS |
| checkout 없는 실행 | repository 밖 한글/공백 package/data path, child cwd도 외부 경로, PATH는 Windows system directory만 제공. 개발 node_modules 없이 세 runtime의 packaged Core/SDK/bridge PASS |
| Core persistence | 실제 migration·인증된 SDK·합성 Project 생성·종료/reopen·같은 Project/Discovery 복원 PASS |
| stdio MCP | 각 runtime에서 initialize/catalog/실제 `get_discovery_context`, 다른 Project scope와 허용되지 않은 도구 거절 PASS |
| 취소/revoke | Core run 취소, binding `REVOKED`, 후속 MCP 거절, IPC 정상 종료 PASS |
| resource 경계 | 수정 prompt, extra file, manifest traversal, hardlink, junction 거절 PASS |
| Windows ACL | 현재 owner의 private root 생성/검사, 상속된 permissive directory 거절 PASS |
| acquisition 실패 | offline, network error, wrong hash, 초과 크기, AbortSignal 취소, completion marker 부재, 재시도 PASS |
| acquisition 경쟁/중단 | active owner lock 거절; 종료한 실제 child PID의 lock만 explicit recovery PASS |
| cache | offline 재사용 시 download 0회, 손상 cache quarantine, 같은 공식 binary로 명시적 재시도 PASS |
| VSIX | win32-x64 identity, 67 entries allowlist, archive reopen으로 모든 entry size/hash 대조 PASS |

Core run은 모델을 기다리는 실제 native relay를 만들고 deterministic MCP 읽기·거절·취소를 검증했다. Candidate 생성/Spec/Builder/Helper 모델 성공을 seed 또는 mock으로 대체한 결과가 아니다. 재시작 뒤 preview가 없는 상태도 그대로 확인했다.

## 실제 artifact 크기

| artifact | bytes |
| --- | ---: |
| Core resource package: manifest 포함, 60개 payload 파일 | 5,454,089 |
| Windows VSIX 압축 파일 | 1,875,725 |
| VSIX 설치 후 extension 파일 합계 | 5,482,884 |
| 조건부 Node executable 다운로드 | 92,825,416 |
| Node LICENSE (VSIX에 이미 포함) | 160,552 |

VSIX SHA-256: `c2f8daceff3e896038a06906b0d02e1f1a026331d845527f5dfe958a158bd82b`.

Node executable SHA-256: `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`. 필요한 경우에만 다운로드한다. 압축 ZIP 약 37.3MB보다 download bytes가 크며, archive extraction을 추가하지 않는 대신 선택한 tradeoff다. 전체 cache에는 완료 marker, 진단 probe/중단 staging이 추가된다. W4 생성 앱 의존성·W5 RSS/clean 설치 시간은 미측정이다.

SQLite runtime JS, win32-x64 native binary 하나, Drizzle runtime bundle, SQL/journal, 네 canonical prompt, guard/worker/SDK와 license를 포함한다. source checkout·compiler·type/test/source map·다른 플랫폼 binary·DB/token·개인 절대 경로는 포함하지 않는다. 개발용 native capability probe는 esbuild input 단계에서도 제외했으며 검사 실패 시 build를 멈춘다. Drizzle npm 배포물에 없던 Apache license는 [동일 공식 tag](https://raw.githubusercontent.com/drizzle-team/drizzle-orm/0.45.2/LICENSE)에서 확보했다.

## 회귀와 실패 기록

- `pnpm check`: exit 0. format/lint/typecheck/db, unit **91**, integration **272 + 기존 skip 1**, eval **34**, Campus Drop **3**, smoke **6**, Chromium E2E **12** PASS.
- `pnpm panel:build`: PASS. 기존 Mac panel artifact build 보존.
- 관련 native panel CJS와 receipt suite: **19 passed**. 최종 legacy probe 제외 변경 뒤 관련 native-client/runtime test **44 passed**.
- `pnpm panel:pack:windows`: PASS. `pnpm test:portable "<Kiro.exe>"`: 실제 Windows **11개 receipt 그룹 PASS**. private 합성 디렉터리만 사용하며 사용자 설치/환경 변수 전역 값/IDE 설정은 바꾸지 않았다.
- pnpm dependency/lockfile/lifecycle 허용 목록과 Agent prompt 정책/version은 변경하지 않았다. W1에서 frozen 설치한 개발 도구를 재사용했다.

구현 중 type narrowing, Drizzle의 export하지 않는 package.json 경로·누락 license, resource license 파일명의 `@`, .NET Compression assembly 로딩을 고쳤다. package 검사 중 한 차례 canonical/link gate가 실패했으며 경로 검사를 우회하지 않았다. 후속 경로 검사와 완성된 artifact의 반복 검증은 통과했다. 관련 과거 receipt test가 POSIX 실험 root를 Windows에서도 허용한다고 가정한 실패는 실제 Windows의 거절 기대값으로 수정했고, 원래 제품 gate를 열지 않았다.

## 남은 작업

- W3: 자동 activate/Core lifecycle/다중 창·crash·rotation·update, Windows source-attested native worker, Helper 동시성/UX, frontend 통합. W2 VSIX는 명시적 runtime 진단만 제공하는 integration artifact다.
- W4: 생성 앱용 Node/pnpm과 실제 Agent shell/result launcher 전달.
- W5: 개발 source/Node/pnpm 없는 clean Windows에 최종 확장 하나만 설치하고 실제 전체 수직 흐름·업데이트·장기 저장 복원 검증.
- 기존 T19 `[-]`, T19-N `[~]`, Evidence 의미 품질 한계와 W1 한 창 Helper 미지원은 유지한다. 추가 live 모델 turn·commit/push·VSIX IDE 설치·공개 배포는 수행하지 않았다.
