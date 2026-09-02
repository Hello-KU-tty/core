declare module '@kirocrew/app-sdk' {
  export interface AppApi {
    get(path: string): Promise<unknown>
    post(path: string, body: Readonly<Record<string, unknown>>): Promise<unknown>
  }

  export function useAppApi(): AppApi
}
