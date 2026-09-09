import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// root is web/, so web/public/data/dashboard.json ends up at dist/data/dashboard.json.
// base './' keeps asset paths relative, which is what GitHub Pages needs when the
// site is served from https://<user>.github.io/<repo>/ instead of a domain root.
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
