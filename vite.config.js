import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: false, // আপাতত মিনিফাই বন্ধ রাখলাম যাতে কোনো ReferenceError লুকিয়ে না থাকে
  },
})