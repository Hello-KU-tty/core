export const BUILDER_SESSION_REVISION = 8 as const
export const HELPER_SESSION_REVISION = 3 as const
export const EVIDENCE_ANALYST_SESSION_REVISION = 1 as const

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

function revisionedHelperSlotKey(projectId: string, revision: number): string {
  return `vibe-helper-helper-v${String(revision)}-${projectId}`
}

export function helperSlotKey(projectId: string): string {
  return revisionedHelperSlotKey(projectId, HELPER_SESSION_REVISION)
}

export function priorHelperSlotKeys(projectId: string): readonly string[] {
  return [
    `vibe-helper-helper-${projectId}`,
    ...Array.from({ length: HELPER_SESSION_REVISION - 2 }, (_, index) =>
      revisionedHelperSlotKey(projectId, index + 2),
    ),
  ]
}

export function evidenceAnalystSlotKey(
  projectId: string,
  analysisJobId: string,
  attempt: number,
): string {
  return `vibe-helper-evidence-analyst-v${String(EVIDENCE_ANALYST_SESSION_REVISION)}-${projectId}-${analysisJobId}-a${String(attempt)}`
}
