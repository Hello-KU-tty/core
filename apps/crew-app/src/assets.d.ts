declare module '*.css'

declare module '*.css?inline' {
  const contents: string
  export default contents
}
