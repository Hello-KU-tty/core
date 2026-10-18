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
  helperMode?: 'SEPARATE_WINDOW' | 'KIRO_CLI'
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
/**
 * Diagnostic status code of the native worker, e.g. `WORKER_CONNECTED`,
 * `AGENT_RUNNING_BUILDER`, `WORKSPACE_SWITCHING`. Classify it with the SDK's
 * `classifyNativeWorkerStatus()`; never branch product state on raw suffixes.
 * An empty string means the worker has not reported yet.
 */
export type NativeWorkerStatusCode = string
export interface NativeWorker {
  /** Latest diagnostic code or `undefined` before the worker is attached. */
  getStatus(): NativeWorkerStatusCode | undefined
  /** Pending questions that a native Agent asked in this Project. Poll-free; re-read on notify. */
  listUserInputs(projectId: string): NativeQuestion[]
  subscribeStatus(listener: (status: NativeWorkerStatusCode) => void): () => void
  /** Notification only; call `listUserInputs(projectId)` again. */
  subscribeUserInputs(listener: () => void): () => void
  /**
   * Submit exactly what the user chose. Rejects with `NATIVE_USER_INPUT_STALE` when the
   * native job is no longer claimed, `NATIVE_USER_INPUT_RESPONSE_INVALID` for malformed
   * values (including free text that would need redaction) and `NATIVE_NOT_READY` before a
   * worker exists. Same answer repeated: `ALREADY_SUBMITTED` while Kiro is consuming it,
   * `ALREADY_HANDLED` after Kiro acknowledged it. Never auto-answer.
   */
  submitUserInput(value: NativeAnswer): Promise<'SUBMITTED' | 'ALREADY_SUBMITTED' | 'ALREADY_HANDLED'>
}
export interface FrontendHost {
  client: CoreClient
  prepare(): Promise<{ client: CoreClient }>
  retry(): Promise<{ client: CoreClient }>
  assertAgentReady(): void
  getStatus(): HostStatus
  subscribeStatus(listener: (status: HostStatus) => void): () => void
  onDidRotate(listener: (event: { generation: number; backendInstanceId: string; previousBackendInstanceId: string }) => void): () => void
  worker: NativeWorker
  /**
   * Kiro-native: connects the Project to Kiro chat (Steering, hooks, MCP, Helper agent, Spec).
   * An empty open folder becomes the Project folder in this window (`REGISTERED`). A folder with
   * other files asks the learner, then opens a Core-generated folder in a new window
   * (`GENERATED`); declining returns `CANCELLED`. The first call asks once how Kiro should
   * approve commands in Project folders (`permissions` reports the Kiro rule file). Rejects with a
   * code such as `KIRO_BIND_TASK_NOT_READY`. Also available as the `vibeHelper.openInKiro` command.
   * `reloadRequired`: this window must trust the folder and reload before Kiro chat reaches Vibe
   * Helper (it opened untrusted); the host already shows the trust or reload prompt.
   */
  openProjectInKiro(projectId: string): Promise<{
    projectId: string
    taskId: string | null
    openedNewWindow: boolean
    folder: 'REGISTERED' | 'GENERATED' | 'CANCELLED'
    permissions?: 'WRITTEN' | 'UNCHANGED' | 'UNRECOGNIZED' | 'NOT_REQUESTED'
    reloadRequired?: boolean
    /** K17: a new Kiro chat session was started in this trusted window (the chat's +). */
    freshSession?: boolean
  }>
  /**
   * K23: what Kiro chat in this window can reach. `READY`: the single open folder is a connected
   * Project folder and trusted since the window opened; `UNTRUSTED`: connected, not trusted;
   * `RELOAD`: trusted after the window opened, so hooks and MCP wait for one reload;
   * `NOT_BOUND`: no single open folder, or it is not `projectId`'s folder. Never rejects.
   */
  kiroWindow?(projectId?: string): Promise<'READY' | 'UNTRUSTED' | 'RELOAD' | 'NOT_BOUND'>
  /**
   * K23: the Project this window's single open folder is connected to (from the hook Core wrote
   * there), or `null`. The panel opens it before the last Project seen in any window. Never rejects.
   */
  windowProject?(): Promise<string | null>
  dispose(): Promise<void>
}
export function createFrontendHost(context: {
  extensionPath: string
  globalStorageUri: { fsPath: string }
}): Promise<FrontendHost>
