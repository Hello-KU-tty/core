// Creates a reviewed source bundle; does not upload or change existing releases.
import { cp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inventory, sha256 } from '../examples/frontend-handoff/archive.mjs'
import { loadCoreResources } from '../packages/runtime/dist/portable-core.js'
import { archiveMacos } from './archive-macos.mjs'
import { createSourceCandidate, safeName } from './create-source-candidate.mjs'

if (!process.argv[2]) throw new Error('EXPLICIT_FRONTEND_CHECKOUT_REQUIRED')
const backend = dirname(dirname(fileURLToPath(import.meta.url)))
const frontend = await realpath(resolve(process.argv[2]))
const candidate = await createSourceCandidate(backend, frontend)
const root = candidate.root
const manifest = JSON.parse(await readFile(join(root, 'SOURCE_MANIFEST.json'), 'utf8'))
const portable = await loadCoreResources(join(frontend, 'portable'))
if (portable.manifest.target !== 'win32-x64') throw new Error('EXPECTED_FRONTEND_WINDOWS_KIT')
const assets = await inventory(portable.root)
const expected = [...Object.keys(portable.manifest.files), 'manifest.json'].sort()
if (JSON.stringify(assets.map((file) => file.name).sort()) !== JSON.stringify(expected))
  throw new Error('PORTABLE_EXTRA_FILES_DENIED')
// Validate the copied SDK/runtime kit, without executing Windows binaries on Mac.
const kitBytes = await readFile(join(frontend, '.vibe-helper-kit.json'))
const kit = JSON.parse(kitBytes)
for (const [name, hash] of Object.entries(kit.managedFiles)) {
  const sourceName = name.startsWith('portable/') ? name.slice('portable/'.length) : name
  const allowed = name.startsWith('portable/') ? expected.includes(sourceName) : safeName(name)
  if (!allowed || sha256(await readFile(join(frontend, name))) !== hash)
    throw new Error('FRONTEND_KIT_HASH_MISMATCH')
}
await cp(portable.root, join(root, 'frontend/portable'), { recursive: true })
await writeFile(join(root, 'frontend/.vibe-helper-kit.json'), kitBytes, { flag: 'wx' })
for (const side of ['backend', 'frontend']) {
  const source = manifest.repositories[side]
  await writeFile(
    join(root, side, 'source-info.json'),
    `${JSON.stringify({ baseCommit: source.baseCommit, workingTreeChangesIncluded: source.workingTreeChangesIncluded }, null, 2)}\n`,
  )
  source.files = await inventory(join(root, side))
}
manifest.status = 'DEVELOPER_SOURCE_SNAPSHOT'
manifest.published = false
manifest.frontendKitVersion = kit.kitVersion
manifest.windowsPortableIncluded = true
manifest.remainingGates = [
  'Fresh Mac VSIX native model end-to-end and long-term use are not packaging tests.',
  'Qualitative user interviews do not establish comparative learning effectiveness.',
]
await writeFile(join(root, 'SOURCE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(
  join(root, 'README.md'),
  `# Hello Vibe 개발자 소스 — 2026-09-30

기존 부분 update kit이 아닌 backend/ + frontend/ 전체 실행 소스 snapshot입니다.
이전 checkout에 덮어쓰지 말고 새 폴더에 압축을 푸세요. ZIP은 VSIX가 아닙니다.
SOURCE_MANIFEST.json의 두 저장소 baseCommit과 모든 파일 SHA-256을 확인하세요.
workingTreeChangesIncluded=true이면 baseCommit 이후 변경도 포함합니다.
Git 기록, DB, 계정/연결 정보, 대화, 개발 node_modules, 영상·제출 자료는 제외했습니다.
Windows portable의 manifest로 검증된 runtime dependencies와 라이선스는 포함합니다.
일부 과거 문서 링크의 대상은 생략되어 있습니다. LICENSE/고지는 보존하세요.

## 도구와 검사

Node.js 24.x와 pnpm 11.13.1 이상 11.x를 준비합니다(권장 24.19.0 / 11.13.1).
frontend/: npm ci --ignore-scripts && npm run typecheck && npm test && npm run build
backend/: pnpm install --frozen-lockfile && pnpm exec playwright install chromium && pnpm check
backend/: pnpm panel:build && node scripts/test-program-consumer.mjs ../frontend
이 자동 검사는 모델을 호출하지 않습니다.

## Mac (Apple Silicon) VSIX

backend/: pnpm panel:pack:macos ../frontend
dist/macos-vsix-*/ 아래 darwin-arm64.vsix를 Kiro의 Install from VSIX로 설치합니다.
빌드 중 공식 Node arm64 배포본을 hash 확인 후 포함하며 네트워크가 필요합니다.
node scripts/test-macos-package.mjs 로 Core/SQLite/도구 모델0 검사를 실행합니다.

## Windows (x64) VSIX

frontend/: node ../backend/examples/frontend-handoff/package-program.mjs .
Windows에서만 실행하며 앞서 npm build를 마쳐야 합니다. 포함된 Windows portable은
공개 frontend의 kit ${kit.kitVersion} 원본입니다. 최신 backend를 Windows portable로
다시 빌드했다는 뜻이 아닙니다. Mac runtime은 위 명령으로 따로 빌드합니다.

## 범위

Kiro IDE 1.1.70 / Agent 1.1.158 기준입니다. frontend는 공개 0.0.18 소스이며
완료 후 지속 대화, 도구 재사용과 Helper 중복 요약 제거 변경을 포함합니다.
설치·자동 검사와 실제 모델 완주·사용자 정성 인터뷰·정량 효과는 별개입니다.
자세한 설치와 한계는 backend/docs/DOWNLOAD_GUIDE.md와 MAC_VSIX.md를 확인하세요.
`,
)
await mkdir(join(backend, 'dist'), { recursive: true })
const file = join(candidate.parent, 'hello-vibe-developer-source-20260930.zip')
const archive = await archiveMacos(root, file)
const report = {
  file,
  sourceRoot: root,
  status: manifest.status,
  createdAt: manifest.createdAt,
  bytes: archive.bytes,
  sha256: archive.sha256,
  files: archive.files.length,
  sources: Object.fromEntries(
    Object.entries(manifest.repositories).map(([side, source]) => [
      side,
      {
        baseCommit: source.baseCommit,
        workingTreeChangesIncluded: source.workingTreeChangesIncluded,
      },
    ]),
  ),
  frontendKitVersion: kit.kitVersion,
  modelCalls: 0,
}
await writeFile(join(candidate.parent, 'receipt.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report))
