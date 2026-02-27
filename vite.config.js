import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      base: '/hachiware-task-manager/',
      scope: '/hachiware-task-manager/',
      manifest: {
        name: 'Koto Note',
        short_name: 'Koto Note',
        description: 'タスク・業務管理アプリ',
        start_url: '/hachiware-task-manager/',
        scope: '/hachiware-task-manager/',
        display: 'standalone',
        background_color: '#FAF7F2',
        theme_color: '#A0C8DC',
        lang: 'ja',
        icons: [
          {
            src: '/hachiware-task-manager/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/hachiware-task-manager/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        navigateFallback: '/hachiware-task-manager/index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  base: '/hachiware-task-manager/',
})
