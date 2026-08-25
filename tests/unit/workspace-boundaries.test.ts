import { describe, expect, it } from 'vitest'

import { findBoundaryViolations } from '../support/workspace-boundaries.js'

describe('workspace boundary policy', () => {
  it('allows declared dependency directions', () => {
    const violations = findBoundaryViolations(
      [
        { name: '@example/contracts' },
        { name: '@example/application', dependencies: { '@example/contracts': 'workspace:*' } },
      ],
      [
        { packageName: '@example/contracts', allowedInternalDependencies: [] },
        {
          packageName: '@example/application',
          allowedInternalDependencies: ['@example/contracts'],
        },
      ],
    )

    expect(violations).toEqual([])
  })

  it('reports an internal dependency that crosses a forbidden boundary', () => {
    const violations = findBoundaryViolations(
      [
        { name: '@example/ui', dependencies: { '@example/storage': 'workspace:*' } },
        { name: '@example/storage' },
      ],
      [
        { packageName: '@example/ui', allowedInternalDependencies: [] },
        { packageName: '@example/storage', allowedInternalDependencies: [] },
      ],
    )

    expect(violations).toEqual([{ packageName: '@example/ui', dependency: '@example/storage' }])
  })
})
