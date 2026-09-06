import { describe, expect, it } from 'vitest'

import { generatedResultManifestSchema } from '../src/index.js'

describe('generated result manifest contract', () => {
  it('defaults the user open path while keeping health and entry strict', () => {
    expect(
      generatedResultManifestSchema.parse({
        schemaVersion: 1,
        kind: 'WEB',
        entry: 'dist/server.js',
        healthPath: '/health',
      }),
    ).toEqual({
      schemaVersion: 1,
      kind: 'WEB',
      entry: 'dist/server.js',
      healthPath: '/health',
      openPath: '/',
    })
    expect(
      generatedResultManifestSchema.safeParse({
        schemaVersion: 1,
        kind: 'WEB',
        entry: 'src/server.ts',
        healthPath: '/health',
      }).success,
    ).toBe(false)
    expect(
      generatedResultManifestSchema.safeParse({
        schemaVersion: 1,
        kind: 'WEB',
        entry: 'dist/server.js',
        healthPath: '/health',
        openPath: '//outside.example',
        command: 'pnpm start',
      }).success,
    ).toBe(false)
  })
})
