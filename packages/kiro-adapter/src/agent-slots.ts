export const BUILDER_SESSION_REVISION = 6 as const

function revisionedBuilderSlotKey(projectId: string, revision: number): string {
  return `vibe-helper-builder-v${String(revision)}-${projectId}`
}

export function builderSlotKey(projectId: string): string {
  return revisionedBuilderSlotKey(projectId, BUILDER_SESSION_REVISION)
}

export function priorBuilderSlotKeys(projectId: string): readonly string[] {
  return [
    `vibe-helper-builder-${projectId}`,
    ...Array.from({ length: BUILDER_SESSION_REVISION - 2 }, (_, index) =>
      revisionedBuilderSlotKey(projectId, index + 2),
    ),
  ]
}
