import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/my-react-app/',
  plugins: [react()],
  server: {
    host: true // This forces Vite to always expose the network IP
  }
})
