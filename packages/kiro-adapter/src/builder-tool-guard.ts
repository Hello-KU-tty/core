import { realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export interface BuilderToolGuardResult {
  readonly allowed: boolean
  readonly reasonCode?:
    | 'GUARD_INPUT_INVALID'
    | 'GUARD_CWD_MISMATCH'
    | 'GUARD_PATH_ESCAPE'
    | 'GUARD_PROTECTED_PATH'
    | 'GUARD_SHELL_DENIED'
}

const GENERATED_PROJECT_PATTERN = /^project_[0-9a-f-]+$/

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isWithin(parent: string, child: string): boolean {
  const fromParent = relative(parent, child)
  return (
    fromParent === '' ||
    (!fromParent.startsWith(`..${sep}`) && fromParent !== '..' && !isAbsolute(fromParent))
  )
}

async function canonicalizeExistingOrNearest(target: string): Promise<string> {
  const missing: string[] = []
  let cursor = resolve(target)
  while (true) {
    try {
      const existing = await realpath(cursor)
      return missing.reduce((current, segment) => join(current, segment), existing)
    } catch (error) {
      const code = record(error)?.code
      if (code !== 'ENOENT') throw error
      const parent = dirname(cursor)
      if (parent === cursor) throw error
      missing.unshift(basename(cursor))
      cursor = parent
    }
  }
}

function toolName(input: Record<string, unknown>): string | null {
  const value = input.tool_name ?? input.toolName ?? input.name
  return typeof value === 'string' ? value : null
}

function toolInput(input: Record<string, unknown>): Record<string, unknown> {
  return record(input.tool_input ?? input.toolInput ?? input.input) ?? input
}

function referencedPaths(input: Record<string, unknown>): string[] {
  const values = [input.path, input.file_path, input.filePath]
  if (Array.isArray(input.paths)) values.push(...input.paths)
  if (Array.isArray(input.operations)) {
    for (const operation of input.operations) {
      const operationRecord = record(operation)
      if (operationRecord !== null) values.push(...referencedPaths(operationRecord))
    }
  }
  return values.filter((value): value is string => typeof value === 'string')
}

function protectedPath(path: string): boolean {
  return path.split('/').some((segment) => segment === '.kiro')
}

export async function resolveAppGeneratedWorkspace(
  input: unknown,
  crewHome: string | undefined,
  processDirectory: string,
): Promise<string | null> {
  if (crewHome === undefined || !isAbsolute(crewHome)) return null
  try {
    const root = await realpath(
      join(crewHome, 'apps', 'vibe-helper', 'data', 'generated-workspaces', 'projects'),
    )
    const event = record(input)
    const candidate = event !== null && typeof event.cwd === 'string' ? event.cwd : processDirectory
    const current = await realpath(candidate)
    const scoped = relative(root, current)
    return scoped.length > 0 && !scoped.includes(sep) && GENERATED_PROJECT_PATTERN.test(scoped)
      ? current
      : null
  } catch {
    return null
  }
}

function shellAllowed(command: string): boolean {
  if (
    command.includes('..') ||
    command.includes('~') ||
    /[;&|`$<>\n\r]/.test(command) ||
    /(^|\s)\//.test(command)
  ) {
    return false
  }
  return [
    /^node --test(?: [A-Za-z0-9._/:=-]+)*$/,
    /^pnpm test(?: [A-Za-z0-9._/:=,-]+)*$/,
    /^pnpm rebuild esbuild$/,
    /^pnpm run [a-zA-Z0-9:_-]+(?: -- [A-Za-z0-9._/:=,-]+)*$/,
    /^pnpm install --frozen-lockfile$/,
    /^npm test(?: -- [A-Za-z0-9._/:=,-]+)*$/,
    /^npm run [a-zA-Z0-9:_-]+(?: -- [A-Za-z0-9._/:=,-]+)*$/,
    /^npm install$/,
    /^npm install --include=dev$/,
  ].some((pattern) => pattern.test(command))
}

export async function guardBuilderToolInput(
  input: unknown,
  expectedWorkspace: string,
): Promise<BuilderToolGuardResult> {
  const event = record(input)
  if (event === null || !isAbsolute(expectedWorkspace)) {
    return { allowed: false, reasonCode: 'GUARD_INPUT_INVALID' }
  }
  const expected = await realpath(expectedWorkspace)
  const eventCwd = event.cwd
  if (typeof eventCwd === 'string' && (await realpath(eventCwd)) !== expected) {
    return { allowed: false, reasonCode: 'GUARD_CWD_MISMATCH' }
  }
  const name = toolName(event)
  if (name === null) return { allowed: false, reasonCode: 'GUARD_INPUT_INVALID' }
  const parameters = toolInput(event)

  if (name === 'execute_bash' || name === 'shell') {
    const command = parameters.command
    return typeof command === 'string' && shellAllowed(command)
      ? { allowed: true }
      : { allowed: false, reasonCode: 'GUARD_SHELL_DENIED' }
  }
  if (!['fs_read', 'fs_write', 'read', 'write'].includes(name)) return { allowed: true }

  const paths = referencedPaths(parameters)
  if (paths.length === 0) return { allowed: false, reasonCode: 'GUARD_INPUT_INVALID' }
  for (const path of paths) {
    if (protectedPath(path)) return { allowed: false, reasonCode: 'GUARD_PROTECTED_PATH' }
    const target = await canonicalizeExistingOrNearest(resolve(expected, path))
    if (!isWithin(expected, target)) {
      return { allowed: false, reasonCode: 'GUARD_PATH_ESCAPE' }
    }
  }
  return { allowed: true }
}
