import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/my-react-app/',
  server: {
    host: true // This forces Vite to always expose the network IP
  }
})
