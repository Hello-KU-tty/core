const SECRET_ASSIGNMENT =
  /["']?\b(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password|secret|token)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|`[^`]*`|[^\s,;]+)/gi
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi
const WELL_KNOWN_TOKEN =
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/g
// Quoted paths may contain spaces. An unquoted path must not consume the
// following prose or an independently redacted credential assignment.
const QUOTED_USER_PATH = /(["'`])\/(?:Users|home)\/[^\r\n]*?(?:\1|(?=[\r\n]|$))/g
const USER_PATH = /\/Users\/[^/\s"'`<>|]+(?:\/[^\s"'`<>|]*)?/g
const LINUX_USER_PATH = /\/home\/[^/\s"'`<>|]+(?:\/[^\s"'`<>|]*)?/g
// Native Windows paths can contain spaces in both usernames and directories.
// Stop at a quotation/markup delimiter or a line ending, not at the first space.
const WINDOWS_USER_PATH = /\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\r\n"'`<>|]+/gi
const PRIVATE_KEY_BLOCK =
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g
const PENDING_ASSIGNMENT =
  /["']?\b(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password|secret|token)\b["']?\s*(?:[:=]\s*(?:"[^"]*|'[^']*|`[^`]*|[^\s,;]*)?)?$/gi
const PENDING_BEARER = /\bBearer\s*$/gi
const PENDING_PRIVATE_KEY_HEADER = /-----BEGIN [A-Z0-9 ]*$/g

export function redactSensitiveText(text: string, workspaceRoot?: string): string {
  let redacted = text
    .replace(PRIVATE_KEY_BLOCK, '[REDACTED_PRIVATE_KEY]')
    .replace(SECRET_ASSIGNMENT, '$1=[REDACTED]')
    .replace(BEARER_TOKEN, 'Bearer [REDACTED]')
    .replace(WELL_KNOWN_TOKEN, '[REDACTED_TOKEN]')
  if (workspaceRoot !== undefined) redacted = redacted.split(workspaceRoot).join('[WORKSPACE]')
  return redacted
    .replace(
      QUOTED_USER_PATH,
      (match, quote: string) => `${quote}[REDACTED_PATH]${match.endsWith(quote) ? quote : ''}`,
    )
    .replace(USER_PATH, '[REDACTED_PATH]')
    .replace(LINUX_USER_PATH, '[REDACTED_PATH]')
    .replace(WINDOWS_USER_PATH, '[REDACTED_PATH]')
}

export class SensitiveReferencePathError extends Error {
  constructor() {
    super('Credential-like material in a file reference must be removed, not rewritten.')
  }
}

/** Only call on schema-validated JSON, then revalidate the result before dispatch.
 * References are never redirected by redaction. Unchanged subtrees retain identity.
 */
export function redactContractText(value: unknown, field?: string): unknown {
  if (typeof value === 'string') {
    const redacted = redactSensitiveText(value)
    if (
      redacted !== value &&
      (field === 'path' || field === 'paths' || field === 'generatedWorkspacePath')
    )
      throw new SensitiveReferencePathError()
    return redacted
  }
  if (Array.isArray(value)) {
    const redacted = value.map((child) => redactContractText(child, field))
    return redacted.some((child, index) => child !== value[index]) ? redacted : value
  }
  if (value === null || typeof value !== 'object') return value
  const source = value as Record<string, unknown>
  const entries = Object.entries(source).map(
    ([key, child]) => [key, redactContractText(child, key)] as const,
  )
  if (entries.every(([key, child]) => child === source[key])) return value
  const redacted = Object.fromEntries(entries)
  if ('redactionStatus' in source) redacted.redactionStatus = 'VERIFIED_REDACTED'
  return redacted
}

/** A bounded look-behind prevents a credential split across deltas from being
 * published before its prefix can be recognized. Long incomplete sensitive
 * spans fail closed for the remainder of the turn; tool/status events continue.
 */
export class SensitiveTextStream {
  #pending = ''
  #truncated = false
  readonly #roots: readonly string[]
  readonly #lookBehind: number
  constructor(workspaceRoots: readonly string[] = []) {
    this.#roots = workspaceRoots.filter((root) => root.length > 0)
    this.#lookBehind = Math.max(64, ...this.#roots.map((root) => root.length))
  }

  push(text: string): string {
    if (this.#truncated) return ''
    this.#pending += text
    let boundary = Math.max(0, this.#pending.length - this.#lookBehind)
    const spans: { start: number; end: number }[] = []
    for (const pattern of [
      SECRET_ASSIGNMENT,
      BEARER_TOKEN,
      WELL_KNOWN_TOKEN,
      QUOTED_USER_PATH,
      USER_PATH,
      LINUX_USER_PATH,
      WINDOWS_USER_PATH,
      PRIVATE_KEY_BLOCK,
      PENDING_ASSIGNMENT,
      PENDING_BEARER,
      PENDING_PRIVATE_KEY_HEADER,
    ]) {
      for (const match of this.#pending.matchAll(new RegExp(pattern.source, pattern.flags)))
        spans.push({ start: match.index, end: match.index + match[0].length })
    }
    for (const root of this.#roots) {
      for (
        let start = this.#pending.indexOf(root);
        start !== -1;
        start = this.#pending.indexOf(root, start + root.length)
      )
        spans.push({ start, end: start + root.length })
    }
    // Overlapping patterns (e.g. a key inside a quoted assignment) must not be
    // cut apart. Moving only left terminates, including overlapping roots.
    let previous: number
    do {
      previous = boundary
      for (const span of spans)
        if (span.start < boundary && span.end >= boundary) boundary = span.start
    } while (boundary !== previous)
    const ready = this.#redact(this.#pending.slice(0, boundary))
    this.#pending = this.#pending.slice(boundary)
    if (this.#pending.length > 65_536) {
      this.#pending = ''
      this.#truncated = true
      return `${ready}[REDACTED_STREAM_LIMIT]`
    }
    return ready
  }

  finish(): string {
    const ready = this.#redact(this.#pending)
    this.#pending = ''
    return ready
  }

  discard(): void {
    this.#pending = ''
  }

  #redact(text: string): string {
    for (const root of this.#roots) text = text.split(root).join('[WORKSPACE]')
    return redactSensitiveText(text)
  }
}
