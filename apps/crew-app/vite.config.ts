import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve:
    mode === 'test'
      ? { alias: { '@kirocrew/app-sdk': resolve(import.meta.dirname, 'dev/app-sdk.ts') } }
      : undefined,
  server: {
    proxy: {
      '/apps/vibe-helper/api': {
        target: 'http://127.0.0.1:4174',
        rewrite: (path) => path.replace(/^\/apps\/vibe-helper\/api/, '/api'),
      },
    },
  },
  build: {
    sourcemap: false,
    lib: {
      entry: 'src/App.tsx',
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', /^@kirocrew\/app-sdk/],
    },
  },
}))
