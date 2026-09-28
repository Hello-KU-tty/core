import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, opendir, readFile, realpath } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, isAbsolute, resolve, sep } from 'node:path'

import { redactSensitiveText } from '@vibe-helper/application/redaction'
import {
  GENERATED_RESULT_MANIFEST_PATH,
  type GeneratedResultDescriptor,
  generatedResultDescriptorSchema,
  generatedResultManifestSchema,
} from '@vibe-helper/contracts'
import { stopOwnedProcessTree } from './process-tree.js'
import { type ProjectToolchain, projectEnvironment } from './project-toolchain.js'

const MAX_MANIFEST_BYTES = 32_768
const MAX_DIAGNOSTIC_CHARACTERS = 1_000
const MAX_RESULT_ENTRIES = 4_096
const MAX_RESULT_BYTES = 64 * 1_024 * 1_024

interface RunningResult {
  readonly child: ChildProcess
  readonly healthUrl: string
  readonly url: string
  readonly workspacePath: string
  readonly fingerprint: string
}

export class ResultRuntimeError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ResultRuntimeError'
    this.code = code
  }
}

export class ResultRuntimeSupervisor {
  readonly #workspaceRoot: string
  readonly #startupTimeoutMs: number
  readonly #running = new Map<string, RunningResult>()
  readonly #launching = new Map<string, Promise<GeneratedResultDescriptor>>()
  readonly #cleanups = new Set<Promise<void>>()
  #closed = false
  readonly #projectToolchain: ((workspace: string) => Promise<ProjectToolchain>) | undefined

  private constructor(
    workspaceRoot: string,
    startupTimeoutMs: number,
    projectToolchain?: (workspace: string) => Promise<ProjectToolchain>,
  ) {
    this.#workspaceRoot = workspaceRoot
    this.#startupTimeoutMs = startupTimeoutMs
    this.#projectToolchain = projectToolchain
  }

  static async create(
    workspaceRoot: string,
    options: {
      readonly startupTimeoutMs?: number
      readonly projectToolchain?: (workspace: string) => Promise<ProjectToolchain>
    } = {},
  ): Promise<ResultRuntimeSupervisor> {
    if (!isAbsolute(workspaceRoot)) {
      throw new TypeError('Generated workspace root must be absolute.')
    }
    return new ResultRuntimeSupervisor(
      await realpath(workspaceRoot),
      options.startupTimeoutMs ?? 10_000,
      options.projectToolchain,
    )
  }

  async launch(descriptor: GeneratedResultDescriptor): Promise<GeneratedResultDescriptor> {
    if (this.#closed)
      throw new ResultRuntimeError('RESULT_RUNTIME_CLOSED', 'Result runtime is closed.')
    const pending = this.#launching.get(descriptor.projectId)
    if (pending !== undefined) return pending
    const work = this.#launch(descriptor)
    this.#launching.set(descriptor.projectId, work)
    try {
      return await work
    } finally {
      this.#launching.delete(descriptor.projectId)
    }
  }

  async #launch(descriptor: GeneratedResultDescriptor): Promise<GeneratedResultDescriptor> {
    if (descriptor.status !== 'READY') return descriptor
    const workspace = await this.#resolveWorkspace(descriptor.workspacePath)
    const manifestPath = resolve(workspace, GENERATED_RESULT_MANIFEST_PATH)
    const manifestFile = await lstat(manifestPath).catch(() => null)
    if (manifestFile === null || !manifestFile.isFile() || manifestFile.size > MAX_MANIFEST_BYTES) {
      throw new ResultRuntimeError(
        'RESULT_MANIFEST_INVALID',
        `Builder result is missing a valid ${GENERATED_RESULT_MANIFEST_PATH} manifest.`,
      )
    }
    const canonicalManifest = await realpath(manifestPath)
    this.#assertContained(workspace, canonicalManifest)
    let manifestInput: unknown
    try {
      manifestInput = JSON.parse(await readFile(canonicalManifest, 'utf8'))
    } catch {
      throw new ResultRuntimeError(
        'RESULT_MANIFEST_INVALID',
        'Builder result manifest is invalid JSON.',
      )
    }
    const parsedManifest = generatedResultManifestSchema.safeParse(manifestInput)
    if (!parsedManifest.success) {
      throw new ResultRuntimeError(
        'RESULT_MANIFEST_INVALID',
        'Builder result manifest failed the strict local web runtime contract.',
      )
    }
    const entryPath = resolve(workspace, parsedManifest.data.entry)
    const entryFile = await lstat(entryPath).catch(() => null)
    if (entryFile === null || !entryFile.isFile()) {
      throw new ResultRuntimeError('RESULT_ENTRY_NOT_FOUND', 'Compiled result entry was not found.')
    }
    const canonicalEntry = await realpath(entryPath)
    this.#assertContained(workspace, canonicalEntry)

    // A healthy process can still contain stale ESM/CommonJS imports after a
    // Builder upgrade. Revalidate paths and bounded compiled content BEFORE
    // reuse. Include sibling modules (dist/domain beside dist/web), not only
    // the entry file. This is freshness checking, not an OS sandbox.
    const fingerprint = await this.#fingerprint(workspace, parsedManifest.data)
    const existing = this.#running.get(descriptor.projectId)
    if (existing !== undefined && existing.child.exitCode === null) {
      if (existing.fingerprint === fingerprint) {
        try {
          const health = await fetch(existing.healthUrl, { signal: AbortSignal.timeout(500) })
          if (health.ok) {
            return generatedResultDescriptorSchema.parse({
              ...descriptor,
              status: 'RUNNING',
              url: existing.url,
              reused: true,
            })
          }
        } catch {
          // Replace only this supervisor's unhealthy child below.
        }
      }
      await stopOwnedProcessTree(existing.child)
      this.#running.delete(descriptor.projectId)
    }
    if (existing !== undefined) this.#running.delete(descriptor.projectId)

    const port = await this.#availablePort()
    const origin = `http://127.0.0.1:${String(port)}`
    const healthUrl = `${origin}${parsedManifest.data.healthPath}`
    const url = `${origin}${parsedManifest.data.openPath}`
    const toolchain = await this.#projectToolchain?.(workspace).catch(() => {
      throw new ResultRuntimeError(
        'RESULT_PROJECT_RUNTIME_UNAVAILABLE',
        'Generated app runtime could not be prepared. Restore its verified tools before retrying.',
      )
    })
    if (!toolchain && process.versions.electron)
      throw new ResultRuntimeError(
        'RESULT_PROJECT_RUNTIME_REQUIRED',
        'Generated app runtime has not been prepared.',
      )
    const executable = toolchain?.node.executable ?? process.execPath
    const child = spawn(executable, [canonicalEntry], {
      cwd: workspace,
      env: {
        ...(toolchain ? projectEnvironment(toolchain) : { PATH: dirname(executable) }),
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
        PORT: String(port),
      },
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let diagnostic = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      diagnostic = `${diagnostic}${chunk.toString('utf8')}`.slice(-MAX_DIAGNOSTIC_CHARACTERS)
    })
    try {
      await this.#waitForHealth(child, healthUrl)
    } catch {
      await stopOwnedProcessTree(child)
      const suffix = redactSensitiveText(diagnostic, workspace).trim()
      throw new ResultRuntimeError(
        'RESULT_START_FAILED',
        suffix.length === 0
          ? 'Generated result did not become healthy on loopback.'
          : `Generated result did not become healthy: ${suffix}`,
      )
    }
    this.#running.set(descriptor.projectId, {
      child,
      healthUrl,
      url,
      workspacePath: descriptor.workspacePath,
      fingerprint,
    })
    child.once('exit', () => {
      const current = this.#running.get(descriptor.projectId)
      if (current?.child === child) this.#running.delete(descriptor.projectId)
      const cleanup = stopOwnedProcessTree(child)
      this.#cleanups.add(cleanup)
      void cleanup.finally(() => this.#cleanups.delete(cleanup))
    })
    return generatedResultDescriptorSchema.parse({
      ...descriptor,
      status: 'RUNNING',
      url,
      reused: false,
    })
  }

  async close(): Promise<void> {
    this.#closed = true
    await Promise.allSettled(this.#launching.values())
    const children = [...this.#running.values()].map((item) => item.child)
    this.#running.clear()
    await Promise.all(children.map(stopOwnedProcessTree))
    await Promise.allSettled(this.#cleanups)
  }

  async #fingerprint(workspace: string, manifest: { readonly entry: string }): Promise<string> {
    const hash = createHash('sha256').update(JSON.stringify([workspace, manifest]))
    const first = manifest.entry.split('/')[0]
    const compiledRoot = manifest.entry.includes('/') ? resolve(workspace, first ?? '') : workspace
    const files: string[] = []
    let entries = 0
    let bytes = 0
    const invalid = () =>
      new ResultRuntimeError(
        'RESULT_CONTENT_INVALID',
        'Compiled result exceeds the bounded regular-file contract.',
      )
    const visit = async (path: string): Promise<void> => {
      if (++entries > MAX_RESULT_ENTRIES) throw invalid()
      const stat = await lstat(path)
      if (stat.isSymbolicLink()) throw invalid()
      this.#assertContained(workspace, await realpath(path))
      if (stat.isDirectory()) {
        for await (const entry of await opendir(path)) {
          if (['node_modules', '.git', '.kiro', '.vibe-helper'].includes(entry.name)) continue
          await visit(resolve(path, entry.name))
        }
      } else if (stat.isFile()) files.push(path)
      else throw invalid()
    }
    await visit(compiledRoot)
    // Dependency changes must invalidate an otherwise unchanged compiled tree.
    if (compiledRoot !== workspace) {
      for (const name of ['package.json', 'pnpm-lock.yaml', 'package-lock.json']) {
        const path = resolve(workspace, name)
        if (
          await lstat(path).catch((error) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
            throw error
          })
        )
          await visit(path)
      }
    }
    const buffer = Buffer.alloc(64 * 1_024)
    for (const path of files.sort()) {
      const fileHash = createHash('sha256')
      const handle = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      )
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size > MAX_RESULT_BYTES - bytes) throw invalid()
        while (true) {
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, null)
          if (bytesRead === 0) break
          bytes += bytesRead
          if (bytes > MAX_RESULT_BYTES) throw invalid()
          fileHash.update(buffer.subarray(0, bytesRead))
        }
        hash.update(JSON.stringify([path.slice(workspace.length), fileHash.digest('hex')]))
      } finally {
        await handle.close()
      }
    }
    return hash.digest('hex')
  }

  async #resolveWorkspace(workspacePath: string): Promise<string> {
    const candidate = resolve(this.#workspaceRoot, workspacePath)
    this.#assertContained(this.#workspaceRoot, candidate)
    const stats = await lstat(candidate).catch(() => null)
    if (stats === null || !stats.isDirectory()) {
      throw new ResultRuntimeError(
        'RESULT_WORKSPACE_NOT_FOUND',
        'Generated workspace was not found.',
      )
    }
    const canonical = await realpath(candidate)
    this.#assertContained(this.#workspaceRoot, canonical)
    return canonical
  }

  #assertContained(parent: string, child: string): void {
    if (child !== parent && !child.startsWith(`${parent}${sep}`)) {
      throw new ResultRuntimeError(
        'RESULT_PATH_ESCAPE',
        'Generated result path escaped its workspace.',
      )
    }
  }

  async #availablePort(): Promise<number> {
    return new Promise((resolvePort, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address === null || typeof address === 'string') {
          server.close()
          reject(new Error('Could not allocate a loopback port.'))
          return
        }
        const port = address.port
        server.close((error) => (error === undefined ? resolvePort(port) : reject(error)))
      })
    })
  }

  async #waitForHealth(child: ChildProcess, url: string): Promise<void> {
    const deadline = Date.now() + this.#startupTimeoutMs
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error('Generated result exited during startup.')
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(500) })
        if (response.ok) return
      } catch {
        // The child may still be starting.
      }
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 100))
    }
    throw new Error('Generated result health check timed out.')
  }
}
