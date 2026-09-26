import type { LocalCoreClient } from '@vibe-helper/frontend-client'

/** Host-only structural client; credentials and private fields are not exposed. */
export type CoreClient = Pick<LocalCoreClient,
  'health' | 'execute' | 'startDiscovery' | 'startRun' | 'cancelRun' |
  'getRun' | 'listRuns' | 'watchRun' | 'listProjects' | 'restoreProject'>
export interface HostStatus {
  phase: string
  native: 'NOT_READY' | 'WORKER_READY' | 'UNAVAILABLE'
  nativeErrorCode?: string | null
  errorCode?: string | null
  helperMode?: 'SEPARATE_WINDOW'
  restoreRequired?: boolean
}
export interface NativeQuestion {
  requestId: string
  nativeJobId: string
  projectId: string
  taskId: string | null
  discoverySessionId: string | null
  role: 'DISCOVERY' | 'BUILDER' | 'HELPER' | 'EVIDENCE_ANALYST'
  status: 'WAITING' | 'RESPONDING'
  question: string
  options: Array<{ title: string; description?: string; recommended: boolean;
    subOptionsLabel?: string; subOptions: Array<{ title: string; description?: string }> }>
}
export type NativeAnswer = Pick<NativeQuestion, 'projectId' | 'nativeJobId' | 'requestId'> & (
  { action: 'dismissed' } | { action: 'answered'; answer: string } |
  { action: 'answered'; optionIndex: number; subOptionIndices: number[] })
export interface FrontendHost {
  client: CoreClient
  prepare(): Promise<{ client: CoreClient }>
  retry(): Promise<{ client: CoreClient }>
  assertAgentReady(): void
  getStatus(): HostStatus
  subscribeStatus(listener: (status: HostStatus) => void): () => void
  onDidRotate(listener: (event: { generation: number; backendInstanceId: string; previousBackendInstanceId: string }) => void): () => void
  worker: {
    getStatus(): unknown
    listUserInputs(projectId: string): NativeQuestion[]
    subscribeStatus(listener: (status: unknown) => void): () => void
    subscribeUserInputs(listener: () => void): () => void
    submitUserInput(value: NativeAnswer): Promise<'SUBMITTED' | 'ALREADY_SUBMITTED'>
  }
  dispose(): Promise<void>
}
export function createFrontendHost(context: {
  extensionPath: string
  globalStorageUri: { fsPath: string }
}): Promise<FrontendHost>
