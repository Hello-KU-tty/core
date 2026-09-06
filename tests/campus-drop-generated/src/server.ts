import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'

import { CampusDropStore, MAX_FILE_BYTES } from './core.js'

const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 0)
const dataDirectory =
  process.env.CAMPUS_DROP_DATA_DIR ?? join(process.cwd(), '.vibe-helper', 'runtime-data')

if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new TypeError('Campus Drop requires HOST=127.0.0.1 and a valid dynamic PORT.')
}

const store = await CampusDropStore.open(dataDirectory)

function send(response: ServerResponse, status: number, body: string, contentType: string): void {
  response.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  send(response, status, JSON.stringify(value), 'application/json; charset=utf-8')
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.byteLength
    if (size > MAX_FILE_BYTES * 2) throw new RangeError('PAYLOAD_TOO_LARGE')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function decodeBase64(value: string): Uint8Array {
  const maxEncodedLength = Math.ceil(MAX_FILE_BYTES / 3) * 4
  if (
    value.length < 4 ||
    value.length > maxEncodedLength ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new TypeError('INVALID_BASE64')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) throw new TypeError('INVALID_BASE64')
  return bytes
}

const page = `<!doctype html>
<html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Campus Drop</title><style>body{font:16px system-ui;max-width:42rem;margin:4rem auto;padding:1rem}label,button{display:block;margin:.8rem 0}output{white-space:pre-wrap}</style>
<h1>Campus Drop</h1><p>작은 파일을 개인 기기로 한 번만 받을 수 있는 만료 링크로 옮깁니다.</p>
<label>파일 <input id="file" type="file"></label><label>유효 시간 <select id="ttl"><option value="300">5분</option><option value="900">15분</option></select></label>
<button id="send">일회용 링크 만들기</button><output id="result"></output>
<script type="module">send.onclick=async()=>{const f=file.files[0];if(!f)return;const b=new Uint8Array(await f.arrayBuffer());let s='';for(const x of b)s+=String.fromCharCode(x);const r=await fetch('/api/uploads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filename:f.name,contentBase64:btoa(s),ttlSeconds:Number(ttl.value)})});result.textContent=JSON.stringify(await r.json(),null,2)}</script>`

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${host}:${String(port)}`)
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok' })
      return
    }
    if (request.method === 'GET' && url.pathname === '/') {
      send(response, 200, page, 'text/html; charset=utf-8')
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/uploads') {
      const body = await readJson(request)
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new TypeError('INVALID_UPLOAD')
      }
      const input = body as Record<string, unknown>
      if (
        typeof input.filename !== 'string' ||
        typeof input.contentBase64 !== 'string' ||
        typeof input.ttlSeconds !== 'number'
      ) {
        throw new TypeError('INVALID_UPLOAD')
      }
      const bytes = decodeBase64(input.contentBase64)
      const transfer = await store.create({
        filename: input.filename,
        bytes,
        ttlSeconds: input.ttlSeconds,
        now: Date.now(),
      })
      sendJson(response, 201, {
        transferId: transfer.id,
        downloadUrl: `/d/${transfer.token}`,
        expiresAt: new Date(transfer.expiresAt).toISOString(),
        policy: 'ONE_TIME',
      })
      return
    }
    if (request.method === 'GET' && url.pathname.startsWith('/d/')) {
      const token = url.pathname.slice(3)
      const result = await store.consume(token, Date.now())
      if (!result.ok) {
        sendJson(response, result.reason === 'NOT_FOUND' ? 404 : 410, { error: result.reason })
        return
      }
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
        'content-length': result.bytes.byteLength,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      response.end(result.bytes)
      return
    }
    sendJson(response, 404, { error: 'NOT_FOUND' })
  } catch (error) {
    sendJson(response, error instanceof RangeError ? 413 : 400, {
      error: error instanceof Error ? error.message : 'INVALID_REQUEST',
    })
  }
})

const close = (): void => {
  server.close(() => store.close())
}
process.once('SIGINT', close)
process.once('SIGTERM', close)
server.listen(port, host)
