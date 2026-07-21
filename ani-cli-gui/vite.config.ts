import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['hls.js', 'discord-rpc', 'cheerio', 'electron-updater', 'ws']
            }
          }
        }
      },
      preload: {
        input: 'electron/preload.ts',
      },
    }),
  ],
})
