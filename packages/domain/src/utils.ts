function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value !== 'object' || value === null) return value

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  )
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function sameValue(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right)
}

export function compareUtc(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right)
}

export function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}
