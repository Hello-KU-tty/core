export interface WorkspaceManifest {
  readonly name: string
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
}

export interface DependencyRule {
  readonly packageName: string
  readonly allowedInternalDependencies: readonly string[]
}

export interface BoundaryViolation {
  readonly packageName: string
  readonly dependency: string
}

export function findBoundaryViolations(
  manifests: readonly WorkspaceManifest[],
  rules: readonly DependencyRule[],
): BoundaryViolation[] {
  const internalPackages = new Set(manifests.map((manifest) => manifest.name))
  const rulesByPackage = new Map(rules.map((rule) => [rule.packageName, rule]))
  const violations: BoundaryViolation[] = []

  for (const manifest of manifests) {
    const allowed = new Set(rulesByPackage.get(manifest.name)?.allowedInternalDependencies ?? [])
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    }

    for (const dependency of Object.keys(dependencies)) {
      if (internalPackages.has(dependency) && !allowed.has(dependency)) {
        violations.push({ packageName: manifest.name, dependency })
      }
    }
  }

  return violations
}
