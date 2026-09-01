export type BuilderStreamKind =
  | 'MESSAGE'
  | 'TOOL_CALL'
  | 'FILE_CHANGE'
  | 'TEST_RESULT'
  | 'ERROR'
  | 'STATUS'

export interface BuilderStreamEvent {
  readonly sequence: number
  readonly kind: BuilderStreamKind
  readonly summary: string
  readonly transient: true
  readonly redactionStatus: 'VERIFIED_REDACTED'
}

const SECRET_ASSIGNMENT =
  /\b(api[_-]?key|access[_-]?token|auth[_-]?token|password|secret)\b\s*[:=]\s*["']?[^\s,"']+/gi
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi
const USER_PATH = /\/Users\/[^/\s"']+(?:\/[^\s"']*)?/g

export function redactBuilderStreamText(text: string, workspaceRoot?: string): string {
  let redacted = text
    .replace(SECRET_ASSIGNMENT, '$1=[REDACTED]')
    .replace(BEARER_TOKEN, 'Bearer [REDACTED]')
  if (workspaceRoot !== undefined) redacted = redacted.split(workspaceRoot).join('[WORKSPACE]')
  return redacted.replace(USER_PATH, '[REDACTED_PATH]')
}

function classify(value: unknown): BuilderStreamKind {
  if (typeof value !== 'object' || value === null) return 'ERROR'
  const event = value as Record<string, unknown>
  const marker =
    `${String(event.type ?? event.event ?? event.kind ?? '')} ${JSON.stringify(event)}`.toLocaleLowerCase(
      'en-US',
    )
  if (marker.includes('error')) return 'ERROR'
  if (marker.includes('node --test') || marker.includes('pnpm test')) return 'TEST_RESULT'
  if (marker.includes('fs_write') || marker.includes('file_change') || marker.includes('diff')) {
    return 'FILE_CHANGE'
  }
  if (marker.includes('tool')) return 'TOOL_CALL'
  if (marker.includes('message') || marker.includes('assistant') || marker.includes('content')) {
    return 'MESSAGE'
  }
  return 'STATUS'
}

export function normalizeBuilderStreamLine(
  line: string,
  sequence: number,
  workspaceRoot?: string,
): BuilderStreamEvent {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    parsed = { type: 'error', summary: 'Builder emitted an invalid stream event.' }
  }
  return {
    sequence,
    kind: classify(parsed),
    summary: redactBuilderStreamText(JSON.stringify(parsed), workspaceRoot).slice(0, 4_000),
    transient: true,
    redactionStatus: 'VERIFIED_REDACTED',
  }
}
