import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, isAbsolute, resolve, sep } from 'node:path'

import { redactSensitiveText } from '@vibe-helper/application/redaction'
import {
  GENERATED_RESULT_MANIFEST_PATH,
  type GeneratedResultDescriptor,
  generatedResultDescriptorSchema,
  generatedResultManifestSchema,
} from '@vibe-helper/contracts'

const MAX_MANIFEST_BYTES = 32_768
const MAX_DIAGNOSTIC_CHARACTERS = 1_000

interface RunningResult {
  readonly child: ChildProcess
  readonly healthUrl: string
  readonly url: string
  readonly workspacePath: string
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

  private constructor(workspaceRoot: string, startupTimeoutMs: number) {
    this.#workspaceRoot = workspaceRoot
    this.#startupTimeoutMs = startupTimeoutMs
  }

  static async create(
    workspaceRoot: string,
    options: { readonly startupTimeoutMs?: number } = {},
  ): Promise<ResultRuntimeSupervisor> {
    if (!isAbsolute(workspaceRoot)) {
      throw new TypeError('Generated workspace root must be absolute.')
    }
    return new ResultRuntimeSupervisor(
      await realpath(workspaceRoot),
      options.startupTimeoutMs ?? 10_000,
    )
  }

  async launch(descriptor: GeneratedResultDescriptor): Promise<GeneratedResultDescriptor> {
    if (descriptor.status !== 'READY') return descriptor
    const existing = this.#running.get(descriptor.projectId)
    if (existing !== undefined && existing.child.exitCode === null) {
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
        // Replace an alive but unhealthy result process below.
      }
      existing.child.kill('SIGTERM')
      this.#running.delete(descriptor.projectId)
    }
    if (existing !== undefined) this.#running.delete(descriptor.projectId)

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

    const port = await this.#availablePort()
    const origin = `http://127.0.0.1:${String(port)}`
    const healthUrl = `${origin}${parsedManifest.data.healthPath}`
    const url = `${origin}${parsedManifest.data.openPath}`
    const child = spawn(process.execPath, [canonicalEntry], {
      cwd: workspace,
      env: {
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
        PATH: dirname(process.execPath),
        PORT: String(port),
      },
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let diagnostic = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      diagnostic = `${diagnostic}${chunk.toString('utf8')}`.slice(-MAX_DIAGNOSTIC_CHARACTERS)
    })
    try {
      await this.#waitForHealth(child, healthUrl)
    } catch {
      if (child.exitCode === null) child.kill('SIGTERM')
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
    })
    child.once('exit', () => {
      const current = this.#running.get(descriptor.projectId)
      if (current?.child === child) this.#running.delete(descriptor.projectId)
    })
    return generatedResultDescriptorSchema.parse({
      ...descriptor,
      status: 'RUNNING',
      url,
      reused: false,
    })
  }

  async close(): Promise<void> {
    const children = [...this.#running.values()].map((item) => item.child)
    this.#running.clear()
    await Promise.all(
      children.map(
        (child) =>
          new Promise<void>((done) => {
            if (child.exitCode !== null) {
              done()
              return
            }
            const timeout = setTimeout(() => {
              child.kill('SIGKILL')
              done()
            }, 1_000)
            child.once('exit', () => {
              clearTimeout(timeout)
              done()
            })
            child.kill('SIGTERM')
          }),
      ),
    )
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
