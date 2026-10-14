import { WorkflowError } from '@vibe-helper/runtime'

/** Extension hosts renew a private, authenticated lease; no product mutation is replayed. */
export class HostLeases {
  readonly #leases = new Map<string, { pid: number; expires: number }>()
  #idleSince: number
  #lastCheck: number
  /**
   * `graceMs`: how long Core stays up after its last host is gone. `renewalMs`: how long a live
   * host may go without renewing, longer than the grace because another extension in the same
   * Kiro extension host can stall it (K18). `gapMs`: a check this late means the computer slept or
   * Core stalled; hosts then get a full renewal period instead of expiring before they can renew.
   */
  constructor(
    readonly now: () => number = Date.now,
    readonly graceMs = 30_000,
    readonly renewalMs = 120_000,
    readonly gapMs = 5_000,
  ) {
    this.#idleSince = now()
    this.#lastCheck = now()
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
      this.#leases.set(value.id, { pid: Number(value.pid), expires: this.now() + this.renewalMs })
    }
    this.#idleSince = this.now()
    return { clients: this.#leases.size }
  }
  expired(): boolean {
    const now = this.now()
    const resumed = now - this.#lastCheck > this.gapMs
    this.#lastCheck = now
    for (const [id, lease] of this.#leases) {
      let dead = false
      try {
        process.kill(lease.pid, 0)
      } catch (error) {
        dead = (error as NodeJS.ErrnoException).code === 'ESRCH'
      }
      if (!dead && resumed) lease.expires = Math.max(lease.expires, now + this.renewalMs)
      if (dead || lease.expires < now) this.#leases.delete(id)
    }
    if (this.#leases.size || resumed) this.#idleSince = now
    return this.#leases.size === 0 && now - this.#idleSince >= this.graceMs
  }
}
