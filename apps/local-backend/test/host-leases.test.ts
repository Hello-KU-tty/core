import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { HostLeases } from '../src/host-leases.js'

describe('managed Core host leases', () => {
  it('keeps shared clients through owner reload and expires the final client', () => {
    let clock = 0
    const leases = new HostLeases(() => clock, 1000)
    const a = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pid: process.pid }
    const b = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', pid: process.pid }
    leases.update({ ...a, action: 'RENEW' })
    leases.update({ ...b, action: 'RENEW' })
    expect(leases.update({ ...a, action: 'RELEASE' }).clients).toBe(1)
    clock = 900
    expect(leases.expired()).toBe(false)
    expect(leases.update({ ...a, action: 'RENEW' }).clients).toBe(2)
    leases.update({ ...a, action: 'RELEASE' })
    leases.update({ ...b, action: 'RELEASE' })
    clock = 1899
    expect(leases.expired()).toBe(false)
    clock = 1900
    expect(leases.expired()).toBe(true)
  })
  it('lets a live host go two minutes without renewing before its lease counts as gone (K18)', () => {
    let clock = 0
    const leases = new HostLeases(() => clock)
    leases.update({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pid: process.pid, action: 'RENEW' })
    for (clock = 1000; clock <= 120_000; clock += 1000) expect(leases.expired()).toBe(false)
    for (; clock < 150_000; clock += 1000) expect(leases.expired()).toBe(false)
    expect(leases.expired()).toBe(true)
  })
  it('gives live hosts a renewal period after the computer slept instead of closing at once', () => {
    let clock = 0
    const leases = new HostLeases(() => clock)
    const lease = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pid: process.pid }
    leases.update({ ...lease, action: 'RENEW' })
    for (clock = 1000; clock <= 10_000; clock += 1000) leases.expired()
    // One hour later Core's timer fires before any host could renew.
    clock = 3_600_000
    expect(leases.expired()).toBe(false)
    clock += 2000
    expect(leases.update({ ...lease, action: 'RENEW' }).clients).toBe(1)
    expect(leases.expired()).toBe(false)
  })
  it('still drops a dead host at once and closes after the grace when no host is left', () => {
    let clock = 0
    const leases = new HostLeases(() => clock)
    const dead = spawnSync(process.execPath, ['-e', '']).pid
    leases.update({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pid: dead, action: 'RENEW' })
    clock = 3_600_000
    expect(leases.expired()).toBe(false)
    for (clock += 1000; clock < 3_630_000; clock += 1000) expect(leases.expired()).toBe(false)
    expect(leases.expired()).toBe(true)
  })
  it('refuses invalid payloads and lease owner changes', () => {
    const leases = new HostLeases()
    const lease = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', pid: process.pid, action: 'RENEW' }
    leases.update(lease)
    expect(() => leases.update({ ...lease, pid: process.pid + 1 })).toThrow(
      'HOST_LEASE_OWNER_CONFLICT',
    )
    expect(() => leases.update({ ...lease, path: 'arbitrary' })).toThrow('HOST_LEASE_INVALID')
    expect(() => leases.update({ ...lease, pid: -1 })).toThrow('HOST_LEASE_INVALID')
  })
})
