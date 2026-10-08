import { randomUUID } from 'node:crypto'
import { lstat, readdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, parse, relative, resolve, sep } from 'node:path'

// Names a fresh folder may already hold (editor and VCS metadata). Anything else is existing work,
// and importing existing projects stays out of scope.
const EMPTY_FOLDER_ENTRIES = new Set(['.DS_Store', '.git', '.vscode', '.idea', '.kiro'])
const MAX_PATH_LENGTH = 4096
const MAX_REGISTRATIONS = 200

interface Registration {
  readonly path: string
  readonly registeredAt: string
}

/** True when the folder holds anything beyond editor, VCS and Vibe Helper metadata. */
export async function folderHasWork(path: string): Promise<boolean> {
  const names = await readdir(path).catch(() => [] as string[])
  return names.some((name) => !EMPTY_FOLDER_ENTRIES.has(name) && name !== '.vibe-helper')
}

const within = (parent: string, child: string): boolean => {
  const part = relative(parent, child)
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part))
}

/**
 * Project folders the learner chose in their host (the open, empty Kiro folder), keyed by Project.
 * Stored privately next to Core data. Core resolves a registered Project to this folder instead of
 * a generated one; registration itself is host adapter state, not a Core record.
 */
export class WorkspaceRegistry {
  readonly #file: string
  readonly #coreRoot: string
  readonly #entries = new Map<string, Registration>()

  private constructor(file: string, coreRoot: string) {
    this.#file = file
    this.#coreRoot = coreRoot
  }

  static async open(options: { file: string; coreRoot: string }): Promise<WorkspaceRegistry> {
    const registry = new WorkspaceRegistry(options.file, await realpath(options.coreRoot))
    const text = await readFile(options.file, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (text === undefined) return registry
    const parsed: unknown = JSON.parse(text)
    const entries =
      typeof parsed === 'object' && parsed !== null && 'projects' in parsed
        ? parsed.projects
        : undefined
    if (typeof entries !== 'object' || entries === null)
      throw new Error('WORKSPACE_REGISTRY_INVALID')
    for (const [projectId, value] of Object.entries(entries)) {
      if (
        !/^project_[0-9a-f-]{36}$/.test(projectId) ||
        typeof value !== 'object' ||
        value === null ||
        typeof value.path !== 'string' ||
        !isAbsolute(value.path) ||
        typeof value.registeredAt !== 'string'
      )
        throw new Error('WORKSPACE_REGISTRY_INVALID')
      registry.#entries.set(projectId, { path: value.path, registeredAt: value.registeredAt })
    }
    return registry
  }

  get(projectId: string): string | undefined {
    return this.#entries.get(projectId)?.path
  }

  /**
   * Registers the folder for the Project. A folder already registered to this Project is accepted
   * as is; otherwise it must be the learner's own, canonical and empty.
   */
  async register(projectId: string, requested: string): Promise<string> {
    if (
      typeof requested !== 'string' ||
      requested.length > MAX_PATH_LENGTH ||
      !isAbsolute(requested)
    )
      throw new Error('WORKSPACE_FOLDER_INVALID')
    const canonical = await realpath(requested).catch(() => undefined)
    if (canonical === undefined || canonical !== resolve(requested))
      throw new Error('WORKSPACE_FOLDER_NOT_CANONICAL')
    const previous = this.get(projectId)
    if (previous === canonical) return canonical
    // Moving a Project to a new folder would orphan the work in the old one.
    if (previous !== undefined && (await lstat(previous).catch(() => null)) !== null)
      throw new Error('PROJECT_REGISTERED_ELSEWHERE')
    for (const [other, entry] of this.#entries)
      if (other !== projectId && entry.path === canonical)
        throw new Error('WORKSPACE_FOLDER_IN_USE')
    const metadata = await lstat(canonical)
    if (!metadata.isDirectory() || metadata.isSymbolicLink())
      throw new Error('WORKSPACE_FOLDER_INVALID')
    if (typeof process.getuid === 'function' && metadata.uid !== process.getuid())
      throw new Error('WORKSPACE_FOLDER_NOT_OWNED')
    const home = await realpath(homedir()).catch(() => homedir())
    if (canonical === parse(canonical).root || canonical === home)
      throw new Error('WORKSPACE_FOLDER_TOO_BROAD')
    if (within(this.#coreRoot, canonical) || within(canonical, this.#coreRoot))
      throw new Error('WORKSPACE_FOLDER_OVERLAPS_CORE')
    const existing = (await readdir(canonical)).filter((name) => !EMPTY_FOLDER_ENTRIES.has(name))
    if (existing.length > 0) throw new Error('WORKSPACE_FOLDER_NOT_EMPTY')
    if (this.#entries.size >= MAX_REGISTRATIONS && !this.#entries.has(projectId))
      throw new Error('WORKSPACE_REGISTRY_FULL')
    this.#entries.set(projectId, { path: canonical, registeredAt: new Date().toISOString() })
    await this.#save()
    return canonical
  }

  async #save(): Promise<void> {
    const next = `${this.#file}.${randomUUID()}.tmp`
    await writeFile(
      next,
      `${JSON.stringify({ version: 1, projects: Object.fromEntries(this.#entries) }, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' },
    )
    await rename(next, this.#file)
  }
}
