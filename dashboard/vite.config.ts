import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages base: '/tinda-owner-dashboard/' or configurable via env
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || './',
  server: {
    port: 5174,
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
