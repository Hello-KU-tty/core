import { redactSensitiveText } from '@vibe-helper/application/redaction'

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

export function redactBuilderStreamText(text: string, workspaceRoot?: string): string {
  return redactSensitiveText(text, workspaceRoot)
}

function classify(value: unknown): BuilderStreamKind {
  if (typeof value !== 'object' || value === null) return 'ERROR'
  const event = value as Record<string, unknown>
  const marker = String(event.type ?? event.event ?? event.kind ?? '').toLocaleLowerCase('en-US')
  const command = typeof event.command === 'string' ? event.command : ''
  if (marker.includes('error') || marker.includes('failed')) return 'ERROR'
  if (/^(?:node --test|pnpm test|npm test)(?:\s|$)/.test(command)) return 'TEST_RESULT'
  if (marker.includes('file_change') || marker.includes('file-change') || marker === 'diff') {
    return 'FILE_CHANGE'
  }
  if (marker.includes('tool')) {
    return command.includes('fs_write') || command.includes('write') ? 'FILE_CHANGE' : 'TOOL_CALL'
  }
  if (marker.includes('message') || marker.includes('assistant')) {
    return 'MESSAGE'
  }
  return 'STATUS'
}

function parsedRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function unwrapNestedTransportEvent(value: Record<string, unknown>): Record<string, unknown> {
  const content = value.content
  if (typeof content !== 'string') return value
  return parsedRecord(content) ?? value
}

function transportMarker(value: Record<string, unknown>): string {
  return `${String(value.type ?? value.event ?? value.kind ?? '')} ${String(value.cls ?? '')}`
    .trim()
    .toLocaleLowerCase('en-US')
}

function isInternalTransportEvent(value: Record<string, unknown>): boolean {
  const marker = transportMarker(value)
  return (
    marker.includes('chunk') ||
    marker.includes('context_usage') ||
    marker.includes('context-usage') ||
    marker === 'done' ||
    (typeof value.slot === 'string' &&
      typeof value.used_tokens === 'number' &&
      typeof value.window_tokens === 'number')
  )
}

function displaySummary(value: unknown): string {
  if (typeof value !== 'object' || value === null) return 'Builder emitted an invalid stream event.'
  const event = value as Record<string, unknown>
  for (const key of ['summary', 'content', 'text', 'message', 'delta', 'command', 'name']) {
    const candidate = event[key]
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
    if (typeof candidate === 'object' && candidate !== null) {
      const nested = candidate as Record<string, unknown>
      for (const nestedKey of ['content', 'text', 'message', 'name']) {
        const nestedCandidate = nested[nestedKey]
        if (typeof nestedCandidate === 'string' && nestedCandidate.trim().length > 0) {
          return nestedCandidate
        }
      }
    }
  }
  return 'Builder runtime status updated.'
}

export function normalizeBuilderStreamLine(
  line: string,
  sequence: number,
  workspaceRoot?: string,
): BuilderStreamEvent | null {
  const outer = parsedRecord(line)
  if (outer === null) {
    return {
      sequence,
      kind: 'ERROR',
      summary: 'Builder emitted an invalid stream event.',
      transient: true,
      redactionStatus: 'VERIFIED_REDACTED',
    }
  }
  const parsed = unwrapNestedTransportEvent(outer)
  if (isInternalTransportEvent(parsed)) return null
  return {
    sequence,
    kind: classify(parsed),
    summary: redactBuilderStreamText(displaySummary(parsed), workspaceRoot).slice(0, 4_000),
    transient: true,
    redactionStatus: 'VERIFIED_REDACTED',
  }
}
