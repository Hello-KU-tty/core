declare module '@kirocrew/app-sdk' {
  import type { ComponentType, ReactNode } from 'react'

  export interface AppApiClient {
    get<T = unknown>(path: string): Promise<T>
    post<T = unknown>(path: string, body?: unknown): Promise<T>
    put<T = unknown>(path: string, body?: unknown): Promise<T>
    patch<T = unknown>(path: string, body?: unknown): Promise<T>
    del<T = unknown>(path: string): Promise<T>
  }

  export interface CrewEvent {
    type?: string
    slot?: string
    slot_id?: string
    task_id?: string
    [key: string]: unknown
  }

  export interface SlotSummary {
    key: string
    title?: string
    agent?: string
    running?: boolean
    messages?: unknown[] | number
  }

  export interface ChatEmbedProps {
    slotKey: string
    agent?: string
    placeholder?: string
    frameless?: boolean
    startAtBottom?: boolean
    onSend?: (message: string) => void | Promise<void>
  }

  export function useAppApi(): AppApiClient
  export function useAppEvents(
    event: string,
    callback: (event: CrewEvent) => void,
  ): void
  export function useAppInfo(): {
    name: string
    version: string
    permissions: { api: string[]; events: string[] }
  }
  export function useChatLauncher(): {
    openChat(options?: { agent?: string; message?: string }): void
  }
  export const ChatEmbed: ComponentType<ChatEmbedProps>
  export const ChatPanel: ComponentType<{ slotKey: string }>
  export const AppApiProvider: ComponentType<{
    appName: string
    appVersion?: string
    allowedApiPaths: string[]
    allowedEvents: string[]
    subscribeFn: (event: string, callback: (payload: CrewEvent) => void) => () => void
    navigateFn: (path: string) => void
    notifyFn: (message: string, options?: unknown) => void
    children: ReactNode
  }>
}
