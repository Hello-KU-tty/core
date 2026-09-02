const SECRET_ASSIGNMENT =
  /["']?\b(api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password|secret|token)\b["']?\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|`[^`\r\n]*`|[^\s,;]+)/gi
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi
const WELL_KNOWN_TOKEN =
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b/g
const USER_PATH = /\/Users\/[^/\s"']+(?:\/[^\s"']*)?/g

export function redactSensitiveText(text: string, workspaceRoot?: string): string {
  let redacted = text
    .replace(SECRET_ASSIGNMENT, '$1=[REDACTED]')
    .replace(BEARER_TOKEN, 'Bearer [REDACTED]')
    .replace(WELL_KNOWN_TOKEN, '[REDACTED_TOKEN]')
  if (workspaceRoot !== undefined) redacted = redacted.split(workspaceRoot).join('[WORKSPACE]')
  return redacted.replace(USER_PATH, '[REDACTED_PATH]')
}
