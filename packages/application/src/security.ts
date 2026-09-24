import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path'

import type { CodeReference, Project } from '@vibe-helper/contracts'

import { ApplicationError, createOperationError } from './errors.js'
import { redactSensitiveText } from './redaction.js'

export { redactSensitiveText } from './redaction.js'

export const MAX_APPLICATION_PAYLOAD_BYTES = 2 * 1024 * 1024
export const MAX_HELPER_CODE_EXCERPT_CHARS = 8_192
const MAX_HELPER_SOURCE_FILE_BYTES = 512 * 1024

export interface BoundedCodeExcerpt {
  readonly redactedExcerpt: string
  readonly truncated: boolean
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [key, canonicalize(child)]),
  )
}

export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value))
  if (serialized === undefined) throw new TypeError('Value cannot be serialized as canonical JSON')
  return serialized
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function payloadBytes(value: unknown): number {
  return Buffer.byteLength(canonicalJson(value), 'utf8')
}

function isWithin(parent: string, child: string, allowSame: boolean): boolean {
  const pathFromParent = relative(parent, child)
  if (pathFromParent === '') return allowSame
  return (
    pathFromParent !== '..' && !pathFromParent.startsWith(`..${sep}`) && !isAbsolute(pathFromParent)
  )
}

async function canonicalizeExistingOrNearest(target: string): Promise<string> {
  const missingSegments: string[] = []
  let cursor = resolve(target)
  while (true) {
    try {
      const existing = await realpath(cursor)
      return missingSegments.reduce((current, segment) => join(current, segment), existing)
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (code !== 'ENOENT') throw error
      const parent = dirname(cursor)
      if (parent === cursor) throw error
      missingSegments.unshift(basename(cursor))
      cursor = parent
    }
  }
}

function collectReferencePaths(value: unknown, paths: string[]): void {
  if (Array.isArray(value)) {
    for (const child of value) collectReferencePaths(child, paths)
    return
  }
  if (typeof value !== 'object' || value === null) return
  const record = value as Record<string, unknown>
  if (record.kind === 'CODE' && typeof record.path === 'string') paths.push(record.path)
  if (record.kind === 'DIFF' && Array.isArray(record.paths)) {
    for (const path of record.paths) if (typeof path === 'string') paths.push(path)
  }
  for (const child of Object.values(record)) collectReferencePaths(child, paths)
}

export class WorkspacePathPolicy {
  readonly generatedWorkspaceRoot: string
  readonly #prepareNewWorkspace: ((path: string) => Promise<unknown>) | undefined

  private constructor(
    generatedWorkspaceRoot: string,
    prepareNewWorkspace?: (path: string) => Promise<unknown>,
  ) {
    this.generatedWorkspaceRoot = generatedWorkspaceRoot
    this.#prepareNewWorkspace = prepareNewWorkspace
  }

  static async create(
    generatedWorkspaceRoot: string,
    options: { prepareNewWorkspace?: (path: string) => Promise<unknown> } = {},
  ): Promise<WorkspacePathPolicy> {
    const normalized = resolve(generatedWorkspaceRoot)
    if (!isAbsolute(generatedWorkspaceRoot) || normalized === parse(normalized).root) {
      throw new TypeError('Generated workspace root must be an explicit non-root absolute path')
    }
    return new WorkspacePathPolicy(await realpath(normalized), options.prepareNewWorkspace)
  }

  projectWorkspacePath(projectId: string): string {
    return `projects/${projectId}`
  }

  async provisionProjectWorkspace(relativePath: string, correlationId: string): Promise<string> {
    const lexicalWorkspace = resolve(this.generatedWorkspaceRoot, ...relativePath.split('/'))
    const canonicalBeforeCreate = await canonicalizeExistingOrNearest(lexicalWorkspace)
    if (!isWithin(this.generatedWorkspaceRoot, canonicalBeforeCreate, false)) {
      throw this.#permissionError(
        correlationId,
        'WORKSPACE_PATH_OUTSIDE_ROOT',
        'Project workspace is outside the configured generated workspace root.',
      )
    }
    const created = await mkdir(lexicalWorkspace, { recursive: true })
    const canonicalWorkspace = await realpath(lexicalWorkspace)
    if (!isWithin(this.generatedWorkspaceRoot, canonicalWorkspace, false)) {
      throw this.#permissionError(
        correlationId,
        'WORKSPACE_PATH_OUTSIDE_ROOT',
        'Project workspace is outside the configured generated workspace root.',
      )
    }
    if (created !== undefined) await this.#prepareNewWorkspace?.(canonicalWorkspace)
    return canonicalWorkspace
  }

  async resolveProjectWorkspace(project: Project, correlationId: string): Promise<string> {
    if (project.generatedWorkspacePath === undefined) {
      throw this.#permissionError(
        correlationId,
        'WORKSPACE_NOT_ASSIGNED',
        'Project does not have a generated workspace.',
      )
    }
    const lexicalWorkspace = resolve(
      this.generatedWorkspaceRoot,
      ...project.generatedWorkspacePath.split('/'),
    )
    const canonicalWorkspace = await canonicalizeExistingOrNearest(lexicalWorkspace)
    if (!isWithin(this.generatedWorkspaceRoot, canonicalWorkspace, false)) {
      throw this.#permissionError(
        correlationId,
        'WORKSPACE_PATH_OUTSIDE_ROOT',
        'Project workspace is outside the configured generated workspace root.',
      )
    }
    return canonicalWorkspace
  }

  async validateReferences(
    project: Project,
    payload: unknown,
    correlationId: string,
  ): Promise<void> {
    const paths: string[] = []
    collectReferencePaths(payload, paths)
    if (paths.length === 0) return
    const workspace = await this.resolveProjectWorkspace(project, correlationId)
    for (const path of new Set(paths)) {
      const lexicalTarget = resolve(workspace, ...path.split('/'))
      const canonicalTarget = await canonicalizeExistingOrNearest(lexicalTarget)
      if (!isWithin(workspace, canonicalTarget, true)) {
        throw this.#permissionError(
          correlationId,
          'WORKSPACE_PATH_ESCAPE',
          'A referenced path escapes the generated project workspace.',
        )
      }
    }
  }

  async readCodeExcerpt(
    project: Project,
    reference: CodeReference,
    correlationId: string,
  ): Promise<BoundedCodeExcerpt | null> {
    const workspace = await this.resolveProjectWorkspace(project, correlationId)
    const lexicalTarget = resolve(workspace, ...reference.path.split('/'))
    const canonicalTarget = await canonicalizeExistingOrNearest(lexicalTarget)
    if (!isWithin(workspace, canonicalTarget, true)) {
      throw this.#permissionError(
        correlationId,
        'WORKSPACE_PATH_ESCAPE',
        'A referenced path escapes the generated project workspace.',
      )
    }
    try {
      const metadata = await stat(canonicalTarget)
      if (!metadata.isFile() || metadata.size > MAX_HELPER_SOURCE_FILE_BYTES) return null
      const contents = await readFile(canonicalTarget, 'utf8')
      if (contents.includes('\0')) return null
      const lines = contents.split(/\r?\n/)
      const selected =
        reference.lineRange === undefined
          ? lines.join('\n')
          : lines.slice(reference.lineRange.start - 1, reference.lineRange.end).join('\n')
      if (selected.trim().length === 0) return null
      const redacted = redactSensitiveText(selected, workspace)
      return {
        redactedExcerpt: redacted.slice(0, MAX_HELPER_CODE_EXCERPT_CHARS),
        truncated: redacted.length > MAX_HELPER_CODE_EXCERPT_CHARS,
      }
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (code === 'ENOENT' || code === 'EISDIR') return null
      throw error
    }
  }

  #permissionError(correlationId: string, code: string, message: string): ApplicationError {
    return new ApplicationError(
      createOperationError({
        category: 'PERMISSION',
        code,
        disposition: 'PERMANENT',
        message,
        correlationId,
      }),
    )
  }
}
