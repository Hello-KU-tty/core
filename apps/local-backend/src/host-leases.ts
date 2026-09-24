import { WorkflowError } from '@vibe-helper/runtime'

/** Extension hosts renew a private, authenticated lease; no product mutation is replayed. */
export class HostLeases {
  readonly #leases = new Map<string, { pid: number; expires: number }>()
  #idleSince: number
  constructor(
    readonly now: () => number = Date.now,
    readonly graceMs = 30_000,
  ) {
    this.#idleSince = now()
  }
  update(input: unknown): { clients: number } {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new WorkflowError('HOST_LEASE_INVALID')
    const value = input as Record<string, unknown>
    if (
      Object.keys(value).sort().join(',') !== 'action,id,pid' ||
      typeof value.id !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(value.id) ||
      !Number.isSafeInteger(value.pid) ||
      Number(value.pid) <= 0 ||
      !['RENEW', 'RELEASE'].includes(String(value.action))
    )
      throw new WorkflowError('HOST_LEASE_INVALID')
    const previous = this.#leases.get(value.id)
    if (previous && previous.pid !== value.pid) throw new WorkflowError('HOST_LEASE_OWNER_CONFLICT')
    if (value.action === 'RELEASE') this.#leases.delete(value.id)
    else {
      if (!previous && this.#leases.size >= 32) throw new WorkflowError('HOST_LEASE_CAPACITY')
      this.#leases.set(value.id, { pid: Number(value.pid), expires: this.now() + this.graceMs })
    }
    this.#idleSince = this.now()
    return { clients: this.#leases.size }
  }
  expired(): boolean {
    for (const [id, lease] of this.#leases) {
      let dead = false
      try {
        process.kill(lease.pid, 0)
      } catch (error) {
        dead = (error as NodeJS.ErrnoException).code === 'ESRCH'
      }
      if (dead || lease.expires < this.now()) this.#leases.delete(id)
    }
    if (this.#leases.size) this.#idleSince = this.now()
    return this.#leases.size === 0 && this.now() - this.#idleSince >= this.graceMs
  }
}
