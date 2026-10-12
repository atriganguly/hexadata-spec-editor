import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base path ensures asset resolution works seamlessly across local dev,
  // GitHub Pages subpaths (/hexadata-spec-editor/), and custom production domains.
  base: process.env.VITE_BASE_PATH || './',
})