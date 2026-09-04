declare module '@kirocrew/app-sdk' {
  import type { ComponentType } from 'react'

  export interface AppApi {
    get(path: string): Promise<unknown>
    post(path: string, body: Readonly<Record<string, unknown>>): Promise<unknown>
  }

  export function useAppApi(): AppApi

  export interface ChatEmbedProps {
    readonly slotKey: string
    readonly agent?: string
    readonly placeholder?: string
    readonly frameless?: boolean
    readonly startAtBottom?: boolean
    readonly onSend?: (message: string) => void | Promise<void>
  }

  export const ChatEmbed: ComponentType<ChatEmbedProps>

  export interface ChatMessageListProps {
    readonly messages: readonly unknown[]
    readonly running?: boolean
  }

  export const ChatMessageList: ComponentType<ChatMessageListProps>
}
