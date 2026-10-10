// Model-0 visual/keyboard check of the REAL program HTML/CSS/webview bundle.
// Only the VS Code message transport is a static fixture. No Core connection,
// credentials, model API, persisted user input or external network is present.
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

if (process.versions.node.split('.')[0] !== '24') throw new Error('NODE_24_REQUIRED')
const program = resolve(process.argv[2] ?? '')
const pkg = JSON.parse(await readFile(join(program, 'package.json'), 'utf8'))
if (pkg.name !== 'builder-helper-agent-panel') throw new Error('PROGRAM_CHECKOUT_REQUIRED')
const parent = resolve('.data/frontend-accessibility')
await mkdir(parent, { recursive: true, mode: 0o700 })
const stage = await mkdtemp(join(parent, 'preview-'))
await build({
  entryPoints: [join(program, 'src/agent-panel-view-provider.ts')],
  outfile: join(stage, 'provider.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  plugins: [
    {
      name: 'fixture-vscode',
      setup(builder) {
        builder.onResolve({ filter: /^vscode$/ }, () => ({ path: 'vscode', namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: 'module.exports = {}',
          loader: 'js',
        }))
      },
    },
  ],
})
const bundled = await build({
  entryPoints: [join(program, 'src/webview/main.ts')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  write: false,
})
const js = bundled.outputFiles[0].contents
const { buildWebviewHtml } = createRequire(import.meta.url)(join(stage, 'provider.cjs'))
const startSnapshot = {
  phase: 'discovery_start',
  project: null,
  input: null,
  previewRound: null,
  rounds: [],
  enrichedCandidates: [],
  basket: [],
  selectedCandidate: null,
  spec: null,
  preparedTask: null,
  discoveryInProgress: false,
  specInProgress: false,
  notice: null,
  history: [],
  historyLoading: false,
  flowSupport: {
    mode: 'unavailable',
    experimental: true,
    reason: 'NATIVE_CREDIT_OBSERVATION_REQUIRED',
  },
}
const candidatesSnapshot = {
  ...startSnapshot,
  phase: 'discovery_workspace',
  project: {
    id: 'project_synthetic',
    title: '키보드 검증',
    learningGoal: '배열 변환',
    status: 'DISCOVERY',
  },
  flowSupport: { mode: 'mock', experimental: false },
  previewRound: {
    discoverySessionId: 'session_synthetic',
    generationRationale: '접근성 검증용 고정 후보이며 실제 모델 생성 결과가 아닙니다.',
    previews: Array.from({ length: 10 }, (_, i) => ({
      candidateId: `candidate_synthetic_${i + 1}`,
      position: i + 1,
      title: `검증 후보 ${i + 1}`,
      summary: '키보드로 선택과 다듬기 입력을 확인합니다.',
      coreInteraction: '배열 필터링',
      appeal: '작은 예제',
      technologyNecessity: 'TypeScript',
      generationTags: ['DIRECT'],
    })),
  },
}
const snapshots = new Map([
  ['/', startSnapshot],
  ['/candidates', candidatesSnapshot],
])
const nonce = 'model0-accessibility-fixture'
const fixtureFor = (snapshot) => `const snapshot = ${JSON.stringify(snapshot)};
function sendSnapshot(action) {
    window.postMessage({ type: 'hydrateFlow', snapshot }, location.origin);
    window.postMessage({ type: 'flowNotice', surface: 'discovery', kind: 'info', message: '모델 0회 접근성 검증 화면 — 실제 프론트 렌더러 / 고정 상태. 모델·Core 연결 없음.' + (action ? ' 입력 전달: ' + action : '') }, location.origin);
}
window.acquireVsCodeApi = () => ({ postMessage(message) {
  if (message.type === 'refreshHistory') sendSnapshot();
  if (message.type === 'toggleBasket') {
    const key = message.ref.candidateId + ':' + message.ref.revision;
    snapshot.basket = snapshot.basket.includes(key) ? snapshot.basket.filter(item => item !== key) : [...snapshot.basket, key];
    sendSnapshot(message.type);
  }
  if (['submitRefinement', 'selectCandidate'].includes(message.type)) sendSnapshot(message.type);
} });
window.addEventListener('DOMContentLoaded', () => sendSnapshot(), { once: true });`
const theme =
  '<style>:root{--vscode-foreground:#ddd;--vscode-descriptionForeground:#b8b8b8;--vscode-editor-background:#1e1e1e;--vscode-input-background:#313131;--vscode-input-foreground:#fff;--vscode-focusBorder:#6ca8ff;--vscode-panel-border:#555;--vscode-font-family:system-ui;--vscode-font-size:14px}body{background:#1e1e1e}#app{max-width:400px;margin:auto}</style>'
const server = createServer((request, response) => {
  if (request.method !== 'GET') {
    response.writeHead(405).end()
    return
  }
  if (request.url === '/webview.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }).end(js)
    return
  }
  const snapshot = snapshots.get(request.url)
  if (!snapshot) {
    response.writeHead(404).end()
    return
  }
  const html = buildWebviewHtml('/webview.js', "'self'", nonce)
    .replace('</head>', `${theme}</head>`)
    .replace(
      '<div id="app"></div>',
      `<div id="app"></div><script nonce="${nonce}">${fixtureFor(snapshot)}</script>`,
    )
  response
    .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    .end(html)
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
console.log(
  JSON.stringify({
    status: 'MODEL_0_PREVIEW',
    url: `http://127.0.0.1:${server.address().port}/`,
    stage,
  }),
)
process.on('SIGINT', () => {
  server.closeAllConnections()
  server.close()
})
process.on('SIGTERM', () => {
  server.closeAllConnections()
  server.close()
})
