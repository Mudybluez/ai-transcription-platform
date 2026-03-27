import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',      // Слушать все внешние подключения
    port: 5173,           // Жестко зафиксировать порт
    strictPort: true,     // Не пытаться искать другой порт, если этот занят
    watch: {
      usePolling: true    // Критически важно для Windows + Docker
    }
  }
})