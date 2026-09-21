import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `vite` alone doesn't run the /api/* serverless handlers (it would serve
  // their source as a static file). Set VITE_API_PROXY_TARGET to a deployed
  // CMS origin to forward /api there while developing locally, or use
  // `vercel dev`, which runs them for real.
  const target = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_PROXY_TARGET

  return {
    plugins: [react()],
    server: target
      ? { proxy: { '/api': { target, changeOrigin: true, secure: true } } }
      : undefined,
  }
})
