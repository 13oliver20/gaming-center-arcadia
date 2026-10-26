import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  esbuild: {
    target: 'chrome79',
  },
  build: {
    target: 'chrome79',
    cssTarget: 'chrome79',
  },
})
